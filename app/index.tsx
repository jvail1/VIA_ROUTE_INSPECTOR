import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

import { inspectRoute } from '../logic/inspectRoute';
import { parseGpx } from '../logic/gpx';
import RouteMap from '../components/RouteMap';
import { parseCuratedPoiGpx, type Poi } from '../logic/curatedPois';
import { minDistanceToRouteMeters } from '../logic/routeDistance';
import { decimatePolyline } from '../logic/decimate';
import { fetchLivePois } from '../logic/livePois';
import { mergePois } from '../logic/mergePois';
import {
  clearAllCache,
  loadLivePois as loadCachedLivePois,
  loadRouteState,
  loadUiState,
  saveLivePois as saveCachedLivePois,
  saveRouteState,
  saveUiState,
} from '../logic/cache';
import { parseKmlOverlay, type KmlOverlay } from '../logic/parseKmlOverlay';
import GateWeatherCard from '../components/GateWeatherCard';
import GateDetailModal from '../components/GateDetailModal';
import { haversine } from '../logic/distance';
import gatesData from '../data/gates.json';

function buildGatesGpx(): string {
  const wpts = gatesData
    .map(
      (g) =>
        `  <wpt lat="${g.lat}" lon="${g.lng}">\n    <name>${g.name}</name>\n    <ele>${g.elevationM}</ele>\n  </wpt>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="VIA Route Inspector" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}\n</gpx>`;
}

async function exportGatesGpx() {
  try {
    const gpx = buildGatesGpx();
    const path = FileSystem.cacheDirectory + 'VIA_Ch3_gates.gpx';
    await FileSystem.writeAsStringAsync(path, gpx, { encoding: FileSystem.EncodingType.UTF8 });
    await Share.share({ url: path, title: 'VIA Ch3 Gate Waypoints' });
  } catch (e: any) {
    Alert.alert('Export failed', e?.message || 'Unknown error');
  }
}

type RoutePoint = {
  lat: number;
  lng: number;
};

type InspectionResult = {
  violations: any[];
  gateHits: any[];
  gatesMissed: any[];
};

const RADII = [
  { label: '1 km', value: 1000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];
const MAX_MAP_POIS = 100;

// Decimate route for caching — converts lat/lng ↔ latitude/longitude for RDP.
// Reduces 40k points to ~500–2000, safe to store and restore without memory pressure.
function decimateRoute(points: RoutePoint[]): RoutePoint[] {
  const converted = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const reduced = decimatePolyline(converted);
  return reduced.map((p) => ({ lat: p.latitude, lng: p.longitude }));
}

function routeBounds(points: RoutePoint[]) {
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return {
    minLat: minLat - 0.02,
    minLng: minLng - 0.02,
    maxLat: maxLat + 0.02,
    maxLng: maxLng + 0.02,
  };
}

export default function HomeScreen() {
  const [fileName, setFileName] = useState<string>('No file selected');
  const [pointCount, setPointCount] = useState<number>(0);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [selectedMapTarget, setSelectedMapTarget] = useState<{ lat: number; lng: number; label?: string; ts?: number } | null>(null);

  const [selectedGateDetail, setSelectedGateDetail] = useState<typeof gatesData[0] | null>(null);

  const [isLoadingImport, setIsLoadingImport] = useState(false);
  const [isLoadingLivePois, setIsLoadingLivePois] = useState(false);
  const [livePoiStatus, setLivePoiStatus] = useState<string | null>(null);

  const [showWater, setShowWater] = useState(true);
  const [showCamp, setShowCamp] = useState(true);
  const [showToilets, setShowToilets] = useState(true);
  const [showShowers, setShowShowers] = useState(true);
  const [poiRadiusMeters, setPoiRadiusMeters] = useState(5000);

  const [curatedPois, setCuratedPois] = useState<Poi[]>([]);
  const [livePois, setLivePois] = useState<Poi[]>([]);
  const [useLivePois, setUseLivePois] = useState(false);
  const [kmlOverlay, setKmlOverlay] = useState<KmlOverlay | null>(null);
  const [showKmlOverlay, setShowKmlOverlay] = useState(false);
  const [showKmlPoints, setShowKmlPoints] = useState(false);

  useEffect(() => {
    async function loadCuratedPoisAndOverlay() {
      try {
        const asset = Asset.fromModule(require('../data/VIA_Ch3_POI_Offline.gpx'));
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        const xml = await FileSystem.readAsStringAsync(uri);
        const parsed = parseCuratedPoiGpx(xml);
        setCuratedPois(parsed);
      } catch (e: any) {
        console.log('Failed to load curated POIs', e?.message || e);
      }

      try {
        const kmlAsset = Asset.fromModule(require('../data/VIA Chapter III - RACE Route & Locations.kml'));
        await kmlAsset.downloadAsync();
        const kmlUri = kmlAsset.localUri || kmlAsset.uri;
        const kmlXml = await FileSystem.readAsStringAsync(kmlUri);
        const parsedOverlay = parseKmlOverlay(kmlXml);
        console.log('KML overlay loaded', parsedOverlay.lines.length, 'lines', parsedOverlay.points.length, 'points');
        setKmlOverlay(parsedOverlay);
      } catch (e: any) {
        console.log('Failed to load KML overlay', e?.message || e);
      }
    }

    loadCuratedPoisAndOverlay();
  }, []);

  useEffect(() => {
    async function restoreCachedState() {
      try {
        const [cachedRoute, cachedLivePois, cachedUi] = await Promise.all([
          loadRouteState(),
          loadCachedLivePois(),
          loadUiState(),
        ]);

        if (cachedRoute) {
          setFileName(cachedRoute.fileName || 'Cached route');
          setPointCount(cachedRoute.pointCount || 0);
          const cachedPoints = cachedRoute.points || [];
          // Decimate on restore in case cache holds a pre-decimation full-res route
          setPoints(cachedPoints.length > 3000 ? decimateRoute(cachedPoints) : cachedPoints);
          setResult(cachedRoute.result || null);
        }

        if (cachedLivePois) {
          setLivePois(cachedLivePois);
        }

        if (cachedUi) {
          setShowWater(cachedUi.showWater);
          setShowCamp(cachedUi.showCamp);
          setShowToilets(cachedUi.showToilets);
          setShowShowers(cachedUi.showShowers);
          setPoiRadiusMeters(cachedUi.poiRadiusMeters);
          setUseLivePois(cachedUi.useLivePois);
          setShowKmlOverlay(cachedUi.showKmlOverlay);
          setShowKmlPoints(cachedUi.showKmlPoints);
        }
      } catch (e: any) {
        console.log('Failed to restore cache', e?.message || e);
      }
    }

    restoreCachedState();
  }, []);

  useEffect(() => {
    saveUiState({
      showWater,
      showCamp,
      showToilets,
      showShowers,
      poiRadiusMeters,
      useLivePois,
      showKmlOverlay,
      showKmlPoints,
    }).catch((e: any) => {
      console.log('Failed to save UI state', e?.message || e);
    });
  }, [
    showWater,
    showCamp,
    showToilets,
    showShowers,
    poiRadiusMeters,
    useLivePois,
    showKmlOverlay,
    showKmlPoints,
  ]);

  async function importGpx() {
    setIsLoadingImport(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Import failed', 'No file was selected.');
        return;
      }

      const xml = await FileSystem.readAsStringAsync(asset.uri);
      console.log('GPX read, size:', xml.length);

      // Yield so previous render completes and GC can run before heavy sync work
      await new Promise<void>((r) => setTimeout(r, 50));

      const parsedPoints = parseGpx(xml);
      console.log('GPX parsed, points:', parsedPoints.length);

      if (parsedPoints.length === 0) {
        Alert.alert('No route points found', 'This GPX file does not contain track or route points.');
        return;
      }

      // Yield between each heavy step to avoid blocking the JS thread long enough for iOS watchdog
      await new Promise<void>((r) => setTimeout(r, 50));
      const inspection = inspectRoute(parsedPoints);
      console.log('Inspection done, violations:', inspection.violations.length);

      await new Promise<void>((r) => setTimeout(r, 50));
      const displayPoints = decimateRoute(parsedPoints);
      console.log('Decimated to:', displayPoints.length);

      // Yield again before state update so large intermediate arrays can be GC'd
      await new Promise<void>((r) => setTimeout(r, 100));

      setFileName(asset.name || 'Imported GPX');
      setPointCount(parsedPoints.length);
      setPoints(displayPoints);
      setResult(inspection);
      setLivePois([]);

      await saveRouteState({
        fileName: asset.name || 'Imported GPX',
        pointCount: parsedPoints.length,
        points: displayPoints,
        result: inspection,
      });

      await saveCachedLivePois([]);
    } catch (error: any) {
      Alert.alert('Import failed', error?.message || 'Unknown error');
    } finally {
      setIsLoadingImport(false);
    }
  }

  async function refreshLivePois() {
    if (!points.length) {
      Alert.alert('No route loaded', 'Import a GPX first.');
      return;
    }

    setIsLoadingLivePois(true);
    setLivePoiStatus('Starting…');

    try {
      const bounds = routeBounds(points);
      const fetched = await fetchLivePois(bounds, (pois, done, total) => {
        setLivePoiStatus(`Tile ${done}/${total} — ${pois.length} POIs found`);
      });
      setLivePois(fetched);
      setUseLivePois(true);
      setLivePoiStatus(null);
      Alert.alert('Live POIs updated', `${fetched.length} live POIs loaded.`);
    } catch (error: any) {
      setLivePoiStatus(null);
      Alert.alert('Live update failed', error?.message || 'Unknown error');
    } finally {
      setIsLoadingLivePois(false);
    }
  }

  const gateDistancesKm = useMemo(() => {
    if (!points.length) return new Map<string, number>();
    const last = points[points.length - 1];
    return new Map(
      gatesData.map((g) => [
        g.id,
        Math.round(haversine(last.lat, last.lng, g.lat, g.lng) / 100) / 10,
      ])
    );
  }, [points]);

  const gateMissedById = useMemo(
    () => new Map(result?.gatesMissed.map((g: any) => [g.id, g.closest]) || []),
    [result]
  );

  const mergedPois = useMemo(
    () => mergePois(curatedPois, useLivePois ? livePois : []),
    [curatedPois, livePois, useLivePois]
  );

  const visiblePoiCount = useMemo(() => {
    if (!points.length) return 0;
    return mergedPois.filter((p) => {
      if (p.type === 'water' && !showWater) return false;
      if (p.type === 'camp' && !showCamp) return false;
      if (p.type === 'toilet' && !showToilets) return false;
      if (p.type === 'shower' && !showShowers) return false;
      return minDistanceToRouteMeters(points, p) <= poiRadiusMeters;
    }).length;
  }, [points, mergedPois, showWater, showCamp, showToilets, showShowers, poiRadiusMeters]);

  const mapPois = useMemo(() => {
    if (!points.length) return [];

    return mergedPois
      .map((p) => ({
        poi: p,
        routeDistanceM: minDistanceToRouteMeters(points, p),
      }))
      .filter(({ poi, routeDistanceM }) => {
        if (poi.type === 'water' && !showWater) return false;
        if (poi.type === 'camp' && !showCamp) return false;
        if (poi.type === 'toilet' && !showToilets) return false;
        if (poi.type === 'shower' && !showShowers) return false;
        return routeDistanceM <= poiRadiusMeters;
      })
      .sort((a, b) => a.routeDistanceM - b.routeDistanceM)
      .slice(0, MAX_MAP_POIS)
      .map(({ poi }) => poi);
  }, [points, mergedPois, showWater, showCamp, showToilets, showShowers, poiRadiusMeters]);

  const routeMapKey = useMemo(
    () =>
      [
        points.length,
        useLivePois ? 1 : 0,
        showWater ? 1 : 0,
        showCamp ? 1 : 0,
        showToilets ? 1 : 0,
        showShowers ? 1 : 0,
        poiRadiusMeters,
        showKmlOverlay ? 1 : 0,
        showKmlPoints ? 1 : 0,
        mapPois.length,
      ].join(':'),
    [
      points.length,
      useLivePois,
      showWater,
      showCamp,
      showToilets,
      showShowers,
      poiRadiusMeters,
      showKmlOverlay,
      showKmlPoints,
      mapPois.length,
    ]
  );

  async function shareResults() {
    if (!result) return;
    const hitNames = result.gateHits.map((g: any) => `  ✓ ${g.name}`).join('\n');
    const missedNames = result.gatesMissed.map((g: any) => `  ✗ ${g.name}`).join('\n');
    const violationLines = result.violations.length
      ? result.violations.map((v: any) => `  • ${v.name} (${v.type})`).join('\n')
      : '  None';

    const lines = [
      `VIA Chapter III — Route Inspection`,
      `File: ${fileName}`,
      ``,
      `Gates: ${result.gateHits.length} / ${gatesData.length} hit`,
      hitNames || '  (none hit)',
      missedNames ? `\nMissed:\n${missedNames}` : '',
      ``,
      `Violations:`,
      violationLines,
      ``,
      `⛴ Ferry pre-booking required:`,
      `  • Gate IV (Lysebotn) — ferry from Lauvvik or Forsand`,
      `  • Gate X (Urnes) — Solvorn–Ornes ferry`,
    ].join('\n');

    try {
      await Share.share({ message: lines, title: 'VIA Route Inspection' });
    } catch (e: any) {
      Alert.alert('Share failed', e?.message || 'Unknown error');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>VIA Route Inspector</Text>
          <Text style={styles.subtitle}>Offline GPX route check</Text>

          <View style={styles.buttonWrap}>
            <Button title="Import GPX" onPress={importGpx} disabled={isLoadingImport} />
            {isLoadingImport && (
              <View style={styles.importingRow}>
                <ActivityIndicator size="small" color="#1f6feb" />
                <Text style={styles.importingText}>Parsing route…</Text>
              </View>
            )}
          </View>

          <View style={styles.buttonWrap}>
            <Button title="Load Live POIs Near Route" onPress={refreshLivePois} disabled={isLoadingLivePois} />
            {isLoadingLivePois && (
              <View style={styles.importingRow}>
                <ActivityIndicator size="small" color="#1f6feb" />
                <Text style={styles.importingText}>{livePoiStatus}</Text>
              </View>
            )}
          </View>

          <View style={styles.buttonWrap}>
            <Button
              title="Clear Saved Cache"
              onPress={async () => {
                await clearAllCache();
                setLivePois([]);
                setUseLivePois(false);
                Alert.alert('Cache cleared', 'Saved route, live POIs, and UI state were removed.');
              }}
            />
          </View>

          <View style={styles.filterRow}>
            <FilterChip
              label={useLivePois ? 'Curated + Live' : 'Curated Only'}
              active={useLivePois}
              onPress={() => setUseLivePois(!useLivePois)}
            />
            <FilterChip
              label={showKmlOverlay ? 'Hazards On' : 'Hazards Off'}
              active={showKmlOverlay}
              onPress={() => setShowKmlOverlay(!showKmlOverlay)}
            />
            <FilterChip
              label={showKmlPoints ? 'Hazard Points On' : 'Hazard Points Off'}
              active={showKmlPoints}
              onPress={() => setShowKmlPoints(!showKmlPoints)}
            />
          </View>

          {points.length > 0 && (
            <>
              <Text style={styles.section}>POI Filters</Text>
              <View style={styles.filterRow}>
                <FilterChip label="Water" active={showWater} onPress={() => setShowWater(!showWater)} />
                <FilterChip label="Camp" active={showCamp} onPress={() => setShowCamp(!showCamp)} />
                <FilterChip label="Toilet" active={showToilets} onPress={() => setShowToilets(!showToilets)} />
                <FilterChip label="Shower" active={showShowers} onPress={() => setShowShowers(!showShowers)} />
              </View>

              <Text style={styles.label}>POI Radius</Text>
              <View style={styles.filterRow}>
                {RADII.map((r) => (
                  <FilterChip
                    key={r.value}
                    label={r.label}
                    active={poiRadiusMeters === r.value}
                    onPress={() => setPoiRadiusMeters(r.value)}
                  />
                ))}
              </View>

              <Text style={styles.value}>Curated POIs: {curatedPois.length}</Text>
              <Text style={styles.value}>Live POIs: {livePois.length}</Text>
              <Text style={styles.value}>Visible POIs: {visiblePoiCount}</Text>
              <Text style={styles.value}>Map markers shown: {mapPois.length}</Text>
              <Text style={styles.value}>Hazard lines: {kmlOverlay?.lines?.length || 0}</Text>
              <Text style={styles.value}>Hazard points: {kmlOverlay?.points?.length || 0}</Text>

              <View style={styles.mapWrap}>
                <RouteMap
                  key={routeMapKey}
                  points={points}
                  violations={result?.violations || []}
                  gateHits={result?.gateHits || []}
                  pois={mapPois}
                  kmlOverlay={showKmlOverlay || showKmlPoints ? kmlOverlay : null}
                  showKmlPoints={showKmlPoints}
                  focusTarget={selectedMapTarget}
                />
              </View>
            </>
          )}

          <Text style={styles.label}>File</Text>
          <Text style={styles.value}>{fileName}</Text>

          <Text style={styles.label}>Points parsed</Text>
          <Text style={styles.value}>{pointCount}</Text>

          {points.length > 0 && (
            <View style={styles.buttonWrap}>
              <Button title="Export Gate Waypoints (.gpx)" onPress={exportGatesGpx} />
            </View>
          )}

          {result && (
            <>
              <Text style={styles.section}>Inspection Summary</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Gates</Text>
                  <Text style={styles.summaryValue}>
                    {result.gateHits.length} / {gatesData.length}
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Violations</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      result.violations.length > 0 ? styles.summaryValueBad : styles.summaryValueGood,
                    ]}
                  >
                    {result.violations.length}
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Live POIs</Text>
                  <Text style={styles.summaryValue}>
                    {useLivePois ? livePois.length : 0}
                  </Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Visible POIs</Text>
                  <Text style={styles.summaryValue}>{visiblePoiCount}</Text>
                </View>
              </View>

              <View style={styles.summaryNoteBox}>
                <Text style={styles.summaryNoteText}>
                  Ferry planning: Gate IV Lysebotn and Gate X Urnes may require advance ferry planning.
                </Text>
              </View>

              {/* Gate progress tracker */}
              <Text style={styles.section}>Gates</Text>
              <Text style={styles.gateProgressSummary}>
                {result.gateHits.length} / {gatesData.length} gates hit
              </Text>
              <View style={styles.gateProgressList}>
                {(() => {
                  const hitIds = new Set(result.gateHits.map((g: any) => g.id));
                  return gatesData.map((g, i) => {
                    const hit = hitIds.has(g.id);
                    const distKm = gateDistancesKm.get(g.id);
                    const closestM = gateMissedById.get(g.id);

                    return (
                      <Pressable
                        key={g.id}
                        style={styles.row}
                        onPress={() => setSelectedGateDetail(g)}
                      >
                        <View style={styles.gateProgressRow}>
                          <Text style={hit ? styles.gateProgressHit : styles.gateProgressMiss}>
                            {hit ? '✓' : '✗'}
                          </Text>
                          <Text style={styles.gateProgressName}>
                            {g.name}
                          </Text>
                          {distKm != null && (
                            <Text style={styles.gateProgressDist}>{distKm} km</Text>
                          )}
                        </View>
                        <Text style={styles.rowMeta}>
                          {hit
                            ? 'Hit'
                            : closestM != null
                              ? `${closestM} m from route`
                              : 'Missed'}{' '}
                          · Tap for details
                        </Text>
                        <GateWeatherCard
                          lat={g.lat}
                          lng={g.lng}
                          elevationM={g.elevationM}
                          photoUrl={g.photoUrl}
                          fetchDelay={i * 300}
                        />
                      </Pressable>
                    );
                  });
                })()}
              </View>

              {result.violations.length > 0 && (
                <>
                  <Text style={styles.section}>Violations</Text>
                  {result.violations.map((v, i) => (
                    <View key={`${v.name}-${i}`} style={styles.row}>
                      <Text style={styles.rowTitle}>{v.name}</Text>
                      <Text style={styles.rowMeta}>
                        {v.type} · {v.dist}m
                      </Text>
                    </View>
                  ))}
                </>
              )}

            </>
          )}
        </View>
      </ScrollView>

      {selectedGateDetail && result && (
        <GateDetailModal
          gate={selectedGateDetail}
          hit={result.gateHits.some((g: any) => g.id === selectedGateDetail.id)}
          closestM={result.gatesMissed.find((g: any) => g.id === selectedGateDetail.id)?.closest}
          distFromRouteEndKm={gateDistancesKm.get(selectedGateDetail.id)}
          onClose={() => setSelectedGateDetail(null)}
        />
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipOn : styles.chipOff]}>
      <Text style={[styles.chipText, active ? styles.chipTextOn : styles.chipTextOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  buttonWrap: {
    marginBottom: 12,
  },
  mapWrap: {
    height: 420,
    marginBottom: 20,
    overflow: 'hidden',
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  chipOn: {
    backgroundColor: '#1a5c8a',
    borderColor: '#1a5c8a',
  },
  chipOff: {
    backgroundColor: 'white',
    borderColor: '#ccc',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextOn: {
    color: 'white',
  },
  chipTextOff: {
    color: '#333',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginTop: 12,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 18,
    marginTop: 4,
  },
  section: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e0d8',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  importingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  importingText: {
    fontSize: 13,
    color: '#666',
  },
  gateProgressSummary: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a5c8a',
    marginBottom: 10,
  },
  gateProgressList: {
    marginBottom: 8,
  },
  gateProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  gateProgressHit: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2f7d32',
    width: 20,
    textAlign: 'center',
  },
  gateProgressMiss: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c62828',
    width: 20,
    textAlign: 'center',
  },
  gateProgressName: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  gateProgressDist: {
    fontSize: 13,
    color: '#888',
    marginLeft: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flexBasis: '48%',
    backgroundColor: '#f7f3ec',
    borderRadius: 10,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  summaryValueGood: {
    color: '#2f7d32',
  },
  summaryValueBad: {
    color: '#c62828',
  },
  summaryNoteBox: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  summaryNoteText: {
    fontSize: 14,
    color: '#7a5300',
    lineHeight: 20,
  },
});
