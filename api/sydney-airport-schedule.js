export default async function handler(req, res) {
  try {
    const { flightType = 'departure', date } = req.query;

    const airportUrl = `https://www.sydneyairport.com.au/flights/?query=&flightType=${encodeURIComponent(flightType)}&terminalType=international&date=${encodeURIComponent(date)}&sortColumn=scheduled_time&ascending=true&showAll=false`;

    const pageRes = await fetch(airportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!pageRes.ok) {
      return res.status(pageRes.status).json({ error: 'Failed to fetch Sydney Airport page' });
    }

    const html = await pageRes.text();

    // TODO: parse HTML rows here
    const flights = [];

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('sydney-airport-schedule error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
