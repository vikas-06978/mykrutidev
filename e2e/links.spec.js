/**
 * The ToolMitra links page (/links), the link in the Instagram bio.
 *
 * - the app cards come first, and MyKrutiDev's opens the site;
 * - every tool card opens its page, in the page's own language;
 * - the request form: a too-short idea is refused on the page, a good one is
 *   sent to /api/tool-request with only the form's fields, and a thank-you
 *   replaces the form (with a way back for another idea);
 * - no accessibility violations, in both languages.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the MyKrutiDev app card opens the site, in English and Hindi', async ({ page }) => {
  for (const [path, to] of [
    ['/links/', '/'],
    ['/hi/links/', '/hi/'],
  ]) {
    await page.goto(path);
    await expect(page.locator('[data-links-app="memebox"]')).toContainText('MemeBox');
    await page.locator('[data-links-app="mykrutidev"]').click();
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  }
});

test('the tool cards open their pages, in English and Hindi', async ({ page }) => {
  for (const [path, card, to] of [
    ['/links/', '/hindi-keyboard', '/hindi-keyboard/'],
    ['/hi/links/', '/hindi-keyboard', '/hi/hindi-keyboard/'],
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText('ToolMitra');
    await page.locator(`[data-links-tool="${card}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${to}$`));
  }
});

test('the request form sends only what was typed, then says thanks', async ({ page }) => {
  const sent = [];
  await page.route('**/api/tool-request', (route) => {
    sent.push(route.request().postDataJSON());
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 1 }) });
  });
  // No Turnstile key here: the form is sent without a token.
  await page.route('**/api/feedback', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, turnstileSiteKey: null }) }),
  );
  await page.goto('/links/');
  const form = page.locator('[data-lk-form]');
  const idea = form.getByLabel('Tool you want');

  await idea.fill('ab');
  await form.getByRole('button', { name: 'Send request' }).click();
  await expect(form.locator('[data-lk-error]')).toHaveText(/at least 3 letters/);
  await expect(idea).toBeFocused();
  expect(sent).toEqual([]);

  await idea.fill('  PDF to Kruti Dev  ');
  await form.getByLabel('What would it help you do?').fill('Notices come as PDF');
  await form.getByRole('button', { name: 'Send request' }).click();
  const thanks = page.locator('[data-lk-thanks]');
  await expect(thanks).toBeVisible();
  await expect(thanks).toContainText('Thank you!');
  await expect(form).toBeHidden();

  expect(sent).toHaveLength(1);
  const { device, ...rest } = sent[0];
  expect(['mobile', 'desktop']).toContain(device);
  expect(rest).toEqual({ idea: 'PDF to Kruti Dev', details: 'Notices come as PDF', lang: 'en', website: '' });

  await thanks.getByRole('button', { name: 'Suggest another tool' }).click();
  await expect(form).toBeVisible();
  await expect(idea).toHaveValue('');
  await expect(idea).toBeFocused();
});

test('a refused email is shown next to the form, and nothing is lost', async ({ page }) => {
  await page.route('**/api/tool-request', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'invalid', details: ['email: not an email address'] }),
    }),
  );
  await page.route('**/api/feedback', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, turnstileSiteKey: null }) }),
  );
  await page.goto('/hi/links/');
  const form = page.locator('[data-lk-form]');
  await form.locator('#lk-idea').fill('कोर्ट परीक्षा टाइपिंग टेस्ट');
  await form.locator('#lk-email').fill('me@example.co');
  await form.locator('[data-lk-send]').click();
  await expect(form.locator('[data-lk-error]')).toHaveText(/ईमेल पता सही नहीं/);
  await expect(form.locator('#lk-idea')).toHaveValue('कोर्ट परीक्षा टाइपिंग टेस्ट');
  await expect(form.locator('#lk-email')).toBeFocused();
});

test('no accessibility violations, in both languages', async ({ page }) => {
  for (const path of ['/links/', '/hi/links/']) {
    await page.goto(path);
    // The same standard as the site-wide check in seo.spec.js: WCAG 2 A and AA.
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`), path).toEqual([]);
  }
});
