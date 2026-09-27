/* The service worker: every page, font and script, available offline.
 *
 * This is a TEMPLATE. src/pwa/integration.mjs copies it into dist/sw.js at the
 * end of `astro build`, replacing the two placeholders below with the list of
 * files the build produced and a hash of their contents. Nothing here runs in
 * `astro dev` - the page script unregisters any worker it finds there.
 *
 * Strategy:
 *  - Install: download PRECACHE - the app shell, every converter page in both
 *    languages, their scripts and the fonts they use (the list and its size
 *    are decided in integration.mjs). A file whose revision did not change
 *    since the last deploy is copied from the old cache instead of downloaded
 *    again. With Save-Data on, only the scripts and fonts are fetched up
 *    front. Every other page and file is kept the first time it is visited.
 *  - Pages: network first, so a deploy shows up at once; the cached copy when
 *    the network is down or takes longer than NETWORK_TIMEOUT_MS.
 *  - A file opened directly (the sitemap, robots.txt, a PDF): the network,
 *    else a cached copy, else the browser's own error - never the 404 page,
 *    which would claim a file that exists is missing.
 *  - /_astro/ (content-hashed, never changes under one name): cache first.
 *  - Other same-origin files: cache, refreshed in the background.
 *  - Never touched: other origins (Google's input tools), /api/, /admin.
 */

const PRECACHE = self.__MKD_PRECACHE__; // [[url, revision], ...]
const VERSION = self.__MKD_VERSION__;
const CACHE = `mkd-${VERSION}`;
const INDEX_KEY = '/__mkd-precache-index';
const NETWORK_TIMEOUT_MS = 4000;
const PARALLEL = 6;

/** One key per page: no query, no trailing slash ("/hi/" and "/hi" are one page). */
function keyOf(url) {
  const u = new URL(url, self.location.origin);
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
  return u.origin + path;
}

const isPage = (url) => !/\.[a-z0-9]+$/i.test(new URL(url).pathname) || url.endsWith('.html');
const skip = (url) => /^\/(api|admin)(\/|$)/.test(new URL(url).pathname) || url.endsWith('/sw.js');

/**
 * A response the cache can serve to a navigation. A redirected response (a
 * host that sends /x to /x/) cannot be: the browser refuses it for a request
 * whose redirect mode is not "follow". So it is copied into a fresh one.
 */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function previousCache() {
  const names = (await caches.keys()).filter((n) => n.startsWith('mkd-') && n !== CACHE);
  if (!names.length) return null;
  const cache = await caches.open(names.at(-1));
  const index = await cache.match(INDEX_KEY);
  return { cache, revs: index ? await index.json() : {} };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const old = await previousCache();
      const saveData = !!self.navigator.connection?.saveData;
      const list = saveData ? PRECACHE.filter(([url]) => !isPage(self.location.origin + url)) : PRECACHE;
      const revs = {};
      let next = 0;
      async function worker() {
        while (next < list.length) {
          const [url, rev] = list[next++];
          const key = keyOf(url);
          try {
            const kept = old && old.revs[key] === rev ? await old.cache.match(key) : undefined;
            if (kept) {
              await cache.put(key, kept);
            } else {
              const res = await fetch(url, { cache: 'no-cache' });
              if (!res.ok) continue;
              await cache.put(key, await clean(res));
            }
            revs[key] = rev;
          } catch {
            // One file that fails to download must not stop the rest from
            // being offline; it will be cached when it is next visited.
          }
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      await cache.put(INDEX_KEY, new Response(JSON.stringify(revs), { headers: { 'content-type': 'application/json' } }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('mkd-') && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** Network first; the cached copy when it is down or slower than NETWORK_TIMEOUT_MS. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const key = keyOf(event.request.url);
  const network = fetch(event.request).then(async (res) => {
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(key, await clean(res.clone()));
    }
    return res;
  });
  // The cache update finishes even if the timeout below already answered.
  event.waitUntil(network.catch(() => {}));
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      return await network; // Slow but not down: better late than an error.
    } catch {
      return (await cache.match(keyOf('/404.html'))) ?? Response.error();
    }
  }
}

/** A file opened in the tab, not a page: the network, else a cached copy, else a plain error. */
async function file(request) {
  try {
    return await fetch(request);
  } catch {
    return (await (await caches.open(CACHE)).match(keyOf(request.url))) ?? Response.error();
  }
}

async function hashed(request) {
  const cache = await caches.open(CACHE);
  const key = keyOf(request.url);
  const cached = await cache.match(key);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) await cache.put(key, res.clone());
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const key = keyOf(event.request.url);
  const cached = await cache.match(key);
  const network = fetch(event.request).then(async (res) => {
    if (res.ok && res.type === 'basic') await cache.put(key, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || skip(request.url)) return;
  // Range requests (media) are not cached whole; leave them to the network.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') return event.respondWith(isPage(request.url) ? page(event) : file(request));
  if (url.pathname.startsWith('/_astro/')) return event.respondWith(hashed(request));
  event.respondWith(staleWhileRevalidate(event));
});
