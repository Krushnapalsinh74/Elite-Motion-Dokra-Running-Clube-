/**
 * 1-D Kalman Filter for GPS coordinate smoothing.
 * Tracks a single scalar state (latitude or longitude) with adaptive
 * process noise based on estimated movement speed.
 */
export class KalmanFilter {
  private q: number;
  private r: number;
  private p: number;
  private x: number;
  private k: number;
  private lastTimestamp: number;

  /**
   * @param q Process noise (how much we trust motion model). Higher = follows raw GPS more closely.
   * @param r Measurement noise (how noisy the GPS is). Higher = smoother but more lag.
   * @param initialAccuracy Initial GPS accuracy in metres.
   */
  constructor(q = 3, r = 29, initialAccuracy = 1) {
    this.q = q;
    this.r = Math.max(r, initialAccuracy * initialAccuracy);
    this.p = this.r;
    this.x = 0;
    this.k = 0;
    this.lastTimestamp = 0;
  }

  setState(value: number, accuracy: number, timestamp: number) {
    this.x = value;
    this.r = Math.max(accuracy * accuracy, 1);
    this.p = this.r;
    this.lastTimestamp = timestamp;
  }

  process(measurement: number, accuracy: number, timestamp: number): number {
    const dtMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Predict: increase uncertainty with time
    const dtSec = Math.max(dtMs / 1000, 0);
    this.p += this.q * dtSec;

    // Adaptive measurement noise based on GPS accuracy
    this.r = Math.max(accuracy * accuracy, 1);

    // Update (Kalman gain)
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }

  get value(): number { return this.x; }
  get variance(): number { return this.p; }
}

/**
 * 2-D Kalman filter pairing latitude and longitude with independent filters.
 */
export class GpsKalmanFilter {
  private latFilter: KalmanFilter;
  private lonFilter: KalmanFilter;
  private initialized = false;

  constructor() {
    this.latFilter = new KalmanFilter(3, 29, 1);
    this.lonFilter = new KalmanFilter(3, 29, 1);
  }

  process(lat: number, lon: number, accuracy: number, timestamp: number): { lat: number; lon: number } {
    if (!this.initialized) {
      this.latFilter.setState(lat, accuracy, timestamp);
      this.lonFilter.setState(lon, accuracy, timestamp);
      this.initialized = true;
      return { lat, lon };
    }
    return {
      lat: this.latFilter.process(lat, accuracy, timestamp),
      lon: this.lonFilter.process(lon, accuracy, timestamp),
    };
  }

  reset() {
    this.initialized = false;
    this.latFilter = new KalmanFilter(3, 29, 1);
    this.lonFilter = new KalmanFilter(3, 29, 1);
  }
}
