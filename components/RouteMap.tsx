import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { Marker, Polyline } from 'react-native-maps';

import type { Poi } from '../logic/curatedPois';

type RoutePoint = { lat: number; lng: number };

type Props = {
  points: RoutePoint[];
  pois: Poi[];
  violations: any[];
  focusTarget?: { lat: number; lng: number; label?: string; ts?: number } | null;
};

function routeRegion(points: RoutePoint[]) {
  if (!points.length) {
    return {
      latitude: 56,
      longitude: 10,
      latitudeDelta: 4,
      longitudeDelta: 4,
    };
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

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;

  return {
    latitude,
    longitude,
    latitudeDelta: Math.max((maxLat - minLat) * 1.25, 0.15),
    longitudeDelta: Math.max((maxLng - minLng) * 1.25, 0.15),
  };
}

function RouteMap({ points, pois, violations, focusTarget }: Props) {
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
    if (!mapRef.current || !focusTarget) return;

    mapRef.current.animateToRegion(
      {
        latitude: focusTarget.lat,
        longitude: focusTarget.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      },
      600
    );
  }, [focusTarget?.ts]);

  // Stable marker data
  const poiMarkers = useMemo(
    () =>
      pois.map((p, i) => ({
        key: `${p.type}-${p.lat}-${p.lng}-${i}`,
        coordinate: { latitude: p.lat, longitude: p.lng },
        title: p.name || p.type,
        type: p.type,
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

        {poiMarkers.map((p) => (
          <Marker
            key={p.key}
            coordinate={p.coordinate}
            title={p.title}
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
});
