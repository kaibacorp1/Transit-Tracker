import SunCalc from 'suncalc';

// Cache to store recent az/alt tracks per plane (ICAO → array of {time, az, alt})
const skyTrackCache = new Map();

export function updateSkyTrack(icao, az, alt, timestamp) {
  if (!skyTrackCache.has(icao)) skyTrackCache.set(icao, []);
  const history = skyTrackCache.get(icao);
  history.push({ time: timestamp, az, alt });
  if (history.length > 5) history.shift();
}

export function computeAngularVelocity(track) {
  if (track.length < 2) return null;
  const t1 = track[track.length - 2];
  const t2 = track[track.length - 1];
  const dt = (t2.time - t1.time) / 1000;
  if (dt <= 0) return null;
  return {
    azVel: (t2.az - t1.az) / dt,
    altVel: (t2.alt - t1.alt) / dt
  };
}

export function predictSkyPosition(track, secondsAhead) {
  const velocity = computeAngularVelocity(track);
  if (!velocity) return null;
  const last = track[track.length - 1];
  return {
    az: last.az + velocity.azVel * secondsAhead,
    alt: last.alt + velocity.altVel * secondsAhead
  };
}

export function scoreTransit(predicted, sunMoonAz, sunMoonAlt, margin = 2.5) {
  const sep = sphericalSeparation(predicted.az, predicted.alt, sunMoonAz, sunMoonAlt);
  if (sep < 0.3) return 'imminent';
  if (sep < 0.8) return 'likely';
  if (sep < margin) return 'possible';
  return null;
}

export function projectPosition(lat, lon, heading, speed, seconds, altitude = 0, verticalSpeed = 0) {
  const R = 6371000;
  const d = speed * seconds;
  const theta = heading * Math.PI / 180;
  const phi1 = lat * Math.PI / 180;
  const lambda1 = lon * Math.PI / 180;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(d / R) +
    Math.cos(phi1) * Math.sin(d / R) * Math.cos(theta)
  );
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(d / R) * Math.cos(phi1),
    Math.cos(d / R) - Math.sin(phi1) * Math.sin(phi2)
  );

  const futureAlt = altitude + verticalSpeed * seconds;
  return { lat: phi2 * 180 / Math.PI, lon: lambda2 * 180 / Math.PI, alt: futureAlt };
}

export function sphericalSeparation(az1, el1, az2, el2) {
  const toRad = deg => deg * Math.PI / 180;
  const a1 = toRad(el1);
  const a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180 / Math.PI;
}

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
  const MIN_ALTITUDE_FEET = 50;
  const now = Date.now();

  const getBodyPositionAt = (secondsAhead) => {
    const futureTime = new Date(now + secondsAhead * 1000);
    const pos = selectedBody === 'moon'
      ? SunCalc.getMoonPosition(futureTime, userLat, userLon)
      : SunCalc.getPosition(futureTime, userLat, userLon);
    return {
      az: (pos.azimuth * 180 / Math.PI + 180) % 360,
      alt: pos.altitude * 180 / Math.PI
    };
  };

  const { az: futureBodyAz, alt: futureBodyAlt } = getBodyPositionAt(predictSeconds);

  for (const plane of flights) {
    let {
      latitude,
      longitude,
      altitude: geoAlt,
      heading = 0,
      speed,
      verticalSpeed = 0,
      callsign,
      icao
    } = plane;

    if (geoAlt < MIN_ALTITUDE_FEET) continue;

    if (use3DHeading && predictSeconds > 0 && heading != null && speed != null) {
      const proj = projectPosition(latitude, longitude, heading, speed, predictSeconds, geoAlt, verticalSpeed);
      latitude = proj.lat;
      longitude = proj.lon;
      geoAlt = proj.alt;
    }

    if (useZenithLogic && futureBodyAlt > 80) {
      margin = margin * 0.8;
    }

    let marginToUse = margin;
    if (useDynamicMargin) {
      marginToUse = getDynamicMargin(margin, geoAlt, speed);
    }

    const azimuth = calculateAzimuth(userLat, userLon, latitude, longitude);
    const distance = haversine(userLat, userLon, latitude, longitude);
    const elevationAngle = Math.atan2(geoAlt - userElev, distance) * 180 / Math.PI;

    updateSkyTrack(icao, azimuth, elevationAngle, now);
    const track = skyTrackCache.get(icao);
    const predicted = predictSkyPosition(track, 30);

    if (predicted) {
      const confidence = scoreTransit(predicted, futureBodyAz, futureBodyAlt, marginToUse);
      if (confidence) {
        matches.push({
          callsign,
          confidence,
          predictionSeconds: predictSeconds,
          azimuth: azimuth.toFixed(1),
          altitudeAngle: elevationAngle.toFixed(1),
          distance: distance.toFixed(1),
          selectedBody,
          track: heading
        });
      }
    }
  }

  return matches;
}

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = phi2 - phi1;
  const dLambda = toRad(lon2 - lon1);
  const a = Math.sin(dPhi / 2) ** 2
          + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const x = Math.sin(dLambda) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2)
          - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

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
  const heading = toRad(headingDeg);
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
  return angleDeg < marginDeg;
}

export function getDynamicMargin(baseMargin, altitudeFt = 10000, speedKts = 300) {
  const altFactor = Math.max(0, (1000 - altitudeFt) / 1000);
  const spdFactor = Math.max(0, (150 - speedKts) / 150);
  const altWeight = 1.5;
  const spdWeight = 1.0;
  return baseMargin + (altFactor * altWeight) + (spdFactor * spdWeight);
}
