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
import { convert, FONTS } from '../src/lib/fontMaps.js';

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
    // Devanagari and Gujarati cannot be typed key by key on a US layout; insertText is what
    // an IME or a paste delivers, and fires the same input event.
    if (/[ऀ-ॿ\u0A80-\u0AFF]/.test(sample)) {
      await input.focus();
      await page.keyboard.insertText(sample);
    } else {
      await input.pressSequentially(sample);
    }

    const out = root.locator('textarea[data-role="output"]');
    await expect(out).not.toHaveValue('');
    const from = await root.getAttribute('data-from');
    const to = await root.getAttribute('data-to');
    if (FONTS[from].kind === 'legacy' && FONTS[to].kind === 'legacy') {
      // Two legacy fonts can share most of their keys (Kruti Dev and DevLys
      // share all of them), so the output may rightly equal the input. What
      // the page shows must be exactly what the engine gives.
      expect(await out.inputValue()).toBe(convert(sample, from, to, { keepEnglish: true }));
    } else {
      expect(await out.inputValue()).not.toBe(sample);
    }
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

// ---------------------------------------------------------------------------
// Everyday Hindi tools (HindiTool.astro): the example in, the exact answer out
// ---------------------------------------------------------------------------

const HINDI_TOOLS = {
  '/number-to-hindi-words': 'एक लाख पच्चीस हज़ार रुपये और पचास पैसे मात्र',
  '/amount-in-words': 'Rupees One Lakh Twenty-Five Thousand and Fifty Paise Only',
  '/hindi-to-english-numbers': 'दिनांक 15/08/1947, कक्ष संख्या 101',
  '/english-to-hindi-numbers': 'दिनांक १५/०८/१९४७, कक्ष संख्या १०१',
  '/hindi-to-iast': 'bhārata sarakāra, pradhānamaṃtrī kāryālaya|',
  '/hindi-to-gujarati-script': 'ભારત સરકાર, પ્રધાનમંત્રી કાર્યાલય।',
  '/hindi-to-bengali-script': 'ভারত সরকার, প্রধানমংত্রী কার্যালয।',
  '/hindi-to-odia-script': 'ଭାରତ ସରକାର, ପ୍ରଧାନମଂତ୍ରୀ କାର୍ଯାଲଯ।',
  '/hindi-to-telugu-script': 'భారత సరకార, ప్రధానమంత్రీ కార్యాలయ।',
  '/hindi-to-kannada-script': 'ಭಾರತ ಸರಕಾರ, ಪ್ರಧಾನಮಂತ್ರೀ ಕಾರ್ಯಾಲಯ।',
  '/hindi-to-malayalam-script': 'ഭാരത സരകാര, പ്രധാനമംത്രീ കാര്യാലയ।',
};

for (const [path, want] of Object.entries(HINDI_TOOLS)) {
  for (const url of BOTH(path)) {
    test(`tool ${url}: the example gives the exact answer`, async ({ page }) => {
      const errors = errorsOf(page);
      await page.goto(url);
      const root = page.locator('[data-hindi-tool]');
      await root.locator('[data-role="sample"]').click();
      await expect(root.locator('[data-role="output"]')).toHaveValue(want);
      expect(errors).toEqual([]);
    });
  }
}

for (const url of BOTH('/hindi-word-counter')) {
  test(`tool ${url}: counts the example`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto(url);
    const root = page.locator('[data-hindi-tool]');
    await root.locator('[data-role="sample"]').click();
    await expect(root.locator('[data-count="words"]')).toHaveText('13');
    await expect(root.locator('[data-count="sentences"]')).toHaveText('2');
    expect(errors).toEqual([]);
  });
}

for (const url of BOTH('/english-date-to-hindi')) {
  test(`tool ${url}: writes a picked date in Hindi`, async ({ page }) => {
    const errors = errorsOf(page);
    await page.goto(url);
    const root = page.locator('[data-hindi-tool]');
    // Opens on today, so the long form is filled before anything is touched.
    await expect(root.locator('[data-date="long"]')).not.toHaveText('');
    await root.locator('[data-role="input"]').fill('1947-08-15');
    await expect(root.locator('[data-date="weekday"]')).toHaveText('शुक्रवार, 15 अगस्त 1947');
    await expect(root.locator('[data-date="words"]')).toHaveText('पंद्रह अगस्त उन्नीस सौ सैंतालीस');
    expect(errors).toEqual([]);
  });
}

test('amount tool: a third paise digit is refused, not rounded', async ({ page }) => {
  await page.goto('/number-to-hindi-words');
  const root = page.locator('[data-hindi-tool]');
  await root.locator('[data-role="input"]').fill('12.345');
  await expect(root.locator('[data-role="error"]')).toBeVisible();
  await expect(root.locator('[data-role="output"]')).toHaveValue('');
});
