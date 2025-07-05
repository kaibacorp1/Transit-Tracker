// earlyPredictor.js

// CONFIG
const EARLY_LOOKAHEAD_SECONDS = 120; // how far ahead to project
const EARLY_ALERT_MARGIN_DEG = 2.0; // looser margin for early alerts
const CONFIRM_ALERT_MARGIN_DEG = 1.0; // tighter margin for final alert
const POLL_INTERVAL = 5000; // how often to re-check (in ms)

let lastAlertedFlights = {}; // to prevent duplicate alerts

function startEarlyPrediction(planes, observer, targetAz, targetAlt) {
  setInterval(() => {
    planes.forEach(plane => {
      const projections = projectPlanePath(plane, EARLY_LOOKAHEAD_SECONDS);
      const alignmentWindow = findTransitWindow(projections, observer, targetAz, targetAlt);

      if (alignmentWindow) {
        const timeUntilTransit = alignmentWindow.time - Date.now() / 1000;
        const flightId = plane.callsign || plane.icao24;

        // Alert logic
        if (!lastAlertedFlights[flightId]) {
          if (alignmentWindow.score >= 80 && timeUntilTransit > 15) {
            triggerEarlyAlert(flightId, plane, alignmentWindow, timeUntilTransit);
            lastAlertedFlights[flightId] = true;

            // Confirm alert after a timeout
            setTimeout(() => {
              confirmTransit(plane, observer, targetAz, targetAlt);
            }, (timeUntilTransit - 10) * 1000);
          }
        }
      }
    });
  }, POLL_INTERVAL);
}

function projectPlanePath(plane, secondsAhead) {
  const path = [];
  const step = 5; // seconds
  for (let t = 0; t <= secondsAhead; t += step) {
    const projected = projectPosition(plane, t);
    projected.time = Date.now() / 1000 + t;
    path.push(projected);
  }
  return path;
}

function findTransitWindow(projections, observer, targetAz, targetAlt) {
  for (let i = 0; i < projections.length; i++) {
    const az = calculateAzimuth(observer, projections[i]);
    const alt = calculateElevation(observer, projections[i]);
    const azDiff = angularSeparation(az, targetAz);
    const altDiff = Math.abs(alt - targetAlt);

    if (azDiff < EARLY_ALERT_MARGIN_DEG && altDiff < EARLY_ALERT_MARGIN_DEG) {
      const score = 100 - (azDiff + altDiff) * 25;
      return { time: projections[i].time, score };
    }
  }
  return null;
}

function triggerEarlyAlert(id, plane, window, secondsLeft) {
  const msg = `🚀 ${plane.callsign || id} may transit in ${Math.round(secondsLeft)}s (score ${Math.round(window.score)}%)`;
  console.log(msg);
  const alertBox = document.getElementById("earlyAlert");
  if (alertBox) alertBox.textContent = msg;
}

function confirmTransit(plane, observer, targetAz, targetAlt) {
  const current = projectPosition(plane, 0);
  const az = calculateAzimuth(observer, current);
  const alt = calculateElevation(observer, current);
  const azDiff = angularSeparation(az, targetAz);
  const altDiff = Math.abs(alt - targetAlt);

  if (azDiff < CONFIRM_ALERT_MARGIN_DEG && altDiff < CONFIRM_ALERT_MARGIN_DEG) {
    const msg = `🎯 ${plane.callsign || plane.icao24} TRANSIT NOW!`; 
    console.log(msg);
    const alertBox = document.getElementById("confirmedAlert");
    if (alertBox) alertBox.textContent = msg;
    // Optional: trigger sound or animation here
  }
} // end
