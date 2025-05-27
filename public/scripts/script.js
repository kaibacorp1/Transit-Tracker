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

/* Refactored Flight Fetching & Detection */

// --- Helpers ---
const M_TO_FT = 3.28084;
function toMeters(feet) {
  return feet != null ? feet / M_TO_FT : 0;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function logFlightsDebug(flights) {
  flights.slice(0, 10).forEach(f => {
    console.log(
      `✈️ ${f.callsign || '––'} @ ${f.latitude.toFixed(3)},${f.longitude.toFixed(3)}:`,
      `altitude=${f.altitude.toFixed(1)} m`
    );
  });
}

// --- Provider Fetchers ---
async function fetchAviationstack() {
  const key = getAviationstackKey();
  if (!key) throw new Error('Missing Aviationstack API key');
  const data = await fetchJson(
    `http://api.aviationstack.com/v1/flights?access_key=${key}&limit=100`
  );
  if (data.error) throw new Error(data.error.message || data.error);
  return (data.data || []).map(f => ({
    callsign:  f.flight  || '',
    latitude:  f.live?.latitude  || 0,
    longitude: f.live?.longitude || 0,
    altitude:  toMeters(f.live?.altitude),
    heading:   f.live?.direction       || null,
    speed:     f.live?.speed_horizontal || null
  }));
}

async function fetchAdsbexchange(uLat, uLon, radiusKm) {
  const key  = sessionStorage.getItem('adsbApiKey');
  const host = sessionStorage.getItem('adsbApiHost');
  if (!key || !host) throw new Error('Missing ADS-B Exchange API settings');
  const url = `https://${host}/v2/lat/${uLat}/lon/${uLon}/dist/${radiusKm}/`;
  const data = await fetchJson(url, { headers: {
    'x-rapidapi-host': host,
    'x-rapidapi-key':  key
  }});
  return (data.ac || []).map(ac => ({
    callsign:  ac.flight  || '',
    latitude:  ac.lat      || 0,
    longitude: ac.lon      || 0,
    altitude:  toMeters(ac.alt_geom),
    heading:   ac.track    || null,
    speed:     ac.gs       || null
  }));
}

async function fetchOpenSky(uLat, uLon, radiusKm) {
  const username = sessionStorage.getItem('osUser');
  const password = sessionStorage.getItem('osPass');
  if (!username || !password) throw new Error('Missing OpenSky login');
  const range = radiusKm / 111;
  const body = JSON.stringify({
    username, password,
    lamin: uLat - range, lamax: uLat + range,
    lomin: uLon - range, lomax: uLon + range
  });
  const data = await fetchJson(
    'https://opensky-proxy.onrender.com/api/flights',
    { method: 'POST', headers: {'Content-Type':'application/json'}, body }
  );
  return (data.states || []).map(s => ({
    callsign:  (s[1] || '').trim(),
    latitude:  s[6] || 0,
    longitude: s[5] || 0,
    altitude:  s[13] || 0,
    heading:   s[10] != null ? s[10] : null,
    speed:     s[9]  != null ? s[9]  : null
  }));
}

// --- Main Detector ---
async function checkNearbyFlights(uLat, uLon, uElev, bodyAz, bodyAlt) {
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = `Checking flights near the ${selectedBody}…`;
  const radiusKm = +document.getElementById('radiusSelect').value;

  try {
    let flights = [];
    if (window.useAviationstack) {
      flights = await fetchAviationstack();
    } else if (window.useAdsbexchange) {
      flights = await fetchAdsbexchange(uLat, uLon, radiusKm);
    } else {
      flights = await fetchOpenSky(uLat, uLon, radiusKm);
    }

    logFlightsDebug(flights);
    callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `❌ ${err.message}`;
  }
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

