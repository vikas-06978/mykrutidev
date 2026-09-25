// Lighthouse (mobile, simulated slow 4G + 4x CPU - its defaults) on the built
// site. `npm run lighthouse` builds first. Fails (exit 1) below:
//   Performance >= 95, Accessibility >= 95, SEO = 100, CLS = 0.
// Reports go to lighthouse-reports/ (gitignored): open the .html in a browser.
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 4420;
const PAGES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/hi', '/unicode-to-kruti-dev', '/hindi-keyboard', '/hi/hindi-keyboard'];
const MIN = { performance: 95, accessibility: 95, seo: 100 };

const server = spawn(process.execPath, ['e2e/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
mkdirSync('lighthouse-reports', { recursive: true });

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});
const rows = [];
let failed = false;
try {
  for (const path of PAGES) {
    const { lhr, report } = await lighthouse(
      `http://localhost:${PORT}${path}`,
      { port: chrome.port, output: 'html', onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'] },
    );
    const score = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
    const cls = lhr.audits['cumulative-layout-shift'].numericValue;
    const row = {
      page: path,
      Performance: score('performance'),
      Accessibility: score('accessibility'),
      SEO: score('seo'),
      'Best practices': score('best-practices'),
      LCP: lhr.audits['largest-contentful-paint'].displayValue,
      TBT: lhr.audits['total-blocking-time'].displayValue,
      CLS: Math.round(cls * 1000) / 1000,
    };
    const fails = [
      ...Object.entries(MIN).filter(([k, v]) => score(k) < v).map(([k]) => k),
      ...(cls > 0 ? ['CLS'] : []),
    ];
    if (fails.length) {
      failed = true;
      row.FAILS = fails.join(', ');
      for (const cat of Object.keys(MIN)) {
        for (const ref of lhr.categories[cat].auditRefs) {
          const a = lhr.audits[ref.id];
          if (ref.weight > 0 && a.score !== null && a.score < 1) {
            console.log(`  ${path} ${cat}: ${a.id} - ${a.title} (${a.displayValue ?? a.score})`);
            for (const item of (a.details?.items ?? []).slice(0, 4)) {
              const n = item.node ?? item;
              if (n?.snippet) console.log(`      ${n.selector ?? ''}  ${n.snippet.slice(0, 140)}`);
            }
          }
        }
      }
    }
    rows.push(row);
    writeFileSync(`lighthouse-reports/${path.replace(/\//g, '_') || '_'}.html`, report);
  }
} finally {
  await chrome.kill();
  server.kill();
}
console.table(rows);
process.exit(failed ? 1 : 0);
