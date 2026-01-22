export default async function handler(req, res) {
  const url = "https://api.adsb.one/v2/point/-33.9186/151.1976/16.2";

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "transitchaser-test/1.0 (+https://transitchaser.com)",
        "Accept": "application/json",
      }
    });

    const text = await r.text();

    res.status(200).json({
      ok: r.ok,
      status: r.status,
      contentType: r.headers.get("content-type"),
      snippet: text.slice(0, 200)
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
