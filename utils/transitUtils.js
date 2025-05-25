// utils/transitUtils.js

import SunCalc from 'suncalc';

/**
 * Projects a moving object’s future position given speed and heading.
 */
export function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
  const d = speed * seconds;
  const theta = heading * Math.PI / 180;
  const phi1 = lat * Math.PI / 180;
  const lambda1 = lon * Math.PI / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d / R) +
    Math.cos(phi1) * Math.sin(d / R) * Math.cos(theta)
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(d / R) * Math.cos(phi1),
    Math.cos(d / R) - Math.sin(phi1) * Math.sin(phi2)
  );

  return { lat: phi2 * 180 / Math.PI, lon: lambda2 * 180 / Math.PI };
}

/**
 * Computes true angular separation between two sky directions (degrees).
 */
export function sphericalSeparation(az1, el1, az2, el2) {
  const toRad = deg => deg * Math.PI / 180;
  const a1 = toRad(el1);
  const a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2)
               + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180 / Math.PI;
}

/**
 * Detects flights transiting (or near) a celestial body, now or in the future.
 * Uses box pre-filter and spherical-separation for precision.
 */
export function detectTransits({
  flights,
  bodyAz,
  bodyAlt,
  margin = 2.5,
  userLat,
  userLon,
  userElev = 0,
  predictSeconds = 0,
  selectedBody
}) {
  const matches = [];

  // Compute future body position if prediction requested
  let futureBodyAz = bodyAz;
  let futureBodyAlt = bodyAlt;
  if (predictSeconds > 0) {
    const futureTime = new Date(Date.now() + predictSeconds * 1000);
    const pos = selectedBody === 'moon'
      ? SunCalc.getMoonPosition(futureTime, userLat, userLon)
      : SunCalc.getPosition(futureTime, userLat, userLon);
    futureBodyAz = (pos.azimuth * 180 / Math.PI + 180) % 360;
    futureBodyAlt = pos.altitude * 180 / Math.PI;
  }

  for (const plane of flights) {
    let { latitude, longitude, altitude: geoAlt, heading, speed, callsign } = plane;

    // Project plane if predictive mode enabled and data available
    if (predictSeconds > 0 && heading != null && speed != null) {
      const proj = projectPosition(latitude, longitude, heading, speed, predictSeconds);
      latitude = proj.lat;
      longitude = proj.lon;
      // geoAlt unchanged; optionally adjust with climb rate if available
    }

    // Quick box pre-filter
    const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
    const distance = haversine(userLat, userLon, latitude, longitude);
    const elevationAngle = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;

    const azDiff = Math.abs(((azimuth - futureBodyAz + 540) % 360) - 180);
    const altDiff = Math.abs(elevationAngle - futureBodyAlt);

    if (azDiff < margin && altDiff < margin) {
      // Precise spherical check
      const sep = sphericalSeparation(azimuth, elevationAngle, futureBodyAz, futureBodyAlt);
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
 * Haversine: ground distance between two coords (meters).
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = phi2 - phi1;
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2
          + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/**
 * Calculates bearing (azimuth) from observer to target (degrees).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * Math.PI / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2)
          - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}
