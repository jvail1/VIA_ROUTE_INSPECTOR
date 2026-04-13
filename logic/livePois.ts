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

export async function fetchLivePois(bounds: Bounds): Promise<Poi[]> {
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

  console.log('Fetching live POIs for bbox', { south, west, north, east });

  const query = `
    [out:json][timeout:25];
    (
      node["tourism"="camp_site"](${south},${west},${north},${east});
      node["amenity"="drinking_water"](${south},${west},${north},${east});
      node["amenity"="toilets"](${south},${west},${north},${east});
      node["amenity"="shower"](${south},${west},${north},${east});
    );
    out body;
  `.trim();

  const data = await fetchOverpass(query);
  const pois = (data?.elements || [])
    .map(normalizePoi)
    .filter(Boolean) as Poi[];

  console.log('Live POIs merged total', pois.length);

  return dedupePois(pois);
}
