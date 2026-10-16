/** Session-only coaching over the tutor's verified (akshara, keystrokes) units.
 * No conversion maps, typed text persistence, or changes to scoring. */
export function mistakeUnits(units, typed) {
  const grouped = new Map();
  let offset = 0;
  for (const unit of units) {
    let errors = 0;
    for (let i = 0; i < unit.keys.length && offset + i < typed.length; i++) {
      if (unit.keys[i] !== typed[offset + i]) errors++;
    }
    offset += unit.keys.length;
    if (!errors || !unit.keys.trim()) continue;
    const id = `${unit.deva}\0${unit.keys}`;
    const old = grouped.get(id);
    grouped.set(id, { deva: unit.deva, keys: unit.keys, errors: (old?.errors ?? 0) + errors });
  }
  return [...grouped.values()].sort((a, b) => b.errors - a.errors).slice(0, 8);
}

/** Keep whole aksharas intact; never construct arbitrary Hindi from wrong keys. */
export function targetedDrill(mistakes) {
  const selected = mistakes.slice(0, 8);
  const drill = [];
  for (let repeat = 0; repeat < 4; repeat++) {
    for (const u of selected) {
      if (drill.length) drill.push({ deva: ' ', keys: ' ' });
      drill.push({ deva: u.deva, keys: u.keys });
    }
  }
  return drill;
}

/** Speed is feedback, never a gate to the next lesson. */
export function nextPractice(levels, completed, currentId, stats) {
  const current = levels.find(l => l.id === currentId) ?? levels[0];
  if (!stats.complete || stats.accuracy < current.threshold) return current.id;
  return (levels.find(l => !completed.includes(l.id)) ?? current).id;
}
