/* ═══════════════════════════════════════════════════════════
 * game.js — 游戏循环 / 输入 / 判定 / 特效
 * ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const MAX_SCORE = 1000000;
  const LEAD_IN = 2.4;           // 开场倒数（秒）

  const JUDGE = {
    perfect: { w: 1.00, color: '#ffe14d', text: 'PERFECT', hp: 1.35 },
    great: { w: 0.65, color: '#25e0ff', text: 'GREAT', hp: 0.85 },
    good: { w: 0.30, color: '#ff3d81', text: 'GOOD', hp: 0.30 },
    miss: { w: 0.00, color: '#ff4d4d', text: 'MISS', hp: -6.5 }
  };

  const WINDOWS = {
    strict: { perfect: 34, great: 68, good: 108 },
    normal: { perfect: 45, great: 90, good: 135 },
    loose: { perfect: 60, great: 120, good: 175 }
  };

  function rankOf(acc, full, allPerfect) {
    if (allPerfect) return { r: 'AP', name: 'ALL PERFECT' };
    if (full && acc >= 99.5) return { r: 'SSS', name: '神Klose' };
    if (full) return { r: 'SS', name: 'FULL COMBO' };
    if (acc >= 97) return { r: 'SS', name: '' };
    if (acc >= 94) return { r: 'S', name: '' };
    if (acc >= 90) return { r: 'A', name: '' };
    if (acc >= 80) return { r: 'B', name: '' };
    if (acc >= 60) return { r: 'C', name: '' };
    return { r: 'D', name: '' };
  }

  class Game {
    constructor(o) {
      this.ctx = o.ctx;
      this.synth = o.synth;
      this.player = o.player;
      this.renderer = o.renderer;
      this.settings = o.settings;
      this.onHud = o.onHud || function () { };
      this.onEnd = o.onEnd || function () { };
      this.keys = o.keys || [];

      this.state = 'idle';         // idle | playing | paused | ended
      this.rings = [];
      this.particles = [];
      this.texts = [];
      this.beams = [];
      this.clockDelta = 0;
      this.pointers = new Map();
      this.touchMode = false;
      this.raf = null;
      this.lastNow = 0;
      this.hudAcc = 0;
      this.ended = false;
      this._frame = this._frame.bind(this);
    }

    /* ───────── 装载 ───────── */
    setChart(chart, song) {
      this.chart = chart;
      this.song = song;
      const spb = chart.spb;
      const notes = chart.notes.map((n, i) => ({
        idx: i, b: n.b, dur: n.dur || 0, lane: n.lane,
        type: n.dur > 0 ? 'hold' : 'tap',
        t: n.b * spb, tail: (n.b + n.dur) * spb,
        judged: false, holding: false, broken: false, holdOk: false,
        hitFlash: 0
      }));
      notes.sort((a, b) => a.b - b.b);
      this.notes = notes;
      this.total = notes.length || 1;
      const kc = chart.keyCount;
      this.laneList = [];
      for (let i = 0; i < kc; i++) this.laneList.push([]);
      for (const n of notes) this.laneList[n.lane].push(n);
      this.lanePtr = new Array(kc).fill(0);
      this.holdByLane = new Array(kc).fill(null);
      this.laneHeld = new Array(kc).fill(false);
      if (this.pointers) this.pointers.clear();
      this.missPtr = 0;
      this.renderer.setKeyCount(kc);
    }

    reset() {
      for (const n of this.notes) {
        n.judged = false; n.holding = false; n.broken = false;
        n.holdOk = false; n.hitFlash = 0;
      }
      this.lanePtr.fill(0);
      this.holdByLane.fill(null);
      if (this.laneHeld) this.laneHeld.fill(false);
      if (this.pointers) this.pointers.clear();
      this.missPtr = 0;
      this.rings.length = 0; this.particles.length = 0; this.texts.length = 0; this.beams.length = 0;
      this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.weighted = 0;
      this.combo = 0; this.maxCombo = 0; this.comboPop = 0;
      this.health = 70;
      this.score = 0;
      this.holdsDone = 0; this.holdBreak = 0;
      this.failed = false;
      this.ended = false;
      if (this.autoplay === undefined) this.autoplay = false;
      this.laneFlash = new Array(this.chart.keyCount).fill(0);
    }

    /* ───────── 时钟 ───────── */
    get win() { return WINDOWS[this.settings.window] || WINDOWS.normal; }
    songTime() {
      // 暂停期间冻结，避免读数随音频时钟继续走
      if (this.state === 'paused' && this.pausedAt !== undefined) return this.pausedAt;
      return this.ctx.currentTime - this.t0;
    }
    inputTime(ts) {
      let p = performance.now();
      if (typeof ts === 'number' && ts > 0 && Math.abs(ts - p) < 400) p = ts;
      return (p / 1000) + this.clockDelta + (this.settings.offset || 0) / 1000;
    }

    /* ───────── 控制 ───────── */
    start() {
      this.reset();
      this.layout();
      this.player.load(this.song);
      this.t0 = this.ctx.currentTime + LEAD_IN;
      this.player.start(this.t0);
      this.state = 'playing';
      this.lastNow = performance.now();
      this.ended = false;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this._frame);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.pausedAt = this.songTime();
      this.releaseAll(true);      // 静默：暂停不应打断长按
      this.player.pause();
      this.synth.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.synth.music.gain.setTargetAtTime(0, this.ctx.currentTime, .015);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.synth.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.synth.music.gain.setTargetAtTime(1, this.ctx.currentTime, .02);
      this.player.resume();
      this.t0 = this.player.t0;
      this.state = 'playing';
      this.lastNow = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this._frame);
    }

    stop() {
      cancelAnimationFrame(this.raf);
      this.raf = null;
      this.releaseAll();
      this.state = 'idle';
      this.player.stop();
      this.synth.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.synth.music.gain.setValueAtTime(1, this.ctx.currentTime);
    }

    /* ───────── 输入（键盘 + 触屏共用同一套按轨道逻辑） ───────── */
    keyDown(code, ts) {
      const lane = this.keys.indexOf(code);
      if (lane < 0) return;
      this.pressLane(lane, ts);
    }

    keyUp(code) {
      const lane = this.keys.indexOf(code);
      if (lane < 0) return;
      this.releaseLane(lane);
    }

    /** 按下某个轨道 */
    pressLane(lane, ts) {
      if (this.state !== 'playing') return;
      if (lane < 0 || lane >= this.laneList.length) return;
      if (this.laneHeld[lane]) return;          // 该轨道已被按住
      this.laneHeld[lane] = true;
      const now = this.inputTime(ts);
      const st = now - this.t0;
      this.laneFlash[lane] = 1;

      const arr = this.laneList[lane];
      let p = this.lanePtr[lane];
      while (p < arr.length && arr[p].judged) p++;
      this.lanePtr[lane] = p;
      if (p >= arr.length) return;

      const n = arr[p];
      const dt = n.t - st;                    // 正 = 按早了
      const W = this.win;
      const ad = Math.abs(dt) * 1000;
      if (ad > W.good) return;                // 太早按下：不判错，只亮一下轨道
      const key = ad <= W.perfect ? 'perfect' : ad <= W.great ? 'great' : 'good';
      this.judgeNote(n, key, lane, dt);
    }

    /** 松开某个轨道 */
    releaseLane(lane) {
      if (lane < 0 || lane >= this.laneHeld.length) return;
      this.laneHeld[lane] = false;
      const n = this.holdByLane[lane];
      if (!n) return;
      this.holdByLane[lane] = null;
      n.holding = false;
      const st = this.songTime();
      if (st < n.tail - 0.02) {
        n.broken = true;
        this.holdBreak++;
        this.combo = 0; this.comboPop = 0;
        this.health = Math.max(0, this.health - 1.2);
        this.texts.push({
          x: this.renderer.laneX(lane), y: this.renderer.L.judgeY - 52,
          t: 0, life: .45, text: 'HOLD BREAK', color: '#ff8a3d'
        });
        this.beamRemove(lane);
      }
    }

    /** 清空所有按键/触点状态。
     *  静默模式：只清 laneHeld 与 pointers，**不动 holdByLane**，
     *  所以暂停 / 结算不会把正在进行的长按判成断开，也不会污染结算数据。
     *  恢复后再次按下同一轨道即可继续按住。 */
    releaseAll(silent) {
      if (!this.laneHeld) return;
      this.laneHeld.fill(false);
      if (this.pointers) this.pointers.clear();
      if (!silent) {
        for (let i = 0; i < this.holdByLane.length; i++) {
          const n = this.holdByLane[i];
          if (n) { n.holding = false; n.broken = true; this.holdByLane[i] = null; this.beamRemove(i); }
        }
      }
    }

    /* ── 触屏 / 指针 ──
     * pointerId → 轨道 的映射，支持多指同时按（双押）。 */
    pointerDown(id, x, y, ts) {
      if (this.state !== 'playing') return;
      const lane = this.renderer.laneAt(x, y);
      if (lane < 0) return;
      if (!this.pointers) this.pointers = new Map();
      if (this.pointers.has(id)) return;
      this.touchMode = true;
      this.pointers.set(id, lane);
      this.pressLane(lane, ts);
    }

    pointerMove(id, x, y) {
      if (!this.pointers || !this.pointers.has(id)) return;
      const cur = this.pointers.get(id);
      const lane = this.renderer.laneAt(x, y);
      if (lane < 0 || lane === cur) return;
      // 迟滞：得越过半个轨道宽度才换道，避免手指微抖误触邻轨
      const L = this.renderer.L;
      const center = L.padL + (cur + .5) * L.laneW;
      if (Math.abs(x - center) < L.laneW * .5) return;
      this.pointers.set(id, lane);
      this.releaseLane(cur);
      this.pressLane(lane, undefined);
    }

    pointerUp(id) {
      if (!this.pointers) return;
      const lane = this.pointers.get(id);
      if (lane === undefined) return;
      this.pointers.delete(id);
      this.releaseLane(lane);
    }

    beamRemove(lane) {
      const i = this.beams.findIndex(b => b.lane === lane);
      if (i >= 0) this.beams.splice(i, 1);
    }

    judgeNote(n, key, lane, dt) {
      const J = JUDGE[key];
      n.judged = true;
      n.hitFlash = 1;
      this.counts[key]++;
      this.weighted += J.w;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboPop = 1;
      this.health = Math.min(100, this.health + J.hp);
      this.score = Math.round(MAX_SCORE * this.weighted / this.total);

      if (this.settings.hitSound) this.synth.hit(key);
      this.hitFx(lane, key);

      if (n.type === 'hold') {
        n.holding = true;
        this.holdByLane[lane] = n;
        this.beams.push({ lane, topY: this.renderer.L.judgeY - 60 });
      }
    }

    missNote(n) {
      n.judged = true;
      this.counts.miss++;
      this.combo = 0; this.comboPop = 0;
      this.health = Math.max(0, this.health + JUDGE.miss.hp);
      if (this.settings.hitSound) this.synth.hit('bad');
      this.hitFx(n.lane, 'miss');
      if (this.settings.fail && this.health <= 0 && !this.failed) {
        this.failed = true;
        this.finish();
      }
    }

    /* ───────── 特效 ───────── */
    hitFx(lane, key) {
      const R = this.renderer;
      const x = R.laneX(lane), y = R.L.judgeY;
      const c = JUDGE[key].color;
      this.rings.push({ x, y, t: 0, life: key === 'miss' ? .28 : .38, r0: 6, r1: key === 'perfect' ? 64 : 48, color: c });
      const cnt = key === 'perfect' ? 13 : key === 'miss' ? 5 : 9;
      const col = key === 'miss' ? '#ff4d4d' : '#' + (NP_Render.LANE_COLORS[lane % 12].replace('#', ''));
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + Math.random() * .5;
        const sp = 130 + Math.random() * 210;
        this.particles.push({
          x, y: y - 6,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .62 - 60,
          t: 0, life: .38 + Math.random() * .3,
          size: 4 + Math.random() * 7,
          rot: Math.random() * 6.28, spin: (Math.random() - .5) * 2.4,
          color: col
        });
      }
      if (key !== 'miss') {
        this.texts.push({
          x, y: y - 46,
          t: 0, life: .48, text: JUDGE[key].text, color: c
        });
      }
    }

    /* ───────── 主循环 ───────── */
    _frame(now) {
      if (this.state !== 'playing') return;
      const dt = Math.min(.05, (now - this.lastNow) / 1000);
      this.lastNow = now;
      this.clockDelta = this.ctx.currentTime - performance.now() / 1000;

      const st = this.songTime();
      const spb = this.chart.spb;
      const curBeat = st / spb;
      const spb4 = spb * 4;

      /* — 自动演示 — */
      if (this.autoplay) {
        for (let i = 0; i < this.notes.length; i++) {
          const n = this.notes[i];
          if (n.judged || n.broken) continue;
          if (st >= n.t - .012) this.judgeNote(n, 'perfect', n.lane, 0);
        }
      }

      /* — 漏击检测 — */
      const Wg = this.win.good / 1000;
      while (this.missPtr < this.notes.length) {
        const n = this.notes[this.missPtr];
        if (n.judged) { this.missPtr++; continue; }
        if (st > n.t + Wg) { this.missNote(n); this.missPtr++; }
        else break;
      }

      /* — 长按收尾 — */
      for (let i = 0; i < this.holdByLane.length; i++) {
        const n = this.holdByLane[i];
        if (!n) continue;
        if (st >= n.tail) {
          n.holding = false; n.holdOk = true;
          this.holdByLane[i] = null;
          this.holdsDone++;
          this.health = Math.min(100, this.health + .35);
          this.beamRemove(i);
          const x = this.renderer.laneX(i), y = this.renderer.L.judgeY;
          this.rings.push({ x, y, t: 0, life: .42, r0: 10, r1: 78, color: '#5ce08a' });
          for (let k = 0; k < 10; k++) {
            const a = -Math.PI / 2 + (k / 10 - .5) * 2.4;
            const sp = 90 + Math.random() * 160;
            this.particles.push({
              x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              t: 0, life: .4, size: 4 + Math.random() * 5,
              rot: 0, spin: 0, color: '#5ce08a'
            });
          }
        } else if (st < n.t - 0.5) {
          n.holding = false; n.broken = true; this.holdByLane[i] = null; this.beamRemove(i);
        }
      }

      /* — 特效推进 — */
      for (let i = this.rings.length - 1; i >= 0; i--) {
        this.rings[i].t += dt;
        if (this.rings[i].t >= this.rings[i].life) this.rings.splice(i, 1);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.t += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 620 * dt; p.vx *= 0.985;
        if (p.t >= p.life) this.particles.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        this.texts[i].t += dt;
        if (this.texts[i].t >= this.texts[i].life) this.texts.splice(i, 1);
      }
      for (let i = 0; i < this.laneFlash.length; i++) {
        this.laneFlash[i] = Math.max(0, this.laneFlash[i] - dt * 4.2);
      }
      for (const n of this.notes) if (n.hitFlash > 0) n.hitFlash = Math.max(0, n.hitFlash - dt * 5.5);
      this.comboPop = Math.max(0, this.comboPop - dt * 4.5);

      /* — 长按光柱顶端 — */
      const ppb = this.ppbNow || 100;
      for (const b of this.beams) {
        const hn = this.holdByLane[b.lane];
        if (!hn) { this.beamRemove(b.lane); continue; }
        const endBeat = hn.b + Math.max(0, Math.min(hn.dur, curBeat - hn.b));
        b.topY = this.renderer.L.judgeY - (endBeat - curBeat) * ppb;
      }

      /* — 绘制 — */
      const R = this.renderer;
      const beatPhase = ((curBeat % 1) + 1) % 1;
      const beatPulse = Math.pow(1 - beatPhase, 3);
      R.render({
        keyCount: this.chart.keyCount,
        currentBeat: curBeat,
        ppb,
        beatPulse,
        notes: this.notes,
        rings: this.rings,
        particles: this.particles,
        texts: this.texts,
        beams: this.beams,
        laneFlash: this.laneFlash,
        combo: this.combo,
        comboPop: this.comboPop,
        c1: this.chart.c1, c2: this.chart.c2
      });

      /* — HUD — */
      this.hudAcc += dt;
      if (this.hudAcc > .05) {
        this.hudAcc = 0;
        this.onHud({
          score: this.score,
          accuracy: (this.weighted / this.total) * 100,
          combo: this.combo,
          health: this.health,
          progress: Math.max(0, Math.min(1, st / this.chart.duration)),
          countdown: st < 0 ? Math.max(1, Math.min(3, Math.ceil(-st))) : 0
        });
      }

      /* — 结束 — */
      if (!this.ended && st > this.chart.duration + 1.2) this.finish();

      this.raf = requestAnimationFrame(this._frame);
    }

    finish() {
      if (this.ended) return;
      this.ended = true;
      this.state = 'ended';
      cancelAnimationFrame(this.raf);
      this.releaseAll();
      this.player.stop();
      const acc = (this.weighted / this.total) * 100;
      const full = this.counts.miss === 0 && this.holdBreak === 0;
      const allPerfect = this.counts.perfect === this.total && this.counts.miss === 0 && full;
      const rk = rankOf(acc, full, allPerfect);
      this.onEnd({
        failed: this.failed,
        score: this.score,
        accuracy: acc,
        counts: Object.assign({}, this.counts),
        maxCombo: this.maxCombo,
        total: this.total,
        fullCombo: full,
        allPerfect,
        holdsDone: this.holdsDone,
        holdBreak: this.holdBreak,
        rank: rk.r,
        rankName: this.failed ? 'FAILED' : (rk.name || '')
      });
    }

    /* 判定线以下的像素密度 */
    layout() {
      const R = this.renderer;
      const base = (R.L.judgeY - R.L.topGap) / 6.2;
      this.ppbNow = base * (this.settings.speed || 1);
      R.ppbNow = this.ppbNow;
    }
  }

  global.NP_Game = { Game, WINDOWS, JUDGE, MAX_SCORE, LEAD_IN };
})(window);
