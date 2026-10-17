import { test, expect } from '@playwright/test';
const root=page=>page.locator('[data-tutor]');
const input=page=>page.locator('[data-role="capture"]');
const key='mykrutidev:tutor-draft:/hindi-typing-test';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('mkd-tour:/hindi-typing-test','1'));
});
async function passage14(page){
 await page.goto('/hindi-typing-test/');
 await page.locator('button[data-mode="passages"]').click();
 await page.locator('[data-pp-level="2"]').click();
 await page.locator('[data-pp="14"]').click();
 await expect(input(page)).toBeEnabled();
}
test('read ahead with the wheel or a touch swipe, then follow the next typed character',async({page,isMobile})=>{
 await passage14(page);
 const ref=page.locator('.tt-passage');await ref.scrollIntoViewIfNeeded();
 const box=await ref.boundingBox();
 if(isMobile){
  const cdp=await page.context().newCDPSession(page);
  const x=box.x+box.width/2,y=box.y+box.height-30;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*24}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
 }else{
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,350);
 }
 await expect.poll(()=>ref.evaluate(el=>el.scrollTop)).toBeGreaterThan(40);
 await expect(root(page)).toHaveAttribute('data-state','idle');
 await input(page).focus();await page.keyboard.type('x');
 const caret=await page.locator('.tt-c[data-s="current"]').boundingBox();
 const panel=await ref.boundingBox();
 expect(caret.y).toBeGreaterThanOrEqual(panel.y-2);
 expect(caret.y+caret.height).toBeLessThanOrEqual(panel.y+panel.height+1);
 await expect(root(page)).toHaveAttribute('data-state','running');
});
test('refresh restores passage, typed progress and Focus without a new result or credit',async({page})=>{
 await passage14(page);
 const reference=await page.locator('[data-role="line"]').textContent();
 await input(page).fill(';ksx Hkkjr');await page.waitForTimeout(1100);
 await page.locator('[data-role="focus-toggle"]').click();
 await page.reload();
 await expect(root(page)).toHaveAttribute('data-focus-mode','true');
 await expect(root(page)).toHaveAttribute('data-mode','passages');
 await expect(root(page)).toHaveAttribute('data-state','paused');
 await expect(input(page)).toHaveValue(';ksx Hkkjr');
 await expect(page.locator('[data-role="line"]')).toHaveText(reference);
 await expect(page.locator('[data-role="result"]')).toBeHidden();
 await page.locator('[data-role="pause"]').click();
 await expect(input(page)).toBeEnabled();await page.keyboard.type('x');
 await expect(input(page)).toHaveValue(';ksx Hkkjrx');
 await page.locator('[data-role="focus-toggle"]').click();
 await expect(page.locator('[data-pp="14"]')).toHaveAttribute('aria-pressed','true');
});
test('timed exam keeps its deadline through refresh, including expiry',async({page})=>{
 await page.goto('/hindi-typing-test/?exam=ssc-chsl-2026-hindi');
 await input(page).fill('भारत');
 // Simulate time away in the NEW document; the outgoing page checkpoint
 // still uses the original clock, just as a real reload would.
 await page.addInitScript(() => {
  const later=Date.now()+700000;
  Date.now=()=>later;
 });
 await page.reload();
 await expect(root(page)).toHaveAttribute('data-state','done');
 await expect(input(page)).toHaveValue('भारत');
 await expect(page.locator('[data-role="result"]')).toBeVisible();
});
test('refresh keeps a random timed practice reference and its selected duration',async({page})=>{
 await page.goto('/hindi-typing-test/');
 await page.locator('button[data-mode="practice"]').click();
 await page.locator('[data-seconds="180"]').click();
 const reference=await page.locator('[data-role="line"]').textContent();
 await input(page).fill('kjlkjl');await page.reload();
 await expect(root(page)).toHaveAttribute('data-mode','practice');
 await expect(input(page)).toHaveValue('kjlkjl');
 await expect(page.locator('[data-role="line"]')).toHaveText(reference);
 await expect(page.locator('[data-seconds="180"]')).toHaveAttribute('aria-pressed','true');
 await expect(root(page)).toHaveAttribute('data-state','paused');
});

test('restart and completed results never recover old typed text or duplicate history',async({page})=>{
 await page.goto('/hindi-typing-test/');await input(page).fill('abc');
 await page.locator('[data-role="restart"]').click();await page.reload();
 await expect(input(page)).toHaveValue('');
 await input(page).fill('abc');await page.locator('[data-role="submit"]').click();
 const before=await page.evaluate(()=>localStorage.getItem('mkd-habit'));
 await page.reload();await expect(input(page)).toHaveValue('');
 expect(await page.evaluate(()=>localStorage.getItem('mkd-habit'))).toBe(before);
});
test('blocked storage does not break typing or Focus',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('blocked','SecurityError');}});
 });
 await page.goto('/hindi-typing-test/');await page.locator('[data-role="focus-toggle"]').click();
 await input(page).fill('abc');await expect(root(page)).toHaveAttribute('data-state','running');
 await page.locator('[data-role="focus-toggle"]').click();
 await expect(root(page)).toHaveAttribute('data-focus-mode','false');
});
test('long timed references reveal further text for reading without starting the clock',async({page})=>{
 await page.goto('/hindi-typing-test/');await page.locator('button[data-mode="practice"]').click();
 await page.locator('[data-seconds="7200"]').click();
 const initial=await page.locator('.tt-c').count();
 await page.locator('.tt-passage').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect.poll(()=>page.locator('.tt-c').count()).toBeGreaterThan(initial);
 await expect(root(page)).toHaveAttribute('data-state','idle');
});

test('a running exam resumes with less time and no pause after refresh',async({page})=>{
 await page.goto('/hindi-typing-test/?exam=remington');await input(page).fill('kjlkj');
 await page.addInitScript(()=>{const realNow=Date.now;Date.now=()=>realNow()+7000;});
 await page.reload();
 await expect(root(page)).toHaveAttribute('data-mode','exam');
 await expect(root(page)).toHaveAttribute('data-state','running');
 await expect(input(page)).toHaveValue('kjlkj');
 await expect(page.locator('[data-role="pause"]')).toBeHidden();
 await expect(page.locator('[data-role="time"]')).toHaveText(/9:5[0123]/);
});
test('slow passage loading after reload does not erase the restored attempt',async({page})=>{
 await passage14(page);await input(page).fill(';ksx');
 const url=await page.locator('[data-tutor-pp]').evaluate(el=>JSON.parse(el.textContent).url);
 await page.route('**'+url,async route=>{
  await new Promise(resolve=>setTimeout(resolve,700));await route.continue();
 });
 await page.reload();
 await expect(input(page)).toHaveValue(';ksx');
 await page.waitForTimeout(1000);
 await expect(input(page)).toHaveValue(';ksx');
 await expect(root(page)).toHaveAttribute('data-state','paused');
});
