// transitUtils.js
// Utility functions for transit and close-pass detection using circular thresholds

// Convert degrees to radians
const toRad = Math.PI / 180;
// Convert radians to degrees
const toDeg = 180 / Math.PI;

// Fixed physical constants
const diskRadiusDeg = 0.25; // Sun/Moon apparent radius in degrees
// Sensor and lens parameters (Fuji X-T4 APS-C + 500mm lens)
const sensorWidth = 23.5;   // mm
const sensorHeight = 15.6;  // mm
const focalLength = 500;    // mm
const sensorDiag = Math.hypot(sensorWidth, sensorHeight);
const fovDiagDeg = 2 * Math.atan(sensorDiag / (2 * focalLength)) * toDeg;
const frameRadiusDeg = fovDiag / 2;  // half-diagonal field-of-view

/**
 * Compute ECEF coordinates from geodetic position
 * @param {number} lat - latitude in degrees
 * @param {number} lon - longitude in degrees
 * @param {number} h - height above ellipsoid in meters
 * @returns {Array<number>} [X, Y, Z] in meters
 */
function geodeticToECEF(lat, lon, h) {
  const phi = lat * toRad;
  const lambda = lon * toRad;
  const a = 6378137.0;            // WGS84 semi-major axis
  const f = 1 / 298.257223563;    // WGS84 flattening
  const e2 = f * (2 - f);
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const X = (N + h) * Math.cos(phi) * Math.cos(lambda);
  const Y = (N + h) * Math.cos(phi) * Math.sin(lambda);
  const Z = (N * (1 - e2) + h) * Math.sin(phi);
  return [X, Y, Z];
}

/**
 * Rotate ECEF difference vector to local ENU frame
 * @param {Array<number>} rel - [dx, dy, dz]
 * @param {number} lat0 - observer latitude in degrees
 * @param {number} lon0 - observer longitude in degrees
 * @returns {Array<number>} [E, N, U]
 */
function ecefToENU(rel, lat0, lon0) {
  const phi = lat0 * toRad;
  const lambda = lon0 * toRad;
  const slat = Math.sin(phi);
  const clat = Math.cos(phi);
  const slon = Math.sin(lambda);
  const clon = Math.cos(lambda);

  const R = [
    [-slon,        clon,         0   ],
    [-clon*slat,  -slon*slat,    clat],
    [ clon*clat,   slon*clat,    slat]
  ];
  const [dx, dy, dz] = rel;
  // Matrix multiply R * [dx, dy, dz]
  const E = R[0][0]*dx + R[0][1]*dy + R[0][2]*dz;
  const N = R[1][0]*dx + R[1][1]*dy + R[1][2]*dz;
  const U = R[2][0]*dx + R[2][1]*dy + R[2][2]*dz;
  return [E, N, U];
}

/**
 * Compute horizontal azimuth and elevation from geodetic positions
 * @param {object} planePos - { lat, lon, alt }
 * @param {object} obs     - { lat, lon, elev }
 * @returns {object} { az, el } in radians
 */
export function computeAzEl(planePos, obs) {
  // ECEF positions
  const obsECEF = geodeticToECEF(obs.lat, obs.lon, obs.elev);
  const planeECEF = geodeticToECEF(planePos.lat, planePos.lon, planePos.alt);
  // Vector from observer to plane
  const rel = [
    planeECEF[0] - obsECEF[0],
    planeECEF[1] - obsECEF[1],
    planeECEF[2] - obsECEF[2]
  ];
  // ENU frame
  const [E, N, U] = ecefToENU(rel, obs.lat, obs.lon);
  // Azimuth (0 = North, increasing towards East)
  const az = Math.atan2(E, N);
  // Elevation
  const el = Math.asin(U / Math.hypot(E, N, U));
  return { az, el };
}

/**
 * Classify a single flight event as Transit, ClosePass, or NoEvent
 * @param {object} azel     - { az: radians, el: radians } of plane
 * @param {number} bodyAz   - Sun/Moon azimuth in radians
 * @param {number} bodyEl   - Sun/Moon elevation in radians
 * @param {number} marginDeg - user detection margin in degrees
 * @returns {string} one of 'Transit', 'ClosePass', 'NoEvent'
 */
export function classifyEvent(azel, bodyAz, bodyEl, marginDeg) {
  // Convert margins and radii to radians
  const margin = marginDeg * toRad;
  const thTransit = (diskRadiusDeg + marginDeg) * toRad;
  const thClose   = (frameRadiusDeg + marginDeg) * toRad;

  // Quick rectangular pre-filter (optional)
  const dAz = Math.abs(bodyAz - azel.az);
  const dEl = Math.abs(bodyEl - azel.el);
  if (dAz > (frameRadiusDeg + marginDeg) * toRad || dEl > (frameRadiusDeg + marginDeg) * toRad) {
    return 'NoEvent';
  }

  // Great-circle angular separation (radians)
  const sep = Math.acos(
    Math.sin(bodyEl) * Math.sin(azel.el) +
    Math.cos(bodyEl) * Math.cos(azel.el) * Math.cos(bodyAz - azel.az)
  );

  if (sep <= thTransit) {
    return 'Transit';
  }
  if (sep <= thClose) {
    return 'ClosePass';
  }
  return 'NoEvent';
}

