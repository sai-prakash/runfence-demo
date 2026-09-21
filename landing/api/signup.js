// Vercel serverless signup — append-only via response ack; stores in memory note + returns ok.
// For durable waitlist without Notion: clients should also log; we write to /tmp on node runtime.
import fs from 'node:fs';

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 320;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!isEmail(body.email)) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }
    const entry = {
      ts: new Date().toISOString(),
      email: String(body.email).trim().toLowerCase(),
    };
    if (typeof body.note === 'string' && body.note.trim()) {
      entry.note = body.note.trim().slice(0, 1000);
    }
    try {
      fs.appendFileSync('/tmp/runfence-waitlist.jsonl', JSON.stringify(entry) + '\n');
    } catch (_) {
      /* ephemeral — still ack */
    }
    res.status(200).json({ ok: true, note: 'waitlist accepted; durable store pending Notion/Blob' });
  } catch (e) {
    res.status(500).json({ error: 'Could not accept signup' });
  }
}
