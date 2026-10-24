/**
 * Admin entry points (ADR-0001 D8). `authenticateAdmin` is the Function middleware body and
 * `routeAdmin` the dispatcher; `handleAdminRequest` is both in one call (tests, a future Workers router).
 * Fail closed at every step. There is no bypass and no environment-dependent shortcut.
 */
import type { RecordType } from '../../shared/admin-api';
import { accessOptions, verifyAccessJwt } from '../auth/access';
import { can, type Permission } from '../auth/roles';
import { parseConfig, type Config } from '../config';
import { resolveDeps, type Deps } from '../deps';
import type { Env, HandlerContext } from '../env';
import { logError, logRequest } from '../log';
import { adminRequestAllowed } from '../security';
import {
  addNote,
  adminError,
  auditList,
  changeStatus,
  deleteRecord,
  exportCsv,
  listRecords,
  lookupAdmin,
  me,
  recordDetail,
  resendEmail,
  retentionPurge,
  retentionStatus,
  type AdminCtx,
  type AdminIdentity,
} from './handlers';

export type AuthResult = { ok: true; admin: AdminIdentity } | { ok: false; response: Response };

export async function authenticateAdmin(
  request: Request,
  env: Env,
  ctx: HandlerContext,
): Promise<AuthResult> {
  const fail = (response: Response, outcome: string): AuthResult => {
    logRequest({ request_id: ctx.requestId, route: 'admin', outcome, status: response.status });
    return { ok: false, response };
  };
  let cfg: Config;
  try {
    cfg = parseConfig(env);
  } catch (err) {
    logError(ctx.requestId, 'admin', err);
    return fail(adminError('server'), 'config');
  }
  const opts = accessOptions(cfg.access);
  if (!opts) return fail(adminError('server'), 'access_unconfigured');

  const verdict = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), opts);
  if (!verdict.ok) return fail(adminError('unauthorized'), `jwt_${verdict.reason}`);

  if (!adminRequestAllowed(request, cfg)) return fail(adminError('origin'), 'csrf');

  let role: Awaited<ReturnType<typeof lookupAdmin>>;
  try {
    role = await lookupAdmin(env.DB, verdict.email);
  } catch (err) {
    logError(ctx.requestId, 'admin', err);
    return fail(adminError('server'), 'db');
  }
  if (!role) return fail(adminError('forbidden'), 'not_listed');
  return { ok: true, admin: { email: verdict.email, role } };
}

type Params = { type: RecordType; id: string };
interface Route {
  method: string;
  pattern: RegExp;
  permission: Permission | null;
  run(c: AdminCtx, p: Params): Promise<Response> | Response;
}

const REC = '/api/admin/records/(inquiry|application)/([A-Za-z0-9_-]{1,64})';
const ROUTES: Route[] = [
  { method: 'GET', pattern: /^\/api\/admin\/me$/, permission: null, run: (c) => me(c) },
  { method: 'GET', pattern: /^\/api\/admin\/records$/, permission: 'records.list', run: (c) => listRecords(c) },
  { method: 'GET', pattern: new RegExp(`^${REC}$`), permission: 'records.view', run: (c, p) => recordDetail(c, p.type, p.id) },
  { method: 'DELETE', pattern: new RegExp(`^${REC}$`), permission: 'records.delete', run: (c, p) => deleteRecord(c, p.type, p.id) },
  { method: 'PATCH', pattern: new RegExp(`^${REC}/status$`), permission: 'records.status', run: (c, p) => changeStatus(c, p.type, p.id) },
  { method: 'POST', pattern: new RegExp(`^${REC}/notes$`), permission: 'records.note', run: (c, p) => addNote(c, p.type, p.id) },
  { method: 'POST', pattern: new RegExp(`^${REC}/resend$`), permission: 'records.resend', run: (c, p) => resendEmail(c, p.type, p.id) },
  { method: 'POST', pattern: /^\/api\/admin\/export$/, permission: 'export', run: (c) => exportCsv(c) },
  { method: 'GET', pattern: /^\/api\/admin\/retention$/, permission: 'retention.view', run: (c) => retentionStatus(c) },
  { method: 'POST', pattern: /^\/api\/admin\/retention\/purge$/, permission: 'retention.purge', run: (c) => retentionPurge(c) },
  { method: 'GET', pattern: /^\/api\/admin\/audit$/, permission: 'audit.view', run: (c) => auditList(c) },
];

export async function routeAdmin(
  request: Request,
  env: Env,
  ctx: HandlerContext,
  admin: AdminIdentity | undefined,
  overrides: Partial<Deps> = {},
): Promise<Response> {
  const started = Date.now();
  // Fail closed: a route handler never runs without an identity from authenticateAdmin.
  if (!admin) return adminError('unauthorized');
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  try {
    for (const route of ROUTES) {
      if (route.method !== request.method) continue;
      const m = route.pattern.exec(path);
      if (!m) continue;
      if (route.permission && !can(admin.role, route.permission)) {
        logRequest({ request_id: ctx.requestId, route: 'admin', outcome: 'forbidden', status: 403 });
        return adminError('forbidden');
      }
      const cfg = parseConfig(env);
      const c: AdminCtx = {
        db: env.DB,
        cfg,
        deps: resolveDeps(overrides),
        admin,
        requestId: ctx.requestId,
        request,
        url,
      };
      const res = await route.run(c, { type: m[1] as RecordType, id: m[2] as string });
      logRequest({ request_id: ctx.requestId, route: 'admin', outcome: res.ok ? 'ok' : 'error', status: res.status, duration_ms: Date.now() - started });
      return res;
    }
    return adminError('not_found');
  } catch (err) {
    logError(ctx.requestId, 'admin', err);
    return adminError('server');
  }
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
  ctx: HandlerContext,
  overrides: Partial<Deps> = {},
): Promise<Response> {
  const auth = await authenticateAdmin(request, env, ctx);
  if (!auth.ok) return auth.response;
  return routeAdmin(request, env, ctx, auth.admin, overrides);
}
