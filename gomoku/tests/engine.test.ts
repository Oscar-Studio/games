import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  Board,
  encode,
  search,
  searchActions,
  winningActions,
  Cancelled,
  undoForHuman,
  type Side,
} from "../src/engine.ts";
const fixtures = JSON.parse(
  fs.readFileSync(new URL("./engine-fixtures.json", import.meta.url), "utf8"),
);
async function mock(board: Int8Array, player: Side) {
  const policy = Float32Array.from({ length: 225 }, (_, i) =>
    board[i] ? 0 : (i + 1) * (i === 128 ? 20 : 1),
  );
  let total = 0;
  for (const p of policy) total += p;
  for (let i = 0; i < 225; i++) policy[i] /= total;
  return { policy, value: player * 0.75 };
}
test("Python rule oracle: legal prefixes, forced moves and both colours", () => {
  for (const row of fixtures.rules) {
    const b = Int8Array.from(row.board);
    assert.deepEqual(winningActions(b, 1), row.black_wins);
    assert.deepEqual(winningActions(b, -1), row.white_wins);
    assert.deepEqual(searchActions(b, row.player), {
      actions: row.actions,
      kind: row.kind,
    });
    assert.deepEqual(Array.from(b), row.board);
  }
});
test("Python search oracle: all visits, value sign, low-value FPU regression", async () => {
  for (const row of fixtures.search) {
    const b = Board.fromMoves(row.moves);
    const r = await search(b.cells, b.player, mock, 128);
    assert.deepEqual(Array.from(r.visits), row.visits);
    assert.equal(r.action, row.action);
    assert.equal(r.source, row.source);
    assert.ok(Math.abs(r.value - row.value) < 1e-12);
  }
});
test("All directions, overline, board boundaries and illegal actions", () => {
  for (const [dr, dc, start] of [
    [0, 1, 105],
    [1, 0, 7],
    [1, 1, 0],
    [1, -1, 14],
  ]) {
    const b = new Board();
    for (const [i, k] of [0, 1, 2, 4, 5].entries()) {
      b.play(start + k * (dr * 15 + dc));
      b.play(210 + 2 * i);
    }
    b.play(start + 3 * (dr * 15 + dc));
    assert.ok(b.done);
    assert.equal(b.winner, 1);
  }
  const b = new Board();
  b.play(112);
  assert.throws(() => b.play(112));
  assert.throws(() => b.play(-1));
  assert.throws(() => b.play(225));
  assert.throws(() => b.play(1.5));
});
test("Full board draw and no post-terminal moves", () => {
  let blacks: number[] = [],
    whites: number[] = [];
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++)
      ((r + 2 * c) % 4 < 2 ? blacks : whites).push(r * 15 + c);
  if (blacks.length < whites.length) [blacks, whites] = [whites, blacks];
  const b = new Board();
  for (let i = 0; i < blacks.length; i++) {
    b.play(blacks[i]);
    if (i < whites.length) b.play(whites[i]);
  }
  assert.equal(b.history.length, 225);
  assert.ok(b.done);
  assert.equal(b.winner, 0);
  assert.throws(() => b.play(0));
});
test("Encoding matches own/opponent and absolute black-to-play planes", () => {
  const b = Board.fromMoves([112]);
  const x = encode(b.cells, b.player);
  assert.equal(x[112], 0);
  assert.equal(x[225 + 112], 1);
  assert.equal(x[450], 0);
  assert.equal(x.length, 675);
});
test("Search cancellation is observed after a yielded simulation", async () => {
  const b = Board.fromMoves([112]);
  let cancel = false;
  await assert.rejects(
    () =>
      search(b.cells, b.player, mock, 128, {
        cancelled: () => cancel,
        progress: () => {
          cancel = true;
        },
      }),
    Cancelled,
  );
});
test("Undo after a human or AI win returns exactly to the human turn", () => {
  const b = Board.fromMoves([0, 15, 1, 17, 2, 19, 3, 21, 4]);
  assert.ok(b.done);
  const humanWin = undoForHuman(b.history, 1);
  assert.equal(humanWin.history.length, 8);
  assert.equal(humanWin.player, 1);
  assert.equal(humanWin.done, false);
  const aiWin = undoForHuman(b.history, -1);
  assert.equal(aiWin.history.length, 7);
  assert.equal(aiWin.player, -1);
  assert.equal(aiWin.done, false);
  assert.throws(() => undoForHuman([112], -1));
  assert.deepEqual(undoForHuman([112], 1).history, []);
});
for (const [manifestFile, officialFile] of [
  ['wasm-manifest.json', 'ort-wasm-simd-threaded.asyncify.wasm'],
  ['wasm-cpu-manifest.json', 'ort-wasm-simd-threaded.wasm'],
]) {
  test(`${manifestFile}: packaged runtime matches the official binary`, () => {
    const root = new URL('../public/ort/', import.meta.url);
    const info = JSON.parse(fs.readFileSync(new URL(manifestFile, root), 'utf8'));
    const data = Buffer.concat(info.parts.map((part: { file: string; bytes: number }) => {
      const bytes = fs.readFileSync(new URL(part.file, root));
      assert.equal(bytes.length, part.bytes);
      return bytes;
    }));
    assert.equal(data.length, info.bytes);
    const hash = createHash('sha256').update(data).digest('hex');
    assert.equal(hash, info.sha256);
    const official = fs.readFileSync(new URL(`../../node_modules/onnxruntime-web/dist/${officialFile}`, import.meta.url));
    assert.equal(createHash('sha256').update(official).digest('hex'), hash);
  });
}
