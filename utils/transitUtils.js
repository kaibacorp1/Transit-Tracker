// utils/transitUtils.js
import SunCalc from 'suncalc';

/* ----------------------- helpers & tiny optics fixes ---------------------- */

// Standard atmospheric refraction (Bennett) in *degrees*.
// Input/Output: altitude in degrees (matches what eyes/cameras see near horizon)
function refractDeg(altDeg) {
  const alt = Math.max(altDeg, -1); // avoid blow-up just under horizon
  const R_arcmin = 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * Math.PI / 180);
  return alt + (R_arcmin / 60); // arcminutes -> degrees
}

// Let “edge-graze” count (apparent disk radius of Sun/Moon ≈ 16′)
const DISK_ALLOWANCE_DEG = 0.27;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

/* ------------------------------ geo helpers ------------------------------- */

/** Projects a moving object’s future position given speed and heading */
export function projectPosition(lat, lon, heading, speed, seconds, altitude = 0, verticalSpeed = 0) {
  const R = 6371000;
  const d = speed * seconds;
  const theta = toRad(heading || 0);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d / R) +
    Math.cos(phi1) * Math.sin(d / R) * Math.cos(theta)
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(d / R) * Math.cos(phi1),
    Math.cos(d / R) - Math.sin(phi1) * Math.sin(phi2)
  );

  const futureAlt = altitude + (verticalSpeed || 0) * seconds;
  return { lat: toDeg(phi2), lon: toDeg(lambda2), alt: futureAlt };
}

/** Computes true angular separation between two sky directions (degrees). */
export function sphericalSeparation(az1, el1, az2, el2) {
  const a1 = toRad(el1);
  const a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return toDeg(Math.acos(Math.max(-1, Math.min(1, cosSep))));
}

/** Haversine: ground distance between two coords (meters). */
export function haversine(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = phi2 - phi1;
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2
          + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Calculates bearing (azimuth) from observer to target (degrees). */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2)
          - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

/* -------------------------- heading/3D helpers --------------------------- */

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
  const heading = toRad(headingDeg || 0);
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
  return angleDeg < Math.min(marginDeg, 6); // keep tight to avoid “turn” noise
}

/** Optional tiny relaxer for very low & slow planes (prevents too-late alerts) */
export function getDynamicMargin(baseMargin, altitudeFt = 10000, speedKts = 300) {
  const altFactor = Math.max(0, (1000 - altitudeFt) / 1000);  // 0..1
  const spdFactor = Math.max(0, (150 - speedKts) / 150);      // 0..1
  const altWeight = 1.5;
  const spdWeight = 1.0;
  return baseMargin + (altFactor * altWeight) + (spdFactor * spdWeight);
}

/* ----------------------------- core: transits ----------------------------- */

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
  useZenithLogic = false,
  useDynamicMargin = false
}) {
  const matches = [];
  const now = Date.now();

  // Robust per-plane state (dup/blank callsigns exist)
  const matchedCallsigns = new Set();       // keys we've already confirmed
  const previousSeparation = new Map();     // key -> last sep (deg)
  const closeStreak = new Map();            // key -> consecutive “getting closer” ticks

  const getBodyPositionAt = (secondsAhead) => {
    // Reuse caller’s “now” to avoid tiny drift at t=0
    if (secondsAhead === 0 && typeof bodyAz === 'number' && typeof bodyAlt === 'number') {
      return { az: bodyAz, alt: bodyAlt };
    }
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
    const { az: futureBodyAzRaw, alt: futureBodyAltRaw } = getBodyPositionAt(t);

    // Apply refraction so the body altitude matches what you *see*
    const futureBodyAz = futureBodyAzRaw;
    const futureBodyAlt = refractDeg(futureBodyAltRaw);

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

      if (geoAlt < 100) continue;                 // ignore ground traffic/noise
      if (!latitude || !longitude) continue;

      // Robust key: callsign if non-empty else lat/lon fallback
      const key = (callsign && callsign.trim())
        ? callsign.trim()
        : `${Number(latitude).toFixed(3)},${Number(longitude).toFixed(3)}`;

      if (matchedCallsigns.has(key)) continue;

      // Optional kinematics projection if enabled/predicting
      if (use3DHeading && heading != null && speed != null) {
        const proj = projectPosition(latitude, longitude, heading, speed, t, geoAlt, verticalSpeed);
        latitude = proj.lat;
        longitude = proj.lon;
        geoAlt = proj.alt;
      }

      // Start at user margin; slightly tighten at zenith (no “low Sun loosen”)
      let baseMargin = margin;
      if (useZenithLogic && futureBodyAlt > 80) {
        baseMargin *= 0.8;
      }

      // Optional: tiny relaxation at very low & slow
      let marginToUse = baseMargin;
      if (useDynamicMargin) {
        const altFt = geoAlt / 0.3048;
        const spdKts = speed / 0.514444;
        const dynamic = getDynamicMargin(baseMargin, altFt, spdKts);
        marginToUse = Math.max(baseMargin, dynamic);
      }

      // Apparent direction from observer (with refraction on the plane’s elevation)
      const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
      const distance = haversine(userLat, userLon, latitude, longitude);
      const elevationTrue = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;
      const elevationAngle = refractDeg(elevationTrue);

      // True angular separation in the sky
      const sep = sphericalSeparation(azimuth, elevationAngle, futureBodyAz, futureBodyAlt);

      // Single clean gate: user margin + small disk edge allowance
      const sepThreshold = marginToUse + DISK_ALLOWANCE_DEG;

      // Is the plane heading toward the body?
      const headingToBody = Math.abs((((heading - futureBodyAz + 540) % 360) - 180));
      const closingIn = (use3DHeading
        ? isHeadingTowardBody3D({ heading, verticalSpeed, speed }, futureBodyAz, futureBodyAlt, marginToUse)
        : headingToBody < 12);

      // Streak of “getting closer” (reduces jittery early pings)
      const prevSep = previousSeparation.get(key);
      previousSeparation.set(key, sep);
      const wasImproving = (prevSep !== undefined) && (prevSep > sep - 0.02);
      const streak = (closeStreak.get(key) || 0);
      const newStreak = wasImproving ? (streak + 1) : 0;
      closeStreak.set(key, newStreak);
      const sustainedClosing = newStreak >= 2;

      // Decision
      const isMatch = sep <= sepThreshold;

      const approachingSoon = (
        !isMatch &&
        sustainedClosing &&            // ≥ 2 consecutive seconds getting closer
        sep <= (sepThreshold + 0.7) && // tiny buffer over the threshold
        closingIn
      );

      if (isMatch || approachingSoon) {
        matches.push({
          callsign,
          azimuth: Number(azimuth.toFixed(1)),
          altitudeAngle: Number(elevationAngle.toFixed(1)),
          distance: Number(distance.toFixed(1)),
          selectedBody,
          matchInSeconds: t,
          track: heading,
          type: isMatch ? "match" : "early"
        });

        if (isMatch) {
          matchedCallsigns.add(key);   // only block confirmed matches
        }
      }
    }
  };

  // Sweep every 1s up to predictSeconds
  for (let t = 0; t <= predictSeconds; t += 1) {
    checkTransitsAt(t);
  }

  return matches;
}

/* ------------------------ PLANE ON PLANE (unchanged) ---------------------- */

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
    const east = [-Math.sin(λ0), Math.cos(λ0), 0];
    const north = [-Math.sin(φ0) * Math.cos(λ0), -Math.sin(φ0) * Math.sin(λ0), Math.cos(φ0)];
    const up = [Math.cos(φ0) * Math.cos(λ0), Math.cos(φ0) * Math.sin(λ0), Math.sin(φ0)];
    const e = dx * east[0] + dy * east[1] + dz * east[2];
    const n = dx * north[0] + dy * north[1] + dz * north[2];
    const u = dx * up[0] + dy * up[1] + dz * up[2];
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
  const VERT_SEP_M = 4000 * 0.3048; // 4000 ft in meters (~1219.2 m)

  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const f1 = flights[i];
      const f2 = flights[j];
      if (!f1 || !f2) continue;

      const alt1 = f1.altitude || 0;
      const alt2 = f2.altitude || 0;
      if (alt1 < 100 || alt2 < 100) continue;

      const [az1, el1] = getAzEl(f1.latitude, f1.longitude, alt1); // meters
      const [az2, el2] = getAzEl(f2.latitude, f2.longitude, alt2); // meters

      const dAz = toRad(az1 - az2);
      const el1r = toRad(el1), el2r = toRad(el2);
      const cosSep = Math.sin(el1r) * Math.sin(el2r) + Math.cos(el1r) * Math.cos(el2r) * Math.cos(dAz);
      const sep = toDeg(Math.acos(Math.max(-1, Math.min(1, cosSep))));

      const verticalSepMeters = Math.abs(alt1 - alt2);

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
