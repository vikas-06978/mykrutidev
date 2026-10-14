// Cloudflare Pages Function: /api/store/webhook, Razorpay's signed call.
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleWebhook } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleWebhook(ctx.request, ctx.env, { waitUntil: (p) => ctx.waitUntil(p) });
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
