import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  routeState: 'via.routeState.v1',
  livePois: 'via.livePois.v1',
  uiState: 'via.uiState.v1',
  livePoisTilePrefix: 'via.livePoisTile.v1:',
};

export type CachedRouteState = {
  fileName: string;
  pointCount: number;
  points: { lat: number; lng: number }[];
  result: {
    violations: any[];
    gateHits: any[];
    gatesMissed: any[];
  } | null;
};

export type CachedUiState = {
  showWater: boolean;
  showCamp: boolean;
  showToilets: boolean;
  showShowers: boolean;
  poiRadiusMeters: number;
  campFetchRadiusMeters?: number;
  useLivePois: boolean;
  showKmlOverlay: boolean;
  showKmlPoints: boolean;
};

export type CachedTilePois = {
  fetchedAt: number;
  items: any[];
};

export async function saveRouteState(value: CachedRouteState) {
  await AsyncStorage.setItem(KEYS.routeState, JSON.stringify(value));
}

export async function loadRouteState(): Promise<CachedRouteState | null> {
  const raw = await AsyncStorage.getItem(KEYS.routeState);
  if (!raw) return null;
  // Skip parsing if the stored route is very large (pre-decimation cache).
  // ~200 KB ≈ 5k points — anything larger is a full-res route that would crash on restore.
  if (raw.length > 200_000) {
    await AsyncStorage.removeItem(KEYS.routeState);
    return null;
  }
  return JSON.parse(raw);
}

export async function saveLivePois(value: any[]) {
  await AsyncStorage.setItem(KEYS.livePois, JSON.stringify(value));
}

export async function loadLivePois(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(KEYS.livePois);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function tileKey(tileId: string) {
  return `${KEYS.livePoisTilePrefix}${tileId}`;
}

export async function saveLivePoisTile(tileId: string, items: any[]) {
  const payload: CachedTilePois = {
    fetchedAt: Date.now(),
    items,
  };
  await AsyncStorage.setItem(tileKey(tileId), JSON.stringify(payload));
}

export async function loadLivePoisTile(tileId: string): Promise<CachedTilePois | null> {
  const raw = await AsyncStorage.getItem(tileKey(tileId));
  return raw ? JSON.parse(raw) : null;
}

export async function saveUiState(value: CachedUiState) {
  await AsyncStorage.setItem(KEYS.uiState, JSON.stringify(value));
}

export async function loadUiState(): Promise<CachedUiState | null> {
  const raw = await AsyncStorage.getItem(KEYS.uiState);
  return raw ? JSON.parse(raw) : null;
}

export async function clearAllCache() {
  const allKeys = await AsyncStorage.getAllKeys();
  const tileKeys = allKeys.filter((k) => k.startsWith(KEYS.livePoisTilePrefix));

  await AsyncStorage.multiRemove([
    KEYS.routeState,
    KEYS.livePois,
    KEYS.uiState,
    ...tileKeys,
  ]);
}
