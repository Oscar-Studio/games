/* ═══════════════════════════════════════════════════════════
 * ui.js — 界面控制 / 设置 / 选曲 / 结算 / 校准
 * ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const LS_KEY = 'neonpulse.v1';

  const DEFAULTS = {
    song: 'neon-drive',
    keyCount: 4,
    diff: 'normal',
    speed: 1,
    window: 'normal',
    offset: 0,
    volMusic: 70,
    volSfx: 60,
    hitSound: true,
    bloom: true,
    bgfx: true,
    bgDim: 45,
    fail: true
  };

  function loadAll() {
    let s = {}, scores = {};
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      s = raw.settings || {};
      scores = raw.scores || {};
    } catch (e) { }
    return { settings: Object.assign({}, DEFAULTS, s), scores };
  }

  class UI {
    constructor() {
      const st = loadAll();
      this.settings = st.settings;
      this.scores = st.scores;

      this.renderer = new NP_Render.Renderer($('#game-canvas'));
      this.bg = new NP_Render.BgFx($('#bg-canvas'));
      this.audio = null;
      this.game = null;
      this.customSongs = [];
      this.current = null;
      this.calib = null;
      this.screen = 'title';

      this.touch = false;
      this.bindNav();
      this.bindSongScreen();
      this.bindSettings();
      this.bindGame();
      this.bindCalib();

      this.syncAll();
      window.addEventListener('resize', () => {
        this.renderer.resize();
        this.bg.resize();
        if (this.game) this.game.layout();
      });
    }

    /** 首次触屏交互：切到触摸友好布局并刷新场地 */
    markTouch() {
      if (this.touch) return;
      this.touch = true;
      document.body.classList.add('touch-mode');
      if (this.game) this.game.layout();
    }

    save() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ settings: this.settings, scores: this.scores }));
      } catch (e) { }
    }

    /* ───────── 音频 ───────── */
    ensureAudio() {
      if (this.audio) {
        if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume().catch(() => { });
        return this.audio;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('浏览器不支持 Web Audio API');
        const ctx = new AC();
        const synth = new NP_Music.Synth(ctx);
        const player = new NP_Music.MusicPlayer(ctx, synth);
        this.audio = { ctx, synth, player };
        this.applyAudioSettings();
      } catch (err) {
        // 音频不可用时游戏仍可进行（无声），不要阻断界面导航
        this.audioError = err;
        console.warn('[NEON PULSE] 音频初始化失败：', err);
        return null;
      }
      return this.audio;
    }

    applyAudioSettings() {
      if (!this.audio) return;
      this.audio.synth.setMusicVolume(this.settings.volMusic / 100);
      this.audio.synth.setSfxVolume(this.settings.volSfx / 100);
    }

    /* ───────── 导航 ───────── */
    go(name) {
      if (this.game && this.game.state === 'playing' && name !== 'game') this.game.stop();
      $$('.screen').forEach(s => s.classList.remove('active'));
      const el = $('#screen-' + name);
      if (el) el.classList.add('active');
      this.screen = name;
      if (name === 'songs') this.renderSongs();
      if (name === 'settings') this.syncSettings();
      if (name !== 'game' && this.game) this.game.stop();
    }

    bindNav() {
      $$('[data-go]').forEach(b => b.addEventListener('click', () => {
        this.ensureAudio();
        this.go(b.dataset.go);
      }));
      const anyKey = (e) => {
        if (this.screen !== 'title') return;
        if (e.target && e.target.tagName === 'INPUT') return;
        this.ensureAudio();
        this.go('songs');
      };
      window.addEventListener('keydown', anyKey);
    }

    /* ───────── 选曲页 ───────── */
    bindSongScreen() {
      // 键数
      const box = $('#chips-keys');
      NP_Chart.AVAILABLE_KEYS.forEach(k => {
        const b = document.createElement('button');
        b.className = 'chip'; b.dataset.k = k; b.textContent = k + 'K';
        b.addEventListener('click', () => {
          this.settings.keyCount = k; this.save();
          this.syncKeys();
          if (this.game) this.game.keys = this.keys();
        });
        box.appendChild(b);
      });
      // 难度
      $$('#chips-diff .chip').forEach(b => b.addEventListener('click', () => {
        this.settings.diff = b.dataset.diff; this.save(); this.syncKeys();
      }));
      // 速度
      $('#rng-speed').addEventListener('input', e => {
        this.settings.speed = parseFloat(e.target.value);
        $('#val-speed').textContent = this.settings.speed.toFixed(2);
        if (this.game) { this.game.settings.speed = this.settings.speed; this.game.layout(); }
        this.save();
      });
      $('#btn-play').addEventListener('click', () => this.play());
      $('#song-list').addEventListener('click', e => {
        const c = e.target.closest('.song-card');
        if (!c) return;
        this.settings.song = c.dataset.id; this.save(); this.renderSongs();
      });
    }

    keys() { return NP_Chart.KEY_SETS[this.settings.keyCount] || NP_Chart.KEY_SETS[4]; }

    syncKeys() {
      $$('#chips-keys .chip').forEach(b => b.classList.toggle('on', +b.dataset.k === this.settings.keyCount));
      $$('#chips-diff .chip').forEach(b => b.classList.toggle('on', b.dataset.diff === this.settings.diff));
      $('#val-keys').textContent = this.settings.keyCount;
      $('#key-hints').textContent = this.keys().map(NP_Chart.keyLabel).join('  ');
    }

    songList() {
      const base = NP_Music.SONGS.map(s => NP_Music.metaOf(s.id));
      return base.concat(this.customSongs);
    }

    renderSongs() {
      const list = $('#song-list');
      list.innerHTML = '';
      this.songList().forEach(s => {
        const el = document.createElement('div');
        el.className = 'song-card' + (s.custom ? ' song-custom' : '');
        if (s.id === this.settings.song) el.classList.add('sel');
        el.dataset.id = s.id;
        el.style.setProperty('--sc1', s.c1);
        el.style.setProperty('--sc2', s.c2);
        const best = this.scores[s.id + '|' + this.settings.diff + '|' + this.settings.keyCount];
        el.innerHTML =
          (s.custom ? '<div class="song-badge">IMPORTED</div>' : '') +
          '<div class="song-title">' + esc(s.title) + '</div>' +
          '<div class="song-sub">' + esc(s.sub || '') + '</div>' +
          '<div class="song-tags">' +
          '<span class="tag bpm">' + s.bpm + ' BPM</span>' +
          (best ? '<span class="tag">BEST ' + best.score.toLocaleString() + '</span>' : '') +
          '</div>';
        list.appendChild(el);
      });
      this.syncKeys();
      this.renderBest();
    }

    renderBest() {
      const box = $('#best-list');
      const rows = this.songList().map(s => {
        const k = s.id + '|' + this.settings.diff + '|' + this.settings.keyCount;
        return { s, b: this.scores[k] };
      }).filter(x => x.b);
      if (!rows.length) { box.innerHTML = '<div class="empty">还没有记录，去打一首吧</div>'; return; }
      box.innerHTML = rows.map(x =>
        '<div class="best-row"><span class="k">' + esc(x.s.title) + '</span>' +
        '<span class="v">' + x.b.score.toLocaleString() + '</span>' +
        '<span class="r" style="color:' + rankColor(x.b.rank) + '">' + x.b.rank + '</span></div>'
      ).join('');
    }

    /* ───────── 设置页 ───────── */
    bindSettings() {
      this.bindRange('#rng-vol-music', '#val-vol-music', v => { this.settings.volMusic = v; this.applyAudioSettings(); });
      this.bindRange('#rng-vol-sfx', '#val-vol-sfx', v => { this.settings.volSfx = v; this.applyAudioSettings(); });
      this.bindRange('#rng-offset', '#val-offset', v => { this.settings.offset = v; }, v => v + ' ms');
      this.bindRange('#rng-bg-dim', '#val-bg-dim', v => {
        this.settings.bgDim = v; this.bg.dim = v / 100; this.renderer.bgDim = v / 100;
      });

      this.bindSwitch('#sw-hit-sound', v => this.settings.hitSound = v);
      this.bindSwitch('#sw-bloom', v => { this.settings.bloom = v; this.renderer.bloom = v; this.renderer.sprites.clear(); });
      this.bindSwitch('#sw-bgfx', v => { this.settings.bgfx = v; this.bg.enabled = v; });
      this.bindSwitch('#sw-fail', v => this.settings.fail = v);

      $$('#chips-window .chip').forEach(b => b.addEventListener('click', () => {
        this.settings.window = b.dataset.window; this.save(); this.syncSettings();
      }));

      $('#btn-calibrate').addEventListener('click', () => { this.ensureAudio(); this.startCalib(); this.go('calib'); });
      $('#btn-clear').addEventListener('click', () => {
        if (!confirm('确定要清除所有分数记录和设置吗？')) return;
        this.scores = {}; this.settings = Object.assign({}, DEFAULTS);
        this.save(); this.syncAll(); this.go('settings');
      });

      const fi = $('#file-input');
      $('#btn-import').addEventListener('click', () => fi.click());
      fi.addEventListener('change', () => {
        const f = fi.files && fi.files[0];
        if (f) this.importSong(f);
        fi.value = '';
      });
    }

    syncSettings() {
      $('#rng-vol-music').value = this.settings.volMusic; $('#val-vol-music').textContent = this.settings.volMusic;
      $('#rng-vol-sfx').value = this.settings.volSfx; $('#val-vol-sfx').textContent = this.settings.volSfx;
      $('#rng-offset').value = this.settings.offset; $('#val-offset').textContent = this.settings.offset + ' ms';
      $('#rng-bg-dim').value = this.settings.bgDim; $('#val-bg-dim').textContent = this.settings.bgDim;
      $('#sw-hit-sound').dataset.on = this.settings.hitSound ? '1' : '0';
      $('#sw-bloom').dataset.on = this.settings.bloom ? '1' : '0';
      $('#sw-bgfx').dataset.on = this.settings.bgfx ? '1' : '0';
      $('#sw-fail').dataset.on = this.settings.fail ? '1' : '0';
      $$('#chips-window .chip').forEach(b => b.classList.toggle('on', b.dataset.window === this.settings.window));
    }

    syncAll() {
      this.syncKeys();
      this.syncSettings();
      this.bg.dim = this.settings.bgDim / 100;
      this.bg.enabled = this.settings.bgfx;
      this.renderer.bloom = this.settings.bloom;
      this.renderer.bgDim = this.settings.bgDim / 100;
      $('#rng-speed').value = this.settings.speed;
      $('#val-speed').textContent = this.settings.speed.toFixed(2);
    }

    bindRange(sel, label, set, fmt) { bindRange.call(this, sel, label, set, fmt); }
    bindSwitch(sel, set) { bindSwitch.call(this, sel, set); }

    /* ───────── 导入 ───────── */
    async importSong(file) {
      const a = this.ensureAudio();
      const btn = $('#btn-import');
      const old = btn.textContent;
      btn.textContent = '分析中…';
      btn.disabled = true;
      try {
        const buf = await file.arrayBuffer();
        const song = await NP_Chart.analyzeAudio(a.ctx, buf, file.name);
        this.customSongs = this.customSongs.filter(s => s.id !== song.id);
        this.customSongs.push({
          id: song.id, title: song.title, sub: song.sub,
          bpm: song.bpm, c1: song.c1, c2: song.c2, custom: true, song
        });
        this.settings.song = song.id;
        this.save();
        this.renderSongs();
        alert('扒谱完成：' + song.title + '\n速度 ' + song.bpm + ' BPM，检测到约 ' +
          song.events.length + ' 个节奏点。');
        this.go('songs');
      } catch (e) {
        alert('导入失败：' + (e && e.message ? e.message : e));
      } finally {
        btn.textContent = old; btn.disabled = false;
      }
    }

    /* ───────── 开始游玩 ───────── */
    play() {
      const a = this.ensureAudio();
      if (a) a.ctx.resume().catch(() => { });

      const entry = this.songList().find(s => s.id === this.settings.song) || this.songList()[0];
      this.settings.song = entry.id;

      const song = entry.custom ? entry.song : NP_Music.getSong(entry.id);
      const chart = NP_Chart.buildChart(song, this.settings.keyCount, this.settings.diff);
      if (!chart.notes.length) { alert('该难度下谱面为空，请换一个难度或键数。'); return; }

      this.current = { song, chart, meta: entry };
      this.renderer.setKeyCount(chart.keyCount);
      this.renderer.bloom = this.settings.bloom;

      if (!this.game) {
        this.game = new NP_Game.Game({
          ctx: a.ctx, synth: a.synth, player: a.player,
          renderer: this.renderer,
          settings: this.settings,
          keys: this.keys(),
          onHud: h => this.onHud(h),
          onEnd: r => this.onEnd(r)
        });
      }
      this.game.keys = this.keys();
      this.game.setChart(chart, song);
      this.game.layout();

      $('#hud-song').textContent = entry.title + ' · ' + chart.diffLabel + ' · ' + chart.keyCount + 'K';
      this.go('game');
      this.game.start();
    }

    onHud(h) {
      $('#hud-score').textContent = Math.round(h.score).toLocaleString();
      $('#hud-acc').textContent = h.accuracy.toFixed(2) + '%';
      $('#hud-combo').textContent = h.combo;
      $('#hud-prog').style.width = (h.progress * 100).toFixed(1) + '%';
      const g = $('#hud-gauge');
      g.style.width = h.health + '%';
      g.className = h.health < 18 ? 'crit' : h.health < 40 ? 'low' : '';
      const cd = $('#countdown');
      if (h.countdown > 0) {
        cd.textContent = String(h.countdown);
        cd.style.opacity = String(0.35 + (h.countdown - 1) * 0.3);
        cd.style.transform = 'scale(' + (0.9 + (h.countdown - 1) * 0.08) + ')';
      } else {
        cd.textContent = '';
      }
    }

    onEnd(r) {
      const m = this.current.meta;
      const ch = this.current.chart;
      $('#res-title').textContent = m.title;
      $('#res-sub').textContent = ch.diffLabel + ' · ' + ch.keyCount + 'K · ' + ch.bpm + ' BPM' + (m.sub ? ' · ' + m.sub : '');
      $('#res-rank').textContent = r.failed ? 'F' : r.rank;
      $('#res-rank').style.background = r.failed
        ? 'linear-gradient(135deg,#ff4d4d,#ff8a3d)'
        : 'linear-gradient(135deg,' + (m.c1 || '#ff3d81') + ',' + (m.c2 || '#8b5cff') + ')';
      $('#res-score').textContent = Math.round(r.score).toLocaleString();

      const flags = [];
      if (r.allPerfect) flags.push('<span class="flag ap">ALL PERFECT</span>');
      else if (r.fullCombo) flags.push('<span class="flag fc">FULL COMBO</span>');
      if (r.rankName && !r.failed && r.rankName !== 'FULL COMBO') {
        flags.push('<span class="flag ap">' + r.rankName + '</span>');
      }
      $('#res-flags').innerHTML = flags.join('');

      const c = r.counts, tot = r.total || 1;
      const jd = [
        ['perfect', 'PERFECT', c.perfect],
        ['great', 'GREAT', c.great],
        ['good', 'GOOD', c.good],
        ['miss', 'MISS', c.miss]
      ];
      $('#res-chart').innerHTML = jd.map(([k, label, v]) =>
        '<div class="jd" style="color:' + NP_Render.JUDGE_COLORS[k] + '"><i style="background:' + NP_Render.JUDGE_COLORS[k] + '"></i>' + label + '</div>' +
        '<div class="jb"><i style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + NP_Render.JUDGE_COLORS[k] + '"></i></div>' +
        '<div class="jn">' + v + '</div>'
      ).join('');

      $('#res-stats').innerHTML = [
        ['ACCURACY', r.accuracy.toFixed(2) + '%'],
        ['MAX COMBO', r.maxCombo],
        ['NOTES', r.total],
        ['HOLDS', r.holdsDone + (r.holdBreak ? ' <small style="color:#ff8a3d">(' + r.holdBreak + ' 断)</small>' : '')],
        ['RANK', r.failed ? '—' : r.rank]
      ].map(([k, v]) => '<div class="stat"><label>' + k + '</label><b>' + v + '</b></div>').join('');

      // 记录
      const key = m.id + '|' + this.settings.diff + '|' + this.settings.keyCount;
      const prev = this.scores[key];
      if (!prev || r.score > prev.score) {
        this.scores[key] = { score: Math.round(r.score), acc: r.accuracy, rank: r.failed ? 'F' : r.rank };
        $('#res-best').textContent = 'NEW BEST!';
      } else {
        $('#res-best').textContent = 'BEST ' + prev.score.toLocaleString();
      }
      this.save();
      this.go('result');
    }

    /* ───────── 游戏页交互 ───────── */
    bindGame() {
      $('#btn-pause').addEventListener('click', () => this.togglePause());
      $('#btn-resume').addEventListener('click', () => this.togglePause());
      $('#btn-retry').addEventListener('click', () => { this.game.stop(); this.game.start(); });
      $('#btn-autoplay').addEventListener('click', () => {
        this.game.autoplay = !this.game.autoplay;
        $('#btn-autoplay').classList.toggle('btn-primary', this.game.autoplay);
        if (this.game.autoplay) { this.game.resume(); $('#pause-overlay').classList.remove('show'); }
      });
      $('#btn-quit').addEventListener('click', () => { this.game.stop(); this.go('songs'); });
      $('#btn-again').addEventListener('click', () => { this.game.stop(); this.play(); });
      $('#btn-reselect').addEventListener('click', () => { this.game.stop(); this.go('songs'); });

      window.addEventListener('keydown', e => {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.screen === 'game') { e.preventDefault(); this.togglePause(); }
          return;
        }
        if (e.code === 'KeyR' && this.screen === 'game' && !this.game.paused) {
          this.game.stop(); this.game.start(); return;
        }
        if (this.screen !== 'game' || !this.game) return;
        if (this.calib) return;
        if (e.code === 'Space') e.preventDefault();
        if (e.repeat) return;
        this.game.keyDown(e.code, e.timeStamp);
      });
      window.addEventListener('keyup', e => {
        if (this.screen !== 'game' || !this.game) return;
        this.game.keyUp(e.code);
      });

      /* ── 触屏 / 指针输入（支持多指双押） ── */
      const gc = $('#game-canvas');
      const opt = { passive: false };
      gc.addEventListener('pointerdown', e => {
        if (this.screen !== 'game' || !this.game) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        this.game.pointerDown(e.pointerId, e.clientX, e.clientY, e.timeStamp);
        this.markTouch();
      }, opt);
      gc.addEventListener('pointermove', e => {
        if (this.screen !== 'game' || !this.game) return;
        if (!this.game.pointers || !this.game.pointers.has(e.pointerId)) return;
        e.preventDefault();
        this.game.pointerMove(e.pointerId, e.clientX, e.clientY);
      }, opt);
      const up = e => {
        if (!this.game) return;
        if (this.game.pointers && this.game.pointers.has(e.pointerId)) {
          this.game.pointerUp(e.pointerId);
        }
      };
      gc.addEventListener('pointerup', up, opt);
      gc.addEventListener('pointercancel', up, opt);
      gc.addEventListener('lostpointercapture', up, opt);
      // 兜底：手指滑出 canvas / 移出窗口时，抬起事件可能不落在 canvas 上。
      // 缺了这一步，对应轨道会被永久卡在「已按住」状态。
      window.addEventListener('pointerup', up, opt);
      window.addEventListener('pointercancel', up, opt);
      window.addEventListener('blur', () => { if (this.game) this.game.releaseAll(true); });
      // 触屏上不弹系统菜单（长按选择/右键菜单）
      gc.addEventListener('contextmenu', e => e.preventDefault());
      // 触屏上双指缩放/双击缩放会打断游戏
      document.addEventListener('gesturestart', e => e.preventDefault(), opt);
      window.addEventListener('blur', () => {
        if (this.game) this.game.releaseAll(true);
        if (this.game && this.game.state === 'playing') this.togglePause(true);
      });
    }

    togglePause(force) {
      if (!this.game) return;
      if (this.game.state === 'playing') {
        this.game.pause();
        const p = this.current.chart;
        $('#pause-info').textContent = p.title + ' · ' + p.diffLabel + ' · ' + p.keyCount + 'K · ' +
          Math.round(this.game.score).toLocaleString() + ' 分';
        $('#pause-overlay').classList.add('show');
      } else if (this.game.state === 'paused' && !force) {
        this.game.resume();
        $('#pause-overlay').classList.remove('show');
      }
    }

    /* ───────── 延迟校准 ───────── */
    bindCalib() {
      window.addEventListener('keydown', e => {
        if (this.screen !== 'calib') return;
        if (e.code !== 'Space') return;
        e.preventDefault();
        const c = this.calib;
        if (!c || c.samples.length >= 20) return;
        const a = this.audio;
        if (!a) return;
        const t = performance.now() / 1000 + (a.ctx.currentTime - performance.now() / 1000);
        // 与「最近的一次」已调度节拍比对（不是下一拍，否则会整体偏一个周期）
        let ref = null, bestD = 1e9;
        for (const ct of c.clicks) {
          const d = t - ct;
          if (Math.abs(d) < Math.abs(bestD)) { bestD = d; ref = ct; }
        }
        if (ref === null || Math.abs(bestD) > .3) return;   // 离谱的敲击不计
        c.samples.push(bestD * 1000);
        const beat = $('#calib-beat');
        beat.classList.add('hit');
        setTimeout(() => beat.classList.remove('hit'), 110);
        this.updateCalib();
      });
      $('#btn-calib-again').addEventListener('click', () => this.startCalib());
      $('#btn-calib-done').addEventListener('click', () => {
        if (this.calib && this.calib.samples.length >= 5) {
          const m = mean(this.calib.samples);
          this.settings.offset = Math.max(-200, Math.min(200, Math.round(m)));
          this.save(); this.syncSettings();
        }
        this.stopCalib();
        this.go('settings');
      });
    }

    startCalib() {
      const a = this.ensureAudio();
      if (!a) { alert('音频不可用，无法进行延迟校准。'); return; }
      a.ctx.resume().catch(() => { });
      this.stopCalib();
      const c = this.calib = { samples: [], clicks: [], timer: null, t0: a.ctx.currentTime + 1.0, next: null, period: .6 };
      this.updateCalib();
      const tick = () => {
        const now = a.ctx.currentTime;
        while (c.next == null || c.next < now + .4) {
          const n = (c.next == null ? c.t0 : c.next + c.period);
          c.next = n;
          c.clicks.push(n);
          if (c.clicks.length > 12) c.clicks.shift();
          click(a.synth, n);
        }
      };
      c.timer = setInterval(tick, 60);
      tick();
    }

    stopCalib() {
      if (this.calib && this.calib.timer) clearInterval(this.calib.timer);
      this.calib = null;
    }

    updateCalib() {
      const c = this.calib;
      if (!c) return;
      $('#calib-count').textContent = Math.min(c.samples.length, 20) + ' / 20';
      if (c.samples.length) {
        $('#calib-avg').textContent = mean(c.samples).toFixed(1) + ' ms';
        $('#calib-jitter').textContent = stdev(c.samples).toFixed(1) + ' ms';
      }
      if (c.samples.length >= 20) {
        clearInterval(c.timer);
        $('#calib-count').textContent = '完成 ✓';
      }
    }

    /* 每帧回调：给背景一点律动 */
    tick(dt) {
      let pulse = 0;
      if (this.game && this.game.state === 'playing') {
        const st = this.game.songTime();
        if (st > 0) {
          const b = st / this.game.chart.spb;
          const ph = ((b % 1) + 1) % 1;
          pulse = Math.pow(1 - ph, 3);
        }
      }
      this.bg.draw(dt, pulse);
    }
  }

  /* ───────── 工具 ───────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function chartLine(c) {
    return c.title + ' · ' + c.diffLabel + ' · ' + c.keyCount + 'K';
  }
  function rankColor(r) {
    return ({
      AP: '#ffe14d', SSS: '#ffe14d', SS: '#25e0ff', S: '#5ce08a',
      A: '#5ce08a', B: '#ff9d3d', C: '#ff6b6b', D: '#ff4d4d', F: '#ff4d4d'
    })[r] || '#fff';
  }
  function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  }
  function click(synth, t) {
    const c = synth.ctx;
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(1400, t);
    const g = c.createGain();
    g.gain.setValueAtTime(.22, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .05);
    o.connect(g); g.connect(synth.sfx);
    o.start(t); o.stop(t + .06);
  }
  function bindRange(sel, label, set, fmt) {
    const el = $(sel);
    el.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      set(v);
      if (label) $(label).textContent = fmt ? fmt(v) : v;
      this.save();
    });
  }
  function bindSwitch(sel, set) {
    const el = $(sel);
    el.addEventListener('click', () => {
      const v = el.dataset.on === '1' ? 0 : 1;
      el.dataset.on = String(v);
      set(!!v);
      this.save();
    });
  }

  global.NP_UI = { UI };
  global.NP_UIUtil = { esc };
})(window);
