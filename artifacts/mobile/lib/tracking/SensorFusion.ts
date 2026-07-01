/**
 * SensorFusion — motion detection + accurate step counting.
 *
 * Step counting strategy (in priority order):
 *  1. Hardware pedometer chip (expo-sensors Pedometer) — most accurate, uses dedicated silicon
 *  2. Accelerometer peak detection — works indoors/small rooms, no GPS needed
 *
 * The accelerometer peak detector finds footstep signatures in the
 * acceleration magnitude signal using adaptive thresholding.
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

// Motion detection thresholds
const STILL_THRESHOLD = 0.18;
const MOVING_THRESHOLD = 0.5;
const HISTORY_SIZE = 8;

// Step detection constants
const MIN_STEP_MS = 220;   // fastest realistic step: ~4.5 steps/sec
const MAX_STEP_MS = 2500;  // slowest: ~0.4 steps/sec (very slow shuffle)
const PEAK_THRESHOLD_BASE = 1.2;   // base g threshold to detect a step peak
const PEAK_RESET_RATIO = 0.55;     // valley must drop to this fraction of threshold before next peak

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

  // Hardware pedometer state
  private baselineSteps: number | null = null;
  private hwSteps = 0;
  private hwActive = false;

  // Accelerometer step detector state
  private accelSteps = 0;
  private lastPeakMs = 0;
  private inPeak = false;
  private smoothedMag = 9.81;
  private recentStepIntervals: number[] = [];
  private lastAccelMs = 0;
  private lastSpmUpdateMs = 0;
  private accelSpm = 0;

  constructor(onUpdate: (state: MotionState) => void) {
    this.onUpdate = onUpdate;
  }

  async start(activityType: "walking" | "running" | "cycling") {
    if (Platform.OS === "web") {
      this.emit({ isMoving: true, magnitude: 9.8, steps: 0, stepsPerMinute: 0, confidence: 0.5, pedometerActive: false });
      return;
    }

    // Start both in parallel — either can fail without blocking the other
    await Promise.all([
      this._startAccelerometer(activityType).catch(() => {}),
      activityType !== "cycling" ? this._startPedometer().catch(() => {}) : Promise.resolve(),
    ]);
  }

  private async _startAccelerometer(activityType: "walking" | "running" | "cycling") {
    const SensorsModule = await import("expo-sensors");
    const { Accelerometer } = SensorsModule;

    Accelerometer.setUpdateInterval(100); // 10 Hz for good step resolution

    this.accelListener = Accelerometer.addListener(({ x, y, z }) => {
      const now = Date.now();
      if (now - this.lastAccelMs < 80) return; // ~12 Hz max
      this.lastAccelMs = now;

      const rawMag = Math.sqrt(x * x + y * y + z * z);

      // Low-pass filter to separate gravity from dynamic acceleration
      const alpha = 0.85;
      this.smoothedMag = alpha * this.smoothedMag + (1 - alpha) * rawMag;
      const dynamic = Math.abs(rawMag - this.smoothedMag);

      // Motion detection
      this.magnitudeHistory.push(dynamic);
      if (this.magnitudeHistory.length > HISTORY_SIZE) this.magnitudeHistory.shift();
      const avgDynamic = this.magnitudeHistory.reduce((a, b) => a + b, 0) / this.magnitudeHistory.length;
      const isMoving = avgDynamic > STILL_THRESHOLD;
      const conf = avgDynamic > MOVING_THRESHOLD ? 0.85 : avgDynamic > STILL_THRESHOLD ? 0.6 : 0.9;

      // Accelerometer step detection — only for walking/running, not cycling
      if (activityType !== "cycling") {
        this._detectStep(rawMag, now);
      }

      this.emit({
        ...this.motionState,
        isMoving,
        magnitude: avgDynamic,
        confidence: conf,
        // Use hardware steps if available, otherwise use accel-detected steps
        steps: this.hwActive ? this.hwSteps : this.accelSteps,
        stepsPerMinute: this.accelSpm,
        pedometerActive: this.hwActive,
      });
    });
  }

  /**
   * Adaptive peak detection step counter.
   *
   * Algorithm:
   *  - Track the raw magnitude of acceleration
   *  - A step is detected when magnitude crosses a threshold going UP (peak)
   *  - Must return below threshold * PEAK_RESET_RATIO before counting next step
   *  - Step interval must be within human walking/running range
   *  - Cadence (SPM) computed from rolling window of recent step intervals
   */
  private _detectStep(rawMag: number, now: number) {
    const dynamic = rawMag - 9.81;
    const threshold = PEAK_THRESHOLD_BASE;

    if (!this.inPeak && dynamic > threshold) {
      // Rising edge — potential step start
      const dt = this.lastPeakMs > 0 ? now - this.lastPeakMs : 0;

      if (this.lastPeakMs === 0) {
        // First step — just record timing
        this.lastPeakMs = now;
        this.inPeak = true;
        return;
      }

      if (dt >= MIN_STEP_MS && dt <= MAX_STEP_MS) {
        // Valid step interval — count it
        this.accelSteps++;
        this.recentStepIntervals.push(dt);
        if (this.recentStepIntervals.length > 8) this.recentStepIntervals.shift();

        // Update SPM from rolling average of recent intervals
        const avgInterval = this.recentStepIntervals.reduce((a, b) => a + b, 0) / this.recentStepIntervals.length;
        this.accelSpm = Math.round(60000 / avgInterval);
      } else if (dt > MAX_STEP_MS) {
        // Too long since last step — could be restarting after pause
        // Accept it but don't count interval in SPM
        this.accelSteps++;
        this.recentStepIntervals = []; // reset cadence history
        this.accelSpm = 0;
      }

      this.lastPeakMs = now;
      this.inPeak = true;
    } else if (this.inPeak && dynamic < threshold * PEAK_RESET_RATIO) {
      // Fell below reset threshold — ready for next peak
      this.inPeak = false;
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
      } catch { /* permission API not available, try anyway */ }
    }

    const SensorsModule = await import("expo-sensors");
    const { Pedometer } = SensorsModule;

    let available = false;
    try { available = await Pedometer.isAvailableAsync(); } catch {}
    if (!available) return;

    this.baselineSteps = null;
    this.hwSteps = 0;

    this.pedometerSub = Pedometer.watchStepCount((result) => {
      const total = result.steps;

      if (this.baselineSteps === null) {
        // First reading — set baseline so we count from 0
        this.baselineSteps = total;
        this.hwActive = true;
        this.emit({ ...this.motionState, pedometerActive: true });
        return;
      }

      this.hwSteps = Math.max(0, total - this.baselineSteps);

      this.emit({
        ...this.motionState,
        steps: this.hwSteps,
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
    this.baselineSteps = null;
    this.recentStepIntervals = [];
  }

  getState(): MotionState {
    return this.motionState;
  }
}
