window.useAviationstack = false;

let selectedBody = 'moon';
let autoRefresh = true;
let countdown = 5;
let countdownInterval;
let locationMode = 'auto';
let predictSeconds = 0;
let margin = 2.5;

function getAviationstackKey() {
  return sessionStorage.getItem('aviationstackKey');
}

document.getElementById('bodyToggle').addEventListener('change', (e) => {
  selectedBody = e.target.value;
  document.getElementById('trackerTitle').textContent =
    selectedBody === 'moon' ? '🌙 Moon' : '☀️ Sun';
  document.getElementById('bodyLabel').textContent =
    selectedBody === 'moon' ? 'Moon' : 'Sun';
  getCurrentLocationAndRun();
});

document.getElementById('radiusSelect').addEventListener('change', getCurrentLocationAndRun);
document.getElementById('predictToggle').addEventListener('change', e => {
  predictSeconds = parseInt(e.target.value) || 0;
});
document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
  autoRefresh = e.target.value === 'on';
  autoRefresh ? startAutoRefresh() : stopAutoRefresh();
});
document.getElementById('locationMode').addEventListener('change', (e) => {
  locationMode = e.target.value;
  const manualFields = document.getElementById('manualLocationFields');
  manualFields.style.display = locationMode === 'manual' ? 'block' : 'none';
  if (locationMode === 'auto') navigator.geolocation.getCurrentPosition(success, error);
});
document.getElementById('refreshBtn').addEventListener('click', getCurrentLocationAndRun);

document.getElementById('marginSlider').addEventListener('input', (e) => {
  margin = parseFloat(e.target.value);
  document.getElementById('marginValue').textContent = `${margin.toFixed(1)}°`;

  const feedback =
    margin <= 2.5 ? "🎯 Very strict (photography)" :
    margin <= 5   ? "📸 Loose silhouette range" :
    margin <= 10  ? "🔭 General awareness" :
    margin <= 15  ? "📡 Visual tracking zone" :
                    "🛑 Too loose — radar sweep only";

  document.getElementById('marginFeedback').textContent = feedback;
});

document.getElementById('viewLogBtn').addEventListener('click', () => {
  const log = JSON.parse(localStorage.getItem('transitLog') || '[]');
  alert(log.length ? log.map(entry => `${entry.time}: ${entry.message}`).join('\n') : 'No detections logged yet.');
});

document.getElementById('clearLogBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the transit log?')) {
    localStorage.removeItem('transitLog');
    alert('🗑️ Transit log cleared.');
  }
});

document.getElementById('downloadLogBtn').addEventListener('click', () => {
  const log = JSON.parse(localStorage.getItem('transitLog') || '[]');
  if (!log.length) return alert('No detections to download.');

  const format = document.getElementById('logFormat').value;
  const filename = `transit_log.${format}`;
  const content = format === 'json'
    ? JSON.stringify(log, null, 2)
    : log.map(entry => Object.entries(entry).map(([k, v]) => `${k}: ${v}`).join('\n')).join('\n\n');

  const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

function success(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const elevation = position.coords.altitude || 10;
  window.userCoords = { lat, lon, elev: elevation };
  updateLocationUI(lat, lon, elevation);
  getCelestialPosition(lat, lon, elevation);
  startAutoRefresh();
}

function error(err) {
  alert(`Could not get your location. Reason: ${err.message}`);
}

function updateLocationUI(lat, lon, elev) {
  document.getElementById('lat').textContent = lat.toFixed(6);
  document.getElementById('lon').textContent = lon.toFixed(6);
  document.getElementById('elevation').textContent = elev.toFixed(1);
}

function getCurrentLocationAndRun() {
  if (locationMode === 'manual') {
    const lat = parseFloat(document.getElementById('manualLat').value);
    const lon = parseFloat(document.getElementById('manualLon').value);
    const elev = parseFloat(document.getElementById('manualElev').value) || 10;
    if (!isNaN(lat) && !isNaN(lon)) {
      window.userCoords = { lat, lon, elev };
      updateLocationUI(lat, lon, elev);
      getCelestialPosition(lat, lon, elev);
    } else {
      alert('Please enter valid latitude and longitude.');
    }
  } else if (window.userCoords) {
    getCelestialPosition(window.userCoords.lat, window.userCoords.lon, window.userCoords.elev);
  }
}

function getCelestialPosition(lat, lon, elev) {
  const now = new Date();
  const pos = selectedBody === 'moon'
    ? SunCalc.getMoonPosition(now, lat, lon)
    : SunCalc.getPosition(now, lat, lon);
  const az = (pos.azimuth * 180) / Math.PI + 180;
  const alt = (pos.altitude * 180) / Math.PI;

  document.getElementById('moonAz').textContent = az.toFixed(2);
  document.getElementById('moonAlt').textContent = alt.toFixed(2);

  checkNearbyFlights(lat, lon, elev, az, alt);
}

function checkNearbyFlights(userLat, userLon, userElev, bodyAz, bodyAlt) {
  const radiusKm = parseInt(document.getElementById('radiusSelect').value);
  document.getElementById('transitStatus').textContent = `Checking flights near the ${selectedBody}...`;

  if (window.useAviationstack) {
    // Aviationstack mode

    const key = getAviationstackKey();
    if (!key) {
      document.getElementById('transitStatus').textContent = '❌ Missing Aviationstack API key.';
      return;
    }

    fetch('https://aviationstack.p.rapidapi.com/v1/flights?limit=100', {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'aviationstack.p.rapidapi.com'
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          const msg = data.error.message || "Unknown Aviationstack error.";
          document.getElementById('transitStatus').textContent = `❌ Aviationstack error: ${msg}`;
          return;
        }
        handleAviationstackData(data, userLat, userLon, userElev, bodyAz, bodyAlt);
      })
      .catch(() => {
        document.getElementById('transitStatus').textContent = '🚫 Error fetching Aviationstack data.';
      });
    return;
  }

  if (window.useAdsbexchange) {
    checkAdsbExchangeFlights(userLat, userLon, userElev, bodyAz, bodyAlt);
    return;
  }

  const username = sessionStorage.getItem('osUser');
  const password = sessionStorage.getItem('osPass');
  if (!username || !password) {
    document.getElementById('transitStatus').textContent = '❌ Missing OpenSky login.';
    return;
  }

  const range = radiusKm / 111;
  const lamin = userLat - range;
  const lamax = userLat + range;
  const lomin = userLon - range;
  const lomax = userLon + range;

  fetch('https://opensky-proxy.onrender.com/api/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, lamin, lomin, lamax, lomax })
  })
    .then(res => {
      if (!res.ok) throw new Error("Fetch failed");
      return res.json();
    })
    .then(data => handleFlightData(data, userLat, userLon, userElev, bodyAz, bodyAlt))
    .catch(() => {
      document.getElementById('transitStatus').textContent = '🚫 Error fetching OpenSky flight data.';
    });
}


function checkAdsbExchangeFlights(userLat, userLon, userElev, bodyAz, bodyAlt) {
  const key = sessionStorage.getItem('adsbApiKey');
  const host = sessionStorage.getItem('adsbApiHost');
  const radiusKm = parseInt(document.getElementById('radiusSelect').value);

  if (!key || !host) {
    document.getElementById('transitStatus').textContent = '❌ Missing ADS-B Exchange API settings.';
    return;
  }

  const url = `https://${host}/v2/lat/${userLat}/lon/${userLon}/dist/${radiusKm}/`;

  fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': host,
      'x-rapidapi-key': key
    }
  })
    .then(res => res.json())
    .then(data => {
      if (!data || !data.ac || !Array.isArray(data.ac)) {
        document.getElementById('transitStatus').textContent = '❌ Invalid or empty ADS-B response.';
        return;
      }

      // Correctly mapped fields to match handleFlightData expectations
      const flights = data.ac.map(ac => ([
        ac.hex || '',        // 0: ICAO address (not used)
        ac.flight || '',     // 1: callsign
        null,                // 2: unused
        null,                // 3: unused
        null,                // 4: unused
        ac.lon,              // 5: longitude
        ac.lat,              // 6: latitude
        null,                // 7: unused
        null,                // 8: unused
        ac.gs,               // 9: ground speed (m/s or knots)
        ac.track,            // 10: heading
        null,                // 11: unused
        null,                // 12: unused
        ac.alt_geom || 0     // 13: geometric altitude
      ]));

      handleFlightData({ states: flights }, userLat, userLon, userElev, bodyAz, bodyAlt);
    })
    .catch(err => {
      document.getElementById('transitStatus').textContent = '🚫 Error fetching ADS-B Exchange data.';
      console.error(err);
    });
}



function handleFlightData(data, userLat, userLon, userElev, bodyAz, bodyAlt) {
  const matches = [];

  if (!data.states || !Array.isArray(data.states) || data.states.length === 0) {
    document.getElementById('transitStatus').textContent = 'No aircraft found in the search zone.';
    return;
  }

  for (const plane of data.states) {
    const callsign = plane[1];
    const lat = plane[6];
    const lon = plane[5];
    const geoAlt = plane[13] || 0;
    const heading = plane[10];
    const speed = plane[9];

    if (lat === null || lon === null || geoAlt === null) continue;

    let targetLat = lat;
    let targetLon = lon;

    if (predictSeconds > 0 && heading !== null && speed !== null) {
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
      const label = predictSeconds > 0
        ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec:`
        : `🔭 Possible ${selectedBody} transit:`;
      const message = `${callsign} (Az ${azimuth.toFixed(1)}°, Alt ${angle.toFixed(1)}°)`;
      matches.push(message);
      document.getElementById('transitStatus').innerHTML = `${label}<br>${matches.join('<br>')}`;
      if (!document.getElementById('muteToggle').checked) {
        document.getElementById('alertSound').play().catch(() => {});
      }
      logDetectionLocally(`${label} ${message}`, {
        callsign,
        azimuth: azimuth.toFixed(1),
        altitudeAngle: angle.toFixed(1),
        body: selectedBody,
        predictionSeconds: predictSeconds,
        margin
      });
    }
  }

  if (!matches.length) {
    document.getElementById('transitStatus').textContent = `No aircraft aligned with the ${selectedBody} right now.`;
  }
}

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

function logDetectionLocally(message, metadata = {}) {
  const history = JSON.parse(localStorage.getItem('transitLog') || '[]');
  history.push({ time: new Date().toISOString(), message, ...metadata });
  localStorage.setItem('transitLog', JSON.stringify(history));
}

function startAutoRefresh() {
  stopAutoRefresh();
  const userInterval = parseInt(document.getElementById('refreshIntervalInput').value);
  countdown = isNaN(userInterval) || userInterval < 3 ? 5 : userInterval;
  updateCountdownDisplay();

  countdownInterval = setInterval(() => {
    countdown--;
    updateCountdownDisplay();
    if (countdown <= 0) {
      getCurrentLocationAndRun();
      countdown = isNaN(userInterval) || userInterval < 3 ? 5 : userInterval;
    }
  }, 1000);
}

function stopAutoRefresh() {
  clearInterval(countdownInterval);
  document.getElementById('countdownTimer').textContent = 'Auto refresh off';
}

function updateCountdownDisplay() {
  document.getElementById('countdownTimer').textContent = `Next check in: ${countdown}s`;
}

navigator.geolocation.getCurrentPosition(success, error);
