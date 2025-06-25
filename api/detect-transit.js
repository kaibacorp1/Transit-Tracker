// api/detect‐transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // dynamic import to pick up our updated detectTransits()
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

    // Normalize longitude if it's over 180 (convert from 0–360 to -180 to 180)
let normalizedLon = userLon;
if (normalizedLon > 180) {
  normalizedLon = normalizedLon - 360;
}

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

    // run the hybrid box + spherical‐separation detector
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

// call for enhnaced prediction//

console.log("enhancedPrediction flag:", document.getElementById('enhancedPrediction').checked);

