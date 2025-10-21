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
 * Low-altitude strictness engages only when body alt <= ~10°, preserving high-alt behavior.
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
  // ---- Low-altitude strictness knobs (per body) ----
  const STRICT = { sun: true, moon: true };         // enable strict low-alt mode per body
  const LOW_ALT_DEG = { sun: 10, moon: 10 };        // below this, be stricter
  const SEP_CAP_LOW = { sun: 1.2, moon: 1.2 };      // max true separation for confirmed hit (deg)
  const ALT_CAP_LOW = { sun: 1.0, moon: 1.0 };      // max vertical diff (deg) for confirmed hit
  const EARLY_PAD_LOW = { sun: 0.5, moon: 0.5 };    // early-alert extra pad when low
  const OFF_EARLY_BELOW = { sun: 4, moon: 6 };      // disable early pings entirely below this alt
  const HEADING_GATE_LOW = { sun: 8, moon: 8 };     // tighter heading gate when low

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
    const target = (selectedBody === 'moon') ? 'moon' : 'sun';
    const lowBodyActive = STRICT[target] && (futureBodyAlt <= LOW_ALT_DEG[target]);

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
      if (selectedBody === 'sun' && futureBodyAlt < 10) {               // keep your existing heuristic
        baseMargin = Math.max(baseMargin, 2.0);
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
      const headingGate = lowBodyActive ? HEADING_GATE_LOW[target] : 12;
      const closingIn = (use3DHeading
        ? isHeadingTowardBody3D({ heading, verticalSpeed, speed }, futureBodyAz, futureBodyAlt, marginToUse)
        : headingToBody < headingGate);

      // Track trend of separation
      const prevSep = previousSeparation.get(callsign);
      previousSeparation.set(callsign, sep);
      const wasImproving = (prevSep !== undefined) && (prevSep > sep);
      const streak = (closeStreak.get(callsign) || 0);
      const newStreak = wasImproving ? (streak + 1) : 0;
      closeStreak.set(callsign, newStreak);
      const sustainedClosing = newStreak >= 3;  // require >=3 consecutive improving seconds

      // Altitude-axis agreement requirements
      const altOK_match = altDiff < marginToUse;              // strict for confirmed matches
      const altOK_early = altDiff < (marginToUse + 1.0);      // slightly looser for early pings

      // "don't bother" guard — common false-positive geometry (Sun high, plane very low)
      const earlyEligibleHeight = !(selectedBody === 'sun' && futureBodyAlt > 8 && elevationAngle < 4);

      // Body-agnostic low-alt vertical sanity (pre-existing idea, reused)
      const lowBodyVerticalOK =
        (futureBodyAlt >= 35) ||
        (Math.abs(elevationAngle - futureBodyAlt) <= Math.min(2, 0.5 * marginToUse));

      // Low-alt caps for confirmed matches
      const confirmSepCap = lowBodyActive ? Math.min(marginToUse, SEP_CAP_LOW[target]) : marginToUse;
      const altCap        = lowBodyActive ? Math.min(marginToUse, ALT_CAP_LOW[target]) : marginToUse;

      // Decision: confirmed match
      const isMatch =
        (
          (isZenith && sep < confirmSepCap) ||
          (!isZenith && azDiff < marginToUse && altDiff < altCap)
        ) &&
        // when low: require actual sep inside the cap (no heading bypass here)
        (lowBodyActive ? (sep < confirmSepCap) : (sep < marginToUse || closingIn));

      // Decision: early alert (stricter when low, or disabled very low)
      const earlySepPad = lowBodyActive ? EARLY_PAD_LOW[target] : 2.0;
      const allowEarly  = !(STRICT[target] && futureBodyAlt < OFF_EARLY_BELOW[target]);

      const approachingSoon =
        allowEarly &&
        !isMatch &&
        sustainedClosing &&
        earlyEligibleHeight &&
        altOK_early &&
        lowBodyVerticalOK &&
        sep < (marginToUse + earlySepPad) &&
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

export function detectPlaneOnPlane({ flights, userLat, userLon, userElev = 0, margin = 10 }) {
  const R = 6371000;
  const toCartesian = (lat, lon, h) => {
    const φ = toRad(lat), λ = toRad(lon);
    return [
      (R + h) * Math.cos(φ) * Math.cos(λ),
      (R + h) * Math.cos(φ) * Math.sin(λ),
      (R + h) * Math.sin(φ)
    ];
  };

  const enuFromCartesian = (px, py, pz, ox, oy, oz) => {
    const dx = px - ox, dy = py - oy, dz = pz - oz;
    const φ0 = toRad(userLat), λ0 = toRad(userLon);
    const east = [-Math.sin(λ0), Math.cos(λ0), 0];
    const north = [-Math.sin(φ0) * Math.cos(λ0), -Math.sin(φ0) * Math.sin(λ0), Math.cos(φ0)];
    const up = [Math.cos(φ0) * Math.cos(λ0), Math.cos(φ0) * Math.sin(λ0), Math.sin(φ0)];
    return [
      dx * east[0] + dy * east[1] + dz * east[2],
      dx * north[0] + dy * north[1] + dz * north[2],
      dx * up[0] + dy * up[1] + dz * up[2]
    ];
  };

  const getAzEl = (lat, lon, alt) => {
    const [ox, oy, oz] = toCartesian(userLat, userLon, userElev);
    const [px, py, pz] = toCartesian(lat, lon, alt);
    const [e, n, u] = enuFromCartesian(px, py, pz, ox, oy, oz);
    return [
      (Math.atan2(e, n) * 180 / Math.PI + 360) % 360,
      Math.atan2(u, Math.sqrt(e ** 2 + n ** 2)) * 180 / Math.PI
    ];
  };

  const matches = [];
  const flightsNorm = flights.map(normalizeFlightUnits);
  const VERT_SEP_M = 1219.2; // 4000 ft

  for (let i = 0; i < flightsNorm.length; i++) {
    for (let j = i + 1; j < flightsNorm.length; j++) {
      const f1 = flightsNorm[i];
      const f2 = flightsNorm[j];
      const a1 = f1.altitude || 0, a2 = f2.altitude || 0;
      if ((a1 - userElev) < 100 || (a2 - userElev) < 100) continue;

      const [az1, el1] = getAzEl(f1.latitude, f1.longitude, a1);
      const [az2, el2] = getAzEl(f2.latitude, f2.longitude, a2);
      const sep = sphericalSeparation(az1, el1, az2, el2);
      const vertSep = Math.abs(a1 - a2);

      if (sep < margin && vertSep < VERT_SEP_M) {
        matches.push({
          pair: [f1, f2],
          angularSeparation: sep,
          verticalSeparation: vertSep
        });
      }
    }
  }

  return matches;
}
