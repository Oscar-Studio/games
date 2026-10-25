/** Same fixed-width SIMD probe used by ONNX Runtime Web (MIT licensed). */
export function supportsSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0,
      10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11,
    ]));
  } catch {
    return false;
  }
}

/** iOS browsers use WebKit; avoid compiling the much larger GPU/Asyncify engine there. */
export function preferCpuRuntime(forceWasm = false): boolean {
  const ua = navigator.userAgent;
  const webkit = /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR)\//.test(ua);
  return forceWasm || webkit || !("gpu" in navigator);
}
