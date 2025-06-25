// api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

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
    searchRadius = 100 // default fallback if not provided
  } = req.body;

  // Normalize longitude if it's over 180 (convert from 0–360 to -180 to 180)
  let normalizedLon = userLon;
  if (normalizedLon > 180) {
    normalizedLon = normalizedLon - 360;
  }

  // Validate required fields for both modes
  if (!Array.isArray(flights) || userLat == null || userLon == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let matches;

    if (selectedBody === 'plane on plane') {
      const { detectPlaneOnPlane } = await import('../utils/transitUtils.js');
      matches = detectPlaneOnPlane({
        flights,
        userLat,
        userLon: normalizedLon,
        userElev,
        margin,
        predictSeconds,
        searchRadius
      });
    } else {
      const { detectTransits } = await import('../utils/transitUtils.js');

      // bodyAz and bodyAlt required for Sun/Moon
      if (bodyAz == null || bodyAlt == null) {
        return res.status(400).json({ error: 'Missing celestial position' });
      }

      matches = detectTransits({
        flights,
        userLat,
        userLon: normalizedLon,
        userElev,
        bodyAz,
        bodyAlt,
        margin,
        predictSeconds,
        selectedBody,
        use3DHeading: enhancedPrediction || predictSeconds > 0 || use3DHeading,
        useZenithLogic: enhancedPrediction || useZenithLogic,
        useDynamicMargin: enhancedPrediction
      });
    }

    return res.status(200).json({ matches });
  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
