/**
 * Colour themes: Light, Dark, Reading and System.
 *
 * - the choice survives a reload, and the <head> script has set data-theme
 *   before <body> exists - so there is nothing to paint in the wrong colours;
 * - System follows prefers-color-scheme, including a live change;
 * - the switcher works by keyboard, and on phones from the menu panel;
 * - axe finds no colour-contrast failure on the four busiest pages in any
 *   theme, with menus open, text converted, errors shown and the tutor's
 *   correct/wrong letters and key feedback on screen.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const THEMES = ['light', 'dark', 'reading'];
const PAPER = { light: 'rgb(250, 247, 242)', dark: 'rgb(21, 22, 24)', reading: 'rgb(244, 236, 216)' };
const BAR = { light: '#faf7f2', dark: '#151618', reading: '#f4ecd8' };

/** Start the page with a stored choice, as a returning visitor would. */
const withStored = (page, pref) =>
  page.addInitScript((p) => {
    try {
      localStorage.setItem('mkd-theme', p);
    } catch {}
  }, pref);

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';

test.describe('applying and remembering the theme', () => {
  test('new visitors get System', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme-pref', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  for (const theme of THEMES) {
    test(`${theme}: set before the body exists, painted, and kept after a reload`, async ({ page }) => {
      await withStored(page, theme);
      // Record data-theme at the moment <body> is inserted: if it is already
      // set then, the first paint is already in the right theme.
      await page.addInitScript(() => {
        new MutationObserver((_, obs) => {
          if (document.body) {
            window.__themeAtBody = document.documentElement.getAttribute('data-theme');
            obs.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto('/');
      expect(await page.evaluate(() => window.__themeAtBody)).toBe(theme);
      await expect(page.locator('body')).toHaveCSS('background-color', PAPER[theme]);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', BAR[theme]);
      await page.reload();
      expect(await page.evaluate(() => window.__themeAtBody)).toBe(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    });
  }

  test('a broken stored value falls back to System', async ({ page }) => {
    await withStored(page, 'purple');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme-pref', 'system');
  });

  test('blocked storage still gives a working page', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('System follows the device', () => {
  for (const scheme of ['light', 'dark']) {
    test(`prefers-color-scheme: ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await withStored(page, 'system');
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await expect(page.locator('body')).toHaveCSS('background-color', PAPER[scheme]);
    });
  }

  test('and changes live when the device does', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', BAR.dark);
  });

  test('a fixed choice ignores the device', async ({ page }) => {
    await withStored(page, 'reading');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'reading');
  });
});

test.describe('the switcher', () => {
  test('desktop: keyboard opens the menu, arrows move, Enter picks, focus returns', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await page.goto('/hi');
    const trigger = page.locator('[data-theme-trigger]');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.locator('[data-theme-menu]');
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Hindi labels, a tick on the current one (System).
    await expect(menu.getByRole('menuitemradio')).toHaveText(['लाइट', 'डार्क', 'पढ़ने वाला', 'सिस्टम']);
    await expect(menu.getByRole('menuitemradio', { name: 'सिस्टम' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-theme-option="system"]')).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown'); // डार्क
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-label', 'थीम: डार्क');
    await trigger.press('ArrowDown');
    await expect(page.locator('[data-theme-option="dark"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('desktop: English labels, and a click outside closes the menu', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await page.goto('/');
    await page.locator('[data-theme-trigger]').click();
    await expect(page.locator('[data-theme-menu]').getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'Reading', 'System']);
    await page.locator('main h1').click();
    await expect(page.locator('[data-theme-menu]')).toBeHidden();
  });

  test('phone: the menu panel has the four choices', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'phone control');
    await page.goto('/');
    await expect(page.locator('[data-theme-trigger]')).toBeHidden();
    await page.locator('[data-burger]').click();
    const group = page.getByRole('group', { name: 'Theme' });
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(group.getByRole('radio', { name: 'System' })).toBeChecked();
    await group.getByText('Reading').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'reading');
    await page.reload();
    await page.locator('[data-burger]').click();
    await expect(page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name: 'Reading' })).toBeChecked();
  });

  test('print always uses Light', async ({ page }) => {
    await withStored(page, 'dark');
    await page.goto('/');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER.light);
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER.dark);
  });
});

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

/** Put the page into its busiest state: converted text, open menus, messages. */
const PREPARE = {
  async '/'(page, desktop) {
    if (desktop) {
      await page.locator('#navtrigger-0').click(); // a dropdown with a Soon badge
    } else {
      await page.locator('[data-burger]').click();
      await page.locator('[data-mobile-nav] summary').first().click();
    }
  },
  async '/unicode-to-kruti-dev'(page) {
    // Output in the Kruti Dev preview font, then every message strip shown.
    await page.locator('[data-converter] [data-role="sample"]').first().click();
    await expect(page.locator('[data-converter] textarea[data-role="output"]').first()).not.toHaveValue('');
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-role="error"], [data-role="hint"], [data-role="unmapped"]')) {
        el.hidden = false;
        if (!el.textContent.trim()) el.textContent = 'Sample message';
      }
      document.querySelector('[data-role="copy-raw"]')?.setAttribute('data-copied', 'true');
    });
  },
  async '/hindi-keyboard'(page) {
    for (const ch of ['न', 'म', 'स']) {
      await page.locator(`[data-keyboard] [data-layer-panel="base"] button[data-ins="${ch}"]`).first().click();
    }
  },
  async '/hindi-typing-test'(page) {
    // One right key and one wrong one, so correct, wrong, current and the key
    // feedback are all on screen.
    await page.locator('#tt-capture').focus();
    const next = await page.locator('.kbd-cap[data-next="true"]').first().getAttribute('data-cap');
    if (next) await page.keyboard.type(next);
    const wrong = next === 'z' ? 'x' : 'z';
    await page.keyboard.type(wrong);
  },
};

for (const theme of THEMES) {
  for (const path of Object.keys(PREPARE)) {
    test(`contrast: ${path} in ${theme}`, async ({ page }, testInfo) => {
      await withStored(page, theme);
      await page.route('https://inputtools.google.com/**', (r) => r.abort());
      await page.goto(path);
      await PREPARE[path](page, isDesktop(testInfo));
      const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      const found = violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`),
      );
      expect(found, found.join('\n')).toEqual([]);
    });
  }

  test(`contrast: the theme menu itself in ${theme}`, async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await withStored(page, theme);
    await page.goto('/');
    await page.locator('[data-theme-trigger]').click();
    const { violations } = await new AxeBuilder({ page }).include('#theme-menu').withRules(['color-contrast']).analyze();
    expect(violations).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// Focus, and correct vs wrong without colour
// ---------------------------------------------------------------------------

for (const theme of THEMES) {
  test(`focus ring is drawn in ${theme}`, async ({ page }) => {
    await withStored(page, theme);
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test(`a wrong letter is underlined and filled, not just coloured, in ${theme}`, async ({ page }) => {
    await withStored(page, theme);
    await page.goto('/hindi-typing-test');
    await page.locator('#tt-capture').focus();
    const next = await page.locator('.kbd-cap[data-next="true"]').first().getAttribute('data-cap');
    await page.keyboard.type(next === 'z' ? 'x' : 'z');
    const wrong = page.locator('.tt-c[data-s="wrong"]').first();
    await expect(wrong).toHaveCSS('text-decoration-line', 'underline');
    const [bg, paper] = await Promise.all([
      wrong.evaluate((el) => getComputedStyle(el).backgroundColor),
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ]);
    expect(bg).not.toBe(paper);
  });
}
