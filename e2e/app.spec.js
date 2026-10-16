/**
 * The "come back tomorrow" features, in a real browser on the BUILT site:
 *
 *  - a converter keeps its text after a reload, has a Recent list and
 *    keyboard shortcuts, and says "Copied ✓";
 *  - after one visit, every tool works OFFLINE (service worker);
 *  - the typing tutor remembers sessions, counts a streak across dates, and
 *    "Reset my progress" forgets all of it;
 *  - the install button appears only when the browser offers installation;
 *  - none of it moves the page (CLS 0).
 *
 * Everything is stored in the browser only; each test starts with an empty
 * profile, which is exactly a first visit.
 */
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => {
  await page.route('https://inputtools.google.com/**', (route) => route.abort());
  // The first-visit tour would sit over the controls.
  await page.addInitScript(() => {
    for (const p of ['/hindi-typing-test', '/hi/hindi-typing-test', '/english-to-hindi-typing']) {
      localStorage.setItem(`mkd-tour:${p}`, '1');
    }
  });
});

const input = (page) => page.locator('[data-converter] [data-role="input"]');
const output = (page) => page.locator('[data-converter] [data-role="output"]');

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

test.describe('converter: saves time', () => {
  test('the text survives a reload, and Clear empties it for good', async ({ page }) => {
    await page.goto('/unicode-to-kruti-dev');
    await input(page).fill('नमस्ते भारत');
    await expect(output(page)).not.toHaveValue('');
    const converted = await output(page).inputValue();
    await page.waitForTimeout(500);

    await page.reload();
    await expect(input(page)).toHaveValue('नमस्ते भारत');
    await expect(output(page)).toHaveValue(converted);

    // The Hindi page is the same tool: same draft.
    await page.goto('/hi/unicode-to-kruti-dev');
    await expect(input(page)).toHaveValue('नमस्ते भारत');

    await page.locator('[data-converter] [data-role="clear"]').click();
    await expect(input(page)).toHaveValue('');
    await page.reload();
    await expect(input(page)).toHaveValue('');
  });

  test('Recent: kept on copy, restored in one click, deleted with Delete all', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/unicode-to-kruti-dev');
    const recent = page.locator('[data-converter] [data-recent]');
    await expect(recent.locator('[data-recent-count]')).toHaveText('0');
    await expect(recent).toContainText('Saved only on this device');

    await input(page).fill('पहला पाठ');
    await page.locator('[data-role="copy-raw"]').click();
    await expect(page.locator('.mkd-toast')).toHaveText('Copied ✓');
    await expect(page.locator('.mkd-toast')).toHaveAttribute('data-show', 'true');
    // Clear keeps what it cleared, so it can be brought back.
    await input(page).fill('दूसरा पाठ');
    await page.locator('[data-converter] [data-role="clear"]').click();
    await expect(recent.locator('[data-recent-count]')).toHaveText('2');

    await page.reload();
    await expect(recent.locator('[data-recent-count]')).toHaveText('2');
    await recent.locator('summary').click();
    const items = recent.locator('[data-restore]');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('दूसरा पाठ');
    await items.nth(1).click();
    await expect(input(page)).toHaveValue('पहला पाठ');
    await expect(output(page)).not.toHaveValue('');

    await recent.locator('[data-recent-clear]').click();
    await expect(recent.locator('[data-recent-count]')).toHaveText('0');
    await page.reload();
    await expect(recent.locator('[data-recent-count]')).toHaveText('0');
  });

  test('shortcuts: Ctrl+Enter copies the output, Alt+Shift+C the Unicode, Esc clears', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/unicode-to-kruti-dev');
    await input(page).fill('कमल');
    await expect(output(page)).not.toHaveValue('');
    const raw = await output(page).inputValue();
    const clip = () => page.evaluate(() => navigator.clipboard.readText());

    await input(page).press('Control+Enter');
    await expect.poll(clip).toBe(raw);
    await input(page).press('Alt+Shift+C');
    await expect.poll(clip).toBe('कमल');
    await input(page).press('Escape');
    await expect(input(page)).toHaveValue('');

    // Ctrl+Shift+C is Chrome's DevTools inspector: the page leaves it alone.
    await input(page).fill('कमल');
    await page.evaluate(() => navigator.clipboard.writeText('unchanged'));
    await input(page).press('Control+Shift+C');
    expect(await clip()).toBe('unchanged');
  });

  test('the shortcut tip names Alt+Shift+C, in English and in Hindi', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the tip is for keyboards; hidden on touch screens');
    for (const [path, words] of [
      ['/unicode-to-kruti-dev', 'copy as Unicode'],
      ['/hi/unicode-to-kruti-dev', 'यूनिकोड में कॉपी'],
    ]) {
      await page.goto(path);
      const tip = page.locator('[data-converter] .cv-keys');
      await expect(tip).toBeVisible();
      await expect(tip).toContainText(`Alt+Shift+C ${words}`);
      await expect(tip).not.toContainText('Ctrl+Shift');
    }
  });

  test('English to Hindi Typing keeps its text too, in Hindi', async ({ page }) => {
    await page.goto('/hi/english-to-hindi-typing');
    const box = page.locator('[data-translit] [data-role="input"]');
    await box.fill('namaste');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(box).toHaveValue('namaste');
    await expect(page.locator('[data-translit] [data-recent]')).toContainText('सिर्फ़ इसी डिवाइस पर सेव');
  });
});

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

test.describe('installable app', () => {
  test('manifest, icons and theme colour are linked in both languages', async ({ page, request }) => {
    for (const [path, manifest] of [
      ['/', '/manifest.json'],
      ['/hi', '/hi/manifest.json'],
    ]) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', manifest);
      const m = await (await request.get(manifest)).json();
      expect(m.name).toBe('MyKrutiDev');
      for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    }
  });

  test('after one visit, every converter works offline; other pages once visited', async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    // The worker registers a couple of seconds after load, then downloads
    // the site. Wait until the last of it is in the cache.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg?.active || !navigator.serviceWorker.controller) return false;
            for (const name of await caches.keys()) {
              if (await (await caches.open(name)).match('/__mkd-precache-index')) return true;
            }
            return false;
          }),
        { timeout: 60_000, intervals: [500] },
      )
      .toBe(true);

    // Not in the first download: the tutor is kept when it is first visited.
    const cached = (path) =>
      page.evaluate(async (p) => {
        for (const name of await caches.keys()) if (await (await caches.open(name)).match(p)) return true;
        return false;
      }, path);
    expect(await cached('/hindi-typing-test')).toBe(false);
    expect(await cached('/unicode-to-kruti-dev')).toBe(true);
    await page.goto('/hindi-typing-test');
    await expect(page.locator('[data-tutor] .tt-c').first()).toBeVisible();
    await expect.poll(() => cached('/hindi-typing-test')).toBe(true);

    // Online, a file opened in the tab comes through the worker as itself.
    const sitemap = await page.goto('/sitemap-index.xml');
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()['content-type']).toContain('xml');
    // When fetching a file fails (the connection drops), the browser shows its
    // own error, not the site's 404 page claiming that a file which exists is
    // missing. context.route reaches the worker's own requests in Chromium.
    await context.route('**/robots.txt', (route) => route.abort('internetdisconnected'));
    await expect(page.goto('/robots.txt')).rejects.toThrow();
    await context.unroute('**/robots.txt');

    await context.setOffline(true);
    try {
      await page.goto('/unicode-to-kruti-dev');
      await input(page).fill('नमस्ते');
      await expect(output(page)).not.toHaveValue('');

      await page.goto('/hi/kruti-dev-to-mangal');
      await input(page).fill('ueLrs');
      await expect(output(page)).toHaveValue('नमस्ते');

      await page.goto('/hindi-typing-test');
      await expect(page.locator('[data-tutor] .tt-c').first()).toBeVisible();

      await page.goto('/hi/english-to-hindi-typing');
      await page.locator('[data-translit] [data-role="input"]').fill('bharat');
      await expect(page.locator('[data-translit] [data-role="output"]')).toHaveValue(/भारत/);

      // The published form with a trailing slash is the same page.
      await page.goto('/devlys-to-unicode/');
      await expect(page.locator('[data-converter]')).toBeVisible();

    } finally {
      await context.setOffline(false);
    }
  });

  test('the install button appears only when the browser offers it, and × hides it for good', async ({ page, isMobile }) => {
    await page.goto('/');
    const box = page.locator(isMobile ? '.mkd-install-panel' : '.mkd-install-bar');
    await expect(box).toBeHidden();

    const offer = () =>
      page.evaluate(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(e, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
        window.dispatchEvent(e);
      });
    await offer();
    if (isMobile) await page.locator('[data-burger]').click();
    await expect(box).toBeVisible();
    await box.locator('[data-install-dismiss]').click();
    await expect(box).toBeHidden();

    await page.reload();
    await offer();
    if (isMobile) await page.locator('[data-burger]').click();
    await expect(box).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Typing tutor
// ---------------------------------------------------------------------------

const me = (page) => page.locator('[data-tutor-progress]');
const capture = (page) => page.locator('[data-tutor] [data-role="capture"]');

/** One short practice session: a few keys, then Submit. */
async function practise(page) {
  await page.locator('[data-tutor] [data-mode="practice"]').click();
  await capture(page).focus();
  await page.keyboard.type('kjlkjlkjlkjlkjlkjl', { delay: 15 });
  await page.locator('[data-tutor] [data-role="submit"]').click();
  await expect(page.locator('[data-tutor] [data-role="result"]')).toBeVisible();
}

test.describe('typing tutor: progress', () => {
  test('a session is saved: streak, minutes, chart - and still there after a reload', async ({ page }) => {
    await page.goto('/hindi-typing-test');
    await expect(me(page).locator('[data-p="streak"]')).toHaveText('0');
    await expect(me(page).locator('[data-p="chart-empty"]')).toBeVisible();

    await practise(page);
    await expect(me(page).locator('[data-p="streak"]')).toHaveText('1');
    await expect(me(page).locator('[data-p="streak-note"]')).toHaveText('You practised today. See you tomorrow!');
    await expect(me(page).locator('.tt-chart-dot')).toHaveCount(1);

    await page.reload();
    await expect(me(page).locator('[data-p="streak"]')).toHaveText('1');
    await expect(me(page).locator('.tt-chart-dot')).toHaveCount(1);
    await expect(me(page).locator('[data-p="lessons"]')).toHaveText(/^0 \/ \d+$/);
  });

  test('the streak across dates: kept the next day, gone the day after, +1 on practice', async ({ page }) => {
    const seed = (habit) => page.addInitScript((h) => localStorage.setItem('mkd-habit', JSON.stringify(h)), habit);
    await seed({ v: 1, sessions: [], totalMs: 0, bestWpm: 0, bestAcc: 0, streak: { last: '2026-03-10', count: 4, best: 4 }, badges: [] });
    const streak = me(page).locator('[data-p="streak"]');

    await page.clock.setFixedTime(new Date(2026, 2, 11, 9, 0));
    await page.goto('/hindi-typing-test');
    await expect(streak).toHaveText('4');
    await expect(me(page).locator('[data-p="streak-note"]')).toHaveText('Practise today to keep your streak going.');

    await page.clock.setFixedTime(new Date(2026, 2, 12, 9, 0));
    await page.reload();
    await expect(streak).toHaveText('0');

    // Practising on the day after the last one extends the streak.
    await page.clock.setFixedTime(new Date(2026, 2, 11, 9, 0));
    await page.reload();
    await practise(page);
    await expect(streak).toHaveText('5');
  });

  test('a milestone gives a badge with a small celebration', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mykrutidev:tutor', JSON.stringify({ done: ['home'], best: {} })));
    await page.goto('/hindi-typing-test');
    const badge = me(page).locator('[data-badge="first-lesson"]');
    await expect(badge).toHaveAttribute('data-earned', 'false');
    await practise(page);
    await expect(badge).toHaveAttribute('data-earned', 'true');
    await expect(page.locator('.mkd-badge-pop')).toContainText('First lesson');
  });

  test('"Reset my progress" forgets everything, after a second tap', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mykrutidev:best-wpm', '33'));
    await page.goto('/hindi-typing-test');
    await practise(page);
    await expect(me(page).locator('[data-p="best"]')).toHaveText('33');

    const reset = me(page).locator('[data-role="reset-progress"]');
    await reset.click();
    await expect(reset).toHaveText('Tap again to erase everything');
    await expect(me(page).locator('[data-p="streak"]')).toHaveText('1');
    await reset.click();

    await expect(me(page).locator('[data-p="streak"]')).toHaveText('0');
    await expect(me(page).locator('[data-p="best"]')).toHaveText('–');
    await expect(me(page).locator('[data-p="chart-empty"]')).toBeVisible();
    const stored = await page.evaluate(() =>
      ['mkd-habit', 'mykrutidev:tutor', 'mykrutidev:best-wpm'].map((k) => localStorage.getItem(k)),
    );
    expect(stored).toEqual([null, null, null]);

    await page.reload();
    await expect(me(page).locator('[data-p="streak"]')).toHaveText('0');
    await expect(me(page).locator('.tt-chart-dot')).toHaveCount(0);
  });

  test("Today's practice is one passage per date, the same on every visit", async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 26, 9, 0));
    await page.goto('/hindi-typing-test');
    await page.locator('[data-tutor] [data-mode="daily"]').click();
    const title = page.locator('[data-tutor] [data-role="passage-title"]');
    await expect(title).toContainText("Today's practice");
    const first = await title.textContent();
    await page.reload();
    await page.locator('[data-tutor] [data-mode="daily"]').click();
    await expect(title).toHaveText(first);
    await expect(page.locator('[data-tutor] [data-role="new"]')).toBeHidden();
  });

  test('exam mode: 10 minutes, no pause, scored as net WPM and accuracy', async ({ page }) => {
    await page.goto('/hi/hindi-typing-test');
    await page.locator('[data-tutor] [data-mode="exam"]').click();
    await expect(page.locator('[data-tutor] [data-role="time"]')).toHaveText('10:00');
    await expect(page.locator('[data-tutor] [data-role="duration"]')).toBeHidden();
    await expect(page.locator('[data-tutor] [data-role="mode-note"]')).toContainText('आधिकारिक परीक्षा का अनुकरण नहीं');
    await expect(page.locator('[data-tutor] [data-role="mode-note"]')).toContainText('÷ 5');
    await capture(page).focus();
    await page.keyboard.type('kjlkjlkjlkjl');
    await expect(page.locator('[data-tutor] [data-role="pause"]')).toBeHidden();
    await page.locator('[data-tutor] [data-role="submit"]').click();
    await expect(page.locator('[data-tutor] [data-role="result-title"]')).toHaveText('परीक्षा का नतीजा');
    await expect(page.locator('[data-tutor] [data-role="result-note"]')).toContainText('नेट स्पीड');
  });

  test('the result card is an image, downloaded where there is no share sheet', async ({ page }) => {
    await page.addInitScript(() => {
      // Desktop Chrome in a test has no file share sheet; make sure of it.
      Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    });
    await page.goto('/hindi-typing-test');
    await page.locator('[data-tutor] [data-mode="practice"]').click();
    await capture(page).focus();
    // Real keys, so the speed is above zero.
    for (let i = 0; i < 12; i++) {
      const want = await page.locator('[data-tutor] [data-role="prompt-keys"]').textContent();
      const key = want === 'Space' ? ' ' : want.replace(/^Shift\+?/, '');
      await page.keyboard.type(key.length === 1 ? key : ' ');
    }
    await page.locator('[data-tutor] [data-role="submit"]').click();
    const share = page.locator('[data-tutor] [data-role="share"]');
    await expect(share).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), share.click()]);
    expect(download.suggestedFilename()).toMatch(/^mykrutidev-\d+-wpm\.png$/);
  });
});

// ---------------------------------------------------------------------------
// Layout stability
// ---------------------------------------------------------------------------

for (const path of ['/unicode-to-kruti-dev', '/hindi-typing-test', '/hi/english-to-hindi-typing']) {
  test(`${path}: nothing moves while the page and its saved state load (CLS 0)`, async ({ page }) => {
    // A returning visitor: a draft, a Recent list and tutor progress.
    await page.addInitScript(() => {
      localStorage.setItem('mkd-draft:unicode-kruti-dev', JSON.stringify('नमस्ते'));
      localStorage.setItem('mkd-recent:unicode-kruti-dev', JSON.stringify([{ text: 'नमस्ते', at: Date.now() }]));
      localStorage.setItem(
        'mkd-habit',
        JSON.stringify({ v: 1, sessions: [{ d: '2026-09-25', mode: 'practice', wpm: 22, acc: 95, ms: 60000 }], totalMs: 60000, streak: { last: '2026-09-25', count: 2, best: 2 }, badges: ['wpm-20'] }),
      );
    });
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800);
    const cls = await page.evaluate(
      () =>
        new Promise((done) => {
          let sum = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) if (!e.hadRecentInput) sum += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => done(sum), 300);
        }),
    );
    expect(cls).toBe(0);
  });
}
