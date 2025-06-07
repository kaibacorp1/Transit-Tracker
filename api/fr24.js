// api/fr24.js

export default async function handler(req, res) {
  // 1) Grab & log the user’s Bearer token
  const auth = req.headers.authorization;
  console.log('🔑 FR24 proxy got Authorization header:', auth);
  if (!auth) {
    return res
      .status(400)
      .json({ error: 'Missing Authorization header with Bearer token' });
  }

  // 2) Parse & log the bounding‐box parameter
  const { bounds } = req.query;
  console.log('📐 FR24 proxy got bounds:', bounds);
  if (!bounds) {
    return res
      .status(400)
      .json({ error: 'Missing bounds parameter' });
  }

  // 3) Forward to the *sandbox* endpoint (sandbox tokens always work here)
  const url = `https://fr24api.flightradar24.com/sandbox/common/v1/flight/list.json?bounds=${encodeURIComponent(bounds)}`;
  console.log('🌐 Fetching FR24 sandbox URL:', url);

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: auth,
        'Accept-Version': 'v1',          // ← must be this exact header name
        'Accept': 'application/json'
      }
    });

    console.log('↔️ FR24 upstream status:', upstream.status);

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('❌ FR24 upstream error body:', text.substring(0, 200));
      return res
        .status(502)
        .json({ error: 'Upstream error', status: upstream.status, details: text });
    }

    // 4) Relay the JSON back with CORS
    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);

  } catch (err) {
    console.error('🔥 FR24 proxy caught exception:', err);
    return res
      .status(502)
      .json({ error: 'Bad gateway', details: err.message });
  }
}
