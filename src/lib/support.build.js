/**
 * Build time only (hence .build.js): used in .astro frontmatter, never shipped
 * to the browser.
 *
 * "Support MyKrutiDev": a voluntary UPI payment, shown on /support and linked
 * from the footer only when a UPI ID has been configured.
 *
 * The UPI ID is never written in this repository. Cloudflare Pages passes it
 * to the build as an environment variable (Settings -> Variables and Secrets),
 * one of:
 *
 *  - PUBLIC_UPI_QR: the exact text inside the official QR code the UPI app
 *    made for the account (upi://pay?pa=...). A business (merchant) ID needs
 *    this: its QR carries a merchant code, the registered name and a
 *    signature, and PhonePe refuses a merchant QR without them. The site
 *    redraws that same text, so the QR on the page is the app's own QR.
 *  - PUBLIC_UPI_ID: just the ID. The site builds the link itself, which is
 *    enough for a personal ID.
 *
 * Without either, the build still works: /support shows only the other ways
 * to help, and the footer has no support link.
 *
 * Everything is decided at build time. The QR code is drawn here as an SVG,
 * with no QR service or script involved, so nothing on the page can change
 * where the money goes. The payment itself happens in the visitor's own UPI
 * app: the site never sees an amount, a PIN or any payment detail.
 */
import qrcode from 'qrcode-generator';

/** The name UPI apps show for the payee (they also show the bank's name for the account). */
export const UPI_PAYEE_NAME = 'MyKrutiDev';

/**
 * name@handle, as UPI IDs are written: the name part is letters, digits, dots,
 * hyphens and underscores (a UPI number is digits only); the handle, the part
 * after @, is the bank or app code (okaxis, ybl, paytm, upi...).
 */
const UPI_ID_RE = /^[a-z0-9][a-z0-9._-]{1,254}@[a-z][a-z0-9]{1,63}$/i;

/**
 * The configured UPI ID, or null when none is set.
 *
 * A value that is set but is not a UPI ID fails the build, so a typo in the
 * Cloudflare setting can never go live: the deploy fails and the site that
 * was already live stays as it was.
 *
 * @param {string | undefined} raw  import.meta.env.PUBLIC_UPI_ID
 * @returns {string | null}
 */
export function readUpiId(raw) {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (!UPI_ID_RE.test(value)) {
    throw new Error(`PUBLIC_UPI_ID is set to "${value}", which is not a UPI ID (name@bank, e.g. 12345678@upi).`);
  }
  return value;
}

/**
 * The text of an official UPI QR code, checked, or null when none is set.
 * Returned exactly as given (a signed QR stops working if anything in it
 * changes), with the ID it pays.
 *
 * @param {string | undefined} raw  import.meta.env.PUBLIC_UPI_QR
 * @returns {{ link: string, upiId: string } | null}
 */
export function readUpiQr(raw) {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const fail = (why) => {
    throw new Error(`PUBLIC_UPI_QR is not the text of a UPI QR code: ${why}. It should start with upi://pay?pa=`);
  };
  if (!/^upi:\/\/pay\?/i.test(value)) fail('it does not start with upi://pay?');
  if (/\s/.test(value)) fail('it contains spaces or line breaks');
  if (value.length > 1000) fail('it is longer than a UPI QR code can be');
  const params = new URLSearchParams(value.slice(value.indexOf('?') + 1));
  const upiId = params.get('pa') ?? '';
  if (!UPI_ID_RE.test(upiId)) fail(`its pa= (the UPI ID) is "${upiId}", which is not a UPI ID`);
  // The page promises the visitor chooses the amount.
  if (params.has('am')) fail('it has a fixed amount (am=); use the QR without an amount');
  return { link: value, upiId };
}

/**
 * What the support option pays, from the build's environment, or null when
 * it is off. PUBLIC_UPI_QR wins; if PUBLIC_UPI_ID is set too, it must name the
 * same ID, so the page never shows one ID and pays another.
 *
 * @param {Record<string, string | undefined>} env  import.meta.env or process.env
 * @returns {{ link: string, upiId: string } | null}
 */
export function readSupport(env) {
  const qr = readUpiQr(env.PUBLIC_UPI_QR);
  const id = readUpiId(env.PUBLIC_UPI_ID);
  if (qr && id && id.toLowerCase() !== qr.upiId.toLowerCase()) {
    throw new Error(`PUBLIC_UPI_ID (${id}) and the UPI ID inside PUBLIC_UPI_QR (${qr.upiId}) differ. Keep one of them.`);
  }
  if (qr) return qr;
  return id ? { link: upiLink(id), upiId: id } : null;
}

/**
 * The UPI number inside an ID like `98765432@upi` (8 to 10 digits before the
 * @), or null. A UPI app's "Pay to UPI number" box takes only these digits.
 * @param {string | null | undefined} upiId
 */
export const upiNumberOf = (upiId) => (upiId ? (/^(\d{8,10})@/.exec(upiId)?.[1] ?? null) : null);

/**
 * The standard UPI payment link every UPI app opens: pay this ID, show this
 * name, in rupees. No amount, so the payer chooses it.
 * @param {string} upiId  a value readUpiId() accepted, so it needs no escaping
 */
export const upiLink = (upiId) => `upi://pay?pa=${upiId}&pn=${UPI_PAYEE_NAME}&cu=INR`;

/**
 * The QR code for `text` as rows of dark (true) and light (false) modules.
 * Error correction M: survives a slightly blurred phone camera.
 * @param {string} text
 * @returns {boolean[][]}
 */
export function qrModules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Light modules around the code, as the QR standard asks, so every scanner finds it. */
export const QUIET_ZONE = 4;

/**
 * An SVG of the QR code: one path, each dark run of a row as one rectangle,
 * in modules (the viewBox includes the quiet zone). Always dark on white,
 * whatever the site's theme, because that is what scanners read best.
 * @param {boolean[][]} modules
 * @param {string} label  accessible name for the image
 */
export function qrSvg(modules, label) {
  const n = modules.length;
  const size = n + QUIET_ZONE * 2;
  let d = '';
  modules.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      if (!row[c]) continue;
      let run = 1;
      while (c + run < n && row[c + run]) run++;
      d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h${run}v1h-${run}z`;
      c += run - 1;
    }
  });
  const esc = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}
