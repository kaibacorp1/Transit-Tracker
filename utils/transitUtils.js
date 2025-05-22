import { detectTransits } from '../utils/transitUtils.js';

export default async function handler(req, res) {
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

  if (
    !flights || !Array.isArray(flights) ||
    userLat == null || userLon == null || userElev == null ||
    bodyAz == null || bodyAlt == null
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const results = detectTransits({
    flights,
    userLat,
    userLon,
    userElev,
    bodyAz,
    bodyAlt,
    margin: margin || 2.5,
    predictSeconds: predictSeconds || 0,
    selectedBody: selectedBody || 'moon'
  });

  return res.status(200).json({ matches: results });
}
