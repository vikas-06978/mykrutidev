/**
 * Open Graph images: one 1200x630 PNG per indexable page and language, with
 * the page's own heading on the site's branded background, so a link shared
 * on WhatsApp or Facebook shows what the page is.
 *
 * scripts/og-images.mjs draws them (Chrome, so Devanagari is shaped properly)
 * into public/og/; Base.astro points each page at its file with ogImagePath().
 * Both read ogEntries() below, so the two cannot disagree about a file name.
 */
import { DICTS, LOCALES } from '../i18n/index.js';
import { PAGES, isLive } from './routes.js';
import { GUIDES, GUIDES_PATH, guidePath } from './guides.js';
import { shownProducts, hasPage, productById } from './store.js';

export const OG_SIZE = { width: 1200, height: 630 };

/** "/" -> "home", "/guides/x" -> "guides--x". */
const slugOf = (route) => (route === '/' ? 'home' : route.slice(1).replace(/\//g, '--'));

/**
 * Store pages are live on a branch preview before they are in production
 * (isPreviewBuild in store.js). Cloudflare cannot draw images, so theirs are
 * always drawn and committed, whatever build this is.
 */
const storePreviewPage = (p) =>
  (p.path === '/store' && shownProducts(true).length > 0) ||
  (Boolean(p.product) && hasPage(productById(p.product), true));

/** Routes that get their own image; everything else uses the home image. */
function ownImageRoutes() {
  return new Set([
    ...PAGES.filter((p) => (isLive(p) || storePreviewPage(p)) && !p.canonical).map((p) => p.path),
    GUIDES_PATH,
    ...GUIDES.map(guidePath),
  ]);
}

/** The image a page in `lang` at `route` (no language prefix) uses. */
export function ogImagePath(route, lang) {
  const own = ownImageRoutes().has(route);
  return `/og/${lang}/${own ? slugOf(route) : 'home'}.png`;
}

const plain = (s) => s.replace(/<[^>]+>/g, '').trim();

/** Every image to draw: its file, heading and the small line above it. */
export function ogEntries() {
  const out = [];
  for (const lang of LOCALES) {
    const d = DICTS[lang];
    for (const route of ownImageRoutes()) {
      let title;
      let kicker = d.og.kickerTool;
      if (route === GUIDES_PATH) {
        title = d.guidesIndex.h1;
        kicker = d.og.kickerGuide;
      } else if (route.startsWith(`${GUIDES_PATH}/`)) {
        title = d.articles[route.slice(GUIDES_PATH.length + 1)].h1;
        kicker = d.og.kickerGuide;
      } else {
        title = d.pages[route].h1;
        const page = PAGES.find((p) => p.path === route);
        if (page?.trust) kicker = d.og.kickerSite;
        if (page?.product) kicker = d.og.kickerProduct;
      }
      out.push({ lang, route, file: `${lang}/${slugOf(route)}.png`, title: plain(title), kicker });
    }
  }
  return out;
}
