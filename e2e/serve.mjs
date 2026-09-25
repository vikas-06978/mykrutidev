// Serves dist/ for the Playwright tests: `node e2e/serve.mjs [port]`.
// The server itself is scripts/serve-dist.mjs, shared with the PDF build.
import { fileURLToPath } from 'node:url';
import { serveDist } from '../scripts/serve-dist.mjs';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.argv[2] ?? 4401);
await serveDist(ROOT, PORT);
console.log(`serving dist/ on http://localhost:${PORT}`);
