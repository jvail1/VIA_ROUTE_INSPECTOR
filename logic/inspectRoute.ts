import { buildRouteIndex, minDistanceIndexed } from './routeIndex';
import gates from '../data/gates.json';
import banned from '../data/banned.json';

/**
 * Inspect a GPX route against banned locations and required gates.
 * Builds a spatial index once (O(n)), then each gate/banned check
 * is O(k) over nearby cells — ~100–500× faster than brute force.
 */
export function inspectRoute(points: { lat: number; lng: number }[]) {
  const violations: any[] = [];
  const gateHits:    any[] = [];
  const gatesMissed: any[] = [];

  if (!points.length) return { violations, gateHits, gatesMissed };

  const index = buildRouteIndex(points);

  for (const b of banned as any[]) {
    const d = minDistanceIndexed(index, b.lat, b.lng);
    if (d < b.r) {
      violations.push({ ...b, dist: Math.round(d) });
    }
  }

  for (const g of gates as any[]) {
    const d = minDistanceIndexed(index, g.lat, g.lng);
    if (d < g.r) {
      gateHits.push(g);
    } else {
      gatesMissed.push({ ...g, closest: Math.round(d) });
    }
  }

  return { violations, gateHits, gatesMissed };
}
