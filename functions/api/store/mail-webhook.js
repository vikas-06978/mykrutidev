// Cloudflare Pages Function: /api/store/mail-webhook, Resend's signed delivery reports.
// See server/storeApi.js.
import { reply } from '../../../server/feedbackApi.js';
import { handleMailWebhook } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleMailWebhook(ctx.request, ctx.env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
