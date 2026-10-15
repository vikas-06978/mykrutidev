// Cloudflare Pages Function: /api/store/confirm, the buyer is back from Razorpay.
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleConfirm } from '../../../server/storeApi.js';
import { maybeReconcile } from '../../../server/storeJobs.js';

export const onRequestPost = (ctx) => {
  ctx.waitUntil(maybeReconcile(ctx.env, { request: ctx.request }));
  return handleConfirm(ctx.request, ctx.env, { waitUntil: (p) => ctx.waitUntil(p) });
};
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
