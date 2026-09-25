---
version: 1.0
name: MyKrutiDev Design System
description: The visual language of mykrutidev.com - a government-trusted Hindi utility. Deep navy ink and a muted brick accent on warm off-white paper, structured with 1px hairline cards and a restrained radius ladder. Built to feel like a well-made official form rather than a consumer app: calm, legible, and obviously not trying to sell anything. Noto Sans Devanagari carries all Hindi; the Latin chrome runs on the system stack so the page costs almost nothing to load.

colors:
  paper: "#faf7f2"
  surface: "#ffffff"
  inset: "#f4efe7"
  ink: "#1a2744"
  body: "#46536b"
  mute: "#6b7789"
  hairline: "#e5ded3"
  hairline-soft: "#efe9e0"
  brick: "#a8442a"
  brick-deep: "#8a3722"
  saffron: "#c8811f"
  ok: "#15803d"
  err: "#b91c1c"
  err-bg: "#fdeaea"
  warn-bg: "#fdf6e7"
  on-brick: "#ffffff"

typography:
  display-xl:
    fontFamily: system-ui, sans-serif
    fontSize: 36px
    fontWeight: 600
    lineHeight: 42px
    letterSpacing: -1.08px
  heading-lg:
    fontFamily: system-ui, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.48px
  heading-md:
    fontFamily: system-ui, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.36px
  label-sm:
    fontFamily: system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0
  eyebrow:
    fontFamily: system-ui, sans-serif
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.6px
    textTransform: uppercase
  body-lg:
    fontFamily: system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0
  body-md:
    fontFamily: system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0
  body-sm:
    fontFamily: system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0
  deva:
    fontFamily: Noto Sans Devanagari, Nirmala UI, Mangal, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 29.6px
    letterSpacing: 0

rounded:
  none: 0px
  chrome: 6px
  card: 12px
  panel: 16px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 64px
  4xl: 96px

components:
  nav-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    borderColor: "{colors.hairline}"
    padding: "{spacing.sm} {spacing.md}"
  nav-link:
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.xs} 10px"
  nav-link-current:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.xs} 10px"
  button-primary:
    backgroundColor: "{colors.brick}"
    textColor: "{colors.on-brick}"
    borderColor: "{colors.brick}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.xs} {spacing.md}"
    minHeight: 44px
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brick}"
    borderColor: "{colors.brick}"
    hoverBackgroundColor: "{colors.warn-bg}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.xs} {spacing.md}"
    minHeight: 44px
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.chrome}"
    padding: "{spacing.xs} {spacing.md}"
    minHeight: 44px
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.chrome}"
    size: 44px
  text-field:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    focusBorderColor: "{colors.brick}"
    focusRing: "0 0 0 3px rgb(168 68 42 / 0.14)"
    rounded: "{rounded.chrome}"
    padding: "{spacing.sm} {spacing.md}"
    minHeight: 208px
  segmented:
    gap: "{spacing.xs}"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    borderColor: "{colors.hairline}"
    hoverBackgroundColor: "{colors.inset}"
    hoverBorderColor: "{colors.mute}"
    selectedBackgroundColor: "{colors.brick}"
    selectedTextColor: "{colors.on-brick}"
    selectedBorderColor: "{colors.brick}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.chrome}"
    minHeight: 44px
    minHeightFinePointer: 30px
  text-panel:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.deva}"
    rounded: "{rounded.none}"
    padding: "{spacing.sm} {spacing.md}"
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.card}"
    padding: "{spacing.md}"
  converter-shell:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.card}"
    padding: "0px"
  notice:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.body}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: "10px {spacing.md}"
  faq-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    padding: "{spacing.md} 20px"
  footer:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.body}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    padding: "{spacing.2xl} {spacing.md}"

---

## Overview

MyKrutiDev converts Hindi between legacy fonts and Unicode. Its users are clerks,
typists, court staff and students, usually on a mid-range Android phone, usually
in a hurry, often handling a document that matters. The design has one job: look
like something official and competent, and then get out of the way.

So the page is **warm off-white paper** (`{colors.paper}` - #faf7f2) carrying
**deep navy ink** (`{colors.ink}` - #1a2744). The warmth is deliberate: a pure
white sheet reads as "web app", while a slightly cream ground reads as paper,
which is the association we want. Structure comes from **1px hairlines**
(`{colors.hairline}` - #e5ded3) rather than shadows or fills, so a page of dense
form-like controls stays calm.

Colour is rationed. A **muted brick** (`{colors.brick}` - #a8442a) carries links,
the focus ring and the single primary button. A **saffron** (`{colors.saffron}` -
#c8811f) exists purely as decoration - hover borders, the FAQ plus sign, rule
lines. There is no gradient, no illustration system and no photography. The most
visually prominent thing on every page is the pair of text panels, which is
correct, because that is the product.

**Key characteristics:**
- Warm paper ground + deep navy ink; every surface is paper, white, or one step of
  inset (`{colors.inset}`).
- Structure by hairline, never by shadow. The system has no elevation ladder at all.
- One accent that carries meaning (brick) and one that carries none (saffron).
  They are never swapped.
- The Latin UI runs on the system font stack - zero webfont bytes. Only Devanagari
  loads a webfont, and only the two weights actually used.
- Devanagari gets 1.85 line-height against the Latin 1.5; the script needs the room.
- Touch targets are 44px minimum everywhere, because 80% of traffic is phones.

## Colors

### Accent
- **Brick** (`{colors.brick}` - #a8442a): links, focus ring, primary button fill.
  Measured **5.6:1** on paper and **6.0:1** white-on-brick - both pass WCAG AA.
  Pressed tone `{colors.brick-deep}` (#8a3722).
- **Saffron** (`{colors.saffron}` - #c8811f): measured **3.0:1** on paper, which
  **fails AA for text**. It is therefore decoration only - hover borders, the FAQ
  toggle glyph, rule work. It never carries text and is never the only thing
  indicating focus. This constraint is the single most important rule in the file.

### Surface
- **Paper** (`{colors.paper}` - #faf7f2): the page ground.
- **Surface** (`{colors.surface}` - #ffffff): cards, the output panel, FAQ rows.
- **Inset** (`{colors.inset}` - #f4efe7): control strips - the options row, the
  selected half of a segmented toggle, the current nav item. Signals "chrome,
  not content".
- **Warn** (`{colors.warn-bg}` - #fdf6e7): the notice strips. Warm, not alarming;
  these say "read this", not "something broke".

### Text
- **Ink** (`{colors.ink}` - #1a2744) 13.9:1 - headings, high-emphasis text, the
  contents of both converter panels.
- **Body** (`{colors.body}` - #46536b) 7.2:1 - paragraphs and nav links.
- **Mute** (`{colors.mute}` - #6b7789) - character counts, captions, the accuracy
  strip. Never used for anything a user must read to succeed.

### Semantic
- **OK** (`{colors.ok}` - #15803d): the "Copied!" flash, and a correctly typed
  character in the typing test.
- **Error** (`{colors.err}` - #b91c1c, wash `{colors.err-bg}` - #fdeaea): a
  mistyped character, and the clock in its last ten seconds. Nothing else.
  Measured 6.5:1 on white, 6.0:1 on paper, 5.6:1 on its own wash - all AA.

  It exists because the typing test is the first thing on the site that has to
  mark something **wrong**; everything before it either succeeded or was a
  notice, and notices are warm (`{colors.warn-bg}`), not alarming. It is
  deliberately not brick: brick means "this is the action" everywhere else, and
  a passage with every mistake painted in the primary accent reads as a page
  full of buttons. It is never the only signal - a wrong character is also
  underlined, so the marking survives a monochrome screen and the common colour
  deficiencies.

### Borders
- **Hairline** (`{colors.hairline}` - #e5ded3): every card, input, divider and
  section rule. **Hairline-soft** (#efe9e0) for secondary rules inside a card.

## Typography

### Font family
Latin UI and prose use the **system stack** (`ui-sans-serif, system-ui,
-apple-system, "Segoe UI", Roboto, …`). This costs zero bytes and renders
natively on every device - a real advantage when the competing site is slow.

Hindi uses **Noto Sans Devanagari**, self-hosted via `@fontsource`, in 400 and
600 only, Devanagari subset only. No Google Fonts CDN: it is render-blocking and
a third-party request, and both undercut the product's speed and privacy claims.

### Hierarchy

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 36px | 600 | 42px | -1.08px | Page `h1` (30px on mobile) |
| `{typography.heading-lg}` | 24px | 600 | 32px | -0.48px | Section headings |
| `{typography.heading-md}` | 18px | 600 | 26px | -0.36px | Sub-headings, card titles |
| `{typography.label-sm}` | 14px | 500 | 20px | 0 | Buttons, nav emphasis |
| `{typography.eyebrow}` | 12px | 600 | 16px | +0.6px | Uppercase panel labels |
| `{typography.body-lg}` | 16px | 400 | 28px | 0 | Page prose |
| `{typography.body-md}` | 14px | 400 | 20px | 0 | Nav, secondary copy |
| `{typography.body-sm}` | 12px | 400 | 16px | 0 | Counts, captions, footer |
| `{typography.deva}` | 16px | 400 | 1.85em | 0 | All Hindi text and both panels |

### Principles
- Headings tighten as they grow; body copy sits at neutral tracking.
- Weight is binary: 600 for headings, 500 for buttons and labels, 400 elsewhere.
  No light weights, no italics in the UI.
- **Devanagari always gets 1.85 line-height.** Matras sit above and below the
  baseline, and at Latin leading the lines collide. This is not a stylistic choice.
- The uppercase eyebrow is the only place letter-spacing goes positive.

## Layout

### Spacing
Base unit 4px: 4 → 8 → 12 → 16 → 24 → 32 → 40 → 64 → 96. Card interiors run
`{spacing.md}`–`{spacing.lg}`; page sections run `{spacing.xl}`–`{spacing.3xl}`.

### Grid & container
A single centred container (`.wrap`, max-width 68rem) with a 16px gutter that is
never allowed to collapse. Long-form copy is additionally capped at 44rem
(`.prose-page`) - roughly 75 characters, which is the readable limit.

### Responsive strategy

| Name | Width | Key changes |
|---|---|---|
| Mobile | ≤ 640px | Converter panels stack; nav collapses to a hamburger drawer; the two copy buttons stack below 480px; supporting buttons go full width; h1 drops to 30px |
| Tablet | 768px | Panels go side-by-side, split by a vertical hairline |
| Laptop+ | 1024px+ | Related-page grid goes 3-up; container reaches max width |

Mobile-first is not decoration here: most users arrive on a phone, paste from
WhatsApp, and copy back out. The stacked panel order - input above output - is
the one that matches that flow.

### Touch targets
Every button clears **44px**, enforced in CSS (`min-height: 44px` on `.btn-*`)
rather than left to line-height.

## Elevation & depth

There is no elevation ladder. Every surface is flat, defined by a 1px hairline
and at most one step of background (`{colors.paper}` → `{colors.surface}`). No
glows, no gradients anywhere in the system.

This is a deliberate constraint rather than an omission: shadow-based depth reads
as "app", and the whole point is to read as "document".

**The one exception** is the nav dropdown panel, which carries a soft shadow
(`.shadow-menu` in `Header.astro`). A menu that floats over content has to read
as floating; against a page already full of hairline-bordered cards, a hairline
alone leaves it ambiguous - it looks like another card that happens to overlap.
This is the only shadow in the system, and it exists because the element is
genuinely on a different layer, not for decoration.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Full-bleed strips inside the converter shell, FAQ rows |
| `{rounded.chrome}` | 6px | Every button, text field, nav item and menu |
| `{rounded.card}` | 12px | Cards, the converter shell, notices |
| `{rounded.panel}` | 16px | Larger panels |
| `{rounded.pill}` | 9999px | Status pills only ("soon", "Live") |

**One radius for every control.** Buttons and text fields are all 6px. Hierarchy
is carried by fill, not by shape: `button-primary` is solid brick,
`button-outline` is a brick border on white, `button-ghost` is a hairline border.

This replaces an earlier rule that made the primary button a full pill and
allowed only one per page. Two copy buttons on the legacy-output pages are
equally important and equally sized, and a pill next to a 6px button made the
pair look like a real choice and an afterthought. The pill radius survives only
for status chips, which are not controls.

## Components

### Converter shell
The centrepiece. A single 12px-radius hairline card containing, top to bottom:
the two text panels, the mismatch hint, the options row, and the accuracy strip.
Internal dividers are hairlines; the shell clips them with `overflow: hidden` so
the corners stay clean.

There is **no font picker**. Each page converts in one fixed direction chosen by
its route, so the shell opens directly onto the two boxes - the conversion was
already chosen when the page was chosen. Asking again in a control strip was
where the earlier design lost people. The reverse direction is a plain text link
below the card, not a control inside it.

The two panels split on a vertical hairline at ≥768px and stack below it. The
input panel sits on `{colors.surface}`-over-paper, the output panel on white -
a half-step of separation that says "this side is the result" without a label.
Each panel is labelled with its font; where a name is ambiguous the label carries
both readings ("Unicode / Hindi"), because keypad Hindi *is* Unicode and users
search for it under both names.

### Navigation
Grouped by **source** font family - the question a visitor actually arrives with
is "I have Kruti Dev, where do I go", not "which target font exists". A group is
listed only when it holds at least one live page; a menu of nothing but
"coming soon" rows is a dead end.

Inside a group, pending pages still appear, greyed, with a small saffron **soon**
pill - and as `<span>`, never `<a>`. The menu doubles as a roadmap without ever
linking somewhere that cannot convert.

The tools - Roman typing, the typing test, the on-screen keyboard - sit in a
**Typing tools** disclosure beside the font groups, because they have no source
font to be filed under. They were flat links while there was one of them; at
three the menubar stopped fitting its container, and this nav is the one place
on the site that may never scroll or wrap. It is the same markup as a converter
group, so it inherits the keyboard handling rather than special-casing it.

**Desktop** is a menubar of disclosure buttons: click to toggle, hover to open,
one open at a time, Escape returns focus to the trigger. The panel is
`position: absolute`, `z-50`, white, hairline-bordered, 12px radius, with the one
shadow in the system.

> Nothing between the panel and its `position: relative` parent may set
> `overflow` to anything but `visible`. An `overflow-x-auto` on the nav list is
> what turned these menus into a clipped scroll box once already.

**Mobile** is a hamburger opening a full-width panel; each group is a native
`<details>` accordion, one section open at a time. No hover menus - every row is
a full-width 44px tap target.

### Buttons

All three share one radius, one 44px minimum height and one padding. Only the
fill changes.

- **`button-primary`** - solid brick, white text. The action the page's title
  promised: "Copy text", or "Copy Kruti code" where the output is a legacy font.
- **`button-outline`** - brick border and brick text on white. A second action of
  equal weight, currently only "Copy as Hindi (Unicode)".
- **`button-ghost`** - hairline border, ink text. Everything supporting: Clear,
  Try example, Download .docx, WhatsApp.

On a copy, the button itself turns green (`{colors.ok}`) and its label becomes
"Copied!" for 1.6s. The confirmation belongs on the control that was pressed; a
shared status line beside three buttons never said which one had fired. A
visually hidden `role="status"` still announces it for screen readers.

### Text fields

Both textareas sit inside a `text-field` wrapper that carries the border, radius
and focus state, so the textarea itself is borderless. The focus ring is a 2px
brick border plus a soft 3px brick wash, following the field's radius instead of
drawing a hard rectangle across the panel's own hairlines. It is still a clearly
visible brick indicator, as the accessibility rule above requires.

`resize: vertical` only, with the corner grabber hidden: horizontal dragging
breaks the two-column grid. Both panels are a three-row grid (header, field,
actions) where only the field row grows, so the two boxes stay the same height
however tall the action rows below them get.

### Copy buttons on a legacy-output page

`/unicode-to-kruti-dev` and `/mangal-to-kruti-dev` carry **two** copy buttons,
because the thing on screen is not one copyable string. The box shows
<span lang="hi">नमो</span> only because the Kruti Dev font is drawing `ueksS`;
the clipboard can carry one or the other, never the appearance. So both are
generated and labelled rather than left to chance:

| Button | Style | Copies | Caption |
|---|---|---|---|
| Copy Kruti code | primary | the raw legacy keys | For MS Word / forms |
| Copy as Hindi (Unicode) | outline | the Unicode form | For WhatsApp / web |

They sit in an equal two-column grid, stacking below 480px, so neither reads as
the small one. Each caption is one short line, centred under its button, in
`{colors.mute}`. They answer "where is this going", so they name the
destination and stop; an earlier pair spelled the instruction out in Hinglish
and was long enough to wrap and compete with the button label above it.

Pages whose output is already Unicode (`/`, `/kruti-dev-to-mangal`) show a single
`Copy text` button. There is nothing to disambiguate there.

### Output preview toggle

Legacy-output pages only, top-right of the output panel: a small "View:" label
and a `segmented` Preview (Hindi) / Raw code control, defaulting to Preview.

The two segments are **separate bordered chips with a gap between them**, not
two buttons sharing an edge. Sharing an edge made them read as one run-on
string, "Preview (Hindi)Raw code", and neither looked pressable. The active
segment is solid brick with white text; the inactive one is a hairline border on
white that darkens to `{colors.inset}` on hover, with `cursor: pointer` on both.

The panel header is a wrapping flex row where the eyebrow takes the auto margin,
so on a narrow phone the toggle and the character count drop to a second line
together, right-aligned, instead of crowding the panel label. Segments are a
full 44px tall by default and shrink to 30px only under
`(hover: hover) and (pointer: fine)`, where there is a mouse and the control is
a secondary one sitting in a header.

> It is **purely visual**, and it is implemented as one attribute on the
> converter root that CSS reads to swap the output box's `font-family`. No
> JavaScript writes a font, no conversion re-runs, and neither copy button nor
> either `.docx` export reads it.

There is deliberately **no font-variant picker**. An earlier version offered
Kruti Dev 010/011/012/014/016/020/055 and DevLys 010 in a dropdown. They share
one keyboard layout and differ only in letterforms, so the control looked like a
setting that mattered and changed nothing the user could act on. One preview
face per legacy font, Kruti Dev 010 for Kruti Dev. If the face cannot be
resolved, a muted note appears beside the toggle rather than leaving someone
staring at ASCII in "Preview (Hindi)" mode.

This is the one surviving user of the `select` token, which predates the removal
of the font picker. It is not a font picker: it never changes the conversion.

### Notices
The **mismatch hint** sits inside the converter shell on `{colors.warn-bg}`,
full-bleed with square corners so it reads as part of the shell rather than a
floating alert. It appears when the pasted text clearly is not this page's source
font - Unicode pasted into a legacy box, or plain English. It hints and links to
the right page; it never blocks conversion.

The **coming-soon panel** replaces the converter entirely on a page whose mapping
is not verified. It is a card, not a strip, because it is the content of the page
rather than an annotation on it - a page that cannot convert accurately shows no
converter at all.

The **accuracy strip** at the bottom is deliberately quiet - mute text on white -
because it must always be present without ever competing with the output.

### Typing tutor

One tall card, read top to bottom, because everything in it is a step in the
same loop: settings, the lesson ladder, the stat row, the passage, the next-key
prompt, the keyboard, the hands, the controls, the result.

The order is the order the eye needs them. The passage is what you read, so it
is at the top of the working area. The keyboard and hands are what you consult
when you are stuck, so they are below it - near enough to glance at, far enough
that they are not competing with the text. Nothing is side by side, because at
speed two columns become two things to watch.

The **stat row** is four equal tiles above the passage, so checking the clock
never means looking away from the text. Its rules are a 1px grid gap showing the
hairline through from behind, not borders on the tiles: `divide-x` on a grid that
wraps to two columns puts a stray line down the middle of the second row.

The **passage** is one `<span>` per akshara, never per character - a span
boundary between क and its matra stops the browser shaping them together and the
matra is drawn on a dotted circle beside the letter. Correct aksharas go
`{colors.ok}`, mistakes go `{colors.err}` on `{colors.err-bg}` and underlined,
and the caret akshara carries a brick wash with an *inset* 2px rule, so marking
the position never reflows the paragraph. It blinks only while a test is
actually running, and not at all under `prefers-reduced-motion`. The panel
scrolls itself, never the page.

The **input is invisible and sits exactly on top of the passage** - a real,
labelled `<textarea>` with transparent ink, so a tap opens the phone keyboard
and a screen reader has something to announce, while the passage underneath
draws all the state. Until it has focus a veil says so: a tutor that silently
swallows the first sentence somebody types is the worst possible first
impression.

The **lesson ladder** is eleven chips in a responsive grid, rendered server-side
so it is visible and crawlable before any JavaScript runs. A locked chip is
`disabled`, not merely faded, so nobody tabs into a dead end. The current level
is the only solid fill on the row; a completed one is marked on its border, so
"where I am" and "where I have been" never compete.

The **progress strip** sits directly above the passage: the panel label and a
`typed / total` count, then a 4px track on `{colors.inset}` with a
`{colors.brick}` fill, then the percentage and what is left. It is a strip
inside the shell, so it is full-bleed with square ends like the others.

The bar and the number are both there on purpose. A bar cannot be read
precisely and a typist deciding whether to push for the end needs the figure;
a figure alone makes you do arithmetic on five-digit keystroke counts, which on
a two-hour test is what the raw `12480 / 36161` count was already failing at.
What is left is quoted in keystrokes *and* words at five keystrokes to the
word, so it agrees with the WPM tile beside it rather than offering a second
unit.

**Pause** sits in the progress strip, right-aligned opposite the passage label,
appearing only once the clock is running - there is nothing to pause before
that.

It is the one control that has to be reachable *while* typing, so it is the one
control that does not live in the controls strip. That strip is below the
keyboard and the hand guide, roughly 760px down from the passage on a laptop
and most of a screen away on a phone; a pause button you have to go looking for
is a pause button you do not use. Here it is between the clock it acts on and
the text you are reading, both already in the eyeline.

It is not a `btn-*` class. Those are 44px tall unconditionally, which would push
the passage down a line on every screen, so it borrows their fill and border and
follows the `segmented` sizing rule instead - a full 44px target by default,
shrinking to 28px only under `(hover: hover) and (pointer: fine)`.

Running, it is a quiet hairline chip. **Paused, it turns solid brick**, because
that is the only state where it is the only way forward, and brick is what
carries the primary action everywhere else.

Pausing stops the clock, dims the passage and **disables the input**: a stopped
clock that still accepted keystrokes would be a way to type the passage for
free. Because disabling blurs the field, the veil returns on its own, so it
changes its line to say the test is paused rather than that it has not started.
Escape does the same as the button, since on a long test the hands are already
on the keyboard. All of it works identically in lessons and practice tests -
the only difference is that the lesson clock counts up and the practice clock
counts down.

### Remington keyboard

A drawing of a keyboard, not a palette of buttons - nothing on it is clickable,
because it answers "where is this key" and not "type this for me". Each cap
carries three lines, smallest first: the shifted Hindi letter, the English cap,
and the Hindi letter it types. The English letter is in the middle because that
is the thing being hunted for on the physical keyboard.

Every Hindi letter on it is read from the character map at build time, so a cap
cannot promise a letter the converter disagrees about. A key that types nothing
in Kruti Dev is drawn on `{colors.inset}` rather than borrowed for something
else. The eight home keys carry a bump, as a real keyboard marks F and J.

The next key is solid `{colors.brick}`; a Shift that must be held with it is
`{colors.warn-bg}` with a brick border, a step down so the letter stays the thing
being pointed at. A press flashes `{colors.ok}` or `{colors.err}` for 120ms.

The board **scrolls sideways and never wraps**. A full QWERTY row cannot be drawn
legibly at 360px, and a keyboard whose rows wrap is no longer a picture of a
keyboard - so the caps shrink to a floor, the board scrolls, and the tutor keeps
the highlighted key in view horizontally without ever moving the page.

### Hand guide

Two hands, flat shapes defined by a hairline, per the rule that this system has
no illustration style and no shading. It is a diagram, not anatomy: a palm and
five rounded bars, with the middle finger tallest because that is most of what
makes it read as a hand rather than a comb.

The right hand is the left hand mirrored. The finger to move is `{colors.brick}`
- the same accent as the key cap, so the two highlights read as one instruction
- and a pinky holding Shift is `{colors.warn-bg}`. Both thumbs answer to one id,
because either presses space and naming one would be inventing a rule.

### On-screen Devanagari keyboard

### On-screen Devanagari keyboard

Distinct from the Remington drawing above, and for the opposite job: this one
*is* clickable, lives on `/hindi-keyboard`, and types for you. The Remington
board is a map of a keyboard you already have; this is a keyboard you do not.

A text field over a palette of key caps, grouped by `{typography.eyebrow}` row
labels in वर्णमाला order. Caps are 44px square minimum - the only controls on
the site a user presses hundreds of times in a row - and the press state is set
by hand, because keeping the caret in the textarea means preventing the default
on pointerdown, which also suppresses the browser's own `:active`.

Combining marks are drawn on a dotted circle (◌ा) and insert bare. A second
layer, behind a segmented toggle, holds the Sanskrit and Marathi letters; the
default layer alone can write ordinary Hindi, which is enforced by a test.

### FAQ
A single hairline card with hairline-divided `<details>` rows. The toggle is a
saffron `+` that rotates 45° when open - the one piece of motion in the system,
and the one place saffron appears at size.

### Footer
Paper ground, top hairline, two columns that wrap on mobile: the wordmark with a
one-line privacy statement, and the converter list. Closes with the ownership
disclaimer in `{typography.body-sm}` mute.

## Do's and Don'ts

### Do
- Keep the ground warm (`{colors.paper}`) and the ink navy (`{colors.ink}`). The
  warmth is what makes it read as paper rather than as a web app.
- Define every surface with a 1px hairline before reaching for anything else.
- Reserve brick for links, focus and the single primary action.
- Give every piece of Devanagari `{typography.deva}` and its 1.85 line-height.
- Step the text ladder deliberately: ink → body → mute.
- Hold every interactive target at 44px.

### Don't
- **Don't set text in saffron.** It measures 3.0:1 on paper and fails AA. It is
  decoration only.
- Don't add shadows or gradients. Flat-with-hairline is the entire depth system.
- Don't give a control its own radius; every button and field is 6px, and
  hierarchy comes from the fill.
- Don't add a control that only changes how something looks while implying it
  changes what it does. That is what retired the font-variant picker.
- Don't put Devanagari at Latin line-height - the matras collide.
- Don't load fonts from a CDN. Speed and privacy are the product's claims, and a
  third-party font request contradicts both.
- Don't let the accuracy strip or the privacy note get styled up into a banner.
  They are always present and must never compete with the output panel.
