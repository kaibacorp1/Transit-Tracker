// Fake in-memory database (for now)
// Will reset every time server restarts
const activeTrackers = {};

export default function handler(req, res) {
  const { userId, location } = req.body;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST allowed' });
  }

  const now = Date.now();

  // Check if user is already tracking
  if (activeTrackers[userId] && now < activeTrackers[userId].expiresAt) {
    const minsLeft = Math.ceil((activeTrackers[userId].expiresAt - now) / 60000);
    return res.status(403).json({ message: `Already tracking. Try again in ${minsLeft} min.` });
  }

  // Save user tracking info with 1 hour timeout
  activeTrackers[userId] = {
    startedAt: now,
    expiresAt: now + 60 * 60 * 1000, // 1 hour in ms
    location,
  };

  return res.status(200).json({ message: 'Tracking started for 1 hour.' });
}
