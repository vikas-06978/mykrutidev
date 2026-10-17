import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('mkd-tour:/hindi-typing-test','1'));
  await page.goto('/hindi-typing-test/');
  await page.locator('[data-mode="exam"]').click();
  await page.locator('[data-role="coach-unicode"]').click();
});

test('source-backed Hindi profile uses native Unicode, sourced times and corrections',async({page})=>{
  await expect(page.locator('[data-role="time"]')).toHaveText('10:00');
  await expect(page.locator('[data-role="native-source"]')).toContainText('30 WPM');
  await expect(page.locator('[data-role="native-source"] a').first()).toHaveAttribute('href',/ssc.gov.in.*Notice_of_adv_chsle_2026.pdf/);
  await page.locator('[data-role="native-duration"]').selectOption('900');
  await expect(page.locator('[data-role="time"]')).toHaveText('15:00');
  const input=page.locator('[data-role="capture"]');
  await input.fill('भारत');await input.press('Backspace');await expect(input).toHaveValue('भार');
  await input.press('End');await input.press('Enter');await expect(input).toHaveValue('भार\n');
  await page.locator('[data-role="native-tab"]').click();await expect(input).toHaveValue('भार\n\t');
  await expect(page.locator('[data-role="pause"]')).toBeHidden();
  await expect(page.locator('[data-hands]')).toBeHidden();
});

test('completing native text allows revision and reports only an estimate without legacy records',async({page})=>{
  const reference=await page.locator('[data-tutor-passages]').evaluate(el=>JSON.parse(el.textContent).map(p=>p.units.map(u=>u.deva).join('')).join(' ').split(/\s+/u).slice(0,300).join(' '));
  await page.locator('[data-role="capture"]').fill(reference);
  await expect(page.locator('[data-role="result"]')).toBeHidden();
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state','running');
  await page.locator('[data-role="submit"]').click();
  await expect(page.locator('[data-role="native-grade"]')).toHaveText('Full mistakes: 0. Half mistakes: 0. Weighted mistakes: 0.');
  await expect(page.locator('[data-role="result-note"]')).toContainText('No official speed');
  await expect(page.locator('[data-role="share"]')).toBeHidden();
  await expect(page.locator('[data-role="coach-panel"]')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('mykrutidev:best-wpm'))).toBeNull();
  await page.locator('[data-mode="lesson"]').click();
  await expect(page.locator('[data-level="top"]')).toBeDisabled();
  await expect(page.locator('[data-role="capture"]')).not.toHaveAttribute('maxlength');
});

test('IME composition does not prematurely finish a native attempt',async({page})=>{
  await page.locator('[data-role="capture"]').evaluate(el=>{
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    el.value='भारत';
    el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  });
  await expect(page.locator('[data-tutor]')).toHaveAttribute('data-state','running');
  await expect(page.locator('[data-role="result"]')).toBeHidden();
  await page.locator('[data-role="capture"]').evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await expect(page.locator('[data-role="capture"]')).toHaveValue('भारत');
  await page.locator('[data-role="submit"]').click();
  await expect(page.locator('[data-role="native-grade"]')).toBeVisible();
});
