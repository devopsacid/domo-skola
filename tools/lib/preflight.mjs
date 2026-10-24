// Pure preflight rules (unit tested). The CLI in tools/preflight.mjs supplies the inputs.

export const RETENTION_KEYS = [
  'RETENTION_DAYS_INQUIRY',
  'RETENTION_DAYS_APPLICATION',
  'RETENTION_DAYS_AFTER_CLOSE',
  'AUDIT_RETENTION_DAYS',
];

/** Strip // and block comments plus trailing commas from JSONC, leaving string contents intact. */
export function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) throw new Error('unterminated block comment');
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const isPosInt = (v) => /^[1-9][0-9]*$/.test(String(v ?? '').trim());
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * @param {{ production: boolean, env: Record<string,string|undefined>, wrangler: any,
 *           redirects?: string, routes?: any, devVarsExample?: string }} i
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function preflight({ production, env, wrangler, redirects, routes, devVarsExample }) {
  const errors = [];
  const warnings = [];
  const prodVars = wrangler?.env?.production?.vars ?? {};
  const get = (k) => (!blank(env[k]) ? env[k] : prodVars[k]);

  // Always-on structural checks.
  for (const scope of [wrangler?.vars ?? {}, ...Object.values(wrangler?.env ?? {}).map((e) => e?.vars ?? {})])
    if ('ACCESS_CERTS_URL' in scope) errors.push('wrangler.jsonc must never define ACCESS_CERTS_URL (dev-only)');
  if (redirects !== undefined && !/^\/\s+\/sk\/\s+301\b/m.test(redirects))
    errors.push('public/_redirects must contain "/ /sk/ 301"');
  if (routes !== undefined) {
    const ok = routes?.version === 1 && JSON.stringify(routes.include) === '["/api/*"]';
    if (!ok) errors.push('_routes.json must have version 1 and include exactly ["/api/*"]');
  }
  if (devVarsExample !== undefined) {
    for (const k of [...RETENTION_KEYS, 'IP_HASH_SECRET', 'EMAIL_API_KEY', 'ACCESS_AUD', 'ALLOWED_ORIGINS'])
      if (!new RegExp(`^${k}=`, 'm').test(devVarsExample)) errors.push(`.dev.vars.example lacks ${k}`);
    if (/^[A-Z_]*(SECRET|KEY|TOKEN)[A-Z_]*=(?!dummy|$)/m.test(devVarsExample))
      errors.push('.dev.vars.example contains a non-dummy secret value');
  }

  if (!production) {
    for (const k of RETENTION_KEYS) if (blank(get(k))) warnings.push(`${k} unset (required in production)`);
    return { errors, warnings };
  }

  // Production gate.
  if (!blank(env.ACCESS_CERTS_URL) || !blank(prodVars.ACCESS_CERTS_URL))
    errors.push('ACCESS_CERTS_URL must be unset in production (it replaces the Access JWKS)');
  for (const k of RETENTION_KEYS) {
    if (blank(get(k))) errors.push(`${k} is required in production (legal review; no default)`);
    else if (!isPosInt(get(k))) errors.push(`${k} must be a positive integer number of days`);
  }
  for (const k of ['SITE_URL', 'ALLOWED_ORIGINS', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'EMAIL_PROVIDER']) {
    const v = get(k);
    if (blank(v)) errors.push(`${k} is required in production`);
    else if (/REPLACE_/.test(v)) errors.push(`${k} is still a placeholder`);
  }
  if (blank(env.SITE_URL))
    errors.push('SITE_URL build variable is unset: astro.config.mjs would fall back to http://localhost:4321');
  const site = get('SITE_URL');
  if (!blank(site) && !/REPLACE_/.test(site) && (!/^https:\/\//.test(site) || /localhost|127\.0\.0\.1/.test(site)))
    errors.push('SITE_URL must be an https production origin');
  const origins = get('ALLOWED_ORIGINS');
  if (!blank(origins) && !/REPLACE_/.test(origins)) {
    for (const o of origins.split(',').map((s) => s.trim())) {
      if (!/^https:\/\/[^/]+$/.test(o) || /localhost|\*/.test(o)) errors.push(`ALLOWED_ORIGINS entry "${o}" must be an https origin`);
    }
  }
  const provider = get('EMAIL_PROVIDER');
  if (!blank(provider) && !/REPLACE_/.test(provider) && !['brevo', 'scaleway'].includes(provider))
    errors.push('EMAIL_PROVIDER must be brevo or scaleway in production (not mock)');
  const dbs = wrangler?.env?.production?.d1_databases ?? [];
  if (!dbs.some((d) => d.binding === 'DB' && !/REPLACE_|^0{8}-/.test(d.database_id ?? '')))
    errors.push('production D1 binding DB has no real database_id');
  if (get('CONTENT_STRICT') !== '1') errors.push('CONTENT_STRICT=1 is required in production');
  if (!/^(false|0|off)$/i.test((env.PUBLIC_NOINDEX ?? '').trim()))
    warnings.push('PUBLIC_NOINDEX is on (default): set it to false for the launch build');
  return { errors, warnings };
}
