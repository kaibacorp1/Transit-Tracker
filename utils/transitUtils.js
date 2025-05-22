// utils/transitUtils.js

function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
  const d = speed * seconds;
  const θ = heading * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d / R) +
    Math.cos(φ1) * Math.sin(d / R) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d / R) * Math.cos(φ1),
    Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2));

  return {
    lat: φ2 * 180 / Math.PI,
    lon: λ2 * 180 / Math.PI
  };
}

function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function detectTransits({ flights, userLat, userLon, userElev, bodyAz, bodyAlt, predictSeconds = 0, margin = 2.5, selectedBody = 'moon' }) {
  const matches = [];

  for (const plane of flights) {
    const callsign = plane[1];
    const lat = plane[6];
    const lon = plane[5];
    const geoAlt = plane[13] || 0;
    const heading = plane[10];
    const speed = plane[9];

    if (lat == null || lon == null || geoAlt == null) continue;

    let targetLat = lat;
    let targetLon = lon;

    if (predictSeconds > 0 && heading != null && speed != null) {
      const projected = projectPosition(lat, lon, heading, speed, predictSeconds);
      targetLat = projected.lat;
      targetLon = projected.lon;
    }

    const azimuth = calculateAzimuth(userLat, userLon, targetLat, targetLon);
    const distance = haversine(userLat, userLon, targetLat, targetLon);
    const angle = Math.atan2(geoAlt - userElev, distance) * (180 / Math.PI);
    const azDiff = Math.abs(normalizeAngle(azimuth - bodyAz));
    const altDiff = Math.abs(angle - bodyAlt);

    if (azDiff < margin && altDiff < margin) {
      matches.push({
        callsign,
        azimuth: azimuth.toFixed(1),
        altitudeAngle: angle.toFixed(1),
        distance: distance.toFixed(1),
        selectedBody,
        predictionSeconds
      });
    }
  }

  return matches;
}

module.exports = {
  detectTransits
};
