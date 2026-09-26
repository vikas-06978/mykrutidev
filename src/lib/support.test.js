import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';

import { readUpiId, upiLink, qrModules, qrSvg, QUIET_ZONE, UPI_PAYEE_NAME } from './support.build.js';

/** Read a QR the way a phone does: as pixels, with an independent decoder. */
function scan(modules, scale = 6) {
  const n = modules.length + QUIET_ZONE * 2;
  const px = n * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const i = (((r + QUIET_ZONE) * scale + y) * px + (c + QUIET_ZONE) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }),
  );
  return jsQR(data, px, px)?.data ?? null;
}

/** The modules an SVG from qrSvg() draws, read back from its path. */
function modulesOf(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
  const n = size - QUIET_ZONE * 2;
  const grid = Array.from({ length: n }, () => Array(n).fill(false));
  for (const [, x, y, run] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let i = 0; i < Number(run); i++) grid[Number(y) - QUIET_ZONE][Number(x) - QUIET_ZONE + i] = true;
  }
  return grid;
}

describe('the UPI ID setting', () => {
  test('not set, or blank: support payments are off', () => {
    for (const v of [undefined, '', '   ']) assert.equal(readUpiId(v), null);
  });

  test('accepts the shapes UPI IDs come in', () => {
    for (const id of ['47291836@upi', 'mykrutidev@okaxis', 'Q123456789@ybl', 'my.kruti-dev_1@paytm']) {
      assert.equal(readUpiId(id), id);
    }
    assert.equal(readUpiId('  47291836@upi\n'), '47291836@upi');
  });

  test('anything else fails the build rather than going live', () => {
    for (const v of ['47291836', '@upi', 'name@', 'two words@upi', 'a@b@upi', 'x@upi&am=5000', 'x@upi"><script>', 'https://pay.example/x']) {
      assert.throws(() => readUpiId(v), /not a UPI ID/, v);
    }
  });
});

describe('the payment link', () => {
  test('pays exactly this ID, shows MyKrutiDev, in rupees, and leaves the amount to the payer', () => {
    assert.equal(UPI_PAYEE_NAME, 'MyKrutiDev');
    assert.equal(upiLink('47291836@upi'), 'upi://pay?pa=47291836@upi&pn=MyKrutiDev&cu=INR');
    assert.doesNotMatch(upiLink('47291836@upi'), /[?&]am=/);
  });
});

describe('the QR code', () => {
  const link = upiLink('mykrutidev.test@upi');

  test('a phone scanning it reads exactly the payment link', () => {
    assert.equal(scan(qrModules(link)), link);
  });

  test('the SVG draws exactly those modules, dark on white, with a label', () => {
    const modules = qrModules(link);
    const svg = qrSvg(modules, 'UPI QR code to pay MyKrutiDev');
    assert.deepEqual(modulesOf(svg), modules);
    assert.equal(scan(modulesOf(svg)), link);
    assert.match(svg, /<rect [^>]*fill="#fff"/);
    assert.match(svg, /<path fill="#000"/);
    assert.match(svg, /role="img" aria-label="UPI QR code to pay MyKrutiDev"/);
  });

  test('a longer merchant ID still scans', () => {
    const long = upiLink('paytmqr2810050501011abcdefghijk@paytm');
    assert.equal(scan(modulesOf(qrSvg(qrModules(long), 'x'))), long);
  });
});
