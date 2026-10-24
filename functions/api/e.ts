import { handleEvent } from '../../src/server/handlers/event';
import { handlerContext, type PagesHandler } from '../../src/server/pages';

export const onRequest: PagesHandler = (c) => handleEvent(c.request, c.env, handlerContext(c));
