// utils/transitUtils.js

// utils/transitUtils.js
export function mapOpenSkyStates(states) { /* … */ }
export function mapAviationstack(dataArray) { /* … */ }
export function mapAdsbExchange(records) { /* … */ }
// plus calculateAzimuth, projectPosition, detectTransits, etc.

// Angular radius of the Sun/Moon in degrees
const RADIUS_DISK_DEG = 0.25;

/**
 * Compute true angular separation Δθ (degrees)
 * between two sky directions (A = azimuth, h = elevation).
 */
function angularSeparation(A1, h1, A2, h2) {
  const toRad = Math.PI / 180;
  const As = A1 * toRad, hs = h1 * toRad;
  const Ap = A2 * toRad, hp = h2 * toRad;

  const cosd =
    Math.sin(hs) * Math.sin(hp) +
    Math.cos(hs) * Math.cos(hp) * Math.cos(As - Ap);

  // clamp to [-1,1], acos, convert back to degrees
  return Math.acos(Math.max(-1, Math.min(1, cosd))) * 180 / Math.PI;
}

/**
 * Project a flight position after `seconds` given heading and speed.
 */
export function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000; // Earth radius in meters
  const d = speed * seconds;
  const θ = heading * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d / R) +
    Math.cos(φ1) * Math.sin(d / R) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(d / R) * Math.cos(φ1),
    Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2)
  );

  return { lat: φ2 * 180 / Math.PI, lon: λ2 * 180 / Math.PI };
}

/**
 * Calculate azimuth from observer (lat1, lon1) to target (lat2, lon2).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Normalize an angle into [0,360) degrees.
 */
export function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Compute great-circle distance (meters) between two geo points.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Detect full and near-miss transits.
 * @param {Object} params
 * @param {Array} params.flights - list of flight objects with { lat, lon, altitude }
 * @param {number} params.userLat
 * @param {number} params.userLon
 * @param {number} params.userElev - observer elevation (m)
 * @param {number} params.bodyAz - Sun/Moon azimuth (°)
 * @param {number} params.bodyAlt - Sun/Moon altitude (°)
 * @param {number} [params.margin=2.5] - half-FoV buffer (°)
 * @param {number} [params.predictSeconds=0]
 * @param {string} [params.selectedBody='moon']
 * @returns {Array} matches with { flight, type: 'full'|'near-miss', sep }
 */
export function detectTransits({
  flights,
  userLat,
  userLon,
  userElev,
  bodyAz,
  bodyAlt,
  margin = 2.5,
  predictSeconds = 0,
  selectedBody = 'moon'
}) {
  const matches = [];

  for (const flight of flights) {
    const { lat: flightLat, lon: flightLon, altitude: flightAlt } = flight;

    // Compute flight az/el from observer
    const az = calculateAzimuth(userLat, userLon, flightLat, flightLon);
    const dist = haversine(userLat, userLon, flightLat, flightLon);
    const el = Math.atan2(flightAlt - userElev, dist) * (180 / Math.PI);

    // Coarse box pre-filter
    // 1) Compute raw wrapped difference in [0,360)
     let raw = normalizeAngle(az - bodyAz);

    // 2) Pick the shorter arc (if >180°, go the other way)
    const azDiff = raw > 180 ? 360 - raw : raw;
    const altDiff = Math.abs(el - bodyAlt);
    if (azDiff < margin && altDiff < margin) {

      // Precise angular separation
      const sep = angularSeparation(bodyAz, bodyAlt, az, el);

      // Full silhouette
      if (sep < RADIUS_DISK_DEG) {
        matches.push({ flight, type: 'full', sep });
      }
      // Near-miss in FoV
      else if (sep < RADIUS_DISK_DEG + margin) {
        matches.push({ flight, type: 'near-miss', sep });
      }
    }
  }

  return matches;
}
