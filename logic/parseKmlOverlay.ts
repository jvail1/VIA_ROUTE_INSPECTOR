import { XMLParser } from 'fast-xml-parser';

type KmlCoord = {
  latitude: number;
  longitude: number;
};

export type KmlOverlayLine = {
  id: string;
  name: string;
  folder: string;
  kind: 'banned' | 'tunnel' | 'ferry' | 'mandatory' | 'unknown';
  coordinates: KmlCoord[];
};

export type KmlOverlayPoint = {
  id: string;
  name: string;
  folder: string;
  kind: 'banned' | 'tunnel' | 'ferry' | 'mandatory' | 'unknown';
  latitude: number;
  longitude: number;
};

export type KmlOverlay = {
  lines: KmlOverlayLine[];
  points: KmlOverlayPoint[];
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value: any): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCoordinates(text: string): KmlCoord[] {
  return cleanText(text)
    .split(/\s+/)
    .map((chunk) => {
      const [lng, lat] = chunk.split(',').map(Number);
      return {
        latitude: lat,
        longitude: lng,
      };
    })
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

function classify(folder: string, name: string): KmlOverlayLine['kind'] {
  const text = `${folder} ${name}`.toLowerCase();

  if (text.includes('ferr')) return 'ferry';
  if (text.includes('tunnel')) return 'tunnel';
  if (text.includes('illegal') || text.includes('banned')) return 'banned';
  if (text.includes('mandatory')) return 'mandatory';
  return 'unknown';
}

export function parseKmlOverlay(xml: string): KmlOverlay {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
  });

  const parsed = parser.parse(xml);
  const doc = parsed?.kml?.Document;

  const folders = asArray(doc?.Folder);

  const lines: KmlOverlayLine[] = [];
  const points: KmlOverlayPoint[] = [];

  folders.forEach((folder: any, folderIndex: number) => {
    const folderName = cleanText(folder?.name || `Folder ${folderIndex + 1}`);
    const placemarks = asArray(folder?.Placemark);

    placemarks.forEach((pm: any, pmIndex: number) => {
      const name = cleanText(pm?.name || `Feature ${pmIndex + 1}`);
      const kind = classify(folderName, name);

      const lineCoords = pm?.LineString?.coordinates;
      if (lineCoords) {
        const coordinates = parseCoordinates(lineCoords);
        if (coordinates.length > 1) {
          lines.push({
            id: `line-${folderIndex}-${pmIndex}`,
            name,
            folder: folderName,
            kind,
            coordinates,
          });
        }
      }

      const pointCoords = pm?.Point?.coordinates;
      if (pointCoords) {
        const coords = parseCoordinates(pointCoords);
        if (coords.length > 0) {
          points.push({
            id: `point-${folderIndex}-${pmIndex}`,
            name,
            folder: folderName,
            kind,
            latitude: coords[0].latitude,
            longitude: coords[0].longitude,
          });
        }
      }
    });
  });

  return { lines, points };
}
