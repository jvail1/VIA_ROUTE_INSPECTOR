export type DistanceUnit = 'km' | 'mi' | 'both';

export function formatDistance(meters: number, unit: DistanceUnit = 'both') {
  if (!Number.isFinite(meters)) return '';

  const km = meters / 1000;
  const mi = meters / 1609.344;

  if (unit === 'km') {
    return `${km.toFixed(1)} km`;
  }

  if (unit === 'mi') {
    return `${mi.toFixed(1)} mi`;
  }

  return `${km.toFixed(1)} km (${mi.toFixed(1)} mi)`;
}
