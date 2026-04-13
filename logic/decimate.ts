type Pt = { latitude: number; longitude: number };

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude  - a.latitude;

  if (dx === 0 && dy === 0) {
    const dLat = p.latitude  - a.latitude;
    const dLng = p.longitude - a.longitude;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) /
        (dx * dx + dy * dy),
    ),
  );

  const dLat = p.latitude  - (a.latitude  + t * dy);
  const dLng = p.longitude - (a.longitude + t * dx);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function rdp(pts: Pt[], eps: number, lo: number, hi: number, keep: Uint8Array): void {
  if (hi <= lo + 1) return;

  let maxD = 0;
  let maxI = lo;

  for (let i = lo + 1; i < hi; i++) {
    const d = segDist(pts[i], pts[lo], pts[hi]);
    if (d > maxD) { maxD = d; maxI = i; }
  }

  if (maxD > eps) {
    keep[maxI] = 1;
    rdp(pts, eps, lo, maxI, keep);
    rdp(pts, eps, maxI, hi, keep);
  }
}

/**
 * Ramer–Douglas–Peucker polyline decimation.
 * epsilon in degrees — 0.001 ≈ 111 m, imperceptible at mobile zoom.
 * Reduces a 40k-point GPX to ~500–2000 points for rendering.
 * Keep the full-res array in state for inspection logic.
 */
export function decimatePolyline(pts: Pt[], epsilon = 0.001): Pt[] {
  if (pts.length <= 2) return pts;

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  rdp(pts, epsilon, 0, pts.length - 1, keep);

  return pts.filter((_, i) => keep[i] === 1);
}
