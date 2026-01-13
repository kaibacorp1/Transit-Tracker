// api/adsb-one.js
// Proxy ADSB-One through Vercel to avoid browser CORS issues (common in some regions like India)

export default async function handler(req, res) {
  // Basic CORS headers (safe even if you only call from same-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET allowed' });
  }

  try {
    const { lat, lon, radiusKm, radiusNm } = req.query;

    if (lat == null || lon == null) {
      return res.status(400).json({ error: 'Missing lat/lon' });
    }

    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return res.status(400).json({ error: 'Invalid lat/lon' });
    }

    // You can pass either radiusKm (preferred, since your UI uses km) or radiusNm
    let nm;
    if (radiusNm != null) {
      nm = Number(radiusNm);
    } else if (radiusKm != null) {
      nm = Number(radiusKm) / 1.852;
    } else {
      // Default to 30 km if nothing provided
      nm = 30 / 1.852;
    }

    if (!Number.isFinite(nm) || nm <= 0) {
      return res.status(400).json({ error: 'Invalid radius' });
    }

    // Keep it reasonably bounded
    nm = Math.min(nm, 60 / 1.852); // cap at 60 km equivalent

    // Abort timeout (prevents hung requests)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `https://api.adsb.one/v2/point/${latNum}/${lonNum}/${nm.toFixed(1)}`;
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Helpful for some CDNs; not required but can improve consistency
        'User-Agent': 'transitchaser-vercel-proxy'
      }
    });

    clearTimeout(timeout);

    // Pass through upstream status if not OK (so you can debug provider changes)
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `ADSB-One upstream error ${upstream.status}`,
        details: text?.slice(0, 500) || ''
      });
    }

    const data = await upstream.json();

    // Small edge caching on Vercel (prevents hammering ADSB-One if user polls fast)
    // Adjust if you want. This won’t cache forever; just smooths bursts.
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=4');

    return res.status(200).json(data);
  } catch (err) {
    const msg = (err && err.name === 'AbortError')
      ? 'ADSB-One request timed out'
      : (err?.message || 'Unknown error');

    return res.status(502).json({ error: msg });
  }
}
