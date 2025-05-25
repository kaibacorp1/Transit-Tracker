// utils/transitUtils.js

/**
 * Projects a moving object’s future position given speed and heading.
 */
export function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
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
 * Computes true angular separation between two sky directions (deg).
 */
export function sphericalSeparation(az1, el1, az2, el2) {
  const toRad = x => x * Math.PI / 180;
  const a1 = toRad(el1), a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2)
               + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180 / Math.PI;
}

/**
 * Detects flights transiting (or near) a celestial body.
 * Uses a quick box pre-filter and a precise spherical check.
 */
export function detectTransits({ flights, bodyAz, bodyAlt, margin = 2.5, userLat, userLon, userElev = 0, predictSeconds = 0, selectedBody }) {
  const matches = [];

  for (const plane of flights) {
    const { latitude, longitude, altitude: geoAlt, callsign } = plane;

    // Quick box pre-filter
    const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
    const distance = haversine(userLat, userLon, latitude, longitude);
    const elevationAngle = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;

    const azDiff = Math.abs(((azimuth - bodyAz + 540) % 360) - 180);
    const altDiff = Math.abs(elevationAngle - bodyAlt);

    if (azDiff < margin && altDiff < margin) {
      // Precise spherical test
      const sep = sphericalSeparation(azimuth, elevationAngle, bodyAz, bodyAlt);
      if (sep < margin) {
        matches.push({
          callsign,
          azimuth: azimuth.toFixed(1),
          altitudeAngle: elevationAngle.toFixed(1),
          distance: distance.toFixed(1),
          selectedBody,
          predictionSeconds: predictSeconds
        });
      }
    }
  }

  return matches;
}

/**
 * Haversine formula: ground distance between two coords (m).
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const dφ = φ2 - φ1;
  const dλ = toRad(lon2 - lon1);
  const a = Math.sin(dφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ/2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * Calculates bearing (azimuth) from observer to target (deg).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const toDeg = x => x * 180 / Math.PI;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const x = Math.sin(Δλ) * Math.cos(φ2);
  const y = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}
