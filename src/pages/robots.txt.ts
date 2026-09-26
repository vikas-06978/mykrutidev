import type { APIRoute } from 'astro';

// Generated rather than static so the sitemap URL can never drift from
// astro.config.mjs.
//
// Pages that are not finished are NOT disallowed here. They carry
// `<meta name="robots" content="noindex">` (Base.astro), and a crawler only
// reads that tag on a page it is allowed to fetch: blocked here, a page linked
// from elsewhere can still be indexed by its URL alone, with no snippet. So
// every page stays crawlable and says for itself whether it may be indexed;
// the sitemap lists only the ones that may.
//
// Only /api/ is closed: the feedback endpoint, not a page. /admin/ answers
// with an X-Robots-Tag noindex header of its own (server/feedbackAdmin.js).
export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  return new Response(
    `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${sitemapURL.href}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
