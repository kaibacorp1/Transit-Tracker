// utils/transitUtils.js

// Angular radius of the Sun/Moon in degrees
const RADIUS_DISK_DEG = 0.25;

/**
 * Map OpenSky states array to unified flight objects.
 */
export function mapOpenSkyStates(states) {
  return states.map(s => ({
    callsign:  (s[1] || '').trim() || 'N/A',
    lat:       s[6],
    lon:       s[5],
    altitude:  s[7]  ?? 0,
    heading:   s[10] ?? 0,
    speed:     s[9]  ?? 0
  }));
}

/**
 * Map Aviationstack API data to unified flight objects.
 */
export function mapAviationstack(dataArray) {
  return dataArray.map(f => ({
    callsign:  f.flight?.iata || f.flight?.icao || 'N/A',
    lat:       f.latitude,
    lon:       f.longitude,
    altitude: (f.altitude ?? 0) * 0.3048,
    heading:  0,  // not provided reliably
    speed:    (f.speed?.horizontal ?? 0) * 0.51444
  }));
}

/**
 * Map ADS-B Exchange records to unified flight objects.
 */
export function mapAdsbExchange(records) {
  return records.map(ac => ({
    callsign:  ac.lp     || ac.flight || 'N/A',
    lat:       ac.lat,
    lon:       ac.lon,
    altitude: ac.alt_geom ?? 0,
    heading:  ac.track    ?? 0,
    speed:    ac.spd      ?? 0
  }));
}

/**
 * Compute great-circle distance (meters) between two geo points.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI/180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/**
 * Calculate azimuth from observer to target (degrees).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI/180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x)*180/Math.PI + 360) % 360;
}

/**
 * Project a flight position after `seconds` given heading & speed.
 */
export function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
  const d = speed * seconds;
  const θ = heading * Math.PI/180;
  const φ1 = lat  * Math.PI/180;
  const λ1 = lon  * Math.PI/180;
  const φ2 = Math.asin(
    Math.sin(φ1)*Math.cos(d/R) +
    Math.cos(φ1)*Math.sin(d/R)*Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ)*Math.sin(d/R)*Math.cos(φ1),
    Math.cos(d/R) - Math.sin(φ1)*Math.sin(φ2)
  );
  return { lat: φ2*180/Math.PI, lon: λ2*180/Math.PI };
}

/**
 * Normalize an angle into [0,360) degrees.
 */
export function normalizeAngle(angle) {
  return ((angle%360)+360) % 360;
}

/**
 * Compute true angular separation Δθ (degrees) between two sky directions.
 */
function angularSeparation(A1, h1, A2, h2) {
  const toRad = x => x * Math.PI/180;
  const As = toRad(A1), hs = toRad(h1);
  const Ap = toRad(A2), hp = toRad(h2);
  const cosd =
    Math.sin(hs)*Math.sin(hp) +
    Math.cos(hs)*Math.cos(hp)*Math.cos(As - Ap);
  return Math.acos(Math.max(-1, Math.min(1, cosd))) * 180/Math.PI;
}

/**
 * Detect full and near-miss transits.
 */
export function detectTransits({
  flights,
  userLat,
  userLon,
  userElev = 0,
  bodyAz,
  bodyAlt,
  margin = 2.5,
  predictSeconds = 0
}) {
  const matches = [];

  for (let f of flights) {
    let { lat, lon, altitude, heading, speed } = f;

    // optionally project forward
    if (predictSeconds > 0 && heading != null && speed != null) {
      ({ lat, lon } = projectPosition(lat, lon, heading, speed, predictSeconds));
    }

    // compute bearing & elevation
    const az = calculateAzimuth(userLat, userLon, lat, lon);
    const dist = haversine(userLat, userLon, lat, lon);
    const el = Math.atan2(altitude - userElev, dist) * 180/Math.PI;

    // coarse az/el box
    let raw = normalizeAngle(az - bodyAz);
    const azDiff  = raw > 180 ? 360 - raw : raw;
    const altDiff = Math.abs(el - bodyAlt);
    if (azDiff > margin || altDiff > margin) continue;

    // precise separation
    const sep = angularSeparation(bodyAz, bodyAlt, az, el);

    // full silhouette
    if (sep < RADIUS_DISK_DEG) {
      matches.push({ flight: f, type: 'full', sep });
    }
    // near-miss
    else if (sep < RADIUS_DISK_DEG + margin) {
      matches.push({ flight: f, type: 'near-miss', sep });
    }
  }

  return matches;
}
