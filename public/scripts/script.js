// scripts/script.js – Full updated for circular‐threshold transit detection

const toRad = Math.PI / 180;
window.useAviationstack = false;
window.useAdsbexchange = false;

// State
let selectedBody='moon',
    autoRefresh=true,
    countdown=5,
    countdownInterval,
    locationMode='auto',
    predictSeconds=10,
    margin=2.5;

// Storage helpers
function logDetectionLocally(msg, meta={}) {
  const h=JSON.parse(localStorage.getItem('transitLog')||'[]');
  h.push({ time:new Date().toISOString(), msg, ...meta });
  localStorage.setItem('transitLog', JSON.stringify(h));
}

// Tab control
function showTab(id) {
  ['openskyTab','aviationstackTab','adsbexTab'].forEach(t=>
    document.getElementById(t).style.display = (t===id?'block':'none')
  );
  ['openskyTabBtn','aviationstackTabBtn','adsbexTabBtn'].forEach(b=>
    document.getElementById(b).classList.toggle('active', b===id+'Btn')
  );
}

// Credentials & API toggles
function saveCredentials(){
  const u=document.getElementById('osUsername').value.trim(),
        p=document.getElementById('osPassword').value.trim();
  if(!u||!p){alert('Enter both');return;}
  sessionStorage.setItem('osUser',u);
  sessionStorage.setItem('osPass',p);
  alert('OpenSky credentials saved');
  getCurrentLocationAndRun();
}
function saveAviationstackKey(){
  const k=document.getElementById('aviationstackKey').value.trim();
  if(!k){alert('Enter API key');return;}
  sessionStorage.setItem('aviationstackKey',k);
  document.getElementById('apiNotice').textContent='Key saved';
}
function useAviationstackAPI(){
  window.useAviationstack=true;
  window.useAdsbexchange=false;
  document.getElementById('apiNotice').textContent='Using Aviationstack';
  getCurrentLocationAndRun();
}
function saveAdsbExSettings(){
  const k=document.getElementById('adsbApiKey').value.trim(),
        h=document.getElementById('adsbApiHost').value.trim();
  if(!k||!h){alert('Enter both');return;}
  sessionStorage.setItem('adsbApiKey',k);
  sessionStorage.setItem('adsbApiHost',h);
  document.getElementById('adsbApiNotice').textContent='Settings saved';
}
function useAdsbExchangeAPI(){
  window.useAdsbexchange=true;
  window.useAviationstack=false;
  document.getElementById('adsbApiNotice').textContent='Using ADS-B Exchange';
  getCurrentLocationAndRun();
}

// Init
document.addEventListener('DOMContentLoaded',()=>{
  navigator.geolocation.getCurrentPosition(success,error,{timeout:10000});
  showTab('openskyTab');

  document.querySelectorAll('input[name="bodyToggle"]').forEach(el=>
    el.addEventListener('change',e=>{
      selectedBody=e.target.value;
      document.getElementById('trackerTitle').textContent=
        selectedBody==='moon'?'🌙 Moon':'☀️ Sun';
      getCurrentLocationAndRun();
    })
  );
  document.getElementById('radiusSelect').addEventListener('change',getCurrentLocationAndRun);
  document.getElementById('predictToggle').addEventListener('change',e=>
    predictSeconds=parseInt(e.target.value)||0
  );
  document.getElementById('autoRefreshToggle').addEventListener('change',e=>
    e.target.value==='on'?startAutoRefresh():stopAutoRefresh()
  );
  document.getElementById('refreshIntervalInput').addEventListener('change',()=>
    autoRefresh&&startAutoRefresh()
  );
  document.getElementById('locationMode').addEventListener('change',e=>{
    locationMode=e.target.value;
    document.getElementById('manualLocationFields').style.display=
      locationMode==='manual'?'block':'none';
    locationMode==='auto'&&navigator.geolocation.getCurrentPosition(success,error);
  });
  document.getElementById('refreshBtn').addEventListener('click',getCurrentLocationAndRun);
  document.getElementById('marginSlider').addEventListener('input',e=>{
    margin=parseFloat(e.target.value);
    document.getElementById('marginValue').textContent=`${margin.toFixed(1)}°`;
    const f=margin<=2.5?'🎯 Very strict':margin<=5?'📸 Loose':margin<=10?'🔭 General':'📡 Broad';
    document.getElementById('marginFeedback').textContent=f;
  });
  document.getElementById('viewLogBtn').addEventListener('click',()=>{
    alert(JSON.stringify(JSON.parse(localStorage.getItem('transitLog')||'[]'),null,2));
  });
  document.getElementById('clearLogBtn').addEventListener('click',()=>{
    localStorage.removeItem('transitLog'); alert('Cleared');
  });
  document.getElementById('downloadLogBtn').addEventListener('click',()=>{
    const data=localStorage.getItem('transitLog')||'[]',fmt=document.getElementById('logFormat').value;
    const blob=new Blob([fmt==='json'?data:data.replace(/\\],\\[/g,'\\n')],{type:'text/plain'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url; a.download=`transit_log.${fmt}`; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  });
});

// Geo
function success(pos){
  window.userCoords={lat:pos.coords.latitude,lon:pos.coords.longitude,elev:pos.coords.altitude||10};
  updateLocationUI(window.userCoords.lat,window.userCoords.lon,window.userCoords.elev);
  getCurrentLocationAndRun(); startAutoRefresh();
}
function error(e){
  alert('Could not get location: '+e.message);
}
function updateLocationUI(lat,lon,elev){
  document.getElementById('lat').textContent=lat.toFixed(6);
  document.getElementById('lon').textContent=lon.toFixed(6);
  document.getElementById('elevation').textContent=elev.toFixed(1);
}

// Main runner
function getCurrentLocationAndRun(){
  if(locationMode==='manual'){
    const lat=parseFloat(document.getElementById('manualLat').value),
          lon=parseFloat(document.getElementById('manualLon').value),
          elev=parseFloat(document.getElementById('manualElev').value)||10;
    if(isNaN(lat)||isNaN(lon)){alert('Enter valid coords');return;}
    window.userCoords={lat,lon,elev};
    updateLocationUI(lat,lon,elev);
    getCelestialPosition(lat,lon,elev);
  } else window.userCoords&&getCelestialPosition(window.userCoords.lat,window.userCoords.lon,window.userCoords.elev);
}

// Celestial & detect
function getCelestialPosition(lat,lon,elev){
  const pos=(selectedBody==='moon'
    ? SunCalc.getMoonPosition(new Date(),lat,lon)
    : SunCalc.getPosition(new Date(),lat,lon));
  const azDeg=(pos.azimuth*180/Math.PI)+180,
        elDeg=(pos.altitude*180/Math.PI);
  document.getElementById('moonAz').textContent=azDeg.toFixed(2);
  document.getElementById('moonAlt').textContent=elDeg.toFixed(2);
  checkNearbyFlights(lat,lon,elev,azDeg*toRad,elDeg*toRad);
}

// Fetch & detect
function checkNearbyFlights(uLat,uLon,uElev,bodyAz,bodyEl){
  const s=document.getElementById('transitStatus');
  s.textContent=`Checking flights near the ${selectedBody}...`;
  const rkm=parseInt(document.getElementById('radiusSelect').value,10);
  if(window.useAviationstack){
    // Aviationstack...
  } else if(window.useAdsbexchange){
    // ADS-B...
  } else {
    const user=sessionStorage.getItem('osUser'),pass=sessionStorage.getItem('osPass');
    if(!user||!pass){s.textContent='❌ Missing OpenSky login.';return;}
    const rng=rkm/111,lamin=uLat-rng,lamax=uLat+rng,lomin=uLon-rng,lomax=uLon+rng;
    fetch('https://opensky-proxy.onrender.com/api/flights',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:user,password:pass,lamin,lomin,lamax,lomax})
    })
      .then(r=>r.json())
      .then(d=>callTransitAPI(d.states||[],uLat,uLon,uElev,bodyAz,bodyEl))
      .catch(()=>s.textContent='🚫 Error fetching flight data.');
  }
}

// API call
function callTransitAPI(flights,uLat,uLon,uElev,bodyAz,bodyEl){
  fetch('/api/detect-transit',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      flights,
      userLat:uLat,
      userLon:uLon,
      userElev:uElev,
      bodyAz,
      bodyEl,
      marginDeg:margin
    })
  })
  .then(r=>{if(!r.ok)throw new Error(r.statusText);return r.json();})
  .then(({matches,error})=>{
    const s=document.getElementById('transitStatus');
    if(error){s.textContent=`❌ ${error}`;return;}
    if(matches.length){
      const msgs=matches.map(m=>
        m.status==='Transit'
          ?`✈️ Transit! Flight ${m.id}`
          :`✈️ Close pass: Flight ${m.id} at Az ${m.az.toFixed(1)}°, El ${m.el.toFixed(1)}°`
      );
      s.innerHTML=msgs.join('<br>');
      if(!document.getElementById('muteToggle').checked)
        document.getElementById('alertSound').play().catch(()=>{});
      msgs.forEach(msg=>logDetectionLocally(msg,{az:bodyAz,el:bodyEl}));
    } else s.textContent=`No aircraft aligned with the ${selectedBody} right now.`;
  })
  .catch(err=>{console.error(err);document.getElementById('transitStatus').textContent='🚫 Error checking transit.';});
}

// Auto-refresh
function updateCountdown(){const ui=parseInt(document.getElementById('refreshIntervalInput').value,10);countdown=isNaN(ui)||ui<3?5:ui;}
function startAutoRefresh(){stopAutoRefresh();updateCountdown();document.getElementById('countdownTimer').textContent=`Next check in: ${countdown}s`;countdownInterval=setInterval(()=>{
  countdown--;document.getElementById('countdownTimer').textContent=`Next check in: ${countdown}s`;
  if(countdown<=0){getCurrentLocationAndRun();updateCountdown();}
},1000);}
function stopAutoRefresh(){clearInterval(countdownInterval);document.getElementById('countdownTimer').textContent='Auto refresh off';}
