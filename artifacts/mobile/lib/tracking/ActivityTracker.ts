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
 * - Distance-based step estimation fallback when pedometer unavailable
 * - Accurate step counting via pedometerActive flag
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

// Steps per meter by activity type (for distance-based fallback)
const STEPS_PER_METER: Record<ActivityType, number> = {
  walking: 1.4,   // avg stride ~0.71m
  running: 1.7,   // avg stride ~0.59m
  cycling: 0,
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
  private motionState: MotionState = {
    isMoving: true,
    magnitude: 0,
    steps: 0,
    stepsPerMinute: 0,
    confidence: 0.5,
    pedometerActive: false,
  };
  private smoothedSpeedKmh = 0;
  private onUpdate: TrackingCallback;
  private activityType: ActivityType;
  private weightKg: number;
  private isSimulating = false;
  private gpsStatus: TrackingUpdate["gpsStatus"] = "acquiring";

  // Simulation state
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

    // Timer starts FIRST — never blocked by permissions or sensor init
    this.timerInterval = setInterval(() => {
      if (!this.isPaused) this._emitUpdate();
    }, 1000);

    // Sensors and GPS start in parallel — neither blocks the other
    await Promise.all([
      this.sensorFusion.start(this.activityType).catch(() => {}),
      this._startGps().catch(() => { this._startSimulation(); }),
    ]);
  }

  /**
   * Called from the UI after the user grants location permission.
   * Stops simulation (if running) and starts real GPS.
   */
  async enableGps(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return false;

      // Stop simulation if running
      if (this.simInterval) {
        clearInterval(this.simInterval);
        this.simInterval = null;
      }
      this.isSimulating = false;
      this.gpsStatus = "acquiring";
      this.gpsEngine.reset();

      await this._watchGps();
      return true;
    } catch {
      return false;
    }
  }

  private async _startGps() {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        // Already granted — go straight to watching
        await this._watchGps();
        return;
      }

      // Not yet granted — request it
      const result = await Location.requestForegroundPermissionsAsync();
      if (result.status === "granted") {
        await this._watchGps();
      } else {
        this._startSimulation();
      }
    } catch {
      this._startSimulation();
    }
  }

  private async _watchGps() {
    // Remove existing subscription if any
    try { this.locationSub?.remove(); } catch {}
    this.locationSub = null;

    // Minimum speed (m/s) before we consider the device as actually moving.
    // Hardware GPS speed is much more reliable than position-derived speed.
    const MIN_MOVING_MS: Record<ActivityType, number> = {
      walking: 0.3,   // ~1 km/h
      running: 0.4,   // ~1.5 km/h
      cycling: 0.8,   // ~3 km/h — bikes need more speed before counting
    };
    const minMs = MIN_MOVING_MS[this.activityType];

    this.locationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
        mayShowUserSettingsDialog: true,
      },
      (loc) => {
        if (this.isPaused) return;

        const hardwareSpeedMs =
          loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null;
        const hardwareMoving = hardwareSpeedMs != null ? hardwareSpeedMs >= minMs : null;

        const raw = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? 50,
          speed: hardwareSpeedMs,
          altitude: loc.coords.altitude,
          timestamp: loc.timestamp,
        };

        if (raw.accuracy <= 15) {
          this.gpsStatus = "locked";
        } else if (raw.accuracy <= 40) {
          this.gpsStatus = "acquiring";
        } else {
          this.gpsStatus = "poor";
        }

        const filtered = this.gpsEngine.process(raw, this.motionState.isMoving);
        if (!filtered) return;

        // Hardware speed is ground truth — override position-derived isMoving
        if (hardwareMoving === false) {
          filtered.isMoving = false;
        }

        if (hardwareSpeedMs != null) {
          if (hardwareMoving) {
            // Actually moving — update EMA with real speed
            const gpsSpeedKmh = hardwareSpeedMs * 3.6;
            const maxSpeed = this.activityType === "cycling" ? 90 : 40;
            const clipped = Math.min(gpsSpeedKmh, maxSpeed);
            this.smoothedSpeedKmh =
              this.smoothedSpeedKmh * (1 - SPEED_EMA_ALPHA) + clipped * SPEED_EMA_ALPHA;
          } else {
            // Stationary — decay speed to zero quickly
            this.smoothedSpeedKmh = this.smoothedSpeedKmh * 0.5;
            if (this.smoothedSpeedKmh < 0.1) this.smoothedSpeedKmh = 0;
          }
        }

        this._acceptPoint(filtered);
      }
    );
  }

  private _startSimulation() {
    this.isSimulating = true;
    this.gpsStatus = "simulated";
    const speedKmh = SIM_SPEED[this.activityType];
    const speedMs = speedKmh / 3.6;

    this.simLat = 28.6139;
    this.simLon = 77.2090;
    this.simHeading = 0;

    let simStep = 0;
    let simTotalSteps = 0;

    this.simInterval = setInterval(() => {
      if (this.isPaused) return;
      simStep++;

      const ts = Date.now();
      const dist = speedMs * 2; // 2 seconds of travel
      this.simHeading = (this.simHeading + 7) % 360;

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

      // Simulate realistic step accumulation per 2-second tick
      const stepsPerTick = this.activityType === "cycling"
        ? 0
        : Math.round(dist * STEPS_PER_METER[this.activityType] * (0.9 + Math.random() * 0.2));
      simTotalSteps += stepsPerTick;

      const cadence = this.activityType === "cycling" ? 0 : Math.round(
        (stepsPerTick / 2) * 30  // steps per 2s → steps per min
      );

      this.motionState = {
        isMoving: true,
        magnitude: 9.8,
        steps: simTotalSteps,
        stepsPerMinute: cadence,
        confidence: 0.9,
        pedometerActive: true,
      };

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

        if (!this.isSimulating) {
          const dtS = Math.max((tp.timestamp - prev.timestamp) / 1000, 0.1);
          const derivedKmh = Math.min((d / dtS) * 3.6, this.activityType === "cycling" ? 90 : 40);
          if (this.smoothedSpeedKmh === 0) {
            this.smoothedSpeedKmh = derivedKmh;
          } else {
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

  /**
   * Compute steps in priority order:
   *  1. Hardware pedometer chip (most accurate, dedicated silicon)
   *  2. Accelerometer peak detection (works indoors with no GPS)
   *  3. Distance-based estimate (last resort — inaccurate indoors)
   */
  private _computeSteps(): number {
    if (this.activityType === "cycling") return 0;

    // motionState.steps is hw steps when pedometerActive=true,
    // or accel-detected steps when pedometerActive=false.
    // Either is more accurate than distance-based.
    if (this.motionState.steps > 0) {
      return this.motionState.steps;
    }

    // Last resort: distance-based estimate (only useful with GPS outdoors)
    return Math.round(this.distanceM * STEPS_PER_METER[this.activityType]);
  }

  private _emitUpdate(confidence?: number, isMoving?: boolean) {
    const elapsedS = this._elapsedSeconds();
    const conf = confidence ?? (this.coords.length > 0 ? this.coords[this.coords.length - 1].confidence : 0);
    const moving = isMoving ?? this.motionState.isMoving;

    const trueAvgKmh =
      elapsedS > 0 ? (this.distanceM / 1000) / (elapsedS / 3600) : 0;

    this.onUpdate({
      coords: [...this.coords],
      distanceM: this.distanceM,
      currentSpeedKmh: this.smoothedSpeedKmh,
      avgSpeedKmh: trueAvgKmh,
      avgPaceMinPerKm: trueAvgKmh > 0 ? 60 / trueAvgKmh : 0,
      calories: this._calcCalories(elapsedS),
      steps: this._computeSteps(),
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
      steps: this._computeSteps(),
      confidence,
      isSimulated: this.isSimulating,
    };
  }
}
