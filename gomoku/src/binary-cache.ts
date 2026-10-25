import { sha256Hex } from './integrity';

export const BINARY_CACHE = 'yishi-binaries-v1';
type BinarySpec = {
  kind: 'runtime' | 'model';
  sha256: string;
  bytes: number;
  download: () => Promise<Uint8Array<ArrayBuffer>>;
  onCacheHit: () => void;
};

/** Content-addressed entries keep model and engine updates independent. */
export async function loadVerifiedBinary(spec: BinarySpec): Promise<Uint8Array<ArrayBuffer>> {
  const key = new URL(`./__binary-cache__/${spec.kind}-${spec.sha256}`, globalThis.location.href).href;
  const valid = async (data: Uint8Array<ArrayBuffer>) =>
    data.byteLength === spec.bytes && await sha256Hex(data, null) === spec.sha256;
  let cache: Cache | undefined;
  try {
    cache = await globalThis.caches?.open(BINARY_CACHE);
    const response = await cache?.match(key);
    if (response) {
      const data = new Uint8Array(await response.arrayBuffer());
      if (await valid(data)) {
        spec.onCacheHit();
        return data;
      }
      await cache!.delete(key);
    }
  } catch {
    // Private browsing, denied storage and broken cache reads must not block play.
  }

  const data = await spec.download();
  if (!await valid(data))
    throw Error(`${spec.kind === 'runtime' ? '推演引擎' : '模型'}校验失败，请重试`);
  try {
    if (cache) {
      await cache.put(key, new Response(data));
      // Drop superseded versions only after the current one was safely stored.
      const prefix = new URL(`./__binary-cache__/${spec.kind}-`, globalThis.location.href).href;
      for (const old of await cache.keys()) {
        if (old.url.startsWith(prefix) && old.url !== key) await cache.delete(old);
      }
    }
  } catch {
    // A full/unavailable disk only disables persistence, not this loaded session.
  }
  return data;
}
