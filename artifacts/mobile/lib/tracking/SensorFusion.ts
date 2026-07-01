/**
 * Sensor Fusion Engine
 *
 * Combines data from:
 *   - Accelerometer  (motion detection — is the user actually moving?)
 *   - Pedometer      (step count for walking / running)
 *   - Device speed   (from GPS / watch)
 *
 * Works on native only. Web gets a stub that always returns "moving".
 */

import { Platform } from "react-native";

export interface MotionState {
  isMoving: boolean;
  magnitude: number;          // raw accelerometer magnitude (m/s²)
  steps: number;              // cumulative steps this session
  stepsPerMinute: number;     // cadence
  confidence: number;         // 0–1
}

// Thresholds (m/s²)
const STILL_THRESHOLD = 0.4;       // below this delta = not moving
const MOVING_THRESHOLD = 0.8;      // above this delta = definitely moving
const WINDOW_MS = 800;             // smoothing window

// How many recent samples to keep for variance calculation
const HISTORY_SIZE = 12;

export class SensorFusion {
  private accelSub: ReturnType<typeof setInterval> | null = null;
  private pedometerSub: { remove: () => void } | null = null;

  private magnitudeHistory: number[] = [];
  private motionState: MotionState = {
    isMoving: true, // assume moving until proven otherwise
    magnitude: 0,
    steps: 0,
    stepsPerMinute: 0,
    confidence: 0.5,
  };

  private stepWindowStart: number = Date.now();
  private stepWindowCount = 0;
  private baselineSteps: number | null = null;
  private onUpdate: (state: MotionState) => void;
  private lastAccelTime = 0;

  constructor(onUpdate: (state: MotionState) => void) {
    this.onUpdate = onUpdate;
  }

  async start(activityType: "walking" | "running" | "cycling") {
    if (Platform.OS === "web") {
      // Web stub — always say moving
      this.motionState = { isMoving: true, magnitude: 9.8, steps: 0, stepsPerMinute: 0, confidence: 0.5 };
      this.onUpdate(this.motionState);
      return;
    }

    try {
      const { Accelerometer, Pedometer } = await import("expo-sensors");

      // — Accelerometer —
      Accelerometer.setUpdateInterval(200);
      this.accelSub = setInterval(() => {}, 0) as unknown as ReturnType<typeof setInterval>;

      const accelListener = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        if (now - this.lastAccelTime < 150) return; // throttle
        this.lastAccelTime = now;

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        // Remove gravity component (earth = ~9.81 m/s²)
        const dynamic = Math.abs(magnitude - 9.81);

        this.magnitudeHistory.push(dynamic);
        if (this.magnitudeHistory.length > HISTORY_SIZE) {
          this.magnitudeHistory.shift();
        }

        const avg = this.magnitudeHistory.reduce((a, b) => a + b, 0) / this.magnitudeHistory.length;
        const isMoving = avg > STILL_THRESHOLD;

        const conf = avg < STILL_THRESHOLD
          ? 0.9
          : avg < MOVING_THRESHOLD
          ? 0.6
          : 0.85;

        this.motionState = {
          ...this.motionState,
          isMoving,
          magnitude: avg,
          confidence: conf,
        };
        this.onUpdate(this.motionState);
      });

      // Replace the dummy interval ref with actual cleanup
      clearInterval(this.accelSub as unknown as number);
      this.accelSub = { remove: () => accelListener.remove() } as unknown as ReturnType<typeof setInterval>;

      // — Pedometer (walking / running only) —
      if (activityType !== "cycling") {
        const pedometerAvailable = await Pedometer.isAvailableAsync();
        if (pedometerAvailable) {
          this.stepWindowStart = Date.now();
          this.stepWindowCount = 0;

          this.pedometerSub = Pedometer.watchStepCount((result) => {
            if (this.baselineSteps === null) {
              this.baselineSteps = result.steps;
            }
            const sessionSteps = result.steps - this.baselineSteps;

            // Cadence calculation: steps per minute over rolling 30-sec window
            this.stepWindowCount++;
            const windowSec = (Date.now() - this.stepWindowStart) / 1000;
            const spm = windowSec > 0 ? (this.stepWindowCount / windowSec) * 60 : 0;

            // Reset cadence window every 30s
            if (windowSec > 30) {
              this.stepWindowStart = Date.now();
              this.stepWindowCount = 0;
            }

            this.motionState = {
              ...this.motionState,
              steps: Math.max(0, sessionSteps),
              stepsPerMinute: Math.round(spm),
            };
            this.onUpdate(this.motionState);
          });
        }
      }
    } catch {
      // Sensors unavailable — default to always-moving
      this.motionState = { isMoving: true, magnitude: 9.8, steps: 0, stepsPerMinute: 0, confidence: 0.5 };
    }
  }

  stop() {
    if (this.accelSub) {
      (this.accelSub as unknown as { remove: () => void }).remove?.();
      this.accelSub = null;
    }
    this.pedometerSub?.remove();
    this.pedometerSub = null;
    this.magnitudeHistory = [];
    this.baselineSteps = null;
  }

  getState(): MotionState {
    return this.motionState;
  }
}
