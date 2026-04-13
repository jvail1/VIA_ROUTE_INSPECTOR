export type PoiType = 'camp' | 'water' | 'toilet' | 'shower';

export type Poi = {
  id: string;
  type: PoiType;
  name: string;
  lat: number;
  lng: number;
  notes?: string;
  source: 'curated' | 'overpass';
};

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickTag(block: string, tag: string) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeXml(m[1].trim()) : '';
}

function normalizeType(raw: string): PoiType | null {
  const v = raw.trim().toLowerCase();
  if (v.includes('camp')) return 'camp';
  if (v.includes('water')) return 'water';
  if (v.includes('toilet')) return 'toilet';
  if (v.includes('shower')) return 'shower';
  return null;
}

export function parseCuratedPoiGpx(xml: string): Poi[] {
  const text = decodeXml(xml);
  const pois: Poi[] = [];
  const wptRegex = /<wpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;

  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = wptRegex.exec(text)) !== null) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    const body = match[3] || '';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const name = pickTag(body, 'name') || `POI ${i + 1}`;
    const typeTag = pickTag(body, 'type');
    const desc = pickTag(body, 'desc');
    const cmt = pickTag(body, 'cmt');

    const type = normalizeType(typeTag || desc || cmt || name);
    if (!type) continue;

    const notes = [typeTag, desc, cmt].filter(Boolean).join(' · ');

    pois.push({
      id: `curated-${i + 1}`,
      type,
      name,
      lat,
      lng,
      notes: notes || undefined,
      source: 'curated',
    });

    i += 1;
  }

  return pois;
}
