/**
 * ToolMitra: the name the apps (MyKrutiDev, MemeBox, and whatever comes next)
 * are promoted under on social media. Its landing page is /links
 * (src/components/LinksPage.astro), the link in the Instagram bio. The site
 * itself stays MyKrutiDev.
 */

/**
 * The Instagram handle, without the @. Empty until the account exists: the
 * page shows its "Follow on Instagram" button only once this is set.
 */
export const INSTAGRAM = '';

/**
 * ToolMitra's apps, the first thing on /links. Each card's words are
 * links.apps.<id> in the JSON files. `href` is a page of this site (a route
 * path) or a full https:// address; empty means not out yet, and the card
 * says "Coming soon" instead of linking anywhere.
 */
export const APPS = [
  { id: 'mykrutidev', href: '/' },
  // The Chrome Web Store address, once MemeBox is published there.
  { id: 'memebox', href: '' },
];

/** An app's link as the page uses it: a site path, an https:// address, or null (not out yet). */
export const appHref = (href) => (href.startsWith('/') || /^https:\/\/[^\s"<>]+$/.test(href) ? href : null);

/**
 * MyKrutiDev's tools listed on /links under the apps, in order. Route paths as in routes.js; each
 * card's name is that page's nav label, its line is links.tools.<path>.
 */
export const LINKED_TOOLS = [
  '/',
  '/unicode-to-kruti-dev',
  '/hindi-font-converter',
  '/english-to-hindi-typing',
  '/hindi-keyboard',
  '/hindi-typing-test',
  '/kruti-dev-keyboard',
  '/all-converters',
];

/** The profile address, or null while INSTAGRAM is empty. */
export const instagramUrl = (handle = INSTAGRAM) =>
  /^[a-z0-9._]{1,30}$/i.test(handle) ? `https://www.instagram.com/${handle}/` : null;
