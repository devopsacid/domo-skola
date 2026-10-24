import { handleApplication } from '../../src/server/handlers/applications';
import { handlerContext, type PagesHandler } from '../../src/server/pages';

export const onRequest: PagesHandler = (c) =>
  handleApplication(c.request, c.env, handlerContext(c));
