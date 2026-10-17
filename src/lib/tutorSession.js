/** Short-lived, per-tab recovery of an unfinished tutor attempt. Never uploaded. */
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export const DRAFT_LIMIT = 2_000_000;

/** Validate before restoring browser storage, including allocation bounds. */
export function readTutorDraft(raw, now = Date.now()) {
  try {
    if (typeof raw !== 'string' || raw.length > DRAFT_LIMIT) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !Number.isFinite(d.savedAt) || now - d.savedAt > DRAFT_TTL || d.savedAt > now + 1000) return null;
    if (!['lesson', 'practice', 'daily', 'exam', 'passages', 'targeted', 'unicode'].includes(d.mode)) return null;
    if (!['idle', 'running', 'paused'].includes(d.state) || typeof d.focus !== 'boolean') return null;
    if (!Number.isFinite(d.elapsed) || d.elapsed < 0 || d.elapsed > DRAFT_TTL) return null;
    if (typeof d.typed !== 'string' || d.typed.length > 150_000) return null;
    if (d.mode === 'unicode' && d.typed.length > 20_000) return null;
    if (!Array.isArray(d.units) || d.units.length === 0 || d.units.length > 30_000) return null;
    let size = 0;
    for (const unit of d.units) {
      if (!unit || typeof unit.deva !== 'string' || typeof unit.keys !== 'string' || !unit.deva || !unit.keys || unit.deva.length > 128 || unit.keys.length > 128) return null;
      size += unit.deva.length + unit.keys.length;
      if (size > 300_000) return null;
    }
    if (typeof d.title !== 'string' || d.title.length > 512 || typeof d.level !== 'string') return null;
    if (!Number.isInteger(d.passage) || d.passage < 0 || d.passage > 30) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day)) return null;
    if (![60,120,180,300,600,900,1800,3600,7200].includes(d.seconds) || ![600,900].includes(d.nativeSeconds)) return null;
    if (typeof d.backspace !== 'boolean' || typeof d.highlight !== 'boolean' || !['custom','guided','strict'].includes(d.preset)) return null;
    return d;
  } catch {
    return null;
  }
}

/** Exams keep wall-clock time across reloads; ordinary practice pauses. */
export function recoveredTime(draft, now = Date.now()) {
  const exam = draft.mode === 'exam' || draft.mode === 'unicode';
  const elapsed = draft.elapsed + (exam && draft.state === 'running' ? Math.max(0, now - draft.savedAt) : 0);
  return { elapsed, state: draft.state === 'running' && !exam ? 'paused' : draft.state };
}
