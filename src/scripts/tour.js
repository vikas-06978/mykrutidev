/**
 * The first-visit tour on the typing tools. Loaded on demand (see
 * GuidedTour.astro): never on first paint, never on converter pages.
 *
 * One bubble at a time, pointing at a real control. Not a modal: no
 * backdrop, no focus trap, the page stays usable. Next / Skip, "1 of 3";
 * Esc or a click anywhere outside the bubble ends it.
 *
 * @param {{ target: string, text: string }[]} steps
 * @param {{ next: string, done: string, skip: string, step: string, aria: string }} L
 * @param {{ focus?: boolean, onEnd?: () => void }} [opts]
 */
export function runTour(steps, L, { focus = false, auto = false, onEnd } = {}) {
  // A control can exist in the DOM while its mode is hidden. A tour must
  // never point to that invisible panel or leave a bubble at the viewport edge.
  const live = steps.filter((s) => {
    const el = document.querySelector(s.target);
    return el && el.getClientRects().length > 0;
  });
  if (!live.length) return () => {};
  // Started on its own: only if the first control is already on screen, so
  // the page is never scrolled for it. (The "?" button always starts it.)
  if (auto) {
    const r = document.querySelector(live[0].target).getBoundingClientRect();
    if (r.bottom < 40 || r.top > window.innerHeight - 40) return null;
  }

  const box = document.createElement('div');
  box.className = 'tour';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'false');
  box.setAttribute('aria-label', L.aria);
  box.innerHTML =
    '<p class="tour-text" aria-live="polite"></p>' +
    '<div class="tour-foot"><span class="tour-count"></span>' +
    '<button type="button" class="tour-skip"></button>' +
    '<button type="button" class="tour-next"></button></div>';
  const text = box.querySelector('.tour-text');
  const count = box.querySelector('.tour-count');
  const skip = box.querySelector('.tour-skip');
  const next = box.querySelector('.tour-next');
  skip.textContent = L.skip;
  document.body.append(box);

  let i = 0;
  let target = null;
  let ended = false;

  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const gap = 12;
    // Below the control if it fits, otherwise above; never over it.
    const below = r.bottom + gap + b.height <= window.innerHeight || r.top - gap - b.height < 0;
    const top = below ? r.bottom + gap : r.top - gap - b.height;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - 8);
    box.dataset.side = below ? 'below' : 'above';
    box.style.top = `${Math.round(top)}px`;
    box.style.left = `${Math.round(left)}px`;
    const arrow = Math.min(Math.max(16, r.left + r.width / 2 - left), b.width - 16);
    box.style.setProperty('--tour-arrow-x', `${Math.round(arrow)}px`);
  }

  function show(n) {
    target?.classList.remove('tour-target');
    i = n;
    target = document.querySelector(live[i].target);
    target.classList.add('tour-target');
    // Only after the visitor pressed Next, and only if the control is wholly
    // off screen, bring it into view. The tour never moves the page by itself.
    const r = target.getBoundingClientRect();
    if ((n > 0 || !auto) && (r.bottom < 0 || r.top > window.innerHeight)) {
      target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
    text.textContent = live[i].text;
    count.textContent = L.step.replace('{n}', String(i + 1)).replace('{total}', String(live.length));
    next.textContent = i === live.length - 1 ? L.done : L.next;
    place();
  }

  function end() {
    if (ended) return;
    ended = true;
    target?.classList.remove('tour-target');
    box.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    onEnd?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') end();
  }
  function onOutside(e) {
    if (!box.contains(e.target)) end();
  }

  next.addEventListener('click', () => (i === live.length - 1 ? end() : show(i + 1)));
  skip.addEventListener('click', end);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { capture: true, passive: true });

  show(0);
  // Started from the "?" button: put keyboard focus in the bubble. Started on
  // its own: leave focus where the visitor has it.
  if (focus) next.focus();
  return end;
}
