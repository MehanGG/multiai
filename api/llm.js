// Proxy opsional untuk memanggil API model dari browser ketika penyedia menolak panggilan langsung (CORS).
// Hanya meneruskan permintaan ke host yang diizinkan. Key pengguna ikut dikirim lewat header, tidak disimpan.
const ALLOW = [
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'api.moonshot.ai',
  'api.moonshot.cn',
  'generativelanguage.googleapis.com',
];
const PASS = ['content-type', 'authorization', 'x-api-key', 'x-goog-api-key', 'anthropic-version', 'anthropic-beta'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak didukung' });

  const { url, headers, body } = req.body || {};
  let u;
  try { u = new URL(url); } catch (e) { return res.status(400).json({ error: 'URL tidak valid' }); }
  if (u.protocol !== 'https:' || !ALLOW.includes(u.hostname)) {
    return res.status(400).json({ error: 'Host tidak diizinkan' });
  }
  if (typeof body !== 'string') return res.status(400).json({ error: 'Body tidak valid' });

  const h = {};
  Object.keys(headers || {}).forEach((k) => { if (PASS.includes(k.toLowerCase())) h[k] = headers[k]; });

  try {
    const up = await fetch(url, { method: 'POST', headers: h, body });
    res.status(up.status);
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!up.body) return res.end(await up.text());
    const reader = up.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (e) {
    return res.status(502).json({ error: 'Gagal menghubungi penyedia' });
  }
};
