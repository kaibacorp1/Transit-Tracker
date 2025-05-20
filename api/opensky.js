function fetchOpenSkyFlights(lat, lon, elev, azimuth, altitude) {
  const radius = parseInt(document.getElementById("radiusSelect").value);
  const statusEl = document.getElementById("transitStatus");

  const delta = radius / 111; // Approx degrees

  const query = new URLSearchParams({
    lamin: lat - delta,
    lamax: lat + delta,
    lomin: lon - delta,
    lomax: lon + delta
  }).toString();

  fetch(`/api/opensky?${query}`)
    .then(res => {
      if (!res.ok) throw new Error("OpenSky fetch failed");
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
