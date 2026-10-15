// Cloudflare Pages Function: /api/store/find, "send me my download link again".
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleFind } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleFind(ctx.request, ctx.env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
