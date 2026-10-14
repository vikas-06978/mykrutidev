/**
 * Excel and CSV files through the document converter, in a real browser:
 * the Excel page's own upload, and the same upload on a converter page.
 *
 * - An .xlsx is converted and downloaded with the Hindi in Mangal, the
 *   English and the numbers as they were (the cell-level rules are in
 *   src/lib/sheetConvert.test.js; this checks the browser path end to end).
 * - A .csv gives the converted CSV and an .xlsx with the font set.
 * - An old .xls gets the Excel "Save As" message, in the page's language.
 * - The page has no accessibility violations, and fits a phone.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const D = '[data-doc-converter] ';
const fixture = (name) => fileURLToPath(new URL(`../src/lib/__fixtures__/${name}`, import.meta.url));

async function download(page, role = 'download') {
  const link = page.locator(`${D}[data-role="result"] [data-role="${role}"]`);
  await expect(link).toBeVisible({ timeout: 15_000 });
  const [file] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(readFileSync(await file.path())) };
}

test('the Excel page converts an .xlsx and keeps the English and numbers', async ({ page }) => {
  await page.goto('/kruti-dev-excel-to-unicode/');
  await page.setInputFiles(`${D}input[type=file]`, fixture('kruti-test.xlsx'));
  await expect(page.locator(`${D}[data-role="summary"]`)).toHaveText('Converted 6 cells · 2 sheets');
  const { name, bytes } = await download(page);
  expect(name).toBe('kruti-test-unicode.xlsx');
  const files = unzipSync(bytes);
  // openpyxl writes its text inline in the sheets, not in sharedStrings.xml.
  const text = Object.keys(files).filter((n) => /^xl\/(worksheets\/|sharedStrings)/.test(n)).map((n) => strFromU8(files[n])).join('');
  expect(text).toContain('राम कुमार');
  expect(text).toContain('Ram Kumar');
  expect(strFromU8(files['xl/styles.xml'])).toContain('Mangal');
  expect(strFromU8(files['xl/styles.xml'])).not.toContain('Kruti Dev');
  expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('<f>B3*2</f>');
});

test('Unicode to Kruti Dev: an .xlsx on the converter page sets Kruti Dev 010', async ({ page }) => {
  await page.goto('/unicode-to-kruti-dev/?mode=file');
  await page.setInputFiles(`${D}input[type=file]`, fixture('unicode-test.xlsx'));
  const { name, bytes } = await download(page);
  expect(name).toBe('unicode-test-krutidev.xlsx');
  const files = unzipSync(bytes);
  expect(strFromU8(files['xl/styles.xml'])).toContain('Kruti Dev 010');
  expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('jke dqekj');
});

test('a .csv gives the converted CSV and an Excel file with the font set', async ({ page }) => {
  await page.goto('/kruti-dev-excel-to-unicode/');
  await page.setInputFiles(`${D}input[type=file]`, {
    name: 'list.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,uke,Amount\r\nRam,"jke] dqekj",1250.50\r\n', 'latin1'),
  });
  const csv = await download(page);
  expect(csv.name).toBe('list-unicode.csv');
  // UTF-8 with a byte-order mark, so Excel reads the Hindi.
  expect([...csv.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder().decode(csv.bytes.slice(3))).toBe('Name,नाम,Amount\r\nRam,"राम, कुमार",1250.50\r\n');
  const xlsx = await download(page, 'download-docx');
  expect(xlsx.name).toBe('list-unicode.xlsx');
  const files = unzipSync(xlsx.bytes);
  expect(strFromU8(files['xl/styles.xml'])).toContain('Mangal');
  expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('राम, कुमार');
});

test('an old .xls is told how to save it as .xlsx, in Hindi on the Hindi page', async ({ page }) => {
  await page.goto('/hi/kruti-dev-excel-to-unicode/');
  await page.setInputFiles(`${D}input[type=file]`, { name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) });
  await expect(page.locator(`${D}[data-role="error"]`)).toHaveText('कृपया इसे Excel में खोलें और Save As → Excel Workbook (.xlsx) करें।');
});

test('the Excel page has no accessibility violations and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/kruti-dev-excel-to-unicode/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // The upload is on screen without scrolling past more than the heading.
  const top = await page.locator(`${D}[data-role="drop"]`).boundingBox();
  expect(top.y).toBeLessThan(780);
});
