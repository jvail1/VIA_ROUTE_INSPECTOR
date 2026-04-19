import React, { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';

import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { Callout, Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

import type { Poi } from '../logic/curatedPois';
import type { KmlOverlay } from '../logic/parseKmlOverlay';

type RoutePoint = { lat: number; lng: number };

export type RouteMapHandle = {
  zoomTo: (lat: number, lng: number) => void;
};

type Props = {
  points: RoutePoint[];
  pois: Poi[];
  violations: any[];
  gateHits?: any[];
  kmlOverlay?: KmlOverlay | null;
  showKmlPoints?: boolean;
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

const RouteMap = forwardRef<RouteMapHandle, Props>(function RouteMap({
  points,
  pois,
  violations,
  gateHits = [],
  kmlOverlay,
  showKmlPoints,
}, ref) {
  const mapRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    zoomTo(lat: number, lng: number) {
      try {
        mapRef.current?.animateToRegion(
          { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
          600
        );
      } catch (e) {
        console.log('animateToRegion failed:', e);
      }
    },
  }));

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

  const poiMarkers = useMemo(
    () =>
      pois.map((p) => ({
        key: p.id || `${p.type}-${p.lat}-${p.lng}`,
        coordinate: { latitude: p.lat, longitude: p.lng },
        title: p.name || poiTypeLabel(p.type),
        notes: p.notes,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`,
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
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        clusterColor="#2f7d32"
        clusterTextColor="#ffffff"
        clusterFontFamily="System"
        radius={40}
        animationEnabled={false}
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

        {poiMarkers.map((p) =>
          Platform.OS === 'android' ? (
            <Marker
              key={p.key}
              coordinate={p.coordinate}
              pinColor="blue"
              tracksViewChanges={false}
              title={p.title}
              description={p.notes || 'Tap to open in Google Maps'}
              onCalloutPress={() => Linking.openURL(p.mapsUrl)}
            />
          ) : (
            <Marker
              key={p.key}
              coordinate={p.coordinate}
              pinColor="blue"
              tracksViewChanges={false}
            >
              <Callout onPress={() => Linking.openURL(p.mapsUrl)}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{p.title}</Text>
                  {p.notes ? <Text style={styles.calloutNotes}>{p.notes}</Text> : null}
                  <Text style={styles.calloutLink}>Open in Google Maps →</Text>
                </View>
              </Callout>
            </Marker>
          )
        )}

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
            pinColor="#FFD700"
            tracksViewChanges={false}
            zIndex={1000}
          />
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

      </MapView>
    </View>
  );
});

export default RouteMap;

const styles = StyleSheet.create({
  container: {
    height: '100%',
    minHeight: 420,
  },
  map: {
    flex: 1,
  },
  callout: {
    width: 220,
    padding: 12,
  },
  calloutTitle: {
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 4,
  },
  calloutNotes: {
    fontSize: 11,
    color: '#555',
    marginBottom: 8,
  },
  calloutLink: {
    fontSize: 13,
    color: '#1a73e8',
    fontWeight: '600',
    paddingTop: 4,
  },
});
