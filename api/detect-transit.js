// api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { detectTransits, detectPlaneCrossovers } = await import('../utils/transitUtils.js');

  try {
    const {
      flights,
      userLat,
      userLon,
      userElev = 0,
      bodyAz,
      bodyAlt,
      margin = 2.5,
      predictSeconds = 0,
      selectedBody = 'moon',
      use3DHeading,
      strictMode = false,
      planeCrossoverMode = false,   // ✅ new toggle
      angleThreshold = 2.0          // ✅ new threshold setting
    } = req.body;

    if (!Array.isArray(flights) || userLat == null || userLon == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (planeCrossoverMode) {
      const planeCrossoverMatches = detectPlaneCrossovers({
        flights,
        userLat,
        userLon,
        userElev,
        predictSeconds,
        angleThreshold
      });

      return res.status(200).json({ planeCrossoverMatches });
    }

    if (bodyAz == null || bodyAlt == null) {
      return res.status(400).json({ error: 'Missing celestial target info' });
    }

    const matches = detectTransits({
      flights,
      userLat,
      userLon,
      userElev,
      bodyAz,
      bodyAlt,
      margin,
      predictSeconds,
      selectedBody,
      use3DHeading,
      strictMode
    });

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
