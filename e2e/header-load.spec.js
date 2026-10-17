import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';

for (const prefix of ['', '/hi', '/bn', '/gu', '/mr', '/pa', '/ta']) {
  test(`${prefix || '/en'}: logo stays in place when header controls arrive after its first paint`, async ({ page, request, baseURL }) => {
    const response = await request.get(`${prefix}/hindi-typing-test/`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const split = html.indexOf('<div class="flex min-w-0 items-center gap-2 lg:gap-3"');
    expect(split).toBeGreaterThan(0);
    let release;
    const controlsReady = new Promise(resolve => { release = resolve; });
    const server = createServer(async (req, res) => {
      if (req.url === '/slow-header') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.write(html.slice(0, split));
        await controlsReady;
        res.end(html.slice(split));
        return;
      }
      try {
        const asset = await fetch(new URL(req.url, baseURL));
        res.writeHead(asset.status, { 'content-type': asset.headers.get('content-type') ?? 'application/octet-stream' });
        res.end(Buffer.from(await asset.arrayBuffer()));
      } catch {
        res.writeHead(502); res.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/slow-header`, { waitUntil: 'commit' });
      const logo = page.locator('header a[translate="no"]').first();
      await expect(logo).toBeVisible();
      await expect(page.locator('header > .wrap')).toHaveCSS('display', 'flex');
      const before = await logo.boundingBox();
      release();
      await page.waitForLoadState('load');
      const after = await logo.boundingBox();
      expect(after.y).toBe(before.y);
      expect(after.height).toBe(before.height);
    } finally {
      release();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
