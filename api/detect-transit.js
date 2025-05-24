export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const {
    flights, userLat, userLon, userElev,
    bodyAz, bodyAlt, margin = 2.5,
    predictSeconds = 0, selectedBody = 'moon'
  } = req.body;

  console.log('--- detect-transit START ---');
  console.log(' user coords:', userLat, userLon, 'elev:', userElev);
  console.log(' bodyAz, bodyAlt, margin, predictSeconds:', bodyAz, bodyAlt, margin, predictSeconds);
  console.log(' flights to check:', Array.isArray(flights) ? flights.length : flights);

  try {
    const { detectTransits } = await import('../utils/transitUtils.js');
    const matches = detectTransits({
      flights, userLat, userLon, userElev,
      bodyAz, bodyAlt, margin, predictSeconds, selectedBody
    });
    console.log(' matches:', matches.map(m => m.callsign).join(', '));
    console.log('--- detect-transit END ---');
    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
