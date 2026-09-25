/**
 * Type into every tool page and expect real output - English and /hi/.
 *
 * This is the check that would have caught English to Hindi Typing going blank:
 * unit tests prove the engines, but only a browser proves the page actually
 * loads them. Converter pages are discovered from dist/ (every built page with
 * a converter on it), so a new converter is covered without editing this file.
 *
 * Google Input Tools is blocked in every test: the output must come from the
 * site's own dictionary, and the suite must not depend on the network.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(DIST)) throw new Error('dist/ not found - run `npm run build` first');

const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('index.html') ? [p] : [];
  });
const urlOf = (file) => {
  const rel = relative(DIST, file).split(sep).join('/').replace(/(^|\/)index\.html$/, '');
  return rel ? `/${rel}` : '/';
};

/** Every built page (en and /hi) that hosts a converter. */
const CONVERTERS = walk(DIST)
  .filter((f) => /\bdata-converter\b/.test(readFileSync(f, 'utf8')))
  .map(urlOf)
  .sort();

const BOTH = (path) => [path, path === '/' ? '/hi' : `/hi${path}`];
const errorsOf = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && r.url().startsWith('http://localhost') && errors.push(`${r.status()} ${r.url()}`));
  return errors;
};

test.beforeEach(async ({ page }) => {
  await page.route('https://inputtools.google.com/**', (route) => route.abort());
});

test('the converter list was discovered', () => {
  // Kruti <-> Unicode, Mangal and DevLys both ways, both Abbasi pages, the hub.
  for (const p of [
    '/', '/unicode-to-kruti-dev', '/kruti-dev-to-mangal', '/mangal-to-kruti-dev',
    '/devlys-to-unicode', '/unicode-to-devlys', '/devlys-to-mangal', '/mangal-to-devlys',
    '/abbasi-chanakya-to-unicode', '/unicode-to-abbasi-chanakya',
  ]) {
    for (const u of BOTH(p)) expect(CONVERTERS, u).toContain(u);
  }
});

// ---------------------------------------------------------------------------
// English to Hindi Typing
// ---------------------------------------------------------------------------

const TYPING_IN = 'namaste bharat, aap kaise hain?';
const TYPING_OUT = 'नमस्ते भारत, आप कैसे हैं?';

for (const url of BOTH('/english-to-hindi-typing')) {
  test.describe(`English to Hindi Typing ${url}`, () => {
    test('typing gives Hindi, from the dictionary when Google is unreachable', async ({ page }) => {
      const errors = errorsOf(page);
      await page.goto(url);
      await page.locator('[data-translit] textarea[data-role="input"]').pressSequentially(TYPING_IN);
      const out = page.locator('[data-translit] textarea[data-role="output"]');
      await expect(out).toHaveValue(TYPING_OUT);
      await expect(page.locator('[data-translit] [data-role="count-out"]')).toHaveText(String(TYPING_OUT.length));
      await expect(page.locator('[data-role="engine-error"]')).toBeHidden();
      // Google being blocked is expected; nothing else may fail.
      expect(errors.filter((e) => !/inputtools|Input Tools|ERR_FAILED/i.test(e))).toEqual([]);
    });

    test('still works when the English word list fails to load', async ({ page }) => {
      await page.route('**/data/english-words.json', (route) => route.fulfill({ status: 404 }));
      await page.goto(url);
      await page.locator('[data-translit] textarea[data-role="input"]').pressSequentially(TYPING_IN);
      await expect(page.locator('[data-translit] textarea[data-role="output"]')).toHaveValue(TYPING_OUT);
    });

    test('still works when the Google module itself fails to load', async ({ page }) => {
      await page.route('**/_astro/googleTranslit.*.js', (route) => route.fulfill({ status: 404 }));
      await page.goto(url);
      await page.locator('[data-translit] textarea[data-role="input"]').pressSequentially(TYPING_IN);
      await expect(page.locator('[data-translit] textarea[data-role="output"]')).toHaveValue(TYPING_OUT);
    });

    test('if the converter cannot load, the page says so instead of staying blank', async ({ page }) => {
      await page.route('**/_astro/translit.*.js', (route) => route.fulfill({ status: 503 }));
      await page.goto(url);
      await page.locator('[data-translit] textarea[data-role="input"]').pressSequentially('namaste');
      await expect(page.locator('[data-role="engine-error"]')).toBeVisible();
    });
  });
}

// ---------------------------------------------------------------------------
// Every converter page
// ---------------------------------------------------------------------------

for (const url of CONVERTERS) {
  test(`converter ${url}: typing gives output`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto(url);
    const root = page.locator('[data-converter]').first();
    const sample = await root.locator('[data-role="sample"]').getAttribute('data-sample');
    expect(sample, 'every converter has a sample').toBeTruthy();

    const input = root.locator('textarea[data-role="input"]');
    await input.fill('');
    // Devanagari cannot be typed key by key on a US layout; insertText is what
    // an IME or a paste delivers, and fires the same input event.
    if (/[ऀ-ॿ]/.test(sample)) {
      await input.focus();
      await page.keyboard.insertText(sample);
    } else {
      await input.pressSequentially(sample);
    }

    const out = root.locator('textarea[data-role="output"]');
    await expect(out).not.toHaveValue('');
    expect(await out.inputValue()).not.toBe(sample);
    await expect(root.locator('[data-role="count-out"]')).not.toHaveText('0');
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// Hindi Keyboard
// ---------------------------------------------------------------------------

for (const url of BOTH('/hindi-keyboard')) {
  test(`Hindi Keyboard ${url}: tapping keys writes Hindi`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto(url);
    const kb = page.locator('[data-keyboard]');
    for (const ch of ['न', 'म', 'स']) {
      await kb.locator(`[data-layer-panel="base"] button[data-ins="${ch}"]`).first().click();
    }
    const text = kb.locator('textarea[data-role="text"]');
    await expect(text).not.toHaveValue('');
    await expect(text).toHaveValue(/[ऀ-ॿ]/);
    await expect(kb.locator('[data-role="count"]')).not.toHaveText('0');
    expect(errors).toEqual([]);
  });
}
