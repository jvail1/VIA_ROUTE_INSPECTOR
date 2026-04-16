import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { haversine } from '../logic/distance';
import { formatDistance } from '../logic/formatDistance';
import GateWeatherCard from './GateWeatherCard';
import bannedData from '../data/banned.json';

type Gate = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  r: number;
  elevationM: number;
  photoUrl: string | null;
};

type Props = {
  gate: Gate | null;
  hit: boolean;
  closestM?: number;
  distFromRouteEndKm?: number;
  onClose: () => void;
};

const FERRY_PREBOOK_IDS = new Set(['g4']); // Gate IV — Lysebotn

function nearbyHazards(gate: Gate) {
  return (bannedData as any[])
    .map((b) => ({ ...b, distM: Math.round(haversine(gate.lat, gate.lng, b.lat, b.lng)) }))
    .filter((b) => b.distM < 80_000)
    .sort((a, b) => a.distM - b.distM);
}

function hazardTypeLabel(type: string) {
  if (type === 'tunnel') return '🚫 Banned tunnel';
  if (type === 'road') return '🚫 Banned road';
  if (type === 'ferry') return '⛴ Banned ferry';
  return '⚠️ Hazard';
}

export default function GateDetailModal({ gate, hit, closestM, distFromRouteEndKm, onClose }: Props) {
  if (!gate) return null;

  const hazards = nearbyHazards(gate);
  const needsFerryPrebook = FERRY_PREBOOK_IDS.has(gate.id);

  return (
    <Modal
      visible={!!gate}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{gate.name}</Text>
            <View style={[styles.badge, hit ? styles.badgeHit : styles.badgeMiss]}>
              <Text style={styles.badgeText}>{hit ? '✓ HIT' : '✗ MISSED'}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>ELEVATION</Text>
              <Text style={styles.statValue}>{gate.elevationM} m</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>STATUS</Text>
              <Text style={[styles.statValue, hit ? styles.hitText : styles.missText]}>
                {hit ? 'Hit' : closestM != null && isFinite(closestM) ? `${formatDistance(closestM, 'km')} away` : 'Not near route'}
              </Text>
            </View>
          </View>
          {distFromRouteEndKm != null && (
            <View style={styles.stat}>
              <Text style={styles.statLabel}>FROM ROUTE END (straight line)</Text>
              <Text style={styles.statValue}>{distFromRouteEndKm} km</Text>
            </View>
          )}

          <View style={styles.coordRow}>
            <Text style={styles.coordText}>
              {gate.lat.toFixed(5)}°, {gate.lng.toFixed(5)}°
            </Text>
          </View>

          {/* Ferry pre-booking alert */}
          {needsFerryPrebook && (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>⛴ Ferry pre-booking required</Text>
              <Text style={styles.alertBody}>
                Lysebotn is only accessible by ferry from Lauvvik or Forsand.
                Ferries must be pre-booked — limited capacity.
              </Text>
            </View>
          )}

          {/* Nearby hazards */}
          {hazards.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nearby Hazards</Text>
              {hazards.map((h) => (
                <View key={h.name} style={styles.hazardRow}>
                  <Text style={styles.hazardLabel}>{hazardTypeLabel(h.type)}</Text>
                  <Text style={styles.hazardName}>{h.name}</Text>
                  <Text style={styles.hazardDist}>{(h.distM / 1000).toFixed(1)} km away</Text>
                </View>
              ))}
            </View>
          )}

          {/* Weather */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3-Day Forecast</Text>
            <GateWeatherCard
              lat={gate.lat}
              lng={gate.lng}
              elevationM={gate.elevationM}
              photoUrl={gate.photoUrl}
              fetchDelay={0}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e0d8',
  },
  headerLeft: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    flexShrink: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeHit: {
    backgroundColor: '#2f7d32',
  },
  badgeMiss: {
    backgroundColor: '#c62828',
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 8,
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },
  hitText: {
    color: '#2f7d32',
  },
  missText: {
    color: '#c62828',
  },
  coordRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  coordText: {
    fontSize: 14,
    color: '#555',
    fontFamily: 'monospace',
  },
  alertBox: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#f9a825',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7a5300',
    marginBottom: 6,
  },
  alertBody: {
    fontSize: 14,
    color: '#7a5300',
    lineHeight: 20,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  hazardRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  hazardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
  },
  hazardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  hazardDist: {
    fontSize: 13,
    color: '#666',
  },
});
