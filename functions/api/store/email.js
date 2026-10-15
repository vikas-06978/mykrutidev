// Cloudflare Pages Function: /api/store/email, the buyer corrects their email (once).
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleChangeEmail } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleChangeEmail(ctx.request, ctx.env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
