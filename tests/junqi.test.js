import test from "node:test";
import assert from "node:assert/strict";
import * as E from "../legacy-tools/军棋/engine.js";
const piece = (s, k, open = true) => ({ s, k, open });
function fixture(mode, entries) {
  const g = E.create(mode);
  g.board.fill(null);
  for (const [i, s, k, open] of entries) g.board[i] = piece(s, k, open);
  E.apply(g, 0, { type: "ready" });
  E.apply(g, 1, { type: "ready" });
  g.colors = [0, 1];
  return g;
}
test("both armies have 25 legally placed pieces; projection masks enemy and unopened tiles", () => {
  for (let n = 0; n < 40; n++) {
    const g = E.create("dark");
    for (const s of [0, 1]) {
      const pieces = g.board.filter((p) => p?.s === s);
      assert.equal(pieces.length, 25);
      assert.ok(g.board.every((p, i) => !p || E.fits(p, i)));
      assert.ok(
        E.view(g, s).board.every((p) => !p || p.s === s || p.k === null),
      );
    }
    const enemy = g.board.findIndex((p) => p?.s === 1);
    assert.throws(() =>
      E.apply(g, 0, { type: "swap", from: enemy, to: enemy }),
    );
  }
  assert.ok(
    E.view(E.create("flip"), 0).board.every(
      (p) => !p || (p.k === null && p.s === null),
    ),
  );
});
test("rail turning, blockage, occupied camps and headquarters", () => {
  const g = fixture("dark", [
    [5, 0, 3],
    [56, 0, 10],
    [11, 1, 6],
    [53, 1, 3],
  ]);
  assert.ok(E.options(E.view(g, 0), 5).get(54).length > 2);
  g.board[5] = piece(0, 4);
  assert.ok(!E.options(E.view(g, 0), 5).has(54));
  g.board[15] = piece(1, 5);
  assert.ok(!E.options(E.view(g, 0), 5).has(50));
  assert.ok(!E.options(E.view(g, 0), 5).has(11));
  assert.equal(E.options(E.view(g, 0), 56).size, 0);
});
test("commander reveals flag; replay preserves original private view", () => {
  const g = fixture("dark", [
    [5, 0, 2, false],
    [6, 1, 11, false],
    [1, 1, 0, false],
    [40, 1, 4],
    [45, 0, 5],
  ]);
  E.apply(g, 0, { type: "move", from: 5, to: 6 });
  assert.equal(E.view(g, 0).board[1].k, 0);
  assert.throws(() => E.replay(g, 0, 0, true));
  E.apply(g, 1, { type: "resign" });
  assert.equal(E.replay(g, 0, 0)[1].k, null);
  assert.equal(E.replay(g, 0, 0, true)[1].k, 0);
});
test("flip assigns first colour, enables flipping with no moves, requires clearance to take flag", () => {
  const g = E.create("flip", 1);
  E.apply(g, 0, { type: "ready" });
  E.apply(g, 1, { type: "ready" });
  const i = g.board.findIndex(Boolean);
  E.apply(g, 1, { type: "flip", to: i });
  assert.equal(g.colors[1], g.board[i].s);
  assert.equal(g.phase, "play");
  const f = fixture("flip", [
    [5, 0, 3],
    [6, 1, 1],
    [7, 1, 0],
    [50, 1, 5],
  ]);
  f.mines[1] = 1;
  assert.ok(!E.options(E.view(f, 0), 5).has(7));
  E.apply(f, 0, { type: "move", from: 5, to: 6 });
  assert.equal(f.mines[1], 0);
  E.apply(f, 1, { type: "move", from: 50, to: 51 });
  E.apply(f, 0, { type: "move", from: 6, to: 7 });
  assert.deepEqual(f.result, { winner: 0, why: "夺取军旗" });
  assert.equal(E.outcome(2, 1), 0);
  assert.equal(E.outcome(11, 1), -1);
  assert.equal(E.outcome(4, 4), 0);
});
test("last movable unit lost ends game, draw requests belong to the other seat", () => {
  const g = fixture("dark", [
    [5, 0, 11],
    [6, 1, 4],
    [1, 1, 0],
  ]);
  E.apply(g, 0, { type: "offer" });
  assert.throws(() => E.apply(g, 0, { type: "accept" }));
  E.apply(g, 1, { type: "decline" });
  E.apply(g, 0, { type: "move", from: 5, to: 6 });
  assert.equal(g.result.why, "对手无合法行动");
});
for (const mode of ["dark", "flip"])
  test(mode + " complete CPU game uses only seat projections", () => {
    const g = E.create(mode);
    E.apply(g, 0, { type: "ready" });
    E.apply(g, 1, { type: "ready" });
    while (g.phase === "play") {
      const v = E.view(g, g.turn);
      assert.ok(!("frames" in v));
      E.apply(g, g.turn, E.choose(v));
    }
    assert.ok(g.result);
    assert.equal(g.frames.length, g.logs.length + 1);
  });
