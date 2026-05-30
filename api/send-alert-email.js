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

function normalizeAlert(raw = {}, fallbackTarget = 'Moon') {
  return {
    target: cleanText(raw.target || fallbackTarget, fallbackTarget),
    callsign: cleanText(raw.callsign, 'Unknown aircraft'),
    lookDirection: cleanText(raw.lookDirection, 'the target direction'),
    headingDirection: cleanText(raw.headingDirection, 'unknown heading'),
    secondsUntilTransit: isFiniteNumber(raw.secondsUntilTransit)
      ? Math.max(0, Math.round(raw.secondsUntilTransit))
      : null
  };
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
    const email = cleanText(body.email, '');

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address' });
    }

    const target = cleanText(body.target, 'Moon');
    const alertTime = cleanText(body.alertTime, new Date().toISOString());
    const locationLabel = cleanText(body.locationLabel, 'your selected location');

    const alertsInput = Array.isArray(body.alerts) && body.alerts.length
      ? body.alerts
      : [body];

    const alerts = alertsInput
      .slice(0, 10)
      .map(alert => normalizeAlert(alert, target));

    if (!alerts.length) {
      return res.status(400).json({ ok: false, error: 'No alerts to send' });
    }

    const count = alerts.length;

    const subject =
      count === 1
        ? `Transit alert: ${alerts[0].callsign} may cross the ${alerts[0].target}`
        : `Transit alert: ${count} aircraft may cross the ${target}`;

    const alertLines = alerts.map((alert, index) => {
      const secondsText = alert.secondsUntilTransit !== null
        ? `within about ${alert.secondsUntilTransit} seconds`
        : `soon`;

      return `${index + 1}. ${alert.callsign} — look up ${alert.lookDirection}, ✈️ heading ${alert.headingDirection} — ${secondsText}`;
    }).join('\n');

    const text = [
      `🔭 Transit Chaser alert`,
      ``,
      count === 1
        ? `${alerts[0].callsign} may transit the ${alerts[0].target} soon.`
        : `${count} aircraft may transit the ${target} soon.`,
      ``,
      alertLines,
      ``,
      `Approximate alert time: ${alertTime}`,
      `Observer location: ${locationLabel}`,
      ``,
      `Look up and be ready with your camera.`,
      ``,
      `This alert was sent because email alerts are enabled in your Transit Chaser browser session.`
    ].join('\n');

    const result = await resend.emails.send({
      from: process.env.ALERT_FROM_EMAIL || 'Transit Chaser <alerts@transitchaser.com>',
      to: email,
      subject,
      text
    });

    if (result?.error) {
      console.error('Resend rejected email:', result.error);
      return res.status(502).json({
        ok: false,
        error: result.error.message || 'Resend rejected the email'
      });
    }

    return res.status(200).json({
      ok: true,
      id: result?.data?.id || null,
      count
    });
  } catch (error) {
    console.error('send-alert-email failed:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Failed to send email'
    });
  }
}
