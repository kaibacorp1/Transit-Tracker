// pages/api/detect-transit.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // dynamic import avoids ESM resolution quirks
  const { detectTransits } = await import('../../utils/transitUtils.js');

  try {
    const {
      flights,
      userLat,
      userLon,
      userElev,
      bodyAz,
      bodyAlt,
      margin = 2.5,
      predictSeconds = 0,
      selectedBody = 'moon'
    } = req.body;

    if (!Array.isArray(flights) || userLat == null || userLon == null || bodyAz == null || bodyAlt == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const matches = detectTransits({ flights, userLat, userLon, userElev, bodyAz, bodyAlt, margin, predictSeconds, selectedBody });
    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
