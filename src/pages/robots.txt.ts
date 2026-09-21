import type { APIRoute } from 'astro';
import { pendingPages } from '../lib/routes.js';

// Generated rather than static so the sitemap URL and the disallow list can
// never drift from astro.config.mjs / routes.js.
export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  const disallow = pendingPages()
    .map((p) => `Disallow: ${p.path}`)
    .join('\n');

  return new Response(
    `User-agent: *
Allow: /
${disallow}

Sitemap: ${sitemapURL.href}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
