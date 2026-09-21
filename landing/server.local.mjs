#!/usr/bin/env node
/**
 * Tiny static + waitlist server — no database.
 * POST /signup { email } → append waitlist.jsonl
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const WAITLIST = path.join(__dirname, 'waitlist.jsonl');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 320;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/signup' || url.pathname === '/api/signup') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      if (!isEmail(body.email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Valid email required' }));
        return;
      }
      const entry = {
        ts: new Date().toISOString(),
        email: body.email.trim().toLowerCase(),
      };
      if (typeof body.note === 'string' && body.note.trim()) {
        entry.note = body.note.trim().slice(0, 1000);
      }
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(WAITLIST, line);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not write waitlist' }));
    }
    return;
  }

  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  // allow reading parent README for local "View demos" convenience
  let filePath;
  if (rel === '/README.md' || rel === '/../README.md') {
    filePath = path.join(__dirname, '..', 'README.md');
  } else {
    filePath = path.join(__dirname, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`RunFence landing (demo-only) http://127.0.0.1:${PORT}`);
  console.log(`Waitlist file: ${WAITLIST}`);
});
