/**
 * Every webfont we ship must load in a real browser. Chrome runs each one through
 * its font sanitizer and silently drops a font it dislikes, which turns a page's
 * "Preview (Hindi)" into raw legacy keys. Ajay, Aman and Ruchi were dropped this
 * way until their cmap and kern headers were corrected (scripts/webfont.mjs);
 * src/lib/fontFiles.test.js checks the same rules without a browser.
 */
import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';

const FILES = readdirSync('public/fonts').filter((f) => /\.(woff2?|ttf|otf)$/.test(f));

test.describe('shipped webfonts', () => {
  test.skip(({ isMobile }) => isMobile, 'the same files are served to every device');

  test('every font in public/fonts loads', async ({ page }) => {
    await page.goto('/');
    const failed = await page.evaluate(async (files) => {
      const out = [];
      for (const f of files) {
        try {
          await new FontFace('probe-' + f.replace(/\W/g, ''), `url(/fonts/${f})`).load();
        } catch (e) {
          out.push(`${f}: ${String(e.message || e).slice(0, 80)}`);
        }
      }
      return out;
    }, FILES);
    expect(failed).toEqual([]);
  });

  test('the Unicode-to-Ajay, Aman and Ruchi pages draw their preview in Hindi, not Latin keys', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' && /Failed to decode downloaded font/.test(m.text())) errors.push(m.text());
    });
    for (const slug of ['ajay', 'aman', 'ruchi']) {
      await page.goto(`/unicode-to-${slug}/`);
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
    }
    expect(errors).toEqual([]);
  });
});
