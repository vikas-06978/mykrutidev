// Cloudflare Pages Function: /api/store/order, what the thanks page shows for
// a download link. See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleOrderStatus } from '../../../server/storeApi.js';

export const onRequestGet = (ctx) => handleOrderStatus(ctx.request, ctx.env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'GET' });
