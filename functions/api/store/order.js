// Cloudflare Pages Function: /api/store/order, what the thanks and product
// pages show for an order the browser holds a key to. POST keeps the keys out
// of URLs and logs; GET answers pages cached before that. See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleOrderStatus } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleOrderStatus(ctx.request, ctx.env);
export const onRequestGet = (ctx) => handleOrderStatus(ctx.request, ctx.env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'GET, POST' });
