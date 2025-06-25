// api/detect-transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // dynamic imports for both detectors
  const { detectTransits, detectPlaneOnPlane } = await import('../utils/transitUtils.js');

  try {
    const {
      mode = 'default',
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
      enhancedPrediction = false
    } = req.body;

    // Normalize longitude if it's over 180
    let normalizedLon = userLon;
    if (normalizedLon > 180) {
      normalizedLon = normalizedLon - 360;
    }

    if (mode === 'plane on plane') {
      // run new ✈️ on ✈️ detection logic
      if (!Array.isArray(flights) || userLat == null || userLon == null) {
        return res.status(400).json({ error: 'Missing required fields for plane-on-plane mode' });
      }

      const observer = {
        lat: userLat,
        lon: normalizedLon,
        alt: userElev
      };

      const result = await detectPlaneOnPlane(flights, observer);
      return res.status(200).json({ matches: result });
    }

    // default celestial mode
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
      use3DHeading: enhancedPrediction || predictSeconds > 0 || use3DHeading,
      useZenithLogic: enhancedPrediction || useZenithLogic,
      useDynamicMargin: enhancedPrediction
    });

    return res.status(200).json({ matches });

  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
