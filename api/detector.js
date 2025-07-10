const fetch = require('node-fetch');
const SunCalc = require('suncalc');
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  const observer = {
    lat: -43.154364,
    lon: 172.739712,
    radiusKm: 1000,
    marginDegrees: 150
  };

  const alertEmail = 'sandu.godakumbura@gmail.com';

  try {
    const now = new Date();
    const moonPos = SunCalc.getMoonPosition(now, observer.lat, observer.lon);

    const response = await fetch(
      'https://api.adsb.lol/api/states/all?lamin=-90&lamax=90&lomin=-180&lomax=180'
    );

    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error("Failed to parse aircraft data:", err);
      return res.status(502).json({ error: "Invalid JSON from aircraft API" });
    }

    const planes = data.states || [];

    const matchingPlanes = planes.filter(p => {
      const lat = p[6];
      const lon = p[5];
      if (lat === null || lon === null) return false;

      const dLat = toRadians(lat - observer.lat);
      const dLon = toRadians(lon - observer.lon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(observer.lat)) * Math.cos(toRadians(lat)) *
        Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c;

      if (distance > observer.radiusKm) return false;

      const bearing = Math.atan2(
        Math.sin(dLon) * Math.cos(toRadians(lat)),
        Math.cos(toRadians(observer.lat)) * Math.sin(toRadians(lat)) -
        Math.sin(toRadians(observer.lat)) * Math.cos(toRadians(lat)) * Math.cos(dLon)
      );

      const azimuthDeg = (toDegrees(bearing) + 360) % 360;
      const moonAzimuthDeg = (toDegrees(moonPos.azimuth) + 360) % 360;
      const azDiff = Math.abs(moonAzimuthDeg - azimuthDeg);
      const angularDiff = azDiff > 180 ? 360 - azDiff : azDiff;

      return angularDiff <= observer.marginDegrees;
    });

    if (matchingPlanes.length > 0) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.ALERT_EMAIL,
          pass: process.env.ALERT_EMAIL_PASSWORD
        }
      });

      await transporter.sendMail({
        from: `Transit Chaser <${process.env.ALERT_EMAIL}>`,
        to: alertEmail,
        subject: '🚨 Moon Transit Candidate Detected!',
        text: `We found ${matchingPlanes.length} aircraft within ${observer.radiusKm}km and ${observer.marginDegrees}° of your location near the moon.\n\nTimestamp: ${now.toUTCString()}`
      });

      return res.status(200).json({ message: 'Alert sent!' });
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

function toDegrees(rad) {
  return rad * (180 / Math.PI);
}
