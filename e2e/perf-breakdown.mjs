// Main-thread time by event type in a trace from perf-theme.mjs, from the
// click to 600 ms after it: `node e2e/perf-breakdown.mjs perf-traces/x.json`.
import { readFileSync } from 'node:fs';

const events = JSON.parse(readFileSync(process.argv[2], 'utf8')).traceEvents ?? [];
const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
const onMain = events.filter((e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === 'X');
const click = onMain.find((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'click');
if (!click) throw new Error('no click in trace');
const end = click.ts + 600_000;
const inWindow = onMain.filter((e) => e.ts >= click.ts - 5_000 && e.ts <= end);
const totals = {};
for (const e of inWindow) totals[e.name] = (totals[e.name] ?? 0) + (e.dur ?? 0) / 1000;
const top = Object.entries(totals)
  .filter(([n]) => !['RunTask', 'ThreadControllerImpl::RunTask', 'RunMicrotasks'].includes(n))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([name, ms]) => ({ name, ms: Math.round(ms * 10) / 10 }));
const tasks = inWindow.filter((e) => e.name === 'RunTask' && e.dur > 50_000).map((e) => Math.round(e.dur / 1000));
console.log(process.argv[2]);
console.table(top);
console.log('tasks over 50 ms:', tasks);
const styles = inWindow.filter((e) => e.name === 'UpdateLayoutTree');
console.log('style recalcs:', styles.map((e) => `${Math.round(e.dur / 1000)}ms/${e.args?.elementCount ?? '?'} el`).join(', '));
