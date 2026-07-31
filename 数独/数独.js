'use strict';

/* ============================================================
 *  数独 Sudoku — 核心引擎 + UI（单文件，零依赖）
 *  难度按挖空数 + 技巧使用双重分级
 * ============================================================ */

/* -------------------- 1. 工具函数 -------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const deepCopy = b => b.map(r => r.slice());
const shuffle  = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* -------------------- 2. 常量与难度配置 -------------------- */
const N = 9;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const DIFFICULTY = {
  1: { name: '入门', holes: [36, 40], count: 10 },
  2: { name: '简单', holes: [42, 46], count: 12 },
  3: { name: '中等', holes: [48, 50], count: 15 },
  4: { name: '困难', holes: [52, 55], count: 15 },
  5: { name: '专家', holes: [56, 58], count: 20 }
};

const TECH_NAME = {
  single:    '基础排除',
  pair:      '显性数对',
  triple:    '显性三数集',
  quad:      '显性四数集',
  xwing:     'X-Wing',
  swordfish: '剑鱼',
  xychain:   'XY-Chain / 高级'
};

/* -------------------- 3. Board -------------------- */
const Board = {
  empty() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
  },

  isValidPlacement(board, r, c, num) {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === num) return false;
      if (board[i][c] === num) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[br + i][bc + j] === num) return false;
      }
    }
    return true;
  },

  isComplete(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) return false;
      }
    }
    return true;
  },

  findConflicts(board, r, c, num) {
    if (num === 0) return [];
    const conflicts = [];
    for (let i = 0; i < 9; i++) {
      if (i !== c && board[r][i] === num) conflicts.push([r, i]);
      if (i !== r && board[i][c] === num) conflicts.push([i, c]);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const rr = br + i, cc = bc + j;
        if ((rr !== r || cc !== c) && board[rr][cc] === num) {
          if (!conflicts.some(([a, b]) => a === rr && b === cc)) conflicts.push([rr, cc]);
        }
      }
    }
    return conflicts;
  }
};

/* -------------------- 4. Solver -------------------- */
const Solver = {
  solve(board) {
    const b = deepCopy(board);
    const empty = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] === 0) empty.push([r, c]);
      }
    }

    function bt(idx) {
      if (idx === empty.length) return true;
      const [r, c] = empty[idx];
      for (let n = 1; n <= 9; n++) {
        if (Board.isValidPlacement(b, r, c, n)) {
          b[r][c] = n;
          if (bt(idx + 1)) return true;
          b[r][c] = 0;
        }
      }
      return false;
    }

    return bt(0) ? b : null;
  },

  countSolutions(board, max = 2) {
    const b = deepCopy(board);
    let count = 0;
    let stop = false;

    function findBest() {
      let best = null;
      let bestCount = 10;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (b[r][c] !== 0) continue;
          let cnt = 0;
          for (let n = 1; n <= 9; n++) {
            if (Board.isValidPlacement(b, r, c, n)) cnt++;
          }
          if (cnt < bestCount) {
            bestCount = cnt;
            best = [r, c];
            if (cnt <= 1) return best;
          }
        }
      }
      return best;
    }

    function bt() {
      if (stop) return;
      const cell = findBest();
      if (!cell) {
        count++;
        if (count >= max) stop = true;
        return;
      }
      const [r, c] = cell;
      for (let n = 1; n <= 9; n++) {
        if (Board.isValidPlacement(b, r, c, n)) {
          b[r][c] = n;
          bt();
          b[r][c] = 0;
          if (stop) return;
        }
      }
    }

    bt();
    return count;
  }
};

/* -------------------- 5. Generator -------------------- */
const Generator = {
  generateFull() {
    const board = Board.empty();
    this._fillDiagonal(board);
    this._fillRest(board, 0, 0);
    return board;
  },

  _fillDiagonal(board) {
    for (let b = 0; b < 3; b++) {
      const nums = shuffle(DIGITS);
      let k = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          board[b * 3 + i][b * 3 + j] = nums[k++];
        }
      }
    }
  },

  _fillRest(board, r, c) {
    if (r === 9) return true;
    const nr = c === 8 ? r + 1 : r;
    const nc = c === 8 ? 0 : c + 1;
    if (board[r][c] !== 0) return this._fillRest(board, nr, nc);

    const nums = shuffle(DIGITS);
    for (const n of nums) {
      if (Board.isValidPlacement(board, r, c, n)) {
        board[r][c] = n;
        if (this._fillRest(board, nr, nc)) return true;
        board[r][c] = 0;
      }
    }
    return false;
  },

  generate(level) {
    const cfg = DIFFICULTY[level];
    const [hMin, hMax] = cfg.holes;
    const targetHoles = hMin + Math.floor(Math.random() * (hMax - hMin + 1));

    for (let attempt = 0; attempt < 8; attempt++) {
      const full = this.generateFull();
      const result = this._dig(full, targetHoles);
      if (result) return result;
    }
    const full = this.generateFull();
    return this._dig(full, hMin);
  },

  _dig(full, targetHoles) {
    const board = deepCopy(full);

    const pairs = [];
    for (let i = 0; i <= 40; i++) {
      const j = 80 - i;
      if (i < j) pairs.push([i, j]);
      else if (i === j) pairs.push([i]);
    }
    const shuffledPairs = shuffle(pairs);

    let removed = 0;
    for (const pair of shuffledPairs) {
      if (removed >= targetHoles) break;

      const toRemove = [];
      for (const idx of pair) {
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        if (board[r][c] !== 0) {
          toRemove.push({ r, c, val: board[r][c] });
          board[r][c] = 0;
        }
      }
      if (toRemove.length === 0) continue;

      const count = Solver.countSolutions(board, 2);
      if (count !== 1) {
        for (const { r, c, val } of toRemove) board[r][c] = val;
      } else {
        removed += toRemove.length;
      }
    }

    if (removed >= targetHoles) return { puzzle: board, solution: full };
    if (removed < targetHoles - 12) return null;

    const singles = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) singles.push([r, c]);
      }
    }
    const shuffledSingles = shuffle(singles);

    for (const [r, c] of shuffledSingles) {
      if (removed >= targetHoles) break;
      if (board[r][c] === 0) continue;
      const val = board[r][c];
      board[r][c] = 0;
      const count = Solver.countSolutions(board, 2);
      if (count !== 1) {
        board[r][c] = val;
      } else {
        removed++;
      }
    }

    return { puzzle: board, solution: full };
  }
};

/* -------------------- 6. 候选数与单元 -------------------- */
function getCandidates(board, r, c) {
  if (board[r][c] !== 0) return [];
  const used = new Set();
  for (let i = 0; i < 9; i++) {
    if (board[r][i] !== 0) used.add(board[r][i]);
    if (board[i][c] !== 0) used.add(board[i][c]);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[br + i][bc + j] !== 0) used.add(board[br + i][bc + j]);
    }
  }
  const cands = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) cands.push(n);
  return cands;
}

function getUnits() {
  const units = [];
  for (let r = 0; r < 9; r++) {
    const cells = [];
    for (let c = 0; c < 9; c++) cells.push([r, c]);
    units.push({ type: 'row', cells });
  }
  for (let c = 0; c < 9; c++) {
    const cells = [];
    for (let r = 0; r < 9; r++) cells.push([r, c]);
    units.push({ type: 'col', cells });
  }
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    const cells = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        cells.push([br + i, bc + j]);
      }
    }
    units.push({ type: 'box', cells });
  }
  return units;
}

/* -------------------- 7. Techniques -------------------- */
const Techniques = {
  findHiddenSingles(board) {
    const moves = [];
    for (let n = 1; n <= 9; n++) {
      for (let r = 0; r < 9; r++) {
        const places = [];
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0 && Board.isValidPlacement(board, r, c, n)) places.push([r, c]);
        }
        if (places.length === 1) moves.push({ r: places[0][0], c: places[0][1], value: n });
      }
      for (let c = 0; c < 9; c++) {
        const places = [];
        for (let r = 0; r < 9; r++) {
          if (board[r][c] === 0 && Board.isValidPlacement(board, r, c, n)) places.push([r, c]);
        }
        if (places.length === 1) moves.push({ r: places[0][0], c: places[0][1], value: n });
      }
      for (let b = 0; b < 9; b++) {
        const br = Math.floor(b / 3) * 3;
        const bc = (b % 3) * 3;
        const places = [];
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            if (board[br + i][bc + j] === 0 && Board.isValidPlacement(board, br + i, bc + j, n)) {
              places.push([br + i, bc + j]);
            }
          }
        }
        if (places.length === 1) moves.push({ r: places[0][0], c: places[0][1], value: n });
      }
    }
    return moves;
  },

  findNakedSubsets(board) {
    const units = getUnits();
    const moves = [];
    for (const unit of units) {
      const cells = unit.cells
        .filter(([r, c]) => board[r][c] === 0)
        .map(([r, c]) => ({ r, c, cands: getCandidates(board, r, c) }))
        .filter(c => c.cands.length >= 2 && c.cands.length <= 4);

      for (let size = 2; size <= 4; size++) {
        const byCands = {};
        for (const cell of cells) {
          if (cell.cands.length !== size) continue;
          const key = cell.cands.slice().sort().join('');
          if (!byCands[key]) byCands[key] = [];
          byCands[key].push(cell);
        }
        for (const [key, list] of Object.entries(byCands)) {
          if (list.length === size) {
            const cands = key.split('').map(Number);
            moves.push({ unit, subset: list, cands, tech: size });
          }
        }
      }
    }
    return moves;
  },

  findXWings(board) {
    const moves = [];
    for (let n = 1; n <= 9; n++) {
      const rowCols = [];
      for (let r = 0; r < 9; r++) {
        const cols = [];
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0 && Board.isValidPlacement(board, r, c, n)) cols.push(c);
        }
        rowCols.push(cols);
      }
      for (let r1 = 0; r1 < 9; r1++) {
        if (rowCols[r1].length !== 2) continue;
        for (let r2 = r1 + 1; r2 < 9; r2++) {
          if (rowCols[r2].length === 2 &&
              rowCols[r1][0] === rowCols[r2][0] &&
              rowCols[r1][1] === rowCols[r2][1]) {
            moves.push({ digit: n, rows: [r1, r2], cols: rowCols[r1].slice(), dir: 'row', tech: 'xwing' });
          }
        }
      }
      const colRows = [];
      for (let c = 0; c < 9; c++) {
        const rows = [];
        for (let r = 0; r < 9; r++) {
          if (board[r][c] === 0 && Board.isValidPlacement(board, r, c, n)) rows.push(r);
        }
        colRows.push(rows);
      }
      for (let c1 = 0; c1 < 9; c1++) {
        if (colRows[c1].length !== 2) continue;
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          if (colRows[c2].length === 2 &&
              colRows[c1][0] === colRows[c2][0] &&
              colRows[c1][1] === colRows[c2][1]) {
            moves.push({ digit: n, cols: [c1, c2], rows: colRows[c1].slice(), dir: 'col', tech: 'xwing' });
          }
        }
      }
    }
    return moves;
  },

  findSwordfish(board) {
    const moves = [];
    for (let n = 1; n <= 9; n++) {
      const rowCols = [];
      for (let r = 0; r < 9; r++) {
        const cols = [];
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0 && Board.isValidPlacement(board, r, c, n)) cols.push(c);
        }
        rowCols.push(cols);
      }
      const candidates = [];
      for (let r = 0; r < 9; r++) {
        if (rowCols[r].length >= 2 && rowCols[r].length <= 3) candidates.push(r);
      }
      if (candidates.length < 3) continue;
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          for (let k = j + 1; k < candidates.length; k++) {
            const r1 = candidates[i], r2 = candidates[j], r3 = candidates[k];
            const all = [...rowCols[r1], ...rowCols[r2], ...rowCols[r3]];
            const uniq = [...new Set(all)];
            if (uniq.length === 3) {
              moves.push({ digit: n, rows: [r1, r2, r3], cols: uniq, tech: 'swordfish' });
            }
          }
        }
      }
    }
    return moves;
  }
};

/* -------------------- 8. Difficulty 评估 -------------------- */
const Difficulty = {
  estimateMaxTech(board) {
    const empties = board.flat().filter(x => x === 0).length;
    if (empties <= 41) return 'single';
    if (empties <= 47) return 'pair';
    if (empties <= 51) return 'xwing';
    if (empties <= 55) return 'swordfish';
    return 'xychain';
  },

  estimate(board) {
    const empties = board.flat().filter(x => x === 0).length;
    let level;
    if (empties <= 40) level = 1;
    else if (empties <= 46) level = 2;
    else if (empties <= 50) level = 3;
    else if (empties <= 55) level = 4;
    else level = 5;
    return level;
  }
};

/* -------------------- 9. 题目池（按需生成 + 预热） -------------------- */
const PuzzlePool = {
  pool: {},
  pending: new Map(),

  async get(level, index) {
    const cfg = DIFFICULTY[level];
    if (index < 0 || index >= cfg.count) throw new Error('out of range');

    if (!this.pool[level]) this.pool[level] = new Array(cfg.count).fill(null);
    if (this.pool[level][index]) return this.pool[level][index];

    const key = `${level}:${index}`;
    if (this.pending.has(key)) return this.pending.get(key);

    const promise = new Promise(resolve => {
      setTimeout(() => {
        const item = Generator.generate(level);
        const tech = Difficulty.estimateMaxTech(item.puzzle);
        const result = {
          id: key,
          puzzle: item.puzzle,
          solution: item.solution,
          tech,
          estimatedLevel: Difficulty.estimate(item.puzzle)
        };
        this.pool[level][index] = result;
        this.pending.delete(key);
        resolve(result);
      }, 0);
    });

    this.pending.set(key, promise);
    return promise;
  },

  warmUp(level, from, ahead) {
    const cfg = DIFFICULTY[level];
    const end = Math.min(from + ahead, cfg.count);
    for (let i = from; i < end; i++) {
      this.get(level, i).catch(() => {});
    }
  }
};

/* -------------------- 10. UI 控制器 -------------------- */
const UI = {
  state: null,

  init() {
    this.state = {
      level: null,
      puzzleIndex: 0,
      puzzle: null,
      board: null,
      solution: null,
      given: null,
      notes: null,
      selected: null,
      noteMode: false,
      history: [],
      errors: 0,
      hints: 3,
      startTime: 0,
      elapsed: 0,
      timerHandle: null,
      completed: false,
      paused: false
    };

    this.cacheDom();
    this.bindEvents();
    this.showHome();
  },

  cacheDom() {
    this.dom = {
      homeView:     $('#homeView'),
      gameView:     $('#gameView'),
      diffList:     $('#diffList'),
      board:        $('#board'),
      timer:        $('#timer'),
      errors:       $('#errors'),
      hints:        $('#hints'),
      hintBtn:      $('#hintBtn'),
      undoBtn:      $('#undoBtn'),
      eraseBtn:     $('#eraseBtn'),
      noteBtn:      $('#noteBtn'),
      newBtn:       $('#newBtn'),
      resetBtn:     $('#resetBtn'),
      backBtn:      $('#backBtn'),
      winModal:     $('#winModal'),
      winTime:      $('#winTime'),
      winErrors:    $('#winErrors'),
      winTech:      $('#winTech'),
      winCloseBtn:  $('#winCloseBtn'),
      winHomeBtn:   $('#winHomeBtn'),
      titleLevel:   $('#titleLevel'),
      puzzleNav:    $('#puzzleNav'),
      puzzlePrev:   $('#puzzlePrev'),
      puzzleNext:   $('#puzzleNext'),
      puzzleLabel:  $('#puzzleLabel'),
      numKeys:      $$('.num-key'),
      numpad:       $('#numpad'),
      toolbar:      $('.toolbar')
    };
  },

  bindEvents() {
    this.dom.board.addEventListener('click', e => this.onBoardClick(e));
    document.addEventListener('keydown', e => this.onKeyDown(e));

    this.dom.numKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        const v = Number(btn.dataset.value);
        this.onNumber(v);
      });
    });

    this.dom.eraseBtn.addEventListener('click', () => this.onNumber(0));
    this.dom.noteBtn.addEventListener('click', () => this.toggleNoteMode());
    this.dom.undoBtn.addEventListener('click', () => this.undo());
    this.dom.hintBtn.addEventListener('click', () => this.giveHint());
    this.dom.resetBtn.addEventListener('click', () => this.resetPuzzle());
    this.dom.newBtn.addEventListener('click', () => this.loadNextPuzzle());
    this.dom.backBtn.addEventListener('click', () => this.showHome());
    this.dom.puzzlePrev.addEventListener('click', () => this.switchPuzzle(-1));
    this.dom.puzzleNext.addEventListener('click', () => this.switchPuzzle(1));
    this.dom.winCloseBtn.addEventListener('click', () => this.hideWinModal());
    this.dom.winHomeBtn.addEventListener('click', () => {
      this.hideWinModal();
      this.showHome();
    });
  },

  showHome() {
    this.stopTimer();
    this.dom.gameView.hidden = true;
    this.dom.homeView.hidden = false;
    this.renderDifficultyList();
  },

  showGame() {
    this.dom.homeView.hidden = true;
    this.dom.gameView.hidden = false;
  },

  renderDifficultyList() {
    this.dom.diffList.innerHTML = '';
    Object.entries(DIFFICULTY).forEach(([lv, cfg]) => {
      const card = document.createElement('div');
      card.className = 'diff-card';
      card.innerHTML = `
        <div class="diff-level">Lv ${lv}</div>
        <div class="diff-name">${cfg.name}</div>
        <div class="diff-meta">${cfg.holes[0]}-${cfg.holes[1]} 空</div>
        <div class="diff-meta">${cfg.count} 题</div>
        <div class="diff-best" data-best="best-${lv}"></div>
      `;
      card.addEventListener('click', () => this.startLevel(Number(lv)));
      this.dom.diffList.appendChild(card);
    });
    this.refreshBest();
  },

  refreshBest() {
    for (const lv of Object.keys(DIFFICULTY)) {
      const best = localStorage.getItem(`sudoku:best:${lv}`);
      const el = this.dom.diffList.querySelector(`[data-best="best-${lv}"]`);
      if (el) {
        if (best) {
          const data = JSON.parse(best);
          el.textContent = `最佳 ${formatTime(data.time)} · ${data.errors} 错`;
        } else {
          el.textContent = '尚无记录';
        }
      }
    }
  },

  async startLevel(level) {
    this.state.level = level;
    this.state.puzzleIndex = 0;
    this.showGame();
    this.dom.titleLevel.textContent = `Lv ${level} ${DIFFICULTY[level].name}`;
    this.renderPuzzleNav();
    PuzzlePool.warmUp(level, 0, 3);
    await this.loadPuzzle(0);
  },

  renderPuzzleNav() {
    const cfg = DIFFICULTY[this.state.level];
    this.dom.puzzleNav.hidden = false;
    this.dom.puzzleLabel.textContent = `${this.state.puzzleIndex + 1} / ${cfg.count}`;
  },

  async loadPuzzle(index) {
    const cfg = DIFFICULTY[this.state.level];
    this.state.puzzleIndex = Math.max(0, Math.min(cfg.count - 1, index));
    this.dom.puzzleLabel.textContent = `${this.state.puzzleIndex + 1} / ${cfg.count}`;

    this.dom.puzzlePrev.disabled = this.state.puzzleIndex === 0;
    this.dom.puzzleNext.disabled = this.state.puzzleIndex === cfg.count - 1;

    this.setLoading(true);
    const item = await PuzzlePool.get(this.state.level, this.state.puzzleIndex);
    PuzzlePool.warmUp(this.state.level, this.state.puzzleIndex + 1, 2);

    if (this.state.puzzleIndex !== index) return;

    this.state.puzzle = item;
    this.state.solution = item.solution;
    this.state.board = deepCopy(item.puzzle);
    this.state.given = item.puzzle.map(row => row.map(v => v !== 0));
    this.state.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
    this.state.history = [];
    this.state.errors = 0;
    this.state.hints = 3;
    this.state.selected = null;
    this.state.noteMode = false;
    this.state.completed = false;
    this.state.elapsed = 0;
    this.updateNoteBtn();
    this.startTimer();
    this.renderBoard();
    this.updateStats();
    this.dom.hintBtn.disabled = false;
    this.dom.hintBtn.title = `提示 (${this.state.hints} 次剩余)`;
    this.setLoading(false);
  },

  setLoading(on) {
    this.dom.board.classList.toggle('loading', on);
    this.dom.numpad.classList.toggle('disabled', on);
    this.dom.toolbar.classList.toggle('disabled', on);
  },

  switchPuzzle(delta) {
    this.loadPuzzle(this.state.puzzleIndex + delta);
  },

  loadNextPuzzle() {
    const cfg = DIFFICULTY[this.state.level];
    if (this.state.puzzleIndex < cfg.count - 1) {
      this.loadPuzzle(this.state.puzzleIndex + 1);
    } else {
      this.showDifficultyModal();
    }
  },

  resetPuzzle() {
    this.state.board = deepCopy(this.state.puzzle);
    this.state.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
    this.state.history = [];
    this.state.errors = 0;
    this.state.selected = null;
    this.state.completed = false;
    this.state.elapsed = 0;
    this.renderBoard();
    this.updateStats();
    this.startTimer();
  },

  startTimer() {
    this.stopTimer();
    this.state.startTime = Date.now() - this.state.elapsed;
    this.state.timerHandle = setInterval(() => {
      if (this.state.completed) return;
      this.state.elapsed = Date.now() - this.state.startTime;
      this.dom.timer.textContent = formatTime(this.state.elapsed);
    }, 250);
  },

  stopTimer() {
    if (this.state.timerHandle) {
      clearInterval(this.state.timerHandle);
      this.state.timerHandle = null;
    }
  },

  updateStats() {
    this.dom.errors.textContent = this.state.errors;
    this.dom.hints.textContent = this.state.hints;
    this.dom.hintBtn.disabled = this.state.hints <= 0;
    this.dom.hintBtn.title = this.state.hints > 0 ? `提示 (剩余 ${this.state.hints})` : '提示次数已用完';
  },

  renderBoard() {
    this.dom.board.innerHTML = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (this.state.given[r][c]) cell.classList.add('given');

        if (r % 3 === 2 && r < 8) cell.classList.add('box-bottom');
        if (c % 3 === 2 && c < 8) cell.classList.add('box-right');

        const v = this.state.board[r][c];
        if (v !== 0) {
          const num = document.createElement('span');
          num.className = 'cell-num';
          num.textContent = v;
          cell.appendChild(num);
        } else if (this.state.notes[r][c].size > 0) {
          const notes = document.createElement('div');
          notes.className = 'cell-notes';
          for (let n = 1; n <= 9; n++) {
            const span = document.createElement('span');
            span.className = 'cell-note';
            if (this.state.notes[r][c].has(n)) span.textContent = n;
            notes.appendChild(span);
          }
          cell.appendChild(notes);
        }

        this.dom.board.appendChild(cell);
      }
    }
    this.applySelectionStyles();
    this.applyConflicts();
    this.applyHighlights();
  },

  applySelectionStyles() {
    const cells = $$('.cell', this.dom.board);
    cells.forEach(c => c.classList.remove('selected', 'peer', 'same-num'));

    if (!this.state.selected) return;
    const [sr, sc] = this.state.selected;
    const selVal = this.state.board[sr][sc];

    cells.forEach(c => {
      const r = Number(c.dataset.r);
      const cc = Number(c.dataset.c);
      if (r === sr && cc === sc) c.classList.add('selected');
      else if (r === sr || cc === sc ||
               (Math.floor(r / 3) === Math.floor(sr / 3) &&
                Math.floor(cc / 3) === Math.floor(sc / 3))) {
        c.classList.add('peer');
        if (selVal !== 0 && this.state.board[r][cc] === selVal && !(r === sr && cc === sc)) {
          c.classList.add('same-num');
        }
      }
    });
  },

  applyConflicts() {
    const cells = $$('.cell', this.dom.board);
    cells.forEach(c => c.classList.remove('error'));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = this.state.board[r][c];
        if (v === 0 || this.state.given[r][c]) continue;
        if (Board.findConflicts(this.state.board, r, c, v).length > 0) {
          cells[r * 9 + c].classList.add('error');
        }
      }
    }
  },

  applyHighlights() {
    const cells = $$('.cell', this.dom.board);
    if (!this.state.selected) return;
    const [sr, sc] = this.state.selected;
    const v = this.state.board[sr][sc];
    if (v === 0) return;
    cells.forEach(c => {
      const r = Number(c.dataset.r);
      const cc = Number(c.dataset.c);
      if (this.state.board[r][cc] === v && !(r === sr && cc === sc)) {
        c.classList.add('same-num');
      }
    });
  },

  onBoardClick(e) {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    if (this.state.completed) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    this.state.selected = [r, c];
    this.applySelectionStyles();
    this.applyHighlights();
  },

  onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.dom.gameView || this.dom.gameView.hidden) return;
    if (this.state.completed) return;
    const k = e.key;
    if (/^[1-9]$/.test(k)) {
      e.preventDefault();
      this.onNumber(Number(k));
    } else if (k === 'Backspace' || k === 'Delete' || k === '0') {
      e.preventDefault();
      this.onNumber(0);
    } else if (k === 'n' || k === 'N') {
      e.preventDefault();
      this.toggleNoteMode();
    } else if (k === 'z' || k === 'Z') {
      if (e.shiftKey) { e.preventDefault(); this.undo(); }
    } else if (k === 'h' || k === 'H') {
      e.preventDefault();
      this.giveHint();
    } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      this.moveSelection(k);
    }
  },

  moveSelection(key) {
    let [r, c] = this.state.selected || [0, 0];
    if (key === 'ArrowUp')    r = (r + 8) % 9;
    if (key === 'ArrowDown')  r = (r + 1) % 9;
    if (key === 'ArrowLeft')  c = (c + 8) % 9;
    if (key === 'ArrowRight') c = (c + 1) % 9;
    this.state.selected = [r, c];
    this.applySelectionStyles();
    this.applyHighlights();
  },

  onNumber(v) {
    if (!this.state.selected || this.state.completed) return;
    const [r, c] = this.state.selected;
    if (this.state.given[r][c]) return;

    if (this.state.noteMode && v !== 0) {
      const note = this.state.notes[r][c];
      if (note.has(v)) note.delete(v);
      else note.add(v);
      this.renderBoard();
      return;
    }

    this.state.history.push({
      r, c,
      prev: this.state.board[r][c],
      prevNotes: new Set(this.state.notes[r][c])
    });

    if (v === 0) {
      this.state.board[r][c] = 0;
      this.state.notes[r][c] = new Set();
    } else {
      this.state.board[r][c] = v;
      this.state.notes[r][c] = new Set();
      const conflicts = Board.findConflicts(this.state.board, r, c, v);
      if (conflicts.length > 0) {
        this.state.errors++;
        this.updateStats();
      }
    }

    this.renderBoard();

    if (Board.isComplete(this.state.board) &&
        this.checkWin()) {
      this.onWin();
    }
  },

  checkWin() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.state.board[r][c] !== this.state.solution[r][c]) return false;
      }
    }
    return true;
  },

  onWin() {
    this.state.completed = true;
    this.stopTimer();
    const time = this.state.elapsed;
    const key = `sudoku:best:${this.state.level}`;
    const prev = localStorage.getItem(key);
    const newRecord = { time, errors: this.state.errors, date: Date.now() };
    if (prev) {
      const old = JSON.parse(prev);
      if (time < old.time || (time === old.time && this.state.errors < old.errors)) {
        localStorage.setItem(key, JSON.stringify(newRecord));
      }
    } else {
      localStorage.setItem(key, JSON.stringify(newRecord));
    }

    this.dom.winTime.textContent = formatTime(time);
    this.dom.winErrors.textContent = this.state.errors;
    this.dom.winTech.textContent = TECH_NAME[this.state.puzzle.tech] || this.state.puzzle.tech;
    this.dom.winModal.classList.add('show');
  },

  hideWinModal() {
    this.dom.winModal.classList.remove('show');
    this.loadNextPuzzle();
  },

  toggleNoteMode() {
    this.state.noteMode = !this.state.noteMode;
    this.updateNoteBtn();
  },

  updateNoteBtn() {
    this.dom.noteBtn.classList.toggle('active', this.state.noteMode);
    this.dom.noteBtn.textContent = this.state.noteMode ? '笔记 开' : '笔记 关';
  },

  undo() {
    if (this.state.history.length === 0) return;
    const last = this.state.history.pop();
    this.state.board[last.r][last.c] = last.prev;
    this.state.notes[last.r][last.c] = last.prevNotes;
    this.renderBoard();
  },

  giveHint() {
    if (this.state.hints <= 0 || this.state.completed) return;
    const empties = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.state.board[r][c] === 0) empties.push([r, c]);
      }
    }
    if (empties.length === 0) return;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    const v = this.state.solution[r][c];

    this.state.history.push({
      r, c,
      prev: this.state.board[r][c],
      prevNotes: new Set(this.state.notes[r][c])
    });
    this.state.board[r][c] = v;
    this.state.notes[r][c] = new Set();
    this.state.hints--;
    this.updateStats();
    this.renderBoard();

    if (Board.isComplete(this.state.board) && this.checkWin()) this.onWin();
  }
};

/* -------------------- 11. 格式化 -------------------- */
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${String(m).padStart(2, '0')}:${ss}`;
}

/* -------------------- 12. 启动 -------------------- */
window.addEventListener('DOMContentLoaded', () => UI.init());