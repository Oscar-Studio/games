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

test('WebKit and CPU-only devices select the smaller runtime while Chrome GPU stays accelerated', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const set = (userAgent: string, gpu = true) => Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { userAgent, ...(gpu ? { gpu: {} } : {}) },
  });
  try {
    for (const ua of [
      'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 Version/26.0 Safari/604.1',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/142.0 Mobile/15E148 Safari/604.1',
    ]) { set(ua); assert.equal(preferCpuRuntime(), true); }
    set('Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0 Safari/537.36');
    assert.equal(preferCpuRuntime(), false);
    assert.equal(preferCpuRuntime(true), true);
    set('Mozilla/5.0 Chrome/142.0', false);
    assert.equal(preferCpuRuntime(), true);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
