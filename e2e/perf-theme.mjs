// Measures a theme switch (Light -> Dark by default) on a page of the BUILT
// site, clicking the real theme panel, and saves a Chrome Performance trace.
//
//   node e2e/perf-theme.mjs [label] [path] [from] [to]
//   (REDUCED=1 measures the instant switch that reduced motion gets)
//
// Reports, per CPU speed (normal and 4x throttled, roughly a mid-range phone):
//   click->paint   Event Timing duration of the click: input delay +
//                  handlers + the next frame being presented
//   colours final  click until the page background is the target colour
//                  (a CSS transition makes this longer than click->paint)
//   long tasks     main-thread tasks over 50 ms in the second after the click
//   frames         frames drawn in that second (a fade keeps drawing)
// Trace files: perf-traces/<label>-<cpu>.json (open in DevTools > Performance).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const [label = 'run', path = '/hindi-keyboard', from = 'light', to = 'dark'] = process.argv.slice(2);
const PORT = 4411;
const server = spawn(process.execPath, ['e2e/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
mkdirSync('perf-traces', { recursive: true });

const browser = await chromium.launch();
const results = [];
try {
  for (const cpu of [1, 4]) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
      await page.addInitScript((t) => localStorage.setItem('mkd-theme', t), from);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.goto(`http://localhost:${PORT}${path}`);
      await page.locator('[data-theme-trigger]').click();
      await page.locator('[data-theme-panel]').waitFor();
      await page.waitForTimeout(400);

      const target = await page.evaluate((t) => {
        // The target background, read from a hidden probe in that theme.
        const probe = document.createElement('div');
        document.body.append(probe);
        const cur = document.documentElement.dataset.theme;
        document.documentElement.dataset.theme = t;
        const bg = getComputedStyle(document.body).backgroundColor;
        document.documentElement.dataset.theme = cur;
        probe.remove();
        window.__perf = { events: [], long: [], frames: 0, final: null, t0: null };
        new PerformanceObserver((l) => window.__perf.events.push(...l.getEntries().map((e) => ({ name: e.name, start: e.startTime, duration: e.duration }))))
          .observe({ type: 'event', durationThreshold: 16, buffered: false });
        new PerformanceObserver((l) => window.__perf.long.push(...l.getEntries().map((e) => e.duration))).observe({ type: 'longtask' });
        document.addEventListener('pointerdown', () => {
          window.__perf.t0 = performance.now();
          const tick = () => {
            window.__perf.frames++;
            if (window.__perf.final === null && getComputedStyle(document.body).backgroundColor === bg) {
              window.__perf.final = performance.now() - window.__perf.t0;
            }
            if (performance.now() - window.__perf.t0 < 1000) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, { capture: true, once: true });
        return bg;
      }, to);

      const trace = i === 0 ? `perf-traces/${label}-cpu${cpu}x.json` : null;
      if (trace) await browser.startTracing(page, { path: trace, screenshots: true, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
      await page.locator(`[data-theme-panel] [data-value="${to}"]`).click();
      await page.waitForTimeout(1200);
      if (trace) await browser.stopTracing();

      const p = await page.evaluate(() => window.__perf);
      const click = p.events.filter((e) => e.name === 'click' || e.name === 'pointerup' || e.name === 'pointerdown');
      runs.push({
        clickToPaint: Math.max(0, ...click.map((e) => e.duration)),
        final: p.final,
        longTasks: p.long.length,
        longestTask: Math.max(0, ...p.long),
        frames: p.frames,
        ok: (await page.evaluate(() => document.documentElement.dataset.theme)) === to,
        target,
      });
      await page.close();
    }
    const median = (k) => {
      const v = runs.map((r) => r[k] ?? Infinity).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    results.push({
      cpu: `${cpu}x`,
      'click->paint ms': Math.round(median('clickToPaint')),
      'colours final ms': Math.round(median('final')),
      'long tasks >50ms': Math.max(...runs.map((r) => r.longTasks)),
      'longest task ms': Math.round(Math.max(...runs.map((r) => r.longestTask))),
      'frames in 1s': median('frames'),
      'ended on target': runs.every((r) => r.ok),
    });
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${label}: ${path} ${from} -> ${to} (median of 5 per row)`);
console.table(results);
