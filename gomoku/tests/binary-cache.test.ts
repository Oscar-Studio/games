import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BINARY_CACHE, loadVerifiedBinary } from '../src/binary-cache.ts';

const originals = new Map(['location', 'caches'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
let entries: Map<string, Response>;
let store: { match: (key: string) => Promise<Response | undefined>; put: (key: string, response: Response) => Promise<void>; delete: (key: string | Request) => Promise<boolean>; keys: () => Promise<Request[]> };
beforeEach(() => {
  entries = new Map();
  store = {
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => { entries.set(key, response.clone()); },
    delete: async key => entries.delete(typeof key === 'string' ? key : key.url),
    keys: async () => [...entries.keys()].map(key => new Request(key)),
  };
  Object.defineProperty(globalThis, 'location', { value: { href: 'https://games.oscarstudio.cn/五子棋/assets/worker.js' }, configurable: true });
  Object.defineProperty(globalThis, 'caches', { value: { open: async (name: string) => { assert.equal(name, BINARY_CACHE); return store; } }, configurable: true });
});
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const data = new Uint8Array([1, 2, 3]);
function spec(bytes = data, kind: 'model' | 'runtime' = 'model') {
  return { kind, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), download: async () => bytes, onCacheHit: () => {} };
}

test('verified downloads persist and are reused with the network unavailable', async () => {
  const first = spec();
  let downloads = 0, hits = 0;
  await loadVerifiedBinary({ ...first, download: async () => { downloads++; return data; } });
  assert.equal(entries.size, 1);
  const cached = await loadVerifiedBinary({ ...first, download: async () => { throw Error('offline'); }, onCacheHit: () => { hits++; } });
  assert.deepEqual(cached, data);
  assert.equal(downloads, 1);
  assert.equal(hits, 1);
});

test('same-sized corrupted cache is discarded and downloaded again', async () => {
  await loadVerifiedBinary(spec());
  const key = [...entries.keys()][0];
  entries.set(key, new Response(new Uint8Array([4, 5, 6])));
  let downloads = 0;
  await loadVerifiedBinary({ ...spec(), download: async () => { downloads++; return data; }, onCacheHit: () => assert.fail('corrupt hit') });
  assert.equal(downloads, 1);
  assert.deepEqual(new Uint8Array(await entries.get(key)!.arrayBuffer()), data);
});

test('new versions replace only their own binary kind after successful validation', async () => {
  await loadVerifiedBinary(spec());
  await loadVerifiedBinary(spec(data, 'runtime'));
  await loadVerifiedBinary(spec(new Uint8Array([7, 8, 9])));
  assert.equal(entries.size, 2);
  assert.equal([...entries.keys()].filter(key => key.includes('/model-')).length, 1);
  assert.equal([...entries.keys()].filter(key => key.includes('/runtime-')).length, 1);
});

test('invalid downloads are rejected without storing them or deleting a good old version', async () => {
  await loadVerifiedBinary(spec());
  await assert.rejects(loadVerifiedBinary({ ...spec(new Uint8Array([7, 8, 9])), download: async () => data }), /校验失败/);
  assert.equal(entries.size, 1);
});

test('missing storage, denied reads and quota failures still allow valid downloads', async () => {
  Object.defineProperty(globalThis, 'caches', { value: undefined, configurable: true });
  assert.deepEqual(await loadVerifiedBinary(spec()), data);
  Object.defineProperty(globalThis, 'caches', { value: { open: async () => { throw Error('denied'); } }, configurable: true });
  assert.deepEqual(await loadVerifiedBinary(spec()), data);
  Object.defineProperty(globalThis, 'caches', { value: { open: async () => store }, configurable: true });
  store.put = async () => { throw new DOMException('full', 'QuotaExceededError'); };
  assert.deepEqual(await loadVerifiedBinary(spec()), data);
  assert.equal(entries.size, 0);
});
