import SunCalc from 'suncalc';

/**
 * Projects a moving object’s future position given speed and heading
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
  const cosSep = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
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
  selectedBody,
  use3DHeading = false,
  useZenithLogic = false,   // ✅ NEW
  useDynamicMargin = false  // ✅ NEW
}) {
  const matches = [];
  const MIN_ALTITUDE_FEET = 50;  // Min altitude
  const now = Date.now();

  const getBodyPositionAt = (secondsAhead) => {
    const futureTime = new Date(now + secondsAhead * 1000);
    const pos = selectedBody === 'moon'
      ? SunCalc.getMoonPosition(futureTime, userLat, userLon)
      : SunCalc.getPosition(futureTime, userLat, userLon);
    return {
      az: (pos.azimuth * 180 / Math.PI + 180) % 360,
      alt: pos.altitude * 180 / Math.PI
    };
  };

  const checkTransitsAt = (t) => {
    const { az: futureBodyAz, alt: futureBodyAlt } = getBodyPositionAt(t);

    for (const plane of flights) {
      let {
        latitude,
        longitude,
        altitude: geoAlt,
        heading = 0,
        speed,
        verticalSpeed = 0,
        callsign
      } = plane;

      if (geoAlt < MIN_ALTITUDE_FEET) continue;

      if (use3DHeading && t > 0 && heading != null && speed != null) {
        const proj = projectPosition(latitude, longitude, heading, speed, t, geoAlt, verticalSpeed);
        latitude = proj.lat;
        longitude = proj.lon;
        geoAlt = proj.alt;
      }

if (useZenithLogic && futureBodyAlt > 80) {
  margin = margin * 0.8;
}

      
let marginToUse = margin;
if (useDynamicMargin) {
  const altFt = geoAlt;
  const spdKts = speed;
  marginToUse = getDynamicMargin(margin, altFt, spdKts);
}
      
      const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
      const distance = haversine(userLat, userLon, latitude, longitude);
      const elevationAngle = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;

      const azDiff = Math.abs(((azimuth - futureBodyAz + 540) % 360) - 180);
      const altDiff = Math.abs(elevationAngle - futureBodyAlt);

      const isZenith = useZenithLogic && futureBodyAlt > 80;
const sep = sphericalSeparation(azimuth, elevationAngle, futureBodyAz, futureBodyAlt);

if (
  (isZenith && sep < marginToUse) ||
  (!isZenith && azDiff < marginToUse && altDiff < marginToUse)
) {
  const headingToBody = Math.abs((((heading - futureBodyAz + 540) % 360) - 180));
  const isMatch = (
  sep < marginToUse ||
  (use3DHeading
    ? isHeadingTowardBody3D({
        heading,
        verticalSpeed,
        speed
      }, futureBodyAz, futureBodyAlt, margin)
    : headingToBody < 12)
);

  if (isMatch) {
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
  };

  // always just check once, exactly as in the old app
  checkTransitsAt(predictSeconds);

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

function celestialToVector(azimuthDeg, altitudeDeg) {
  const az = toRad(azimuthDeg);
  const alt = toRad(altitudeDeg);
  return [
    Math.cos(alt) * Math.sin(az),
    Math.cos(alt) * Math.cos(az),
    Math.sin(alt)
  ];
}

function flightDirectionVector(headingDeg, verticalSpeed, speed) {
  if (!speed || speed === 0) return null;
  const heading = toRad(headingDeg);
  const climbAngle = Math.atan2(verticalSpeed || 0, speed);
  return [
    Math.cos(climbAngle) * Math.sin(heading),
    Math.cos(climbAngle) * Math.cos(heading),
    Math.sin(climbAngle)
  ];
}

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
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
  const angleDeg = toDeg(angleRad);
  return angleDeg < marginDeg;
}

export function getDynamicMargin(baseMargin, altitudeFt = 10000, speedKts = 300) {
  const altFactor = Math.max(0, (1000 - altitudeFt) / 1000);  // 0 to 1
  const spdFactor = Math.max(0, (150 - speedKts) / 150);      // 0 to 1
  const altWeight = 1.5;
  const spdWeight = 1.0;
  return baseMargin + (altFactor * altWeight) + (spdFactor * spdWeight);
}

///

// utils/transitUtils.js

// Existing placeholder function — unchanged
async function analyzeTransitVideo(videoBuffer) {
    return {
        status: 'success',
        message: 'Transit detection not implemented.',
        length: videoBuffer.length
    };
}

// New: Plane-on-plane detection logic
async function detectPlaneOnPlane(planeList, observer) {
    const MAX_ANGULAR_SEPARATION = 2.5; // degrees
    const MAX_VERTICAL_SEPARATION = 4000; // feet
    const MAX_SLANT_DISTANCE_KM = 40; // ignore planes far from observer

    const results = [];

    for (let i = 0; i < planeList.length; i++) {
        for (let j = i + 1; j < planeList.length; j++) {
            const plane1 = planeList[i];
            const plane2 = planeList[j];

            const a1 = getAzEl(observer, plane1);
            const a2 = getAzEl(observer, plane2);

            const angularSeparation = getAngularSeparation(a1.az, a1.el, a2.az, a2.el);
            const verticalSeparation = Math.abs(plane1.alt - plane2.alt);

            const d1 = getSlantDistance(observer, plane1);
            const d2 = getSlantDistance(observer, plane2);

            const headingDiff = Math.abs(plane1.track - plane2.track);

            if (
                angularSeparation <= MAX_ANGULAR_SEPARATION &&
                verticalSeparation <= MAX_VERTICAL_SEPARATION &&
                d1 <= MAX_SLANT_DISTANCE_KM &&
                d2 <= MAX_SLANT_DISTANCE_KM
            ) {
                results.push({
                    transitStatus: 'planeOnPlaneTransit',
                    aircraft: [plane1, plane2],
                    angularSeparation,
                    verticalSeparation,
                    headingDifference: headingDiff
                });
            }
        }
    }

    return results;
}

// Utility: Convert degrees to radians
function toRad(deg) {
    return deg * Math.PI / 180;
}

// Calculate azimuth and elevation from observer to aircraft
function getAzEl(observer, plane) {
    const dLat = toRad(plane.lat - observer.lat);
    const dLon = toRad(plane.lon - observer.lon);
    const observerLatRad = toRad(observer.lat);
    const planeLatRad = toRad(plane.lat);

    const y = Math.sin(dLon) * Math.cos(planeLatRad);
    const x = Math.cos(observerLatRad) * Math.sin(planeLatRad) -
              Math.sin(observerLatRad) * Math.cos(planeLatRad) * Math.cos(dLon);

    const az = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    const earthRadius = 6371; // km
    const planeAltKm = plane.alt * 0.0003048;
    const groundDistKm = getGroundDistance(observer, plane);

    const el = Math.atan2(planeAltKm - observer.alt, groundDistKm) * 180 / Math.PI;

    return { az, el };
}

// Compute angular separation in the sky
function getAngularSeparation(az1, el1, az2, el2) {
    const dAz = toRad(az2 - az1);
    const sinEl1 = Math.sin(toRad(el1));
    const sinEl2 = Math.sin(toRad(el2));
    const cosEl1 = Math.cos(toRad(el1));
    const cosEl2 = Math.cos(toRad(el2));

    return Math.acos(sinEl1 * sinEl2 + cosEl1 * cosEl2 * Math.cos(dAz)) * 180 / Math.PI;
}

// Compute ground (2D) distance
function getGroundDistance(p1, p2) {
    const R = 6371; // Earth radius in km
    const dLat = toRad(p2.lat - p1.lat);
    const dLon = toRad(p2.lon - p1.lon);
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compute slant (3D) distance from observer to plane
function getSlantDistance(observer, plane) {
    const groundDist = getGroundDistance(observer, plane);
    const verticalDist = Math.abs((plane.alt - observer.alt) * 0.0003048);
    return Math.sqrt(groundDist ** 2 + verticalDist ** 2);
}

module.exports = {
    analyzeTransitVideo,
    detectPlaneOnPlane
};
