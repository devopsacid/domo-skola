/**
 * Cloudflare Access JWT verification (ADR-0001 D8). Runs on every /api/admin/* request and fails
 * closed: signature (RS256 only, against the team certs), audience, issuer and expiry are all required.
 * There is no bypass and no environment-dependent shortcut; `ACCESS_CERTS_URL` only changes where
 * the public keys come from (dev proxy), and config refuses it in production.
 */
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type AccessResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'no_email' };

export interface VerifyOptions {
  issuer: string;
  audience: string;
  getKey: JWTVerifyGetKey;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyAccessJwt(
  token: string | null | undefined,
  opts: VerifyOptions,
): Promise<AccessResult> {
  if (!token) return { ok: false, reason: 'missing' };
  try {
    const { payload } = await jwtVerify(token, opts.getKey, {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iss', 'aud'],
    });
    const email = payload.email;
    if (typeof email !== 'string') return { ok: false, reason: 'no_email' };
    const normalized = email.trim().toLowerCase();
    if (!EMAIL.test(normalized)) return { ok: false, reason: 'no_email' };
    return { ok: true, email: normalized };
  } catch (err) {
    return { ok: false, reason: err instanceof errors.JWTExpired ? 'expired' : 'invalid' };
  }
}

const keySets = new Map<string, JWTVerifyGetKey>();

/** Team certs, cached per isolate by jose (refetched when an unknown kid appears, with a cooldown). */
export function remoteKeySet(certsUrl: string): JWTVerifyGetKey {
  let set = keySets.get(certsUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL(certsUrl), { cooldownDuration: 30_000, cacheMaxAge: 600_000 });
    keySets.set(certsUrl, set);
  }
  return set;
}

export interface AccessConfig {
  teamDomain?: string;
  aud?: string;
  certsUrl?: string;
}

/** Verifier options from config, or null when Access is not configured (callers fail closed). */
export function accessOptions(cfg: AccessConfig): VerifyOptions | null {
  if (!cfg.teamDomain || !cfg.aud) return null;
  const issuer = `https://${cfg.teamDomain}`;
  const certs = cfg.certsUrl ?? `${issuer}/cdn-cgi/access/certs`;
  return { issuer, audience: cfg.aud, getKey: remoteKeySet(certs) };
}
