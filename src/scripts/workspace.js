/**
 * Time-savers around a converter, without touching how it converts:
 *
 *  - the input survives a refresh (a draft per tool, saved as you type);
 *  - "Recent": the last 10 texts converted with this tool, one click to bring
 *    one back, "Delete all" to forget them;
 *  - keyboard shortcuts: Ctrl+Enter copies the output, Ctrl+Shift+C copies it
 *    as Unicode, Esc (in the text box) clears.
 *
 * Everything is kept in this browser's localStorage and nowhere else, and
 * every access is guarded: with storage blocked the tool works exactly as it
 * did, it just forgets on reload.
 *
 * The converter is driven only through its own controls and events: restoring
 * a text sets the input box and fires `input`, exactly as typing would, and
 * the shortcuts click the page's own buttons.
 */
import { addRecent, sanitizeRecent, preview, draftKey, recentKey, MAX_CHARS } from '../lib/recent.js';
import { toast } from './toast.js';

const SAVE_MS = 300;
/** A pause this long after typing counts as "done with this text" for Recent. */
const SETTLE_MS = 4000;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked or full: not remembered, nothing else changes.
  }
}

/**
 * @param {HTMLElement} root the converter card
 * @param {string} tool storage id, e.g. "unicode-kruti-dev"
 * @param {{ copy: string, unicode?: string, clear?: string }} roles
 *   data-role names of the buttons the shortcuts press
 */
export function workspace(root, tool, roles) {
  const input = /** @type {HTMLTextAreaElement} */ (root.querySelector('[data-role="input"]'));
  const panel = root.querySelector('[data-recent]');
  if (!input) return;
  const L = JSON.parse(panel?.getAttribute('data-i18n') || '{}');
  const lang = document.documentElement.lang || 'en';

  // ---------------------------------------------------------------- Draft
  const saved = load(draftKey(tool), null);
  if (typeof saved === 'string' && saved && !input.value) input.value = saved;

  let saveTimer;
  const saveDraft = () => {
    clearTimeout(saveTimer);
    const v = input.value;
    store(draftKey(tool), v && v.length <= MAX_CHARS ? v : null);
  };
  input.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, SAVE_MS);
  });
  // A tab closed mid-debounce still keeps the last keystrokes.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveDraft();
  });
  window.addEventListener('pagehide', saveDraft);

  // --------------------------------------------------------------- Recent
  let list = sanitizeRecent(load(recentKey(tool), []));
  const listEl = panel?.querySelector('[data-recent-list]');
  const emptyEl = panel?.querySelector('[data-recent-empty]');
  const countEl = panel?.querySelector('[data-recent-count]');
  const clearAll = panel?.querySelector('[data-recent-clear]');
  const rtf = typeof Intl.RelativeTimeFormat === 'function' ? new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }) : null;

  function ago(at) {
    if (!rtf || !at) return '';
    const s = Math.round((at - Date.now()) / 1000);
    const [n, unit] =
      Math.abs(s) < 60 ? [0, 'second'] : Math.abs(s) < 3600 ? [Math.round(s / 60), 'minute'] : Math.abs(s) < 86400 ? [Math.round(s / 3600), 'hour'] : [Math.round(s / 86400), 'day'];
    return unit === 'second' ? rtf.format(0, 'second') : rtf.format(n, unit);
  }

  function draw() {
    if (!panel || !listEl) return;
    if (countEl) countEl.textContent = String(list.length);
    listEl.textContent = '';
    listEl.hidden = list.length === 0;
    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (clearAll) clearAll.hidden = list.length === 0;
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cv-recent-item';
      b.dataset.restore = String(i);
      const text = document.createElement('span');
      text.className = 'cv-recent-text';
      text.setAttribute('translate', 'no');
      text.textContent = preview(entry.text);
      const meta = document.createElement('span');
      meta.className = 'cv-recent-meta';
      meta.textContent = `${ago(entry.at)} · ${L.restore ?? ''}`;
      b.append(text, meta);
      li.append(b);
      listEl.append(li);
    });
  }

  function remember() {
    const next = addRecent(list, input.value, Date.now());
    if (next === list) return;
    list = next;
    store(recentKey(tool), list);
    draw();
  }

  let settleTimer;
  input.addEventListener('input', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(remember, SETTLE_MS);
  });

  listEl?.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement | null} */ (e.target)?.closest?.('[data-restore]');
    if (!b) return;
    const entry = list[Number(b.dataset.restore)];
    if (!entry) return;
    input.value = entry.text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    saveDraft();
    input.focus();
    toast(L.restored ?? '', { announce: true });
  });

  clearAll?.addEventListener('click', () => {
    list = [];
    store(recentKey(tool), null);
    draw();
    toast(L.deleted ?? '', { announce: true });
    panel?.querySelector('summary')?.focus();
  });

  // Using a result - copying, downloading, sharing - is the clearest sign a
  // text is worth keeping. Bubble phase: the tool's own handler runs first.
  const USE = new Set(['copy', 'copy-raw', 'copy-unicode', 'docx', 'docx-unicode', 'whatsapp']);
  root.addEventListener('click', (e) => {
    const role = /** @type {HTMLElement | null} */ (e.target)?.closest?.('[data-role]')?.getAttribute('data-role');
    if (role && USE.has(role)) remember();
    // "Try example" replaces the text without an input event.
    if (role === 'sample') saveDraft();
  });
  // Clear keeps what it clears in Recent - Clear (and Esc) can be undone.
  // Capture phase, so this reads the text before the tool empties the box.
  root.addEventListener(
    'click',
    (e) => {
      const role = /** @type {HTMLElement | null} */ (e.target)?.closest?.('[data-role]')?.getAttribute('data-role');
      if (role !== (roles.clear ?? 'clear')) return;
      clearTimeout(settleTimer);
      clearTimeout(saveTimer);
      remember();
      store(draftKey(tool), null);
    },
    true,
  );

  draw();

  // ------------------------------------------------------------ Shortcuts
  const press = (role) => {
    const b = role ? /** @type {HTMLElement | null} */ (root.querySelector(`[data-role="${role}"]`)) : null;
    if (!b) return false;
    b.click();
    return true;
  };

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const active = /** @type {HTMLElement | null} */ (document.activeElement);
    const inRoot = !!active && root.contains(active);
    // Another form on the page (the feedback panel) keeps its own keys.
    const elsewhere =
      !!active && !inRoot && (active.matches('input, textarea, select, [contenteditable="true"]') || !!active.closest('[role="dialog"]'));
    if (elsewhere) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key === 'Enter') {
      if (press(roles.copy)) e.preventDefault();
    } else if (mod && e.shiftKey && !e.altKey && (e.key === 'C' || e.key === 'c')) {
      if (press(roles.unicode ?? roles.copy)) e.preventDefault();
    } else if (e.key === 'Escape' && active === input && input.value) {
      e.preventDefault();
      press(roles.clear ?? 'clear');
    }
  });
}
