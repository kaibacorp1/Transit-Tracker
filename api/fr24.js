// api/fr24.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { bounds } = req.query;
  const token = process.env.FR24_TOKEN;
  if (!bounds) {
    return res.status(400).json({ error: 'Missing bounds parameter' });
  }
  if (!token) {
    return res.status(500).json({ error: 'FR24 token not configured' });
  }

  const url = `https://fr24api.flightradar24.com/common/v1/flight/list.json?bounds=${bounds}`;
  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await upstream.json();
    // mirror CORS allowance for your front end
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (err) {
    console.error('FR24 proxy error:', err);
    return res.status(502).json({ error: 'Bad gateway', details: err.message });
  }
}
