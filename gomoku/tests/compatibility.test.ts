import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { sha256Hex } from '../src/integrity.ts';
import { supportsSimd } from '../src/compatibility.ts';

test('SHA-256 fallback matches standard vectors, boundary lengths and real downloads', async () => {
  const samples = [
    new Uint8Array(), new TextEncoder().encode('abc'),
    ...[55, 56, 63, 64, 65, 1000000].map(n => new Uint8Array(n).fill(97)),
    new Uint8Array(fs.readFileSync(new URL('../public/models/gomoku.onnx', import.meta.url))),
    new Uint8Array(fs.readFileSync(new URL('../public/ort/runtime-f33595b9f7ea-0.bin', import.meta.url))),
  ];
  for (const data of samples) {
    const expected = createHash('sha256').update(data).digest('hex');
    assert.equal(await sha256Hex(data, null), expected);
    assert.equal(await sha256Hex(data), expected);
  }
});

test('SIMD preflight handles unavailable and unsupported WebAssembly', () => {
  assert.equal(supportsSimd(), true);
  const original = globalThis.WebAssembly;
  try {
    Object.defineProperty(globalThis, 'WebAssembly', { value: undefined, configurable: true });
    assert.equal(supportsSimd(), false);
    Object.defineProperty(globalThis, 'WebAssembly', { value: { validate: () => false }, configurable: true });
    assert.equal(supportsSimd(), false);
  } finally {
    Object.defineProperty(globalThis, 'WebAssembly', { value: original, configurable: true });
  }
});
