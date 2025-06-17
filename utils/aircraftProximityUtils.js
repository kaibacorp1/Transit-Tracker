// utils/aircraftProximityUtils.js

/**
 * Detect aircraft flying within a certain margin (meters) and altitude difference.
 * Designed for "plane on plane" mode.
 */
window.detectAircraftOverlap = function detectAircraftOverlap(flights, margin = 300) {
  const pairs = [];

  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const a = flights[i];
      const b = flights[j];

      if (!a || !b || !a.latitude || !b.latitude || !a.longitude || !b.longitude) continue;

      const dist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
      const altDiff = Math.abs((a.altitude || 0) - (b.altitude || 0));

      // Photo-worthy proximity: < 300 meters horizontally & < 1000m vertical
      if (dist < margin && altDiff < 1000) {
        pairs.push([
          a.callsign || '✈️A',
          b.callsign || '✈️B',
          dist.toFixed(1)
        ]);
      }
    }
  }

  return pairs;
};

/**
 * Returns ground distance in meters between two lat/lon points.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
