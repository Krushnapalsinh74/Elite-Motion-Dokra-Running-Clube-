/**
 * GPS Accuracy Engine
 *
 * Validates, filters, and scores incoming GPS points.
 * Includes a warm-up period (first 5 accepted points) where the
 * accuracy gate is relaxed to avoid "0% GPS" at startup.
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
  walking:  { maxAccuracyM: 25, maxSpeedKmh: 12, minSpeedKmh: 0.3, minDistanceM: 1.0 },
  running:  { maxAccuracyM: 25, maxSpeedKmh: 40, minSpeedKmh: 0.5, minDistanceM: 1.5 },
  cycling:  { maxAccuracyM: 40, maxSpeedKmh: 90, minSpeedKmh: 0.8, minDistanceM: 2.0 },
};

// During warm-up, we accept a much wider accuracy gate
const WARMUP_MAX_ACCURACY = 100;
const WARMUP_POINTS = 3;

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
  }

  process(raw: RawGpsPoint, accelerometerMoving: boolean): FilteredPoint | null {
    const isWarmup = this.acceptedCount < WARMUP_POINTS;
    const maxAccuracy = isWarmup ? WARMUP_MAX_ACCURACY : this.cfg.maxAccuracyM;

    // Gate 1: Accuracy
    if (raw.accuracy > maxAccuracy) {
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

    // First accepted point
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

    // Gate 2: Minimum distance (not during warm-up)
    if (!isWarmup && distM < this.cfg.minDistanceM) {
      pt.confidence = this.computeConfidence(raw, distM, 0);
      pt.isMoving = false;
      this.acceptedCount++;
      return pt;
    }

    // Gate 3: Speed validation
    const derivedSpeedKmh = (distM / dtS) * 3.6;
    if (!isWarmup && derivedSpeedKmh > this.cfg.maxSpeedKmh) {
      this.consecutiveRejections++;
      if (this.consecutiveRejections > 5) {
        this.kalman.reset();
        this.consecutiveRejections = 0;
        this.lastAccepted = pt;
        this.acceptedCount++;
      }
      return null;
    }

    // Gate 4: Accelerometer cross-check (only for walking/running when not moving)
    if (!isWarmup && !accelerometerMoving && this.activityType !== "cycling") {
      if (derivedSpeedKmh < this.cfg.minSpeedKmh) {
        pt.isMoving = false;
        pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
        this.acceptedCount++;
        return pt;
      }
    }

    this.consecutiveRejections = 0;
    this.recentSpeeds.push(derivedSpeedKmh);
    if (this.recentSpeeds.length > 10) this.recentSpeeds.shift();
    pt.isMoving = distM > (isWarmup ? 0.5 : this.cfg.minDistanceM);
    pt.confidence = this.computeConfidence(raw, distM, derivedSpeedKmh);
    this.lastAccepted = pt;
    this.acceptedCount++;
    return pt;
  }

  private computeConfidence(raw: RawGpsPoint, distM: number | null, speedKmh: number | null): number {
    // During warm-up, show a meaningful but modest confidence
    if (this.acceptedCount < WARMUP_POINTS) {
      const accScore = Math.max(0.1, 1 - (raw.accuracy - 5) / 95);
      return Math.round(Math.min(0.6, accScore) * 100) / 100;
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
