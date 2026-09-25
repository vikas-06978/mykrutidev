/**
 * The guides: longer how-to articles under /guides/ (and /hi/guides/).
 *
 * Structure only. Every word of an article - title, description, body - is in
 * src/i18n/{en,hi}.json under `articles.<slug>`, so the two languages hold the
 * same keys (i18n.test.js) and TRANSLATIONS-REVIEW.md lists them side by side.
 *
 * A body item of the form "{{diagram:name}}" is drawn by GuideDiagram.astro
 * (an inline SVG whose labels are in `diagrams.<name>`), so the diagrams are
 * translated with the text and cost no image request.
 *
 * `tools` are the pages the article sends a reader to: the first is the
 * primary "Use the tool" link, all three are listed at the end.
 * `updated` is shown on the article and used as dateModified in its
 * Article data - change it when the article's substance changes.
 */

export const GUIDES_PATH = '/guides';

/** @type {{ slug: string, updated: string, tools: string[] }[]} */
export const GUIDES = [
  {
    slug: 'install-kruti-dev-010-font-windows',
    updated: '2026-09-25',
    tools: ['/kruti-dev-010-font', '/', '/unicode-to-kruti-dev'],
  },
  {
    slug: 'kruti-dev-text-shows-english-letters',
    updated: '2026-09-25',
    tools: ['/', '/kruti-dev-010-font', '/kruti-dev-to-mangal'],
  },
  {
    slug: 'kruti-dev-vs-unicode-government-work',
    updated: '2026-09-25',
    tools: ['/kruti-dev-to-mangal', '/', '/unicode-to-kruti-dev'],
  },
  {
    slug: 'convert-word-file-from-kruti-dev',
    updated: '2026-09-25',
    tools: ['/', '/unicode-to-kruti-dev', '/kruti-dev-to-mangal'],
  },
  {
    slug: 'hindi-typing-speed-tips-for-exams',
    updated: '2026-09-25',
    tools: ['/hindi-typing-test-for-exams', '/hindi-typing-test', '/hindi-typing-practice-sheets'],
  },
  {
    slug: 'remington-vs-inscript-keyboard',
    updated: '2026-09-25',
    tools: ['/remington-hindi-keyboard', '/kruti-dev-keyboard', '/hindi-keyboard'],
  },
  {
    slug: 'hindi-text-shows-boxes-or-question-marks',
    updated: '2026-09-25',
    tools: ['/how-to-type-hindi-in-ms-word', '/', '/unicode-to-kruti-dev'],
  },
  {
    slug: 'kruti-dev-typing-rules-matras-reph-half-letters',
    updated: '2026-09-25',
    tools: ['/hindi-typing-test', '/kruti-dev-matra-chart', '/remington-hindi-keyboard'],
  },
];

export const guidePath = (g) => `${GUIDES_PATH}/${g.slug}`;

export const getGuide = (slug) => GUIDES.find((g) => g.slug === slug) ?? null;

/** Route paths of the guides index and every article (no language prefix). */
export const guideRoutes = () => [GUIDES_PATH, ...GUIDES.map(guidePath)];
