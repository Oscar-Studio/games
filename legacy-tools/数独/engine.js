const CELLS = Array.from({ length: 81 }, (_, i) => i);
const DIGITS = Array.from({ length: 9 }, (_, i) => i + 1);
const ALL = 0x1ff;
const bit = digit => 1 << (digit - 1);
const digitOf = mask => 32 - Math.clz32(mask);
const SIZE = Array.from({ length: ALL + 1 }, (_, mask) => {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
});

const rowOf = i => Math.floor(i / 9);
const colOf = i => i % 9;
const boxOf = i => Math.floor(i / 27) * 3 + Math.floor(colOf(i) / 3);
const groupOf = [rowOf, colOf, boxOf];
const groups = groupOf.map(getGroup =>
  Array.from({ length: 9 }, (_, n) => CELLS.filter(i => getGroup(i) === n))
);
const UNITS = groups.flat();
const CELL_GROUPS = CELLS.map(i => groupOf.map(getGroup => getGroup(i)));
const PEERS = CELLS.map(i => [...new Set([
  ...groups[0][rowOf(i)], ...groups[1][colOf(i)], ...groups[2][boxOf(i)]
])].filter(j => j !== i));

export const DIFFICULTY = {
  1: { name: '入门', description: '每步都能直接找出唯一候选数', holes: [22, 29], count: 10 },
  2: { name: '简单', description: '在行、列或宫里找数字的唯一位置', holes: [34, 47], count: 12 },
  3: { name: '中等', description: '用行列与宫的交叉关系排除候选数', holes: [42, 56], count: 15 },
  4: { name: '困难', description: '用显性数对排除其他格的候选数', holes: [45, 57], count: 15 },
  5: { name: '专家', description: '需要显性三数集或 X-Wing', holes: [47, 58], count: 20 }
};

export const TECH_NAME = {
  nakedSingle: '显性唯一',
  hiddenSingle: '隐性唯一',
  locked: '区块排除',
  pair: '显性数对',
  triple: '显性三数集',
  xWing: 'X-Wing'
};

function shuffle(values) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function candidates(board, i) {
  let mask = ALL;
  for (const peer of PEERS[i]) {
    if (board[peer]) mask &= ~bit(board[peer]);
  }
  return mask;
}

function search(board, limit, digitOrder = DIGITS) {
  const grid = board.slice();
  const used = groups.map(() => Array(9).fill(0));
  for (const i of CELLS) {
    if (!grid[i]) continue;
    const [r, c, b] = CELL_GROUPS[i];
    const mask = bit(grid[i]);
    if ((used[0][r] | used[1][c] | used[2][b]) & mask) return { count: 0 };
    used[0][r] |= mask;
    used[1][c] |= mask;
    used[2][b] |= mask;
  }
  let count = 0;
  let solution;
  function visit() {
    let cell = -1;
    let choices = 0;
    let fewest = 10;
    for (const i of CELLS) {
      if (grid[i]) continue;
      const [r, c, b] = CELL_GROUPS[i];
      const mask = ALL & ~(used[0][r] | used[1][c] | used[2][b]);
      if (SIZE[mask] < fewest) {
        cell = i;
        choices = mask;
        fewest = SIZE[mask];
        if (fewest <= 1) break;
      }
    }
    if (cell === -1) {
      solution = grid.slice();
      count++;
      return;
    }
    const [r, c, b] = CELL_GROUPS[cell];
    for (const digit of digitOrder) {
      const mask = bit(digit);
      if (!(choices & mask)) continue;
      grid[cell] = digit;
      used[0][r] |= mask;
      used[1][c] |= mask;
      used[2][b] |= mask;
      visit();
      used[0][r] ^= mask;
      used[1][c] ^= mask;
      used[2][b] ^= mask;
      if (count === limit) break;
    }
    grid[cell] = 0;
  }
  visit();
  return { count, solution };
}

export function countSolutions(board) {
  return search(board.flat(), 2).count;
}

function hiddenSingles(masks, moves) {
  for (const unit of UNITS) {
    let seen = 0;
    let repeated = 0;
    for (const i of unit) {
      repeated |= seen & masks[i];
      seen |= masks[i];
    }
    const unique = seen & ~repeated;
    for (const i of unit) {
      const match = masks[i] & unique;
      if (SIZE[match] === 1) moves[i] = match;
    }
  }
}

function lockedCandidates(masks, removed) {
  // 检查行↔宫、列↔宫。候选数如果全落在交集内，就能从目标单元的其余格排除。
  for (const [source, target] of [[0, 2], [1, 2], [2, 0], [2, 1]]) {
    groups[source].forEach((unit, index) => {
      for (const digit of DIGITS) {
        const mask = bit(digit);
        const places = unit.filter(i => masks[i] & mask);
        if (places.length < 2 || places.length > 3) continue;
        const common = CELL_GROUPS[places[0]][target];
        if (!places.every(i => CELL_GROUPS[i][target] === common)) continue;
        for (const i of groups[target][common]) {
          if (CELL_GROUPS[i][source] !== index) removed[i] |= masks[i] & mask;
        }
      }
    });
  }
}

function nakedSubset(masks, removed, size) {
  for (const unit of UNITS) {
    const cells = unit.filter(i => SIZE[masks[i]] >= 2 && SIZE[masks[i]] <= size);
    function choose(start, selected, union) {
      if (selected.length === size) {
        if (SIZE[union] === size) {
          for (const i of unit) {
            if (!selected.includes(i)) removed[i] |= masks[i] & union;
          }
        }
        return;
      }
      for (let j = start; j <= cells.length - (size - selected.length); j++) {
        const i = cells[j];
        const next = union | masks[i];
        if (SIZE[next] <= size) choose(j + 1, [...selected, i], next);
      }
    }
    choose(0, [], 0);
  }
}

function xWing(masks, removed) {
  for (const lines of groups.slice(0, 2)) {
    for (const digit of DIGITS) {
      const mask = bit(digit);
      const positions = lines.map(line => line.reduce((found, i, index) =>
        found | (masks[i] & mask ? 1 << index : 0), 0));
      for (let a = 0; a < 8; a++) {
        if (SIZE[positions[a]] !== 2) continue;
        for (let b = a + 1; b < 9; b++) {
          if (positions[a] !== positions[b]) continue;
          lines.forEach((line, index) => {
            if (index === a || index === b) return;
            line.forEach((i, offset) => {
              if (positions[a] & (1 << offset)) removed[i] |= masks[i] & mask;
            });
          });
        }
      }
    }
  }
}

const ELIMINATIONS = [
  ['locked', 3, lockedCandidates],
  ['pair', 4, (masks, removed) => nakedSubset(masks, removed, 2)],
  ['triple', 5, (masks, removed) => nakedSubset(masks, removed, 3)],
  ['xWing', 5, xWing]
];

export function ratePuzzle(board, maxLevel = 5) {
  const grid = board.flat();
  if (grid.some((value, i) => value && !(candidates(grid, i) & bit(value)))) return null;
  const masks = grid.map((value, i) => value ? 0 : candidates(grid, i));
  const openingSingles = masks.filter(mask => SIZE[mask] === 1).length;
  let level = 1;
  let tech = 'nakedSingle';

  // 每轮先做最简单的有效推理，保留之前消去的候选数。
  while (grid.includes(0)) {
    if (grid.some((value, i) => !value && !masks[i])) return null;
    const moves = masks.map(mask => SIZE[mask] === 1 ? mask : 0);
    if (!moves.some(Boolean) && maxLevel >= 2) {
      hiddenSingles(masks, moves);
      if (moves.some(Boolean) && level < 2) {
        level = 2;
        tech = 'hiddenSingle';
      }
    }
    if (moves.some(Boolean)) {
      for (const i of CELLS) {
        if (!moves[i]) continue;
        if (!(masks[i] & moves[i])) return null;
        grid[i] = digitOf(moves[i]);
        masks[i] = 0;
        for (const peer of PEERS[i]) masks[peer] &= ~moves[i];
      }
      continue;
    }

    const removed = Array(81).fill(0);
    const step = ELIMINATIONS.find(([, rank, apply]) => {
      if (rank > maxLevel) return false;
      apply(masks, removed);
      return removed.some(Boolean);
    });
    if (!step) return null;
    const [technique, rank] = step;
    if (rank > level) {
      tech = technique;
      level = rank;
    }
    for (const i of CELLS) masks[i] &= ~removed[i];
  }
  return { level, tech, openingSingles, solution: toRows(grid) };
}

function toRows(grid) {
  return groups[0].map(row => row.map(i => grid[i]));
}

function generateAttempt(level) {
  const [min, max] = DIFFICULTY[level].holes;
  const startRatingAt = level === 1 ? min + Math.floor(Math.random() * (max - min + 1)) : min;
  const full = search(Array(81).fill(0), 1, shuffle(DIGITS)).solution;
  const puzzle = full.slice();
  let holes = 0;

  for (const i of shuffle(CELLS)) {
    puzzle[i] = 0;
    if (search(puzzle, 2).count !== 1) {
      puzzle[i] = full[i];
      continue;
    }
    if (++holes < startRatingAt) continue;
    const board = toRows(puzzle);
    const rating = ratePuzzle(board, level);
    if (rating?.level === level && (level !== 1 || rating.openingSingles >= 8)) {
      return { puzzle: board, ...rating };
    }
    if (holes === max) break;
  }
  return null;
}

// 随机挖空达到尝试上限后，使用同级已验证题型，避免降级或无限重试。
const FALLBACKS = [
  [
    '507206049200100537149537206375012498418050762602874350701308924820491605064005003',
    '196538704538704006724006508900800040203009685045302017617083402359247061402050079',
    '030004068274060039108530070395412607610850002402790001951307006720601490846920710',
    '480927051920651400001083007804709010062148370719235846306870195098516034100390260'
  ],
  [
    '930020470120078030000905006000640000700003000601250304500060007013780600000009240',
    '900000000620071903071000605030506002002098056006007094094002160068000530100300000',
    '045807200860200345200005807053700196000900070098000430500000001080092050070003020',
    '000070020670304590304090008010006207007409006800010903003980000760003010480100039'
  ],
  [
    '040736500036000041520040700010000090053004160090300405000400000304205600002078350',
    '400003090003190406100406583060010000010000635370800240000008000800000304030004802',
    '000000000072084900104035070350016040800000000000008301000020008760801250020509000',
    '090675020605400800020893005008540207200000000506000000004007102000000508102068700',
    '400000000760015000010408009080920050000000000000081302000390071600002900500070003',
    '008001000090030708402700090000000329009070010005080004070600053000000100010057000',
    '400008300508012070000070500000000026030047005800690003043780000057000800080950000',
    '100975030900430100002006000860009300040010059020000000610000000008000560250001008'
  ],
  [
    '000520047000007000300069021600030002002000010075200083900000000250470008004050000',
    '900801050001600030600037800000060000002000018000005300790010000080500070010709003',
    '004020001020891350890050607040700012900000000016040000030070069000900700000003005',
    '070000000008901004051270300002800000006120080803045709420006100600500000000000000',
    '000000003002063800000800150090201030070000000000006407000405300010000090326918000',
    '000050700003000400026400003094301200000008900060000007900830000018007000002904578',
    '700200010206000709018040000000000080000800900682090403073060000500080600001907030',
    '000020701600000090080005000900400002002130006006050000030900160000007050040000070'
  ],
  [
    '700090010200406703400000095037002000009000050000930800370000000008060000650307948',
    '000025104805104070104906005709000040000400058048000001000000403007000069003689000',
    '875001009001309070000000060008000006400907000000050003003000000020000108010028037',
    '180603000040700100705080000000000000000510230350009807200800560008000000509201000',
    '410000000708000400000019020000860300062001080000000000040002000000350004083900000'
  ],
];

function shuffledAxis() {
  return shuffle([0, 1, 2]).flatMap(band => shuffle([0, 1, 2]).map(i => band * 3 + i));
}

function fallbackPuzzle(level) {
  const seeds = FALLBACKS[level - 1];
  const seed = seeds[Math.floor(Math.random() * seeds.length)];
  const rows = shuffledAxis();
  const cols = shuffledAxis();
  const digits = [0, ...shuffle(DIGITS)];
  const transpose = Math.random() < 0.5;
  const puzzle = rows.map(r => cols.map(c => digits[seed[transpose ? c * 9 + r : r * 9 + c]]));
  return { puzzle, ...ratePuzzle(puzzle, level) };
}

export function generatePuzzle(level) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = generateAttempt(level);
    if (result) return result;
  }
  return fallbackPuzzle(level);
}
