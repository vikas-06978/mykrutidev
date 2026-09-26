/**
 * The typing tutor's "Your progress" panel, badges and result card - the
 * browser half of src/lib/habit.js. Everything is read from and written to
 * this device's localStorage only, every access guarded.
 */
import {
  HABIT_KEY,
  sanitize,
  emptyHabit,
  recordSession,
  currentStreak,
  practisedToday,
  practiceMinutes,
  dayKey,
} from '../lib/habit.js';
import { fill } from '../i18n/fill.js';
import { toast } from './toast.js';

const SVG = 'http://www.w3.org/2000/svg';
const CHART_H = 160;

export function readHabit() {
  try {
    const raw = localStorage.getItem(HABIT_KEY);
    return raw ? sanitize(JSON.parse(raw)) : emptyHabit();
  } catch {
    return emptyHabit();
  }
}

function writeHabit(h) {
  try {
    localStorage.setItem(HABIT_KEY, JSON.stringify(h));
  } catch {
    // Remembered for this visit only.
  }
}

/**
 * @param {HTMLElement | null} panel [data-tutor-progress]
 * @param {Record<string, any>} L the tutor's strings
 */
export function progressPanel(panel, L) {
  let habit = readHabit();
  const p = (name) => /** @type {HTMLElement | null} */ (panel?.querySelector(`[data-p="${name}"]`) ?? null);
  const nf = new Intl.NumberFormat(document.documentElement.lang || 'en');

  /**
   * @param {{ lessonsDone: number, lessonsTotal: number, legacyBest: number }} ctx
   */
  function render(ctx) {
    if (!panel) return;
    const today = dayKey();
    const streak = currentStreak(habit.streak, today);
    p('streak').textContent = nf.format(streak);
    p('streak-note').textContent = practisedToday(habit.streak, today)
      ? L.pStreakDone
      : streak > 0
        ? L.pStreakKeep
        : L.pStreakStart;
    const best = Math.max(habit.bestWpm, ctx.legacyBest);
    p('best').textContent = best ? nf.format(best) : '–';
    p('acc').textContent = habit.bestAcc ? `${nf.format(habit.bestAcc)}%` : '–';
    p('lessons').textContent = `${nf.format(ctx.lessonsDone)} / ${nf.format(ctx.lessonsTotal)}`;
    p('minutes').textContent = nf.format(practiceMinutes(habit));
    for (const b of panel.querySelectorAll('[data-badge]')) {
      const on = habit.badges.includes(/** @type {HTMLElement} */ (b).dataset.badge);
      b.setAttribute('data-earned', String(on));
      b.setAttribute('title', on ? L.badgeEarned : L.badgeLocked);
    }
    drawChart();
  }

  // ------------------------------------------------------------------ Chart
  // One series, so no legend: the caption names it. Brick line, 2px, dots at
  // 8px, recessive grid; hover or tap shows the session under the pointer.
  const box = p('chart');
  const empty = p('chart-empty');
  let tip = null;

  function drawChart() {
    if (!box) return;
    box.querySelector('svg')?.remove();
    box.querySelector('.tt-chart-tip')?.remove();
    box.querySelector('table')?.remove();
    const pts = habit.sessions;
    if (empty) empty.hidden = pts.length > 0;
    p('chart-title').textContent = fill(L.pChartTitle, { n: Math.max(pts.length, 1) });
    if (pts.length === 0) return;

    const W = Math.max(box.clientWidth, 200);
    const pad = { l: 34, r: 14, t: 12, b: 22 };
    const max = Math.max(10, Math.ceil(Math.max(...pts.map((s) => s.wpm)) / 10) * 10);
    const x = (i) => pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (pts.length - 1));
    const y = (v) => pad.t + (1 - v / max) * (CHART_H - pad.t - pad.b);

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${CHART_H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(CHART_H));
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      fill(L.pChartAria, {
        n: pts.length,
        first: pts[0].wpm,
        last: pts.at(-1).wpm,
        best: Math.max(...pts.map((s) => s.wpm)),
      }),
    );
    const el = (name, attrs) => {
      const n = document.createElementNS(SVG, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.append(n);
      return n;
    };
    // Grid at 0, half and max, with their values.
    for (const v of [0, max / 2, max]) {
      el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'tt-chart-grid' });
      const t = el('text', { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tt-chart-axis' });
      t.textContent = String(v);
    }
    const guide = el('line', { x1: 0, x2: 0, y1: pad.t, y2: CHART_H - pad.b, class: 'tt-chart-guide', visibility: 'hidden' });
    if (pts.length > 1) {
      el('polyline', { points: pts.map((s, i) => `${x(i)},${y(s.wpm)}`).join(' '), class: 'tt-chart-line' });
    }
    const dots = pts.map((s, i) => el('circle', { cx: x(i), cy: y(s.wpm), r: 4, class: 'tt-chart-dot' }));
    // Only the latest value is labelled directly; the rest are on hover.
    const last = el('text', { x: x(pts.length - 1), y: y(pts.at(-1).wpm) - 10, 'text-anchor': 'middle', class: 'tt-chart-label' });
    last.textContent = String(pts.at(-1).wpm);
    box.append(svg);

    tip = document.createElement('div');
    tip.className = 'tt-chart-tip';
    tip.hidden = true;
    box.append(tip);

    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = clientX - r.left;
      let i = 0;
      for (let k = 1; k < pts.length; k++) if (Math.abs(x(k) - px) < Math.abs(x(i) - px)) i = k;
      const s = pts[i];
      guide.setAttribute('x1', String(x(i)));
      guide.setAttribute('x2', String(x(i)));
      guide.setAttribute('visibility', 'visible');
      dots.forEach((d, k) => d.setAttribute('r', k === i ? '6' : '4'));
      tip.textContent = `${s.d} · ${s.wpm} WPM · ${s.acc}%`;
      tip.hidden = false;
      const left = Math.min(Math.max(x(i) - tip.offsetWidth / 2, 0), W - tip.offsetWidth);
      tip.style.transform = `translate(${left}px, 0)`;
    };
    const hide = () => {
      guide.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('r', '4'));
      tip.hidden = true;
    };
    svg.addEventListener('pointermove', (e) => show(e.clientX));
    svg.addEventListener('pointerdown', (e) => show(e.clientX));
    svg.addEventListener('pointerleave', hide);

    // The same numbers as a table, for screen readers.
    const table = document.createElement('table');
    table.className = 'sr-only';
    const rows = pts.map((s) => `<tr><td>${s.d}</td><td>${s.wpm}</td><td>${s.acc}%</td></tr>`).join('');
    table.innerHTML = `<tr><th>${L.time}</th><th>${L.wpm}</th><th>${L.accuracy}</th></tr>${rows}`;
    box.append(table);
  }

  if (box && 'ResizeObserver' in window) {
    let w = box.clientWidth;
    new ResizeObserver(() => {
      if (box.clientWidth !== w) {
        w = box.clientWidth;
        drawChart();
      }
    }).observe(box);
  }

  // ----------------------------------------------------------- Celebration
  function celebrate(ids) {
    if (!ids.length) return;
    const names = ids.map((id) => L.badges?.[id] ?? id);
    const pop = document.createElement('div');
    pop.className = 'mkd-badge-pop';
    pop.setAttribute('role', 'status');
    const star = document.createElement('span');
    star.className = 'mkd-badge-star';
    star.setAttribute('aria-hidden', 'true');
    star.innerHTML =
      '<svg viewBox="0 0 20 20" width="22" height="22"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.8l5-.7z" fill="currentColor"/></svg>';
    const text = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = L.badgeEarned;
    text.append(strong, document.createElement('br'), names.join(' · '));
    pop.append(star, text);
    // A few sparks around the star; CSS removes them under reduced motion.
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('i');
      s.className = 'mkd-spark';
      s.style.setProperty('--a', `${i * 60}deg`);
      star.append(s);
    }
    document.body.append(pop);
    setTimeout(() => pop.remove(), 3200);
    for (const id of ids) panel?.querySelector(`[data-badge="${id}"]`)?.setAttribute('data-new', 'true');
  }

  return {
    render,
    /**
     * @param {Parameters<typeof recordSession>[1]} session
     * @param {{ lessonsDone: number, lessonsTotal: number, legacyBest: number }} ctx
     */
    record(session, ctx) {
      const r = recordSession(habit, session, dayKey(), ctx);
      habit = r.habit;
      writeHabit(habit);
      render(ctx);
      celebrate(r.earned);
      return r.earned;
    },
    get habit() {
      return habit;
    },
    reset(ctx) {
      habit = emptyHabit();
      try {
        localStorage.removeItem(HABIT_KEY);
      } catch {
        // Nothing stored, or storage blocked: nothing to erase.
      }
      render(ctx);
      toast(L.resetDone, { announce: true });
    },
  };
}

// --------------------------------------------------------------- Result card

/** Colours of the current theme, so the card matches what the typist sees. */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    paper: v('--color-paper', '#faf7f2'),
    surface: v('--color-surface', '#ffffff'),
    ink: v('--color-ink', '#1a2744'),
    body: v('--color-body', '#46536b'),
    brick: v('--color-brick', '#a8442a'),
    onBrick: v('--color-on-brick', '#ffffff'),
    hairline: v('--color-hairline', '#e5ded3'),
  };
}

/**
 * Draw the result as a 1080×1080 PNG. Devanagari is drawn with the page's
 * own Noto Sans Devanagari, loaded first so the canvas never falls back.
 */
async function drawCard({ wpm, acc, L }) {
  const deva = '"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif';
  try {
    await Promise.all([document.fonts.load(`600 60px ${deva}`, 'हिंदी'), document.fonts.load(`400 40px ${deva}`, 'हिंदी')]);
  } catch {
    // The system Devanagari font will do.
  }
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  const col = palette();
  const sans = `${deva}, system-ui, sans-serif`;

  g.fillStyle = col.paper;
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = col.brick;
  g.fillRect(0, 0, 1080, 18);
  // Faint क, as on the site's social images.
  g.globalAlpha = 0.07;
  g.fillStyle = col.brick;
  g.font = `600 720px ${deva}`;
  g.textAlign = 'right';
  g.fillText('क', 1120, 1180);
  g.globalAlpha = 1;

  g.textAlign = 'left';
  g.fillStyle = col.ink;
  g.font = `600 64px ${sans}`;
  g.fillText('My', 90, 150);
  const my = g.measureText('My').width;
  g.fillStyle = col.brick;
  g.fillText('Kruti', 90 + my, 150);
  const kruti = g.measureText('Kruti').width;
  g.fillStyle = col.ink;
  g.fillText('Dev', 90 + my + kruti, 150);

  g.fillStyle = col.brick;
  g.font = `600 300px ${sans}`;
  g.fillText(String(wpm), 80, 520);
  const big = g.measureText(String(wpm)).width;
  g.fillStyle = col.ink;
  g.font = `600 90px ${sans}`;
  g.fillText('WPM', 110 + big, 520);

  g.fillStyle = col.body;
  g.font = `400 52px ${sans}`;
  g.fillText(fill(L.shareAcc, { acc }), 90, 610);

  // The sentence, wrapped to the card.
  g.fillStyle = col.ink;
  g.font = `600 58px ${sans}`;
  const words = fill(L.shareText, { wpm }).split(' ');
  let line = '';
  let yy = 760;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > 900 && line) {
      g.fillText(line, 90, yy);
      line = w;
      yy += 84;
    } else line = next;
  }
  g.fillText(line, 90, yy);

  g.fillStyle = col.hairline;
  g.fillRect(90, 950, 900, 2);
  g.fillStyle = col.body;
  g.font = `400 38px ${sans}`;
  g.fillText(L.shareSub, 90, 1010);

  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('toBlob'))), 'image/png'));
}

/**
 * Share the result image through the device's share sheet (WhatsApp is in
 * it), or download it where Web Share cannot carry files.
 */
export async function shareResult({ wpm, acc, L }) {
  const blob = await drawCard({ wpm, acc, L });
  const file = new File([blob], `mykrutidev-${wpm}-wpm.png`, { type: 'image/png' });
  const text = `${fill(L.shareText, { wpm })} - https://mykrutidev.com`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if (/** @type {Error} */ (err)?.name === 'AbortError') return 'cancelled';
      // Share sheet failed: fall through to the download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(L.shareSaved, { announce: true, ms: 3200 });
  return 'downloaded';
}
