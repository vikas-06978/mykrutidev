// `npm run pdfs` (and automatically before `npm run build`): build the site
// into a scratch folder, print the printable PDFs from it into
// public/downloads/, remove the scratch folder. public/ is copied into every
// build and served by the dev server, so the PDFs exist everywhere - and they
// are committed.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildPdfs } from './build-pdfs.mjs';

// Cloudflare Pages builds have no Chromium to draw with, so there the files
// already committed in public/ are used as they are (CF_PAGES is set only in
// Cloudflare's build). CI and local builds still redraw them.
if (process.env.CF_PAGES) {
  console.log('pdfs: skipped on Cloudflare Pages, using the committed files in public/downloads/');
  process.exit(0);
}

const root = new URL('../', import.meta.url);
const scratch = fileURLToPath(new URL('.pdf-build/', root));
const out = fileURLToPath(new URL('public/downloads/', root));

rmSync(scratch, { recursive: true, force: true });
const built = spawnSync('npx astro build --silent', {
  cwd: fileURLToPath(root),
  env: { ...process.env, MKD_PDF_BUILD: scratch },
  stdio: 'inherit',
  shell: true,
});
if (built.status !== 0) {
  console.error('pdfs: the site did not build');
  process.exit(built.status ?? 1);
}
try {
  await buildPdfs(scratch, out);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
