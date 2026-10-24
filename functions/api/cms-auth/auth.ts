import { handleCmsAuth } from '../../../src/server/handlers/cms-auth';
import type { PagesHandler } from '../../../src/server/pages';

export const onRequestGet: PagesHandler = (c) => handleCmsAuth(c.request, c.env);
