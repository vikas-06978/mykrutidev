/**
 * Guidance that must never get in the way.
 *
 * - On load nothing covers the tool, on a 390x844 phone and on desktop, and
 *   the tool's input is on screen without scrolling.
 * - The first-visit tour (typing tools only) waits for idle, is skipped if the
 *   visitor starts typing, shows once, never on converter pages, never covers
 *   the control it points at, shifts nothing, and "?" replays it.
 */
import { test, expect } from '@playwright/test';

// Run once (in the desktop project); the viewports are set explicitly below.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewports are set per test');
});

const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

/** The control a visitor uses first on each page. */
const INPUT = {
  '/': '#tool textarea[data-role="input"]',
  '/hi': '#tool textarea[data-role="input"]',
  '/unicode-to-kruti-dev': '#tool textarea[data-role="input"]',
  '/hi/unicode-to-kruti-dev': '#tool textarea[data-role="input"]',
  '/devlys-to-unicode': '#tool textarea[data-role="input"]',
  '/abbasi-chanakya-to-unicode': '#tool textarea[data-role="input"]',
  '/english-to-hindi-typing': '#tool textarea[data-role="input"]',
  '/hindi-keyboard': '#tool textarea[data-role="text"]',
  '/hi/hindi-keyboard': '#tool textarea[data-role="text"]',
  // The tutor opens on its lesson picker; the passage sits under it.
  '/hindi-typing-test': '#tool .tt-level[data-state="current"]',
};

test.describe('nothing covers the tool on load', () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    for (const [path, sel] of Object.entries(INPUT)) {
      test(`${name} ${path}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        const input = page.locator(sel).first();
        await expect(input).toBeVisible();
        const box = await input.boundingBox();
        // On screen without scrolling (at least its top 40px).
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + 40).toBeLessThanOrEqual(viewport.height);
        // The topmost element at its visible centre is the input itself (or
        // inside it): no overlay, banner or popup is on top.
        const x = box.x + box.width / 2;
        const y = box.y + Math.min(box.height, viewport.height - box.y) / 2;
        const onTop = await page.evaluate(
          ([sel, x, y]) => {
            const el = document.elementFromPoint(x, y);
            const target = document.querySelector(sel);
            return !!el && (el === target || target.contains(el));
          },
          [sel, x, y],
        );
        expect(onTop, `something covers ${sel}`).toBe(true);
        // And nothing fixed or modal-like is on the page at all.
        const overlays = await page.evaluate(() =>
          [...document.querySelectorAll('body *')]
            .filter((el) => {
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden') return false;
              const r = el.getBoundingClientRect();
              return (s.position === 'fixed' || el.matches('dialog[open], [aria-modal="true"]')) && r.width * r.height > 0.2 * innerWidth * innerHeight;
            })
            .map((el) => el.tagName + '.' + el.className),
        );
        expect(overlays).toEqual([]);
      });
    }
  }
});

test.describe('Hindi Keyboard on a touch screen', () => {
  // The fit applies to touch screens only (hindi-keyboard.css): a phone, not
  // a narrow desktop window, which shows every key at once.
  test.use({ hasTouch: true, isMobile: true, viewport: VIEWPORTS.phone });

  test('on a phone: text box and keys fit the screen together, and nothing is pinned or left empty', async ({ page }) => {
    // The keys used to be pinned to the bottom of the screen while scrolling,
    // leaving an empty block where they had been and covering the page below.
    await page.setViewportSize(VIEWPORTS.phone);
    await page.addInitScript(() => {
      localStorage.setItem('mkd-tour:/hindi-keyboard', '1');
      window.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/hindi-keyboard');
  const below = page.locator('#howto-heading');
  const before = await below.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.locator('[data-keyboard] textarea').click();
  // Brought into view: the text box at the top, every key row below it, on screen.
  await expect
    .poll(() => page.locator('[data-keyboard]').evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBeLessThanOrEqual(1);
  const pad = await page.locator('[data-keyboard] .hk-pad').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, position: getComputedStyle(el).position };
  });
  expect(pad.position).not.toBe('fixed');
  expect(pad.bottom).toBeLessThanOrEqual(VIEWPORTS.phone.height + 1);
  // Scrolling on: the page simply moves on. Nothing below moved in the page.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80);
  }
  const after = await below.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  expect(Math.round(after)).toBe(Math.round(before));
  expect(await page.evaluate(() => window.__cls)).toBe(0);
  });
});

test('Hindi Keyboard in a narrow desktop window: every key row shows, nothing scrolls inside', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-keyboard', '1'));
  await page.goto('/hindi-keyboard');
  const box = await page.locator('[data-keyboard] .hk-scroll').evaluate((el) => ({
    inner: el.scrollHeight - el.clientHeight,
    overflow: getComputedStyle(el).overflowY,
  }));
  expect(box).toEqual({ inner: 0, overflow: 'visible' });
});

// ---------------------------------------------------------------------------
// The tour
// ---------------------------------------------------------------------------

const TOOLS = ['/english-to-hindi-typing', '/hindi-keyboard', '/hindi-typing-test'];
const tour = (page) => page.locator('.tour');

test.describe('first-visit tour', () => {
  for (const path of TOOLS) {
    test(`${path}: shows once after idle, walks 3 steps, never covers its target, shifts nothing`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(path);
      // Not on first paint: nothing yet, and the page is usable meanwhile.
      await expect(tour(page)).toHaveCount(0);
      await expect(tour(page)).toBeVisible({ timeout: 10_000 });
      await expect(tour(page)).toHaveAttribute('aria-modal', 'false');

      for (let n = 1; n <= 3; n++) {
        await expect(tour(page).locator('.tour-count')).toHaveText(`${n} of 3`);
        const [bubble, target] = await Promise.all([tour(page).boundingBox(), page.locator('.tour-target').boundingBox()]);
        const overlap =
          bubble.x < target.x + target.width && target.x < bubble.x + bubble.width &&
          bubble.y < target.y + target.height && target.y < bubble.y + bubble.height;
        expect(overlap, `step ${n} covers its target`).toBe(false);
        await tour(page).locator('.tour-next').click();
      }
      await expect(tour(page)).toHaveCount(0);
      await expect(page.locator('.tour-target')).toHaveCount(0);
      expect(await page.evaluate(() => window.__cls)).toBe(0);

      // Never again on its own.
      await page.reload();
      await page.waitForTimeout(6000);
      await expect(tour(page)).toHaveCount(0);

      // "?" replays it, focus in the bubble; Esc ends it.
      await page.locator('[data-tour-replay]').click();
      await expect(tour(page)).toBeVisible();
      await expect(tour(page).locator('.tour-next')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(tour(page)).toHaveCount(0);
    });
  }

  test('skipped when the visitor starts typing first - and not shown on a later visit', async ({ page }) => {
    await page.goto('/english-to-hindi-typing');
    await page.locator('#tool textarea[data-role="input"]').pressSequentially('namaste');
    await page.waitForTimeout(6000);
    await expect(tour(page)).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(6000);
    await expect(tour(page)).toHaveCount(0);
  });

  test('skipped on the Hindi Keyboard when the first thing is a key press', async ({ page }) => {
    await page.goto('/hindi-keyboard');
    await page.locator('[data-keyboard] [data-layer-panel="base"] button[data-ins="क"]').first().click();
    await page.waitForTimeout(6000);
    await expect(tour(page)).toHaveCount(0);
  });

  test('Skip, and a click outside, end it', async ({ page }) => {
    await page.goto('/hindi-keyboard');
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await tour(page).locator('.tour-skip').click();
    await expect(tour(page)).toHaveCount(0);
    await page.locator('[data-tour-replay]').click();
    await expect(tour(page)).toBeVisible();
    await page.mouse.click(5, 780);
    await expect(tour(page)).toHaveCount(0);
  });

  test('Hindi pages get the tour in Hindi', async ({ page }) => {
    await page.goto('/hi/hindi-keyboard');
    await expect(tour(page)).toBeVisible({ timeout: 10_000 });
    await expect(tour(page).locator('.tour-count')).toHaveText('3 में से 1');
    await expect(tour(page).locator('.tour-skip')).toHaveText('छोड़ें');
  });

  test('never on converter pages', async ({ page }) => {
    for (const path of ['/', '/unicode-to-kruti-dev', '/devlys-to-unicode', '/hi']) {
      await page.goto(path);
      await expect(page.locator('[data-tour], [data-tour-replay]')).toHaveCount(0);
    }
    await page.waitForTimeout(5000);
    await expect(tour(page)).toHaveCount(0);
  });

  test('the tour script is not loaded until it is needed', async ({ page }) => {
    const loaded = [];
    page.on('request', (r) => r.url().includes('/_astro/tour.') && loaded.push(r.url()));
    await page.addInitScript(() => localStorage.setItem('mkd-tour:/hindi-keyboard', '1'));
    await page.goto('/hindi-keyboard');
    await page.waitForTimeout(5000);
    expect(loaded).toEqual([]);
    await page.locator('[data-tour-replay]').click();
    await expect(tour(page)).toBeVisible();
    expect(loaded.length).toBe(1);
  });
});
