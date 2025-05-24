// pages/api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // dynamic import avoids ESM resolution quirks
  const { detectTransits } = await import('../utils/transitUtils.js');

  try {
    const {
      flights,
      userLat,
      userLon,
      userElev = 0,
      bodyAz,
      bodyEl,        // <-- renamed from bodyAlt
      margin = 2.5   // degrees
    } = req.body;

    if (
      !Array.isArray(flights) ||
      userLat == null ||
      userLon == null ||
      bodyAz == null ||
      bodyEl == null
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // call our math helper
    const matches = detectTransits({
      flights,
      userLat,
      userLon,
      userElev,
      bodyAz,
      bodyEl,
      marginDeg: margin   // pass as marginDeg
    });

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
