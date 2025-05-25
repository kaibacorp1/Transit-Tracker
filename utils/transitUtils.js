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
    altitude:  s[7] ?? 0,
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
    heading:  0,
    speed:    (f.speed?.horizontal ?? 0) * 0.51444
  }));
}

/**
 * Map ADS-B Exchange records to unified flight objects.
 */
export function mapAdsbExchange(records) {
  return records.map(ac => ({
    callsign:  ac.lp || ac.flight || 'N/A',
    lat:       ac.lat,
    lon:       ac.lon,
    altitude: ac.alt_geom ?? 0,
    heading:  ac.track    ?? 0,
    speed:    ac.spd      ?? 0
  }));
}

/**
 * Compute true angular separation Δθ (degrees) between two sky directions.
 */
function angularSeparation(A1, h1, A2, h2) {
  const toRad = Math.PI / 180;
  const As = A1 * toRad, hs = h1 * toRad;
  const Ap = A2 * toRad, hp = h2 * toRad;

  const cosd =
    Math.sin(hs) * Math.sin(hp) +
    Math.cos(hs) * Math.cos(hp) * Math.cos(As - Ap);

  return Math.acos(Math.max(-1, Math.min(1, cosd))) * 180 / Math.PI;
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
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Calculate azimuth from observer to target (degrees).
 */
export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Detect full and near-miss transits of the Sun/Moon.
 */
export function detectTransits({ flights, userLat, userLon, userElev, bodyAz, bodyAlt, margin = 2.5 }) {
  const matches = [];

  for (const flight of flights) {
    let { lat: fLat, lon: fLon, altitude: fAlt } = flight;

    // Compute az/el from observer
    const az = calculateAzimuth(userLat, userLon, fLat, fLon);
    const dist = haversine(userLat, userLon, fLat, fLon);
    const el = Math.atan2(fAlt - userElev, dist) * (180 / Math.PI);

    // Box pre-filter
    const raw = normalizeAngle(az - bodyAz);
    const azDiff = raw > 180 ? 360 - raw : raw;
    const altDiff = Math.abs(el - bodyAlt);
    if (azDiff < margin && altDiff < margin) {
      const sep = angularSeparation(bodyAz, bodyAlt, az, el);
      if (sep < RADIUS_DISK_DEG) {
        matches.push({ flight, type: 'full', sep });
      } else if (sep < RADIUS_DISK_DEG + margin) {
        matches.push({ flight, type: 'near-miss', sep });
      }
    }
  }
  return matches;
}
