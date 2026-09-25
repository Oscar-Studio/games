/* ============================================================
 *  猜数字 — 游戏逻辑
 *  1A2B 数字模式 + Mastermind 颜色模式
 *  评分：用经典 bulls/cows 算法
 *    bulls = Σ(guess[i] === secret[i])
 *    cows  = Σ min(countGuess(v), countSecret(v)) - bulls  (v ≠ bulls)
 * ============================================================ */

(function () {
  'use strict';

  // ----- 静态配置 -----
  const DIFFICULTIES = {
    easy:   { positions: 3, attempts: 6,  label: '易' },
    medium: { positions: 4, attempts: 8,  label: '中' },
    hard:   { positions: 5, attempts: 10, label: '难' }
  };

  const COLORS = [
    { id: 0, name: '红', icon: '●', hex: '#ef4444' },
    { id: 1, name: '橙', icon: '▲', hex: '#fb923c' },
    { id: 2, name: '黄', icon: '■', hex: '#fde047' },
    { id: 3, name: '绿', icon: '★', hex: '#22c55e' },
    { id: 4, name: '蓝', icon: '◆', hex: '#3b82f6' },
    { id: 5, name: '紫', icon: '⬟', hex: '#a855f7' }
  ];

  const STORAGE_KEY = 'guess-number:best';

  // ----- 状态 -----
  const state = {
    mode: '1a2b',         // '1a2b' | 'mastermind'
    difficulty: 'medium',  // 'easy' | 'medium' | 'hard'
    secret: [],
    guess: [],
    history: [],
    attemptsUsed: 0,
    gameState: 'playing',  // 'playing' | 'won' | 'lost'
    streak: 0
  };

  // ----- 工具 -----
  function rngInt(n) { return Math.floor(Math.random() * n); }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rngInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateSecret() {
    const { positions } = DIFFICULTIES[state.difficulty];
    if (state.mode === '1a2b') {
      // 0-9 不重复
      return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, positions);
    } else {
      // 6 色可重复
      const out = [];
      for (let i = 0; i < positions; i++) out.push(rngInt(6));
      return out;
    }
  }

  // 经典 bulls/cows 评分
  function scoreGuess(guess, secret) {
    let bulls = 0;
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === secret[i]) bulls++;
    }
    const countG = new Map();
    const countS = new Map();
    for (let i = 0; i < guess.length; i++) {
      if (guess[i] !== secret[i]) {
        countG.set(guess[i], (countG.get(guess[i]) || 0) + 1);
        countS.set(secret[i], (countS.get(secret[i]) || 0) + 1);
      }
    }
    let cows = 0;
    for (const [k, v] of countG) {
      cows += Math.min(v, countS.get(k) || 0);
    }
    return { bulls, cows };
  }

  function validateGuess(guess) {
    if (state.mode === '1a2b') {
      const seen = new Set();
      for (const v of guess) {
        if (seen.has(v)) return { ok: false, msg: '1A2B 模式不能有重复数字' };
        seen.add(v);
      }
    }
    return { ok: true };
  }

  // ----- 输入操作 -----
  function addToGuess(value) {
    if (state.gameState !== 'playing') return;
    const { positions } = DIFFICULTIES[state.difficulty];
    if (state.guess.length >= positions) return;
    state.guess.push(value);
    renderInput();
    renderKeypad();
    updateSubmitButton();
  }

  function removeFromGuess() {
    if (state.gameState !== 'playing') return;
    if (state.guess.length === 0) return;
    state.guess.pop();
    renderInput();
    renderKeypad();
    updateSubmitButton();
  }

  function clearGuess() {
    if (state.gameState !== 'playing') return;
    state.guess = [];
    renderInput();
    renderKeypad();
    updateSubmitButton();
  }

  function submitGuess() {
    if (state.gameState !== 'playing') return;
    const { positions, attempts } = DIFFICULTIES[state.difficulty];
    if (state.guess.length !== positions) return;
    const valid = validateGuess(state.guess);
    if (!valid.ok) {
      showToast(valid.msg, 'error');
      return;
    }
    const score = scoreGuess(state.guess, state.secret);
    state.history.push({ guess: state.guess.slice(), bulls: score.bulls, cows: score.cows });
    state.attemptsUsed++;
    state.guess = [];
    renderHistory();
    renderInput();
    renderKeypad();
    updateSubmitButton();
    updateStatus();

    if (score.bulls === positions) {
      state.gameState = 'won';
      state.streak++;
      saveBest();
      setTimeout(showWin, 250);
    } else if (state.attemptsUsed >= attempts) {
      state.gameState = 'lost';
      state.streak = 0;
      setTimeout(showLose, 250);
    }
  }

  // ----- 游戏流程 -----
  function newGame() {
    state.secret = generateSecret();
    state.guess = [];
    state.history = [];
    state.attemptsUsed = 0;
    state.gameState = 'playing';
    renderAll();
    hideModal();
  }

  function switchMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    document.body.dataset.mode = mode;
    newGame();
    updateModeButtons();
    updateLegend();
  }

  function switchDifficulty(diff) {
    if (state.difficulty === diff) return;
    state.difficulty = diff;
    newGame();
    updateDifficultyButtons();
  }

  // ----- 持久化 -----
  function getBestRecord() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return data[`${state.mode}:${state.difficulty}`] || null;
    } catch (e) { return null; }
  }

  function saveBest() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const key = `${state.mode}:${state.difficulty}`;
      const cur = data[key];
      if (cur === undefined || state.attemptsUsed < cur) {
        data[key] = state.attemptsUsed;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) { /* ignore */ }
  }

  // ----- 渲染 -----
  function renderAll() {
    renderHistory();
    renderInput();
    renderKeypad();
    updateStatus();
    updateSubmitButton();
  }

  function renderSlot(value) {
    if (state.mode === '1a2b') {
      return `<div class="slot filled digit">${value}</div>`;
    }
    const c = COLORS[value];
    return `<div class="slot filled peg" style="background:${c.hex}">${c.icon}</div>`;
  }

  function renderHistory() {
    const wrap = document.getElementById('history');
    const { positions } = DIFFICULTIES[state.difficulty];
    if (state.history.length === 0) {
      wrap.innerHTML = '<div class="history-empty">开始你的第一轮猜测吧 ↓</div>';
      return;
    }
    wrap.innerHTML = state.history.map((row, idx) => {
      const slots = row.guess.map(v => renderSlot(v)).join('');
      const fb = state.mode === '1a2b'
        ? render1A2BFeedback(row.bulls, row.cows, positions)
        : renderMastermindFeedback(row.bulls, row.cows, positions);
      return `<div class="history-row" data-idx="${idx}"><div class="slots">${slots}</div><div class="feedback">${fb}</div></div>`;
    }).join('');
    // 滚动到底
    wrap.scrollTop = wrap.scrollHeight;
  }

  function render1A2BFeedback(bulls, cows, total) {
    const dots = [];
    for (let i = 0; i < bulls; i++) dots.push('<span class="dot a"></span>');
    for (let i = 0; i < cows; i++) dots.push('<span class="dot b"></span>');
    for (let i = 0; i < total - bulls - cows; i++) dots.push('<span class="dot x"></span>');
    return `<span class="fb-text">${bulls}A${cows}B</span><span class="fb-dots">${dots.join('')}</span>`;
  }

  function renderMastermindFeedback(bulls, cows, total) {
    const pegs = [];
    for (let i = 0; i < bulls; i++) pegs.push('<span class="peg-dot black"></span>');
    for (let i = 0; i < cows; i++) pegs.push('<span class="peg-dot white"></span>');
    for (let i = 0; i < total - bulls - cows; i++) pegs.push('<span class="peg-dot empty"></span>');
    return `<span class="peg-row">${pegs.join('')}</span>`;
  }

  function renderInput() {
    const wrap = document.getElementById('currentInput');
    const { positions } = DIFFICULTIES[state.difficulty];
    const parts = [];
    for (let i = 0; i < positions; i++) {
      const v = state.guess[i];
      if (v === undefined) {
        parts.push('<div class="slot empty"></div>');
      } else {
        parts.push(renderSlot(v));
      }
    }
    wrap.innerHTML = parts.join('');
  }

  function renderKeypad() {
    const wrap = document.getElementById('keypad');
    wrap.classList.toggle('mode-mastermind', state.mode === 'mastermind');
    if (state.mode === '1a2b') {
      const used = new Set(state.guess);
      const keys = [];
      for (let i = 0; i < 10; i++) {
        const isUsed = used.has(i);
        const cls = `digit-key${isUsed ? ' used' : ''}`;
        keys.push(`<button class="${cls}" data-value="${i}"${isUsed ? ' disabled aria-disabled="true"' : ''} aria-label="数字 ${i}">${i}</button>`);
      }
      wrap.innerHTML = keys.join('');
    } else {
      const keys = COLORS.map(c => {
        return `<button class="color-key" data-value="${c.id}" style="--c:${c.hex}" aria-label="颜色 ${c.name}"><span style="color:${c.hex};text-shadow:0 0 8px ${c.hex}66">${c.icon}</span><span class="color-label">${c.name}</span></button>`;
      });
      wrap.innerHTML = keys.join('');
    }
  }

  function updateStatus() {
    const { attempts } = DIFFICULTIES[state.difficulty];
    document.getElementById('remainingCount').textContent = Math.max(0, attempts - state.attemptsUsed);
    document.getElementById('streakCount').textContent = state.streak;
    const best = getBestRecord();
    document.getElementById('bestCount').textContent = best === null ? '—' : best;
  }

  function updateSubmitButton() {
    const { positions } = DIFFICULTIES[state.difficulty];
    const btn = document.getElementById('submitBtn');
    btn.disabled = state.gameState !== 'playing' || state.guess.length !== positions;
  }

  function updateModeButtons() {
    document.querySelectorAll('[data-mode]').forEach(btn => {
      const active = btn.dataset.mode === state.mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function updateDifficultyButtons() {
    document.querySelectorAll('[data-difficulty]').forEach(btn => {
      const active = btn.dataset.difficulty === state.difficulty;
      btn.classList.toggle('active', active);
    });
  }

  function updateLegend() {
    document.querySelectorAll('.legend-item').forEach(el => {
      el.hidden = !el.classList.contains(`legend-${state.mode}`);
    });
    document.getElementById('kbdHint').textContent = state.mode === '1a2b' ? '0-9' : '1-6';
  }

  // ----- 弹窗 -----
  function showWin() {
    document.getElementById('winMsg').textContent = `用了 ${state.attemptsUsed} 次破解 ${state.mode === '1a2b' ? '数字' : '颜色'}序列`;
    document.getElementById('winAnswer').innerHTML = state.secret.map(v => renderSlot(v)).join('');
    document.getElementById('winModal').classList.add('show');
    setTimeout(() => document.getElementById('winAgainBtn').focus(), 100);
  }

  function showLose() {
    document.getElementById('loseMsg').textContent = '下次再接再厉！';
    document.getElementById('loseAnswer').innerHTML = state.secret.map(v => renderSlot(v)).join('');
    document.getElementById('loseModal').classList.add('show');
    setTimeout(() => document.getElementById('loseAgainBtn').focus(), 100);
  }

  function hideModal() {
    document.getElementById('winModal').classList.remove('show');
    document.getElementById('loseModal').classList.remove('show');
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type || 'info'} show`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ----- 事件绑定 -----
  function bindEvents() {
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => switchMode(btn.dataset.mode));
    });
    document.querySelectorAll('[data-difficulty]').forEach(btn => {
      btn.addEventListener('click', () => switchDifficulty(btn.dataset.difficulty));
    });
    document.getElementById('deleteBtn').addEventListener('click', removeFromGuess);
    document.getElementById('submitBtn').addEventListener('click', submitGuess);
    document.getElementById('newGameBtn').addEventListener('click', newGame);
    document.getElementById('winAgainBtn').addEventListener('click', newGame);
    document.getElementById('loseAgainBtn').addEventListener('click', newGame);
    document.getElementById('winCloseBtn').addEventListener('click', hideModal);
    document.getElementById('loseCloseBtn').addEventListener('click', hideModal);

    document.getElementById('keypad').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn || btn.disabled) return;
      addToGuess(parseInt(btn.dataset.value, 10));
    });

    document.addEventListener('keydown', (e) => {
      // 弹窗打开时只响应 Esc
      if (document.getElementById('winModal').classList.contains('show') ||
          document.getElementById('loseModal').classList.contains('show')) {
        if (e.key === 'Escape') hideModal();
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); submitGuess(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); removeFromGuess(); return; }
      if (e.key === 'Delete') { e.preventDefault(); clearGuess(); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newGame(); return; }
      if (state.gameState !== 'playing') return;
      if (state.mode === '1a2b') {
        if (e.key >= '0' && e.key <= '9') {
          addToGuess(parseInt(e.key, 10));
        }
      } else {
        if (e.key >= '1' && e.key <= '6') {
          addToGuess(parseInt(e.key, 10) - 1);
        }
      }
    });
  }

  // ----- 启动 -----
  function init() {
    document.body.dataset.mode = state.mode;
    bindEvents();
    updateModeButtons();
    updateDifficultyButtons();
    updateLegend();
    state.secret = generateSecret();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 调试用：暴露评分函数到全局便于控制台验证
  window.__guessNumber = {
    score: scoreGuess,
    generateSecret,
    state: () => state
  };
})();
