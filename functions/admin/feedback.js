// Cloudflare Pages Function: /admin/feedback, the private feedback page.
// Needs the ADMIN_KEY secret; see server/feedbackAdmin.js.
import { handleAdmin } from '../../server/feedbackAdmin.js';

export const onRequest = ({ request, env }) => handleAdmin(request, env);
