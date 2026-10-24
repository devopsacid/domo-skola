// One catch-all for the admin API: src/server/admin/router.ts owns the route table and role matrix.
import { routeAdmin } from '../../../src/server/admin/router';
import type { AdminIdentity } from '../../../src/server/admin/handlers';
import { handlerContext, type PagesHandler } from '../../../src/server/pages';

export const onRequest: PagesHandler = (c) =>
  routeAdmin(c.request, c.env, handlerContext(c), c.data.admin as AdminIdentity | undefined);
