/* ═══════════════════════════════════════════════════════════
 * chart.js — 谱面生成 / 轨道分配 / 导入音频自动扒谱
 * ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ───────── 键位表（KeyboardEvent.code，按物理位置从左到右） ───────── */
  const KEY_SETS = {
    2: ['KeyD', 'KeyF'],
    3: ['KeyS', 'KeyD', 'KeyF'],
    4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    5: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK'],
    6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
    7: ['KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyJ', 'KeyK', 'KeyL'],
    8: ['KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
    9: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
    10: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
    11: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    12: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'KeyB', 'KeyN', 'KeyJ', 'KeyM', 'KeyK', 'KeyL', 'Semicolon']
  };
  const KEY_LABELS = {
    Semicolon: ';', Quote: "'", Backslash: '\\', Comma: ',',
    Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']'
  };
  function keyLabel(code) { return KEY_LABELS[code] || String(code).replace(/^Key/, ''); }
  const AVAILABLE_KEYS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /* ───────── 难度配置 ───────── */
  /* hatEvery / arpEvery 以「十六分音符格」为单位：2 = 八分，4 = 四分，1 = 十六分
   * kickMask 每小节 4 拍是否落底鼓 */
  const DIFF = {
    easy: {
      label: 'EASY', minGap: 0.25, holdMin: 1.0, maxNps: 5,
      inst: { kick: 1, snare: 1, lead: 1, arp: 1, hat: 0, stab: 1, tap: 1 },
      hatEvery: 8, arpEvery: 8, kickMask: [1, 0, 1, 0], leadThin: .7,
      jump: .18, color: '#5ce08a'
    },
    normal: {
      label: 'NORMAL', minGap: 0.25, holdMin: 1.0, maxNps: 6,
      inst: { kick: 1, snare: 1, lead: 1, arp: 1, hat: 1, stab: 1, tap: 1 },
      hatEvery: 4, arpEvery: 4, kickMask: [1, 0, 1, 0], leadThin: .25,
      jump: .22, color: '#25e0ff'
    },
    hard: {
      label: 'HARD', minGap: 0.25, minGapOut: 0.5, holdMin: 0.5, maxNps: 7.8,
      inst: { kick: 1, snare: 1, lead: 1, arp: 1, hat: 1, stab: 1, tap: 1 },
      hatEvery: 2, arpEvery: 2, kickMask: [1, 1, 1, 1], leadThin: 0,
      denseMask: [1, 1, 0, 1],        // drop 段内 16 分音符的切分遮罩
      jump: .32, color: '#ff3d81'
    }
  };

  const PRIORITY = { stab: 6, kick: 5, snare: 5, lead: 4, tap: 4, arp: 3, hat: 2 };

  /* ───────── 工具 ───────── */
  const q = (v, grid) => Math.round(v / grid) * grid;
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ───────── 从乐曲事件生成谱面 ───────── */
  function buildChart(song, keyCount, diffId) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const spb = song.spb;
    const rng = mulberry32((song.seed || 1234) ^ (keyCount * 7919) ^ (diffId.length * 131));

    /* 1) 选出成为 note 的事件 */
    const cand = [];
    for (const e of song.events) {
      if (cfg.inst[e.i] === undefined) continue;
      // 量化到 1/4 拍
      const slot = q(e.b, .25);
      if (slot < -0.001) continue;
      if (cfg.inst[e.i] === 0) continue;

      const si = Math.round(slot / .25);
      const dense = !!e.x;

      // 16 分密度只在 drop 段开放，且要过切分遮罩，避免整首都塞满
      const isDense = diffId === 'hard' && dense;
      const hatEvery = isDense ? 2 : cfg.hatEvery;
      const arpEvery = isDense ? 1 : cfg.arpEvery;
      if (e.i === 'hat' && si % hatEvery !== 0) continue;
      if (e.i === 'arp' && si % arpEvery !== 0) continue;
      if (isDense && !cfg.denseMask[si % 4] && PRIORITY[e.i] < 5) continue;
      if (e.i === 'kick' && !cfg.kickMask[Math.floor(si / 4) % 4]) continue;
      // 稀疏化：短音值的 lead 随机丢弃，长音（可做长按）保留
      if (e.i === 'lead' && e.d < cfg.holdMin && rng() < cfg.leadThin) continue;

      let dur = 0;
      if (e.i === 'lead' && e.d >= cfg.holdMin) dur = Math.min(e.d, 8);
      if (e.i === 'stab') dur = Math.max(0, e.d - .25);
      if (e.i === 'bass' && e.d >= 1.5 && diffId === 'hard') dur = Math.min(e.d - .2, 3);

      cand.push({
        b: slot, dur, inst: e.i, p: PRIORITY[e.i] || 3,
        gap: isDense ? cfg.minGap : (cfg.minGapOut || cfg.minGap),
        tones: e.f && Array.isArray(e.f) ? e.f : null
      });
    }
    cand.sort((a, b) => a.b - b.b || b.p - a.p);

    /* 2) 贪心去重：保证最小间隔 */
    const sel = [];
    for (const c of cand) {
      const last = sel[sel.length - 1];
      if (last) {
        const gap = c.b - last.b;
        if (gap < Math.max(c.gap, last.gap)) {
          // 同拍：只有优先级更高才替换
          if (Math.abs(gap) < 1e-6 && c.p > last.p) sel[sel.length - 1] = c;
          continue;
        }
      }
      sel.push(c);
    }

    /* 3) 制造双押 */
    const extra = [];
    for (const s of sel) {
      if (s.inst === 'stab' || s.tones) continue;
      if (s.dur > 0) continue;
      if (rng() > cfg.jump) continue;
      if (sel.length + extra.length > 2000) break;
      extra.push({ b: s.b, dur: 0, inst: s.inst, p: s.p - .5, jumpOf: true });
    }

    const notes = densityCap(sel.concat(extra).sort((a, b) => a.b - b.b), spb, cfg.maxNps);
    assignLanes(notes, keyCount, cfg, rng);

    return {
      songId: song.id,
      title: song.title,
      sub: song.sub || '',
      bpm: song.bpm,
      spb,
      keyCount,
      diff: diffId,
      diffLabel: cfg.label,
      diffColor: cfg.color,
      duration: song.duration,
      c1: song.c1, c2: song.c2,
      notes
    };
  }

  /* ───────── 每秒密度上限 ─────────
   * 网格固定为十六分，单纯靠 minGap 限不住密度（8 分以下的间隔在网格上不存在）。
   * 这里再叠一层滑动窗口硬上限：任何 1 秒内不超过 maxNps 个 note，
   * 超了就丢掉窗口里优先级最低的那个（和押成员优先被丢）。 */
  function densityCap(notes, spb, maxNps) {
    const cap = Math.max(3, Math.round(maxNps));
    const win = 1 / spb;                   // 1 秒对应的拍数
    const out = [];
    for (let i = 0; i < notes.length; i++) {
      out.push(notes[i]);
      let cnt = 0;
      for (let j = out.length - 1; j >= 0 && out[j].b > notes[i].b - win; j--) cnt++;
      if (cnt > cap) {
        // 找窗口内优先级最低的；双押整组一起删，避免拆散成单押
        let worst = -1, wp = Infinity;
        for (let j = out.length - 1; j >= 0 && out[j].b > notes[i].b - win; j--) {
          const pr = out[j].jumpOf ? out[j].p - 1.5 : out[j].p;
          if (pr < wp) { wp = pr; worst = j; }
        }
        if (worst >= 0 && worst !== out.length - 1) {
          const b = out[worst].b;
          for (let j = out.length - 1; j >= 0; j--) {
            if (out[j].b === b) out.splice(j, 1);
          }
        }
      }
    }
    return out;
  }

  /* ───────── 轨道分配 ───────── */
  function assignLanes(notes, keyCount, cfg, rng) {
    const center = (keyCount - 1) / 2;
    const lastUse = new Array(keyCount).fill(-99);
    let lastLane = -1, lastHand = -1;

    // 同拍分组
    let i = 0;
    while (i < notes.length) {
      let j = i;
      const b = notes[i].b;
      while (j < notes.length && Math.abs(notes[j].b - b) < 1e-6) j++;
      const group = notes.slice(i, j);
      assignGroup(group, keyCount, center, lastUse, cfg, rng, b, lastLane, lastHand);
      // 更新状态
      const lanes = group.map(n => n.lane).sort((a, b2) => a - b2);
      for (const l of lanes) lastUse[l] = b;
      lastLane = lanes[lanes.length - 1];
      lastHand = lanes[Math.floor(lanes.length / 2)] < keyCount / 2 ? 0 : 1;
      i = j;
    }
  }

  /** 以中心为基准向外均匀展开一组同押 */
  function assignGroup(group, keyCount, center, lastUse, cfg, rng, beat, lastLane, lastHand) {
    const k = group.length;
    if (k === 1) {
      group[0].lane = pickLane(keyCount, center, lastUse, lastLane, lastHand, beat, cfg, rng);
      return;
    }
    const offsets = [];
    if (k % 2 === 1) {
      offsets.push(0);
      for (let d = 1; offsets.length < k; d++) { offsets.push(-d); if (offsets.length < k) offsets.push(d); }
    } else {
      for (let d = 1; offsets.length < k; d++) { offsets.push(-d); offsets.push(d); }
    }
    offsets.length = k;

    const need = new Set();
    for (let n = 0; n < k; n++) {
      const base = ((Math.round(center + offsets[n]) % keyCount) + keyCount) % keyCount;
      let placed = -1;
      for (let t = 0; t < keyCount; t++) {
        const cand = (base + t) % keyCount;
        if (!need.has(cand)) { placed = cand; break; }
      }
      if (placed < 0) placed = need.size % keyCount;
      need.add(placed);
      group[n].lane = placed;
    }
  }

  function pickLane(keyCount, center, lastUse, lastLane, lastHand, beat, cfg, rng) {
    let best = 0, bestScore = -1e9;
    for (let l = 0; l < keyCount; l++) {
      const since = beat - lastUse[l];
      let s = 0;
      if (lastLane >= 0) {
        const dist = Math.abs(l - lastLane);
        if (dist === 0) s -= 5.5;
        else if (dist === 1) s -= 1.1;
        else s += Math.min(2.2, dist * .55);
      }
      if (since < cfg.minGap) s -= 16;
      else if (since < cfg.minGap * 2.5) s -= 2.4;
      else s += Math.min(3.2, since * 1.1);
      const hand = l < keyCount / 2 ? 0 : 1;
      if (lastHand >= 0) s += hand !== lastHand ? 1.7 : -.8;
      s -= Math.abs(l - center) * .07;
      s += (rng() - .5) * 1.9;
      if (s > bestScore) { bestScore = s; best = l; }
    }
    return best;
  }

  /* ═══════════ 节拍检测（可独立测试） ═══════════
   * 两段式，避开「逐 lag 打分」的锯齿不稳定：
   *   1) 归一化自相关 tempogram + 对数高斯先验(120BPM) 找基线周期 —— 平滑、稳定；
   *   2) 只在该周期的 0.5×/1×/2× 三个倍频候选里，用「拍点网格信息量」决胜。
   *      网格分 = Σ(拍点起音强度) − λ·拍数，多出来的弱拍点会被自然扣掉。
   * 残留的倍频歧义对玩法无影响：候选网格仍是真实节拍的整数倍，
   * 量化后的 note 落点与真实起音一致，只是谱面密度差一倍。
   * 返回 { bpm, period(帧), phase(帧), onsets(帧索引) } */
  const GRID_LAMBDA = 0.3;

  function detectTempo(nov, frames, fps) {
    const minLag = Math.max(2, Math.floor(fps * 60 / 185));
    const maxLag = Math.min(frames - 2, Math.ceil(fps * 60 / 70));

    /* ── 1) tempogram 基线 ── */
    const ac = new Float32Array(maxLag + 1);
    for (let l = 1; l <= maxLag; l++) {
      let s = 0, e1 = 0, e2 = 0;
      for (let f = l; f < frames; f++) {
        s += nov[f] * nov[f - l]; e1 += nov[f] * nov[f]; e2 += nov[f - l] * nov[f - l];
      }
      ac[l] = s / (Math.sqrt(e1 * e2) + 1e-12);
    }
    const tempComb = (l) => {
      let s = 0, w = 0;
      for (let k = 1; k <= 4; k++) {
        const kl = k * l;
        if (kl > maxLag) break;
        const kk = 1 / k;
        s += ac[kl] * kk; w += kk;
      }
      return w ? s / w : 0;
    };
    let baseL = Math.round(fps * .5), bestScore = -1;
    for (let l = minLag; l <= maxLag; l++) {
      const prior = Math.exp(-0.5 * Math.pow(Math.log2((60 * fps / l) / 120) / 0.9, 2));
      const v = tempComb(l) * prior;
      if (v > bestScore) { bestScore = v; baseL = l; }
    }

    /* ── 2) 网格信息量决胜 ── */
    const sortedNov = Float32Array.from(nov).sort();       // TypedArray 排序即数值升序
    const scale = Math.max(1e-9, sortedNov[Math.floor(frames * 0.98)] || 1e-9);
    const inv = 1 / scale;
    const gridScore = (l) => {
      let sum = 0, n = 0;
      for (let f = 0; f < frames; f += l) {
        // 起音可能落在网格点前后一帧内（子帧对齐），取邻域最大值
        const c = Math.round(f);
        let m = 0;
        for (let d = -1; d <= 1; d++) {
          const i = c + d;
          if (i >= 0 && i < frames && nov[i] > m) m = nov[i];
        }
        sum += m * inv; n++;
      }
      return n ? (sum - GRID_LAMBDA * n) / n : -1;
    };

    let period = baseL;
    let bestGrid = -1;
    for (const mult of [0.5, 1, 2]) {
      const base = baseL * mult;
      if (base < 2 || base > maxLag) continue;
      let bl = base, bs = -1;
      for (let k = -16; k <= 16; k++) {
        const l = base * (1 + k * 0.005);
        if (l < 2 || l > maxLag) continue;
        const v = gridScore(l);
        if (v > bs) { bs = v; bl = l; }
      }
      if (bs > bestGrid) { bestGrid = bs; period = bl; }
    }

    /* ── 3) 折叠到 [70,185] BPM ── */
    let bpm = 60 * fps / period;
    while (bpm < 70) bpm *= 2;
    while (bpm > 185) bpm /= 2;
    bpm = Math.round(bpm * 10) / 10;

    /* ── 4) 相位：让拍点落在能量峰上 ── */
    let phase = 0, bestP = -1;
    for (let p = 0; p < period; p++) {
      let s = 0, c = 0;
      for (let f = Math.round(p); f < frames; f += period) { s += nov[Math.round(f)] * inv; c++; }
      s /= Math.max(1, c);
      if (s > bestP) { bestP = s; phase = p; }
    }
    return { bpm, period, phase };
  }

  /* ═══════════════ 导入音频 → 自动扒谱 ═══════════════ */

  async function analyzeAudio(ctx, arrayBuffer, name) {
    let buf;
    try {
      buf = await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch (e) {
      throw new Error('无法解码该音频文件');
    }
    const sr = buf.sampleRate;
    const n = buf.length;
    const chs = buf.numberOfChannels;

    // 下混单声道
    const mono = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i];
    }
    if (chs > 1) for (let i = 0; i < n; i++) mono[i] /= chs;

    // 能量包络
    const HOP = 512;
    const frames = Math.floor(n / HOP);
    const env = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      let s = 0;
      const off = f * HOP;
      for (let i = 0; i < HOP; i++) { const v = mono[off + i]; s += v * v; }
      env[f] = Math.sqrt(s / HOP);
    }

    //  novelty：正向能量差分
    const nov = new Float32Array(frames);
    for (let f = 1; f < frames; f++) {
      const d = env[f] - env[f - 1];
      nov[f] = d > 0 ? d : 0;
    }

    const fps = sr / HOP;
    const det = detectTempo(nov, frames, fps);
    const period = det.period;
    const bpm = det.bpm;
    const spb = 60 / bpm;
    const beatOffset = det.phase / fps;   // 秒

    /* 起音点：用节拍长度决定自适应窗口 */
    const W = Math.max(3, Math.round(period * .28));
    const MIN_SEP = Math.max(1, Math.round(period * .12));
    const onsets = [];
    let lastOnset = -1e9;
    for (let f = 1; f < frames - 1; f++) {
      let sum = 0, c = 0;
      for (let i = Math.max(0, f - W); i < Math.min(frames, f + W); i++) { sum += nov[i]; c++; }
      const thresh = (sum / Math.max(1, c)) * 1.6 + 1e-5;
      if (nov[f] > thresh && nov[f] >= nov[f - 1] && nov[f] > nov[f + 1] && f - lastOnset > MIN_SEP) {
        onsets.push(f / fps);
        lastOnset = f;
      }
    }

    const grid = spb / 4;
    const notes = [];
    let prevBeat = -99;
    for (const tSec of onsets) {
      let beat = Math.round((tSec - beatOffset) / grid) * grid;
      if (beat < 0) continue;
      if (beat - prevBeat < grid) continue;   // 同一格只取一个
      prevBeat = beat;
      let dur = 0;
      // 能量持续 → 长按
      const f0 = Math.floor(tSec * fps);
      const holdFrames = Math.round(spb * 1.0 * fps);
      let sustain = 0, cnt = 0, broke = -1;
      for (let f = f0 + 2; f < Math.min(frames, f0 + holdFrames); f++) {
        sustain += env[f]; cnt++;
        if (broke < 0 && env[f] < env[f0] * .45) broke = f - f0;
      }
      const avg = cnt ? sustain / cnt : 0;
      if (avg > env[f0] * .5 && (!broke || broke > fps * spb * .8)) dur = spb;
      notes.push({ b: beat, dur, inst: 'tap', p: 4, v: env[f0] });
    }

    if (!notes.length) throw new Error('未能在该音频中检测到明显的节奏');

    const beats = Math.ceil(notes[notes.length - 1].b + 8);
    return {
      id: 'custom-' + (name || Date.now()),
      title: (name || '导入曲目').replace(/\.[^.]+$/, ''),
      sub: '本地导入 · 自动扒谱',
      artist: 'Custom',
      bpm, spb, beats,
      duration: buf.duration,
      c1: '#25e0ff', c2: '#8b5cff',
      seed: 4242,
      events: notes.map(x => ({ b: x.b, d: x.dur ? x.dur : .25, i: 'tap', f: 60, v: x.v })),
      audioBuffer: buf,
      custom: true
    };
  }

  global.NP_Chart = { KEY_SETS, KEY_LABELS, keyLabel, AVAILABLE_KEYS, DIFF, buildChart, analyzeAudio, detectTempo };
})(window);
