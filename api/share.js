// Link pendek untuk MultiAI: simpan payload chat di Upstash Redis lewat REST API.
const crypto = require('crypto');

const env = process.env;
// Cari variabel Upstash/KV; tetap jalan walau memakai custom prefix (mis. STORAGE_REST_API_URL)
const pick = (re) => { const k = Object.keys(env).find((n) => re.test(n)); return k ? env[k] : undefined; };
const URL_ = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || pick(/REST_API_URL$|REST_URL$/);
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || pick(/REST_API_TOKEN$|REST_TOKEN$/);
const TTL = 60 * 60 * 24 * 30; // 30 hari
const MAX = 300000;            // batas ukuran payload (karakter)

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Storage belum dihubungkan' });

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      if (!/^[A-Za-z0-9_-]{4,16}$/.test(id)) return res.status(400).json({ error: 'id tidak valid' });
      const d = await redis(['GET', 's:' + id]);
      if (!d) return res.status(404).json({ error: 'Tidak ditemukan atau sudah kedaluwarsa' });
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ d });
    }

    if (req.method === 'POST') {
      // batas 20 link per menit per IP
      const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
      const n = await redis(['INCR', 'rl:' + ip]);
      if (n === 1) await redis(['EXPIRE', 'rl:' + ip, 60]);
      if (n > 20) return res.status(429).json({ error: 'Terlalu banyak permintaan' });

      const d = req.body && req.body.d;
      if (typeof d !== 'string' || d.length > MAX || !/^[zp]\.[A-Za-z0-9_-]+$/.test(d)) {
        return res.status(400).json({ error: 'Data tidak valid' });
      }
      for (let i = 0; i < 5; i++) {
        const id = crypto.randomBytes(6).toString('base64url').slice(0, 8);
        const ok = await redis(['SET', 's:' + id, d, 'NX', 'EX', TTL]);
        if (ok === 'OK') return res.status(200).json({ id });
      }
      return res.status(500).json({ error: 'Gagal membuat id' });
    }

    return res.status(405).json({ error: 'Method tidak didukung' });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
};
