import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { Callout, Marker, Polyline } from 'react-native-maps';

import type { Poi } from '../logic/curatedPois';
import type { KmlOverlay } from '../logic/parseKmlOverlay';
import { formatDistance } from '../logic/formatDistance';
import { decimatePolyline } from '../logic/decimate';

type RoutePoint = {
  lat: number;
  lng: number;
};

type GateHit = {
  id?: string;
  name?: string;
  lat: number;
  lng: number;
  photoUrl?: string;
};

type Violation = {
  name?: string;
  lat?: number;
  lng?: number;
  point?: { lat: number; lng: number };
};

type EnrichedPoi = Poi & {
  routeDistanceM?: number;
};

type Props = {
  points: RoutePoint[];
  violations: Violation[];
  pois: EnrichedPoi[];
  gateHits?: GateHit[];
  kmlOverlay?: KmlOverlay | null;
  showKmlPoints?: boolean;
  focusTarget?: { lat: number; lng: number; label?: string; ts?: number } | null;
};

const HAZARD_POINT_MAX_LONGITUDE_DELTA = 0.2;

function colorForPoiType(type: string) {
  switch (type) {
    case 'water':
      return 'blue';
    case 'camp':
      return 'green';
    case 'toilet':
      return 'orange';
    case 'shower':
      return 'purple';
    default:
      return 'red';
  }
}

function colorForOverlay(kind: string) {
  switch (kind) {
    case 'ferry':
      return '#7c3aed';
    case 'tunnel':
      return '#111827';
    case 'banned':
      return '#dc2626';
    default:
      return '#6b7280';
  }
}

function colorForOverlayPoint(kind: string) {
  switch (kind) {
    case 'ferry':
      return 'purple';
    case 'tunnel':
      return 'black';
    case 'banned':
      return 'red';
    case 'mandatory':
      return 'gold';
    default:
      return 'gray';
  }
}

function widthForOverlay(kind: string) {
  switch (kind) {
    case 'ferry':
      return 4;
    case 'tunnel':
      return 5;
    case 'banned':
      return 5;
    default:
      return 3;
  }
}

function routeRegion(points: RoutePoint[]) {
  if (!points.length) {
    return {
      latitude: 56.0,
      longitude: 10.0,
      latitudeDelta: 4.0,
      longitudeDelta: 4.0,
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
  const latitudeDelta = Math.max((maxLat - minLat) * 1.25, 0.15);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.25, 0.15);

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

export default function RouteMap({
  points,
  violations,
  pois,
  gateHits = [],
  kmlOverlay,
  showKmlPoints = false,
  focusTarget,
}: Props) {
  const mapRef = useRef<any>(null);
  const selectedMarkerRef = useRef<any>(null);
  const lastFittedRouteKeyRef = useRef<string | null>(null);

  const initialRegion = useMemo(() => routeRegion(points), [points]);

  const initialHazardVisible =
    showKmlPoints && initialRegion.longitudeDelta <= HAZARD_POINT_MAX_LONGITUDE_DELTA;

  const [hazardPointsVisible, setHazardPointsVisible] = useState(initialHazardVisible);
  const hazardPointsVisibleRef = useRef(initialHazardVisible);

  useEffect(() => {
    const nextVisible =
      showKmlPoints && initialRegion.longitudeDelta <= HAZARD_POINT_MAX_LONGITUDE_DELTA;
    hazardPointsVisibleRef.current = nextVisible;
    setHazardPointsVisible(nextVisible);
  }, [showKmlPoints, initialRegion.longitudeDelta]);

  const routeCoords = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [points]
  );

  const routeCoordsDecimated = useMemo(
    () => decimatePolyline(routeCoords),
    [routeCoords]
  );

  const routeKey = useMemo(() => {
    if (!points.length) return 'empty';
    const first = points[0];
    const last = points[points.length - 1];
    return `${points.length}:${first.lat}:${first.lng}:${last.lat}:${last.lng}`;
  }, [points]);

  useEffect(() => {
    if (!mapRef.current || routeCoords.length < 2) return;
    if (lastFittedRouteKeyRef.current === routeKey) return;

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
        },
        animated: true,
      });
      lastFittedRouteKeyRef.current = routeKey;
    }, 250);

    return () => clearTimeout(timer);
  }, [routeCoords, routeKey]);

  useEffect(() => {
    if (!mapRef.current || !focusTarget) return;

    const timer = setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: focusTarget.lat,
          longitude: focusTarget.lng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        700
      );
    }, 50);

    const calloutTimer = setTimeout(() => {
      selectedMarkerRef.current?.showCallout?.();
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(calloutTimer);
    };
  }, [focusTarget?.lat, focusTarget?.lng, focusTarget?.ts]);

  const visibleOverlayLines = useMemo(() => {
    return kmlOverlay?.lines || [];
  }, [kmlOverlay]);

  const visibleOverlayPoints = useMemo(() => {
    if (!showKmlPoints || !hazardPointsVisible) return [];
    return kmlOverlay?.points || [];
  }, [kmlOverlay, showKmlPoints, hazardPointsVisible]);

  const violationCoords = useMemo(() => {
    return (violations || [])
      .map((v: any) => {
        if (typeof v.lat === 'number' && typeof v.lng === 'number') {
          return {
            key: `${v.name || 'violation'}-${v.lat}-${v.lng}`,
            latitude: v.lat,
            longitude: v.lng,
            title: v.name || 'Violation',
          };
        }

        if (v.point && typeof v.point.lat === 'number' && typeof v.point.lng === 'number') {
          return {
            key: `${v.name || 'violation'}-${v.point.lat}-${v.point.lng}`,
            latitude: v.point.lat,
            longitude: v.point.lng,
            title: v.name || 'Violation',
          };
        }

        return null;
      })
      .filter(Boolean) as { key: string; latitude: number; longitude: number; title: string }[];
  }, [violations]);

  function handleRegionChangeComplete(region: any) {
    if (!showKmlPoints) {
      if (hazardPointsVisibleRef.current) {
        hazardPointsVisibleRef.current = false;
        setHazardPointsVisible(false);
      }
      return;
    }

    const nextVisible =
      typeof region?.longitudeDelta === 'number' &&
      region.longitudeDelta <= HAZARD_POINT_MAX_LONGITUDE_DELTA;

    if (nextVisible !== hazardPointsVisibleRef.current) {
      hazardPointsVisibleRef.current = nextVisible;
      setHazardPointsVisible(nextVisible);
    }
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        animationEnabled={false}
        clusterColor="#2f7d32"
        clusterTextColor="#ffffff"
        spiralEnabled={false}
        tracksViewChanges={false}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {visibleOverlayLines.map((line) => (
          <Polyline
            key={line.id}
            coordinates={line.coordinates}
            strokeColor={colorForOverlay(line.kind)}
            strokeWidth={widthForOverlay(line.kind)}
          />
        ))}

        {routeCoordsDecimated.length > 1 && (
          <Polyline
            coordinates={routeCoordsDecimated}
            strokeWidth={4}
            strokeColor="#1f6feb"
          />
        )}

        {pois.map((p: EnrichedPoi, i: number) => (
          <Marker
            key={`${p.id || p.type}-${p.lat}-${p.lng}-${i}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.name || p.type || 'POI'}
            description={
              p.routeDistanceM != null
                ? `${p.type} · ${formatDistance(p.routeDistanceM, 'both')}`
                : p.type
            }
            pinColor={colorForPoiType(p.type)}
            tracksViewChanges={false}
          />
        ))}

        {visibleOverlayPoints.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.name}
            description={p.folder}
            pinColor={colorForOverlayPoint(p.kind)}
            tracksViewChanges={false}
          />
        ))}

        {gateHits.map((g, i) => (
          <Marker
            key={g.id || 'gate-' + i}
            coordinate={{ latitude: g.lat, longitude: g.lng }}
            pinColor="gold"
            tracksViewChanges={false}
            cluster={false}
            zIndex={10}
          >
            <Callout tooltip={false}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{g.name || 'Gate'}</Text>
                {g.photoUrl ? (
                  <Image
                    source={{ uri: g.photoUrl }}
                    style={styles.calloutImage}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}

        {violationCoords.map((v) => (
          <Marker
            key={v.key}
            coordinate={{ latitude: v.latitude, longitude: v.longitude }}
            title={v.title}
            pinColor="red"
            tracksViewChanges={false}
          />
        ))}

        {focusTarget && (
          <Marker
            key={`selected-${focusTarget.lat}-${focusTarget.lng}-${focusTarget.ts || 0}`}
            ref={selectedMarkerRef}
            coordinate={{
              latitude: focusTarget.lat,
              longitude: focusTarget.lng,
            }}
            title={focusTarget.label || 'Selected location'}
            description="Selected from list"
            pinColor="magenta"
            tracksViewChanges={false}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    minHeight: 420,
  },
  map: {
    flex: 1,
  },
});
