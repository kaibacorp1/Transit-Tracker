// api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const mode = req.body.mode || 'transit';

  // CONTRAIL MODE: Short-circuit and run separate detection
  if (mode === 'contrail') {
    try {
      const { detectContrailPlanes } = await import('../utils/transitUtils.js');
      const contrailMatches = detectContrailPlanes(req.body);
      return res.status(200).json({ contrailMatches });
    } catch (err) {
      console.error('contrail detection error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // TRANSIT MODE (default behavior)
  const { detectTransits } = await import('../utils/transitUtils.js');

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
      useZenithLogic = false,
      enhancedPrediction = false,
    } = req.body;

    // validate required inputs
    if (
      !Array.isArray(flights) ||
      userLat == null ||
      userLon == null ||
      bodyAz == null ||
      bodyAlt == null
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
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
      use3DHeading: enhancedPrediction || use3DHeading,
      useZenithLogic: enhancedPrediction || useZenithLogic,
      useDynamicMargin: enhancedPrediction,
    });

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
