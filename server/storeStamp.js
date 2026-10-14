/**
 * A buyer's copy of a PDF, marked with who it was sold to.
 *
 * WHY NOT "OPEN THE PDF AND DRAW ON IT" (pdf-lib at download time): parsing and
 * saving a 30-page PDF takes 50-130 ms of CPU, and a Cloudflare Pages Function on
 * the free plan gets about 10 ms. So the work is done ONCE, ahead of time, and the
 * download only swaps a few bytes:
 *
 *   1. scripts/prepare-store-pdf.mjs adds one line to the foot of every page: a
 *      fixed-length placeholder (STAMP_SLOT), drawn in small grey type. That is the
 *      file that goes into the R2 bucket.
 *   2. At download, the placeholder is found in the file's bytes and overwritten with
 *      the same number of characters: "Licensed to ab***@gmail.com - Order o... ".
 *      Nothing moves in the file, so no cross-reference table needs rewriting and
 *      nothing is parsed.
 *
 * The slot is a plain PDF string in an uncompressed content stream, so it is found by
 * a plain text search. The stamp may use printable ASCII except ( ) and backslash.
 *
 * WHAT THIS IS, AND IS NOT: a mark that says whose copy this is, so a copy that
 * turns up on a file-sharing site can be traced to an order. It does not stop anyone
 * from sharing a file, and it is easy to remove for someone determined. It is a
 * deterrent and an evidence trail, not copy protection.
 *
 * No Node built-ins here: this file is bundled into a Pages Function.
 */

/** Characters in the slot. The stamp is cut or padded with spaces to exactly this. */
export const STAMP_LEN = 80;
/** What the prepared PDF holds on every page until a buyer's stamp replaces it. */
export const STAMP_SLOT = '@@MKD-STAMP@@'.padEnd(STAMP_LEN, '_');

/** "ab***@gmail.com": enough to recognise the buyer, not enough to publish their address. */
export function maskEmail(email) {
  const e = String(email ?? '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  const user = e.slice(0, at);
  const domain = e.slice(at + 1).slice(0, 40);
  return `${user.slice(0, Math.min(2, user.length))}***@${domain}`;
}

/** Printable ASCII only (so it is the same size in bytes as in characters), and none of ( ) \ that mean something inside a PDF string. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]|[()\\]/g, '?');

/**
 * The text of one buyer's stamp.
 * @param {{ id: string, email?: string }} order
 */
export function stampText(order) {
  const who = maskEmail(order.email);
  const text = `${who ? `Licensed to ${who}` : 'Licensed copy'} - Order ${String(order.id).slice(0, 12)} - mykrutidev.com`;
  return ascii(text).slice(0, STAMP_LEN).padEnd(STAMP_LEN, ' ');
}

/**
 * Overwrite every stamp slot in `bytes` with `text`.
 * @param {Uint8Array} bytes  a prepared PDF (it is changed in place and returned)
 * @param {string} text       exactly STAMP_LEN characters (use stampText)
 * @returns {{ bytes: Uint8Array, count: number }} count 0: this file has no slot (it was not prepared)
 */
export function stampPdf(bytes, text) {
  const want = ascii(text).slice(0, STAMP_LEN).padEnd(STAMP_LEN, ' ');
  // Search the bytes directly: the slot starts with '@' (0x40), and a TypedArray's indexOf for one byte is fast.
  const slot = new Uint8Array(STAMP_LEN);
  for (let i = 0; i < STAMP_LEN; i++) slot[i] = STAMP_SLOT.charCodeAt(i);
  const end = bytes.length - STAMP_LEN;
  let count = 0;
  let at = bytes.indexOf(slot[0]);
  while (at !== -1 && at <= end) {
    let same = true;
    for (let i = 1; i < STAMP_LEN; i++) {
      if (bytes[at + i] !== slot[i]) {
        same = false;
        break;
      }
    }
    if (same) {
      for (let i = 0; i < STAMP_LEN; i++) bytes[at + i] = want.charCodeAt(i);
      count++;
      at = bytes.indexOf(slot[0], at + STAMP_LEN);
    } else {
      at = bytes.indexOf(slot[0], at + 1);
    }
  }
  return { bytes, count };
}
