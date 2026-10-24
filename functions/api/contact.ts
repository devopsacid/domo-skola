import { handleContact } from '../../src/server/handlers/contact';
import { handlerContext, type PagesHandler } from '../../src/server/pages';

export const onRequest: PagesHandler = (c) => handleContact(c.request, c.env, handlerContext(c));
