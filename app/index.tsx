import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Pressable,
  ScrollView,
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

  function focusItemOnMap(item: any, fallbackLabel?: string) {
    const lat = item?.lat ?? item?.point?.lat;
    const lng = item?.lng ?? item?.point?.lng;

    if (lat == null || lng == null) return;

    setSelectedMapTarget({
      lat,
      lng,
      label: item?.name || fallbackLabel || 'Selected',
      ts: Date.now(),
    });
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
              <Text style={styles.value}>Hazard lines: {kmlOverlay?.lines?.length || 0}</Text>
              <Text style={styles.value}>Hazard points: {kmlOverlay?.points?.length || 0}</Text>

              <View style={styles.mapWrap}>
                <RouteMap
                  points={points}
                  violations={result?.violations || []}
                  gateHits={result?.gateHits || []}
                  pois={mergedPois.slice(0, 300)}
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

          {result && (
            <>
              <Text style={styles.label}>Violations</Text>
              <Text style={styles.value}>{result.violations.length}</Text>

              <Text style={styles.label}>Gates hit</Text>
              <Text style={styles.value}>{result.gateHits.length}</Text>

              <Text style={styles.label}>Gates missed</Text>
              <Text style={styles.value}>{result.gatesMissed.length}</Text>
              {result.gateHits.length > 0 && (
                <>
                  <Text style={styles.section}>Gate Hits</Text>
                  {result.gateHits.map((g, i) => (
                    <View key={`${g.name || 'gate-hit'}-${i}`} style={styles.row}>
                      <Pressable onPress={() => focusItemOnMap(g, 'Gate hit')}>
                        <Text style={styles.rowTitle}>{g.name || `Gate hit ${i + 1}`}</Text>
                        <Text style={styles.rowMeta}>Tap to zoom</Text>
                      </Pressable>
                      <GateWeatherCard
                        lat={g.lat}
                        lng={g.lng}
                        elevationM={g.elevationM}
                        photoUrl={g.photoUrl}
                        fetchDelay={i * 300}
                      />
                    </View>
                  ))}
                </>
              )}

              {result.gatesMissed.length > 0 && (
                <>
                  <Text style={styles.section}>Gates Missed</Text>
                  {result.gatesMissed.map((g, i) => (
                    <View key={`${g.name || 'gate-missed'}-${i}`} style={styles.row}>
                      <Pressable onPress={() => focusItemOnMap(g, 'Gate missed')}>
                        <Text style={styles.rowTitle}>{g.name || `Gate missed ${i + 1}`}</Text>
                        <Text style={styles.rowMeta}>
                          {isFinite(g.closest) ? `closest: ${g.closest}m` : 'not near route'} · Tap to zoom
                        </Text>
                      </Pressable>
                      <GateWeatherCard
                        lat={g.lat}
                        lng={g.lng}
                        elevationM={g.elevationM}
                        fetchDelay={i * 300}
                      />
                    </View>
                  ))}
                </>
              )}

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
});
