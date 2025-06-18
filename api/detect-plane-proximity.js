// api/detect-plane-proximity.js

import { detectHybridProximity } from '../utils/aircraftProximityUtils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { observer, aircraft } = req.body;
  if (!observer || !Array.isArray(aircraft)) {
    return res.status(400).json({ error: 'Missing observer or aircraft list' });
  }

  try {
    const matches = detectHybridProximity(observer, aircraft);
    return res.status(200).json({ matches });
  } catch (err) {
    console.error('Plane proximity error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
