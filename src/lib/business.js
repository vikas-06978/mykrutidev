/**
 * Who is behind the store, as printed on /contact: the details Razorpay and
 * every buyer expect to find on a site that takes payments. Fill these in
 * before the first product goes on sale (src/lib/store.test.js fails while a
 * product is live and the name or address is empty; the phone is optional).
 *
 * They must match what is on the Razorpay account's KYC. Left empty, /contact
 * simply shows no business block.
 *
 * `name`: the person or firm that sells (a sole proprietor's own name is fine).
 * `address`: the postal address, on one line.
 * `phone`: optional, with the country code, e.g. "+91 98765 43210". Left empty it is not printed.
 * `email`: the public contact address (the same as CONTACT_EMAIL in routes.js).
 */
export const BUSINESS = {
  name: 'Vikas Rathore',
  address: 'Sheopur, Madhya Pradesh, 476337',
  phone: '',
  email: 'contact@mykrutidev.com',
};

/** The lines to print, in order, without the empty ones. */
export const businessLines = (b = BUSINESS) =>
  [b.name, b.address, b.phone, b.email].map((s) => (s ?? '').trim()).filter(Boolean);
