/**
 * ToolMitra: the name the tools are promoted under on social media. Its
 * landing page is /links (src/components/LinksPage.astro), the link in the
 * Instagram bio. The site itself stays MyKrutiDev.
 */

/**
 * The Instagram handle, without the @. Empty until the account exists: the
 * page shows its "Follow on Instagram" button only once this is set.
 */
export const INSTAGRAM = '';

/**
 * The tools listed on /links, in order. Route paths as in routes.js; each
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
