let selectedBody = 'moon';
let autoRefresh = true;
let refreshInterval;
let countdown = 5;
let countdownInterval;
let locationMode = 'auto';
let predictSeconds = 0;
let margin = 2.5;

document.getElementById('bodyToggle').addEventListener('change', (e) => {
  selectedBody = e.target.value;
  document.getElementById('trackerTitle').textContent =
    selectedBody === 'moon' ? '🌙 Moon' : '☀️ Sun';
  document.getElementById('bodyLabel').textContent =
    selectedBody === 'moon' ? 'Moon' : 'Sun';
  getCurrentLocationAndRun();
});

document.getElementById('radiusSelect').addEventListener('change', (e) => {
  const radiusKm = parseInt(e.target.value);
  if (radiusKm > 30) {
    alert("⚠️ Warning: Search radius beyond 30 km may cause slower performance and reduce prediction accuracy.");
  }
  getCurrentLocationAndRun();
});

document.getElementById('predictToggle').addEventListener('change', (e) => {
  predictSeconds = parseInt(e.target.value) || 0;
  if (predictSeconds > 10 && predictSeconds <= 20) {
    alert('⚠️ Predictions beyond 10s can be inaccurate for fast-moving or low-flying aircraft.');
  } else if (predictSeconds > 20) {
    alert('🚨 Predictions over 20s may be unreliable and should only be used for high-altitude jets.');
  }
});

document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
  autoRefresh = e.target.value === 'on';
  if (autoRefresh) startAutoRefresh();
  else stopAutoRefresh();
});

document.getElementById('locationMode').addEventListener('change', (e) => {
  locationMode = e.target.value;
  const manualFields = document.getElementById('manualLocationFields');
  if (locationMode === 'manual') {
    manualFields.style.display = 'block';
    stopAutoRefresh();
  } else {
    manualFields.style.display = 'none';
    navigator.geolocation.getCurrentPosition(success, error);
  }
});

document.getElementById('refreshBtn').addEventListener('click', getCurrentLocationAndRun);

document.getElementById('viewLogBtn').addEventListener('click', () => {
  const log = JSON.parse(localStorage.getItem('transitLog') || '[]');
  if (log.length === 0) {
    alert('No detections logged yet.');
  } else {
    const messages = log.map(entry => `${entry.time}: ${entry.message}`).join('\n');
    alert(messages);
  }
});

document.getElementById('clearLogBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear the transit log? This cannot be undone.')) {
    localStorage.removeItem('transitLog');
    alert('🗑️ Transit log cleared.');
  }
});

document.getElementById('downloadLogBtn').addEventListener('click', () => {
  const log = JSON.parse(localStorage.getItem('transitLog') || '[]');
  if (log.length === 0) {
    alert('No detections to download.');
    return;
  }

  const format = document.getElementById('logFormat').value;
  let blob, filename;

  if (format === 'json') {
    blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    filename = 'transit_log.json';
  } else {
    const plainText = log.map(entry => `${entry.time}: ${entry.message}`).join('\n');
    blob = new Blob([plainText], { type: 'text/plain' });
    filename = 'transit_log.txt';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('marginSlider').addEventListener('input', (e) => {
  margin = parseFloat(e.target.value);
  document.getElementById('marginValue').textContent = `${margin.toFixed(1)}°`;

  let feedback = "🎯 Very strict (photography)";
  if (margin > 2.5 && margin <= 5) feedback = "📸 Loose silhouette range";
  else if (margin > 5 && margin <= 10) feedback = "🔭 General awareness";
  else if (margin > 10 && margin <= 15) feedback = "📡 Visual tracking zone";
  else if (margin > 15) feedback = "🛑 Too loose — radar sweep only";

  document.getElementById('marginFeedback').textContent = feedback;
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
  console.error('Geolocation error:', err);
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
  let az, alt;

  if (selectedBody === 'moon') {
    const moonPos = SunCalc.getMoonPosition(now, lat, lon);
    az = (moonPos.azimuth * 180) / Math.PI + 180;
    alt = (moonPos.altitude * 180) / Math.PI;
  } else {
    const sunPos = SunCalc.getPosition(now, lat, lon);
    az = (sunPos.azimuth * 180) / Math.PI + 180;
    alt = (sunPos.altitude * 180) / Math.PI;
  }

  document.getElementById('moonAz').textContent = az.toFixed(2);
  document.getElementById('moonAlt').textContent = alt.toFixed(2);

  checkNearbyFlights(lat, lon, elev, az, alt);
}

function projectPosition(lat, lon, heading, speed, seconds, verticalRate = 0, geoAlt = 0) {
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
    lon: λ2 * 180 / Math.PI,
    alt: geoAlt + (verticalRate * seconds)
  };
}

function checkNearbyFlights(userLat, userLon, userElev, bodyAz, bodyAlt) {
  const radiusKm = parseInt(document.getElementById('radiusSelect').value);
  const range = radiusKm / 111;
  const lamin = userLat - range;
  const lamax = userLat + range;
  const lomin = userLon - range;
  const lomax = userLon + range;

  const username = sessionStorage.getItem('osUser');
  const password = sessionStorage.getItem('osPass');

  if (!username || !password) {
    document.getElementById('transitStatus').textContent = '❌ Missing OpenSky login.';
    return;
  }

  
fetch('https://opensky-proxy.onrender.com/api/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, lamin, lomin, lamax, lomax })
})
.then(res => {
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            document.getElementById('transitStatus').textContent = '❌ Invalid OpenSky credentials. Please re-enter them.';
            sessionStorage.removeItem('osUser');
            sessionStorage.removeItem('osPass');
        } else {
            document.getElementById('transitStatus').textContent = '🚫 Error fetching flight data.';
        }
        throw new Error("Fetch error: " + res.status);
    }
    return res.json();
})

    .then(data => {
      const matches = [];

      if (!data.states || !Array.isArray(data.states) || data.states.length === 0) {
        document.getElementById('transitStatus').textContent = 'No aircraft aligned with the Moon right now.';
        return;
      }

      for (const plane of data.states) {
        const callsign = plane[1];
        const lat = plane[6];
        const lon = plane[5];
        const geoAlt = plane[13] || 0;
        const heading = plane[10];
        const speed = plane[9];
        const verticalRate = plane[11] ?? 0;

        if (lat === null || lon === null || geoAlt === null) continue;

        let targetLat = lat;
        let targetLon = lon;
        let targetAlt = geoAlt;

        if (predictSeconds > 0 && heading !== null && speed !== null) {
          const projected = projectPosition(lat, lon, heading, speed, predictSeconds, verticalRate, geoAlt);
          targetLat = projected.lat;
          targetLon = projected.lon;
          targetAlt = projected.alt;
        }

        const azimuth = calculateAzimuth(userLat, userLon, targetLat, targetLon);
        const distance = haversine(userLat, userLon, targetLat, targetLon);
        const angle = Math.atan2(targetAlt - userElev, distance) * (180 / Math.PI);
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
            document.getElementById('alertSound').play().catch(err => {
              console.warn('Sound play failed:', err);
            });
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

      if (matches.length === 0) {
        document.getElementById('transitStatus').textContent = `No aircraft aligned with the ${selectedBody} right now.`;
      }
    })
    .catch(err => {
      console.error(err);
      document.getElementById('transitStatus').textContent = '🚫 Error fetching flight data.';
    });
}

function logDetectionLocally(message, metadata = {}) {
  let history = JSON.parse(localStorage.getItem('transitLog') || '[]');
  history.push({ time: new Date().toISOString(), message, ...metadata });
  localStorage.setItem('transitLog', JSON.stringify(history));
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

function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.cos(toRad(lon2 - lon1));
  const azimuth = Math.atan2(y, x) * (180 / Math.PI);
  return (azimuth + 360) % 360;
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function startAutoRefresh() {
  stopAutoRefresh();

  const userInterval = parseInt(document.getElementById('refreshIntervalInput').value);
  countdown = (isNaN(userInterval) || userInterval < 3) ? 5 : userInterval;
  updateCountdownDisplay();

  countdownInterval = setInterval(() => {
    countdown--;
    updateCountdownDisplay();
    if (countdown <= 0) {
      getCurrentLocationAndRun();
      countdown = (isNaN(userInterval) || userInterval < 3) ? 5 : userInterval;
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  if (countdownInterval) clearInterval(countdownInterval);
  document.getElementById('countdownTimer').textContent = 'Auto refresh off';
}

function updateCountdownDisplay() {
  document.getElementById('countdownTimer').textContent = `Next check in: ${countdown}s`;
}

// Initial load
navigator.geolocation.getCurrentPosition(success, error);
