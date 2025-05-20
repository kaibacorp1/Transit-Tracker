export default async function handler(req, res) {
  const { username, password } = process.env;
  const { lamin, lamax, lomin, lomax } = req.query;

  if (!username || !password) {
    return res.status(401).json({ error: 'Missing credentials' });
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  try {
    const response = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`,
      {
        headers: { Authorization: `Basic ${auth}` }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Fetch failed: ${text}` });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
}
