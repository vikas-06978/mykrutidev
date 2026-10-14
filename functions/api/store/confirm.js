// Cloudflare Pages Function: /api/store/confirm, the buyer is back from Razorpay.
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleConfirm } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleConfirm(ctx.request, ctx.env, { waitUntil: (p) => ctx.waitUntil(p) });
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
