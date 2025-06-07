// pages/api/fr24.js (Next.js / Vercel Function)

export default async function handler(req, res) {
  // 1) Grab the user’s Bearer token
  const auth = req.headers.authorization;
  if (!auth) {
    return res
      .status(400)
      .json({ error: 'Missing Authorization header with Bearer token' });
  }

  // 2) Parse the bounding-box parameter
  const { bounds } = req.query;
  if (!bounds) {
    return res
      .status(400)
      .json({ error: 'Missing bounds parameter' });
  }

  // 3) Forward to FR24 production API
  //    (their production host accepts sandbox tokens as well)
  const url = `https://fr24api.flightradar24.com/common/v1/flight/list.json?bounds=${bounds}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: auth,
        'Accept-Version': 'v1'    // ← this must be “Accept-Version”, not “API-Version”
      }
    });

    // 4) If FR24 itself errors, bubble it back
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('FR24 upstream error:', upstream.status, text);
      return res
        .status(502)
        .json({ error: 'Upstream error', status: upstream.status, details: text });
    }

    // 5) Relay the JSON back to your frontend (with CORS open)
    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);

  } catch (err) {
    console.error('FR24 proxy error:', err);
    return res
      .status(502)
      .json({ error: 'Bad gateway', details: err.message });
  }
}
