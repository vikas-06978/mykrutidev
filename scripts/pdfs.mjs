// `npm run pdfs` (and automatically before `npm run build`): build the site
// into a scratch folder, print the printable PDFs from it into
// public/downloads/, remove the scratch folder. public/ is copied into every
// build and served by the dev server, so the PDFs exist everywhere - and they
// are committed.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildPdfs } from './build-pdfs.mjs';

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
