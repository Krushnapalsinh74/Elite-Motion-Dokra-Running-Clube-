/**
 * ActivityTracker — the top-level coordinator.
 *
 * Wires together:
 *   GpsAccuracyEngine  → validates + Kalman-filters GPS points
 *   SensorFusion       → accelerometer motion detection + step counter
 *   Location watch     → raw GPS stream from expo-location
 *
 * Emits a single `TrackingUpdate` on every accepted GPS event.
 */

import * as Location from "expo-location";
import { Platform } from "react-native";

import { GpsAccuracyEngine, FilteredPoint, haversineM } from "./GpsAccuracyEngine";
import { SensorFusion, MotionState } from "./SensorFusion";

export type ActivityType = "walking" | "running" | "cycling";

export interface TrackingPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude: number | null;
  accuracy: number;
  confidence: number;
}

export interface TrackingUpdate {
  coords: TrackingPoint[];
  distanceM: number;
  currentSpeedKmh: number;
  avgSpeedKmh: number;
  avgPaceMinPerKm: number;
  calories: number;
  steps: number;
  cadence: number;
  confidence: number;
  isMoving: boolean;
  elapsedSeconds: number;
}

export type TrackingCallback = (update: TrackingUpdate) => void;

// MET values for calorie calculation
const MET: Record<ActivityType, number> = {
  walking: 3.8,
  running: 9.8,
  cycling: 7.5,
};

// Web simulation speeds (km/h) — demo data when GPS isn't available
const SIM_SPEED: Record<ActivityType, number> = {
  walking: 5.2,
  running: 10.5,
  cycling: 20.0,
};

export class ActivityTracker {
  private gpsEngine: GpsAccuracyEngine;
  private sensorFusion: SensorFusion;
  private locationSub: Location.LocationSubscription | null = null;
  private simInterval: ReturnType<typeof setInterval> | null = null;

  private coords: TrackingPoint[] = [];
  private distanceM = 0;
  private startTime = 0;
  private pausedMs = 0;
  private pauseStart: number | null = null;
  private isPaused = false;
  private motionState: MotionState = { isMoving: true, magnitude: 0, steps: 0, stepsPerMinute: 0, confidence: 0.5 };
  private lastSpeedKmh = 0;
  private speedHistory: number[] = [];
  private onUpdate: TrackingCallback;
  private activityType: ActivityType;
  private weightKg: number;

  constructor(
    activityType: ActivityType,
    onUpdate: TrackingCallback,
    weightKg = 70
  ) {
    this.activityType = activityType;
    this.onUpdate = onUpdate;
    this.weightKg = weightKg;
    this.gpsEngine = new GpsAccuracyEngine(activityType);
    this.sensorFusion = new SensorFusion((state) => {
      this.motionState = state;
    });
  }

  async start() {
    this.startTime = Date.now();
    this.coords = [];
    this.distanceM = 0;
    this.pausedMs = 0;
    this.isPaused = false;
    this.gpsEngine.reset();

    // Start accelerometer + pedometer
    await this.sensorFusion.start(this.activityType);

    if (Platform.OS !== "web") {
      await this._startGps();
    } else {
      this._startSimulation();
    }
  }

  private async _startGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      this._startSimulation();
      return;
    }

    this.locationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0, // receive ALL updates, filter ourselves
        mayShowUserSettingsDialog: true,
      },
      (loc) => {
        if (this.isPaused) return;
        this._handleRawGps(loc);
      }
    );
  }

  private _handleRawGps(loc: Location.LocationObject) {
    const raw = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? 100,
      speed: loc.coords.speed,
      altitude: loc.coords.altitude,
      timestamp: loc.timestamp,
    };

    const filtered = this.gpsEngine.process(raw, this.motionState.isMoving);
    if (!filtered) return;

    this._acceptPoint(filtered);
  }

  private _startSimulation() {
    // Simulate realistic movement for web / no-GPS dev testing
    const speedKmh = SIM_SPEED[this.activityType];
    const speedMs = speedKmh / 3.6;
    const baseLat = 28.6139;
    const baseLon = 77.2090;
    let step = 0;
    const startTs = Date.now();

    this.simInterval = setInterval(() => {
      if (this.isPaused) return;
      step++;
      const ts = Date.now();
      const dtS = 2; // 2-second interval

      // Move north-east in a curve to look realistic
      const angle = (step * 5 * Math.PI) / 180;
      const dist = speedMs * dtS;
      const latDelta = (dist * Math.cos(angle)) / 111320;
      const lonDelta = (dist * Math.sin(angle)) / (111320 * Math.cos((baseLat * Math.PI) / 180));

      const lat = baseLat + step * latDelta;
      const lon = baseLon + step * lonDelta;

      const filtered: FilteredPoint = {
        latitude: lat,
        longitude: lon,
        altitude: 215 + Math.sin(step * 0.1) * 5,
        timestamp: ts,
        accuracy: 5 + Math.random() * 3,
        confidence: 0.92,
        isMoving: true,
      };

      // Update motion state for web
      this.motionState = {
        isMoving: true,
        magnitude: 9.8,
        steps: Math.round(step * (speedKmh < 10 ? 2.5 : 1.8)),
        stepsPerMinute: this.activityType === "cycling" ? 0 : 150,
        confidence: 0.9,
      };

      this._acceptPoint(filtered);
    }, 2000);
  }

  private _acceptPoint(pt: FilteredPoint) {
    const tp: TrackingPoint = {
      latitude: pt.latitude,
      longitude: pt.longitude,
      timestamp: pt.timestamp,
      altitude: pt.altitude,
      accuracy: pt.accuracy,
      confidence: pt.confidence,
    };

    // Compute incremental distance
    if (this.coords.length > 0 && pt.isMoving) {
      const prev = this.coords[this.coords.length - 1];
      const d = haversineM(prev.latitude, prev.longitude, tp.latitude, tp.longitude);
      this.distanceM += d;
    }

    this.coords.push(tp);

    // Speed
    const elapsedS = this._elapsedSeconds();
    const speedKmh = pt.isMoving ? (this.lastSpeedKmh * 0.7 + this._instantSpeed() * 0.3) : 0;
    this.lastSpeedKmh = speedKmh;
    this.speedHistory.push(speedKmh);
    if (this.speedHistory.length > 30) this.speedHistory.shift();

    const avgSpeedKmh =
      this.speedHistory.length > 0
        ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
        : 0;

    const avgPace = avgSpeedKmh > 0 ? 60 / avgSpeedKmh : 0;
    const calories = this._calcCalories(elapsedS);

    this.onUpdate({
      coords: [...this.coords],
      distanceM: this.distanceM,
      currentSpeedKmh: speedKmh,
      avgSpeedKmh,
      avgPaceMinPerKm: avgPace,
      calories,
      steps: this.motionState.steps,
      cadence: this.motionState.stepsPerMinute,
      confidence: pt.confidence,
      isMoving: pt.isMoving,
      elapsedSeconds: elapsedS,
    });
  }

  private _instantSpeed(): number {
    if (this.coords.length < 2) return 0;
    const a = this.coords[this.coords.length - 2];
    const b = this.coords[this.coords.length - 1];
    const dtS = Math.max((b.timestamp - a.timestamp) / 1000, 0.1);
    const distM = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    return (distM / dtS) * 3.6;
  }

  private _elapsedSeconds(): number {
    const pausedExtra = this.pauseStart
      ? Date.now() - this.pauseStart
      : 0;
    return (Date.now() - this.startTime - this.pausedMs - pausedExtra) / 1000;
  }

  private _calcCalories(durationS: number): number {
    const met = MET[this.activityType];
    return Math.round(met * this.weightKg * (durationS / 3600));
  }

  pause() {
    if (this.isPaused) return;
    this.isPaused = true;
    this.pauseStart = Date.now();
  }

  resume() {
    if (!this.isPaused || !this.pauseStart) return;
    this.pausedMs += Date.now() - this.pauseStart;
    this.pauseStart = null;
    this.isPaused = false;
  }

  stop(): {
    coords: TrackingPoint[];
    distanceM: number;
    durationS: number;
    avgSpeedKmh: number;
    avgPaceMinPerKm: number;
    calories: number;
    steps: number;
    confidence: number;
  } {
    this.locationSub?.remove();
    if (this.simInterval) clearInterval(this.simInterval);
    this.sensorFusion.stop();

    const durationS = this._elapsedSeconds();
    const avgSpeedKmh = durationS > 0 ? (this.distanceM / 1000) / (durationS / 3600) : 0;
    const avgPaceMinPerKm = avgSpeedKmh > 0 ? 60 / avgSpeedKmh : 0;
    const calories = this._calcCalories(durationS);
    const confidence = this.coords.length > 0
      ? this.coords.reduce((s, c) => s + c.confidence, 0) / this.coords.length
      : 0;

    return {
      coords: this.coords,
      distanceM: this.distanceM,
      durationS,
      avgSpeedKmh,
      avgPaceMinPerKm,
      calories,
      steps: this.motionState.steps,
      confidence,
    };
  }
}
