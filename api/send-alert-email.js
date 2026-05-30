import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_TEXT_LENGTH = 160;

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

function normalizeMode(value) {
  return String(value || 'moon').toLowerCase().replace(/\s+/g, ' ').trim();
}

function modeLabel(mode) {
  const normalized = normalizeMode(mode);

  if (normalized === 'moon') return 'Moon transit';
  if (normalized === 'sun') return 'Sun transit';
  if (normalized === 'plane contrails') return 'Contrail';
  if (normalized === 'plane watch') return 'Plane Watch';
  if (normalized === 'plane on plane') return 'Plane-on-plane';

  return cleanText(mode, 'Transit Chaser');
}

function normalizeAlert(raw = {}, fallbackTarget = 'moon') {
  return {
    target: cleanText(raw.target || fallbackTarget, fallbackTarget),
    callsign: cleanText(raw.callsign, 'Unknown aircraft'),
    hex: cleanText(raw.hex, ''),
    lookDirection: cleanText(raw.lookDirection, 'the target direction'),
    headingDirection: cleanText(raw.headingDirection, 'unknown heading'),
    secondsUntilTransit: isFiniteNumber(raw.secondsUntilTransit)
      ? Math.max(0, Math.round(raw.secondsUntilTransit))
      : null,
    altitudeText: cleanText(raw.altitudeText, ''),
    distanceText: cleanText(raw.distanceText, ''),
    aircraftType: cleanText(raw.aircraftType, ''),
    pairText: cleanText(raw.pairText, ''),
    separationText: cleanText(raw.separationText, '')
  };
}

function buildAlertLine(alert, index, target) {
  const mode = normalizeMode(target);

  if (mode === 'moon' || mode === 'sun') {
    const secondsText = alert.secondsUntilTransit !== null
      ? ` — within about ${alert.secondsUntilTransit} seconds`
      : '';

    return `${index + 1}. ${alert.callsign} — look up ${alert.lookDirection}, ✈️ heading ${alert.headingDirection}${secondsText}`;
  }

  if (mode === 'plane contrails') {
    return `${index + 1}. ${alert.callsign} — look up ${alert.lookDirection}${alert.altitudeText ? `, ${alert.altitudeText}` : ''}`;
  }

  if (mode === 'plane watch') {
    const pieces = [
      alert.aircraftType || null,
      alert.distanceText || null,
      alert.lookDirection ? `towards ${alert.lookDirection}` : null,
      alert.altitudeText || null
    ].filter(Boolean);

    return `${index + 1}. ${alert.callsign}${pieces.length ? ` — ${pieces.join(', ')}` : ''}`;
  }

  if (mode === 'plane on plane') {
    return `${index + 1}. ${alert.pairText || alert.callsign} — look up ${alert.lookDirection}${alert.separationText ? `, ${alert.separationText}` : ''}`;
  }

  return `${index + 1}. ${alert.callsign}`;
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

    const target = cleanText(body.target, 'moon');
    const label = modeLabel(target);
    const alertTime = cleanText(body.alertTime, new Date().toISOString());
    const locationLabel = cleanText(body.locationLabel, 'your selected location');

    if (body.test === true) {
      const subject = `Transit Chaser email alerts are enabled`;

      const text = [
        `🔭 Transit Chaser email alerts are ready.`,
        ``,
        `You will start receiving ${label} email alerts while your Transit Chaser page is open.`,
        ``,
        `Current alert mode: ${label}`,
        `Observer location: ${locationLabel}`,
        `Setup time: ${alertTime}`,
        ``,
        `Example alert:`,
        `1. EXAMPLE123 — look up South, ✈️ heading North East — within about 120 seconds`,
        ``,
        `All the best,`,
        `Transit Chaser`
      ].join('\n');

      const result = await resend.emails.send({
        from: process.env.ALERT_FROM_EMAIL || 'Transit Chaser <alerts@transitchaser.com>',
        to: email,
        subject,
        text
      });

      if (result?.error) {
        console.error('Resend rejected test email:', result.error);
        return res.status(502).json({
          ok: false,
          error: result.error.message || 'Resend rejected the test email'
        });
      }

      return res.status(200).json({
        ok: true,
        test: true,
        id: result?.data?.id || null
      });
    }

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
        ? `${label} alert: ${alerts[0].callsign}`
        : `${label} alert: ${count} aircraft`;

    const alertLines = alerts
      .map((alert, index) => buildAlertLine(alert, index, target))
      .join('\n');

    const text = [
      `🔭 Transit Chaser alert`,
      ``,
      count === 1
        ? `1 ${label.toLowerCase()} alert was detected.`
        : `${count} ${label.toLowerCase()} alerts were detected.`,
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
