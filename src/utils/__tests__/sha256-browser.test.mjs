import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../sha256-browser.mjs';

test('computes SHA-256 when Web Crypto is unavailable', () => {
  assert.equal(
    sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
