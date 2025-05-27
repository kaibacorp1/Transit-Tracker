/* script.js – Celestial Transit Tracker */

// --- Mode Flags ---
window.useAviationstack = false;
window.useAdsbexchange  = false;

// --- State Variables ---
let selectedBody   = 'moon';
let autoRefresh    = true;
let countdown      = 5;
let countdownInterval;
let locationMode   = 'auto';
let predictSeconds = 0;
let margin         = 2.5;

// --- Utility & Storage Helpers ---
function getAviationstackKey() {
  return sessionStorage.getItem('aviationstackKey');
}

function logDetectionLocally(message, metadata = {}) {
  const history = JSON.parse(localStorage.getItem('transitLog') || '[]');
  history.push({ time: new Date().toISOString(), message, ...metadata });
  localStorage.setItem('transitLog', JSON.stringify(history));
}

// --- DOMContent Loaded Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  navigator.geolocation.getCurrentPosition(success, error);
  showTab('openskyTab');
});

// --- UI Event Listeners ---
// Body selector (Moon/Sun)
document.getElementById('bodyToggle').addEventListener('change', e => {
  selectedBody = e.target.value;
  document.getElementById('trackerTitle').textContent =
    selectedBody === 'moon' ? '🌙 Moon' : '☀️ Sun';
  document.getElementById('bodyLabel').textContent =
    selectedBody === 'moon' ? 'Moon' : 'Sun';
  getCurrentLocationAndRun();
});

// Radius dropdown
document.getElementById('radiusSelect').addEventListener('change', getCurrentLocationAndRun);

// Predict-seconds selector
document.getElementById('predictToggle').addEventListener('change', e => {
  predictSeconds = parseInt(e.target.value, 10) || 0;
});

// Margin slider
document.getElementById('marginSlider').addEventListener('input', e => {
  margin = parseFloat(e.target.value);
  document.getElementById('marginValue').textContent = margin.toFixed(1) + '°';
  const fb = document.getElementById('marginFeedback');
  if (fb) fb.textContent = `Matching within ±${margin.toFixed(1)}°`;
});

// Auto-refresh toggle & interval
document.getElementById('autoRefreshToggle').addEventListener('change', e => {
  autoRefresh = e.target.value === 'on';
  autoRefresh ? startAutoRefresh() : stopAutoRefresh();
});
document.getElementById('refreshIntervalInput').addEventListener('change', () => {
  if (autoRefresh) startAutoRefresh();
});
document.getElementById('refreshBtn').addEventListener('click', getCurrentLocationAndRun);

// Manual location inputs
document.getElementById('locationMode').addEventListener('change', e => {
  locationMode = e.target.value;
  document.getElementById('manualLocationFields').style.display =
    locationMode === 'manual' ? 'block' : 'none';
  if (locationMode === 'auto') navigator.geolocation.getCurrentPosition(success, error);
});

// Log viewing/clearing/downloading
document.getElementById('viewLogBtn').addEventListener('click', () => {
  const log = JSON.parse(localStorage.getItem('transitLog') || '[]');
  alert(log.length
    ? log.map(e => `${e.time}: ${e.message}`).join('\n')
    : 'No detections logged yet.'
  );
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
  const fmt = document.getElementById('logFormat').value;
  const fn  = `transit_log.${fmt}`;
  let content;
  if (fmt === 'json') {
    content = JSON.stringify(log, null, 2);
  } else {
    content = log.map(e => {
      const d = new Date(e.time);
      const ts = d.toISOString().replace('T',' ').replace('Z','');
      return [
        `time: ${ts}`,
        `${e.message}`,
        `callsign: ${e.callsign}`,
        `azimuth: ${e.azimuth}`,
        `altitudeAngle: ${e.altitudeAngle}`,
        `body: ${e.body}`,
        `predictionSeconds: ${e.predictionSeconds}`,
        `margin: ${e.margin}`
      ].join('\n');
    }).join('\n\n');
  }
  const blob = new Blob([content], { type: fmt==='json'?'application/json':'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = fn;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// --- Geolocation Handlers ---
function success(position) {
  const lat  = position.coords.latitude;
  const lon  = position.coords.longitude;
  const elev = position.coords.altitude || 10;
  window.userCoords = { lat, lon, elev };
  updateLocationUI(lat, lon, elev);
  getCelestialPosition(lat, lon, elev);
  startAutoRefresh();
}

function error(err) {
  alert(`Could not get your location. Reason: ${err.message}`);
}

function updateLocationUI(lat, lon, elev) {
  document.getElementById('lat').textContent       = lat.toFixed(6);
  document.getElementById('lon').textContent       = lon.toFixed(6);
  document.getElementById('elevation').textContent = elev.toFixed(1);
}

// --- Celestial & Flight Logic ---
function getCurrentLocationAndRun() {
  if (locationMode === 'manual') {
    const lat  = parseFloat(document.getElementById('manualLat').value);
    const lon  = parseFloat(document.getElementById('manualLon').value);
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
  const az  = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const alt = (pos.altitude  * 180) / Math.PI;
  document.getElementById('moonAz').textContent = az.toFixed(2);
  document.getElementById('moonAlt').textContent = alt.toFixed(2);
  checkNearbyFlights(lat, lon, elev, az, alt);
}

// --- Flight Fetching & Detection ---
function checkNearbyFlights(uLat, uLon, uElev, bodyAz, bodyAlt) {
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = `Checking flights near the ${selectedBody}…`;
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);

  // Aviationstack mode
  if (window.useAviationstack) {
    const key = getAviationstackKey();
    if (!key) {
      statusEl.textContent = '❌ Missing Aviationstack API key.';
      return;
    }
    fetch(`http://api.aviationstack.com/v1/flights?access_key=${key}&limit=100`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          statusEl.textContent = `❌ Aviationstack error: ${data.error.message || data.error}`;
          return;
        }
        const flights = Array.isArray(data.data)
          ? data.data.map(f => ({
              latitude:  f.latitude,
              longitude: f.longitude,
              altitude:  f.altitude,
              heading:   f.heading || null,
              speed:     f.speed    || null,
              callsign:  f.flight   || ''
            }))
          : [];
        callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt);
      })
      .catch(() => { statusEl.textContent = '🚫 Error fetching Aviationstack data.'; });
    return;
  }

  // ADS-B Exchange mode
  if (window.useAdsbexchange) {
    const key  = sessionStorage.getItem('adsbApiKey');
    const host = sessionStorage.getItem('adsbApiHost');
    if (!key || !host) {
      statusEl.textContent = '❌ Missing ADS-B Exchange API settings.';
      return;
    }
    const url = `https://${host}/v2/lat/${uLat}/lon/${uLon}/dist/${radiusKm}/`;
    fetch(url, {
      method: 'GET',
      headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': key }
    })
      .then(res => res.json())
      .then(data => {
        const flights = Array.isArray(data.ac)
          ? data.ac.map(ac => ({
              latitude:  ac.lat,
              longitude: ac.lon,
              altitude:  ac.alt_geom || 0,
              heading:   ac.track   || null,
              speed:     ac.gs      || null,
              callsign:  ac.flight  || ''
            }))
          : [];
        callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt);
      })
      .catch(() => { statusEl.textContent = '🚫 Error fetching ADS-B Exchange data.'; });
    return;
  }

  // Default: OpenSky mode
  const username = sessionStorage.getItem('osUser');
  const password = sessionStorage.getItem('osPass');
  if (!username || !password) {
    statusEl.textContent = '❌ Missing OpenSky login.';
    return;
  }
  const range = radiusKm / 111;
  const lamin = uLat - range, lamax = uLat + range;
  const lomin = uLon - range, lomax = uLon + range;
  fetch('https://opensky-proxy.onrender.com/api/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, lamin, lomin, lamax, lomax })
  })
    .then(res => res.json())
    .then(data => {
      const flights = Array.isArray(data.states)
        ? data.states.map(s => ({
            callsign:  (s[1] || '').trim(),
            latitude:  s[6],
            longitude: s[5],
            altitude:  s[7] != null ? s[7] : 0,
            speed:     s[9] != null ? s[9] : null,
            heading:   s[10]!= null ? s[10]: null
          }))
        : [];
      callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt);
    })
    .catch(() => { statusEl.textContent = '🚫 Error fetching OpenSky flight data.'; });
}

function callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt) {
  fetch('/api/detect-transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flights,
      userLat:    uLat,
      userLon:    uLon,
      userElev:   uElev,
      bodyAz,
      bodyAlt,
      margin,
      predictSeconds,
      selectedBody
    })
  })
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(({ matches, error }) => {
    const statusEl = document.getElementById('transitStatus');
    if (error) return statusEl.textContent = `❌ ${error}`;
    if (matches.length) {
      const label = predictSeconds > 0
        ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec:`
        : `🔭 Possible ${selectedBody} transit:`;
      statusEl.innerHTML = `${label}<br>${
        matches.map(m =>
          `${m.callsign} (Az ${m.azimuth}°, Alt ${m.altitudeAngle}°)`
        ).join('<br>')
      }`;
      if (!document.getElementById('muteToggle').checked)
        document.getElementById('alertSound').play().catch(()=>{});
      matches.forEach(m => {
        logDetectionLocally(
          predictSeconds > 0
            ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec`
            : `🔭 Possible ${selectedBody} transit`,
          { ...m, body: selectedBody, margin, predictionSeconds: predictSeconds }
        );
      });
    } else {
      statusEl.textContent = `No aircraft aligned with the ${selectedBody} right now.`;
    }
  })
  .catch(err => {
    console.error(err);
    document.getElementById('transitStatus').textContent = '🚫 Error checking transit.';
  });
}

// --- Math Helpers ---
function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
  const d = speed * seconds;
  const θ = (heading * Math.PI) / 180;
  const φ1 = (lat     * Math.PI) / 180;
  const λ1 = (lon     * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d / R) +
    Math.cos(φ1) * Math.sin(d / R) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(d / R) * Math.cos(φ1),
    Math.cos(d / R) - Math.sin(φ1) * Math.sin(φ2)
  );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

function calculateAzimuth(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dλ = toRad(lon2 - lon1);
  const y  = Math.sin(dλ) * Math.cos(φ2);
  const x  = Math.cos(φ1) * Math.sin(φ2)
           - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((toDeg(Math.atan2(y, x))) + 360) % 360;
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg
