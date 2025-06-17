// utils/aircraftProximityUtils.js

/**
 * Detect aircraft flying within a certain angular margin of each other.
 * Includes optional altitude check for visual overlap.
 * 
 * Returns an array of close pairings.
 */

export function detectAircraftOverlap(flights, margin = 2.5) {
  const results = [];

  for (let i = 0; i < flights.length; i++) {
    for (let j = i + 1; j < flights.length; j++) {
      const a = flights[i];
      const b = flights[j];

      if (!a || !b || !a.latitude || !b.latitude || !a.longitude || !b.longitude) continue;

      const separation = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
      const altitudeDiff = Math.abs((a.altitude || 0) - (b.altitude || 0));

      // Approximate threshold for visual/photo-worthy proximity
      if (separation < 300 && altitudeDiff < 1000) {
        results.push([a.callsign || '❓', b.callsign || '❓', Math.round(separation)]);
      }
    }
  }

  return results;
}

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
