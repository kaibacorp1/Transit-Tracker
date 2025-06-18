// utils/aircraftProximityUtils.js

/** Convert degrees to radians */
function deg2rad(deg) {
  return deg * Math.PI / 180;
}

/** Geodetic→ECEF conversion for accurate 3D coords */
function geodeticToECEF(lat, lon, alt) {
  const a = 6378137.0;               // WGS84 radius
  const e_sq = 6.69437999014e-3;     // WGS84 eccentricity²
  const φ = deg2rad(lat);
  const λ = deg2rad(lon);
  const N = a / Math.sqrt(1 - e_sq * Math.sin(φ)**2);

  const x = (N + alt) * Math.cos(φ) * Math.cos(λ);
  const y = (N + alt) * Math.cos(φ) * Math.sin(λ);
  const z = ((1 - e_sq)*N + alt) * Math.sin(φ);
  return [x, y, z];
}

/** Angle between two 3D vectors, in degrees */
function angleBetween(v1, v2) {
  const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
  const m1 = Math.hypot(...v1);
  const m2 = Math.hypot(...v2);
  // clamp for FP safety
  const c = Math.min(1, Math.max(-1, dot/(m1*m2)));
  return Math.acos(c) * 180/Math.PI;
}

/** Haversine ground distance (meters) */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => deg*Math.PI/180;
  const dφ = toRad(lat2 - lat1);
  const dλ = toRad(lon2 - lon1);
  const a = Math.sin(dφ/2)**2
          + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))
            * Math.sin(dλ/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/**
 * Hybrid proximity:
 * - Visual overlap if angle ≤ maxAngleDegrees
 * - OR spatial if distance < maxDist & |altDiff| < maxAltDiff
 */
export function detectHybridProximity(
  observer,
  aircraftList,
  maxAngleDegrees = 6.0,
  maxDist = 300,       // meters
  maxAltDiff = 1000    // meters
) {
  const out = [];
  const obsECEF = geodeticToECEF(observer.lat, observer.lon, observer.alt);

  for (let i = 0; i < aircraftList.length; i++) {
    for (let j = i + 1; j < aircraftList.length; j++) {
      const A = aircraftList[i];
      const B = aircraftList[j];
      if (!A.lat||!A.lon||!B.lat||!B.lon) continue;

      // --- Visual ---
      const eA = geodeticToECEF(A.lat, A.lon, A.alt);
      const eB = geodeticToECEF(B.lat, B.lon, B.alt);
      const vA = [eA[0]-obsECEF[0], eA[1]-obsECEF[1], eA[2]-obsECEF[2]];
      const vB = [eB[0]-obsECEF[0], eB[1]-obsECEF[1], eB[2]-obsECEF[2]];
      const angle = angleBetween(vA, vB);

      // --- Spatial ---
      const dist = haversine(A.lat, A.lon, B.lat, B.lon);
      const altDiff = Math.abs((A.alt||0) - (B.alt||0));

      if (angle <= maxAngleDegrees || (dist < maxDist && altDiff < maxAltDiff)) {
        out.push({
          pair: [ A.callsign||'A', B.callsign||'B' ],
          visualAngle: angle.toFixed(2),
          groundDistance: dist.toFixed(1),
          altitudeDifference: altDiff.toFixed(1)
        });
      }
    }
  }
  return out;
}
