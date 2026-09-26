import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BADGES,
  MAX_SESSIONS,
  dayKey,
  daysBetween,
  emptyHabit,
  sanitize,
  practise,
  currentStreak,
  recordSession,
  dailyIndex,
  practiceMinutes,
} from './habit.js';
import { addRecent, sanitizeRecent, preview, MAX_RECENT, MAX_CHARS } from './recent.js';

const CTX = { lessonsDone: 0, lessonsTotal: 12 };
const run = (over = {}) => ({ mode: 'practice', wpm: 25, acc: 96, ms: 60_000, typed: 150, ranked: true, ...over });

/** Practise once on each of `days`, in order. */
function streakOver(days) {
  let s = emptyHabit().streak;
  for (const d of days) s = practise(s, d);
  return s;
}

describe('dates', () => {
  test('dayKey is the local calendar date', () => {
    assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  });

  test('daysBetween counts calendar days across months, years and leap days', () => {
    assert.equal(daysBetween('2026-09-26', '2026-09-27'), 1);
    assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
    assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
    assert.equal(daysBetween('2028-02-28', '2028-02-29'), 1);
    assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
    assert.equal(daysBetween('2026-09-27', '2026-09-26'), -1);
  });

  test('a DST change is still exactly one day (dates, not timestamps)', () => {
    // Europe/US clocks change on these dates; the keys are plain dates.
    assert.equal(daysBetween('2026-03-28', '2026-03-29'), 1);
    assert.equal(daysBetween('2026-10-24', '2026-10-25'), 1);
    assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1);
  });
});

describe('streak across dates', () => {
  test('first practice starts a streak of one', () => {
    assert.deepEqual(streakOver(['2026-09-26']), { last: '2026-09-26', count: 1, best: 1 });
  });

  test('practising twice on one day counts once', () => {
    const s = streakOver(['2026-09-26', '2026-09-26', '2026-09-26']);
    assert.equal(s.count, 1);
  });

  test('consecutive days grow the streak, across a month and a year end', () => {
    const s = streakOver(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    assert.equal(s.count, 5);
    assert.equal(s.best, 5);
    assert.equal(s.last, '2027-01-02');
  });

  test('a missed day starts again at one, and the best is kept', () => {
    const s = streakOver(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05']);
    assert.equal(s.count, 1);
    assert.equal(s.best, 3);
  });

  test('a clock set back does not move or reset the streak', () => {
    const before = streakOver(['2026-09-25', '2026-09-26']);
    assert.deepEqual(practise(before, '2026-09-20'), before);
  });

  test('seven days in a row reaches seven', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-09-${String(20 + i).padStart(2, '0')}`);
    assert.equal(streakOver(days).count, 7);
  });

  test('the shown streak is alive today and tomorrow, gone the day after', () => {
    const s = streakOver(['2026-09-25', '2026-09-26']);
    assert.equal(currentStreak(s, '2026-09-26'), 2);
    assert.equal(currentStreak(s, '2026-09-27'), 2);
    assert.equal(currentStreak(s, '2026-09-28'), 0);
    assert.equal(currentStreak(emptyHabit().streak, '2026-09-26'), 0);
  });
});

describe('recordSession', () => {
  test('adds the session, minutes and streak', () => {
    const { habit } = recordSession(emptyHabit(), run(), '2026-09-26', CTX);
    assert.equal(habit.sessions.length, 1);
    assert.equal(habit.totalMs, 60_000);
    assert.equal(practiceMinutes(habit), 1);
    assert.equal(habit.bestWpm, 25);
    assert.equal(habit.streak.count, 1);
  });

  test('a false start is not practice', () => {
    const { habit } = recordSession(emptyHabit(), run({ typed: 3 }), '2026-09-26', CTX);
    assert.deepEqual(habit, emptyHabit());
  });

  test('an unranked (submitted early) speed is logged but is never a best', () => {
    const { habit, earned } = recordSession(emptyHabit(), run({ wpm: 90, ranked: false }), '2026-09-26', CTX);
    assert.equal(habit.sessions[0].wpm, 90);
    assert.equal(habit.bestWpm, 0);
    assert.ok(!earned.includes('wpm-20'));
  });

  test('keeps only the last 30 sessions', () => {
    let h = emptyHabit();
    for (let i = 0; i < MAX_SESSIONS + 5; i++) h = recordSession(h, run({ wpm: i }), '2026-09-26', CTX).habit;
    assert.equal(h.sessions.length, MAX_SESSIONS);
    assert.equal(h.sessions[0].wpm, 5);
    assert.equal(h.sessions.at(-1).wpm, MAX_SESSIONS + 4);
  });

  test('badges: speed milestones, once each', () => {
    let r = recordSession(emptyHabit(), run({ wpm: 31 }), '2026-09-26', CTX);
    assert.deepEqual(r.earned, ['wpm-20', 'wpm-30']);
    r = recordSession(r.habit, run({ wpm: 45 }), '2026-09-26', CTX);
    assert.deepEqual(r.earned, ['wpm-40']);
    r = recordSession(r.habit, run({ wpm: 50 }), '2026-09-26', CTX);
    assert.deepEqual(r.earned, []);
  });

  test('badges: first lesson, all lessons and a 7-day streak', () => {
    let r = recordSession(emptyHabit(), run({ mode: 'lesson', wpm: 5 }), '2026-09-20', { lessonsDone: 1, lessonsTotal: 2 });
    assert.deepEqual(r.earned, ['first-lesson']);
    r = recordSession(r.habit, run({ mode: 'lesson', wpm: 5 }), '2026-09-21', { lessonsDone: 2, lessonsTotal: 2 });
    assert.deepEqual(r.earned, ['all-lessons']);
    let h = r.habit;
    for (let d = 22; d <= 26; d++) {
      r = recordSession(h, run({ wpm: 5 }), `2026-09-${d}`, { lessonsDone: 2, lessonsTotal: 2 });
      h = r.habit;
    }
    assert.deepEqual(r.earned, ['streak-7']);
    assert.equal(h.streak.count, 7);
  });

  test("a completed daily passage marks today's practice done", () => {
    const { habit } = recordSession(emptyHabit(), run({ mode: 'daily', complete: true }), '2026-09-26', CTX);
    assert.equal(habit.dailyDone, '2026-09-26');
  });

  test('every badge has an id the panel can name', () => {
    assert.deepEqual(
      BADGES.map((b) => b.id),
      ['first-lesson', 'wpm-20', 'wpm-30', 'wpm-40', 'streak-7', 'all-lessons'],
    );
  });
});

describe('sanitize', () => {
  test('junk becomes an empty record', () => {
    for (const junk of [null, 'x', 42, [], { sessions: 'no' }]) {
      assert.deepEqual(sanitize(junk).sessions, []);
    }
  });

  test('bad fields are dropped, good ones kept', () => {
    const h = sanitize({
      sessions: [{ d: '2026-09-26', mode: 'practice', wpm: 30, acc: 97, ms: 1000 }, { d: 'x', mode: 'practice' }, { d: '2026-09-26', mode: 'hack' }],
      bestWpm: 99999,
      streak: { last: '2026-09-26', count: 4, best: 2 },
      badges: ['wpm-20', 'made-up', 'wpm-20'],
      dailyDone: 'yesterday',
    });
    assert.equal(h.sessions.length, 1);
    assert.equal(h.bestWpm, 0);
    assert.deepEqual(h.streak, { last: '2026-09-26', count: 4, best: 4 });
    assert.deepEqual(h.badges, ['wpm-20']);
    assert.equal(h.dailyDone, null);
  });

  test('round-trips through JSON', () => {
    const { habit } = recordSession(emptyHabit(), run(), '2026-09-26', CTX);
    assert.deepEqual(sanitize(JSON.parse(JSON.stringify(habit))), habit);
  });
});

describe("today's practice", () => {
  test('the same date gives the same passage, for everyone', () => {
    assert.equal(dailyIndex('2026-09-26', 17), dailyIndex('2026-09-26', 17));
  });

  test('it changes from day to day and stays in range', () => {
    const seen = new Set();
    for (let d = 1; d <= 28; d++) {
      const i = dailyIndex(`2026-02-${String(d).padStart(2, '0')}`, 17);
      assert.ok(i >= 0 && i < 17);
      seen.add(i);
    }
    assert.ok(seen.size >= 8, `only ${seen.size} different passages in four weeks`);
  });
});

describe('recent conversions', () => {
  test('newest first, capped at 10', () => {
    let list = [];
    for (let i = 0; i < 15; i++) list = addRecent(list, `text ${i} abc`, i);
    assert.equal(list.length, MAX_RECENT);
    assert.equal(list[0].text, 'text 14 abc');
  });

  test('typing the same text further replaces the shorter version', () => {
    let list = addRecent([], 'नम', 1);
    list = addRecent(list, 'नमस्ते', 2);
    list = addRecent(list, 'नमस्ते दुनिया', 3);
    assert.deepEqual(list.map((e) => e.text), ['नमस्ते दुनिया']);
  });

  test('deleting back keeps the longer text', () => {
    let list = addRecent([], 'नमस्ते दुनिया', 1);
    list = addRecent(list, 'नमस्ते', 2);
    assert.deepEqual(list.map((e) => e.text), ['नमस्ते दुनिया']);
    assert.equal(list[0].at, 2);
  });

  test('blank and oversized texts are not kept', () => {
    assert.deepEqual(addRecent([], '   ', 1), []);
    assert.deepEqual(addRecent([], 'x'.repeat(MAX_CHARS + 1), 1), []);
  });

  test('stored junk is filtered', () => {
    assert.deepEqual(sanitizeRecent('x'), []);
    assert.deepEqual(sanitizeRecent([{ text: 'ok', at: 5 }, { text: '' }, null, { text: 3 }]), [{ text: 'ok', at: 5 }]);
  });

  test('preview collapses whitespace and cuts long text', () => {
    assert.equal(preview('a\n\n  b'), 'a b');
    assert.equal(preview('abcdef', 3), 'abc…');
  });
});
