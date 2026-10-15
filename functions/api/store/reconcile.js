// Cloudflare Pages Function: /api/store/reconcile, the store's background check,
// for a scheduler. See server/storeJobs.js and docs/STORE.md.
import { handleReconcile } from '../../../server/storeJobs.js';

export const onRequest = (ctx) => handleReconcile(ctx.request, ctx.env);
