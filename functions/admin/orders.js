// Cloudflare Pages Function: /admin/orders, the private page for the store's
// orders. Needs the ADMIN_KEY secret; see server/storeAdmin.js.
import { handleAdminOrders } from '../../server/storeAdmin.js';
import { maybeReconcile } from '../../server/storeJobs.js';

export const onRequest = (ctx) => {
  ctx.waitUntil(maybeReconcile(ctx.env, { request: ctx.request }));
  return handleAdminOrders(ctx.request, ctx.env);
};
