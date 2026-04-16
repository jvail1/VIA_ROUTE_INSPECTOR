import type { Poi } from './curatedPois';
import { loadLivePoisTile, saveLivePoisTile } from './cache';

type RoutePoint = { lat: number; lng: number };

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const TILE_SIZE = 0.5;             // degrees ~55km lat, ~30km lng at 60°N
const TILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function toPoiType(tags: Record<string, string>): Poi['type'] | null {
  if (tags.amenity === 'drinking_water') return 'water';
  if (tags.amenity === 'toilets') return 'toilet';
  if (tags.tourism === 'camp_site') return 'camp';
  if (tags.amenity === 'shower') return 'shower';
  return null;
}

function formatAddress(tags: Record<string, string>): string | null {
  const line1 = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ').trim();
  const line2 = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ').trim();
  const parts = [line1, line2].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function normalizePoi(el: any): Poi | null {
  const tags = el?.tags || {};
  const type = toPoiType(tags);
  if (!type) return null;

  const lat = Number(el.lat);
  const lng = Number(el.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = formatAddress(tags);
  const notes = [address, tags.description || tags.note].filter(Boolean).join(' · ');

  return {
    id: `live-${type}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    type,
    lat,
    lng,
    name:
      tags.name ||
      (type === 'water' ? 'Drinking water'
        : type === 'toilet' ? 'Toilets'
        : type === 'camp' ? 'Camp site'
        : 'Shower'),
    notes: notes || undefined,
    source: 'overpass',
  };
}

function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>();
  return pois.filter((p) => {
    const key = [p.type, p.lat.toFixed(4), p.lng.toFixed(4), (p.name || '').toLowerCase()].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchOverpass(query: string): Promise<any> {
  let lastError: any;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `data=${query}`,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      return await response.json();
    } catch (err) {
      console.log('Overpass endpoint failed:', url, String(err));
      lastError = err;
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

function buildQuery(south: number, west: number, north: number, east: number) {
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

// Build 0.5° grid cells that the route actually passes through —
// much smaller queries than a full bbox over Western Europe.
function buildCorridorTiles(points: RoutePoint[]) {
  const cells = new Map<string, { south: number; west: number; north: number; east: number }>();
  for (const p of points) {
    const cellLat = Math.floor(p.lat / TILE_SIZE) * TILE_SIZE;
    const cellLng = Math.floor(p.lng / TILE_SIZE) * TILE_SIZE;
    const id = `${cellLat.toFixed(1)}_${cellLng.toFixed(1)}`;
    if (!cells.has(id)) {
      cells.set(id, {
        south: cellLat,
        west:  cellLng,
        north: +(cellLat + TILE_SIZE).toFixed(1),
        east:  +(cellLng + TILE_SIZE).toFixed(1),
      });
    }
  }
  return Array.from(cells.entries()).map(([id, bounds]) => ({ id, ...bounds }));
}

export async function fetchLivePois(
  points: RoutePoint[],
  onTile?: (pois: Poi[], done: number, total: number) => void
): Promise<Poi[]> {
  if (points.length === 0) return [];

  const tiles = buildCorridorTiles(points);
  console.log(`Live POIs: ${tiles.length} corridor tiles`);

  let mergedSoFar: Poi[] = [];
  let doneCount = 0;

  const promises = tiles.map(async (tile) => {
    // Serve from cache if fresh
    try {
      const cached = await loadLivePoisTile(tile.id);
      if (cached && Date.now() - cached.fetchedAt < TILE_TTL_MS) {
        const tilePois = cached.items as Poi[];
        mergedSoFar = dedupePois([...mergedSoFar, ...tilePois]);
        doneCount++;
        onTile?.(mergedSoFar, doneCount, tiles.length);
        return tilePois;
      }
    } catch (e) {
      // Cache miss — fall through to network
    }

    try {
      const data = await fetchOverpass(buildQuery(tile.south, tile.west, tile.north, tile.east));
      const tilePois = dedupePois(
        (data?.elements || []).map(normalizePoi).filter(Boolean) as Poi[]
      );
      await saveLivePoisTile(tile.id, tilePois);
      mergedSoFar = dedupePois([...mergedSoFar, ...tilePois]);
      doneCount++;
      onTile?.(mergedSoFar, doneCount, tiles.length);
      return tilePois;
    } catch (err) {
      console.log('Live POI tile failed', tile.id, String(err));
      doneCount++;
      onTile?.(mergedSoFar, doneCount, tiles.length);
      return [];
    }
  });

  const results = await Promise.all(promises);
  return dedupePois(results.flat());
}
