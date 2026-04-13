import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  fetchGateWeather,
  weatherDescription,
  weatherEmoji,
  windDirectionLabel,
  type GateWeather,
} from '../logic/weather';

type Props = {
  lat: number;
  lng: number;
  elevationM?: number;
  fetchDelay?: number;
  photoUrl?: string | null;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function GateWeatherCard({ lat, lng, elevationM, fetchDelay = 0, photoUrl }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = !!photoUrl && !imageFailed;

  const [weather, setWeather] = useState<GateWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      fetchGateWeather(lat, lng)
        .then((w) => { if (!cancelled) { setWeather(w); setLoading(false); } })
        .catch((e) => { if (!cancelled) { setError(e?.message || 'Failed'); setLoading(false); } });
    }, fetchDelay);

    return () => { cancelled = true; clearTimeout(timer); };
  }

  useEffect(load, [lat, lng, fetchDelay]);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="#1f6feb" />
        <Text style={styles.loadingText}>Loading forecast...</Text>
      </View>
    );
  }

  if (error || !weather) {
    return (
      <Pressable onPress={load} style={styles.errorRow}>
        <Text style={styles.error}>Weather unavailable — tap to retry</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {showPhoto ? (
  <Image
    source={{ uri: photoUrl! }}
    style={styles.photo}
    resizeMode="cover"
    onError={() => setImageFailed(true)}
  />
) : null}
      {elevationM != null && (
        <Text style={styles.elevation}>⛰ {elevationM.toLocaleString()} m elevation</Text>
      )}
      <View style={styles.daysRow}>
        {weather.days.map((day) => (
          <View key={day.date} style={styles.dayCard}>
            <Text style={styles.dayDate}>{formatDate(day.date)}</Text>
            <Text style={styles.dayEmoji}>{weatherEmoji(day.weatherCode)}</Text>
            <Text style={styles.dayDesc}>{weatherDescription(day.weatherCode)}</Text>
            <Text style={styles.dayTemp}>
              {day.tempMaxC}° / {day.tempMinC}°C
            </Text>
            <Text style={styles.dayWind}>
              💨 {day.windMaxKph} km/h {windDirectionLabel(day.windDirDeg)}
            </Text>
            {day.precipMm > 0 && (
              <Text style={styles.dayPrecip}>🌧 {day.precipMm} mm</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  elevation: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayCard: {
    flex: 1,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  dayDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
    marginBottom: 4,
    textAlign: 'center',
  },
  dayEmoji: {
    fontSize: 22,
    marginBottom: 2,
  },
  dayDesc: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
    marginBottom: 4,
  },
  dayTemp: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  dayWind: {
    fontSize: 11,
    color: '#1f6feb',
    fontWeight: '600',
    textAlign: 'center',
  },
  dayPrecip: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
  },
  errorRow: {
    paddingVertical: 6,
  },
  error: {
    fontSize: 12,
    color: '#999',
  },
});
