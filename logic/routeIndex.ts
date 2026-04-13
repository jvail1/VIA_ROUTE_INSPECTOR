import { haversine } from './distance';

type RoutePoint = { lat: number; lng: number };

export type RouteIndex = {
  cells: Map<string, RoutePoint[]>;
  cellSize: number;
};

/**
 * Build a spatial grid index from route points.
 * cellSize 0.1° ≈ 11 km — large enough that a single neighbour-cell
 * search covers the max POI radius (10 km) with one pass of 9 cells.
 */
export function buildRouteIndex(
  points: RoutePoint[],
  cellSize = 0.1,
): RouteIndex {
  const cells = new Map<string, RoutePoint[]>();

  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)},${Math.floor(p.lng / cellSize)}`;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(p);
    } else {
      cells.set(key, [p]);
    }
  }

  return { cells, cellSize };
}

/**
 * Minimum distance in metres from (lat, lng) to the route.
 * Checks only the 9 grid cells that neighbour the query point —
 * typically 100–500× faster than a brute-force scan of all points.
 */
export function minDistanceIndexed(
  index: RouteIndex,
  lat: number,
  lng: number,
): number {
  const { cells, cellSize } = index;
  const cellLat = Math.floor(lat / cellSize);
  const cellLng = Math.floor(lng / cellSize);

  let min = Infinity;

  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      const pts = cells.get(`${cellLat + dLat},${cellLng + dLng}`);
      if (!pts) continue;
      for (const p of pts) {
        const d = haversine(p.lat, p.lng, lat, lng);
        if (d < min) min = d;
      }
    }
  }

  return min;
}
