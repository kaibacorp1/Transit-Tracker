
/* script.js - Updated for circular-threshold transit detection */

// --- Constants ---
const toRad = Math.PI / 180;

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
  navigator.geolocation.getCurrentPosition(success, error);
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
document.getElementById('refreshIntervalInput').addEventListener('change', () => {
  if (autoRefresh) startAutoRefresh();
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

// --- Geolocation Handlers ---
function success(position) {
  const lat  = position.coords.latitude;
  const lon  = position.coords.longitude;
  const elev = position.coords.altitude || 10;
  window.userCoords = { lat, lon, elev };
  updateLocationUI(lat, lon, elev);
  getCurrentLocationAndRun();
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

// --- Main Runner ---
function getCurrentLocationAndRun() {
  if (locationMode === 'manual') {
    const lat  = parseFloat(document.getElementById('manualLat').value);
    const lon  = parseFloat(document.getElementById('manualLon').value);
    const elev = parseFloat(document.getElementById('manualElev').value) || 10;
    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid latitude and longitude.');
      return;
    }
    window.userCoords = { lat, lon, elev };
    updateLocationUI(lat, lon, elev);
    getCelestialPosition(lat, lon, elev);
  } else if (window.userCoords) {
    getCelestialPosition(window.userCoords.lat, window.userCoords.lon, window.userCoords.elev);
  }
}

// --- Celestial & Flight Logic ---
function getCelestialPosition(lat, lon, elev) {
  const now = new Date();
  const pos = selectedBody === 'moon'
    ? SunCalc.getMoonPosition(now, lat, lon)
    : SunCalc.getPosition(now, lat, lon);
  const azDeg = (pos.azimuth * 180 / Math.PI) + 180;
  const elDeg = (pos.altitude * 180 / Math.PI);
  document.getElementById('moonAz').textContent  = azDeg.toFixed(2);
  document.getElementById('moonAlt').textContent = elDeg.toFixed(2);
  const bodyAz = azDeg * toRad;
  const bodyEl = elDeg * toRad;
  checkNearbyFlights(lat, lon, elev, bodyAz, bodyEl);
}

// --- Flight Fetching & Backend Detection ---
function checkNearbyFlights(uLat, uLon, uElev, bodyAz, bodyEl) {
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = `Checking flights near the ${selectedBody}...`;
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);

  // Aviationstack & ADS-B modes omitted for brevity...
  // Default OpenSky mode:
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
    .then(data => callTransitAPI(data.states || [], uLat, uLon, uElev, bodyAz, bodyEl))
    .catch(() => { statusEl.textContent = '🚫 Error fetching flight data.'; });
}

// --- Backend Transit Detection Call ---
function callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyEl) {
  fetch('/api/detect-transit', {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      flights, userLat: uLat, userLon: uLon, userElev: uElev,
      bodyAz, bodyEl, marginDeg: margin
    })
  })
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(({ matches, error }) => {
      const statusEl = document.getElementById('transitStatus');
      if (error) { statusEl.textContent = `❌ ${error}`; return; }
      if (matches.length) {
        const msgs = matches.map(m =>
          m.status === 'Transit'
            ? `✈️ Transit! Flight ${m.id} silhouetted.`
            : `✈️ Close pass: Flight ${m.id} at Az ${m.az.toFixed(1)}°, El ${m.el.toFixed(1)}°.`
        );
        statusEl.innerHTML = msgs.join('<br>');
        if (!document.getElementById('muteToggle').checked) {
          document.getElementById('alertSound').play().catch(()=>{});
        }
        msgs.forEach(msg => logDetectionLocally(msg, { az: m.az, el: m.el }));
      } else {
        statusEl.textContent = `No aircraft aligned with the ${selectedBody} right now.`;
      }
    })
    .catch(err => {
      console.error(err);
      document.getElementById('transitStatus').textContent = '🚫 Error checking transit.';
    });
}

// --- Auto-refresh Handlers ---
function updateCountdown() {
  const ui = parseInt(document.getElementById('refreshIntervalInput').value, 10);
  countdown = isNaN(ui) || ui < 3 ? 5 : ui;
}
function startAutoRefresh() {
  stopAutoRefresh(); updateCountdown(); updateCountdownDisplay();
  countdownInterval = setInterval(() => {
    countdown--; updateCountdownDisplay();
    if (countdown <= 0) { getCurrentLocationAndRun(); updateCountdown(); }
  }, 1000);
}
function stopAutoRefresh() {
  clearInterval(countdownInterval);
  document.getElementById('countdownTimer').textContent = 'Auto refresh off';
}
function updateCountdownDisplay() {
  document.getElementById('countdownTimer').textContent = `Next check in: ${countdown}s`;
}

// --- Tab Control Helper ---
function showTab(tabId) {
  ['openskyTab','aviationstackTab','adsbexTab'].forEach(id => {
    document.getElementById(id).style.display = (id===tabId?'block':'none');
    document.getElementById(id+'Btn').classList.toggle('active', id===tabId);
  });
}
