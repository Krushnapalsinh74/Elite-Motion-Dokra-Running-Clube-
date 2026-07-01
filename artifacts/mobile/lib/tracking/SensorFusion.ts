/**
 * SensorFusion — motion detection + accurate step counting.
 *
 * Step counting strategy (priority order):
 *  1. Hardware pedometer chip (expo-sensors Pedometer) — uses dedicated silicon
 *  2. Accelerometer peak detection with adaptive gravity — works indoors, pocket, any orientation
 *
 * The accelerometer detector uses an adaptive gravity estimate (slow EMA)
 * so it correctly measures step impacts regardless of phone tilt/orientation.
 */

import { PermissionsAndroid, Platform } from "react-native";

export interface MotionState {
  isMoving: boolean;
  magnitude: number;
  steps: number;
  stepsPerMinute: number;
  confidence: number;
  pedometerActive: boolean;
}

// Motion detection
const STILL_THRESHOLD = 0.18;
const MOVING_THRESHOLD = 0.5;
const HISTORY_SIZE = 8;

// Step detection timing bounds
const MIN_STEP_MS = 220;   // fastest realistic: ~4.5 steps/sec
const MAX_STEP_MS = 2500;  // slowest realistic: ~0.4 steps/sec

// Step detection magnitude thresholds (in g above adaptive gravity)
const STEP_PEAK_THRESHOLD = 0.7;    // must exceed this to start a peak
const STEP_VALLEY_THRESHOLD = 0.15; // must drop below this to arm next peak

export class SensorFusion {
  private accelListener: { remove: () => void } | null = null;
  private pedometerSub: { remove: () => void } | null = null;
  private magnitudeHistory: number[] = [];
  private motionState: MotionState = {
    isMoving: true,
    magnitude: 0,
    steps: 0,
    stepsPerMinute: 0,
    confidence: 0.5,
    pedometerActive: false,
  };
  private onUpdate: (state: MotionState) => void;

  // Hardware pedometer
  private baselineSteps: number | null = null;
  private hwSteps = 0;
  private hwActive = false;

  // Accelerometer step detector
  private accelSteps = 0;
  private accelSpm = 0;
  private gravityEst = 9.81;  // adaptive — tracks actual gravity regardless of orientation
  private inPeak = false;
  private lastPeakMs = 0;
  private recentIntervals: number[] = [];
  private lastSampleMs = 0;

  constructor(onUpdate: (state: MotionState) => void) {
    this.onUpdate = onUpdate;
  }

  async start(activityType: "walking" | "running" | "cycling") {
    if (Platform.OS === "web") {
      this.emit({ isMoving: true, magnitude: 9.8, steps: 0, stepsPerMinute: 0, confidence: 0.5, pedometerActive: false });
      return;
    }

    await Promise.all([
      this._startAccelerometer(activityType).catch(() => {}),
      activityType !== "cycling" ? this._startPedometer().catch(() => {}) : Promise.resolve(),
    ]);
  }

  private async _startAccelerometer(activityType: "walking" | "running" | "cycling") {
    const { Accelerometer } = await import("expo-sensors");
    Accelerometer.setUpdateInterval(50); // 20 Hz — good resolution for steps

    this.accelListener = Accelerometer.addListener(({ x, y, z }) => {
      const now = Date.now();
      if (now - this.lastSampleMs < 45) return;
      this.lastSampleMs = now;

      const rawMag = Math.sqrt(x * x + y * y + z * z);

      // ── Adaptive gravity (very slow EMA, alpha=0.97) ──────────────────
      // Tracks actual gravity contribution regardless of phone orientation.
      // Dynamic impacts (steps) are too fast to affect this estimate.
      this.gravityEst = 0.97 * this.gravityEst + 0.03 * rawMag;
      const dynamic = rawMag - this.gravityEst;

      // ── Motion detection ──────────────────────────────────────────────
      const absDynamic = Math.abs(dynamic);
      this.magnitudeHistory.push(absDynamic);
      if (this.magnitudeHistory.length > HISTORY_SIZE) this.magnitudeHistory.shift();
      const avgDynamic = this.magnitudeHistory.reduce((a, b) => a + b, 0) / this.magnitudeHistory.length;
      const isMoving = avgDynamic > STILL_THRESHOLD;
      const conf = avgDynamic > MOVING_THRESHOLD ? 0.85 : avgDynamic > STILL_THRESHOLD ? 0.6 : 0.9;

      // ── Accelerometer step detection (walking/running only) ───────────
      if (activityType !== "cycling") {
        this._detectStep(dynamic, now);
      }

      this.emit({
        ...this.motionState,
        isMoving,
        magnitude: avgDynamic,
        confidence: conf,
        steps: this.hwActive ? this.hwSteps : this.accelSteps,
        stepsPerMinute: this.hwActive ? this.motionState.stepsPerMinute : this.accelSpm,
        pedometerActive: this.hwActive,
      });
    });
  }

  /**
   * Adaptive-gravity step detector.
   *
   * Uses `dynamic = rawMag - gravityEst` so the threshold is always measured
   * relative to the actual resting baseline of the phone — works in any orientation.
   *
   * State machine:
   *   VALLEY (inPeak=false): waiting for magnitude to rise above STEP_PEAK_THRESHOLD
   *   PEAK   (inPeak=true):  waiting for magnitude to fall below STEP_VALLEY_THRESHOLD
   *
   * A step is counted on the VALLEY→PEAK transition when the timing is valid.
   */
  private _detectStep(dynamic: number, now: number) {
    if (!this.inPeak) {
      // ── Valley state: look for rising edge ────────────────────────────
      if (dynamic > STEP_PEAK_THRESHOLD) {
        this.inPeak = true;

        if (this.lastPeakMs === 0) {
          // Very first peak — just initialise timing, don't count
          this.lastPeakMs = now;
          return;
        }

        const dt = now - this.lastPeakMs;

        if (dt >= MIN_STEP_MS && dt <= MAX_STEP_MS) {
          // ✓ Valid step
          this.accelSteps++;
          this.recentIntervals.push(dt);
          if (this.recentIntervals.length > 8) this.recentIntervals.shift();
          const avgInterval = this.recentIntervals.reduce((a, b) => a + b, 0) / this.recentIntervals.length;
          this.accelSpm = Math.round(60000 / avgInterval);
          this.lastPeakMs = now;
        } else if (dt > MAX_STEP_MS) {
          // Long pause — reset cadence, accept as new start
          this.lastPeakMs = now;
          this.recentIntervals = [];
          this.accelSpm = 0;
        }
        // dt < MIN_STEP_MS → noise, ignore (don't update lastPeakMs)
      }
    } else {
      // ── Peak state: wait for valley before arming next peak ───────────
      if (dynamic < STEP_VALLEY_THRESHOLD) {
        this.inPeak = false;
      }
    }
  }

  private async _startPedometer() {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          "android.permission.ACTIVITY_RECOGNITION" as any,
          {
            title: "Activity Recognition",
            message: "Dokra needs this to count your steps accurately.",
            buttonPositive: "Allow",
            buttonNegative: "Deny",
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      } catch {}
    }

    const { Pedometer } = await import("expo-sensors");
    let available = false;
    try { available = await Pedometer.isAvailableAsync(); } catch {}
    if (!available) return;

    this.baselineSteps = null;
    this.hwSteps = 0;

    this.pedometerSub = Pedometer.watchStepCount((result) => {
      const total = result.steps;

      if (this.baselineSteps === null) {
        this.baselineSteps = total;
        this.hwActive = true;
        this.emit({ ...this.motionState, pedometerActive: true });
        return;
      }

      const newHwSteps = Math.max(0, total - this.baselineSteps);
      const stepDelta = newHwSteps - this.hwSteps;
      this.hwSteps = newHwSteps;

      // Update cadence from hardware step deltas
      let spm = this.motionState.stepsPerMinute;
      if (stepDelta > 0) {
        const instantSpm = stepDelta * 60; // rough estimate if called ~1/sec
        spm = Math.round(spm * 0.6 + instantSpm * 0.4);
      }

      this.emit({
        ...this.motionState,
        steps: this.hwSteps,
        stepsPerMinute: spm,
        pedometerActive: true,
      });
    });
  }

  private emit(state: MotionState) {
    this.motionState = state;
    this.onUpdate(state);
  }

  stop() {
    try { this.accelListener?.remove(); } catch {}
    try { this.pedometerSub?.remove(); } catch {}
    this.accelListener = null;
    this.pedometerSub = null;
    this.magnitudeHistory = [];
    this.recentIntervals = [];
    this.baselineSteps = null;
  }

  getState(): MotionState {
    return this.motionState;
  }
}
