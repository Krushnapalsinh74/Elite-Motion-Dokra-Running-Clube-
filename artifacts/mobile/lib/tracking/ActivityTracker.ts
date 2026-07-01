/**
 * ActivityTracker — top-level coordinator.
 *
 * Fixes:
 * - Sends timer updates every second regardless of GPS
 * - Proper GPS permission handling
 * - Better initial state (not stuck at 0%)
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
  gpsStatus: "acquiring" | "locked" | "poor" | "simulated";
}

export type TrackingCallback = (update: TrackingUpdate) => void;

const MET: Record<ActivityType, number> = {
  walking: 3.8,
  running: 9.8,
  cycling: 7.5,
};

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
  private timerInterval: ReturnType<typeof setInterval> | null = null;

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
  private isSimulating = false;
  private gpsStatus: TrackingUpdate["gpsStatus"] = "acquiring";
  private lastUpdateTime = 0;

  constructor(activityType: ActivityType, onUpdate: TrackingCallback, weightKg = 70) {
    this.activityType = activityType;
    this.onUpdate = onUpdate;
    this.weightKg = weightKg;
    this.gpsEngine = new GpsAccuracyEngine(activityType);
    this.sensorFusion = new SensorFusion((state) => { this.motionState = state; });
  }

  async start() {
    this.startTime = Date.now();
    this.coords = [];
    this.distanceM = 0;
    this.pausedMs = 0;
    this.isPaused = false;
    this.gpsEngine.reset();
    this.gpsStatus = "acquiring";

    await this.sensorFusion.start(this.activityType);

    // Independent 1-second timer so elapsed always updates
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) this._emitUpdate();
    }, 1000);

    if (Platform.OS !== "web") {
      await this._startGps();
    } else {
      this._startSimulation();
    }
  }

  private async _startGps() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        this._startSimulation();
        return;
      }

      this.locationSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (this.isPaused) return;
          const raw = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? 50,
            speed: loc.coords.speed,
            altitude: loc.coords.altitude,
            timestamp: loc.timestamp,
          };

          // Update GPS status based on accuracy
          if (raw.accuracy <= 15) {
            this.gpsStatus = "locked";
          } else if (raw.accuracy <= 40) {
            this.gpsStatus = "acquiring";
          } else {
            this.gpsStatus = "poor";
          }

          const filtered = this.gpsEngine.process(raw, this.motionState.isMoving);
          if (!filtered) return;
          this._acceptPoint(filtered);
        }
      );
    } catch {
      this._startSimulation();
    }
  }

  private _startSimulation() {
    this.isSimulating = true;
    this.gpsStatus = "simulated";
    const speedKmh = SIM_SPEED[this.activityType];
    const speedMs = speedKmh / 3.6;
    const baseLat = 28.6139;
    const baseLon = 77.2090;
    let step = 0;

    this.simInterval = setInterval(() => {
      if (this.isPaused) return;
      step++;
      const ts = Date.now();
      const angle = (step * 5 * Math.PI) / 180;
      const dist = speedMs * 2;
      const latDelta = (dist * Math.cos(angle)) / 111320;
      const lonDelta = (dist * Math.sin(angle)) / (111320 * Math.cos((baseLat * Math.PI) / 180));

      const filtered: FilteredPoint = {
        latitude: baseLat + step * latDelta,
        longitude: baseLon + step * lonDelta,
        altitude: 215,
        timestamp: ts,
        accuracy: 5,
        confidence: 0.92,
        isMoving: true,
      };
      this.motionState = {
        isMoving: true,
        magnitude: 9.8,
        steps: Math.round(step * 2.4),
        stepsPerMinute: this.activityType === "cycling" ? 0 : 155,
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

    if (this.coords.length > 0 && pt.isMoving) {
      const prev = this.coords[this.coords.length - 1];
      const d = haversineM(prev.latitude, prev.longitude, tp.latitude, tp.longitude);
      if (d < 500) this.distanceM += d; // ignore GPS jumps > 500m
    }
    this.coords.push(tp);
    this._emitUpdate(pt.confidence, pt.isMoving);
  }

  private _emitUpdate(confidence?: number, isMoving?: boolean) {
    const elapsedS = this._elapsedSeconds();
    const conf = confidence ?? (this.coords.length > 0 ? this.coords[this.coords.length - 1].confidence : 0);
    const moving = isMoving ?? this.motionState.isMoving;
    const speedKmh = this._instantSpeed();
    this.speedHistory.push(speedKmh);
    if (this.speedHistory.length > 30) this.speedHistory.shift();

    const avgSpeed = this.speedHistory.length > 0
      ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
      : 0;

    this.onUpdate({
      coords: [...this.coords],
      distanceM: this.distanceM,
      currentSpeedKmh: speedKmh,
      avgSpeedKmh: avgSpeed,
      avgPaceMinPerKm: avgSpeed > 0 ? 60 / avgSpeed : 0,
      calories: this._calcCalories(elapsedS),
      steps: this.motionState.steps,
      cadence: this.motionState.stepsPerMinute,
      confidence: conf,
      isMoving: moving,
      elapsedSeconds: elapsedS,
      gpsStatus: this.gpsStatus,
    });
  }

  private _instantSpeed(): number {
    if (this.coords.length < 2) return 0;
    const a = this.coords[this.coords.length - 2];
    const b = this.coords[this.coords.length - 1];
    const dtS = Math.max((b.timestamp - a.timestamp) / 1000, 0.1);
    const distM = haversineM(a.latitude, a.longitude, b.latitude, b.longitude);
    return Math.min((distM / dtS) * 3.6, this.activityType === "cycling" ? 90 : 40);
  }

  private _elapsedSeconds(): number {
    const pausedExtra = this.pauseStart ? Date.now() - this.pauseStart : 0;
    return Math.max(0, (Date.now() - this.startTime - this.pausedMs - pausedExtra) / 1000);
  }

  private _calcCalories(durationS: number): number {
    return Math.round(MET[this.activityType] * this.weightKg * (durationS / 3600));
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

  stop() {
    try { this.locationSub?.remove(); } catch {}
    if (this.simInterval) clearInterval(this.simInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.sensorFusion.stop();

    const durationS = this._elapsedSeconds();
    const avgSpeedKmh = durationS > 0 ? (this.distanceM / 1000) / (durationS / 3600) : 0;
    const avgPaceMinPerKm = avgSpeedKmh > 0 ? 60 / avgSpeedKmh : 0;
    const confidence = this.coords.length > 0
      ? this.coords.reduce((s, c) => s + c.confidence, 0) / this.coords.length
      : 0;

    return {
      coords: this.coords,
      distanceM: this.distanceM,
      durationS,
      avgSpeedKmh,
      avgPaceMinPerKm,
      calories: this._calcCalories(durationS),
      steps: this.motionState.steps,
      confidence,
      isSimulated: this.isSimulating,
    };
  }
}
