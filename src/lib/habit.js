/**
 * The typing tutor's long-term memory: sessions, the daily streak, badges and
 * "Today's practice". Pure functions over a plain object - the tutor's client
 * script does the reading and writing (localStorage, guarded), this file only
 * decides what the new state is. That keeps every date rule testable in node
 * with fixed dates: src/lib/habit.test.js.
 *
 * Nothing here leaves the device. There is no account and no server copy; the
 * "Your progress" panel says so.
 *
 * DATES ARE LOCAL CALENDAR DAYS, written 'YYYY-MM-DD'. A streak is about the
 * days a person lives through, not UTC midnights, and comparing the strings as
 * calendar dates (never subtracting timestamps) keeps a 23- or 25-hour DST day
 * from breaking or double-counting one.
 */

/** Where the whole record lives. The lesson ladder keeps its own older key. */
export const HABIT_KEY = 'mkd-habit';
/** The chart shows this many sessions; older ones are dropped. */
export const MAX_SESSIONS = 30;
/** A session shorter than this many keystrokes is a false start, not practice. */
export const MIN_KEYSTROKES = 10;
/** A speed can never be this high; anything above it in storage is junk. */
const MAX_WPM = 400;

/**
 * The milestones, in the order they are shown. `ranked` speeds only: a run
 * submitted after four words would otherwise hand out 40 WPM for nothing.
 */
export const BADGES = [
  { id: 'first-lesson', test: (h, ctx) => ctx.lessonsDone >= 1 },
  { id: 'wpm-20', test: (h) => h.bestWpm >= 20 },
  { id: 'wpm-30', test: (h) => h.bestWpm >= 30 },
  { id: 'wpm-40', test: (h) => h.bestWpm >= 40 },
  { id: 'streak-7', test: (h) => h.streak.best >= 7 },
  { id: 'all-lessons', test: (h, ctx) => ctx.lessonsTotal > 0 && ctx.lessonsDone >= ctx.lessonsTotal },
];
const BADGE_IDS = new Set(BADGES.map((b) => b.id));

const MODES = new Set(['lesson', 'practice', 'daily', 'exam', 'passages']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A local date as 'YYYY-MM-DD'. */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Whole calendar days from `a` to `b` (both 'YYYY-MM-DD'); negative if b is earlier. */
export function daysBetween(a, b) {
  const utc = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function emptyHabit() {
  return {
    v: 1,
    sessions: [],
    totalMs: 0,
    bestWpm: 0,
    bestAcc: 0,
    streak: { last: null, count: 0, best: 0 },
    badges: [],
    dailyDone: null,
    // Today's practice, by the date whose passage it was: the best try at
    // each, for the "last days" list. { 'YYYY-MM-DD': { pct, wpm, acc } }
    daily: {},
  };
}

/** How many days of Today's practice are kept. */
export const DAILY_DAYS = 14;

/** The newest `DAILY_DAYS` entries of a daily record. */
const keepRecent = (daily) =>
  Object.fromEntries(
    Object.entries(daily)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, DAILY_DAYS),
  );

const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
};

/**
 * Whatever was in storage, made safe. An older shape, a hand edit or another
 * app on the same origin must never crash the tutor or award a badge: every
 * field is checked and anything unknown is dropped.
 */
export function sanitize(raw) {
  const h = emptyHabit();
  if (!raw || typeof raw !== 'object') return h;
  if (Array.isArray(raw.sessions)) {
    h.sessions = raw.sessions
      .filter((s) => s && typeof s === 'object' && DAY.test(s.d) && MODES.has(s.mode))
      .map((s) => ({
        d: s.d,
        mode: s.mode,
        wpm: num(s.wpm, MAX_WPM),
        acc: num(s.acc, 100),
        ms: num(s.ms, 86_400_000),
        ranked: s.ranked === true,
      }))
      .slice(-MAX_SESSIONS);
  }
  h.totalMs = num(raw.totalMs, 1e12);
  h.bestWpm = num(raw.bestWpm, MAX_WPM);
  h.bestAcc = num(raw.bestAcc, 100);
  const st = raw.streak;
  if (st && typeof st === 'object' && DAY.test(st.last)) {
    h.streak.last = st.last;
    h.streak.count = Math.floor(num(st.count, 100_000));
    h.streak.best = Math.max(h.streak.count, Math.floor(num(st.best, 100_000)));
  }
  if (Array.isArray(raw.badges)) h.badges = [...new Set(raw.badges.filter((b) => BADGE_IDS.has(b)))];
  if (DAY.test(raw.dailyDone)) h.dailyDone = raw.dailyDone;
  if (raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
    const out = {};
    for (const [d, v] of Object.entries(raw.daily)) {
      if (!DAY.test(d) || !v || typeof v !== 'object') continue;
      out[d] = { pct: Math.round(num(v.pct, 100)), wpm: num(v.wpm, MAX_WPM), acc: num(v.acc, 100) };
    }
    h.daily = keepRecent(out);
  }
  return h;
}

/**
 * The streak after practising on `today`.
 *
 * Same day again: unchanged. The day after the last one: one longer. Any gap
 * (or a clock that went backwards): a new streak of one.
 */
export function practise(streak, today) {
  const gap = streak.last ? daysBetween(streak.last, today) : Infinity;
  // Same day, or a device clock set back into the past: nothing moves, so the
  // streak cannot be farmed by changing the date to yesterday and back.
  if (gap <= 0) return streak;
  const count = gap === 1 ? streak.count + 1 : 1;
  return { last: today, count, best: Math.max(streak.best, count) };
}

/**
 * The streak to SHOW on `today`. A streak is still alive on the day after the
 * last practice - there is all of today to keep it going - and gone after that.
 */
export function currentStreak(streak, today) {
  if (!streak.last) return 0;
  const gap = daysBetween(streak.last, today);
  return gap === 0 || gap === 1 ? streak.count : 0;
}

/** Has the streak been kept today already? */
export const practisedToday = (streak, today) => streak.last === today;

/**
 * Badges newly earned by `habit`, given how far the lesson ladder has got.
 * @param {{ lessonsDone: number, lessonsTotal: number }} ctx
 */
export function newBadges(habit, ctx) {
  return BADGES.filter((b) => !habit.badges.includes(b.id) && b.test(habit, ctx)).map((b) => b.id);
}

/**
 * Add one finished session. Returns the new record and the badges it earned.
 *
 * @param {ReturnType<typeof emptyHabit>} habit
 * @param {{ mode: string, wpm: number, acc: number, ms: number, typed: number,
 *           ranked: boolean, complete?: boolean, day?: string, pct?: number }} s
 *   `ranked`: the run went the distance (a finished drill or passage, or a
 *   timed test that ran out), so its speed may count as a best.
 *   `day`, `pct`: Today's practice only - the date whose passage was typed
 *   (today, or a past day picked from the list) and how much of it.
 * @param {string} today 'YYYY-MM-DD'
 * @param {{ lessonsDone: number, lessonsTotal: number }} ctx
 */
export function recordSession(habit, s, today, ctx) {
  // A false start changes nothing - but the ladder may still have moved (a
  // lesson cleared), so badges are checked either way.
  if (!(s.typed >= MIN_KEYSTROKES) || !MODES.has(s.mode)) {
    const earned = newBadges(habit, ctx);
    return { habit: earned.length ? { ...habit, badges: [...habit.badges, ...earned] } : habit, earned };
  }

  const wpm = Math.round(num(s.wpm, MAX_WPM));
  const acc = Math.round(num(s.acc, 100));
  const ms = Math.round(num(s.ms, 86_400_000));
  const next = {
    ...habit,
    sessions: [...habit.sessions, { d: today, mode: s.mode, wpm, acc, ms, ranked: !!s.ranked }].slice(
      -MAX_SESSIONS,
    ),
    totalMs: habit.totalMs + ms,
    bestWpm: s.ranked ? Math.max(habit.bestWpm, wpm) : habit.bestWpm,
    bestAcc: s.ranked ? Math.max(habit.bestAcc, acc) : habit.bestAcc,
    streak: practise(habit.streak, today),
    dailyDone: s.mode === 'daily' && s.complete && (s.day ?? today) === today ? today : habit.dailyDone,
    daily: s.mode === 'daily' ? addDaily(habit.daily ?? {}, DAY.test(s.day) ? s.day : today, s, wpm, acc) : habit.daily,
  };
  const earned = newBadges(next, ctx);
  next.badges = [...habit.badges, ...earned];
  return { habit: next, earned };
}

/** The best try at one day's passage: the furthest, then the fastest. */
function addDaily(daily, day, s, wpm, acc) {
  const pct = s.complete ? 100 : Math.min(99, Math.round(num(s.pct, 100)));
  const old = daily[day];
  const better = !old || pct > old.pct || (pct === old.pct && wpm > old.wpm);
  return keepRecent({ ...daily, [day]: better ? { pct, wpm, acc } : old });
}

/** The `n` dates ending with `today`, newest first. */
export function lastDays(today, n) {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => dayKey(new Date(y, m - 1, d - i)));
}

/**
 * The order the passages come in, one per day: shuffled once, the same for
 * everybody, so no two days running get the same passage.
 */
function dailyOrder(count) {
  const order = Array.from({ length: count }, (_, i) => i);
  let h = 0x2545f491;
  for (let i = count - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Today's passage: the same one for everybody on the same date. The passages
 * take turns: every one comes once before any comes again, so a passage
 * returns only after `count` days. Never needs a server.
 */
export function dailyIndex(day, count) {
  if (count <= 0) return 0;
  const n = daysBetween('2026-01-01', day);
  return dailyOrder(count)[((n % count) + count) % count];
}

/** Whole minutes practised, rounded down - "1 min" only once a minute is done. */
export const practiceMinutes = (habit) => Math.floor(habit.totalMs / 60_000);
