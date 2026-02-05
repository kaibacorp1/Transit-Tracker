// api/detect‐transit.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  // dynamic import to pick up our updated detectTransits()
  const {
  detectTransitsV1,
  detectTransitsV2,
  detectPlaneOnPlane
} = await import('../utils/transitUtils.js');

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
    const engineVersion = (req.body?.version || 'v1').toLowerCase();

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



    
//______________ for PLANE AND PLANE____________________///

        if (selectedBody === 'plane on plane') {
      const matches = detectPlaneOnPlane({
        flights,
        userLat,
        userLon: normalizedLon,
        userElev,
        margin,
        predictSeconds
      });
      return res.status(200).json({ matches });
    }

    
    // run the hybrid box + spherical‐separation detector
    const detectFn =
  engineVersion === 'v2' ? detectTransitsV2 : detectTransitsV1;

const matches = detectFn({
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


    return res.status(200).json({
  matches,
  engineVersionUsed: engineVersion
});

  } catch (err) {
    console.error('detect-transit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
