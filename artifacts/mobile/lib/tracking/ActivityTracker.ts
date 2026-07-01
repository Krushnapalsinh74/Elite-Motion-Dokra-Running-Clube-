/**
 * ActivityTracker — top-level coordinator.
 *
 * Fixes:
 * - Sends timer updates every second regardless of GPS
 * - Proper GPS permission handling
 * - Better initial state (not stuck at 0%)
 * - Uses device GPS speed (more accurate than delta-based)
 * - EMA speed smoothing (no spikes)
 * - Fixed simulation path (consistent distance per tick)
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

// EMA alpha for speed smoothing — higher = more responsive, lower = smoother
const SPEED_EMA_ALPHA = 0.25;

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
  private smoothedSpeedKmh = 0;
  private onUpdate: TrackingCallback;
  private activityType: ActivityType;
  private weightKg: number;
  private isSimulating = false;
  private gpsStatus: TrackingUpdate["gpsStatus"] = "acquiring";

  // Simulation state — maintain real current position
  private simLat = 28.6139;
  private simLon = 77.2090;
  private simHeading = 0;

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
    this.smoothedSpeedKmh = 0;
    this.gpsEngine.reset();
    this.gpsStatus = "acquiring";

    await this.sensorFusion.start(this.activityType);

    // Independent 1-second timer so elapsed always updates
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) this._emitUpdate();
    }, 1000);

    await this._startGps();
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
            // Use device GPS speed when available — more accurate than delta computation
            speed: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
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

          // Feed device GPS speed into smoother if available
          if (raw.speed != null) {
            const gpsSpeedKmh = raw.speed * 3.6;
            const maxSpeed = this.activityType === "cycling" ? 90 : 40;
            const clipped = Math.min(gpsSpeedKmh, maxSpeed);
            this.smoothedSpeedKmh =
              this.smoothedSpeedKmh * (1 - SPEED_EMA_ALPHA) + clipped * SPEED_EMA_ALPHA;
          }

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

    // Start at a realistic location
    this.simLat = 28.6139;
    this.simLon = 77.2090;
    this.simHeading = 0;

    let simStep = 0;

    this.simInterval = setInterval(() => {
      if (this.isPaused) return;
      simStep++;

      const ts = Date.now();
      // Advance position 2 seconds of travel at our speed; gently curve heading
      const dist = speedMs * 2;
      this.simHeading = (this.simHeading + 7) % 360; // gentle curve

      const headingRad = (this.simHeading * Math.PI) / 180;
      this.simLat += (dist * Math.cos(headingRad)) / 111320;
      this.simLon +=
        (dist * Math.sin(headingRad)) /
        (111320 * Math.cos((this.simLat * Math.PI) / 180));

      const filtered: FilteredPoint = {
        latitude: this.simLat,
        longitude: this.simLon,
        altitude: 215,
        timestamp: ts,
        accuracy: 5,
        confidence: 0.95,
        isMoving: true,
      };

      this.motionState = {
        isMoving: true,
        magnitude: 9.8,
        steps: Math.round(simStep * (this.activityType === "cycling" ? 0 : 2.4)),
        stepsPerMinute: this.activityType === "cycling" ? 0 : 155,
        confidence: 0.9,
      };

      // Simulate smooth speed with slight noise
      const noiseKmh = (Math.random() - 0.5) * 0.4;
      const targetSpeed = speedKmh + noiseKmh;
      this.smoothedSpeedKmh =
        this.smoothedSpeedKmh * (1 - SPEED_EMA_ALPHA) + targetSpeed * SPEED_EMA_ALPHA;

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
      if (d < 500) {
        this.distanceM += d;
        // Update speed from position delta only if we don't have a GPS speed feed
        if (!this.isSimulating) {
          const dtS = Math.max((tp.timestamp - prev.timestamp) / 1000, 0.1);
          const derivedKmh = Math.min((d / dtS) * 3.6, this.activityType === "cycling" ? 90 : 40);
          // Only use derived speed if GPS speed wasn't provided (smoothedSpeedKmh already updated for GPS devices)
          // We detect "GPS speed not available" if smoothedSpeedKmh is 0 and coords just started
          if (this.smoothedSpeedKmh === 0) {
            this.smoothedSpeedKmh = derivedKmh;
          } else {
            // Secondary EMA update from position delta (blended, lower weight)
            this.smoothedSpeedKmh =
              this.smoothedSpeedKmh * (1 - SPEED_EMA_ALPHA * 0.5) +
              derivedKmh * (SPEED_EMA_ALPHA * 0.5);
          }
        }
      }
    }
    this.coords.push(tp);
    this._emitUpdate(pt.confidence, pt.isMoving);
  }

  private _emitUpdate(confidence?: number, isMoving?: boolean) {
    const elapsedS = this._elapsedSeconds();
    const conf = confidence ?? (this.coords.length > 0 ? this.coords[this.coords.length - 1].confidence : 0);
    const moving = isMoving ?? this.motionState.isMoving;

    // True average speed = total distance / total time (most accurate for pace/summary)
    const trueAvgKmh =
      elapsedS > 0 ? (this.distanceM / 1000) / (elapsedS / 3600) : 0;

    this.onUpdate({
      coords: [...this.coords],
      distanceM: this.distanceM,
      currentSpeedKmh: this.smoothedSpeedKmh,      // EMA smoothed — no spikes
      avgSpeedKmh: trueAvgKmh,                      // true average over session
      avgPaceMinPerKm: trueAvgKmh > 0 ? 60 / trueAvgKmh : 0,
      calories: this._calcCalories(elapsedS),
      steps: this.motionState.steps,
      cadence: this.motionState.stepsPerMinute,
      confidence: conf,
      isMoving: moving,
      elapsedSeconds: elapsedS,
      gpsStatus: this.gpsStatus,
    });
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
