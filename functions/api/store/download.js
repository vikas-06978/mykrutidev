// Cloudflare Pages Function: /api/store/download, the PDF itself (POST only, so
// a mail scanner opening the link cannot use up a download). See server/storeApi.js.
import { handleDownload } from '../../../server/storeApi.js';

export const onRequestPost = (ctx) => handleDownload(ctx.request, ctx.env);
export const onRequest = () =>
  new Response('Use the Download button on the page.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
