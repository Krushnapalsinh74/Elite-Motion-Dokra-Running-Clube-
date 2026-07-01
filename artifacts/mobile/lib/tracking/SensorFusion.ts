/**
 * SensorFusion — accelerometer motion detection + pedometer step counting.
 *
 * Completely defensive: if any sensor fails to initialize, we fall back
 * gracefully to "always moving" rather than crashing the app.
 */

import { Platform } from "react-native";

export interface MotionState {
  isMoving: boolean;
  magnitude: number;
  steps: number;
  stepsPerMinute: number;
  confidence: number;
}

const STILL_THRESHOLD = 0.3;
const MOVING_THRESHOLD = 0.7;
const HISTORY_SIZE = 10;

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
  };
  private onUpdate: (state: MotionState) => void;
  private baselineSteps: number | null = null;
  private lastStepTimestamp = Date.now();
  private previousSteps = 0;
  private lastAccelTime = 0;

  constructor(onUpdate: (state: MotionState) => void) {
    this.onUpdate = onUpdate;
  }

  async start(activityType: "walking" | "running" | "cycling") {
    if (Platform.OS === "web") {
      // Web: always moving, no sensors
      this.emit({ isMoving: true, magnitude: 9.8, steps: 0, stepsPerMinute: 0, confidence: 0.5 });
      return;
    }

    await this._startAccelerometer();

    if (activityType !== "cycling") {
      await this._startPedometer();
    }
  }

  private async _startAccelerometer() {
    try {
      const SensorsModule = await import("expo-sensors");
      const { Accelerometer } = SensorsModule;

      Accelerometer.setUpdateInterval(250);
      this.accelListener = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        if (now - this.lastAccelTime < 200) return;
        this.lastAccelTime = now;

        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const dynamic = Math.abs(magnitude - 9.81);

        this.magnitudeHistory.push(dynamic);
        if (this.magnitudeHistory.length > HISTORY_SIZE) this.magnitudeHistory.shift();

        const avg = this.magnitudeHistory.reduce((a, b) => a + b, 0) / this.magnitudeHistory.length;
        const isMoving = avg > STILL_THRESHOLD;
        const conf = avg > MOVING_THRESHOLD ? 0.85 : avg > STILL_THRESHOLD ? 0.6 : 0.9;

        this.emit({
          ...this.motionState,
          isMoving,
          magnitude: avg,
          confidence: conf,
        });
      });
    } catch {
      // Accelerometer unavailable — assume moving
      this.emit({ ...this.motionState, isMoving: true, confidence: 0.5 });
    }
  }

  private async _startPedometer() {
    try {
      const SensorsModule = await import("expo-sensors");
      const { Pedometer } = SensorsModule;

      let available = false;
      try {
        available = await Pedometer.isAvailableAsync();
      } catch {
        available = false;
      }

      if (!available) return;

      this.baselineSteps = null;
      this.previousSteps = 0;
      this.lastStepTimestamp = Date.now();

      this.pedometerSub = Pedometer.watchStepCount((result) => {
        const total = result.steps;

        if (this.baselineSteps === null) {
          this.baselineSteps = total;
          this.previousSteps = 0;
        }

        const sessionSteps = Math.max(0, total - this.baselineSteps);
        const newSteps = sessionSteps - this.previousSteps;
        const now = Date.now();
        const dtMin = (now - this.lastStepTimestamp) / 60000;

        let spm = this.motionState.stepsPerMinute;
        if (newSteps > 0 && dtMin > 0) {
          const instantSpm = newSteps / dtMin;
          // Exponential moving average for smooth cadence
          spm = Math.round(spm * 0.7 + instantSpm * 0.3);
        }

        this.previousSteps = sessionSteps;
        this.lastStepTimestamp = now;

        this.emit({ ...this.motionState, steps: sessionSteps, stepsPerMinute: spm });
      });
    } catch {
      // Pedometer unavailable — just don't count steps
    }
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
  }

  getState(): MotionState {
    return this.motionState;
  }
}
