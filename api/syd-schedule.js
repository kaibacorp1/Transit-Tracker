export default async function handler(req, res) {
  try {
    const key = process.env.AVIATIONSTACK_KEY;
    if (!key) {
      return res.status(500).json({ error: 'Missing AVIATIONSTACK_KEY' });
    }

    const airport = (req.query.airport || 'SYD').toUpperCase();

    // For now we only support a proper heavy-watchlist for SYD
    const WATCHLISTS = {
      SYD: [
        'QF1', 'QF2',
        'QF11', 'QF12',
        'EK412', 'EK413',
        'EK414', 'EK415',
        'SQ221', 'SQ222',
        'UA839', 'UA870',
        'AA72', 'AA73',
        'NH879', 'NH880',
        'JL51', 'JL52',
        'CX100', 'CX101',
        'QR907', 'QR908'
      ]
    };

    const watchlist = WATCHLISTS[airport];

    // Fallback for non-SYD airports: keep old airport-wide behavior
    if (!watchlist) {
      const depUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&dep_iata=${airport}&limit=100`;
      const arrUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&arr_iata=${airport}&limit=100`;

      const [depRes, arrRes] = await Promise.all([
        fetch(depUrl),
        fetch(arrUrl)
      ]);

      const depJson = await depRes.json();
      const arrJson = await arrRes.json();

      if (depJson.error || arrJson.error) {
        return res.status(500).json({
          error: 'Aviationstack error',
          depError: depJson.error || null,
          arrError: arrJson.error || null
        });
      }

      const depFlights = Array.isArray(depJson.data) ? depJson.data : [];
      const arrFlights = Array.isArray(arrJson.data) ? arrJson.data : [];
      const flights = [...depFlights, ...arrFlights];

      return res.status(200).json({
        airport,
        depCount: depFlights.length,
        arrCount: arrFlights.length,
        flights
      });
    }

    // SYD heavy watchlist mode
    const requests = watchlist.map(async (flightIata) => {
      const url = `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${encodeURIComponent(flightIata)}&limit=10`;

      try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
          return [];
        }

        const rows = Array.isArray(json.data) ? json.data : [];

        return rows.filter(f => {
          const depIata = String(f.departure?.iata || '').toUpperCase();
          const arrIata = String(f.arrival?.iata || '').toUpperCase();
          const actualFlight = String(f.flight?.iata || '').toUpperCase();

          return (
            actualFlight === flightIata &&
            (depIata === airport || arrIata === airport)
          );
        });
      } catch {
        return [];
      }
    });

    const results = await Promise.all(requests);
    const flights = results.flat();

    return res.status(200).json({
      airport,
      mode: 'watchlist',
      watchlistSize: watchlist.length,
      flights
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch schedule',
      details: err.message
    });
  }
}
