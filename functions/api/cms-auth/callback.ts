import { handleCmsCallback } from '../../../src/server/handlers/cms-auth';
import type { PagesHandler } from '../../../src/server/pages';

export const onRequestGet: PagesHandler = (c) => handleCmsCallback(c.request, c.env);
