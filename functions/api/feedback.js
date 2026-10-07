// Cloudflare Pages Function: /api/feedback. The logic, and the list of
// environment variables it reads, are in server/feedbackApi.js.
import { handleConfig, handleFeedback, reply } from '../../server/feedbackApi.js';

export const onRequestPost = (ctx) => handleFeedback(ctx.request, ctx.env, { waitUntil: (p) => ctx.waitUntil(p) });
export const onRequestGet = ({ env }) => handleConfig(env);
export const onRequest = () =>
  reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'GET, POST' });
