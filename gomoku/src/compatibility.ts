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

type RuntimeHardware = {
  deviceMemory?: number;
  gpu?: { requestAdapter: () => Promise<{ isFallbackAdapter?: boolean } | null> };
};

/** Memory is only a conservative hint; actual adapter availability decides GPU use. */
export async function preferCpuRuntime(
  forceWasm = false,
  hardware: RuntimeHardware = navigator as unknown as RuntimeHardware,
): Promise<boolean> {
  const memory = hardware.deviceMemory;
  if (forceWasm || (typeof memory === 'number' && memory > 0 && memory <= 2) || !hardware.gpu)
    return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const adapter = await Promise.race([
      hardware.gpu.requestAdapter(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2000); }),
    ]);
    return !adapter || adapter.isFallbackAdapter === true;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}
