type RoutePoint = {
  lat: number;
  lng: number;
};

type PoiPoint = {
  lat: number;
  lng: number;
};

type IndexedPoint = {
  lat: number;
  lng: number;
  x: number;
  y: number;
};

type RouteIndex = {
  route: RoutePoint[];
  cellSizeMeters: number;
  originLat: number;
  originLng: number;
  metersPerDegLat: number;
  metersPerDegLng: number;
  points: IndexedPoint[];
  buckets: Map<string, number[]>;
};

const DEFAULT_CELL_SIZE_METERS = 2000;

let cachedIndex: RouteIndex | null = null;

function buildRouteIndex(
  route: RoutePoint[],
  cellSizeMeters = DEFAULT_CELL_SIZE_METERS
): RouteIndex {
  const originLat = route[0]?.lat ?? 0;
  const originLng = route[0]?.lng ?? 0;

  const metersPerDegLat = 111320;
  const metersPerDegLng =
    111320 * Math.cos((originLat * Math.PI) / 180);

  const points: IndexedPoint[] = route.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    x: (p.lng - originLng) * metersPerDegLng,
    y: (p.lat - originLat) * metersPerDegLat,
  }));

  const buckets = new Map<string, number[]>();

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const gx = Math.floor(p.x / cellSizeMeters);
    const gy = Math.floor(p.y / cellSizeMeters);
    const key = `${gx},${gy}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(i);
    } else {
      buckets.set(key, [i]);
    }
  }

  return {
    route,
    cellSizeMeters,
    originLat,
    originLng,
    metersPerDegLat,
    metersPerDegLng,
    points,
    buckets,
  };
}

function getRouteIndex(route: RoutePoint[]): RouteIndex | null {
  if (!route.length) return null;

  if (
    cachedIndex &&
    cachedIndex.route === route &&
    cachedIndex.points.length === route.length
  ) {
    return cachedIndex;
  }

  cachedIndex = buildRouteIndex(route);
  return cachedIndex;
}

function keyForCell(gx: number, gy: number) {
  return `${gx},${gy}`;
}

function projectedDistanceMeters(
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function minDistanceToRouteMeters(route: RoutePoint[], poi: PoiPoint) {
  const index = getRouteIndex(route);
  if (!index) return Infinity;

  const px = (poi.lng - index.originLng) * index.metersPerDegLng;
  const py = (poi.lat - index.originLat) * index.metersPerDegLat;

  const baseGx = Math.floor(px / index.cellSizeMeters);
  const baseGy = Math.floor(py / index.cellSizeMeters);

  let best = Infinity;
  let foundAny = false;

  for (let ring = 0; ring <= 2; ring += 1) {
    for (let gx = baseGx - ring; gx <= baseGx + ring; gx += 1) {
      for (let gy = baseGy - ring; gy <= baseGy + ring; gy += 1) {
        const bucket = index.buckets.get(keyForCell(gx, gy));
        if (!bucket) continue;

        foundAny = true;

        for (const idx of bucket) {
          const rp = index.points[idx];
          const d = projectedDistanceMeters(px, py, rp.x, rp.y);
          if (d < best) best = d;
        }
      }
    }

    if (foundAny) {
      const searchRadius = (ring + 1) * index.cellSizeMeters;
      if (best <= searchRadius) {
        return best;
      }
    }
  }

  for (const rp of index.points) {
    const d = projectedDistanceMeters(px, py, rp.x, rp.y);
    if (d < best) best = d;
  }

  return best;
}
