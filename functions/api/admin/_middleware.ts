// Access JWT + D1 role + CSRF checks for every /api/admin/* request (ADR-0001 D8). Fails closed.
import { authenticateAdmin } from '../../../src/server/admin/router';
import { handlerContext, type PagesHandler } from '../../../src/server/pages';

export const onRequest: PagesHandler = async (c) => {
  const auth = await authenticateAdmin(c.request, c.env, handlerContext(c));
  if (!auth.ok) return auth.response;
  c.data.admin = auth.admin;
  return c.next();
};
