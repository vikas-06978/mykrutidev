/**
 * Colour themes and accent colours.
 *
 * - theme and accent survive a reload, and the <head> script has set both
 *   before <body> exists - so there is nothing to paint in the wrong colours;
 * - System follows prefers-color-scheme, including a live change;
 * - the picker works by keyboard (arrows move, Enter picks, Esc closes) and
 *   from the phone menu;
 * - switching cross-fades for 200ms, and not at all with reduced motion;
 * - axe finds no colour-contrast failure on the four busiest pages in any of
 *   the 6 themes x 5 accents, with menus open, text converted, messages shown
 *   and the tutor's correct/wrong letters and key feedback on screen; High
 *   contrast is also held to AAA.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const THEMES = ['light', 'white', 'dark', 'black', 'reading', 'contrast'];
const ACCENTS = ['terracotta', 'blue', 'green', 'purple', 'teal'];
const PAPER = {
  light: 'rgb(250, 247, 242)',
  white: 'rgb(255, 255, 255)',
  dark: 'rgb(21, 22, 24)',
  black: 'rgb(0, 0, 0)',
  reading: 'rgb(244, 236, 216)',
  contrast: 'rgb(0, 0, 0)',
};
const BAR = {
  light: '#faf7f2',
  white: '#ffffff',
  dark: '#151618',
  black: '#000000',
  reading: '#f4ecd8',
  contrast: '#000000',
};

/** Start the page with a stored choice, as a returning visitor would. */
const withStored = (page, theme, accent) =>
  page.addInitScript(
    ([t, a]) => {
      try {
        if (t) localStorage.setItem('mkd-theme', t);
        if (a) localStorage.setItem('mkd-accent', a);
      } catch {}
    },
    [theme, accent],
  );

const isDesktop = (testInfo) => testInfo.project.name === 'desktop';
const html = (page) => page.locator('html');

test.describe('applying and remembering the choice', () => {
  test('new visitors get System and terracotta', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme-pref', 'system');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await expect(html(page)).toHaveAttribute('data-accent', 'terracotta');
  });

  for (const theme of THEMES) {
    test(`${theme} + teal: set before the body exists, painted, kept after a reload`, async ({ page }) => {
      await withStored(page, theme, 'teal');
      // Record the attributes at the moment <body> is inserted: if they are
      // already set then, the first paint is already right.
      await page.addInitScript(() => {
        new MutationObserver((_, obs) => {
          if (document.body) {
            const r = document.documentElement;
            window.__atBody = [r.getAttribute('data-theme'), r.getAttribute('data-accent')];
            obs.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await page.goto('/');
      expect(await page.evaluate(() => window.__atBody)).toEqual([theme, 'teal']);
      await expect(page.locator('body')).toHaveCSS('background-color', PAPER[theme]);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', BAR[theme]);
      await page.reload();
      expect(await page.evaluate(() => window.__atBody)).toEqual([theme, 'teal']);
    });
  }

  test('the accent changes the accent colour; High contrast keeps its yellow', async ({ page }) => {
    const brick = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-brick').trim());
    await withStored(page, 'light', 'terracotta');
    await page.goto('/');
    const terracotta = await brick();
    await page.evaluate(() => window.mkdTheme.setAccent('blue'));
    expect(await brick()).not.toBe(terracotta);
    await page.evaluate(() => window.mkdTheme.set('contrast'));
    expect(await brick()).toBe('#ffd60a');
  });

  test('broken stored values fall back to System and terracotta', async ({ page }) => {
    await withStored(page, 'purple', 'gold');
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme-pref', 'system');
    await expect(html(page)).toHaveAttribute('data-accent', 'terracotta');
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
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => window.mkdTheme.setAccent('green'));
    await expect(html(page)).toHaveAttribute('data-accent', 'green');
  });
});

test.describe('System follows the device', () => {
  for (const scheme of ['light', 'dark']) {
    test(`prefers-color-scheme: ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await withStored(page, 'system');
      await page.goto('/');
      await expect(html(page)).toHaveAttribute('data-theme', scheme);
      await expect(page.locator('body')).toHaveCSS('background-color', PAPER[scheme]);
    });
  }

  test('and changes live when the device does', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', BAR.dark);
  });

  test('a fixed choice ignores the device', async ({ page }) => {
    await withStored(page, 'black');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme', 'black');
  });
});

test.describe('the picker', () => {
  test('desktop, Hindi: arrows move, Enter picks, Esc closes, Tab reaches the swatches', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await page.goto('/hi');
    const trigger = page.locator('[data-theme-trigger]');
    const panel = page.locator('[data-theme-panel]');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toHaveAttribute('aria-label', 'थीम और एक्सेंट रंग');

    const cards = panel.locator('[data-picker-group="theme"] [role="radio"]');
    await expect(cards.locator('.tp-name')).toHaveText([
      'लाइट', 'सफ़ेद', 'डार्क', 'काला', 'पढ़ने वाला', 'हाई कॉन्ट्रास्ट', 'सिस्टम',
    ]);
    await expect(panel.getByText('डिवाइस के हिसाब से')).toBeVisible();
    // Opens on the current choice.
    await expect(cards.nth(6)).toBeFocused();
    await expect(cards.nth(6)).toHaveAttribute('aria-checked', 'true');

    // Rows of three: लाइट सफ़ेद डार्क / काला पढ़ने वाला हाई कॉन्ट्रास्ट / सिस्टम
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await expect(cards.nth(1)).toBeFocused(); // सफ़ेद
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown'); // one row down from लाइट: काला
    await expect(cards.nth(3)).toBeFocused();
    await expect(html(page)).not.toHaveAttribute('data-theme', 'black'); // moving does not pick
    await page.keyboard.press('Enter');
    await expect(html(page)).toHaveAttribute('data-theme', 'black');
    await expect(cards.nth(3)).toHaveAttribute('aria-checked', 'true');
    await expect(trigger).toHaveAttribute('aria-label', 'थीम: काला');

    await page.keyboard.press('Tab'); // to the swatches, on the chosen one
    const swatches = panel.locator('[data-picker-group="accent"] [role="radio"]');
    await expect(swatches.nth(0)).toBeFocused();
    await expect(swatches.nth(1)).toHaveAttribute('aria-label', 'नीला');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await expect(html(page)).toHaveAttribute('data-accent', 'green');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'black');
    await expect(html(page)).toHaveAttribute('data-accent', 'green');
  });

  test('desktop, English: labels, and a click outside closes the panel', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await page.goto('/');
    await page.locator('[data-theme-trigger]').click();
    const panel = page.locator('[data-theme-panel]');
    await expect(panel.locator('[data-picker-group="theme"] .tp-name')).toHaveText([
      'Light', 'White', 'Dark', 'Black', 'Reading', 'High contrast', 'System',
    ]);
    await expect(panel.getByText('Follows your device')).toBeVisible();
    await expect(panel.locator('[data-picker-group="accent"] [role="radio"]')).toHaveCount(5);
    await page.locator('main h1').click();
    await expect(panel).toBeHidden();
  });

  test('the High contrast hint shows only in High contrast', async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await page.goto('/');
    await page.locator('[data-theme-trigger]').click();
    const hint = page.locator('[data-theme-panel] .tp-hc-hint');
    await expect(hint).toBeHidden();
    await page.locator('[data-theme-panel] [data-value="contrast"]').click();
    await expect(hint).toBeVisible();
  });

  test('phone: the menu panel has the picker', async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), 'phone control');
    await page.goto('/');
    await expect(page.locator('[data-theme-trigger]')).toBeHidden();
    await page.locator('[data-burger]').click();
    const picker = page.locator('[data-mobile-nav] [data-theme-picker]');
    await expect(picker.locator('[data-picker-group="theme"] [role="radio"]')).toHaveCount(7);
    await picker.locator('[data-value="reading"]').click();
    await picker.locator('[data-value="purple"]').click();
    await expect(html(page)).toHaveAttribute('data-theme', 'reading');
    await expect(html(page)).toHaveAttribute('data-accent', 'purple');
    await page.reload();
    await page.locator('[data-burger]').click();
    await expect(page.locator('[data-mobile-nav] [data-value="reading"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-mobile-nav] [data-value="purple"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('switching cross-fades for 200ms, and not with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await withStored(page, 'light');
    await page.goto('/');
    const during = () =>
      page.evaluate(() => {
        window.mkdTheme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
        return [document.documentElement.classList.contains('theme-fade'), getComputedStyle(document.body).transitionDuration];
      });
    const [fading, duration] = await during();
    expect(fading).toBe(true);
    expect(duration).toContain('0.2s');
    await expect(html(page)).not.toHaveClass(/theme-fade/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const [, reduced] = await during();
    expect(reduced).not.toContain('0.2s');
  });

  test('print always uses Light', async ({ page }) => {
    await withStored(page, 'black', 'purple');
    await page.goto('/');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER.light);
    await page.emulateMedia({ media: 'screen' });
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER.black);
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
    await page.keyboard.type(next === 'z' ? 'x' : 'z');
  },
};

async function contrastFailures(page, theme) {
  const rules = theme === 'contrast' ? ['color-contrast', 'color-contrast-enhanced'] : ['color-contrast'];
  const { violations } = await new AxeBuilder({ page }).withRules(rules).analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`));
}

for (const theme of THEMES) {
  for (const accent of ACCENTS) {
    for (const path of Object.keys(PREPARE)) {
      test(`contrast: ${path} in ${theme} + ${accent}`, async ({ page }, testInfo) => {
        // Every accent on desktop; phones check each theme in the default
        // accent (the layout differs, the colours do not).
        test.skip(!isDesktop(testInfo) && accent !== 'terracotta', 'phones: default accent');
        await withStored(page, theme, accent);
        await page.route('https://inputtools.google.com/**', (r) => r.abort());
        await page.goto(path);
        await PREPARE[path](page, isDesktop(testInfo));
        const found = await contrastFailures(page, theme);
        expect(found, found.join('\n')).toEqual([]);
      });
    }
  }

  test(`contrast: the picker itself in ${theme}`, async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), 'desktop control');
    await withStored(page, theme, 'blue');
    await page.goto('/');
    await page.locator('[data-theme-trigger]').click();
    const rules = theme === 'contrast' ? ['color-contrast', 'color-contrast-enhanced'] : ['color-contrast'];
    const { violations } = await new AxeBuilder({ page }).include('#theme-panel').withRules(rules).analyze();
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
