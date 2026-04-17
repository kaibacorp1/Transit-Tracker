export default async function handler(req, res) {
  try {
    const key = process.env.AVIATIONSTACK_KEY;
    if (!key) {
      return res.status(500).json({ error: 'Missing AVIATIONSTACK_KEY' });
    }

    const airport = (req.query.airport || 'SYD').toUpperCase();

    const today = new Date().toISOString().slice(0, 10);

    const depUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&dep_iata=${airport}&flight_date=${today}&limit=100`;
    const arrUrl = `http://api.aviationstack.com/v1/flights?access_key=${key}&arr_iata=${airport}&flight_date=${today}&limit=100`;

    const [depRes, arrRes] = await Promise.all([
      fetch(depUrl),
      fetch(arrUrl)
    ]);

    const [depJson, arrJson] = await Promise.all([
      depRes.json(),
      arrRes.json()
    ]);

    if (depJson.error) {
      return res.status(500).json({ error: `Departure API error: ${depJson.error.message || 'unknown error'}` });
    }

    if (arrJson.error) {
      return res.status(500).json({ error: `Arrival API error: ${arrJson.error.message || 'unknown error'}` });
    }

    const depFlights = Array.isArray(depJson.data) ? depJson.data : [];
    const arrFlights = Array.isArray(arrJson.data) ? arrJson.data : [];

    const flights = [...depFlights, ...arrFlights];

    return res.status(200).json({
      airport,
      date: today,
      depCount: depFlights.length,
      arrCount: arrFlights.length,
      flights
    });
  } catch (err) {
    console.error('syd-schedule error:', err);
    return res.status(500).json({ error: 'Failed to fetch schedule' });
  }
}
