// Cloudflare Pages Function: /api/store/checkout. POST starts an order and
// answers with Razorpay's payment page; GET says whether the store is open.
// The logic is in server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleCheckout, handleStoreConfig } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleCheckout(ctx.request, ctx.env);
export const onRequestGet = ({ env }) => handleStoreConfig(env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'GET, POST' });
