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
    name: tags.name || type,
    source: 'live',
  } as Poi;
}

function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>();

  return pois.filter((p) => {
    const key = `${p.type}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchOverpass(query: string): Promise<any> {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `data=${query}`,
      });

      if (!response.ok) throw new Error();

      return await response.json();
    } catch {
      console.log('Overpass failed, trying next endpoint');
    }
  }

  throw new Error('All Overpass endpoints failed');
}

function buildQuery(s: number, w: number, n: number, e: number) {
  return `
    [out:json][timeout:25];
    (
      node["tourism"="camp_site"](${s},${w},${n},${e});
      node["amenity"="drinking_water"](${s},${w},${n},${e});
      node["amenity"="toilets"](${s},${w},${n},${e});
      node["amenity"="shower"](${s},${w},${n},${e});
    );
    out body;
  `.trim();
}

export async function fetchLivePois(
  bounds: Bounds,
  onTile?: (pois: Poi[]) => void
): Promise<Poi[]> {
  const s = Math.min(bounds.minLat, bounds.maxLat);
  const n = Math.max(bounds.minLat, bounds.maxLat);
  const w = Math.min(bounds.minLng, bounds.maxLng);
  const e = Math.max(bounds.minLng, bounds.maxLng);

  const query = buildQuery(s, w, n, e);

  const data = await fetchOverpass(query);

  const pois = (data?.elements || [])
    .map(normalizePoi)
    .filter(Boolean) as Poi[];

  const merged = dedupePois(pois);

  onTile?.(merged);

  return merged;
}
