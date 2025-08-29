import SunCalc from 'suncalc';

/* =========================
   Helpers & Core Geometry
   ========================= */

/**
 * Projects a moving object’s future position given speed and heading (great-circle).
 * All units are SI: lat/lon in degrees, speed m/s, altitude/verticalSpeed in meters / m/s.
 */
export function projectPosition(lat, lon, heading, speed, seconds, altitude = 0, verticalSpeed = 0) {
  const R = 6371000;
  const d = (speed || 0) * seconds;
  const theta = toRad(heading || 0);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const sdR = Math.sin(d / R);
  const cdR = Math.cos(d / R);

  const sinPhi2 = Math.sin(phi1) * cdR + Math.cos(phi1) * sdR * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);

  const y = Math.sin(theta) * sdR * Math.cos(phi1);
  const x = cdR - Math.sin(phi1) * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const futureAlt = (altitude || 0) + (verticalSpeed || 0) * seconds;

  return { lat: toDeg(phi2), lon: toDeg(lambda2), alt: futureAlt };
}

/**
 * Haversine: ground distance between two coords (meters).
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = phi2 - phi1;
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2
          + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Calculates bearing (azimuth) from observer to target (degrees).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

/**
 * Computes true angular separation between two sky directions (degrees).
 */
export function sphericalSeparation(az1, el1, az2, el2) {
  const a1 = toRad(el1);
  const a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cosSep))));
}

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

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
  if (!speed) return null;
  const heading = toRad(headingDeg || 0);
  const climbAngle = Math.atan2(verticalSpeed || 0, speed);
  return [
    Math.cos(climbAngle) * Math.sin(heading),
    Math.cos(climbAngle) * Math.cos(heading),
    Math.sin(climbAngle)
  ];
}

function isHeadingTowardBody3D(plane, bodyAz, bodyAlt, marginDeg = 12) {
  const dirVector = flightDirectionVector(plane.heading, plane.verticalSpeed || 0, plane.speed);
  if (!dirVector) return false;

  const targetVector = celestialToVector(bodyAz, bodyAlt);
  const dot = dirVector[0] * targetVector[0] + dirVector[1] * targetVector[1] + dirVector[2] * targetVector[2];
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
  const angleDeg = toDeg(angleRad);
  return angleDeg < Math.min(marginDeg, 6); // cap margin for 3D test
}

/**
 * Dynamic margin heuristic: relax slightly when low & slow.
 * altitudeFt, speedKts because that’s how ADS-B folks think about it.
 */
export function getDynamicMargin(baseMargin, altitudeFt = 10000, speedKts = 300) {
  const altFactor = Math.max(0, (1000 - altitudeFt) / 1000);  // 0..1
  const spdFactor = Math.max(0, (150 - speedKts) / 150);      // 0..1
  const altWeight = 1.5;
  const spdWeight = 1.0;
  return baseMargin + (altFactor * altWeight) + (spdFactor * spdWeight);
}

/**
 * Defensive unit normalization so a single bad provider path can't poison geometry.
 * - altitude: meters (if it looks like feet, convert)
 * - speed: m/s (if it looks like knots, convert)
 * - verticalSpeed: m/s (if it looks like ft/min, convert)
 */
function normalizeFlightUnits(f) {
  const out = { ...f };

  if (out.altitude != null && out.altitude > 60000) {        // feet
    out.altitude *= 0.3048;
  }
  if (out.speed != null && out.speed > 400) {                 // knots
    out.speed *= 0.514444;
  }
  if (out.verticalSpeed != null && Math.abs(out.verticalSpeed) > 50) { // fpm
    out.verticalSpeed *= 0.00508;
  }

  return out;
}

/* =========================
   Sun/Moon Transit Detection
   ========================= */

/**
 * Detects flights transiting (or near) a celestial body, now or within predictSeconds.
 */
export function detectTransits({
  flights,
  bodyAz,           // optional if you always call with SunCalc; kept for compatibility
  bodyAlt,          // idem
  margin = 2.5,
  userLat,
  userLon,
  userElev = 0,
  predictSeconds = 0,
  selectedBody,     // 'sun' | 'moon'
  use3DHeading = false,
  useZenithLogic = false,
  useDynamicMargin = false
}) {
  const matches = [];
  const now = Date.now();

  // Normalize units once
  const flightsNormalized = Array.isArray(flights) ? flights.map(normalizeFlightUnits) : [];

  // State for early-alert smoothing
  const matchedCallsigns = new Set();       // confirmed matches only; early alerts don't block
  const previousSeparation = new Map();     // callsign -> last sep
  const closeStreak = new Map();            // callsign -> consecutive improving-sep ticks

  const getBodyPositionAt = (secondsAhead) => {
    const futureTime = new Date(now + secondsAhead * 1000);
    const pos = selectedBody === 'moon'
      ? SunCalc.getMoonPosition(futureTime, userLat, userLon)
      : SunCalc.getPosition(futureTime, userLat, userLon);
    return {
      az: (toDeg(pos.azimuth) + 180) % 360,
      alt: toDeg(pos.altitude)
    };
  };

  const checkTransitsAt = (t) => {
    const { az: futureBodyAz, alt: futureBodyAlt } = getBodyPositionAt(t);

    for (const plane of flightsNormalized) {
      let {
        latitude,
        longitude,
        altitude: geoAlt,
        heading = 0,
        speed,
        verticalSpeed = 0,
        callsign
      } = plane || {};

      if (!latitude || !longitude) continue;
      if (geoAlt == null || geoAlt < 100) continue; // ignore ground/near-ground
      if (matchedCallsigns.has(callsign)) continue;

      // Predict plane forward if using 3D-heading/prediction
      if (use3DHeading && heading != null && speed != null) {
        const proj = projectPosition(latitude, longitude, heading, speed, t, geoAlt, verticalSpeed);
        latitude = proj.lat;
        longitude = proj.lon;
        geoAlt = proj.alt;
      }

      // Margin shaping
      let baseMargin = margin;
      if (useZenithLogic && futureBodyAlt > 80) baseMargin *= 0.8;     // tighter near zenith
      if (selectedBody === 'sun' && futureBodyAlt < 10) {               // Sun low: don't be too tight
        baseMargin = Math.max(baseMargin, 2.5);
      }

      let marginToUse = baseMargin;
      if (useDynamicMargin) {
        const altFt = geoAlt / 0.3048;
        const spdKts = (speed || 0) / 0.514444;
        marginToUse = Math.max(baseMargin, getDynamicMargin(baseMargin, altFt, spdKts));
      }

      // Observer->plane apparent sky position
      const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
      const distance = haversine(userLat, userLon, latitude, longitude);
      const elevationAngle = toDeg(Math.atan2(geoAlt - userElev, distance));

      // Component diffs and true separation
      const azDiff = Math.abs(((azimuth - futureBodyAz + 540) % 360) - 180);
      const altDiff = Math.abs(elevationAngle - futureBodyAlt);
      const isZenith = useZenithLogic && futureBodyAlt > 80;
      const sep = sphericalSeparation(azimuth, elevationAngle, futureBodyAz, futureBodyAlt);

      // Is the motion vector roughly toward the body?
      const headingToBody = Math.abs((((heading - futureBodyAz + 540) % 360) - 180));
      const closingIn = (use3DHeading
        ? isHeadingTowardBody3D({ heading, verticalSpeed, speed }, futureBodyAz, futureBodyAlt, marginToUse)
        : headingToBody < 12);

      // Track trend of separation
      const prevSep = previousSeparation.get(callsign);
      previousSeparation.set(callsign, sep);
      const wasImproving = (prevSep !== undefined) && (prevSep > sep);
      const streak = (closeStreak.get(callsign) || 0);
      const newStreak = wasImproving ? (streak + 1) : 0;
      closeStreak.set(callsign, newStreak);
      const sustainedClosing = newStreak >= 3;  // require >=3 consecutive improving seconds

      // New: altitude-axis agreement requirements
      const altOK_match = altDiff < marginToUse;              // strict for confirmed matches
      const altOK_early = altDiff < (marginToUse + 1.0);      // slightly looser for early pings

      // New: "don't bother" guard — common false-positive geometry (Sun high, plane very low)
      const earlyEligibleHeight = !(selectedBody === 'sun' && futureBodyAlt > 8 && elevationAngle < 4);

      // Decision
      const isMatch =
        (
          (isZenith && sep < marginToUse) ||
          (!isZenith && azDiff < marginToUse && altOK_match)
        ) &&
        (sep < marginToUse || closingIn);

      const approachingSoon =
        !isMatch &&
        sustainedClosing &&
        earlyEligibleHeight &&        // guard poor geometry
        altOK_early &&                // must be close in height too
        sep < (marginToUse + 2.0) &&  // slightly tighter early gate
        closingIn;

      if (isMatch || approachingSoon) {
        matches.push({
          callsign,
          azimuth: +azimuth.toFixed(1),
          altitudeAngle: +elevationAngle.toFixed(1),
          distance: +distance.toFixed(1),
          selectedBody,
          matchInSeconds: t,
          track: heading,
          type: isMatch ? 'match' : 'early'
        });

        if (isMatch) {
          matchedCallsigns.add(callsign); // only block further alerts on confirmed matches
        }
      }
    }
  };

  // Sweep time window every 1 second up to predictSeconds
  for (let t = 0; t <= predictSeconds; t += 1) {
    checkTransitsAt(t);
  }

  return matches;
}

/* =========================
   Plane-on-Plane Detection
   ========================= */

export function detectPlaneOnPlane({
  flights, userLat, userLon, userElev = 0, margin = 10, predictSeconds = 0
}) {
  const R = 6371000;

  function toCartesian(lat, lon, h) {
    const φ = toRad(lat), λ = toRad(lon);
    const x = (R + h) * Math.cos(φ) * Math.cos(λ);
    const y = (R + h) * Math.cos(φ) * Math.sin(λ);
    const z = (R + h) * Math.sin(φ);
    return [x, y, z];
  }

  function enuFromCartesian(px, py, pz, ox, oy, oz) {
    const dx = px - ox, dy = py - oy, dz = pz - oz;
    const φ0 = toRad(userLat), λ0 = toRad(userLon);
    const east  = [-Math.sin(λ0),  Math.cos(λ0), 0];
    const north = [-Math.sin(φ0) * Math.cos(λ0), -Math.sin(φ0) * Math.sin(λ0), Math.cos(φ0)];
    const up    = [ Math.cos(φ0) * Math.cos(λ0),  Math.cos(φ0) * Math.sin(λ0), Math.sin(φ0)];
    const e = dx * east[0]  + dy * east[1]  + dz * east[2];
    const n = dx * north[0] + dy * north[1] + dz * north[2];
    const u = dx * up[0]    + dy * up[1]    + dz * up[2];
    return [e, n, u];
  }

  function getAzEl(lat, lon, alt) {
    const [ox, oy, oz] = toCartesian(userLat, userLon, userElev);
    const [px, py, pz] = toCartesian(lat, lon, alt);
    const [e, n, u] = enuFromCartesian(px, py, pz, ox, oy, oz);
    const az = (Math.atan2(e, n) * 180 / Math.PI + 360) % 360;
    const el = Math.atan2(u, Math.sqrt(e * e + n * n)) * 180 / Math.PI;
    return [az, el];
  }

  const matches = [];

  // (Optional) simple projection loop for predictSeconds; for now use t=0 only
  // You can expand to project each plane like detectTransits if desired.

  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const f1 = normalizeFlightUnits(flights[i] || {});
      const f2 = normalizeFlightUnits(flights[j] || {});
      if (!f1 || !f2) continue;

      const a1 = f1.altitude || 0;
      const a2 = f2.altitude || 0;

      if (a1 < 100 || a2 < 100) continue; // ignore near-ground

      const [az1, el1] = getAzEl(proj1.lat, proj1.lon, proj1.alt);
      const [az2, el2] = getAzEl(proj2.lat, proj2.lon, proj2.alt);


      const dAz = toRad(az1 - az2);
      const el1r = toRad(el1), el2r = toRad(el2);
      const cosSep = Math.sin(el1r) * Math.sin(el2r) + Math.cos(el1r) * Math.cos(el2r) * Math.cos(dAz);
      const sep = toDeg(Math.acos(Math.max(-1, Math.min(1, cosSep))));

      const verticalSepMeters = Math.abs(a1 - a2);
      const VERT_SEP_M = 4000 * 0.3048; // 4000 ft (~1219.2 m)

      if (sep < margin && verticalSepMeters < VERT_SEP_M) {
        matches.push({
          pair: [f1, f2],
          angularSeparation: sep,
          verticalSeparation: verticalSepMeters
        });
      }
    }
  }

  return matches;
}
