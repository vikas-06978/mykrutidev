/**
 * "Paste text" / "Upload Word file" tabs above the converter
 * (ConvertModes.astro) on Kruti Dev -> Unicode (home) and Unicode -> Kruti Dev.
 *
 * - Both tabs, and the tool under them, are on screen on first load - phone
 *   and desktop, English and Hindi - and the tabs add 48px at most.
 * - ?mode=file opens the Upload tab; the choice is remembered; CLS stays 0.
 * - An accessible tablist: arrow keys, Home/End, a visible focus ring, and
 *   readable in every theme.
 * - A .docx dropped ANYWHERE on the page is converted and offered for download;
 *   an unsupported file gets the converter's own message.
 *
 * Paste-mode conversion itself is covered, unchanged, by tools.spec.js.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

// Run once (in the desktop project); viewports are set per test.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewports are set per test');
});

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 768 };
const PAGES = ['/', '/unicode-to-kruti-dev/', '/hi/', '/hi/unicode-to-kruti-dev/'];
const DOCX = readFileSync(new URL('../src/lib/__fixtures__/kruti-test.docx', import.meta.url)).toString('base64');

const tab = (page, mode) => page.locator(`[role="tab"][data-mode="${mode}"]`);
const textBox = (page) => page.locator('#tool textarea[data-role="input"]');
const dropZone = (page) => page.locator('[data-doc-converter] [data-role="drop"]');

/** Is the element's centre on screen and not covered by anything else? */
const onScreen = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

const trackCls = (page) =>
  page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });

test.describe('both tabs are visible on first load, with the tool', () => {
  for (const [name, viewport] of Object.entries({ '390x844': PHONE, '1366x768': DESKTOP })) {
    for (const path of PAGES) {
      test(`${name} ${path}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        for (const mode of ['text', 'file']) expect(await onScreen(tab(page, mode)), mode).toBe(true);
        await expect(tab(page, 'text')).toHaveAttribute('aria-selected', 'true');
        // The tabs are one 40px row + an 8px gap above the text boxes.
        const tabs = await page.locator('.cm-tabs').boundingBox();
        const card = await page.locator('#tool [data-converter]').boundingBox();
        expect(tabs.height).toBeLessThanOrEqual(40);
        expect(card.y - tabs.y).toBeLessThanOrEqual(48);
        // And the text converter is still above the fold.
        const box = await textBox(page).boundingBox();
        expect(box.y + 40).toBeLessThanOrEqual(viewport.height);
      });
    }
  }

  test('the labels, in both languages', async ({ page }) => {
    await page.goto('/');
    await expect(tab(page, 'text')).toHaveText('Paste text');
    await expect(tab(page, 'file')).toHaveText(/Upload Word file\s*New/);
    await page.goto('/hi/');
    await expect(tab(page, 'text')).toHaveText('टेक्स्ट पेस्ट करें');
    await expect(tab(page, 'file')).toHaveText(/Word फ़ाइल अपलोड करें\s*नया/);
  });
});

test.describe('which tab', () => {
  test('?mode=file opens the Upload tab, drop zone on screen, and shifts nothing', async ({ page }) => {
    await trackCls(page);
    for (const viewport of [PHONE, DESKTOP]) {
      await page.setViewportSize(viewport);
      for (const path of ['/?mode=file', '/hi/unicode-to-kruti-dev/?mode=file']) {
        await page.goto(path);
        await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
        await expect(tab(page, 'text')).toHaveAttribute('aria-selected', 'false');
        await expect(textBox(page)).toBeHidden();
        // The whole drop zone (it is the file picker's label) is on screen.
        expect(await onScreen(dropZone(page))).toBe(true);
        expect(await page.evaluate(() => window.__cls)).toBe(0);
      }
    }
  });

  test('the last tab chosen is remembered, on reload and on a plain URL', async ({ page }) => {
    await trackCls(page);
    await page.goto('/');
    await tab(page, 'file').click();
    await expect(dropZone(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('mode')).toBe('file');
    await page.reload();
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    // Remembered on this device, not just in the URL - and shown from the
    // first frame, so nothing jumps.
    await page.goto('/unicode-to-kruti-dev/');
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await expect(dropZone(page)).toBeVisible();
    expect(await page.evaluate(() => window.__cls)).toBe(0);
    await tab(page, 'text').click();
    expect(new URL(page.url()).searchParams.get('mode')).toBeNull();
    await page.goto('/');
    await expect(tab(page, 'text')).toHaveAttribute('aria-selected', 'true');
    await expect(textBox(page)).toBeVisible();
    // A deep link beats the remembered choice.
    await page.goto('/?mode=file');
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
  });

  test('the old #convert-document link opens the Upload tab', async ({ page }) => {
    await page.goto('/#convert-document');
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
  });

  test('the hint under the boxes and the link lower down switch the tab in place', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    const before = page.url();
    await page.locator('.cm-hint a').click();
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'file')).toBeFocused();
    await tab(page, 'text').click();
    // "Have a full Word file? Upload it here ↑", further down the page.
    const back = page.locator('main a[href="/?mode=file"]', { hasText: 'Upload it here' });
    await back.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
    await back.click();
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => onScreen(tab(page, 'file'))).toBe(true);
    // No page load happened: same document, only the query changed.
    expect(new URL(page.url()).pathname).toBe(new URL(before).pathname);
  });

  test('on the home page, "Convert Word file (.docx)" is the second card and opens the Upload tab', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('#tasks-heading + ul a');
    await expect(cards.nth(1)).toContainText('Convert Word file (.docx)');
    await expect(cards.nth(1)).toHaveAttribute('href', '/?mode=file');
    await cards.nth(1).click();
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await page.goto('/hi/');
    await expect(page.locator('#tasks-heading + ul a').nth(1)).toHaveAttribute('href', '/hi/?mode=file');
  });
});

test.describe('an accessible tablist', () => {
  test('roles, arrow keys, Home/End and a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[role="tablist"]')).toHaveAttribute('aria-label', 'Convert text or a file');
    for (const mode of ['text', 'file']) {
      const id = await tab(page, mode).getAttribute('aria-controls');
      await expect(page.locator(`#${id}`)).toHaveAttribute('role', 'tabpanel');
    }
    await tab(page, 'text').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'file')).toBeFocused();
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'text')).toHaveAttribute('tabindex', '-1');
    await expect(dropZone(page)).toBeVisible();
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(tab(page, 'text')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, 'file')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tab(page, 'text')).toBeFocused();
    await expect(textBox(page)).toBeVisible();
    // Keyboard focus draws the ring.
    const outline = await tab(page, 'text').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    // Tab from the tab list goes into the panel, not to the other tab.
    await page.keyboard.press('Tab');
    await expect(tab(page, 'file')).not.toBeFocused();
  });

  for (const theme of ['light', 'white', 'dark', 'reading', 'contrast']) {
    test(`readable in ${theme}, both tabs`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('mkd-theme', t), theme);
      for (const url of ['/', '/?mode=file']) {
        await page.goto(url);
        const rules = theme === 'contrast' ? ['color-contrast', 'color-contrast-enhanced'] : ['color-contrast'];
        const { violations } = await new AxeBuilder({ page }).include('[data-convert-modes]').withRules(rules).analyze();
        expect(violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target}`)), `${theme} ${url}`).toEqual([]);
      }
    });
  }
});

/** Drag a file in from outside and drop it on `target` (a selector), like a person would. */
async function dragFileOnto(page, target, { name, type, base64 }, overlayText = 'Drop your file to convert') {
  await page.evaluate(
    ([sel, name, type, base64]) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      const el = document.querySelector(sel);
      for (const kind of ['dragenter', 'dragover']) {
        el.dispatchEvent(new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
      window.__dt = dt;
    },
    [target, name, type, base64],
  );
  await expect(page.locator('[data-drop-overlay]')).toBeVisible();
  await expect(page.locator('[data-drop-overlay]')).toContainText(overlayText);
  await page.evaluate((sel) => {
    document.querySelector(sel).dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true }));
  }, target);
  await expect(page.locator('[data-drop-overlay]')).toBeHidden();
}

test.describe('drag a file anywhere', () => {
  test('kruti-test.docx dropped on the page heading is converted and offered for download', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/'); // Paste tab
    await expect(tab(page, 'text')).toHaveAttribute('aria-selected', 'true');
    await dragFileOnto(page, 'h1', {
      name: 'kruti-test.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: DOCX,
    });
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    const result = page.locator('[data-doc-converter] [data-role="result"]');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result.locator('[data-role="summary"]')).toContainText('Converted');
    const link = result.locator('[data-role="download"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('download', /\.docx$/);
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toMatch(/kruti-test.*\.docx$/);
  });

  test('dropped on the text box itself, it still goes to the file converter', async ({ page }) => {
    await page.goto('/hi/');
    // The Hindi page's overlay says it in Hindi.
    await dragFileOnto(
      page,
      '#tool textarea[data-role="input"]',
      {
        name: 'kruti-test.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: DOCX,
      },
      'कन्वर्ट करने के लिए फ़ाइल यहाँ छोड़ें',
    );
    await expect(page.locator('[data-doc-converter] [data-role="result"]')).toBeVisible({ timeout: 15_000 });
    await expect(textBox(page)).toHaveValue('');
  });

  test("an unsupported file gets the document converter's own friendly message", async ({ page }) => {
    const error = page.locator('[data-doc-converter] [data-role="error"]');
    await page.goto('/unicode-to-kruti-dev/');
    await dragFileOnto(page, 'main', { name: 'photo.png', type: 'image/png', base64: btoa('\x89PNG....') });
    await expect(tab(page, 'file')).toHaveAttribute('aria-selected', 'true');
    await expect(error).toHaveText('Only .docx (Word) and .txt files can be converted here.');
    // A PDF gets the more useful advice checkFile() gives it.
    await dragFileOnto(page, 'main', { name: 'scan.pdf', type: 'application/pdf', base64: btoa('%PDF-1.4 x') });
    await expect(error).toHaveText('Please open it in Word and Save As → Word Document (.docx).');
    await expect(page.locator('[data-doc-converter] [data-role="result"]')).toBeHidden();
  });

  test('dragging text inside the page shows no overlay', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'fgUnh');
      document.querySelector('h1').dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
    });
    await expect(page.locator('[data-drop-overlay]')).toBeHidden();
  });
});
