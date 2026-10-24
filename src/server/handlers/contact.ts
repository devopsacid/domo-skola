import type { Deps } from '../deps';
import type { Env, HandlerContext } from '../env';
import { handleSubmission } from './public-form';

/** POST /api/contact */
export const handleContact = (request: Request, env: Env, ctx: HandlerContext, overrides?: Partial<Deps>) =>
  handleSubmission('contact', request, env, ctx, overrides);
