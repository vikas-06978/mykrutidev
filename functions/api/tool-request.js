// Cloudflare Pages Function: /api/tool-request, the /links page's "which tool
// next?" form. The logic is in server/feedbackApi.js.
import { handleToolRequest, reply } from '../../server/feedbackApi.js';

export const onRequestPost = ({ request, env }) => handleToolRequest(request, env);
export const onRequest = () => reply(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
