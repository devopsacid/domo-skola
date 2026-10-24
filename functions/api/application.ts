// Alias of /api/applications (the canonical path in docs/architecture.md section 5).
import { handleApplication } from '../../src/server/handlers/applications';
import { handlerContext, type PagesHandler } from '../../src/server/pages';

export const onRequest: PagesHandler = (c) =>
  handleApplication(c.request, c.env, handlerContext(c));
