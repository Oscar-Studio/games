import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { sha256Hex } from '../src/integrity.ts';
import { supportsSimd, preferCpuRuntime } from '../src/compatibility.ts';

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

test('runtime choice uses real adapter availability, not browser identity', async () => {
  assert.equal(await preferCpuRuntime(false, {}), true);
  assert.equal(await preferCpuRuntime(false, { gpu: { requestAdapter: async () => null } }), true);
  assert.equal(await preferCpuRuntime(false, { gpu: { requestAdapter: async () => { throw Error('driver'); } } }), true);
  assert.equal(await preferCpuRuntime(false, { gpu: { requestAdapter: async () => ({ isFallbackAdapter: true }) } }), true);
  assert.equal(await preferCpuRuntime(false, { gpu: { requestAdapter: async () => ({ isFallbackAdapter: false }) } }), false);
});

test('manual CPU and known low-memory devices avoid probing GPU', async () => {
  const gpu = { requestAdapter: async () => { assert.fail('unnecessary GPU probe'); return null; } };
  assert.equal(await preferCpuRuntime(true, { gpu }), true);
  for (const deviceMemory of [0.5, 1, 2])
    assert.equal(await preferCpuRuntime(false, { deviceMemory, gpu }), true);
  for (const deviceMemory of [undefined, 0, NaN, 4, 8])
    assert.equal(await preferCpuRuntime(false, { deviceMemory, gpu: { requestAdapter: async () => ({}) } }), false);
});

test('an unresponsive GPU probe falls back instead of hanging initialization', async () => {
  assert.equal(await preferCpuRuntime(false, { gpu: { requestAdapter: () => new Promise(() => {}) } }), true);
});
