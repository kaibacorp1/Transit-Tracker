// api/fr24.js

export default async function handler(req, res) {
  // 1) Get the user’s token from the Authorization header
  const auth = req.headers.authorization;
  if (!auth) {
    return res
      .status(400)
      .json({ error: 'Missing Authorization header with Bearer token' });
  }

  // 2) Get the bounds query string
  const { bounds } = req.query;
  if (!bounds) {
    return res.status(400).json({ error: 'Missing bounds parameter' });
  }

  // production endpoint (supports sandbox tokens) + version header
const url = `https://fr24api.flightradar24.com/common/v1/flight/list.json?bounds=${bounds}`;
  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: auth,
        'Accept-Version': 'v1'    // ← tell FR24 which API version you’re calling
      }
   });

    // If FR24 itself errors, pass that back
    if (!upstream.ok) {
      const text = await upstream.text();
      console.error('FR24 upstream error:', upstream.status, text);
      return res
        .status(502)
        .json({ error: 'Upstream error', status: upstream.status, details: text });
    }

    const data = await upstream.json();

    // 4) Allow your frontend to consume it
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);

  } catch (err) {
    console.error('FR24 proxy error:', err);
    return res.status(502).json({ error: 'Bad gateway', details: err.message });
  }
}
