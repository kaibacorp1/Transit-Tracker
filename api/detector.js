// /api/detector.js

const fetch = require('node-fetch');
const SunCalc = require('suncalc');
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  // === CONFIG ===
  const observer = {
    lat: -43.154364,
    lon: 172.739712,
    radiusKm: 100,
    marginDegrees: 50 // large margin for now
  };

  const alertEmail = 'sandu.godakumbura@gmail.com';

  try {
    // === 1. Get Moon Position ===
    const now = new Date();
    const moonPos = SunCalc.getMoonPosition(now, observer.lat, observer.lon);

    // === 2. Fetch Aircraft Data ===
    const response = await fetch('https://opensky-network.org/api/states/all');
    const data = await response.json();
    const planes = data.states || [];

    // === 3. Check Each Plane for Proximity to Moon ===
    const matchingPlanes = planes.filter(p => {
      const lat = p[6];
      const lon = p[5];
      if (lat === null || lon === null) return false;

      const dLat = toRadians(lat - observer.lat);
      const dLon = toRadians(lon - observer.lon);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(observer.lat)) * Math.cos(toRadians(lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c; // Earth's radius in km

      return distance <= observer.radiusKm;
    });

    if (matchingPlanes.length > 0) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'youremail@gmail.com', // <-- replace with your Gmail
          pass: 'your_app_password_here' // <-- use App Password from Gmail settings
        }
      });

      const info = await transporter.sendMail({
        from: 'Transit Chaser <youremail@gmail.com>',
        to: alertEmail,
        subject: '🚨 Moon Transit Candidate Detected!',
        text: `We found ${matchingPlanes.length} aircraft within ${observer.radiusKm}km and ${observer.marginDegrees}° margin near the moon.`
      });

      return res.status(200).json({ message: 'Alert sent!', info });
    } else {
      return res.status(200).json({ message: 'No candidates found.' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

function toRadians(deg) {
  return deg * (Math.PI / 180);
}
