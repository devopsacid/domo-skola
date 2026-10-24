import { beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { verifyAccessJwt } from '../../../src/server/auth/access';

const ISS = 'https://team.cloudflareaccess.com';
const AUD = 'aud-tag-1';
let priv: CryptoKey;
let otherPriv: CryptoKey;
let getKey: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const a = await generateKeyPair('RS256', { extractable: true });
  const b = await generateKeyPair('RS256', { extractable: true });
  priv = a.privateKey;
  otherPriv = b.privateKey;
  const jwk: JWK = { ...(await exportJWK(a.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  getKey = createLocalJWKSet({ keys: [jwk] });
});

const sign = (
  o: { key?: CryptoKey; iss?: string; aud?: string | string[]; exp?: number | string; email?: unknown; kid?: string } = {},
) => {
  const b = new SignJWT({ ...(o.email === null ? {} : { email: o.email ?? 'Staff@Example.SK' }) })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'k1' })
    .setIssuedAt()
    .setIssuer(o.iss ?? ISS)
    .setAudience(o.aud ?? AUD)
    .setExpirationTime(o.exp ?? '5m');
  return b.sign(o.key ?? priv);
};
const opts = () => ({ issuer: ISS, audience: AUD, getKey });

describe('verifyAccessJwt', () => {
  it('accepts a valid token and lower-cases the email claim', async () => {
    expect(await verifyAccessJwt(await sign(), opts())).toEqual({ ok: true, email: 'staff@example.sk' });
  });
  it('fails closed on missing or empty tokens', async () => {
    for (const t of [undefined, null, '', 'abc', 'a.b.c']) {
      const r = await verifyAccessJwt(t, opts());
      expect(r.ok).toBe(false);
    }
  });
  it('rejects a wrong audience, including audience arrays that lack ours', async () => {
    expect((await verifyAccessJwt(await sign({ aud: 'other' }), opts())).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ aud: ['x', 'y'] }), opts())).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ aud: ['x', AUD] }), opts())).ok).toBe(true);
  });
  it('rejects a wrong issuer', async () => {
    const r = await verifyAccessJwt(await sign({ iss: 'https://evil.cloudflareaccess.com' }), opts());
    expect(r.ok).toBe(false);
  });
  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const r = await verifyAccessJwt(await sign({ exp: past }), opts());
    expect(r).toMatchObject({ ok: false, reason: 'expired' });
  });
  it('rejects a token signed by another key, and an unknown kid', async () => {
    expect((await verifyAccessJwt(await sign({ key: otherPriv }), opts())).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ kid: 'nope' }), opts())).ok).toBe(false);
  });
  it('rejects alg=none and HS256 tokens', async () => {
    const none = `${btoa(JSON.stringify({ alg: 'none' })).replace(/=/g, '')}.${btoa(
      JSON.stringify({ iss: ISS, aud: AUD, email: 'a@b.sk', exp: 9999999999 }),
    ).replace(/=/g, '')}.`;
    expect((await verifyAccessJwt(none, opts())).ok).toBe(false);
    const hs = await new SignJWT({ email: 'a@b.sk' })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
    expect((await verifyAccessJwt(hs, opts())).ok).toBe(false);
  });
  it('rejects a token without a usable email claim', async () => {
    expect((await verifyAccessJwt(await sign({ email: null }), opts())).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: 42 }), opts())).ok).toBe(false);
    expect((await verifyAccessJwt(await sign({ email: 'not-an-email' }), opts())).ok).toBe(false);
  });
  it('rejects a token with no expiry', async () => {
    const t = await new SignJWT({ email: 'a@b.sk' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(ISS)
      .setAudience(AUD)
      .sign(priv);
    expect((await verifyAccessJwt(t, opts())).ok).toBe(false);
  });
});
