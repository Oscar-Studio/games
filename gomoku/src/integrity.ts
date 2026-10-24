import { sha256 } from '@noble/hashes/sha256';

/** Keep checking downloads even when a browser/worker has no Web Crypto API. */
export async function sha256Hex(
  data: Uint8Array<ArrayBuffer>,
  subtle: Pick<SubtleCrypto, 'digest'> | null | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  const hash = subtle
    ? new Uint8Array(await subtle.digest('SHA-256', data))
    : sha256(data);
  return Array.from(hash, v => v.toString(16).padStart(2, '0')).join('');
}
