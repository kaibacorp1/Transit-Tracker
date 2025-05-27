/* script.js - Final merged version for Vercel */

// --- Mode Flags ---
window.useAviationstack = false;
window.useAdsbexchange = false;

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
  // Prompt for location
  navigator.geolocation.getCurrentPosition(success, error);
  // Initialize first tab
  showTab('openskyTab');
});

// --- UI Event Listeners ---
document.getElementById('bodyToggle').addEventListener('change', e => {
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
document.getElementById('autoRefreshToggle').addEventListener('change', e => {
  autoRefresh = e.target.value === 'on';
  autoRefresh ? startAutoRefresh() : stopAutoRefresh();
});

// Restart auto-refresh when interval input changes
document.getElementById('refreshIntervalInput').addEventListener('change', () => {
  if (autoRefresh) {
    startAutoRefresh();
  }
});
document.getElementById('locationMode').addEventListener('change', e => {
  locationMode = e.target.value;
  document.getElementById('manualLocationFields').style.display =
    locationMode === 'manual' ? 'block' : 'none';
  if (locationMode === 'auto') navigator.geolocation.getCurrentPosition(success, error);
});
document.getElementById('refreshBtn').addEventListener('click', getCurrentLocationAndRun);

document.getElementById('marginSlider').addEventListener('input', e => {
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
    // Format each entry as an 8-line record
    content = log.map(e => {
      // 1) Format timestamp: "YYYY-MM-DD hh:mm:ss.SSS"
      const d = new Date(e.time);
      const ts =
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0') + '.' +
        String(d.getMilliseconds()).padStart(3, '0');

      // 2) Build the record
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

  // Create and download the file
  const mime = fmt === 'json' ? 'application/json' : 'text/plain';
  const blob = new Blob([content], { type: mime });
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
  const az  = (pos.azimuth * 180) / Math.PI + 180;
  const alt = (pos.altitude * 180) / Math.PI;
  document.getElementById('moonAz').textContent = az.toFixed(2);
  document.getElementById('moonAlt').textContent= alt.toFixed(2);
  checkNearbyFlights(lat, lon, elev, az, alt);
}

// --- Flight Fetching & Backend Detection ---
function checkNearbyFlights(uLat, uLon, uElev, bodyAz, bodyAlt) {
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = `Checking flights near the ${selectedBody}...`;
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
        callTransitAPI(data.data || [], uLat, uLon, uElev, bodyAz, bodyAlt);
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
    checkAdsbExchangeFlights(uLat, uLon, uElev, bodyAz, bodyAlt);
    return;
  }

  // Default (OpenSky mode)
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
    .then(data => callTransitAPI(data.states || [], uLat, uLon, uElev, bodyAz, bodyAlt))
    .catch(() => { statusEl.textContent = '🚫 Error fetching OpenSky flight data.'; });
}

// ADS-B Exchange Helper
function checkAdsbExchangeFlights(userLat, userLon, userElev, bodyAz, bodyAlt) {
  const key  = sessionStorage.getItem('adsbApiKey');
  const host = sessionStorage.getItem('adsbApiHost');
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);
  const url = `https://${host}/v2/lat/${userLat}/lon/${userLon}/dist/${radiusKm}/`;
  fetch(url, {
    method: 'GET',
    headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': key }
  })
    .then(res => res.json())
    .then(data => {
      const flights = Array.isArray(data.ac)
        ? data.ac.map(ac => [ ac.hex||'', ac.flight||'', null, null, null, ac.lon, ac.lat, null, null, ac.gs, ac.track, null, null, ac.alt_geom||0 ])
        : [];
      callTransitAPI(flights, userLat, userLon, userElev, bodyAz, bodyAlt);
    })
    .catch(() => { document.getElementById('transitStatus').textContent = '🚫 Error fetching ADS-B Exchange data.'; });
}

// --- Backend Transit Detection Call ---
function callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt) {
    // ── Normalize every flight record into the object shape detect-transit needs ──
  const flightObjs = flights.map(f => {
    if (Array.isArray(f)) {
      // raw array from OpenSky or ADS-B Exchange
      return {
        latitude:  f[6],
        longitude: f[5],
        altitude:  (f[7] != null ? f[7] : f[13]) || 0,
        heading:   f[10] || 0,
        speed:     f[9]  || 0,
        callsign:  f[1]  || ''
      };
    } else {
      // already an object (e.g. Aviationstack)
      return {
        latitude:  f.latitude  || f.lat  || 0,
        longitude: f.longitude || f.lon  || 0,
        altitude:  f.altitude  || f.baro_altitude || 0,
        heading:   f.heading   || f.track || 0,
        speed:     f.speed     || f.velocity || 0,
        callsign:  f.callsign  || f.flight || ''
      };
    }
  });

  // ── Send the normalized array instead of the raw one ──
  fetch('/api/detect-transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flights: flightObjs, userLat: uLat, userLon: uLon, userElev: uElev, bodyAz, bodyAlt, margin, predictSeconds, selectedBody })
  })
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(({ matches, error }) => {
    const statusEl = document.getElementById('transitStatus');
    if (error) return statusEl.textContent = `❌ ${error}`;
    if (matches.length) {
      const label = predictSeconds > 0
        ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec:`
        : `🔭 Possible ${selectedBody} transit:`;
      statusEl.innerHTML = `${label}<br>${matches.map(m => `${m.callsign} (Az ${m.azimuth}°, Alt ${m.altitudeAngle}°)`).join('<br>')}`;
      if (!document.getElementById('muteToggle').checked) document.getElementById('alertSound').play().catch(()=>{});
      // For each detected flight, record a rich log entry
matches.forEach(m => {
  const label = predictSeconds > 0
    ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec`
    : `🔭 Possible ${selectedBody} transit`;
  logDetectionLocally(label, {
    callsign:          m.callsign,
    azimuth:           m.azimuth,
    altitudeAngle:     m.altitudeAngle,
    body:              selectedBody,
    predictionSeconds: predictSeconds,
    margin:            margin
  });
});
    } else {
      statusEl.textContent = `No aircraft aligned with the ${selectedBody} right now.`;
    }
  })
  .catch(err => { console.error(err); document.getElementById('transitStatus').textContent = '🚫 Error checking transit.'; });
}

// --- UI Helpers for APIs & Tabs ---
function saveCredentials() {
  const u = document.getElementById('osUsername').value;
  const p = document.getElementById('osPassword').value;
  if (!u || !p) return alert('Please enter both username and password.');
  sessionStorage.setItem('osUser', u);
  sessionStorage.setItem('osPass', p);
  alert('✅ Credentials saved.');
  document.querySelector('#openskyTab details').open = false;
}

function saveAviationstackKey() {
  const key = document.getElementById('aviationstackKey').value.trim();
  if (!key) return alert('Please enter a valid API key.');
  sessionStorage.setItem('aviationstackKey', key);
  alert('✅ API key saved.');
}

function useAviationstackAPI() {
  if (!getAviationstackKey()) return alert('❌ Enter & save your Aviationstack key first.');
  window.useAviationstack = true; window.useAdsbexchange = false;
  document.getElementById('apiNotice').textContent = '✅ Aviationstack mode enabled.';
  showTab('aviationstackTab');
  getCurrentLocationAndRun();
}

function saveAdsbExSettings() {
  const key = document.getElementById('adsbApiKey').value.trim();
  const host = document.getElementById('adsbApiHost').value.trim();
  if (!key || !host) return alert('Enter both API Key and Host.');
  sessionStorage.setItem('adsbApiKey', key);
  sessionStorage.setItem('adsbApiHost', host);
  alert('✅ ADS-B settings saved.');
}

function useAdsbExchangeAPI() {
  const key = sessionStorage.getItem('adsbApiKey');
  const host = sessionStorage.getItem('adsbApiHost');
  if (!key || !host) return alert('❌ Enter & save your ADS-B settings.');
  window.useAdsbexchange = true; window.useAviationstack = false;
  document.getElementById('adsbApiNotice').textContent = '✅ ADS-B mode enabled.';
  showTab('adsbexTab');
  getCurrentLocationAndRun();
}

function showTab(tabId) {
  ['openskyTab','aviationstackTab','adsbexTab'].forEach(id => {
    document.getElementById(id).style.display = (id === tabId ? 'block' : 'none');
    document.getElementById(id+'Btn').style.borderColor = (id === tabId ? '#00bfff' : '#444');
  });
}

// --- Math Helpers ---
function projectPosition(lat, lon, heading, speed, seconds) {
  const R = 6371000;
  const d = speed * seconds;
  const θ = (heading * Math.PI) / 180;
  const φ1 = (lat   * Math.PI) / 180;
  const λ1 = (lon   * Math.PI) / 180;
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
  const toRad = x => (x * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- Auto-refresh Handlers ---
function updateCountdown() {
  const ui = parseInt(document.getElementById('refreshIntervalInput').value, 10);
  countdown = isNaN(ui) || ui < 3 ? 5 : ui;
}

function startAutoRefresh() {
  stopAutoRefresh();
  updateCountdown();
  updateCountdownDisplay();
  countdownInterval = setInterval(() => {
    countdown--;
    updateCountdownDisplay();
    if (countdown <= 0) {
      getCurrentLocationAndRun();
      updateCountdown();
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
