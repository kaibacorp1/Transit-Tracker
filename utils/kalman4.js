// utils/kalman4.js
import { identity, transpose, inv, multiply, add, subtract, diag } from 'mathjs';

function nowSec() {
  return Date.now() / 1000;
}

/**
 * 4-state Kalman filter for [lat°, lon°, vN°/s, vE°/s]
 */
export default class Kalman4 {
  /**
   * @param {number} lat  initial latitude (°)
   * @param {number} lon  initial longitude (°)
   */
  constructor(lat, lon) {
    // state vector x = [φ, λ, vN, vE]
    this.x = [lat, lon, 0, 0];

    // Covariance matrices
    this.P = diag([1e-3, 1e-3, 1e-6, 1e-6]);  // initial uncertainty
    this.Q = diag([   0,    0, 5e-6, 5e-6]);  // process noise
    this.R = diag([5e-5, 5e-5]);              // measurement noise

    this.lastT = nowSec();
  }

  /**
   * Incorporate a new measurement
   * @param {{lat:number, lon:number, speed?:number, track?:number}} m
   */
  correct({ lat, lon, speed, track }) {
    const t  = nowSec();
    const dt = Math.max(t - this.lastT, 1e-3);

    // 1) Predict to “now”
    this.predict(dt);

    // 2) Measurement update (we measure lat & lon directly)
    const H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ];
    const z = [lat, lon];

    const y = subtract(z, multiply(H, this.x));                        // innovation
    const S = add(multiply(H, this.P, transpose(H)), this.R);          // innovation cov
    const K = multiply(this.P, transpose(H), inv(S));                  // Kalman gain

    this.x = add(this.x, multiply(K, y));                              // updated state
    this.P = multiply(subtract(identity(4), multiply(K, H)), this.P); // updated cov

    // 3) Overwrite velocities if speed+track provided
    if (speed != null && track != null) {
      const gs = speed;              // in m/s
      const θ  = track * Math.PI/180;

      // convert m/s → deg/s (approx: 1° lat ≈ 111.32 km)
      const vN = (gs / 111319.9) * Math.cos(θ);
      const vE = (gs / (111319.9 * Math.cos(this.x[0] * Math.PI/180))) * Math.sin(θ);

      this.x[2] = vN;
      this.x[3] = vE;
    }

    this.lastT = t;
  }

  /**
   * Project the state forward by dt seconds (constant-velocity model)
   * @param {number} dt  seconds
   * @returns {{lat:number, lon:number}}
   */
  predict(dt) {
    // φ ← φ + vN⋅dt,  λ ← λ + vE⋅dt
    this.x[0] += this.x[2] * dt;
    this.x[1] += this.x[3] * dt;

    // Inflate uncertainty
    this.P = add(this.P, this.Q);

    return { lat: this.x[0], lon: this.x[1] };
  }
}
