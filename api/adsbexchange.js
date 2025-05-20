export default async function handler(req, res) {
  const { ADSB_API_KEY, ADSB_API_HOST } = process.env;
  const { lat, lon, dist } = req.query;

  if (!ADSB_API_KEY || !ADSB_API_HOST) {
    return res.status(500).json({ error: 'Missing ADS-B API credentials.' });
  }

  const url = `https://${ADSB_API_HOST}/v2/lat/${lat}/lon/${lon}/dist/${dist}/`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': ADSB_API_HOST,
        'x-rapidapi-key': ADSB_API_KEY
      }
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'ADS-B API fetch failed.' });
  }
}
