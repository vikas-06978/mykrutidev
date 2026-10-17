import { test, expect } from '@playwright/test';
// Isolate reading-key movement from the site's animated initial focus scroll.
test.use({ reducedMotion: 'reduce' });
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mkd-tour:/hindi-typing-test','1'));
});
for(const native of [false,true])for(const focus of [false,true]){
 test(`keyboard reading stays in the reference: ${native?'Unicode':'Remington'}, ${focus?'Focus':'normal'}`,async({page})=>{
  await page.goto(native?'/hindi-typing-test/?exam=ssc-chsl-2026-hindi':'/hindi-typing-test/?passage=14');
  const input=page.locator('[data-role="capture"]'),ref=page.locator('[data-role="passage"]'),root=page.locator('[data-tutor]');
  await expect(input).toBeEnabled();
  if(focus)await page.locator('[data-role="focus-toggle"]').click();
  await input.focus();await page.keyboard.press('Shift+Tab');
  await expect(ref).toBeFocused();
  // Settle web fonts and the initial focus position before measuring keys.
  await page.evaluate(()=>document.fonts.ready);
  await ref.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const documentTop=await page.evaluate(()=>scrollY);
  const tutorTop=await root.evaluate(el=>el.scrollTop);
  const top=()=>ref.evaluate(el=>el.scrollTop);
  await page.keyboard.press('ArrowDown');await expect.poll(top).toBeGreaterThan(0);
  const lineTop=await top();
  await page.keyboard.press('ArrowUp');await expect.poll(top).toBe(0);
  await page.keyboard.press('PageDown');await expect.poll(top).toBeGreaterThan(lineTop);
  await page.keyboard.press('PageUp');await expect.poll(top).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(()=>ref.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThanOrEqual(1);
  await page.keyboard.press('PageDown');
  expect(await page.evaluate(()=>scrollY)).toBe(documentTop);
  expect(await root.evaluate(el=>el.scrollTop)).toBe(tutorTop);
  await page.keyboard.press('Home');await expect.poll(top).toBe(0);
  await page.keyboard.press('PageUp');
  expect(await page.evaluate(()=>scrollY)).toBe(documentTop);
  await expect(root).toHaveAttribute('data-state','idle');await expect(input).toHaveValue('');
  await page.keyboard.press('Tab');await expect(input).toBeFocused();
  await input.fill('ab');await page.keyboard.press('ArrowLeft');await page.keyboard.type('x');
  await expect(input).toHaveValue('axb');
  await expect(root).toHaveAttribute('data-state','running');
 });
}
test('End reaches the true end of a long reference and typing returns to the current character',async({page})=>{
 await page.goto('/hindi-typing-test/');
 await page.locator('button[data-mode="practice"]').click();await page.locator('[data-seconds="7200"]').click();
 const ref=page.locator('[data-role="passage"]'),input=page.locator('[data-role="capture"]');
 const initial=await page.locator('.tt-c').count();
 await ref.focus();await page.keyboard.press('End');
 expect(await page.locator('.tt-c').count()).toBeGreaterThan(initial);
 await expect.poll(()=>ref.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThanOrEqual(1);
 await page.keyboard.press('Tab');await expect(input).toBeFocused();await page.keyboard.type('d');
 const caret=await page.locator('.tt-c[data-s="current"]').boundingBox(),panel=await ref.boundingBox();
 expect(caret.y).toBeGreaterThanOrEqual(panel.y);expect(caret.y+caret.height).toBeLessThanOrEqual(panel.y+panel.height+1);
});
test('clicking a desktop Remington reference scrolls with keys and keeps the first typed key',async({page,isMobile})=>{
 test.skip(isMobile, 'touch taps open the on-screen keyboard');
 await page.goto('/hindi-typing-test/?exam=remington');
 const ref=page.locator('[data-role="passage"]'),input=page.locator('[data-role="capture"]');
 await ref.click({position:{x:100,y:100}});
 await expect(ref).toBeFocused();
 await page.keyboard.press('PageDown');
 await expect.poll(()=>ref.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.keyboard.type('D');
 await expect(input).toBeFocused();
 await expect(input).toHaveValue('D');
});
