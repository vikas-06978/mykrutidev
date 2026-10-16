/** Source-backed requirements, not certification of an official exam simulator. */
export const CHSL_HINDI_2026 = Object.freeze({
  id: 'ssc-chsl-2026-hindi',
  year: 2026,
  seconds: 600,
  eligibleSeconds: 900,
  targetWpm: 30,
  font: 'Mangal',
  verified: '2026-10-17',
  notice: 'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_chsle_2026.pdf',
  evaluation: 'https://ssc.gov.in/api/attachment/uploads/masterData/ScriptEvaluation/evaluation-dest-tt%201-169635-.pdf',
});

const punctuation = c => /\p{P}/u.test(c);
const bare = word => [...word].filter(c => !punctuation(c)).join('');
function marks(word) {
  let position = 0;
  const out = [];
  for (const c of word) {
    if (punctuation(c)) out.push(`${position}:${c}`);
    else position++;
  }
  return out;
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
// SSC excludes the capitalisation category for Hindi scripts.
const tokens = text => text.normalize('NFC').replace(/[A-Z]/g, c => c.toLowerCase()).trim().split(/\s+/u).filter(Boolean);
const missingCost = word => bare(word) ? 2 : Math.max(1, [...word].length);
const substitution = (a, b) => a === b ? 0 : bare(a) === bare(b) ? distance(marks(a), marks(b)) : 2;

/**
 * An alignment-based practice estimate using SSC's published full/half error
 * categories. Ambiguous alignments and human judgment can produce other results.
 * Deliberately no official pass/fail, error percentage or keystroke-speed claim.
 */
export function evaluateHindiPractice(reference, typed) {
  if (reference.length > 20000 || typed.length > 20000) throw new RangeError('Attempt outside practice evaluation limits');
  const a = tokens(reference), b = tokens(typed);
  if (!a.length || a.length > 1000 || b.length > 3000 || [...a, ...b].some(w => w.length > 1000)) throw new RangeError('Attempt outside practice evaluation limits');
  const width = b.length + 1;
  const cost = new Uint16Array((a.length + 1) * width);
  const operation = new Uint8Array(cost.length);
  for (let i = 1; i <= a.length; i++) { cost[i * width] = cost[(i - 1) * width] + missingCost(a[i - 1]); operation[i * width] = 2; }
  for (let j = 1; j <= b.length; j++) { cost[j] = cost[j - 1] + missingCost(b[j - 1]); operation[j] = 3; }
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const index = i * width + j;
    let best = cost[index - width - 1] + substitution(a[i - 1], b[j - 1]);
    let op = 1;
    const choose = (value, kind) => { if (value < best) { best = value; op = kind; } };
    choose(cost[index - width] + missingCost(a[i - 1]), 2);
    choose(cost[index - 1] + missingCost(b[j - 1]), 3);
    if (i > 1 && j > 1 && a[i - 2] === b[j - 1] && a[i - 1] === b[j - 2]) choose(cost[index - 2 * width - 2] + 1, 4);
    if (i > 1 && a[i - 2] + a[i - 1] === b[j - 1]) choose(cost[index - 2 * width - 1] + 1, 5);
    if (j > 1 && a[i - 1] === b[j - 2] + b[j - 1]) choose(cost[index - width - 2] + 1, 6);
    cost[index] = best; operation[index] = op;
  }
  const full = { spelling: 0, omitted: 0, added: 0 };
  const half = { punctuation: 0, spacing: 0, transposition: 0, paragraph: 0 };
  let i = a.length, j = b.length;
  while (i || j) {
    const op = operation[i * width + j];
    if (op === 1) {
      if (bare(a[i - 1]) !== bare(b[j - 1])) full.spelling++;
      else half.punctuation += substitution(a[i - 1], b[j - 1]);
      i--; j--;
    } else if (op === 2) {
      if (bare(a[i - 1])) full.omitted++; else half.punctuation += missingCost(a[i - 1]);
      i--;
    } else if (op === 3) {
      if (bare(b[j - 1])) full.added++; else half.punctuation += missingCost(b[j - 1]);
      j--;
    } else if (op === 4) { half.transposition++; i -= 2; j -= 2; }
    else if (op === 5) { half.spacing++; i -= 2; j--; }
    else if (op === 6) { half.spacing++; i--; j -= 2; }
    else throw new Error('Invalid practice alignment');
  }
  half.spacing += (typed.match(/\S[ \t]{2,}(?=\S)/gu) ?? []).length;
  half.paragraph += (typed.match(/^ +(?=\S)/gm) ?? []).length;
  const fullMistakes = Object.values(full).reduce((n, x) => n + x, 0);
  const halfMistakes = Object.values(half).reduce((n, x) => n + x, 0);
  return { estimated: true, fullMistakes, halfMistakes, weightedMistakes: fullMistakes + halfMistakes / 2, full, half, referenceWords: a.length, typedWords: b.length };
}
