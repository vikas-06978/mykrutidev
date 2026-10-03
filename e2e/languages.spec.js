// The language switch and the "also available in ..." banner, in a real
// browser. With two languages the switch is "English | हिंदी" (covered by the
// other specs); from three on it is a menu, tested here.
import { test, expect } from '@playwright/test';

import { LOCALES, LOCALE_META } from '../src/i18n/locales.js';

const OTHERS = LOCALES.filter((l) => l !== 'en');

test.describe('language menu', () => {
  test.skip(LOCALES.length <= 2, 'two languages: the switch is inline, not a menu');

  test('lists every language in its own script and keeps the page', async ({ page }) => {
    await page.goto('/unicode-to-kruti-dev/');
    const menu = page.locator('[data-lang-menu]');
    await menu.locator('summary').click();
    const links = menu.locator('a[data-lang-switch]');
    await expect(links).toHaveCount(LOCALES.length);
    for (const l of LOCALES) await expect(menu.locator(`a[data-lang-switch="${l}"]`)).toContainText(LOCALE_META[l].label);

    const l = OTHERS.at(-1);
    await menu.locator(`a[data-lang-switch="${l}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${l}/unicode-to-kruti-dev/$`));
    await expect(page.locator('html')).toHaveAttribute('lang', LOCALE_META[l].htmlLang);
  });

  test('closes on Escape and on a tap outside', async ({ page }) => {
    await page.goto('/');
    const menu = page.locator('[data-lang-menu]');
    await menu.locator('summary').click();
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await menu.locator('summary').click();
    // Tap low on the page: on a phone the open menu covers the heading.
    const { height } = page.viewportSize();
    await page.mouse.click(8, height - 8);
    await expect(menu).not.toHaveAttribute('open', '');
  });
});

for (const l of OTHERS) {
  test.describe(`banner for ${LOCALE_META[l].english} readers`, () => {
    test.use({ locale: `${l}-IN` });

    test(`an English page offers ${LOCALE_META[l].english}, once`, async ({ page }) => {
      await page.goto('/unicode-to-kruti-dev/');
      const banner = page.locator(`[data-lang-banner="${l}"]`);
      await expect(banner).toBeVisible();
      await expect(page.locator('[data-lang-banner]:visible')).toHaveCount(1);
      await expect(banner.locator('a')).toHaveAttribute('href', `/${l}/unicode-to-kruti-dev/`);
      await page.reload();
      await expect(banner).toBeHidden();
    });
  });
}
