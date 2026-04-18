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

// Extract ALL flight-like codes (EK412, SQ221, etc)
const flightRegex = /\b([A-Z]{2}\d{1,4})\b/g;
const timeRegex = /\b(\d{1,2}:\d{2})\b/g;

const flightMatches = [...html.matchAll(flightRegex)];
const timeMatches = [...html.matchAll(timeRegex)];

const count = Math.min(flightMatches.length, timeMatches.length);

for (let i = 0; i < count; i++) {
  flights.push({
    flightNumber: flightMatches[i][1],
    scheduledTime: timeMatches[i][1],
    airline: '',
    city: '',
    status: '',
    terminal: 'T1',
    flightType
  });
}
    console.log('Parsed flights count:', flights.length);
console.log('Parsed flights sample:', flights.slice(0, 20));
    return res.status(200).json({ flights });
  } catch (err) {
    console.error('sydney-airport-schedule error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
