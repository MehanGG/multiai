// Proxy ke https://bandelbanget.xyz/v1
// API key dibaca dari environment variable "DattioAI" (tidak pernah dikirim ke browser).
// Cocok untuk Vercel (folder /api). Edge runtime dipakai supaya streaming tidak gampang timeout.
export const config = { runtime: 'edge' };

const BASE = 'https://bandelbanget.xyz/v1';
const ALLOWED = new Set(['chat/completions', 'models', 'quota', 'images/generations']);
const enc = new TextEncoder();

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default async function handler(req) {
  const key = process.env.DattioAI;
  if (!key) {
    return json({ error: { message: 'Environment variable DattioAI belum di-set di server.' } }, 500);
  }

  const url = new URL(req.url);
  const path = (url.searchParams.get('p') || '').replace(/^\/+/, '');
  if (!ALLOWED.has(path)) return json({ error: { message: 'Path tidak diizinkan.' } }, 400);

  const isPost = req.method === 'POST';
  const init = {
    method: isPost ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + key, Accept: isPost ? 'text/event-stream, application/json' : 'application/json' },
    signal: req.signal,
  };
  let wantsStream = false;
  if (isPost) {
    const body = await req.text();
    init.headers['Content-Type'] = 'application/json';
    init.body = body;
    try { wantsStream = JSON.parse(body).stream === true; } catch (_) {}
  }

  // Non-streaming (models, quota, gambar): teruskan apa adanya.
  if (!wantsStream) {
    try {
      const up = await fetch(BASE + '/' + path, init);
      return new Response(up.body, {
        status: up.status,
        headers: {
          'Content-Type': up.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      return json({ error: { message: 'Gagal menghubungi server AI: ' + (e && e.message) } }, 502);
    }
  }

  // Streaming chat: balas langsung dan kirim keepalive supaya koneksi tidak diputus
  // saat model lama berpikir sebelum token pertama keluar.
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const write = (s) => w.write(typeof s === 'string' ? enc.encode(s) : s).catch(() => {});

  (async () => {
    const ka = setInterval(() => write(': ka\n\n'), 8000);
    try {
      await write(': start\n\n');
      const up = await fetch(BASE + '/' + path, init);
      if (!up.ok) {
        const t = await up.text();
        let msg = t;
        try {
          const j = JSON.parse(t);
          msg = (j.error && (j.error.message || j.error)) || j.message || t;
        } catch (_) {}
        await write('data: ' + JSON.stringify({ error: { message: String(msg).slice(0, 600), status: up.status } }) + '\n\n');
      } else {
        const rd = up.body.getReader();
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          await write(value);
        }
      }
    } catch (e) {
      await write('data: ' + JSON.stringify({ error: { message: 'Koneksi ke server AI terputus: ' + (e && e.message), status: 502 } }) + '\n\n');
    } finally {
      clearInterval(ka);
      try { await w.close(); } catch (_) {}
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
