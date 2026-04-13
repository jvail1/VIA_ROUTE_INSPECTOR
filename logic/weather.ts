export type DayForecast = {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  windMaxKph: number;
  windDirDeg: number;
  precipMm: number;
  weatherCode: number;
};

export type GateWeather = {
  lat: number;
  lng: number;
  days: DayForecast[];
  fetchedAt: number;
};

// In-memory cache keyed by "lat,lng"
const cache = new Map<string, GateWeather>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function weatherDescription(code: number): string {
  if (code === 0)               return 'Clear sky';
  if (code === 1)               return 'Mainly clear';
  if (code === 2)               return 'Partly cloudy';
  if (code === 3)               return 'Overcast';
  if (code <= 48)               return 'Foggy';
  if (code <= 55)               return 'Drizzle';
  if (code <= 65)               return 'Rain';
  if (code <= 67)               return 'Freezing rain';
  if (code <= 75)               return 'Snow';
  if (code <= 77)               return 'Snow grains';
  if (code <= 82)               return 'Rain showers';
  if (code <= 86)               return 'Snow showers';
  if (code === 95)              return 'Thunderstorm';
  if (code <= 99)               return 'Thunderstorm + hail';
  return 'Unknown';
}

export function weatherEmoji(code: number): string {
  if (code === 0)               return '☀️';
  if (code <= 2)                return '🌤️';
  if (code === 3)               return '☁️';
  if (code <= 48)               return '🌫️';
  if (code <= 55)               return '🌦️';
  if (code <= 65)               return '🌧️';
  if (code <= 67)               return '🌨️';
  if (code <= 77)               return '❄️';
  if (code <= 82)               return '🌦️';
  if (code <= 86)               return '🌨️';
  if (code >= 95)               return '⛈️';
  return '🌡️';
}

export async function fetchGateWeather(
  lat: number,
  lng: number,
): Promise<GateWeather> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,windspeed_10m_max,` +
    `winddirection_10m_dominant,precipitation_sum,weathercode` +
    `&forecast_days=3&timezone=Europe%2FOslo`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather fetch failed: ${response.status}`);

  const data = await response.json();
  const d = data.daily;

  const days: DayForecast[] = d.time.map((date: string, i: number) => ({
    date,
    tempMaxC:   Math.round(d.temperature_2m_max[i]),
    tempMinC:   Math.round(d.temperature_2m_min[i]),
    windMaxKph: Math.round(d.windspeed_10m_max[i]),
    windDirDeg: Math.round(d.winddirection_10m_dominant[i]),
    precipMm:   Math.round(d.precipitation_sum[i] * 10) / 10,
    weatherCode: d.weathercode[i],
  }));

  const result: GateWeather = { lat, lng, days, fetchedAt: Date.now() };
  cache.set(key, result);
  return result;
}
