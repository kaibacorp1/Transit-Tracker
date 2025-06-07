// api/fr24.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 1) Grab the user’s token from the Authorization header
  const auth = req.headers.authorization;
  if (!auth) {
    return res
      .status(400)
      .json({ error: 'Missing Authorization header with Bearer token' });
  }

  // 2) Grab bounds from query
  const { bounds } = req.query;
  if (!bounds) {
    return res.status(400).json({ error: 'Missing bounds parameter' });
  }

  // 3) Forward the request to FR24, passing their token along exactly
  const url = `https://fr24api.flightradar24.com/common/v1/flight/list.json?bounds=${bounds}`;
  try {
    const upstream = await fetch(url, {
      headers: { Authorization: auth }
    });
    const data = await upstream.json();

    // 4) Add CORS so the browser will accept it
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (err) {
    console.error('FR24 proxy error:', err);
    return res.status(502).json({ error: 'Bad gateway', details: err.message });
  }
}
