# VIA Route Inspector — Claude Code Context

## What This App Does
Pre-race route inspection tool for the **VIA Chapter III** ultra-cycling race
(Netherlands → Norway, ~4000 km). Riders import their planned GPX route and the
app checks it against race rules — mandatory gates, banned tunnels/roads, and
ferries. Used at home or hotel before the race, not in the field.

---

## Tech Stack
| Layer | Library |
|---|---|
| Framework | Expo SDK 54, expo-router, React Native 0.81.5 |
| Maps | react-native-maps 1.20.1 + react-native-map-clustering |
| Persistence | @react-native-async-storage/async-storage |
| XML parsing | fast-xml-parser |
| Weather | Open-Meteo API (free, no key needed) |
| Build | EAS (project: jvail9504/via-route-inspector) |
| Language | TypeScript |

**Bundle IDs:** `com.via.routeinspector` (both iOS and Android)  
**Google Maps API key** stored as EAS secret `GOOGLE_MAPS_API_KEY` — never commit this value.  
Local dev: create a `.env` file (gitignored) with `GOOGLE_MAPS_API_KEY=your_key`

---

## Credentials Policy
- **Never put API keys, SHA-1 fingerprints, or signing credentials in this file or any committed file**
- Google Maps key → EAS secret + local `.env` (gitignored)
- Android keystore → managed by EAS (run `eas credentials` to inspect)
- `.env` is in `.gitignore` — keep it that way

---

## Project Structure

```
app/
  index.tsx                  Main screen — all state, UI, data flow

components/
  RouteMap.tsx               Map rendering — receives pre-filtered data
  GateWeatherCard.tsx        3-day Open-Meteo forecast card per gate

logic/
  inspectRoute.ts            Gate hit + violation detection (uses spatial index)
  routeIndex.ts              0.1° grid spatial index — fast proximity lookups
  decimate.ts                Ramer-Douglas-Peucker polyline decimation
  livePois.ts                Overpass API — corridor tile fetching, TTL cache
  curatedPois.ts             Bundled GPX POI parser
  mergePois.ts               Deduplicates curated + live POIs
  parseKmlOverlay.ts         KML parser for hazard lines + points
  routeDistance.ts           Brute-force min distance (legacy, mostly replaced)
  distance.ts                Haversine formula
  formatDistance.ts          km / mi formatter
  weather.ts                 Open-Meteo fetch + 30-min in-memory cache
  cache.ts                   AsyncStorage helpers incl. per-tile POI cache
  gpx.ts                     GPX trackpoint parser

data/
  gates.json                 18 mandatory gates — lat/lng/radius/elevationM
  banned.json                11 banned locations — lat/lng/radius/type
  VIA_Ch3_POI_Offline.gpx    Bundled curated POIs
  VIA Chapter III - RACE Route & Locations.kml   Hazard overlay
```

---

## Key Architecture Decisions

### Spatial Index (routeIndex.ts)
Replaces all O(n) brute-force route scans. Build once per imported GPX, reuse
everywhere. Cell size 0.1° ≈ 11 km — covers max POI radius (10 km) in 9 cells.
`buildRouteIndex(points)` → `minDistanceIndexed(index, lat, lng)`

### Polyline Decimation (decimate.ts)
RDP algorithm reduces 40k-point GPX to ~500–2000 points for rendering.
Full-res array kept in state for inspection logic.
`decimatePolyline(coords, epsilon=0.001)` — epsilon in degrees, 0.001 ≈ 111m.

### Live POI Fetching (livePois.ts)
- Splits route into 0.5° corridor tiles (not full bbox — avoids NL→NO query)
- Per-tile TTL cache: 24h in AsyncStorage
- Endpoint cooldown: 10 min per endpoint after 429/504
- Early abort after 2 consecutive hard failures (uses saved merged fallback)
- Retry support for failed tile IDs
- Fixed max distances: water/toilet/shower 5km, camp = user-configurable

### Data Flow in index.tsx
```
points → buildRouteIndex → routeIndex
mergedPois + routeIndex → enrichedPois (routeDistanceM pre-computed)
enrichedPois + filters → visiblePois (passed to RouteMap — no double filter)
```
RouteMap receives `visiblePois: EnrichedPoi[]` — does NOT do its own distance filtering.

### inspectRoute (inspectRoute.ts)
Builds spatial index once, then O(1) lookup per gate/banned item.
Previously O(n × items) brute force.

---

## Race Data

### Mandatory Gates (data/gates.json)
18 waypoints: Start (Amerongen, NL) → Gates I–XVI → Finish (Volda, NO)

Key high-altitude gates:
- Gate VI Sognefjellet: 1434m
- Gate XIV Dalsnibba: 1476m
- Gate VIII Strynefjellsveg: 1139m
- Gate I Brocken: 1141m

### Banned Locations (data/banned.json)
Tunnels: Laerdalstunnelen, Gudvangatunnelen, Kvivstunnelen, Eiksund,
Oslofjordtunnelen, Innfjordtunnelen  
Bridges: Storebaeltsbroen, Øresundsbron  
Roads: E39 Vassenden–Skei, E6 Sel–Dombås  
Ferries: Hirtshals, Göteborg, Ystad (banned — must use permitted alternatives)

### KML Hazard Overlay
3 folders parsed by parseKmlOverlay.ts:
- **Mandatory Locations** — gold markers (kind: 'mandatory')
- **Tunnels / Banned Roads** — red markers + red polylines (kind: 'banned'/'tunnel')
- **Ferries** — green permitted, red banned, black route lines (kind: 'ferry')

---

## UI State (index.tsx)

### Filter State
- `showWater / showCamp / showToilets / showShowers` — POI type toggles
- `poiRadiusMeters` — display radius (1/3/5/10 km)
- `campFetchRadiusMeters` — Overpass fetch radius for campsites (5/10/15 km)
- `useLivePois` — toggle curated-only vs curated+live
- `showKmlOverlay` — hazard lines toggle
- `showKmlPoints` — hazard point markers toggle (zoom-gated in RouteMap)

### Loading States
- `isLoadingImport` — GPX import in progress
- `isLoadingLivePois` — Overpass fetch in progress
- `livePoiStatus` — status string shown to user
- `failedLivePoiTileIds` — enables retry button

### Cache Keys (cache.ts)
- `via.routeState.v1` — last imported route + inspection result
- `via.livePois.v1` — merged live POIs
- `via.uiState.v1` — filter/toggle state
- `via.livePoisTile.v1:{tileId}` — per-tile Overpass results with fetchedAt

---

## RouteMap Props
```typescript
points: RoutePoint[]          // full-res, for fitToCoordinates only
visiblePois: EnrichedPoi[]    // pre-filtered — NO distance calc in RouteMap
violations: Violation[]        // tappable, zoom on tap
gateHits: GateHit[]           // gold markers with callout
kmlOverlay: KmlOverlay | null
showKmlPoints: boolean         // zoom-gated via onRegionChangeComplete
focusTarget: { lat, lng, label, ts } | null   // ts forces re-trigger
```

---

## Weather (logic/weather.ts + components/GateWeatherCard.tsx)
- Open-Meteo daily forecast: tempMax/Min, windMax, windDir, precip, weatherCode
- 3-day forecast per gate, fetched lazily when gate row renders
- 30-min in-memory cache (Map keyed by "lat,lng")
- Timezone: Europe/Oslo
- Renders below each gate row in gate hits + gates missed lists
- Shows elevation from gates.json (hard-coded, gates don't move)
- Wind direction rendered as compass label (N/NE/E etc)
- Weather condition as emoji + text description

---

## Build Commands
```bash
npx expo start                                    # dev server (Expo Go)
npx expo start --clear                            # clear Metro cache
npx expo run:ios                                  # iOS simulator
eas build --profile preview --platform android    # shareable APK
eas build --profile preview --platform ios        # shareable iOS IPA
eas credentials --platform android               # manage Android keystore
eas build:list                                    # check build status
```

---

## TODO

### High Priority
- [ ] **Fix app.json → app.config.js** — move Google Maps key to use
      `process.env.GOOGLE_MAPS_API_KEY` so it is never hard-coded in a
      committed file. Store as EAS secret + local `.env`.
- [ ] **Verify all patches applied correctly** — upload current zip and diff
      against expected state: routeIndex.ts, decimate.ts, GateWeatherCard.tsx,
      livePois tile caching, enrichedPois flow, isLoadingImport state,
      gold gate markers in RouteMap.
- [ ] **iOS build** — Apple Developer account activated, first iOS preview
      build not yet completed. Run: `eas build --profile preview --platform ios`
- [ ] **GitHub remote repo** — set up remote, push main branch.

### Features
- [ ] **Progress tracker** — ordered checklist of all 16 gates showing
      hit/missed status at a glance. "X of 16 gates hit" summary line.
- [ ] **Gate detail screen** — tap a gate to see full info: coordinates,
      elevation, approach notes, nearby banned roads, nearest ferry,
      3-day weather card. All data already available.
- [ ] **Ferry booking alerts** — prominent warning on Gate IV (Lysebotn) and
      Solvorn–Ornes that ferry must be pre-booked.
- [ ] **Bearing + distance to next gate** — given last GPX point, show which
      gate is next and straight-line distance.
- [ ] **GPX export of gate waypoints** — let rider download a GPX of just the
      18 mandatory waypoints to load into Garmin/Wahoo.
- [ ] **Share results** — generate a summary (gates hit, violations, closest
      misses) that can be screenshotted or shared as text.

### Polish
- [ ] **Dark mode** — `userInterfaceStyle: automatic` already in app.json,
      needs stylesheet colour variables wired up.
- [ ] **Map scroll trap** — 420px map inside ScrollView causes scroll conflicts
      on mobile. Add expand/collapse toggle.
- [ ] **Gate photo thumbnails** — Google Maps hosted URLs are auth-gated.
      Need to host images independently (Cloudinary / GitHub) or bundle as
      local assets.
- [ ] **Error boundary** — wrap main screen so crashes show useful info to
      testers instead of a blank screen.

### Infrastructure
- [ ] **Android Studio + emulator** — not yet installed, useful for
      cross-platform testing alongside iOS simulator.

### Shelved (revisit if app goes beyond pre-race use)
- [ ] MapLibre + offline MBTiles — not needed for wifi pre-race inspection
- [ ] In-field navigation features

---

## Code Style
- TypeScript throughout, strict where possible
- `useMemo` for all expensive derivations
- No distance calculations inside RouteMap — always pre-filter in parent
- `any[]` used in inspection results (gates/violations) — acceptable for now
- Cat heredocs preferred for new files, node patch scripts for string edits
- Always verify patch scripts with console.log checks before trusting output
