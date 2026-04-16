import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { Marker, Polyline } from 'react-native-maps';

import type { Poi } from '../logic/curatedPois';
import type { KmlOverlay } from '../logic/parseKmlOverlay';

type RoutePoint = { lat: number; lng: number };

type Props = {
  points: RoutePoint[];
  pois: Poi[];
  violations: any[];
  gateHits?: any[];
  kmlOverlay?: KmlOverlay | null;
  showKmlPoints?: boolean;
  focusTarget?: { lat: number; lng: number; label?: string; ts?: number } | null;
};

function kmlLineColor(kind: string): string {
  if (kind === 'banned' || kind === 'tunnel') return '#e53935';
  if (kind === 'ferry') return '#43a047';
  if (kind === 'mandatory') return '#f9a825';
  return '#757575';
}

function routeRegion(points: RoutePoint[]) {
  if (!points.length) {
    return { latitude: 56, longitude: 10, latitudeDelta: 4, longitudeDelta: 4 };
  }

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
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.25, 0.15),
    longitudeDelta: Math.max((maxLng - minLng) * 1.25, 0.15),
  };
}

function poiTypeLabel(type: Poi['type']) {
  if (type === 'water') return 'Water';
  if (type === 'camp') return 'Camp';
  if (type === 'toilet') return 'Toilet';
  if (type === 'shower') return 'Shower';
  return type;
}

function RouteMap({
  points,
  pois,
  violations,
  gateHits = [],
  kmlOverlay,
  showKmlPoints,
  focusTarget,
}: Props) {
  const mapRef = useRef<any>(null);

  const initialRegion = useMemo(() => routeRegion(points), [points]);

  const routeCoords = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [points]
  );

  // Auto-fit route once
  useEffect(() => {
    if (!mapRef.current || routeCoords.length < 2) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [routeCoords]);

  // Focus target
  useEffect(() => {
    if (!focusTarget) return;
    if (!mapRef.current) return;

    try {
      mapRef.current.animateToRegion(
        {
          latitude: focusTarget.lat,
          longitude: focusTarget.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600
      );
    } catch (e) {
      console.log('animateToRegion failed:', e);
    }
  }, [focusTarget?.ts]);

  const poiMarkers = useMemo(
    () =>
      pois.map((p) => ({
        key: p.id || `${p.type}-${p.lat}-${p.lng}`,
        coordinate: { latitude: p.lat, longitude: p.lng },
        title: p.name || p.type,
        description: [
          poiTypeLabel(p.type),
          p.notes,
          `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
        ]
          .filter(Boolean)
          .join('\n'),
      })),
    [pois]
  );

  const violationMarkers = useMemo(
    () =>
      violations
        .map((v: any, i: number) => {
          if (typeof v.lat === 'number' && typeof v.lng === 'number') {
            return {
              key: `v-${i}`,
              coordinate: { latitude: v.lat, longitude: v.lng },
              title: v.name || 'Violation',
            };
          }
          return null;
        })
        .filter(Boolean),
    [violations]
  );

  const gateHitMarkers = useMemo(
    () =>
      gateHits
        .filter((g) => typeof g.lat === 'number' && typeof g.lng === 'number')
        .map((g, i) => ({
          key: `gate-${g.id || i}`,
          coordinate: { latitude: g.lat, longitude: g.lng },
          title: g.name || `Gate ${i + 1}`,
        })),
    [gateHits]
  );

  const kmlLines = useMemo(() => kmlOverlay?.lines ?? [], [kmlOverlay]);

  const kmlPoints = useMemo(
    () => (showKmlPoints ? (kmlOverlay?.points ?? []).slice(0, 50) : []),
    [kmlOverlay, showKmlPoints]
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        clusterColor="#2f7d32"
        clusterTextColor="#ffffff"
        tracksViewChanges={false}
      >
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor="#1f6feb" />
        )}

        {kmlLines.map((line) => (
          <Polyline
            key={line.id}
            coordinates={line.coordinates}
            strokeWidth={3}
            strokeColor={kmlLineColor(line.kind)}
          />
        ))}

        {poiMarkers.map((p) => (
          <Marker
            key={p.key}
            coordinate={p.coordinate}
            title={p.title}
            description={p.description}
            pinColor="blue"
            tracksViewChanges={false}
          />
        ))}

        {violationMarkers.map((v: any) => (
          <Marker
            key={v.key}
            coordinate={v.coordinate}
            title={v.title}
            pinColor="red"
            tracksViewChanges={false}
          />
        ))}

        {gateHitMarkers.map((g) => (
          <Marker
            key={g.key}
            coordinate={g.coordinate}
            title={g.title}
            tracksViewChanges={false}
            zIndex={1000}
          >
            <View style={styles.gateMarker}>
              <Text style={styles.gateMarkerText}>✓</Text>
            </View>
          </Marker>
        ))}

        {kmlPoints.map((pt) => (
          <Marker
            key={pt.id}
            coordinate={{ latitude: pt.latitude, longitude: pt.longitude }}
            title={pt.name}
            pinColor={
              pt.kind === 'banned' || pt.kind === 'tunnel'
                ? 'red'
                : pt.kind === 'ferry'
                ? 'green'
                : 'orange'
            }
            tracksViewChanges={false}
          />
        ))}

        {focusTarget && (
          <Marker
            key={`focus-${focusTarget.ts}`}
            coordinate={{ latitude: focusTarget.lat, longitude: focusTarget.lng }}
            title={focusTarget.label || 'Selected'}
            pinColor="magenta"
            tracksViewChanges={false}
          />
        )}
      </MapView>
    </View>
  );
}

export default React.memo(RouteMap);

const styles = StyleSheet.create({
  container: {
    height: '100%',
    minHeight: 420,
  },
  map: {
    flex: 1,
  },
  gateMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  gateMarkerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
