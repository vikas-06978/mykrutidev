# Tutor coaching

After any submitted attempt, the result offers a recommended lesson. Attempts
with mistakes also offer a targeted drill using the original verified Hindi
aksharas and their complete Remington key sequences. Up to eight distinct
mistake units are ranked by error count and repeated four times, separated by
spaces. Correct unfinished characters and untyped suffixes are not errors.

The latest nonempty drill remains available for this page session only. No
new learner text or mistake history is stored or sent to the server. Existing
progress storage still applies. Targeted attempts cannot unlock lessons,
update the global best speed, or earn a ranked speed record. Their time may
count toward ordinary practice activity under the existing minimum-length rule.

Mistake explanations show the expected character and key order, with guidance
for Shift or matras where relevant. They are suggestions about how to type the
character, not a diagnosis of why the learner made a mistake.

Recommendations respect lesson completion and accuracy thresholds. They do not
require a minimum speed or bypass locked lessons.

Focus view is a compact utility control rather than a promotional panel. It
keeps the tutor in the same document, hides its setup/lesson/passage pickers,
makes surrounding content inert, and traps keyboard navigation within the
tutor. The sticky toolbar keeps the exit and native paragraph-Tab control
available. The visible exit button
and Escape restore outside access and the previous body scroll setting without
resetting the attempt. The view is intentionally not remembered after reload.

The Exam practice mode contains separate selectable cards for Remington
practice and SSC CHSL Hindi practice. Exam cards and their settings are absent
from the other modes. Returning to Exam practice keeps the format selected for
this page session. Profile and duration selection do not force focus into the
typing field or start the clock.

The Remington card has independent guided and strict ten-minute practice presets.
Changing a preset starts a new attempt. Guided practice enables corrections and
hints; strict practice disables them. Manual rule changes mark the preset as
custom. The original scoring remains: net WPM is correct positional keystrokes
/ 5 / minutes, gross WPM counts all typed keystrokes, and accuracy is correct /
typed. Corrected mistakes are not a cumulative penalty under this model.

The guided/strict presets are not certified replicas of SSC, CPCT, court or
other exams. A separate native Unicode SSC CHSL 2026 Hindi practice path now
uses verified published duration/font requirements and an independent estimate
of the published error categories. See [exam profiles](EXAM-PROFILES.md) for
sources, scope, limits and CPCT's still-unverified status. No claim of
competitive superiority or improved learning outcomes has been established.

Direct entries use `?exam=ssc-chsl-2026-hindi` or `?exam=remington` on an existing
tutor page. Only these values are accepted; unknown values fall back to the
normal tutor. The canonical remains the base page. Instructions/scoring and
official references are available in an expandable help section; the SSC
independent-practice caption and input/font setup instructions remain visible.

## Reading and refresh recovery

The legacy reference accepts native mouse-wheel, scrollbar and touch scrolling;
its transparent capture field no longer intercepts pointer gestures. Clicking
the reference (or the Focus start hint) still focuses the labelled real input.
Reading does not start the timer or alter the caret. The next input event scrolls
the current character into view inside the reference only. Long references append
another rendering chunk near the bottom so readers can continue beyond the
initial 900 units. The native Unicode editor retains its normal pointer and
selection behaviour.

An unfinished attempt is checkpointed in this tab's `sessionStorage`, scoped to
the localized tutor path. It includes selected mode/passage/duration/rules,
reference units, typed text, elapsed time and Focus preference. Nothing in this
draft is uploaded or added to GA4. Reload restores it for up to24hours. This is
refresh recovery, not a cross-device or permanent save: new navigation does not
silently resume an old tab draft, and storage restrictions can disable recovery.

Ordinary lesson/practice/passage/daily/targeted attempts return paused, ready for
Resume, without charging reload downtime. Non-pausable Remington/SSC exam modes
keep their wall-clock deadline; time away is included and expired attempts finish.
Completed attempts restore a fresh empty attempt in the same mode, not a second
result, so reloading cannot duplicate history, streaks or lesson credit. Restart,
new passage, mode changes and progress reset replace the checkpoint. Restoring a
previously locked lesson is refused. Explicit exam/passage/lesson links take
precedence over a mismatched checkpoint.

Draft reads validate schema/version/age, enum values, unit and text sizes before
rendering. Invalid or oversized snapshots are ignored; blocked/full storage does
not stop typing. The checkpoint is debounced after input and saved on pagehide
and when the page becomes hidden, without reloading an active attempt for updates.

When the reference has keyboard focus (Tab/Shift+Tab), Up/Down move one text
line, Page Up/Down move a viewport with one line of overlap, and Home/End reach
the beginning/end of the full reference. End reveals all remaining reference
chunks. Reading keys stay inside the reference even at its boundaries and never
start the timer or type text. Tab moves to the real typing field; its normal
caret/editing keys and modified browser/assistive shortcuts remain available.
The next typed character returns the reference to the typing position.
