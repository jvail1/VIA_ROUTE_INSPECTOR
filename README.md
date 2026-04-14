# VIA Route Inspector

Pre-race GPX inspection app for the VIA Chapter III ultra-cycling race. Riders import a planned route and check it against race constraints before the event: mandatory gates, banned roads or tunnels, ferries, route-adjacent POIs, and gate weather.

This app is intended for planning and verification before the race, not in-field navigation.

## What The App Does

- Imports a GPX route from the device
- Checks the route against mandatory gates and banned locations
- Shows the route on a map with gate hits, violations, and optional hazard overlays
- Loads curated and live POIs near the route
- Displays gate-by-gate progress with weather and detail popups
- Exports a GPX containing the official gate waypoints

## Current Feature Set

### Route Inspection

- GPX import from device storage
- Gate hit / missed detection
- Violation detection for banned tunnels, roads, bridges, and ferries
- Consolidated gate list with green checks and red Xs
- Gate detail modal with coordinates, elevation, nearby hazards, and 3-day weather

### Map

- Route polyline rendering
- Gate hit markers
- Violation markers
- KML hazard lines and optional hazard points
- Route-adjacent POIs shown on the map with conservative marker limits for stability

### POIs

- Bundled curated POIs from GPX
- Live POI loading from Overpass
- Type filters: water, camp, toilet, shower
- Distance filters: 1 km, 3 km, 5 km, 10 km

### Weather

- 3-day gate forecasts from Open-Meteo
- Weather shown inline for each gate and in gate details

## Tech Stack

- Expo SDK 54
- Expo Router
- React Native 0.81
- TypeScript
- `react-native-maps`
- `react-native-map-clustering`
- AsyncStorage
- Open-Meteo
- Overpass API

## Project Structure

```text
app/
  index.tsx                  Main screen and main user flow

components/
  RouteMap.tsx               Route, markers, overlays
  GateWeatherCard.tsx        3-day gate forecast UI
  GateDetailModal.tsx        Gate details modal

logic/
  gpx.ts                     GPX parsing
  inspectRoute.ts            Gate hit / violation inspection
  routeIndex.ts              Spatial index for fast route checks
  routeDistance.ts           Distance-to-route helper for POIs
  livePois.ts                Overpass POI loading
  curatedPois.ts             Bundled POI parsing
  mergePois.ts               Curated/live POI merge
  parseKmlOverlay.ts         Hazard overlay parsing
  weather.ts                 Open-Meteo fetch + cache
  cache.ts                   AsyncStorage helpers

data/
  gates.json                 Mandatory gates
  banned.json                Banned locations
  VIA_Ch3_POI_Offline.gpx    Bundled POIs
  VIA Chapter III - RACE Route & Locations.kml
```

## Local Development

### Requirements

- Node.js and npm
- Expo Go on iPhone or Android, or local simulator tooling
- A Google Maps API key for native map rendering

### Environment

Create a local `.env` file in the project root:

```bash
GOOGLE_MAPS_API_KEY=your_key_here
```

Do not commit API keys or signing credentials.

### Install

```bash
npm install
```

### Run

```bash
npx expo start
```

Useful variants:

```bash
npx expo start -c
npx expo start -c --tunnel
npx expo start --ios
npx expo start --android
```

## Build Notes

- Bundle ID: `com.via.routeinspector`
- Google Maps API key is read from `process.env.GOOGLE_MAPS_API_KEY` in `app.config.js`
- Native builds are intended to go through EAS

Examples:

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

## Data Sources

- `data/gates.json`: mandatory race gates
- `data/banned.json`: banned locations
- `data/VIA_Ch3_POI_Offline.gpx`: bundled POIs
- `data/VIA Chapter III - RACE Route & Locations.kml`: hazards and ferry overlays
- Open-Meteo: gate forecasts
- Overpass API: live POIs near route

## Stability Notes

- The app is currently optimized around a stable planning workflow rather than aggressive UI refactors.
- Map updates caused by top-of-screen toggles are handled conservatively to reduce native map crashes.
- POI markers on the map are intentionally capped for iPhone stability.

## Known Limitations

- Web support is not complete because the current map stack is native-oriented
- Live POI loading depends on third-party Overpass availability
- The app is designed for pre-race inspection, not turn-by-turn navigation

## Recommended Next Improvements

- Add a stronger top-level inspection summary block
- Improve ferry and booking guidance in gate rows and gate details
- Clean up warning-level lint issues
- Add a proper error boundary around the main app flow
- Improve project documentation around release/build workflow
