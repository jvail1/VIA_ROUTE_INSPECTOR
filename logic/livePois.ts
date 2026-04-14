import type { Poi } from './curatedPois';
import { loadLivePoisTile, saveLivePoisTile } from './cache';

type RoutePoint = {
  lat: number;
  lng: number;
};

type TileBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type RouteTile = {
  id: string;
  bounds: TileBounds;
};

type FetchProgress = {
  done: number;
  total: number;
  poisFound: number;
  tileId: string;
  source: 'cache' | 'network' | 'failed';
};

type FetchLivePoisOptions = {
  onProgress?: (progress: FetchProgress) => void;
  retryTileIds?: string[];
};

export type FetchLivePoisResult = {
  pois: Poi[];
  failedTileIds: string[];
  totalTiles: number;
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const TILE_SIZE_DEGREES = 0.5;
const QUERY_MARGIN_DEGREES = 0.05;
const TILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ENDPOINT_COOLDOWN_MS = 10 * 60 * 1000;

const endpointCooldownUntil = new Map<string, number>();

function toPoiType(tags: Record<string, string>): Poi['type'] | null {
  if (tags.amenity === 'drinking_water') return 'water';
  if (tags.amenity === 'toilets') return 'toilet';
  if (tags.tourism === 'camp_site') return 'camp';
  if (tags.amenity === 'shower') return 'shower';
  return null;
}

function normalizePoi(el: any): Poi | null {
  const tags = el?.tags || {};
  const type = toPoiType(tags);
  if (!type) return null;

  const lat = Number(el.lat);
  const lng = Number(el.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: `overpass-${type}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    type,
    lat,
    lng,
    name:
      tags.name ||
      (type === 'water'
        ? 'Drinking water'
        : type === 'toilet'
          ? 'Toilets'
          : type === 'camp'
            ? 'Camp site'
            : 'Shower'),
    source: 'overpass',
  };
}

function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>();

  return pois.filter((p) => {
    const key = [
      p.type,
      p.lat.toFixed(4),
      p.lng.toFixed(4),
      (p.name || '').toLowerCase(),
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampLat(lat: number) {
  return Math.max(-90, Math.min(90, lat));
}

function clampLng(lng: number) {
  return Math.max(-180, Math.min(180, lng));
}

function tileBounds(latIdx: number, lngIdx: number): TileBounds {
  const south = latIdx * TILE_SIZE_DEGREES;
  const west = lngIdx * TILE_SIZE_DEGREES;

  return {
    south: clampLat(south - QUERY_MARGIN_DEGREES),
    west: clampLng(west - QUERY_MARGIN_DEGREES),
    north: clampLat(south + TILE_SIZE_DEGREES + QUERY_MARGIN_DEGREES),
    east: clampLng(west + TILE_SIZE_DEGREES + QUERY_MARGIN_DEGREES),
  };
}

function buildRouteTiles(points: RoutePoint[]): RouteTile[] {
  const seen = new Set<string>();
  const tiles: RouteTile[] = [];

  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;

    const latIdx = Math.floor(point.lat / TILE_SIZE_DEGREES);
    const lngIdx = Math.floor(point.lng / TILE_SIZE_DEGREES);
    const id = `${latIdx}:${lngIdx}`;

    if (seen.has(id)) continue;
    seen.add(id);

    tiles.push({
      id,
      bounds: tileBounds(latIdx, lngIdx),
    });
  }

  return tiles;
}

function buildQuery(bounds: TileBounds): string {
  const { south, west, north, east } = bounds;

  return `
    [out:json][timeout:25];
    (
      node["tourism"="camp_site"](${south},${west},${north},${east});
      node["amenity"="drinking_water"](${south},${west},${north},${east});
      node["amenity"="toilets"](${south},${west},${north},${east});
      node["amenity"="shower"](${south},${west},${north},${east});
    );
    out body;
  `.trim();
}

function endpointAvailable(url: string) {
  return (endpointCooldownUntil.get(url) || 0) <= Date.now();
}

function markEndpointCooldown(url: string) {
  endpointCooldownUntil.set(url, Date.now() + ENDPOINT_COOLDOWN_MS);
}

function isCooldownStatus(status: number) {
  return status === 429 || status === 504;
}

async function fetchOverpass(query: string): Promise<any> {
  let lastError: any;
  let attempted = false;

  for (const url of OVERPASS_ENDPOINTS) {
    if (!endpointAvailable(url)) continue;
    attempted = true;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `data=${query}`,
      });

      if (!response.ok) {
        if (isCooldownStatus(response.status)) {
          markEndpointCooldown(url);
        }
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      return await response.json();
    } catch (err) {
      console.log('Overpass endpoint failed:', url, String(err));
      lastError = err;
    }
  }

  if (!attempted) {
    throw new Error('All Overpass endpoints are cooling down');
  }

  throw lastError || new Error('All Overpass endpoints failed');
}

async function loadTilePois(tileId: string): Promise<Poi[] | null> {
  const cached = await loadLivePoisTile(tileId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > TILE_CACHE_TTL_MS) return null;

  const items = Array.isArray(cached.items) ? cached.items : [];
  return dedupePois(items as Poi[]);
}

async function fetchTilePois(tile: RouteTile): Promise<Poi[]> {
  const data = await fetchOverpass(buildQuery(tile.bounds));
  const tilePois = dedupePois(
    ((data?.elements || []).map(normalizePoi).filter(Boolean) as Poi[])
  );
  await saveLivePoisTile(tile.id, tilePois);
  return tilePois;
}

export async function fetchLivePois(
  points: RoutePoint[],
  options: FetchLivePoisOptions = {}
): Promise<FetchLivePoisResult> {
  const routeTiles = buildRouteTiles(points);
  const retryTileIds = options.retryTileIds ? new Set(options.retryTileIds) : null;
  const failedTileIds: string[] = [];

  if (!routeTiles.length) {
    return { pois: [], failedTileIds, totalTiles: 0 };
  }

  let done = 0;
  let consecutiveHardFailures = 0;
  let mergedPois: Poi[] = [];

  for (const tile of routeTiles) {
    const shouldForceNetwork = retryTileIds ? retryTileIds.has(tile.id) : false;

    try {
      const cached = shouldForceNetwork ? null : await loadTilePois(tile.id);
      const tilePois = cached ?? (await fetchTilePois(tile));

      mergedPois = dedupePois([...mergedPois, ...tilePois]);
      consecutiveHardFailures = 0;
      done += 1;

      options.onProgress?.({
        done,
        total: routeTiles.length,
        poisFound: mergedPois.length,
        tileId: tile.id,
        source: cached ? 'cache' : 'network',
      });
    } catch (err) {
      console.log('Live POI tile failed', tile.id, String(err));
      failedTileIds.push(tile.id);
      consecutiveHardFailures += 1;
      done += 1;

      options.onProgress?.({
        done,
        total: routeTiles.length,
        poisFound: mergedPois.length,
        tileId: tile.id,
        source: 'failed',
      });

      if (consecutiveHardFailures >= 2 && mergedPois.length > 0) {
        break;
      }
    }
  }

  return {
    pois: mergedPois,
    failedTileIds,
    totalTiles: routeTiles.length,
  };
}
