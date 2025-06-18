// utils/transitUtils.js
import SunCalc from 'suncalc';

/**
 * Projects a moving object’s future position given speed and heading.
 */
export function projectPosition(lat, lon, heading, speed, seconds, altitude = 0, verticalSpeed = 0) {
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

  // ⬆️ Adjust altitude using vertical speed if available
  const futureAlt = altitude + verticalSpeed * seconds;

  return { lat: phi2 * 180 / Math.PI, lon: lambda2 * 180 / Math.PI, alt: futureAlt };
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
    let {
      latitude,
      longitude,
      altitude: geoAlt,
      heading = 0, // default if undefined
      speed,
      callsign
    } = plane;

    // Project plane if predictive mode enabled
    if (predictSeconds > 0 && heading != null && speed != null) {
      const proj = projectPosition(latitude, longitude, heading, speed, predictSeconds, geoAlt, plane.verticalSpeed || 0);
      latitude = proj.lat;
      longitude = proj.lon;
        geoAlt = proj.alt; // ⬅️ Updated future altitude
    }

    // Rough filtering
    const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
    const distance = haversine(userLat, userLon, latitude, longitude);
    const elevationAngle = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;

    const azDiff = Math.abs(((azimuth - futureBodyAz + 540) % 360) - 180);
    const altDiff = Math.abs(elevationAngle - futureBodyAlt);

    if (azDiff < margin && altDiff < margin) {
      const sep = sphericalSeparation(azimuth, elevationAngle, futureBodyAz, futureBodyAlt);
      const headingToBody = Math.abs(((heading - futureBodyAz + 540) % 360) - 180);

      if (sep < margin || headingToBody < 12) {
        matches.push({
          callsign,
          azimuth: azimuth.toFixed(1),
          altitudeAngle: elevationAngle.toFixed(1),
          distance: distance.toFixed(1),
          selectedBody,
          predictionSeconds: predictSeconds,
          track: heading
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
  const toDeg = rad => rad * 180 / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2)
          - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}
function toDeg(rad) {
  return rad * 180 / Math.PI;
}

// 3D unit vector from azimuth/altitude (Sun or Moon)
function celestialToVector(azimuthDeg, altitudeDeg) {
  const az = toRad(azimuthDeg);
  const alt = toRad(altitudeDeg);
  return [
    Math.cos(alt) * Math.sin(az),
    Math.cos(alt) * Math.cos(az),
    Math.sin(alt)
  ];
}

// 3D unit vector from heading/climb angle
function flightDirectionVector(headingDeg, verticalSpeed, speed) {
  if (!speed || speed === 0) return null;
  const heading = toRad(headingDeg);
  const climbAngle = Math.atan2(verticalSpeed || 0, speed); // radians
  return [
    Math.cos(climbAngle) * Math.sin(heading),
    Math.cos(climbAngle) * Math.cos(heading),
    Math.sin(climbAngle)
  ];
}

// Compare angle between flight path and celestial direction
function isHeadingTowardBody3D(plane, bodyAz, bodyAlt, marginDeg = 12) {
  const dirVector = flightDirectionVector(
    plane.heading,
    plane.verticalSpeed || 0,
    plane.speed
  );
  if (!dirVector) return false;

  const targetVector = celestialToVector(bodyAz, bodyAlt);
  const dot = dirVector[0] * targetVector[0] +
              dirVector[1] * targetVector[1] +
              dirVector[2] * targetVector[2];
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot))); // clamp
  const angleDeg = toDeg(angleRad);
  return angleDeg < marginDeg;
}

