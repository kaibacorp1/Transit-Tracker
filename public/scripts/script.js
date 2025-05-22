/* script.js */
// Top-level flags
window.useAviationstack = false;
window.useAdsbexchange = false;

let selectedBody   = 'moon';
let autoRefresh    = true;
let countdown      = 5;
let countdownInterval;
let locationMode   = 'auto';
let predictSeconds = 0;
let margin         = 2.5;

// --- Utility & storage helpers ---
function getAviationstackKey() {
  return sessionStorage.getItem('aviationstackKey');
}

function logDetectionLocally(message, metadata={}) {
  const history = JSON.parse(localStorage.getItem('transitLog')||'[]');
  history.push({ time:new Date().toISOString(), message, ...metadata });
  localStorage.setItem('transitLog', JSON.stringify(history));
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', ()=>{
  navigator.geolocation.getCurrentPosition(success, error);
  showTab('openskyTab');
});

document.getElementById('bodyToggle').addEventListener('change', e=>{
  selectedBody = e.target.value;
  document.getElementById('trackerTitle').textContent =
    selectedBody==='moon' ? '🌙 Moon' : '☀️ Sun';
  document.getElementById('bodyLabel').textContent =
    selectedBody==='moon' ? 'Moon' : 'Sun';
  getCurrentLocationAndRun();
});

document.getElementById('radiusSelect').addEventListener('change', getCurrentLocationAndRun);
document.getElementById('predictToggle').addEventListener('change', e=>{ predictSeconds = parseInt(e.target.value)||0; });
document.getElementById('autoRefreshToggle').addEventListener('change', e=>{
  autoRefresh = e.target.value==='on';
  autoRefresh ? startAutoRefresh() : stopAutoRefresh();
});
document.getElementById('locationMode').addEventListener('change', e=>{
  locationMode = e.target.value;
  document.getElementById('manualLocationFields').style.display =
    locationMode==='manual'?'block':'none';
  if(locationMode==='auto') navigator.geolocation.getCurrentPosition(success,error);
});
document.getElementById('refreshBtn').addEventListener('click', getCurrentLocationAndRun);

document.getElementById('marginSlider').addEventListener('input', e=>{
  margin = parseFloat(e.target.value);
  document.getElementById('marginValue').textContent = `${margin.toFixed(1)}°`;
  const fb = margin<=2.5?"🎯 Very strict (photography)"
           :margin<=5  ?"📸 Loose silhouette range"
           :margin<=10 ?"🔭 General awareness"
           :margin<=15 ?"📡 Visual tracking zone"
                       :"🛑 Too loose — radar sweep only";
  document.getElementById('marginFeedback').textContent = fb;
});

document.getElementById('viewLogBtn').addEventListener('click', ()=>{
  const log = JSON.parse(localStorage.getItem('transitLog')||'[]');
  alert(log.length
    ? log.map(e=>`${e.time}: ${e.message}`).join('\\n')
    : 'No detections logged yet.'
  );
});
document.getElementById('clearLogBtn').addEventListener('click', ()=>{
  if(confirm('Are you sure you want to clear the transit log?')){
    localStorage.removeItem('transitLog');
    alert('🗑️ Transit log cleared.');
  }
});
document.getElementById('downloadLogBtn').addEventListener('click', ()=>{
  const log = JSON.parse(localStorage.getItem('transitLog')||'[]');
  if(!log.length) return alert('No detections to download.');
  const fmt = document.getElementById('logFormat').value;
  const fn  = `transit_log.${fmt}`;
  const ct  = fmt==='json'
    ? JSON.stringify(log,null,2)
    : log.map(e=>Object.entries(e).map(([k,v])=>`${k}: ${v}`).join('\\n')).join('\\n\\n');
  const blob= new Blob([ct],{type:fmt==='json'?'application/json':'text/plain'});
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(blob);
  a.download= fn;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// --- Geolocation Handlers ---
function success(position){
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const elev= position.coords.altitude||10;
  window.userCoords={lat,lon,elev};
  updateLocationUI(lat,lon,elev);
  getCelestialPosition(lat,lon,elev);
  startAutoRefresh();
}
function error(err){
  alert(`Could not get your location. Reason: ${err.message}`);
}
function updateLocationUI(lat,lon,elev){
  document.getElementById('lat').textContent       = lat.toFixed(6);
  document.getElementById('lon').textContent       = lon.toFixed(6);
  document.getElementById('elevation').textContent = elev.toFixed(1);
}

// --- Celestial & Flight Logic ---
function getCurrentLocationAndRun(){
  if(locationMode==='manual'){
    const lat=parseFloat(document.getElementById('manualLat').value),
          lon=parseFloat(document.getElementById('manualLon').value),
          elev=parseFloat(document.getElementById('manualElev').value)||10;
    if(!isNaN(lat)&&!isNaN(lon)){
      window.userCoords={lat,lon,elev};
      updateLocationUI(lat,lon,elev);
      getCelestialPosition(lat,lon,elev);
    } else alert('Please enter valid latitude/longitude.');
  } else if(window.userCoords){
    getCelestialPosition(window.userCoords.lat,window.userCoords.lon,window.userCoords.elev);
  }
}
function getCelestialPosition(lat,lon,elev){
  const now=new Date(),
        pos= selectedBody==='moon'
            ? SunCalc.getMoonPosition(now,lat,lon)
            : SunCalc.getPosition(now,lat,lon),
        az=(pos.azimuth*180)/Math.PI+180,
        alt=(pos.altitude*180)/Math.PI;
  document.getElementById('moonAz').textContent=az.toFixed(2);
  document.getElementById('moonAlt').textContent=alt.toFixed(2);
  checkNearbyFlights(lat,lon,elev,az,alt);
}

// proxy to OpenSky + backend detection
function checkNearbyFlights(uLat,uLon,uElev,bodyAz,bodyAlt){
  document.getElementById('transitStatus').textContent=`Checking flights near the ${selectedBody}...`;
  const username=sessionStorage.getItem('osUser'),
        password=sessionStorage.getItem('osPass');
  if(!username||!password){
    document.getElementById('transitStatus').textContent='❌ Missing OpenSky login.';
    return;
  }
  const radiusKm=parseInt(document.getElementById('radiusSelect').value),
        range=radiusKm/111,
        lamin=uLat-range, lamax=uLat+range,
        lomin=uLon-range, lomax=uLon+range;

  fetch('https://opensky-proxy.onrender.com/api/flights', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,password,lamin,lomin,lamax,lomax})
  })
  .then(r=>r.json())
  .then(data=>{
    const flights=data.states||[];
    callTransitAPI(flights,uLat,uLon,uElev,bodyAz,bodyAlt);
  })
  .catch(()=>{ document.getElementById('transitStatus').textContent='🚫 Error fetching flight data.'; });
}

// --- Backend call ---
function callTransitAPI(flights, uLat, uLon, uElev, bodyAz, bodyAlt) {
  fetch('/api/detect-transit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flights,
      userLat:   uLat,
      userLon:   uLon,
      userElev:  uElev,
      bodyAz,
      bodyAlt,
      margin,
      predictSeconds,
      selectedBody
    })
  })
  .then(res => {
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  })
  .then(({ matches, error }) => {
    if (error) {
      document.getElementById('transitStatus').textContent = `❌ ${error}`;
      return;
    }
    if (matches.length) {
      const label = predictSeconds > 0
        ? `⚠️ Possible ${selectedBody} transit in ~${predictSeconds} sec:`
        : `🔭 Possible ${selectedBody} transit:`;
      document.getElementById('transitStatus').innerHTML =
        `${label}<br>${matches
          .map(m => `${m.callsign} (Az ${m.azimuth}°, Alt ${m.altitudeAngle}°)`)
          .join('<br>')}`;
      if (!document.getElementById('muteToggle').checked) {
        document.getElementById('alertSound').play().catch(()=>{});
      }
      logDetectionLocally(`${selectedBody} transit detected`, { az: bodyAz, alt: bodyAlt });
    } else {
      document.getElementById('transitStatus').textContent =
        `No aircraft aligned with the ${selectedBody} right now.`;
    }
  })
  .catch(err => {
    console.error('Transit API error:', err);
    document.getElementById('transitStatus').textContent = '🚫 Error checking transit.';
  });
}

// --- ADS-B & Aviationstack Helpers ---
function saveCredentials(){
  const u=document.getElementById('osUsername').value,
        p=document.getElementById('osPassword').value;
  if(!u||!p) return alert('Please enter both username and password.');
  sessionStorage.setItem('osUser',u);
  sessionStorage.setItem('osPass',p);
  alert('✅ Credentials saved.');
  document.querySelector('#openskyTab details').open=false;
}
function saveAviationstackKey(){
  const key=document.getElementById('aviationstackKey').value.trim();
  if(!key) return alert('Please enter a valid API key.');
  sessionStorage.setItem('aviationstackKey',key);
  alert('✅ API key saved.');
}
function useAviationstackAPI(){
  const key=getAviationstackKey();
  if(!key) return alert('❌ Enter & save your Aviationstack key first.');
  window.useAviationstack=true; window.useAdsbexchange=false;
  document.getElementById('apiNotice').textContent='✅ Aviationstack mode';
  showTab('aviationstackTab');
  getCurrentLocationAndRun();
}
function saveAdsbExSettings(){
  const key=document.getElementById('adsbApiKey').value.trim(),
        host=document.getElementById('adsbApiHost').value.trim();
  if(!key||!host) return alert('Enter both API Key and Host.');
  sessionStorage.setItem('adsbApiKey',key);
  sessionStorage.setItem('adsbApiHost',host);
  alert('✅ ADS-B settings saved.');
}
function useAdsbExchangeAPI(){
  const key=sessionStorage.getItem('adsbApiKey'),
        host=sessionStorage.getItem('adsbApiHost');
  if(!key||!host) return alert('❌ Enter & save your ADS-B settings.');
  window.useAdsbexchange=true; window.useAviationstack=false;
  document.getElementById('adsbApiNotice').textContent='✅ ADS-B mode';
  showTab('adsbexTab');
  getCurrentLocationAndRun();
}
function showTab(tabId){
  ['openskyTab','aviationstackTab','adsbexTab'].forEach(id=>{
    document.getElementById(id).style.display=(id===tabId?'block':'none');
    document.getElementById(id+'Btn').style.borderColor=(id===tabId?'#00bfff':'#444');
  });
}

// --- Math Helpers ---
function projectPosition(lat, lon, heading, speed, seconds){
  const R=6371000, d=speed*seconds, θ=heading*Math.PI/180,
        φ1=lat*Math.PI/180, λ1=lon*Math.PI/180;
  const φ2=Math.asin(Math.sin(φ1)*Math.cos(d/R)+
                     Math.cos(φ1)*Math.sin(d/R)*Math.cos(θ)),
        λ2=λ1+Math.atan2(Math.sin(θ)*Math.sin(d/R)*Math.cos(φ1),
                         Math.cos(d/R)-Math.sin(φ1)*Math.sin(φ2));
  return { lat:φ2*180/Math.PI, lon:λ2*180/Math.PI };
}
function calculateAzimuth(lat1,lon1,lat2,lon2){
  const toRad=x=>x*Math.PI/180,
        y=Math.sin(toRad(lon2-lon1))*Math.cos(toRad(lat2)),
        x=Math.cos(toRad(lat1))*Math.sin(toRad(lat2))-
          Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function normalizeAngle(a){ return ((a%360)+360)%360; }
function haversine(lat1,lon1,lat2,lon2){
  const R=6371000, toRad=x=>x*Math.PI/180,
        dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1),
        a=Math.sin(dLat/2)**2+
          Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// --- Auto-refresh ---
function startAutoRefresh(){
  stopAutoRefresh();
  const ui=parseInt(document.getElementById('refreshIntervalInput').value);
  countdown=isNaN(ui)||ui<3?5:ui;
  updateCountdownDisplay();
  countdownInterval=setInterval(()=>{
    countdown--; updateCountdownDisplay();
    if(countdown<=0){ getCurrentLocationAndRun(); countdown=isNaN(ui)||ui<3?5:ui; }
  },1000);
}
function stopAutoRefresh(){
  clearInterval(countdownInterval);
  document.getElementById('countdownTimer').textContent='Auto refresh off';
}
function updateCountdownDisplay(){
  document.getElementById('countdownTimer').textContent=`Next check in: ${countdown}s`;
}
