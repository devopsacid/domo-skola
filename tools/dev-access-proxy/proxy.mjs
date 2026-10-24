// Development stand-in for Cloudflare Access. NOT part of any deployed artefact.
// It signs a test Access JWT (RS256, ephemeral in-memory key), serves the matching JWKS and
// forwards requests to a LOCAL wrangler dev server with the JWT in Cf-Access-Jwt-Assertion.
// The Function code has no bypass: it verifies this JWT exactly like a real one, against
// ACCESS_CERTS_URL (dev only; config refuses it in production).
import http from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const COOKIE = 'dev_access_user';
const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export async function startDevAccessProxy({
  target,
  issuer,
  audience,
  port = 8789,
  certsPort = 8790,
  host = '127.0.0.1',
  defaultEmail = 'admin@example.test',
}) {
  const targetUrl = new URL(target);
  if (!LOCAL_HOSTS.has(targetUrl.hostname)) {
    throw new Error('dev-access-proxy only proxies to a local target (localhost or 127.0.0.1)');
  }
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = 'dev-access-key';
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

  const certsServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/certs') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ keys: [jwk], public_cert: { kid }, public_certs: [] }));
    }
    res.writeHead(404);
    res.end();
  });

  const sign = (email) =>
    new SignJWT({ email, type: 'app', identity_nonce: 'dev' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(`dev-${email}`)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey);

  const cookieUser = (header) => {
    for (const part of (header ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === COOKIE) {
        try {
          const v = decodeURIComponent(part.slice(i + 1).trim()).toLowerCase();
          if (EMAIL.test(v)) return v;
        } catch {
          /* ignore */
        }
      }
    }
    return undefined;
  };

  const proxy = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy.local');
    const picked = url.searchParams.get('dev_user');
    if (picked !== null) {
      // Choose the identity: ?dev_user=coordinator@example.test. Remembered in a cookie, then stripped.
      url.searchParams.delete('dev_user');
      const email = picked.trim().toLowerCase();
      const rest = `${url.pathname}${url.search}`;
      if (!EMAIL.test(email)) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end('invalid dev_user');
      }
      res.writeHead(302, {
        location: rest,
        'set-cookie': `${COOKIE}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax`,
      });
      return res.end();
    }
    const email = cookieUser(req.headers.cookie) ?? defaultEmail;
    const headers = { ...req.headers };
    delete headers['cf-access-jwt-assertion']; // never trust a client-supplied assertion
    headers['cf-access-jwt-assertion'] = await sign(email);
    headers.host = targetUrl.host;
    if (headers.origin) headers.origin = targetUrl.origin; // the edge would present the site origin
    if (headers.referer) headers.referer = `${targetUrl.origin}${new URL(headers.referer, targetUrl.origin).pathname}`;
    const up = http.request(
      { host: targetUrl.hostname, port: targetUrl.port || 80, method: req.method, path: `${url.pathname}${url.search}`, headers },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('upstream unavailable');
    });
    req.pipe(up);
  });

  const listen = (server, p) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(p, host, resolve);
    });
  await listen(certsServer, certsPort);
  await listen(proxy, port);
  const close = () =>
    Promise.all(
      [proxy, certsServer].map(
        (s) =>
          new Promise((resolve) => {
            s.close(() => resolve());
            s.closeAllConnections?.();
          }),
      ),
    ).then(() => undefined);
  return {
    url: `http://${host}:${proxy.address().port}`,
    certsUrl: `http://${host}:${certsServer.address().port}/certs`,
    close,
  };
}
