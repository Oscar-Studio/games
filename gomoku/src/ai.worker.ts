/// <reference lib="webworker" />
import type * as Ort from "onnxruntime-web";
import { supportsSimd } from "./compatibility";
import { sha256Hex } from "./integrity";
let ort: typeof Ort;
import {
  Board,
  Cancelled,
  encode,
  policyFromLogits,
  search,
  type Side,
} from "./engine";
const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: Ort.InferenceSession | undefined,
  provider = "wasm",
  generation = 0,
  manifest: any;
let running = false;
const base = new URL("../", scope.location.href);
// Only the large binary downloads live on COS; scripts and trusted manifests stay local.
const binaryBase = import.meta.env.DEV
  ? null
  : new URL("https://gomoku-models-1387864538.cos.ap-guangzhou.myqcloud.com/");

async function init(forceWasm = false) {
  if (!supportsSimd())
    throw Error("当前浏览器不支持 WebAssembly SIMD，无法运行此 AI。可尝试更新 iPadOS，或切换到玩家对战。");
  ort = (await import(
    /* @vite-ignore */ new URL("ort/ort.webgpu.min.js", base).href
  )) as typeof Ort;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  // The production nginx serves .mjs as application/octet-stream. Explicit .js
  // paths keep both dynamic imports compatible with its JavaScript MIME mapping.
  ort.env.wasm.wasmPaths = {
    mjs: new URL("ort/ort-wasm-simd-threaded.asyncify.js", base).href,
  };
  const runtimeInfo = await fetch(new URL("ort/wasm-manifest.json", base)).then(
    (r) => {
      if (!r.ok) throw Error("无法读取推演引擎信息");
      return r.json();
    },
  );
  const runtime = new Uint8Array(runtimeInfo.bytes);
  let runtimeOffset = 0;
  for (const part of runtimeInfo.parts) {
    const response = await fetch(binaryBase ? new URL(part.file, binaryBase) : new URL(`ort/${part.file}`, base));
    if (!response.ok) throw Error("推演引擎下载失败");
    const reader = response.body!.getReader();
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      runtime.set(r.value, runtimeOffset);
      runtimeOffset += r.value.length;
      scope.postMessage({
        type: "loading",
        stage: "runtime",
        bytes: runtimeOffset,
        total: runtimeInfo.bytes,
      });
    }
  }
  const runtimeHash = await sha256Hex(runtime);
  if (runtimeOffset !== runtimeInfo.bytes || runtimeHash !== runtimeInfo.sha256)
    throw Error("推演引擎校验失败，请刷新重试");
  ort.env.wasm.wasmBinary = runtime;
  manifest = await fetch(new URL("models/manifest.json", base)).then((r) => {
    if (!r.ok) throw Error("无法读取模型信息");
    return r.json();
  });
  const response = await fetch(binaryBase ? new URL(manifest.file, binaryBase) : new URL(`models/${manifest.file}`, base));
  if (!response.ok) throw Error("模型下载失败，请检查网络");
  const reader = response.body!.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    bytes += r.value.length;
    scope.postMessage({ type: "loading", bytes, total: manifest.bytes });
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  const hash = await sha256Hex(data);
  if (hash !== manifest.sha256) throw Error("模型校验失败，请刷新重试");
  if (!forceWasm && "gpu" in navigator) {
    try {
      session = await ort.InferenceSession.create(data, {
        executionProviders: ["webgpu"],
        graphOptimizationLevel: "all",
      });
      provider = "webgpu";
    } catch {
      session = undefined;
    }
  }
  if (!session) {
    session = await ort.InferenceSession.create(data, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    provider = "wasm";
  }
  scope.postMessage({ type: "ready", provider, manifest });
}
async function predict(board: Int8Array, side: Side) {
  if (!session) throw Error("模型尚未准备好");
  const outputs = await session.run({
    board: new ort.Tensor("float32", encode(board, side), [1, 3, 15, 15]),
  });
  const logits = outputs.logits.data as Float32Array,
    value = Number(outputs.value.data[0]);
  if (!Number.isFinite(value)) throw Error("模型输出无效");
  return { policy: policyFromLogits(logits, board), value };
}
scope.onmessage = async (event) => {
  const data = event.data;
  if (data.type === "cancel") {
    generation++;
    return;
  }
  if (data.type === "init") {
    try {
      await init(data.forceWasm);
    } catch (e) {
      scope.postMessage({ type: "error", message: String(e) });
    }
    return;
  }
  if (data.type === "verify") {
    try {
      let maxLogit = 0,
        maxValue = 0;
      const start = performance.now();
      for (let i = 0; i < data.fixtures.length; i++) {
        const f = data.fixtures[i];
        const outputs = await session!.run({
          board: new ort.Tensor(
            "float32",
            encode(Int8Array.from(f.board), f.player),
            [1, 3, 15, 15],
          ),
        });
        const logits = outputs.logits.data as Float32Array;
        for (let a = 0; a < 225; a++)
          maxLogit = Math.max(maxLogit, Math.abs(logits[a] - f.logits[a]));
        maxValue = Math.max(
          maxValue,
          Math.abs(Number(outputs.value.data[0]) - f.value),
        );
        if (i % 16 === 0)
          scope.postMessage({
            type: "qaProgress",
            completed: i,
            total: data.fixtures.length,
          });
      }
      scope.postMessage({
        type: "verified",
        provider,
        positions: data.fixtures.length,
        maxLogit,
        maxValue,
        elapsed: performance.now() - start,
      });
    } catch (e) {
      scope.postMessage({ type: "error", message: String(e) });
    }
    return;
  }
  if (data.type !== "search" || running) return;
  running = true;
  const current = ++generation,
    start = performance.now();
  try {
    const board = Board.fromMoves(data.moves);
    if (board.done) throw Error("本局已经结束");
    const result = await search(
      board.cells,
      board.player,
      predict,
      data.simulations,
      {
        cancelled: () => current !== generation,
        progress: (completed) =>
          scope.postMessage({
            type: "progress",
            gameId: data.gameId,
            requestId: data.requestId,
            completed,
            total: data.simulations,
            elapsed: performance.now() - start,
          }),
        yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
      },
    );
    if (current === generation)
      scope.postMessage({
        type: "move",
        gameId: data.gameId,
        requestId: data.requestId,
        action: result.action,
        elapsed: performance.now() - start,
        simulations: result.simulations,
        diagnostics: data.diagnostics
          ? { value: result.value, visits: Array.from(result.visits) }
          : undefined,
      });
  } catch (e) {
    if (!(e instanceof Cancelled))
      scope.postMessage({
        type: "error",
        gameId: data.gameId,
        requestId: data.requestId,
        message: String(e),
      });
  } finally {
    running = false;
    scope.postMessage({ type: "idle" });
  }
};
