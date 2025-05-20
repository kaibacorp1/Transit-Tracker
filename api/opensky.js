function fetchOpenSkyFlights(lat, lon, elev, azimuth, altitude) {
  const radius = parseInt(document.getElementById("radiusSelect").value);
  const statusEl = document.getElementById("transitStatus");

  const username = sessionStorage.getItem("osUser");
  const password = sessionStorage.getItem("osPass");

  if (!username || !password) {
    statusEl.textContent = "❌ Missing OpenSky login.";
    return;
  }

  const delta = radius / 111; // Rough degrees for radius in km
  const query = new URLSearchParams({
    lamin: lat - delta,
    lamax: lat + delta,
    lomin: lon - delta,
    lomax: lon + delta
  }).toString();

  fetch(`/api/opensky?${query}`, {
    headers: {
      "Authorization": "Basic " + btoa(username + ":" + password)
    }
  })
    .then(res => {
      if (!res.ok) throw new Error("OpenSky login failed or fetch failed");
      return res.json();
    })
    .then(data => {
      if (!data.states || !Array.isArray(data.states)) {
        statusEl.textContent = "❌ Invalid or empty OpenSky data.";
        return;
      }

      handleFlightData(data, lat, lon, elev, azimuth, altitude);
    })
    .catch(err => {
      console.error("OpenSky fetch error:", err);
      statusEl.textContent = "🚫 Error fetching OpenSky flight data.";
    });
}
