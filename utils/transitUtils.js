// utils/transitUtils.js

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

export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
          - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Detect transits among an array of OpenSky state vectors.
 * Each `f` is an array: [ , callsign, , , , lon, lat, , , speed, track, ... , alt_geom, ... ]
 */
export function detectTransits({
  flights,
  userLat,
  userLon,
  userElev,
  bodyAz,
  bodyAlt,
  margin = 2.5,
  predictSeconds = 0
}) {
  const matches = [];

  flights.forEach(f => {
    const callsign = (f[1] || '').trim();
    const lon      = f[5];
    const lat      = f[6];
    const geoAlt   = f[13] || 0;
    const speed    = f[9];
    const track    = f[10];

    if (lat == null || lon == null) return;

    // Project position if requested
    let targetLat = lat;
    let targetLon = lon;
    if (predictSeconds > 0 && track != null && speed != null) {
      const proj = projectPosition(lat, lon, track, speed, predictSeconds);
      targetLat = proj.lat;
      targetLon = proj.lon;
    }

    // Compute geometry
    const azToPlane = calculateAzimuth(userLat, userLon, targetLat, targetLon);
    const horizDist = haversine(userLat, userLon, targetLat, targetLon);
    const elevAngle = Math.atan2(geoAlt - userElev, horizDist) * 180 / Math.PI;
    const azDiff    = Math.abs(normalizeAngle(azToPlane - bodyAz));
    const altDiff   = Math.abs(elevAngle - bodyAlt);

    // DEBUG log for each flight
    console.log(
      `[DEBUG ${callsign}] ` +
      `orig=(${lat.toFixed(4)}, ${lon.toFixed(4)}) ` +
      `proj=(${targetLat.toFixed(4)}, ${targetLon.toFixed(4)}) ` +
      `azToPlane=${azToPlane.toFixed(1)}°, elevAngle=${elevAngle.toFixed(1)}°, ` +
      `azDiff=${azDiff.toFixed(1)}°, altDiff=${altDiff.toFixed(1)}°, ` +
      `margin=${margin}`
    );

    // Test against your margin
    if (azDiff < margin && altDiff < margin) {
      matches.push({
        callsign,
        azimuth:       azToPlane,
        altitudeAngle: elevAngle
      });
    }
  });

  return matches;
}
