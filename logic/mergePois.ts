import { haversine } from './distance';
import type { Poi } from './curatedPois';

export function mergePois(curated: Poi[] = [], live: Poi[] = []): Poi[] {
  const curatedList = Array.isArray(curated) ? curated : [];
  const liveList = Array.isArray(live) ? live : [];

  const merged = [...curatedList];

  for (const lp of liveList) {
    const dup = curatedList.find(
      (cp) =>
        cp.type === lp.type &&
        haversine(cp.lat, cp.lng, lp.lat, lp.lng) <= 100
    );

    if (!dup) {
      merged.push(lp);
    }
  }

  return merged;
}
