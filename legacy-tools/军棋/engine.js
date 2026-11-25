// A board is 12 rows of 5 stations. Seat numbers and army colours are independent.
export const ranks = [
  "军旗",
  "地雷",
  "炸弹",
  "工兵",
  "排长",
  "连长",
  "营长",
  "团长",
  "旅长",
  "师长",
  "军长",
  "司令",
];
const counts = [1, 3, 2, 3, 3, 3, 2, 2, 2, 2, 1, 1];
export const camps = new Set([11, 13, 17, 21, 23, 36, 38, 42, 46, 48]);
export const bases = new Set([1, 3, 56, 58]);
const row = (i) => Math.floor(i / 5);
const col = (i) => i % 5;
export const coord = (i) => "ABCDE"[col(i)] + (12 - row(i));
export const cells = Array.from({ length: 60 }, (_, i) => i);
export const edges = [];
const roads = cells.map(() => []),
  rails = cells.map(() => []);
for (const a of cells)
  for (const b of cells.slice(a + 1)) {
    const dx = Math.abs(col(a) - col(b)),
      dy = row(b) - row(a);
    if (dx > 1 || dy > 1 || (dx && dy && !camps.has(a) && !camps.has(b)))
      continue;
    if (row(a) === 5 && dy && (dx || col(a) % 2)) continue;
    const rail =
      dy === 0
        ? [1, 5, 6, 10].includes(row(a))
        : !dx &&
          (([0, 4].includes(col(a)) && row(a) >= 1 && row(b) <= 10) ||
            (row(a) === 5 && col(a) === 2));
    edges.push({ a, b, rail });
    roads[a].push(b);
    roads[b].push(a);
    if (rail) {
      rails[a].push(b);
      rails[b].push(a);
    }
  }
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function army(s, open) {
  return counts.flatMap((n, k) =>
    Array.from({ length: n }, () => ({ s, k, open })),
  );
}
export function fits(piece, i) {
  const depth = piece.s === 0 ? 11 - row(i) : row(i);
  return (
    depth >= 0 &&
    depth < 6 &&
    !camps.has(i) &&
    (piece.k !== 0 || bases.has(i)) &&
    (piece.k !== 1 || depth <= 1) &&
    (piece.k !== 2 || depth !== 5)
  );
}
function arrange(board, s) {
  const free = shuffle(
    cells.filter((i) => !camps.has(i) && (s === 0 ? i >= 30 : i < 30)),
  );
  // Fill constrained ranks first; shuffle the unconstrained ranks together.
  const bag = army(s, false);
  for (const p of [
    ...bag.filter((p) => p.k < 3),
    ...shuffle(bag.filter((p) => p.k >= 3)),
  ]) {
    board[
      free.splice(
        free.findIndex((i) => fits(p, i)),
        1,
      )[0]
    ] = p;
  }
}
export function create(mode = "dark", first = 0) {
  if (!["dark", "flip"].includes(mode)) throw Error("未知玩法");
  const board = cells.map(() => null);
  if (mode === "dark") {
    arrange(board, 0);
    arrange(board, 1);
  } else {
    const bag = shuffle([...army(0, false), ...army(1, false)]);
    for (const i of cells) if (!camps.has(i)) board[i] = bag.pop();
  }
  return {
    mode,
    board,
    turn: first,
    first,
    colors: mode === "dark" ? [0, 1] : [null, null],
    phase: "setup",
    ready: [false, false],
    mines: [3, 3],
    logs: [],
    frames: [],
    result: null,
    offer: null,
    revision: 0,
  };
}
export function project(board, mode, color, reveal = false) {
  return board.map((p) => {
    if (!p) return null;
    if (reveal || p.open || (mode === "dark" && p.s === color))
      return { s: p.s, k: p.k };
    return { s: mode === "dark" ? p.s : null, k: null };
  });
}
export function view(g, seat) {
  const { frames, board, ...state } = g;
  return {
    ...state,
    mines: g.mode === "flip" ? g.mines : null,
    board: project(board, g.mode, g.colors[seat]),
    seat,
  };
}
function paths(board, from) {
  const p = board[from],
    found = new Map(roads[from].map((i) => [i, [from, i]]));
  if (!p || p.k === null) return found;
  const seen = new Set([from]),
    queue = [[from]];
  for (let n = 0; n < queue.length; n++) {
    const path = queue[n],
      at = path[path.length - 1];
    for (const i of rails[at]) {
      if (
        seen.has(i) ||
        (p.k !== 3 && row(i) !== row(from) && col(i) !== col(from))
      )
        continue;
      seen.add(i);
      const route = [...path, i];
      found.set(i, route);
      if (!board[i]) queue.push(route);
    }
  }
  return found;
}
function immobile(v, from) {
  const p = v.board[from];
  if (!p || p.k === null || p.s !== v.colors[v.turn])
    return "请选择己方已知棋子";
  if (p.k < 2) return ranks[p.k] + "不能移动";
  if (v.mode === "dark" && bases.has(from)) return "进入大本营后不能移动";
  return "";
}
function blocked(v, from, to) {
  const p = v.board[from],
    target = v.board[to];
  if (!target) return "";
  if (target.s === p.s) return "此处已有己方棋子";
  if (camps.has(to)) return "行营中的棋子受保护";
  if (v.mode === "flip" && target.k === null) return "暗置棋子需要先翻开";
  if (v.mode === "flip" && target.k === 0 && v.mines[target.s])
    return "清除对方三枚地雷后才能夺旗";
  return "";
}
export function options(v, from) {
  const result = new Map();
  if (immobile(v, from)) return result;
  for (const [to, path] of paths(v.board, from))
    if (!blocked(v, from, to)) result.set(to, path);
  return result;
}
export function reason(v, from, to) {
  return (
    immobile(v, from) ||
    blocked(v, from, to) ||
    "路线不通，请检查铁路阻挡和转弯限制"
  );
}
export function actions(v) {
  const all = [];
  for (const i of cells) {
    if (v.mode === "flip" && v.board[i]?.s === null)
      all.push({ type: "flip", to: i });
    if (
      v.board[i] &&
      v.board[i].s === v.colors[v.turn] &&
      v.board[i].k !== null
    )
      for (const to of options(v, i).keys())
        all.push({ type: "move", from: i, to });
  }
  return all;
}
export function outcome(a, b) {
  if (b === 0) return 1;
  if (a === 2 || b === 2 || a === b) return 0;
  if (b === 1) return a === 3 ? 1 : -1;
  return a > b ? 1 : -1;
}
export function finish(g, winner, why) {
  g.phase = "end";
  g.result = { winner, why };
  g.offer = null;
}
function must(ok, message) {
  if (!ok) throw Error(message);
}
function station(i) {
  must(Number.isInteger(i) && i >= 0 && i < 60, "无效站点");
}
export function apply(g, seat, a) {
  const type = a?.type;
  if (g.phase === "setup") {
    must(!g.ready[seat], "你已准备");
    if (type === "ready") {
      g.ready[seat] = true;
      if (g.ready.every(Boolean)) {
        g.phase = "play";
        g.frames.push(g.board.slice());
      }
    } else {
      must(g.mode === "dark", "翻棋无需布阵");
      if (type === "shuffle") arrange(g.board, g.colors[seat]);
      else {
        must(type === "swap", "请先完成准备");
        station(a.from);
        station(a.to);
        const p = g.board[a.from],
          q = g.board[a.to];
        must(
          p &&
            q &&
            p.s === seat &&
            q.s === seat &&
            fits(p, a.to) &&
            fits(q, a.from),
          "军旗须入大本营，雷限后两排，炸弹避开首排，只能互换己子",
        );
        g.board[a.from] = q;
        g.board[a.to] = p;
      }
    }
  } else {
    must(g.phase === "play", "本局已经结束");
    if (type === "resign") finish(g, 1 - seat, "认输");
    else if (type === "offer") {
      must(g.offer === null, "已有待处理的求和");
      g.offer = seat;
    } else if (type === "accept" || type === "decline") {
      must(g.offer === 1 - seat, "没有对方的求和请求");
      g.offer = null;
      if (type === "accept") finish(g, null, "双方同意和棋");
    } else {
      must(g.turn === seat, "请等待对手行动");
      station(a.to);
      let note;
      if (type === "flip") {
        const p = g.board[a.to];
        must(g.mode === "flip" && p && !p.open, "此处没有可翻的棋子");
        if (g.colors[seat] === null) {
          g.colors[seat] = p.s;
          g.colors[1 - seat] = 1 - p.s;
        }
        g.board[a.to] = { ...p, open: true };
        note = "翻出" + ["红", "蓝"][p.s] + ranks[p.k];
      } else {
        must(type === "move", "未知行动");
        station(a.from);
        const v = view(g, seat);
        must(options(v, a.from).has(a.to), reason(v, a.from, a.to));
        const p = g.board[a.from],
          q = g.board[a.to],
          result = q ? outcome(p.k, q.k) : 1;
        note = q
          ? ["进攻子阵亡", "双方同归于尽", "进攻子取胜"][result + 1]
          : "行棋";
        g.board[a.from] = null;
        g.board[a.to] = result === 1 ? p : result === 0 ? null : q;
        if (q) {
          const lost = [
            ...(result <= 0 ? [p] : []),
            ...(result >= 0 ? [q] : []),
          ];
          for (const dead of lost) {
            if (dead.k === 1) g.mines[dead.s]--;
            if (dead.k === 11 && g.mode === "dark") {
              const flag = g.board.findIndex(
                (piece) => piece?.s === dead.s && piece.k === 0,
              );
              if (flag >= 0) g.board[flag] = { ...g.board[flag], open: true };
              note += " · " + ["红", "蓝"][dead.s] + "方司令阵亡亮旗";
            }
          }
          if (q.k === 0) finish(g, seat, "夺取军旗");
        }
      }
      g.logs.push({
        seat,
        to: a.to,
        ...(type === "move" ? { from: a.from } : {}),
        note,
      });
      g.frames.push(g.board.slice());
      g.turn = 1 - seat;
      if (g.phase === "play" && !actions(view(g, g.turn)).length)
        finish(g, seat, "对手无合法行动");
      if (g.phase === "play" && g.logs.length >= 600)
        finish(g, null, "满 600 手和棋");
    }
  }
  g.revision++;
}
export function replay(g, seat, index, reveal = false) {
  must(
    g.phase === "end" && Number.isInteger(index) && g.frames[index],
    "无此复盘局面",
  );
  return project(g.frames[index], g.mode, g.colors[seat], reveal);
}
// The CPU receives exactly the same projection as its seat. Surviving defenders
// are remembered by their public positions and avoided after a failed attack.
export function choose(v) {
  const color = v.colors[v.turn],
    legal = actions(v);
  const danger = new Set();
  for (const log of v.logs) {
    danger.delete(log.from);
    if (log.note.startsWith("进攻子阵亡") && log.seat === v.turn)
      danger.add(log.to);
    else danger.delete(log.to);
  }
  let best = null,
    high = -Infinity;
  for (const a of legal) {
    let score = Math.random() * 4;
    if (a.type === "flip") score += 2.8;
    else {
      const p = v.board[a.from],
        q = v.board[a.to];
      if (q) {
        if (q.k === 0) score += 100;
        else if (q.k === null)
          score += danger.has(a.to) ? -9 : 3 + (p.k === 3 ? -1 : 0);
        else {
          const r = outcome(p.k, q.k);
          score += r === 1 ? 10 + q.k : r === 0 ? q.k - p.k : -15;
        }
      } else {
        score += (row(a.to) - row(a.from)) * (color === 0 ? -1 : 1) * 0.45;
        if (camps.has(a.to)) score += 0.7;
        if (v.mode === "dark" && bases.has(a.to)) score -= 4;
        if (v.logs.slice(-8).some((l) => l.seat === v.turn && l.from === a.to))
          score -= 3;
      }
    }
    if (score > high) {
      high = score;
      best = a;
    }
  }
  return best;
}
