export default async function handler(req, res) {
  try {
    const { flightType = 'departure', date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Missing date' });
    }

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

    const flights = [];
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowRegex) || [];

    for (const row of rows) {
      const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      const flightMatch = text.match(/\b([A-Z]{2}\s?\d{1,4})\b/);
      const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);

      if (!flightMatch || !timeMatch) continue;

      const flightNumber = flightMatch[1].replace(/\s+/g, '');
      const scheduledTime = timeMatch[1];

      flights.push({
        flightNumber,
        scheduledTime,
        airline: '',
        city: '',
        status: text,
        terminal: 'T1',
        flightType
      });
    }

    return res.status(200).json({ flights });
  } catch (err) {
    console.error('sydney-airport-schedule error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
