import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_TEXT_LENGTH = 120;

function cleanText(value, fallback = 'Unknown') {
  if (value === null || value === undefined) return fallback;

  return String(value)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH) || fallback;
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value, decimals = 1, fallback = 'Unknown') {
  return isFiniteNumber(value) ? value.toFixed(decimals) : fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Email service is not configured' });
    }

    const body = req.body || {};

    if (process.env.ALERT_SECRET && body.secret !== process.env.ALERT_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const email = cleanText(body.email, '');

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address' });
    }

    const target = cleanText(body.target, 'Moon');
    const callsign = cleanText(body.callsign, 'Unknown aircraft');
    const aircraftType = cleanText(body.aircraftType, 'Unknown type');
    const alertTime = cleanText(body.alertTime, new Date().toISOString());
    const locationLabel = cleanText(body.locationLabel, 'your selected location');

    const secondsUntilTransit = isFiniteNumber(body.secondsUntilTransit)
      ? Math.max(0, Math.round(body.secondsUntilTransit))
      : null;

    const altitude = isFiniteNumber(body.altitude)
      ? Math.round(body.altitude)
      : null;

    const angularSeparation = isFiniteNumber(body.angularSeparation)
      ? body.angularSeparation
      : null;

    const subject = `Transit alert: ${callsign} may cross the ${target}`;

    const text = [
      `Transit Chaser alert`,
      ``,
      `${callsign} may transit the ${target}${secondsUntilTransit !== null ? ` within about ${secondsUntilTransit} seconds` : ''}.`,
      ``,
      `Target: ${target}`,
      `Aircraft: ${callsign}`,
      `Aircraft type: ${aircraftType}`,
      `Altitude: ${altitude !== null ? `${altitude.toLocaleString()} ft` : 'Unknown'}`,
      `Approximate alert time: ${alertTime}`,
      `Observer location: ${locationLabel}`,
      `Angular separation: ${angularSeparation !== null ? `${formatNumber(angularSeparation, 3)}°` : 'Unknown'}`,
      ``,
      `Look up and be ready with your camera.`,
      ``,
      `This alert was sent because email alerts are enabled in your Transit Chaser browser session.`
    ].join('\n');

    const result = await resend.emails.send({
      from: process.env.ALERT_FROM_EMAIL || 'Transit Chaser <onboarding@resend.dev>',
      to: email,
      subject,
      text
    });

    return res.status(200).json({
      ok: true,
      id: result?.data?.id || null
    });
  } catch (error) {
    console.error('send-alert-email failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'Failed to send email'
    });
  }
}
