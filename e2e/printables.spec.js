/**
 * The printable pages, in a real browser: what the Print button prints, that
 * it fits A4, and that the PDF links download PDFs.
 */
import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const PRINTABLES = [
  { path: '/kruti-dev-keyboard', pdf: 'kruti-dev-keyboard-chart', landscape: true, pages: 1 },
  { path: '/hindi-typing-finger-chart', pdf: 'hindi-typing-finger-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-practice-sheets', pdf: 'hindi-typing-practice-sheets', landscape: false, pages: 11 },
  { path: '/kruti-dev-matra-chart', pdf: 'kruti-dev-matra-conjunct-chart', landscape: false, pages: 1 },
  { path: '/hindi-typing-progress-log', pdf: 'hindi-typing-progress-log', landscape: false, pages: 1 },
];
// The printable width of A4 inside the @page margins, in CSS px (96 per inch).
const MM = 96 / 25.4;
const PRINT_WIDTH = { portrait: (210 - 26) * MM, landscape: (297 - 24) * MM };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'print is the same on any device');
});

for (const pr of PRINTABLES) {
  for (const lang of ['en', 'hi']) {
    const url = lang === 'en' ? pr.path : `/hi${pr.path}`;

    test(`${url}: print shows only the chart, fits A4, on ${pr.pages} page(s)`, async ({ page }) => {
      const width = Math.floor(pr.landscape ? PRINT_WIDTH.landscape : PRINT_WIDTH.portrait);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(url);
      await page.emulateMedia({ media: 'print' });

      // No site header, nav, footer, FAQ or article - only the printable area.
      for (const sel of ['body > header', 'body > footer', 'nav', '#faq-heading', '.prose-page', '.pr-actions', 'h1']) {
        for (const el of await page.locator(sel).all()) await expect(el).toBeHidden();
      }
      await expect(page.locator('.pr-area')).toBeVisible();
      await expect(page.locator('.pr-title')).toBeVisible(); // the sheet carries its own title
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

      // Nothing wider than the paper.
      const overflow = await page.evaluate(() => {
        const area = document.querySelector('.pr-area');
        const limit = area.getBoundingClientRect().right + 1;
        return [...area.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > limit)
          .map((el) => el.className)
          .slice(0, 5);
      });
      expect(overflow).toEqual([]);

      // And it prints to exactly the pages it should.
      await page.evaluate(() => document.fonts.ready);
      const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      expect(pdf.getPageCount()).toBe(pr.pages);
    });

    test(`${url}: the PDF downloads, and Print prints`, async ({ page, request }) => {
      await page.goto(url);
      const href = await page.locator('[data-pdf-link]').getAttribute('href');
      const name = `mykrutidev-${pr.pdf}${lang === 'hi' ? '-hindi' : ''}.pdf`;
      expect(href).toBe(`/downloads/${name}`);
      await expect(page.locator('[data-pdf-link]')).toHaveAttribute('download', name);
      const res = await request.get(href);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      const body = await res.body();
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(body.length).toBeLessThan(500 * 1024);

      // A real click saves a PDF under its own name (not a 404 page as .htm).
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-pdf-link]').click()]);
      expect(download.suggestedFilename()).toBe(name);
      expect(await download.failure()).toBeNull();

      await page.evaluate(() => {
        window.__printed = 0;
        window.print = () => window.__printed++;
      });
      await page.locator('[data-print]').click();
      await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
    });
  }
}

test('the Typing Tutor and Hindi Keyboard list all five PDFs, and the menu reaches them', async ({ page }) => {
  for (const url of ['/hindi-typing-test', '/hindi-keyboard', '/hi/hindi-typing-test']) {
    await page.goto(url);
    await expect(page.locator('#printables-heading')).toBeVisible();
    await expect(page.locator('section[aria-labelledby="printables-heading"] a[download]')).toHaveCount(5);
  }
  await page.goto('/');
  await page.locator('#navtrigger-typing').click();
  await page.locator('#navmenu-typing a[href="/kruti-dev-keyboard/"]').click();
  await expect(page).toHaveURL(/\/kruti-dev-keyboard\/?$/);
});

// Every "Download PDF" link on every page that has one, English and Hindi:
// the file is really there, is served as a PDF, and is not a stub.
const WITH_PDFS = [...PRINTABLES.map((p) => p.path), '/hindi-typing-test', '/hindi-keyboard'];
for (const path of WITH_PDFS) {
  for (const url of [path, `/hi${path}`]) {
    test(`${url}: every PDF link returns a PDF (200, application/pdf, > 10 KB)`, async ({ page, request }) => {
      await page.goto(url);
      const links = await page.locator('a[href$=".pdf"]').evaluateAll((as) =>
        as.map((a) => ({ href: a.getAttribute('href'), download: a.getAttribute('download') })),
      );
      expect(links.length).toBeGreaterThan(0);
      for (const { href, download } of links) {
        expect(download, href).toBe(href.split('/').pop());
        const res = await request.get(href);
        expect(res.status(), href).toBe(200);
        expect(res.headers()['content-type'], href).toContain('application/pdf');
        const body = await res.body();
        expect(body.length, href).toBeGreaterThan(10 * 1024);
        expect(body.subarray(0, 5).toString(), href).toBe('%PDF-');
      }
    });
  }
}

// Devanagari labels (ि ी ु ू ृ, conjuncts) sit fully inside the key border:
// the ink of every label, measured from the font, not just its line box.
for (const url of ['/kruti-dev-keyboard', '/hi/kruti-dev-keyboard', '/hindi-typing-finger-chart']) {
  for (const media of ['screen', 'print']) {
    test(`${url} (${media}): no key label is clipped by its key`, async ({ page }) => {
      await page.emulateMedia({ media });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const { labels, clipped } = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        const clipped = [];
        let labels = 0;
        for (const key of document.querySelectorAll('.pr-key')) {
          const k = key.getBoundingClientRect();
          const walk = document.createTreeWalker(key, NodeFilter.SHOW_TEXT);
          for (let n; (n = walk.nextNode()); ) {
            if (!n.textContent.trim()) continue;
            labels++;
            const range = document.createRange();
            range.selectNodeContents(n);
            const box = range.getBoundingClientRect();
            const cs = getComputedStyle(n.parentElement);
            ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const m = ctx.measureText(n.textContent);
            const baseline = box.top + (box.height + m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
            if (baseline - m.actualBoundingBoxAscent < k.top + 1 || baseline + m.actualBoundingBoxDescent > k.bottom - 1) {
              clipped.push(`${key.dataset.base}: ${n.textContent}`);
            }
          }
        }
        return { labels, clipped };
      });
      expect(labels).toBeGreaterThan(94);
      expect(clipped).toEqual([]);
    });
  }
}
