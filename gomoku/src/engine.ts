export const SIZE = 15,
  CELLS = 225;
export type Side = 1 | -1;
export type Prediction = { policy: Float32Array; value: number };
export type Predictor = (board: Int8Array, side: Side) => Promise<Prediction>;
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
export function winsAt(
  board: Int8Array,
  action: number,
  side: number,
): boolean {
  if (board[action] !== side) return false;
  const r = Math.floor(action / 15),
    c = action % 15;
  for (const [dr, dc] of directions) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let y = r + sign * dr,
        x = c + sign * dc;
      while (
        y >= 0 &&
        y < 15 &&
        x >= 0 &&
        x < 15 &&
        board[y * 15 + x] === side
      ) {
        count++;
        y += sign * dr;
        x += sign * dc;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}
export function winningActions(board: Int8Array, side: number): number[] {
  let stones = 0;
  for (const v of board) if (v === side) stones++;
  if (stones < 4) return [];
  const out: number[] = [];
  for (let a = 0; a < 225; a++)
    if (!board[a]) {
      board[a] = side;
      if (winsAt(board, a, side)) out.push(a);
      board[a] = 0;
    }
  return out;
}
export function searchActions(
  board: Int8Array,
  side: Side,
): { actions: number[]; kind: string } {
  let actions = winningActions(board, side);
  if (actions.length) return { actions, kind: "immediate_win" };
  actions = winningActions(board, -side);
  if (actions.length)
    return {
      actions,
      kind: actions.length === 1 ? "forced_block" : "multiple_threats",
    };
  actions = [];
  for (let a = 0; a < 225; a++) if (!board[a]) actions.push(a);
  return { actions, kind: "ordinary" };
}
export class Board {
  cells = new Int8Array(225);
  history: number[] = [];
  player: Side = 1;
  winner = 0;
  done = false;
  static fromMoves(moves: number[]): Board {
    if (!Array.isArray(moves) || moves.length > 225)
      throw Error("棋谱格式无效");
    const b = new Board();
    for (const a of moves) b.play(a);
    return b;
  }
  play(action: number) {
    if (
      this.done ||
      !Number.isInteger(action) ||
      action < 0 ||
      action >= 225 ||
      this.cells[action]
    )
      throw Error("这个位置不能落子");
    this.cells[action] = this.player;
    this.history.push(action);
    this.winner = winsAt(this.cells, action, this.player) ? this.player : 0;
    this.done = !!this.winner || this.history.length === 225;
    this.player = -this.player as Side;
  }
}
export function undoForHuman(history: number[], human: number): Board {
  if (!history.length || (human === -1 && history.length === 1))
    throw Error("还没有可以撤回的落子");
  const moves = history.slice();
  moves.pop();
  let board = Board.fromMoves(moves);
  if (board.player !== human && moves.length) {
    moves.pop();
    board = Board.fromMoves(moves);
  }
  return board;
}
export function encode(board: Int8Array, side: Side): Float32Array {
  const x = new Float32Array(675);
  for (let i = 0; i < 225; i++) {
    x[i] = +(board[i] === side);
    x[225 + i] = +(board[i] === -side);
    x[450 + i] = +(side === 1);
  }
  return x;
}
export function policyFromLogits(
  logits: ArrayLike<number>,
  board: Int8Array,
): Float32Array {
  let max = -Infinity;
  for (let a = 0; a < 225; a++) if (!board[a]) max = Math.max(max, logits[a]);
  if (!Number.isFinite(max)) throw Error("模型输出无效");
  let total = 0;
  const probs = new Float64Array(225);
  for (let a = 0; a < 225; a++)
    if (!board[a]) {
      probs[a] = Math.exp(logits[a] - max);
      total += probs[a];
    }
  return Float32Array.from(probs, (v) => v / total);
}
class Node {
  actions: number[];
  prior: Float64Array;
  visits: Int32Array;
  total: Float64Array;
  children = new Map<number, Node>();
  constructor(board: Int8Array, side: Side, prediction: Prediction) {
    this.actions = searchActions(board, side).actions;
    this.prior = Float64Array.from(this.actions, (a) =>
      Math.max(prediction.policy[a], 1e-8),
    );
    let sum = 0;
    for (const v of this.prior) sum += v;
    for (let i = 0; i < this.prior.length; i++) this.prior[i] /= sum;
    this.visits = new Int32Array(this.actions.length);
    this.total = new Float64Array(this.actions.length);
    this.value = prediction.value;
  }
  value: number;
  select(c: number) {
    let n = 0,
      w = 0;
    for (let i = 0; i < this.visits.length; i++) {
      n += this.visits[i];
      w += this.total[i];
    }
    const baseline = n ? w / n : this.value,
      scale = c * Math.sqrt(1 + n);
    let best = -Infinity,
      index = 0;
    for (let i = 0; i < this.actions.length; i++) {
      const q = this.visits[i] ? this.total[i] / this.visits[i] : baseline;
      const score = q + (scale * this.prior[i]) / (1 + this.visits[i]);
      if (score > best) {
        best = score;
        index = i;
      }
    }
    return index;
  }
}
export interface SearchResult {
  action: number;
  policy: Float32Array;
  visits: Int32Array;
  value: number;
  source: string;
  simulations: number;
}
export class Cancelled extends Error {}
export async function search(
  board: Int8Array,
  player: Side,
  predict: Predictor,
  simulations = 128,
  options: {
    cancelled?: () => boolean;
    progress?: (completed: number) => void;
    yieldControl?: () => Promise<void>;
    cPuct?: number;
  } = {},
): Promise<SearchResult> {
  if (!Number.isInteger(simulations) || simulations < 1)
    throw Error("搜索次数无效");
  const tactical = searchActions(board, player);
  if (!tactical.actions.length) throw Error("棋盘已满");
  if (
    tactical.kind === "immediate_win" ||
    (tactical.kind === "forced_block" && tactical.actions.length === 1)
  ) {
    const policy = new Float32Array(225);
    for (const a of tactical.actions) policy[a] = 1 / tactical.actions.length;
    return {
      action: tactical.actions[0],
      policy,
      visits: new Int32Array(225),
      value: tactical.kind === "immediate_win" ? 1 : 0,
      source: tactical.kind,
      simulations: 0,
    };
  }
  const root = new Node(board, player, await predict(board, player));
  for (let iteration = 0; iteration < simulations; iteration++) {
    if (options.cancelled?.()) throw new Cancelled();
    let node = root,
      side = player,
      leafValue = 0;
    const position = board.slice(),
      path: [Node, number][] = [];
    while (true) {
      const idx = node.select(options.cPuct ?? 1.5),
        action = node.actions[idx];
      path.push([node, idx]);
      position[action] = side;
      if (winsAt(position, action, side)) {
        leafValue = -1;
        break;
      }
      side = -side as Side;
      if (!position.includes(0)) {
        leafValue = 0;
        break;
      }
      const child = node.children.get(idx);
      if (child) {
        node = child;
        continue;
      }
      const kind = searchActions(position, side).kind;
      if (kind === "immediate_win") {
        leafValue = 1;
        break;
      }
      if (kind === "multiple_threats") {
        leafValue = -1;
        break;
      }
      const prediction = await predict(position, side);
      leafValue = prediction.value;
      node.children.set(idx, new Node(position, side, prediction));
      break;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const [parent, idx] = path[i];
      leafValue = -leafValue;
      parent.visits[idx]++;
      parent.total[idx] += leafValue;
    }
    if ((iteration + 1) % 8 === 0 || iteration + 1 === simulations) {
      options.progress?.(iteration + 1);
      await options.yieldControl?.();
    }
  }
  if (options.cancelled?.()) throw new Cancelled();
  const visits = new Int32Array(225),
    policy = new Float32Array(225);
  let total = 0,
    best = -1,
    action = 0;
  for (let i = 0; i < root.actions.length; i++) {
    const a = root.actions[i];
    visits[a] = root.visits[i];
    policy[a] = root.visits[i] / simulations;
    total += root.total[i];
  }
  for (let a = 0; a < 225; a++)
    if (policy[a] > best) {
      best = policy[a];
      action = a;
    }
  return {
    action,
    policy,
    visits,
    value: total / simulations,
    source: "mcts",
    simulations,
  };
}
export const coordinate = (a: number) =>
  String.fromCharCode(65 + (a % 15)) + (15 - Math.floor(a / 15));
