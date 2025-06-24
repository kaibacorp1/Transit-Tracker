// api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

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

    const mode = req.body.mode || 'celestial';

    // ✅ Normalize longitude BEFORE any use
    let normalizedLon = userLon;
    if (normalizedLon > 180) {
      normalizedLon = normalizedLon - 360;
    }

    // ✅ Safe to use normalizedLon now
    if (mode === 'planeOnPlane') {
      const { detectPlaneOnPlaneTransits } = await import('../utils/transitUtils.js');
      const matches = detectPlaneOnPlaneTransits({
        flights,
        userLat,
        userLon: normalizedLon,
        marginDegrees: margin,
        searchRadiusKm: 100,
        predictSeconds
      });
      return res.status(200).json({ matches });
    }

    // validate required inputs (only for celestial mode)
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
      userLon: normalizedLon,
      userElev,
      bodyAz,
      bodyAlt,
      margin,
      predictSeconds,
      selectedBody,
      use3DHeading: enhancedPrediction || use3DHeading,
      useZenithLogic: enhancedPrediction || useZenithLogic,
      useDynamicMargin: enhancedPrediction
    });

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
