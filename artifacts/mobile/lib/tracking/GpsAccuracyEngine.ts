/**
 * GPS Accuracy Engine
 *
 * Validates, filters, and scores incoming GPS points before they are
 * accepted into the route. Implements:
 *   - Accuracy threshold gating
 *   - Per-activity max-speed validation
 *   - Outlier / jump detection
 *   - Distance threshold (minimum movement)
 *   - Confidence scoring (0–1)
 */

import { GpsKalmanFilter } from "./KalmanFilter";

export interface RawGpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number; // metres, lower is better
  speed: number | null; // m/s from device, null if unavailable
  altitude: number | null;
  timestamp: number; // ms
}

export interface FilteredPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  accuracy: number;
  confidence: number; // 0–1
  isMoving: boolean;
}

export type ActivityType = "walking" | "running" | "cycling";

// Activity-specific tuning constants
const CONFIG = {
  walking: {
    maxAccuracyM: 20,          // reject points worse than this
    maxSpeedKmh: 12,           // max plausible walking speed
    minSpeedKmh: 0.3,          // below this = standing still
    minDistanceM: 1.5,         // minimum new distance to accept
    minMovementMs: 2000,       // must have moved within this window
  },
  running: {
    maxAccuracyM: 20,
    maxSpeedKmh: 35,
    minSpeedKmh: 0.5,
    minDistanceM: 2.0,
    minMovementMs: 2000,
  },
  cycling: {
    maxAccuracyM: 35,
    maxSpeedKmh: 90,
    minSpeedKmh: 0.8,
    minDistanceM: 3.0,
    minMovementMs: 3000,
  },
};

/**
 * Haversine distance between two points in metres.
 */
export function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class GpsAccuracyEngine {
  private kalman = new GpsKalmanFilter();
  private lastAccepted: FilteredPoint | null = null;
  private cfg: typeof CONFIG["walking"];
  private recentSpeeds: number[] = [];
  private consecutiveRejections = 0;

  constructor(private activityType: ActivityType) {
    this.cfg = CONFIG[activityType];
  }

  reset() {
    this.kalman.reset();
    this.lastAccepted = null;
    this.recentSpeeds = [];
    this.consecutiveRejections = 0;
  }

  /**
   * Process a raw GPS point. Returns a FilteredPoint if accepted, null if rejected.
   */
  process(raw: RawGpsPoint, accelerometerMoving: boolean): FilteredPoint | null {
    // === Gate 1: Accuracy threshold ===
    if (raw.accuracy > this.cfg.maxAccuracyM) {
      this.consecutiveRejections++;
      return null;
    }

    // === Kalman smoothing ===
    const smoothed = this.kalman.process(
      raw.latitude,
      raw.longitude,
      raw.accuracy,
      raw.timestamp
    );

    const pt: FilteredPoint = {
      latitude: smoothed.lat,
      longitude: smoothed.lon,
      altitude: raw.altitude,
      timestamp: raw.timestamp,
      accuracy: raw.accuracy,
      confidence: 0,
      isMoving: false,
    };

    if (!this.lastAccepted) {
      // First point – always accept
      pt.confidence = this.computeConfidence(raw, null, null);
      pt.isMoving = false;
      this.lastAccepted = pt;
      this.consecutiveRejections = 0;
      return pt;
    }

    const dtMs = raw.timestamp - this.lastAccepted.timestamp;
    const dtS = Math.max(dtMs / 1000, 0.1);
    const distM = haversineM(
      this.lastAccepted.latitude, this.lastAccepted.longitude,
      pt.latitude, pt.longitude
    );

    // === Gate 2: Minimum distance ===
    if (distM < this.cfg.minDistanceM) {
      // Still count as valid position, just not moving
      pt.confidence = this.computeConfidence(raw, distM, 0);
      pt.isMoving = false;
      // Don't update lastAccepted — keep waiting for real movement
      return pt;
    }

    // === Gate 3: Speed validation ===
    const derivedSpeedKmh = (distM / dtS) * 3.6;

    if (derivedSpeedKmh > this.cfg.maxSpeedKmh) {
      // GPS jump / teleport detected — reject
      this.consecutiveRejections++;
      // If we've been rejecting for a long time, reset Kalman and accept
      if (this.consecutiveRejections > 5) {
        this.kalman.reset();
        this.consecutiveRejections = 0;
        this.lastAccepted = pt;
      }
      return null;
    }

    // === Gate 4: Accelerometer cross-check ===
    // For walking/running, require accelerometer to confirm motion
    if (!accelerometerMoving && this.activityType !== "cycling") {
      if (derivedSpeedKmh < this.cfg.minSpeedKmh) {
        pt.isMoving = false;
        pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
        return pt;
      }
    }

    // === Accepted and moving ===
    this.consecutiveRejections = 0;
    this.recentSpeeds.push(derivedSpeedKmh);
    if (this.recentSpeeds.length > 10) this.recentSpeeds.shift();

    pt.isMoving = true;
    pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
    this.lastAccepted = pt;
    return pt;
  }

  private computeConfidence(
    raw: RawGpsPoint,
    distM: number | null,
    speedKmh: number | null
  ): number {
    // Accuracy component: 20m=0.5, 5m=1.0
    const accScore = Math.max(0, 1 - (raw.accuracy - 5) / 30);

    // Speed plausibility (only when moving)
    let speedScore = 0.8;
    if (speedKmh !== null && speedKmh > 0) {
      const ratio = speedKmh / this.cfg.maxSpeedKmh;
      speedScore = ratio < 0.8 ? 1.0 : Math.max(0.2, 1.0 - (ratio - 0.8) * 5);
    }

    // Recent consistency
    let consistencyScore = 0.8;
    if (this.recentSpeeds.length >= 3) {
      const avg = this.recentSpeeds.reduce((a, b) => a + b, 0) / this.recentSpeeds.length;
      const variance = this.recentSpeeds.reduce((s, v) => s + (v - avg) ** 2, 0) / this.recentSpeeds.length;
      consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / 10);
    }

    return Math.round(
      (accScore * 0.5 + speedScore * 0.3 + consistencyScore * 0.2) * 100
    ) / 100;
  }

  get averageConfidence(): number {
    if (!this.lastAccepted) return 0;
    return this.lastAccepted.confidence;
  }
}
