/**
 * Cloudflare Turnstile (invisible), shared by the feedback panel and the
 * /links request form. Fetched only once one of them is opened, and only when
 * the server says a site key is configured (GET /api/feedback). The script is
 * loaded once per page however many forms use it.
 */
const CONFIG = '/api/feedback';
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let config = null;
function loadConfig() {
  config ??= fetch(CONFIG, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok && /json/.test(r.headers.get('Content-Type') ?? '') ? r.json() : null))
    .catch(() => null);
  return config;
}

let script = null;
function loadScript() {
  script ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = TURNSTILE_JS;
    s.async = true;
    s.onload = resolve;
    s.onerror = resolve;
    document.head.append(s);
  });
  return script;
}

/**
 * Run the invisible check in `el`. Resolves to null when there is no site key
 * (local dev, a preview) or the script could not load; the server then decides.
 * @returns {Promise<{ token: () => Promise<string | undefined>, reset: () => void } | null>}
 */
export async function challenge(el, lang) {
  const sitekey = (await loadConfig())?.turnstileSiteKey;
  if (!sitekey) return null;
  await loadScript();
  if (!window.turnstile) return null;
  const state = { token: null };
  const id = window.turnstile.render(el, {
    sitekey,
    // Turnstile speaks English and Hindi but not Bengali, Tamil, ...: for
    // those it picks from the browser.
    language: lang === 'en' || lang === 'hi' ? lang : 'auto',
    appearance: 'interaction-only',
    'refresh-expired': 'auto',
    callback: (t) => (state.token = t),
    'expired-callback': () => (state.token = null),
    'error-callback': () => (state.token = null),
  });
  return {
    /** The token, waiting a few seconds for the check if it is still running. */
    async token() {
      for (let i = 0; i < 40 && !state.token; i++) await new Promise((r) => setTimeout(r, 200));
      return state.token ?? undefined;
    },
    reset() {
      state.token = null;
      window.turnstile.reset(id);
    },
  };
}
