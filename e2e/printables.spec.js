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
      expect(href).toBe(`/downloads/${pr.pdf}-${lang}.pdf`);
      const res = await request.get(href);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      const body = await res.body();
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(body.length).toBeLessThan(500 * 1024);

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
  await page.locator('#navtrigger-tools').click();
  await page.locator('#navmenu-tools a[href="/kruti-dev-keyboard"]').click();
  await expect(page).toHaveURL(/\/kruti-dev-keyboard\/?$/);
});
