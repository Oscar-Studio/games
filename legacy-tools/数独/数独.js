import { DIFFICULTY, TECH_NAME, generatePuzzle } from './engine.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const deepCopy = b => b.map(r => r.slice());
const Board = {
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

const puzzlePool = new Map();

function getPuzzle(level, index) {
  const key = `${level}:${index}`;
  if (!puzzlePool.has(key)) {
    const pending = new Promise(resolve => setTimeout(resolve, 0))
      .then(() => generatePuzzle(level))
      .catch(error => {
        puzzlePool.delete(key);
        throw error;
      });
    puzzlePool.set(key, pending);
  }
  return puzzlePool.get(key);
}

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
      loadId: 0,
      loading: false
    };

    this.cacheDom();
    this.bindEvents();
    this.showHome();
  },

  cacheDom() {
    this.dom = {
      homeView:     $('#homeView'),
      loadError:    $('#loadError'),
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
    this.dom.winCloseBtn.addEventListener('click', () => {
      this.dom.winModal.classList.remove('show');
      this.loadNextPuzzle();
    });
    this.dom.winHomeBtn.addEventListener('click', () => this.showHome());
  },

  showHome() {
    this.state.loadId++;
    this.stopTimer();
    this.dom.winModal.classList.remove('show');
    this.dom.gameView.hidden = true;
    this.dom.homeView.hidden = false;
    this.renderDifficultyList();
  },

  showGame() {
    this.dom.loadError.hidden = true;
    this.dom.homeView.hidden = true;
    this.dom.gameView.hidden = false;
  },

  renderDifficultyList() {
    this.dom.diffList.innerHTML = '';
    Object.entries(DIFFICULTY).forEach(([lv, cfg]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'diff-card';
      card.innerHTML = `
        <div class="diff-level">Lv ${lv}</div>
        <div class="diff-name">${cfg.name}</div>
        <div class="diff-description">${cfg.description}</div>
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

    const loadId = ++this.state.loadId;
    this.stopTimer();
    this.setLoading(true);
    let item;
    try {
      item = await getPuzzle(this.state.level, this.state.puzzleIndex);
    } catch (error) {
      if (loadId !== this.state.loadId) return;
      console.error(error);
      this.showHome();
      this.dom.loadError.hidden = false;
      return;
    }
    if (loadId !== this.state.loadId) return;

    this.state.puzzle = item;
    this.state.solution = item.solution;
    this.state.given = item.puzzle.map(row => row.map(v => v !== 0));
    this.resetPuzzle();
    this.setLoading(false);
  },

  setLoading(on) {
    this.state.loading = on;
    this.dom.board.parentElement.classList.toggle('loading', on);
    this.dom.board.setAttribute('aria-busy', String(on));
    this.dom.numpad.inert = on;
    this.dom.toolbar.inert = on;
  },

  switchPuzzle(delta) {
    this.loadPuzzle(this.state.puzzleIndex + delta);
  },

  loadNextPuzzle() {
    const cfg = DIFFICULTY[this.state.level];
    if (this.state.puzzleIndex < cfg.count - 1) {
      this.loadPuzzle(this.state.puzzleIndex + 1);
    } else {
      this.showHome();
    }
  },

  resetPuzzle() {
    this.state.board = deepCopy(this.state.puzzle.puzzle);
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
    this.renderBoard();
    this.updateStats();
    this.dom.timer.textContent = formatTime(0);
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
    if (this.state.completed || this.state.loading) return;
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
    const lastPuzzle = this.state.puzzleIndex === DIFFICULTY[this.state.level].count - 1;
    this.dom.winCloseBtn.hidden = lastPuzzle;
    this.dom.winModal.classList.add('show');
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
