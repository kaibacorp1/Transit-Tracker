// api/detect-transit.js

import { detectTransits } from '../utils/transitUtils.js'; // Make sure this uses ES Modules

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const {
    flights,
    userLat,
    userLon,
    userElev,
    bodyAz,
    bodyAlt,
    margin,
    predictSeconds,
    selectedBody
  } = req.body;

  if (!flights || userLat == null || userLon == null || bodyAz == null || bodyAlt == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const results = detectTransits({
    flights,
    userLat,
    userLon,
    userElev,
    bodyAz,
    bodyAlt,
    margin,
    predictSeconds,
    selectedBody
  });

  res.status(200).json({ matches: results });
}
