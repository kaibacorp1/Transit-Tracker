export default async function handler(req, res) {
  try {
    const key = process.env.AVIATIONSTACK_KEY;

    if (!key) {
      return res.status(500).json({ error: 'Missing AVIATIONSTACK_KEY' });
    }

    const airport = (req.query.airport || 'SYD').toUpperCase();

    const url = `http://api.aviationstack.com/v1/flights?access_key=${key}&limit=100`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data || !Array.isArray(data.data)) {
      return res.status(500).json({ error: 'Invalid response from Aviationstack' });
    }

    const today = new Date().toISOString().split('T')[0];

    const flights = data.data.filter(f => {
      const depMatch = f.departure?.iata === airport;
      const arrMatch = f.arrival?.iata === airport;
      return (depMatch || arrMatch) && f.flight_date === today;
    });

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('syd-schedule error:', err);
    return res.status(500).json({ error: 'Failed to fetch schedule' });
  }
}
