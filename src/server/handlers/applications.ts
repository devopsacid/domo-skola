import type { Deps } from '../deps';
import type { Env, HandlerContext } from '../env';
import { handleSubmission } from './public-form';

/** POST /api/applications */
export const handleApplication = (
  request: Request,
  env: Env,
  ctx: HandlerContext,
  overrides?: Partial<Deps>,
) => handleSubmission('application', request, env, ctx, overrides);
