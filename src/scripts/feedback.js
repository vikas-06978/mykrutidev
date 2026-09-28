/**
 * The feedback panel. Loaded on idle or on the first press of the button
 * (Feedback.astro), never on first paint; it opens ONLY from that button.
 *
 * Four short steps: a rating (one tap moves on), what was used, what to add
 * next, then an optional message and email. Keyboard alone works throughout:
 * Tab / Space / Enter, Esc or ✕ closes and gives focus back to the button.
 *
 * Sent: the picks, the panel's own text boxes, and the non-personal context
 * in CONTEXT_FIELDS. Never anything from the tools on the page.
 */
// ?inline: the CSS travels inside this lazy chunk. A plain import would be
// hoisted by Astro into every page's inline stylesheet.
import css from '../styles/feedback.css?inline';
import { LIMITS, QUIET_DAYS, SENT_KEY, THEMES, browserName } from '../lib/feedback.js';
import { challenge } from './turnstile.js';

const ENDPOINT = '/api/feedback';
const STEPS = 4;

let panel = null;
let ui = null;

function storage(fn) {
  try {
    return fn(localStorage);
  } catch {
    return null;
  }
}

/** Sent within the last QUIET_DAYS? Then say thanks instead of asking again. */
export function sentRecently(now = Date.now()) {
  const at = Number(storage((s) => s.getItem(SENT_KEY)));
  return !!at && now - at < QUIET_DAYS * 864e5;
}

// ---------------------------------------------------------------------------
// Context: what the page can tell us without asking - and nothing personal.
// ---------------------------------------------------------------------------
export function context() {
  const root = document.documentElement;
  const theme = root.dataset.theme;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  return {
    page: /^\/[a-z0-9\-/]*$/.test(path) ? path.slice(0, 200) : '/',
    lang: root.lang === 'hi' ? 'hi' : 'en',
    theme: THEMES.includes(theme) ? theme : 'light',
    device: matchMedia('(max-width: 767px), (pointer: coarse)').matches ? 'mobile' : 'desktop',
    width: Math.max(0, Math.min(10000, Math.round(innerWidth))),
    browser: browserName(navigator.userAgent),
  };
}

// ---------------------------------------------------------------------------
// Turnstile (invisible): src/scripts/turnstile.js. Started once the panel is open.
// ---------------------------------------------------------------------------
let turnstile = null; // Promise of the check, or of null when there is none

const turnstileToken = async () => (await turnstile)?.token();
const resetTurnstile = () => void turnstile?.then((t) => t?.reset());

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
/**
 * @returns {Promise<'ok' | 'offline' | 'rate' | 'email' | 'error'>}
 *   'offline': there is no API here (local dev, a static preview). The
 *   feedback goes to the console and the visitor is thanked as usual.
 */
export async function send(payload, fetchImpl = fetch) {
  let r;
  try {
    r = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    r = null;
  }
  const json = r && /json/.test(r.headers.get('Content-Type') ?? '') ? await r.json().catch(() => null) : null;
  if (!json) {
    const { website, token, ...shown } = payload;
    void website;
    void token;
    console.info('[feedback] No feedback API here (local dev?) - not saved. It would have sent:', shown);
    return 'offline';
  }
  if (json.ok) return 'ok';
  if (r.status === 429) return 'rate';
  if (json.error === 'invalid' && json.details?.some((d) => d.startsWith('email'))) return 'email';
  return 'error';
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
function build(btn) {
  const tpl = document.getElementById('fb-template');
  const L = JSON.parse(tpl.dataset.i18n);
  const node = tpl.content.firstElementChild.cloneNode(true);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  btn.after(node);
  const $ = (sel) => node.querySelector(sel);
  const $$ = (sel) => [...node.querySelectorAll(sel)];

  const form = $('[data-fb-form]');
  const steps = $$('.fb-step');
  const count = $('[data-fb-count]');
  const thanks = $('[data-fb-thanks]');
  const err = $('[data-fb-error]');
  const bugBox = $('[data-fb-bug]');
  const msg = $('#fb-msg');
  const left = $('[data-fb-left]');
  const email = $('#fb-email');
  const sendBtn = $('[data-fb-send]');
  const lang = node.getAttribute('lang') === 'hi' ? 'hi' : 'en';

  const state = { step: 1, rating: null, busy: false };

  function reset() {
    form.reset();
    state.rating = null;
    for (const b of $$('[data-rating]')) b.setAttribute('aria-pressed', 'false');
    const pre = tpl.dataset.preUsed;
    if (pre) {
      const box = $(`input[name="used"][value="${pre}"]`);
      if (box) box.checked = true;
    }
    bugBox.hidden = true;
    thanks.hidden = true;
    err.hidden = true;
    $('[data-fb-sent-before]').hidden = !sentRecently();
    updateLeft();
    show(1, false);
  }

  function show(n, focus = true) {
    state.step = n;
    steps.forEach((s, i) => (s.hidden = i + 1 !== n));
    count.hidden = false;
    count.textContent = L.step.replace('{n}', String(n)).replace('{total}', String(STEPS));
    if (n !== 1) $('[data-fb-sent-before]').hidden = true;
    if (focus) {
      const step = steps[n - 1];
      const first =
        n === 1
          ? step.querySelector('[aria-pressed="true"]') ?? step.querySelector('[data-rating]')
          : step.querySelector('input, textarea');
      first?.focus();
    }
  }

  function updateLeft() {
    const n = LIMITS.message - [...msg.value].length;
    left.textContent = L.charsLeft.replace('{n}', String(Math.max(0, n)));
  }
  msg.addEventListener('input', updateLeft);

  for (const b of $$('[data-rating]')) {
    b.addEventListener('click', () => {
      state.rating = Number(b.dataset.rating);
      for (const o of $$('[data-rating]')) o.setAttribute('aria-pressed', String(o === b));
      show(2);
    });
  }
  for (const b of $$('[data-fb-next]')) b.addEventListener('click', () => show(state.step + 1));
  for (const b of $$('[data-fb-back]')) b.addEventListener('click', () => show(state.step - 1));

  const bug = $('input[name="wants"][value="bug"]');
  bug.addEventListener('change', () => (bugBox.hidden = !bug.checked));

  function picked(name) {
    return $$(`input[name="${name}"]:checked`).map((i) => i.value);
  }

  function fail(text, focusEl) {
    err.textContent = text;
    err.hidden = false;
    focusEl?.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    err.hidden = true;
    if (!state.rating) return show(1);
    // Enter in an earlier step moves on rather than sending half a form.
    if (state.step < STEPS) return show(state.step + 1);
    const mail = email.value.trim();
    if (mail && !email.checkValidity()) return fail(L.errorEmail, email);

    const wants = picked('wants');
    const payload = {
      rating: state.rating,
      used: picked('used'),
      wants,
      ...(wants.includes('bug') && $('#fb-bug').value.trim() ? { bugText: $('#fb-bug').value.trim() } : {}),
      ...(msg.value.trim() ? { message: msg.value.trim() } : {}),
      ...(mail ? { email: mail } : {}),
      ...context(),
      website: $('#fb-website').value,
    };
    state.busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = L.sending;
    const token = await turnstileToken();
    if (token) payload.token = token;
    const result = await send(payload);
    state.busy = false;
    sendBtn.disabled = false;
    sendBtn.textContent = L.send;
    resetTurnstile();

    if (result === 'ok' || result === 'offline') {
      storage((s) => s.setItem(SENT_KEY, String(Date.now())));
      steps.forEach((s) => (s.hidden = true));
      count.hidden = true;
      thanks.hidden = false;
      thanks.focus();
      node.dataset.sent = 'true';
    } else if (result === 'rate') fail(L.errorRate);
    else if (result === 'email') fail(L.errorEmail, email);
    else fail(L.errorGeneric);
  });

  for (const b of $$('[data-fb-close]')) b.addEventListener('click', () => close());

  return { node, reset, show, step: () => state.step, lang, turnstileEl: $('[data-fb-turnstile]') };
}

let onChange = () => {};
let opener = null;

function onKey(e) {
  if (e.key === 'Escape' && panel && !panel.hidden) {
    e.preventDefault();
    close();
  }
}

function openPanel(btn) {
  if (!ui) {
    ui = build(btn);
    panel = ui.node;
    ui.reset();
  } else if (panel.dataset.sent === 'true') {
    // A new visit to the panel after a send starts over.
    delete panel.dataset.sent;
    ui.reset();
  }
  opener = btn;
  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', onKey, true);
  onChange(true);
  // Back where the visitor left off, focus on its first control.
  ui.show(ui.step());
  turnstile ??= challenge(ui.turnstileEl, ui.lang);
}

export function close() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  opener?.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', onKey, true);
  onChange(false);
  opener?.focus();
}

/** Open or close from the button. `changed(open)` tells the button's script. */
export function toggle(btn, changed) {
  onChange = changed ?? onChange;
  if (panel && !panel.hidden) close();
  else openPanel(btn);
}
