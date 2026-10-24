// Development and e2e mail capture. Receives what src/server/email/mock.ts posts and lists it.
// Loopback only, in memory only, never deployed. Not a mail server: nothing is ever delivered.
//   POST   /send            capture a message ({to, from, subject, text, html, tag, replyTo?}) -> 201 {id}
//   GET    /messages        JSON {messages: [...]} (newest last)
//   GET    /messages/:id    one message
//   DELETE /messages        clear -> 204
//   PUT    /mode            {fail: 503 | null}: make /send answer with that status (failure-path tests)
//   GET    /                HTML list (all text escaped; HTML bodies are shown as source, never rendered)
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const MAX_BODY = 256 * 1024;
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve({ ok: false });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ ok: false });
      }
    });
    req.on('error', () => resolve({ ok: false }));
  });
}

const isStr = (v) => typeof v === 'string' && v.length > 0;

export async function startMockMail({ port = 8791, host = '127.0.0.1' } = {}) {
  const messages = [];
  let failStatus = null;

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': 'no-store',
    });
    res.end(body);
  };
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'POST' && path === '/send') {
      if (failStatus) return json(res, failStatus, { code: 'mock_failure' });
      const body = await readJson(req);
      const m = body.ok ? body.value : null;
      if (!m || !isStr(m.to) || !isStr(m.from) || !isStr(m.subject))
        return json(res, 400, { code: 'invalid_message' });
      const rec = {
        id: randomUUID(),
        received_at: new Date().toISOString(),
        to: m.to,
        from: m.from,
        replyTo: typeof m.replyTo === 'string' ? m.replyTo : undefined,
        subject: m.subject,
        text: typeof m.text === 'string' ? m.text : '',
        html: typeof m.html === 'string' ? m.html : '',
        tag: typeof m.tag === 'string' ? m.tag : '',
      };
      messages.push(rec);
      return json(res, 201, { id: rec.id });
    }
    if (req.method === 'PUT' && path === '/mode') {
      const body = await readJson(req);
      const f = body.ok ? body.value?.fail : undefined;
      if (f === null) failStatus = null;
      else if (Number.isInteger(f) && f >= 400 && f <= 599) failStatus = f;
      else return json(res, 400, { code: 'invalid_mode' });
      return json(res, 200, { fail: failStatus });
    }
    if (req.method === 'GET' && path === '/messages') return json(res, 200, { messages });
    if (req.method === 'DELETE' && path === '/messages') {
      messages.length = 0;
      res.writeHead(204);
      return res.end();
    }
    const one = /^\/messages\/([0-9a-f-]{36})$/.exec(path);
    if (req.method === 'GET' && one) {
      const m = messages.find((x) => x.id === one[1]);
      return m ? json(res, 200, m) : json(res, 404, { code: 'not_found' });
    }
    if (req.method === 'GET' && path === '/') {
      const rows = messages
        .map(
          (m) =>
            `<article><h2>${esc(m.subject)}</h2><p>To: ${esc(m.to)} | From: ${esc(m.from)} | Tag: ${esc(m.tag)} | ${esc(m.received_at)}</p>` +
            `<pre>${esc(m.text)}</pre><details><summary>HTML source</summary><pre>${esc(m.html)}</pre></details></article>`,
        )
        .join('');
      return send(
        res,
        200,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>mock-mail</title></head><body><h1>mock-mail (${messages.length})</h1>${rows}</body></html>`,
        'text/html',
      );
    }
    return json(res, 404, { code: 'not_found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const { port: actual } = server.address();
  return {
    url: `http://${host}:${actual}`,
    messages,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
