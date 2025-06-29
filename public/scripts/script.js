/* script.js - Final merged version for Vercel */

// ---- SESSION TIMER SETUP ----
// If this is the first load, stamp the start time
if (!sessionStorage.getItem('sessionStart')) {
  sessionStorage.setItem('sessionStart', Date.now());
}

///________time counntdown 
//function updateSessionTimer() {
//  const start = parseInt(sessionStorage.getItem('sessionStart'), 10);
  //const elapsed = Math.floor((Date.now() - start) / 1000); // seconds
  //const remaining = Math.max(0, 1800 - elapsed); // 30 minutes total

  //const mins = Math.floor(remaining / 60);
  //const secs = remaining % 60;
  //const el = document.getElementById('sessionTimer');

  //el.textContent = `Session time left: ${mins}m ${secs.toString().padStart(2, '0')}s`;
  //el.style.color = remaining < 60 ? 'red' : '#ccc';
//}

/// ZENITH/////


/// PAUSE TOGGLE FOR 

function toggleAutoRefresh() {
  autoRefresh = !autoRefresh;
  if (autoRefresh) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }

  // 🔁 Update pause/resume button label
  if (typeof lastStatusRender === 'function') {
    lastStatusRender();
  }

  // ✅ Update button style (must be inside the function)
  const btn = document.getElementById('pauseResumeBtn');
  if (btn) {
    btn.textContent = autoRefresh ? '🔴 Pause' : '🟢 Resume';
    btn.style.backgroundColor = autoRefresh ? '#285431' : '#66252f';
  }
}



//useZenithLogic: document.getElementById('toggleZenithLogic')?.checked || false,

//________ennaced ________

const enhancedPredictionEnabled = document.getElementById('enhancedPrediction')?.checked || false;


// --- Mode Flags ---
window.useAdsbexchange = false;
window.useRadarBox      = false;   
window.useAdsbOne = false;

// --- State Variables ---
let selectedBody   = 'moon';
let autoRefresh    = true;
let countdown      = 5;
let countdownInterval;
let locationMode   = 'auto';
let predictSeconds = 0;
let margin         = 2.5;
let lastStatusRender = null;

// ✅ Add this here:
const ignoredFlights = new Set();

// --- Utility & Storage Helpers ---
function getAviationstackKey() {
  return sessionStorage.getItem('aviationstackKey');
}

function logDetectionLocally(message, metadata = {}) {
  const history = JSON.parse(localStorage.getItem('transitLog') || '[]');
  history.push({ time: new Date().toISOString(), message, ...metadata });
  localStorage.setItem('transitLog', JSON.stringify(history));
}

//___________

function hasSessionExpired() {
  const start = parseInt(sessionStorage.getItem('sessionStart'), 10);
  // 1,800,000 ms = 30 minutes
  return (Date.now() - start) > 1_800_000;
}

// ---- rolling transit log setup ----
const transitLog = [];                          // in-memory array of hits
const logContainer   = document.getElementById('transitLogContainer');
const logListEl      = document.getElementById('transitLogList');
const dismissLogBtn  = document.getElementById('dismissLogBtn');

// Dismiss handler: clear both UI and array
dismissLogBtn.addEventListener('click', () => {
  transitLog.length = 0;
  logListEl.innerHTML = '';
  logContainer.style.display = 'none';
});


// ─── ADSB-One Integration (no API key) ───────────────────────────────────

async function fetchAdsbOne({ lat, lon, radiusKm }) {
  const radiusNm = (radiusKm / 1.852).toFixed(1);
  const res = await fetch(
    `https://api.adsb.one/v2/point/${lat}/${lon}/${radiusNm}`
  );
  if (!res.ok) throw new Error(`ADSB-One ${res.status}`);
  const json = await res.json();

  // Use json.ac (not json.data.ac)
  const acList = Array.isArray(json.ac) ? json.ac : [];

 return acList.map(f => ({
  latitude:  f.lat       || 0,
  longitude: f.lon       || 0,
  altitude:  (f.alt_geom || 0) * 0.3048,     // feet ➝ meters
  heading:   f.track     || 0,
  speed:     (f.gs       || 0) * 0.5144,     // knots ➝ m/s
  callsign:  (f.flight || '').trim()
}));
}

//_----------- FOR CONTRAILS_______///


function checkContrailFlights(lat, lon, elev) {
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = '🔍 Looking for high-altitude contrails...';

  fetchAdsbOne({ lat, lon, radiusKm })
    .then(data => {
      const contrailFlights = data.filter(f => f.altitude > 8000); // meters (~26,000 ft)
const visibleContrails = contrailFlights.filter(f => !ignoredFlights.has(f.callsign));

if (visibleContrails.length === 0) {
  statusEl.textContent = 'No visible contrail aircraft in your area.';
  return;
}


      if (contrailFlights.length === 0) {
        statusEl.textContent = 'No visible contrail aircraft in your area.';
        return;
      }

      // 🎵 Play alert sound
      if (!document.getElementById('muteToggle')?.checked) {
        document.getElementById('alertSound')?.play().catch(() => {});
      }

      // 🧠 Build list of detections
      const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
      
      const msg = visibleContrails.map(f => {
  const az = calculateAzimuth(userCoords.lat, userCoords.lon, f.latitude, f.longitude);
  const dir = verbalizeCardinal(toCardinal(az));
  
  const displayLine = `✈️ <a href="https://www.flightradar24.com/${f.callsign}" target="_blank" style="color: orange; text-decoration: none;">
    ${f.callsign}</a> — look up ${dir} ${(f.altitude / 1000).toFixed(1)} km away
    <span onclick="ignoreFlight('${f.callsign}')" style="color:rgb(171, 57, 57);cursor:pointer;font-size:0.45em; margin-left:6px;">
    Ignore</span>`;


  const logLine = `✈️ <a href="https://www.flightradar24.com/${f.callsign}" target="_blank">${f.callsign}</a> at ${(f.altitude / 1000).toFixed(1)} km`;

  // Append to visual log (only logLine in log!)
  const li = document.createElement('li');
  li.innerHTML = `${logLine} ${timeStr}`;
  transitLog.unshift(li);

        // Append new logs to UI (like other detections)
  logListEl.innerHTML = '';
  transitLog.slice(0, 5).forEach(el => logListEl.appendChild(el));

  const extraItems = transitLog.slice(5);
  const extraList = document.getElementById('extraLogList');
  extraList.innerHTML = '';
  extraItems.forEach(el => extraList.appendChild(el));

  document.getElementById('readMoreBtn').style.display =
    extraItems.length > 0 ? 'inline-block' : 'none';

  // Save locally
  logDetectionLocally(`Contrail detected: ${f.callsign}`, {
  callsign: f.callsign,
  altitude: f.altitude,
  azimuth: 0,                // dummy value to avoid undefined
  altitudeAngle: 90,         // dummy value; contrail = overhead
  body: 'plane contrails',
  predictionSeconds: 0,
  margin
});



  return displayLine;
}).join('<br>');


      // ✅ Update status panel
      lastStatusRender = () => {
  const pauseBtn = `<button id="pauseResumeBtn" onclick="toggleAutoRefresh()" style="
  float: right;
  margin-left: 10px;
  font-size: 0.75em;
  padding: 3px 6px;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  background-color: ${autoRefresh ? '#285431' : '#66252f'};
">
  ${autoRefresh ? '🔴 Pause' : '🟢 Resume'}
</button>`;

  statusEl.innerHTML = `👀 Contrail flights detected: ${pauseBtn}<br>${msg}`;
};

lastStatusRender();  // draw it

      logContainer.style.display = 'block';
    })
    .catch(err => {
      statusEl.textContent = `🚫 Error finding contrails: ${err.message}`;
    });
}



// ——————————————————————————

function toCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW','N'];
  return dirs[Math.round(deg / 45) % 8];
}

// expand "N"/"NE"/… into full words
function verbalizeCardinal(abbr) {
  const map = {
    N:  "North",
    NE: "North East",
    E:  "East",
    SE: "South East",
    S:  "South",
    SW: "South West",
    W:  "West",
    NW: "North West"
  };
  return map[abbr] || abbr;
}

// Pick the right “welcome” message
function setInitialStatus() {
  const statusEl = document.getElementById('transitStatus');

  if (window.useAdsbOne) {
    statusEl.textContent = 'Click “ADS-B One” to start';
  }
  else if (window.useAdsbexchange) {
    statusEl.textContent = 'Enter your ADS-B Exchange API settings.';
  }
  else if (window.useRadarBox) {
    statusEl.textContent = 'RadarBox support coming soon';
  }
  else {
    // OpenSky tab
    const user = sessionStorage.getItem('osUser');
    const pass = sessionStorage.getItem('osPass');
    statusEl.textContent = user && pass
      ? 'Ready — click “Check” to fetch flights'
      : '❌ Missing OpenSky login.';
  }
}
// ——————————————————————————


function useAdsbOneAPI() {
  window.useAdsbOne      = true;
  window.useAdsbexchange = false;
  window.useRadarBox     = false;
  showTab('adsboneTab');
  getCurrentLocationAndRun();
}


// ─── RadarBox Helpers ──────────────────────────────────────────────────
function saveRadarboxKey() {
  const k = document.getElementById('radarboxKeyInput').value.trim();
  if (!k) {
    document.getElementById('radarboxApiNotice').textContent = '❌ Please enter a token.';
    return;
  }
  sessionStorage.setItem('radarboxKey', k);
  document.getElementById('radarboxApiNotice').textContent = '✅ Token saved.';
}

function useRadarboxAPI() {
  const k = sessionStorage.getItem('radarboxKey');
  if (!k) {
    document.getElementById('radarboxApiNotice').textContent = '❌ Save your token first.';
    return;
  }
  window.useRadarBox     = true;
  window.useAdsbexchange = false;
  document.getElementById('radarboxApiNotice').textContent = '✅ RadarBox mode enabled.';
  showTab('radarboxTab');
  getCurrentLocationAndRun();
}

async function fetchRadarBox({ minLat, maxLat, minLon, maxLon }) {
  const key = sessionStorage.getItem('radarboxKey');
  if (!key) throw new Error('RadarBox support is not ready, coming soon!');

  const res = await fetch('https://api.airnavradar.com/v2/flights/geosearch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': key
    },
    body: JSON.stringify({ minLatitude: minLat, maxLatitude: maxLat, minLongitude: minLon, maxLongitude: maxLon })
  });
  if (!res.ok) throw new Error(`RadarBox ${res.status}`);
  const json = await res.json();
  return (json.flights || []).map(f => ({
    latitude:  f.latitude,
    longitude: f.longitude,
    altitude:  (f.altitude_ft  || 0) * 0.3048,
    heading:   f.heading_deg    || 0,
    speed:     (f.speed_kt      || 0) * 0.514444,
    callsign:  f.callsign        || ''
  }));
}
// ─────────────────────────────────────────────────────────────────────────

// --- DOMContent Loaded Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Prompt for location
  navigator.geolocation.getCurrentPosition(success, error);

  // Initialize first tab
  showTab('adsboneTab');

  // ✅ NEW: Start session timer updates (moved inside the block)
//  setInterval(updateSessionTimer, 1000);
//  updateSessionTimer();
});

// --- UI Event Listeners ---
document.getElementById('bodyToggle').addEventListener('change', e => {
  selectedBody = e.target.value;

  const title = document.getElementById('trackerTitle');
  const label = document.getElementById('bodyLabel');

  if (selectedBody === 'moon') {
  title.textContent = '🌙 Moon';
  label.textContent = 'Moon';
} else if (selectedBody === 'sun') {
  title.textContent = '☀️ Sun';
  label.textContent = 'Sun';
} else if (selectedBody === 'plane contrails') {
  title.textContent = '✈️ Contrail';
  label.textContent = 'Contrails';
} else if (selectedBody === 'plane on plane') {
  title.textContent = '✈️ Plane vs Plane';
  label.textContent = 'Plane on Plane';
}



  updateContrailModeUI();  // NEW
  getCurrentLocationAndRun();
});



// 👇 This is the safe add-on — handles custom labels for new options
//document.getElementById('bodyToggle').addEventListener('change', e => {
//  const trackerTitle = document.getElementById('trackerTitle');
//  const bodyLabel    = document.getElementById('bodyLabel');

//  if (e.target.value === 'plane on plane') {
//    trackerTitle.textContent = 'Plane on Plane coming soon!';
//    bodyLabel.textContent = 'Plane';
//  } else if (e.target.value === 'plane contrails') {
//    trackerTitle.textContent = 'Plane Contrails prediction Coming soon!';
//    bodyLabel.textContent = 'Contrails';
//  }
//}); 

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
    if (locationMode === 'auto') {
    navigator.geolocation.getCurrentPosition(success, error);
  } else {
    // user switched to manual: immediately use their inputs
    getCurrentLocationAndRun();
  }
});
document.getElementById('refreshBtn')
        .addEventListener('click', () => {
          if (hasSessionExpired()) {
  const lockSound = new Audio('lock.MP3');
  // Play immediately and do NOT wait for alert
  lockSound.play().catch(() => {});

  // Small delay before alert so the sound has time to start
  setTimeout(() => {
    alert("⏳ Time expired. Let the pass cool for a bit now.");
  }, 250);  // 1/4 second delay for smoother experience

  stopAutoRefresh(); // stop the countdown
  return;
}
          getCurrentLocationAndRun();
        });

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
  if (selectedBody === 'plane contrails') {
    checkContrailFlights(lat, lon, elev);
    return;
  }
    if (selectedBody === 'plane on plane') {
    checkNearbyFlights(lat, lon, elev, 0, 0);  // bodyAz, bodyAlt not needed
    return;
  }


  const now = new Date();
  const pos = selectedBody === 'moon'
    ? SunCalc.getMoonPosition(now, lat, lon)
    : SunCalc.getPosition(now, lat, lon);
  const az  = (pos.azimuth * 180) / Math.PI + 180;
  const alt = (pos.altitude * 180) / Math.PI;

  document.getElementById('moonAz').textContent = az.toFixed(2);
  document.getElementById('moonAlt').textContent = alt.toFixed(2);

  checkNearbyFlights(lat, lon, elev, az, alt);
}


// --- Flight Fetching & Backend Detection ---
  function checkNearbyFlights(uLat, uLon, uElev, bodyAz, bodyAlt) {
  const statusEl = document.getElementById('transitStatus');
  statusEl.textContent = `Checking flights near the ${selectedBody}...`;
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);

  // ─── RadarBox mode ─────────────────────────────────────────────────
  if (window.useRadarBox) {
    const range  = radiusKm / 111;
    const minLat = uLat - range, maxLat = uLat + range;
    const minLon = uLon - range, maxLon = uLon + range;

    statusEl.textContent = 'Checking RadarBox flights…';
    fetchRadarBox({ minLat, maxLat, minLon, maxLon })
      .then(data => callTransitAPI(data, uLat, uLon, uElev, bodyAz, bodyAlt))
      .catch(err => {
        statusEl.textContent = `🚫 RadarBox error: ${err.message}`;
      });
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

// ─── ADSB-One mode ───────────────────────────────────────────────────
if (window.useAdsbOne) {
  const statusEl = document.getElementById('transitStatus');
  const radiusKm = parseInt(document.getElementById('radiusSelect').value, 10);
  statusEl.textContent = 'Checking ADSB-One flights…';

  fetchAdsbOne({ lat: uLat, lon: uLon, radiusKm })
    .then(data => {
      // ← Log here, where `data` actually exists
      console.log('ℹ️ ADSB-One fetched', data.length, 'flights:', data);

      // Then hand them off to your detector
      callTransitAPI(data, uLat, uLon, uElev, bodyAz, bodyAlt);
    })
    .catch(err => {
      statusEl.textContent = `🚫 ADSB-One error: ${err.message}`;
    });

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
  const isOpenSky = !window.useAdsbexchange;
  const rawAlt = (f[7] != null ? f[7] : f[13]) || 0;
  return {
  latitude:  f[6],
  longitude: f[5],
  altitude:  isOpenSky ? rawAlt : rawAlt * 0.3048,
  heading:   f[10] || 0,
  track:     f[10] || 0,
  speed:     (f[9] || 0) * 0.5144,
  verticalSpeed: isOpenSky
    ? (f[11] || 0) // OpenSky vertical rate is in m/s
    : ((f[12] || 0) * 0.00508), // ADS-B Exchange feet/min ➝ m/s
  callsign:  f[1] || ''
};
}

    else {
      // already an object (e.g. Aviationstack)
      return {
        latitude:  f.latitude  || f.lat  || 0,
        longitude: f.longitude || f.lon  || 0,
        altitude:  f.altitude  || f.baro_altitude || 0,
        heading:   f.heading   || f.track || 0,
        track:     f.heading   || f.track || 0,  // ← and here
        speed:     f.speed     || f.velocity || 0,
        callsign:  f.callsign  || f.flight || ''
      };
    }
  });

 console.log("✅ Enhanced Prediction value:", document.getElementById('enhancedPrediction').checked);
  
  // ── Send the normalized array instead of the raw one ──
  fetch('/api/detect-transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flights: flightObjs, userLat: uLat, userLon: uLon, userElev: uElev, bodyAz, bodyAlt, margin, predictSeconds, selectedBody, 
                          use3DHeading: document.getElementById('toggle3DCheck')?.checked || false,
                          enhancedPrediction: document.getElementById('enhancedPrediction')?.checked
 })
  })
  .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
  .then(({ matches, error }) => {
     matches = matches.filter(m => {
  if (m.callsign) return !ignoredFlights.has(m.callsign);
  if (m.pair?.length === 2) {
    return !ignoredFlights.has(m.pair[0].callsign) && !ignoredFlights.has(m.pair[1].callsign);
  }
  return true;
});
    const statusEl = document.getElementById('transitStatus');
    if (error) return statusEl.textContent = `❌ ${error}`;
    if (matches.length) {
  // 1) Update line 1 exactly as before, but pick the first match

//If you'd like to auto-toggle use3DHeading and useZenithLogic when Enhanced Prediction is checked//
      
document.getElementById('enhancedPrediction').addEventListener('change', (e) => {
});


      
// BUILD a status line showing *every* match
const statusLines = selectedBody === 'plane on plane'
  ? matches.map(pair => {
      const [f1, f2] = pair.pair;
      const azimuth = calculateAzimuth(f1.latitude, f1.longitude, f2.latitude, f2.longitude);
      const direction = verbalizeCardinal(toCardinal(azimuth));
      return `
  <span style="font-size:0.9em;">
    ✈️ <a href="https://www.flightradar24.com/${f1.callsign}" target="_blank" style="color: orange; text-decoration: none;">${f1.callsign}</a>
    vs
    <a href="https://www.flightradar24.com/${f2.callsign}" target="_blank" style="color: orange; text-decoration: none;">${f2.callsign}</a>
    — look up ${direction} ${pair.angularSeparation.toFixed(1)}° apart
    <span onclick="ignoreFlight('${f1.callsign}'); ignoreFlight('${f2.callsign}')" style="color:rgb(171, 57, 57);cursor:pointer;font-size:0.45em; margin-left:6px;">
      Ignore
    </span>
  </span>`;
    }).join('<br>')
  : matches.map(m => {
      const azCard  = verbalizeCardinal(toCardinal(m.azimuth));
      const hdgCard = verbalizeCardinal(toCardinal(m.track));
      return `
        <a href="https://www.flightradar24.com/${m.callsign}" target="_blank" style="color:orange;font-weight:bold;text-decoration:none;">
          ${m.callsign}
        </a>
        <span style="font-size:0.85em;">
          look up ${azCard}, ✈️ heading ${hdgCard}
        </span>
        <span onclick="ignoreFlight('${m.callsign}')" style="color:rgb(171, 57, 57);cursor:pointer;font-size:0.45em; margin-left:6px;">
          Ignore
        </span>
      `;
    }).join('<br>');


const pauseBtn = `<button id="pauseResumeBtn" onclick="toggleAutoRefresh()" style="
  float: right;
  margin-left: 10px;
  font-size: 0.75em;
  padding: 3px 6px;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  background-color: ${autoRefresh ? '#285431' : '#66252f'};
">
  ${autoRefresh ? '🔴 Pause' : '🟢 Resume'}
</button>`;


const statusMsg = `🔭 Possible ${selectedBody} transit: ${pauseBtn}<br>${statusLines}`;

lastStatusRender = () => {
  const pauseBtn = `<button id="pauseResumeBtn" onclick="toggleAutoRefresh()" style="
  float: right;
  margin-left: 10px;
  font-size: 0.75em;
  padding: 3px 6px;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  background-color: ${autoRefresh ? '#285431' : '#66252f'};
">
  ${autoRefresh ? '🔴 Pause' : '🟢 Resume'}
</button>`;


  const statusMsg = `🔭 Possible ${selectedBody} transit: ${pauseBtn}<br>${statusLines}`;
  statusEl.innerHTML = statusMsg;
};

lastStatusRender();  // Render it immediately
    // 🔔 play alert sound
    if (!document.getElementById('muteToggle').checked) {
      document.getElementById('alertSound').play().catch(()=>{});
    }


  // 2) Append all new hits to the log
  matches.forEach(m => {
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const li = document.createElement('li');

    if (selectedBody === 'plane on plane' && m.pair?.length === 2) {
      const [f1, f2] = m.pair;
      li.innerHTML = `
        ✈️ <a href="https://www.flightradar24.com/${f1.callsign}" target="_blank">${f1.callsign}</a>
        vs
        <a href="https://www.flightradar24.com/${f2.callsign}" target="_blank">${f2.callsign}</a>
        — ${m.angularSeparation.toFixed(1)}° apart (${timeStr})
      `;
    } else {
      const azCard2 = verbalizeCardinal(toCardinal(m.azimuth));
      const hdgCard2 = verbalizeCardinal(toCardinal(m.track));
      li.innerHTML = `
        <a href="https://www.flightradar24.com/${m.callsign}" target="_blank">${m.callsign}</a>
        look up ${azCard2}, ✈️ heading ${hdgCard2} ${timeStr}
      `;
    }

    // Add to top of log
    transitLog.unshift(li);
    logListEl.innerHTML = '';
    transitLog.slice(0, 5).forEach(el => logListEl.appendChild(el));

    // Move extras
    const extraItems = transitLog.slice(5);
    document.getElementById('extraLogList').innerHTML = '';
    extraItems.forEach(el => document.getElementById('extraLogList').appendChild(el));
    document.getElementById('readMoreBtn').style.display = extraItems.length > 0 ? 'inline-block' : 'none';
  });



  // 3) Make sure the log panel is visible
  logContainer.style.display = 'block';

  // … keep your existing alert sound & localStorage logging …
}
 else {
const selectedBody = document.getElementById('bodyToggle').value;
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
  
  // ← As soon as credentials are saved, force a new flight check:
  countdown = 5;                          // reset the 5-second timer
  updateCountdownDisplay();               // update the “Next check in: 5s” text
  getCurrentLocationAndRun();             // immediately re-run location → transit check
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
  // 1) show/hide panels & highlight the button
  ['openskyTab','adsbexTab','radarboxTab','adsboneTab'].forEach(id => {
    document.getElementById(id).style.display     = (id === tabId ? 'block' : 'none');
    document.getElementById(id + 'Btn').style.borderColor = (id === tabId ? '#00bfff' : '#444');
  });

  // 2) set the mode flags
  window.useAdsbOne      = (tabId === 'adsboneTab');
  window.useAdsbexchange = (tabId === 'adsbexTab');
  window.useRadarBox     = (tabId === 'radarboxTab');
  // (if none are true, we'll fall back to OpenSky)

  // 3) update the top-of-page message
  setInitialStatus();
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
     
      
      // ←► HERE: session timeout check
   //   if (hasSessionExpired()) {
//  const lockSound = new Audio('/lock.MP3');
//  lockSound.play().catch(() => {});
 // alert("⏳ Time expired. Let the pass cool for a bit now.");
//  stopAutoRefresh(); // stop the countdown as well
//  return;
//}

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

// === Theme Toggle ===
const toggleBtn = document.getElementById('themeToggle');
// On load: read last choice (default = dark)
const saved = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', saved);

toggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'light'
    : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});


// Expose RadarBox handlers globally
window.saveRadarboxKey = saveRadarboxKey;
window.useRadarboxAPI  = useRadarboxAPI;

// Expose ADSB-One handler globally
window.useAdsbOneAPI    = useAdsbOneAPI;


//____ignore__flights 
function ignoreFlight(callsign) {
  ignoredFlights.add(callsign);
  getCurrentLocationAndRun(); // ← triggers a fresh check, and skips ignored
}


//___________enable toggleEnhancedPrediction


function toggleEnhancedPrediction() {
  const checkbox = document.getElementById('enhancedPrediction');
  checkbox.checked = !checkbox.checked;  // real toggle

  const btn = document.getElementById('enhancedPredictionBtn');
  if (checkbox.checked) {
    btn.textContent = '🟢 Enhanced Prediction ON';
    btn.style.backgroundColor = '#285431';
  } else {
    btn.textContent = '🔴 Enhanced Prediction OFF';
    btn.style.backgroundColor = '#66252f';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById('enhancedPrediction');
  const btn = document.getElementById('enhancedPredictionBtn');
  if (btn && checkbox) {
    // sync button to checkbox default state (ON)
    if (checkbox.checked) {
      btn.textContent = '🟢 Enhanced Prediction ON';
      btn.style.backgroundColor = '#285431';
    } else {
      btn.textContent = '🔴 Enhanced Prediction OFF';
      btn.style.backgroundColor = '#66252f';
    }
  }
});

//___________

function getMarginFeedback(value) {
  return value <= 2.5 ? "🎯 Very strict (photography)" :
         value <= 5   ? "📸 Loose silhouette range"   :
         value <= 10  ? "🔭 General awareness"        :
         value <= 15  ? "📡 Visual tracking zone"     :
                        "🛑 Too loose — radar sweep only";
}

function updateContrailModeUI() {
  const isContrail    = selectedBody === 'plane contrails';
  const isPlaneOnPlane = selectedBody === 'plane on plane';

  // ---- disable controls in contrail OR plane-on-plane modes ----
  document.getElementById('predictToggle').disabled       = isContrail;
  document.getElementById('marginSlider').disabled       = isContrail;
  document.getElementById('enhancedPrediction').disabled = isContrail || isPlaneOnPlane;

  // fade the Enhanced button
  const btn = document.getElementById('enhancedPredictionBtn');
  if (btn) {
    btn.style.opacity = (isContrail || isPlaneOnPlane) ? 0.5 : 1;
  }

  // update the margin feedback text
  document.getElementById('marginFeedback').textContent = isContrail
    ? '🛑 Not applicable in contrail mode.'
    : isPlaneOnPlane
      ? '🔭 Only angular margin matters here.'
      : getMarginFeedback(margin);
}



//____________for the world map 

let map;
let marker;

function showMap() {
  const container = document.getElementById("mapContainer");
  container.style.display = "block";

  // Initialize map only once
  if (!map) {
    map = L.map("mapContainer").setView([-33.9, 151.2], 10); // Default center

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on("click", function (e) {
      const { lat, lng } = e.latlng;

      // Place or move marker
      if (!marker) {
        marker = L.marker([lat, lng]).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
      }

      // Update input fields
      document.getElementById("manualLat").value = lat.toFixed(6);
      document.getElementById("manualLon").value = lng.toFixed(6);

      // Use OpenElevation API (free) to auto-fill elevation
      fetch(
        `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
      )
        .then((res) => res.json())
        .then((data) => {
          const elevation = data.results[0].elevation;
          document.getElementById("manualElev").value = elevation;
        })
        .catch((err) => console.error("Elevation fetch failed:", err));
    });
  }

  setTimeout(() => {
    map.invalidateSize(); // Fixes display bug
  }, 100);
}


// Handle Read More toggle
document.getElementById('readMoreBtn').addEventListener('click', () => {
  const container = document.getElementById('extraLogContainer');
  const btn = document.getElementById('readMoreBtn');

  if (container.style.display === 'none') {
    container.style.display = 'block';
    btn.textContent = '🔼 Read Less';
  } else {
    container.style.display = 'none';
    btn.textContent = '🔽 Read More';
  }
});
