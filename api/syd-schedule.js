export default async function handler(req, res) {
  try {
    const key = process.env.AVIATIONSTACK_KEY;
    if (!key) {
      return res.status(500).json({ error: 'Missing AVIATIONSTACK_KEY' });
    }

    const airport = (req.query.airport || 'SYD').toUpperCase();

    const depUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&dep_iata=${airport}&limit=300`;
    const arrUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&arr_iata=${airport}&limit=300`;

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
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch schedule',
      details: err.message
    });
  }
}
