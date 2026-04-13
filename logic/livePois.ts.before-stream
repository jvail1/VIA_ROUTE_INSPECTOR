import type { Poi } from './curatedPois';

type Bounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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
    source: 'live',
  } as Poi;
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

async function fetchOverpass(query: string): Promise<any> {
  let lastError: any;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `data=${query}`,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      return await response.json();
    } catch (err) {
      console.log('Overpass endpoint failed:', url, String(err));
      lastError = err;
    }
  }

  throw lastError || new Error('All Overpass endpoints failed');
}

function buildQuery(south: number, west: number, north: number, east: number): string {
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

function buildTiles(bounds: Bounds): Bounds[] {
  const south = Math.min(bounds.minLat, bounds.maxLat);
  const north = Math.max(bounds.minLat, bounds.maxLat);
  const west = Math.min(bounds.minLng, bounds.maxLng);
  const east = Math.max(bounds.minLng, bounds.maxLng);

  const latSpan = north - south;
  const lngSpan = east - west;

  if (latSpan <= 0 || lngSpan <= 0) return [];

  if (latSpan <= 0.8 && lngSpan <= 0.8) {
    return [{ minLat: south, minLng: west, maxLat: north, maxLng: east }];
  }

  if (latSpan <= 1.6 && lngSpan <= 1.6) {
    if (latSpan >= lngSpan) {
      const mid = south + latSpan / 2;
      return [
        { minLat: south, minLng: west, maxLat: mid, maxLng: east },
        { minLat: mid, minLng: west, maxLat: north, maxLng: east },
      ];
    }

    const mid = west + lngSpan / 2;
    return [
      { minLat: south, minLng: west, maxLat: north, maxLng: mid },
      { minLat: south, minLng: mid, maxLat: north, maxLng: east },
    ];
  }

  const midLat = south + latSpan / 2;
  const midLng = west + lngSpan / 2;

  return [
    { minLat: south, minLng: west, maxLat: midLat, maxLng: midLng },
    { minLat: south, minLng: midLng, maxLat: midLat, maxLng: east },
    { minLat: midLat, minLng: west, maxLat: north, maxLng: midLng },
    { minLat: midLat, minLng: midLng, maxLat: north, maxLng: east },
  ];
}

type FetchLivePoisOptions = {
  onProgress?: (done: number, total: number) => void;
  onTilePois?: (tilePois: Poi[], done: number, total: number) => void;
};

export async function fetchLivePois(
  bounds: Bounds,
  options: FetchLivePoisOptions = {}
): Promise<Poi[]> {
  const south = Math.min(bounds.minLat, bounds.maxLat);
  const north = Math.max(bounds.minLat, bounds.maxLat);
  const west = Math.min(bounds.minLng, bounds.maxLng);
  const east = Math.max(bounds.minLng, bounds.maxLng);

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east)
  ) {
    console.log('Live POI bounds invalid', bounds);
    return [];
  }

  if (south === north || west === east) {
    console.log('Live POI bounds collapsed', bounds);
    return [];
  }

  const tiles = buildTiles({ minLat: south, minLng: west, maxLat: north, maxLng: east });
  const total = tiles.length;

  console.log('Fetching live POIs across tiles', total);

  let completed = 0;

  const promises = tiles.map(async (tile, idx) => {
    const tSouth = Math.min(tile.minLat, tile.maxLat);
    const tNorth = Math.max(tile.minLat, tile.maxLat);
    const tWest = Math.min(tile.minLng, tile.maxLng);
    const tEast = Math.max(tile.minLng, tile.maxLng);

    try {
      const query = buildQuery(tSouth, tWest, tNorth, tEast);
      const data = await fetchOverpass(query);

      const tilePois = dedupePois(
        ((data?.elements || []).map(normalizePoi).filter(Boolean) as Poi[])
      );

      completed++;
      options.onTilePois?.(tilePois, completed, total);
      options.onProgress?.(completed, total);

      return tilePois;
    } catch (err) {
      console.log('Live POI tile failed', idx, String(err));
      completed++;
      options.onTilePois?.([], completed, total);
      options.onProgress?.(completed, total);
      return [];
    }
  });

  const results = await Promise.all(promises);
  const merged = dedupePois(results.flat());

  console.log('Live POIs merged total', merged.length);

  return merged;
}
