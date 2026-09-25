import type { APIRoute } from 'astro';
import { pendingPages } from '../lib/routes.js';
import { LOCALES, localizePath } from '../i18n/index.js';

// Generated rather than static so the sitemap URL and the disallow list can
// never drift from astro.config.mjs / routes.js. Every pending page is
// disallowed in every language, since /hi/x is the same page as /x.
export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  const disallow = pendingPages()
    .flatMap((p) => LOCALES.map((l) => `Disallow: ${localizePath(p.path, l)}`))
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
