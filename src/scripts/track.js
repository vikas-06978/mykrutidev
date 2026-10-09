/**
 * Count that a tool was used, in Google Analytics: an event name and a few
 * fixed labels (which chart, which lesson), never what anyone typed,
 * converted or uploaded.
 *
 * window.gtag exists only on the live site (src/lib/analytics.js), so on the
 * dev server, in tests and on preview addresses this does nothing. It never
 * throws: counting must not break the tool.
 *
 * @param {string} name  e.g. 'copy_text'
 * @param {Record<string, string | number>} [params]
 */
export function track(name, params = {}) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  } catch {
    // Nothing to do: the visit is still counted, this one event is not.
  }
}
