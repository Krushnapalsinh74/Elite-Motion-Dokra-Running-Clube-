# Dokra Running Club

Premium sports tracking mobile app (Walking, Running, Cycling) with a high-accuracy tracking engine, dark luxury UI, and burnt orange brand identity.

## Run & Operate

- `pnpm --filter @workspace/mobile run dev` — run the Expo app (Expo Go / web)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo SDK 54 + expo-router v6 (file-based navigation)
- Tracking engine: `artifacts/mobile/lib/tracking/`
- State: AsyncStorage persistence (no backend yet)

## Where things live

- `artifacts/mobile/app/` — all screens (expo-router file-based)
  - `(auth)/login.tsx` — login / register screen
  - `(tabs)/` — main tabs: Home, Activity, History, Profile
  - `tracking.tsx` — full-screen live tracking (fullScreenModal)
  - `summary.tsx` — post-activity summary
- `artifacts/mobile/contexts/` — AuthContext, ActivityContext
- `artifacts/mobile/lib/tracking/` — accuracy engine (see below)
- `artifacts/mobile/components/` — StatRing, ActivityTypeCard, HistoryCard, MetricDisplay, TrackingMap (+ .web stub)

## Tracking Engine (`lib/tracking/`)

Three-layer accuracy stack:
1. **KalmanFilter.ts** — 1-D Kalman filter, composed into `GpsKalmanFilter` (lat + lon independently)
2. **GpsAccuracyEngine.ts** — validates GPS points: accuracy gate, max-speed validation, outlier/jump detection, minimum distance threshold, confidence scoring (0–1)
3. **SensorFusion.ts** — accelerometer motion detection (expo-sensors) + pedometer step counting; web returns stub always-moving
4. **ActivityTracker.ts** — top-level coordinator; wires GPS engine + sensor fusion; emits `TrackingUpdate` on every accepted point; simulates realistic movement on web

ActivityContext wraps ActivityTracker and exposes `liveMetrics` (not `liveActivity`).

## Activity data shape

```ts
interface Activity {
  id, type, startTime, endTime,
  duration (seconds), distance (metres),
  avgSpeed (km/h), avgPace (min/km),
  calories, steps, confidence (0-1), coords[]
}
```

## Architecture decisions

- Platform-specific map: `TrackingMap.tsx` (native, react-native-maps@1.18.0) + `TrackingMap.web.tsx` (placeholder) — avoids native-only import error on web
- Dark theme always-on: `colors.dark` key populated, `useColorScheme()` selects it; `userInterfaceStyle: "dark"` in app.json
- Distance never counted from GPS drift: Kalman filter + speed validation + accelerometer cross-check all must pass
- No backend yet: all data persists to AsyncStorage with key `@dokra_activities_v2`

## User preferences

- Brand: Deep black (#0A0A0A) background, burnt orange (#E85D04) primary, white text
- Typography: Inter (400/500/600/700)
- No emojis anywhere, only Feather icons
- Premium / minimal / athletic visual style — Strava × Nike Run Club inspiration
