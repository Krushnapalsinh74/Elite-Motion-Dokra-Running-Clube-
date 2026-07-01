/**
 * GPS Accuracy Engine
 *
 * Validates, filters, and scores incoming GPS points.
 *
 * Key behaviours:
 *  - WARMUP: never counts distance until GPS accuracy is good (≤ GOOD_ACCURACY_M).
 *    During warmup the map shows approximate position but distance stays at 0.
 *  - GPS LOCK-IN JUMP: when GPS suddenly improves from weak → strong, the position
 *    can jump tens of metres. We detect this jump and update the reference point
 *    WITHOUT counting that distance — the user didn't walk it, GPS just corrected.
 *  - KALMAN filter smooths ongoing noise once GPS is locked.
 */

import { GpsKalmanFilter } from "./KalmanFilter";

export interface RawGpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}

export interface FilteredPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  accuracy: number;
  confidence: number;
  isMoving: boolean;
}

export type ActivityType = "walking" | "running" | "cycling";

const CONFIG = {
  walking:  { maxAccuracyM: 25, maxSpeedKmh: 12,  minSpeedKmh: 0.3, minDistanceM: 1.0 },
  running:  { maxAccuracyM: 25, maxSpeedKmh: 40,  minSpeedKmh: 0.5, minDistanceM: 1.5 },
  cycling:  { maxAccuracyM: 40, maxSpeedKmh: 90,  minSpeedKmh: 0.8, minDistanceM: 2.0 },
};

// Accuracy threshold to consider GPS "locked in" and safe to count distance
const GOOD_ACCURACY_M = 20;

// While waiting for good GPS, still accept points up to this accuracy for map display
const WARMUP_MAX_ACCURACY_M = 120;

// Max points to show in warmup before forcing exit (safety valve — ~15 seconds)
const MAX_WARMUP_POINTS = 15;

// GPS lock-in jump: if accuracy improves by this factor AND jump is large → suppress distance
const LOCK_JUMP_ACCURACY_FACTOR = 2.0;   // accuracy got ≥2× better in one step
const LOCK_JUMP_MIN_DIST_M = 15;         // AND position jumped ≥15 m

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class GpsAccuracyEngine {
  private kalman = new GpsKalmanFilter();
  private lastAccepted: FilteredPoint | null = null;
  private recentSpeeds: number[] = [];
  private consecutiveRejections = 0;
  private acceptedCount = 0;
  private warmupComplete = false;
  private cfg: (typeof CONFIG)["walking"];

  constructor(private activityType: ActivityType) {
    this.cfg = CONFIG[activityType];
  }

  reset() {
    this.kalman.reset();
    this.lastAccepted = null;
    this.recentSpeeds = [];
    this.consecutiveRejections = 0;
    this.acceptedCount = 0;
    this.warmupComplete = false;
  }

  process(raw: RawGpsPoint, accelerometerMoving: boolean): FilteredPoint | null {
    // ── Warmup phase ────────────────────────────────────────────────────────
    // Stay in warmup until accuracy reaches GOOD_ACCURACY_M OR we hit the
    // MAX_WARMUP_POINTS safety valve. During warmup, accept weak signals for
    // map display but NEVER count any distance.
    if (!this.warmupComplete) {
      if (raw.accuracy <= GOOD_ACCURACY_M || this.acceptedCount >= MAX_WARMUP_POINTS) {
        this.warmupComplete = true; // GPS is now locked — start counting from here
      } else {
        // Still warming up — accept point for map display only (no distance)
        if (raw.accuracy > WARMUP_MAX_ACCURACY_M) {
          return null; // too weak even for display
        }
        const smoothed = this.kalman.process(raw.latitude, raw.longitude, raw.accuracy, raw.timestamp);
        const pt: FilteredPoint = {
          latitude: smoothed.lat,
          longitude: smoothed.lon,
          altitude: raw.altitude,
          timestamp: raw.timestamp,
          accuracy: raw.accuracy,
          confidence: Math.max(0.1, 1 - raw.accuracy / WARMUP_MAX_ACCURACY_M) * 0.5,
          isMoving: false, // NEVER count distance during warmup
        };
        // Always update reference so first real-distance point is measured from correct baseline
        this.lastAccepted = pt;
        this.acceptedCount++;
        return pt;
      }
    }

    // ── Post-warmup: normal accuracy gate ────────────────────────────────────
    if (raw.accuracy > this.cfg.maxAccuracyM) {
      this.consecutiveRejections++;
      return null;
    }

    // Kalman smooth
    const smoothed = this.kalman.process(raw.latitude, raw.longitude, raw.accuracy, raw.timestamp);
    const pt: FilteredPoint = {
      latitude: smoothed.lat,
      longitude: smoothed.lon,
      altitude: raw.altitude,
      timestamp: raw.timestamp,
      accuracy: raw.accuracy,
      confidence: 0,
      isMoving: false,
    };

    // First real post-warmup point — just set the baseline, no distance yet
    if (!this.lastAccepted) {
      pt.confidence = this.computeConfidence(raw, null, null);
      pt.isMoving = false;
      this.lastAccepted = pt;
      this.acceptedCount++;
      this.consecutiveRejections = 0;
      return pt;
    }

    const dtS = Math.max((raw.timestamp - this.lastAccepted.timestamp) / 1000, 0.1);
    const distM = haversineM(this.lastAccepted.latitude, this.lastAccepted.longitude, pt.latitude, pt.longitude);

    // ── GPS lock-in jump detection ────────────────────────────────────────────
    // If the previous accepted point had much worse accuracy than this one AND
    // position jumped significantly, it's GPS correcting itself — not movement.
    // Update the position reference but suppress distance counting.
    const prevAccuracy = this.lastAccepted.accuracy;
    const accuracyImprovedBy = prevAccuracy / Math.max(raw.accuracy, 1);
    const isLockJump = accuracyImprovedBy >= LOCK_JUMP_ACCURACY_FACTOR && distM >= LOCK_JUMP_MIN_DIST_M;

    if (isLockJump) {
      // Silently rebase — position corrected, but no distance counted
      pt.confidence = this.computeConfidence(raw, null, null);
      pt.isMoving = false;
      this.lastAccepted = pt;
      this.acceptedCount++;
      this.consecutiveRejections = 0;
      return pt;
    }

    // ── Gate: minimum distance ────────────────────────────────────────────────
    if (distM < this.cfg.minDistanceM) {
      pt.confidence = this.computeConfidence(raw, distM, 0);
      pt.isMoving = false;
      this.acceptedCount++;
      return pt;
    }

    // ── Gate: speed sanity check ─────────────────────────────────────────────
    const derivedSpeedKmh = (distM / dtS) * 3.6;
    if (derivedSpeedKmh > this.cfg.maxSpeedKmh) {
      this.consecutiveRejections++;
      if (this.consecutiveRejections > 5) {
        this.kalman.reset();
        this.consecutiveRejections = 0;
        this.lastAccepted = pt;
        this.acceptedCount++;
      }
      return null;
    }

    // ── Gate: accelerometer cross-check (walking/running only) ───────────────
    if (!accelerometerMoving && this.activityType !== "cycling") {
      if (derivedSpeedKmh < this.cfg.minSpeedKmh) {
        pt.isMoving = false;
        pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
        this.acceptedCount++;
        return pt;
      }
    }

    // ── Valid movement point ─────────────────────────────────────────────────
    this.consecutiveRejections = 0;
    this.recentSpeeds.push(derivedSpeedKmh);
    if (this.recentSpeeds.length > 10) this.recentSpeeds.shift();
    pt.isMoving = distM > this.cfg.minDistanceM;
    pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
    this.lastAccepted = pt;
    this.acceptedCount++;
    return pt;
  }

  /** Is GPS currently in the warm-up phase? */
  get isWarmingUp(): boolean {
    return !this.warmupComplete;
  }

  private computeConfidence(raw: RawGpsPoint, distM: number | null, speedKmh: number | null): number {
    if (!this.warmupComplete) {
      return Math.round(Math.min(0.55, Math.max(0.1, 1 - raw.accuracy / WARMUP_MAX_ACCURACY_M) * 0.6) * 100) / 100;
    }
    const accScore = Math.max(0, 1 - (raw.accuracy - 5) / 30);
    let speedScore = 0.8;
    if (speedKmh !== null && speedKmh > 0) {
      const ratio = speedKmh / this.cfg.maxSpeedKmh;
      speedScore = ratio < 0.8 ? 1.0 : Math.max(0.2, 1.0 - (ratio - 0.8) * 5);
    }
    let consistencyScore = 0.8;
    if (this.recentSpeeds.length >= 3) {
      const avg = this.recentSpeeds.reduce((a, b) => a + b, 0) / this.recentSpeeds.length;
      const variance = this.recentSpeeds.reduce((s, v) => s + (v - avg) ** 2, 0) / this.recentSpeeds.length;
      consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / 10);
    }
    return Math.round((accScore * 0.5 + speedScore * 0.3 + consistencyScore * 0.2) * 100) / 100;
  }
}
