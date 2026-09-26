/**
 * The desktop menubar's hover menus (Header.astro), driven with a real mouse
 * at a human pace rather than Playwright's instant jumps:
 *
 * - moving SLOWLY from a menu's button down into the list, even pausing in the
 *   gap between them, keeps it open; so does a slow diagonal to the far end of
 *   the list, and that path never opens the neighbouring menu on the way;
 * - leaving the menu for the page still closes it, and gliding along the
 *   menubar still switches from one menu to the next;
 * - a menu closed with a click stays closed under the pointer, and one opened
 *   from the keyboard is not closed by the mouse moving somewhere else.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'hover menus are a mouse-only affordance');
});

const DESKTOP = { width: 1366, height: 768 };
/** Long enough for any close timer to have fired. */
const SETTLE = 700;

const groups = (page) => page.locator('[data-desktop-nav] [data-group]');
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Move the mouse in 2px steps, one every ~16ms: a slow, steady hand. */
async function glide(page, from, to) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
}

/** Hover a group's button and wait for its menu. Returns the geometry. */
async function hoverOpen(page, group) {
  const trigger = group.locator('[data-trigger]');
  const menu = group.locator('[data-menu]');
  const start = center(await trigger.boundingBox());
  // Come in from the top edge of the header, like a real pointer.
  const from = { x: start.x, y: 2 };
  await page.mouse.move(from.x, from.y);
  await glide(page, from, start);
  await expect(menu).toBeVisible();
  const rows = menu.locator(':scope > li');
  return {
    trigger,
    menu,
    start,
    triggerBox: await trigger.boundingBox(),
    menuBox: await menu.boundingBox(),
    last: center(await rows.last().boundingBox()),
    first: await rows.first().boundingBox(),
  };
}

test.describe('hover menus at a human pace', () => {
  // Every menu, at a slow hand's pace, takes a while.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    expect(await groups(page).count()).toBeGreaterThan(1);
  });

  test('every menu stays open on a slow move from its button to its last item', async ({ page }) => {
    for (const group of await groups(page).all()) {
      const m = await hoverOpen(page, group);
      await glide(page, m.start, { x: m.start.x, y: m.last.y });
      await page.waitForTimeout(SETTLE);
      await expect(m.menu, await m.trigger.innerText()).toBeVisible();
      await page.mouse.move(DESKTOP.width / 2, DESKTOP.height - 10);
      await expect(m.menu).toBeHidden();
    }
  });

  test('a pause in the gap between the button and the list does not close it', async ({ page }) => {
    for (const group of await groups(page).all()) {
      const m = await hoverOpen(page, group);
      // Halfway between the bottom of the button and the top of the list.
      const gap = { x: m.start.x, y: (m.triggerBox.y + m.triggerBox.height + m.menuBox.y) / 2 };
      await glide(page, m.start, gap);
      await page.waitForTimeout(300);
      await glide(page, gap, { x: m.start.x, y: m.last.y });
      await page.waitForTimeout(SETTLE);
      await expect(m.menu, await m.trigger.innerText()).toBeVisible();
      await page.mouse.move(DESKTOP.width / 2, DESKTOP.height - 10);
      await expect(m.menu).toBeHidden();
    }
  });

  test('a slow diagonal to the far end of the list keeps it open and opens no other menu', async ({ page }) => {
    for (const group of await groups(page).all()) {
      const m = await hoverOpen(page, group);
      // The list is wider than its button and hangs out to one side, under the
      // neighbouring buttons: aim for the first row's far edge on that side.
      const farLeft = m.menuBox.x < m.triggerBox.x;
      const target = {
        x: farLeft ? m.first.x + 12 : m.first.x + m.first.width - 12,
        y: m.first.y + m.first.height / 2,
      };
      await glide(page, m.start, target);
      await page.waitForTimeout(SETTLE);
      await expect(m.menu, await m.trigger.innerText()).toBeVisible();
      await expect(page.locator('[data-desktop-nav] [data-menu]:visible')).toHaveCount(1);
      await page.mouse.move(DESKTOP.width / 2, DESKTOP.height - 10);
      await expect(m.menu).toBeHidden();
    }
  });

  test('gliding along the menubar still moves from one menu to the next', async ({ page }) => {
    const [a, b] = await groups(page).all();
    const first = await hoverOpen(page, a);
    const next = center(await b.locator('[data-trigger]').boundingBox());
    await glide(page, first.start, next);
    await expect(b.locator('[data-menu]')).toBeVisible();
    await expect(first.menu).toBeHidden();
  });

  test('clicking the button of a hover-opened menu closes it, and it stays closed', async ({ page }) => {
    const m = await hoverOpen(page, groups(page).first());
    await page.waitForTimeout(500); // past the click grace after a hover-open
    await m.trigger.click();
    await expect(m.menu).toBeHidden();
    await glide(page, m.start, { x: m.start.x + 3, y: m.start.y + 2 });
    await page.waitForTimeout(SETTLE);
    await expect(m.menu).toBeHidden();
  });

  test('a menu opened from the keyboard is not closed by the mouse moving elsewhere', async ({ page }) => {
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height - 10);
    const group = groups(page).first();
    await group.locator('[data-trigger]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(group.locator('[data-menu]')).toBeVisible();
    await glide(page, { x: DESKTOP.width / 2, y: DESKTOP.height - 10 }, { x: DESKTOP.width / 2 + 60, y: DESKTOP.height - 40 });
    await page.waitForTimeout(SETTLE);
    await expect(group.locator('[data-menu]')).toBeVisible();
  });
});
