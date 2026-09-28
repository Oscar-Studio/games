/* ═══════════════════════════════════════════════════════════
 * music.js — Web Audio 合成引擎 + 程序化作曲
 *
 * 设计要点：先 compose() 出「音符事件表」，谱面再从事件表派生，
 * 因此画面与音乐天然严格同步，不存在对轴问题。
 * ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ───────── 工具 ───────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ───────── 音阶 / 和弦 ───────── */
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    harmonic: [0, 2, 3, 5, 7, 8, 11]
  };
  const CHORDS = {
    min: [0, 3, 7], maj: [0, 4, 7], dim: [0, 3, 6], aug: [0, 4, 8],
    sus4: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10],
    dom7: [0, 4, 7, 10], add9: [0, 4, 7, 14], min9: [0, 3, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14], m7b5: [0, 3, 6, 10], sus2: [0, 2, 7]
  };

  function degreeToPc(scale, d) {
    return scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  }
  function degOf(scale, root, midi) {
    const rel = midi - root;
    const oct = Math.floor(rel / 12);
    const pc = ((rel % 12) + 12) % 12;
    let best = 0, bd = 99;
    for (let i = 0; i < 7; i++) {
      let dd = Math.abs(scale[i] - pc);
      if (dd > 6) dd = 12 - dd;
      if (dd < bd) { bd = dd; best = i; }
    }
    return oct * 7 + best;
  }
  function midiOfDeg(scale, root, deg) {
    const oct = Math.floor(deg / 7);
    return root + 12 * oct + scale[((deg % 7) + 7) % 7];
  }

  /* ───────── 曲目定义 ───────── */
  const SONGS = [
    {
      id: 'neon-drive',
      title: 'Neon Drive',
      sub: '霓虹夜驰',
      bpm: 128,
      root: 57, scale: 'minor',
      seed: 880612,
      c1: '#ff2f7d', c2: '#7b2dff',
      chordBeats: 8,
      prog: [[0, 'min'], [5, 'maj'], [2, 'maj'], [6, 'maj']],
      structure: [
        { name: 'intro', bars: 2, drums: 0, bass: 0, arp: 1, pad: 1, lead: 0, hat: 0 },
        { name: 'verse', bars: 8, drums: 1, bass: 1, arp: 1, pad: 1, lead: 1, hat: 1 },
        { name: 'build', bars: 4, drums: 2, bass: 1, arp: 1, pad: 1, lead: 0, hat: 2 },
        { name: 'drop', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'break', bars: 4, drums: 1, bass: 1, arp: 0, pad: 1, lead: 0, hat: 1 },
        { name: 'drop2', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'outro', bars: 4, drums: 1, bass: 0, arp: 1, pad: 1, lead: 1, hat: 1 }
      ]
    },
    {
      id: 'crystal-rain',
      title: 'Crystal Rain',
      sub: '水晶雨落',
      bpm: 138,
      root: 60, scale: 'major',
      seed: 20260928,
      c1: '#25e0ff', c2: '#3d7bff',
      chordBeats: 8,
      prog: [[0, 'maj'], [4, 'maj'], [5, 'min7'], [3, 'min7']],
      structure: [
        { name: 'intro', bars: 2, drums: 0, bass: 0, arp: 1, pad: 1, lead: 0, hat: 0 },
        { name: 'verse', bars: 8, drums: 1, bass: 1, arp: 1, pad: 1, lead: 1, hat: 1 },
        { name: 'build', bars: 4, drums: 2, bass: 1, arp: 2, pad: 1, lead: 1, hat: 2 },
        { name: 'drop', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'break', bars: 4, drums: 1, bass: 1, arp: 1, pad: 1, lead: 0, hat: 1 },
        { name: 'drop2', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'outro', bars: 4, drums: 0, bass: 0, arp: 1, pad: 1, lead: 1, hat: 1 }
      ]
    },
    {
      id: 'void-runner',
      title: 'Void Runner',
      sub: '虚空疾行',
      bpm: 148,
      root: 50, scale: 'phrygian',
      seed: 155377,
      c1: '#a855f7', c2: '#ff6b35',
      chordBeats: 4,
      prog: [[0, 'min'], [6, 'maj'], [1, 'maj'], [0, 'min']],
      structure: [
        { name: 'intro', bars: 2, drums: 0, bass: 1, arp: 1, pad: 1, lead: 0, hat: 0 },
        { name: 'verse', bars: 8, drums: 1, bass: 1, arp: 1, pad: 1, lead: 0, hat: 1 },
        { name: 'build', bars: 4, drums: 2, bass: 1, arp: 2, pad: 1, lead: 1, hat: 2 },
        { name: 'drop', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'break', bars: 4, drums: 1, bass: 1, arp: 0, pad: 1, lead: 1, hat: 1 },
        { name: 'drop2', bars: 8, dense: true, drums: 3, bass: 1, arp: 2, pad: 1, lead: 1, hat: 3 },
        { name: 'outro', bars: 4, drums: 2, bass: 1, arp: 1, pad: 1, lead: 0, hat: 2 }
      ]
    }
  ];

  /* ───────── 作曲 ───────── */

  const KICK_PAT = {
    1: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    2: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    3: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]
  };
  const SNARE_PAT = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const HAT_ACCENT = [1, .34, .58, .34, .82, .34, .58, .34, 1, .34, .58, .34, .82, .34, .58, .5];

  const RHYTHM_CELLS = [
    [1, .5, .5, 1, 1],
    [.5, .5, 1, .5, .5, 1],
    [1, .5, .5, .5, .5, 1],
    [2, 1, 1],
    [.5, .5, .5, .5, 1, 1],
    [1.5, .5, 1, 1],
    [.75, .25, 1, .5, 1.5],
    [1, 1, .5, .5, 1],
    [2, .5, .5, 1],
    [.5, 1, .5, 1, 1],
    [1, .5, .5, .5, .5, .5, .5, .5, 1]
  ];

  function compose(def) {
    const rng = mulberry32(def.seed);
    const scale = SCALES[def.scale];
    const bpb = 4;
    const ev = [];
    const push = (b, d, i, f, v, extra) => {
      if (b < -0.001) return;
      ev.push(Object.assign({ b, d, i, f, v, x: CUR_DENSE ? 1 : 0 }, extra || null));
    };
    let CUR_DENSE = false;

    // 段落
    const secs = [];
    let cur = 0;
    for (const s of def.structure) {
      secs.push(Object.assign({}, s, { start: cur, end: cur + s.bars * bpb }));
      cur += s.bars * bpb;
    }
    const totalBeats = cur;

    // 和弦查询
    function chordAt(b) {
      const idx = Math.floor(b / def.chordBeats) % def.prog.length;
      const p = def.prog[(idx + def.prog.length) % def.prog.length];
      const root = def.root + degreeToPc(scale, p[0]);
      const iv = CHORDS[p[1]] || CHORDS.maj;
      return { root, tones: iv.map(x => root + x), type: p[1] };
    }

    const pushPad = (b, d) => {
      const ch = chordAt(b);
      const v = ch.tones.map(m => {
        let n = m + 12;
        while (n < def.root + 12) n += 12;
        while (n > def.root + 26) n -= 12;
        return n;
      });
      push(b, d, 'pad', v, .5);
    };

    const pushBass = (b, d, v) => {
      const ch = chordAt(b);
      push(b, d, 'bass', ch.root - 12, v);
    };

    const pushArp = (b, d, v, pan) => {
      const ch = chordAt(b);
      const t = ch.tones.map(m => m + 12);
      if (t[t.length - 1] < def.root + 24) t.push(t[0] + 12);
      const deg = degOf(scale, def.root, t[0]);
      let idx = ((deg % t.length) + t.length) % t.length;
      const step = rng() < .5 ? 1 : -1;
      push(b, d, 'arp', t[idx], v, { pan });
      idx = ((idx + step) % t.length + t.length) % t.length;
    };

    for (const sec of secs) {
      CUR_DENSE = !!sec.dense;
      const ch = (b) => chordAt(b);

      /* — Pad — */
      if (sec.pad) {
        for (let b = sec.start; b < sec.end; b += def.chordBeats) {
          pushPad(b, Math.min(def.chordBeats, sec.end - b) + .6);
        }
      }

      /* — Bass — */
      if (sec.bass) {
        for (let b = sec.start; b < sec.end; b += .5) {
          const t = b + .5;
          if (t >= sec.end) break;
          const onBeat = Math.abs(t % 1) < .01;
          const r = rng();
          if (!onBeat && r < .34) continue;
          const cc = ch(t);
          let midi = cc.root - 12;
          if (!onBeat) {
            if (r > .78) midi += 7;
            else if (r > .62) midi += 12;
          }
          push(t, onBeat ? .42 : .3, 'bass', midi, onBeat ? .95 : .7);
        }
      }

      /* — Arp — */
      if (sec.arp) {
        const step = sec.arp >= 2 ? .25 : .5;
        const pat = sec.arp >= 2 ? [0, 1, 2, 3, 2, 1, 2, 3] : [0, 1, 2, 1];
        const span = Math.round(1 / step);
        let k = 0;
        for (let b = sec.start; b < sec.end - .001; b += step) {
          const onBeat = Math.abs(b % 1) < .01;
          const v = onBeat ? .62 : .44;
          pushArp(b + pat[k % pat.length] * 0, step * .92, v, (k % 2 ? -.42 : .42));
          k++;
        }
      }

      /* — Drums — */
      if (sec.drums > 0) {
        const kp = KICK_PAT[sec.drums] || KICK_PAT[1];
        for (let bar = 0; bar * bpb < sec.end - sec.start; bar++) {
          const barStart = sec.start + bar * bpb;
          if (barStart >= sec.end) break;
          for (let s = 0; s < 16; s++) {
            const b = barStart + s * .25;
            if (b >= sec.end) break;
            if (kp[s]) push(b, .25, 'kick', 60, .95 + (s === 0 ? .05 : 0));
            if (SNARE_PAT[s]) push(b, .25, 'snare', 60, .82);
            else if (sec.drums >= 2 && s % 4 === 2 && rng() < .28) push(b, .25, 'snare', 60, .3);
          }
          // hat：1=四分 2=八分 3=十六分
          if (sec.hat > 0) {
            const step = sec.hat >= 3 ? .25 : sec.hat >= 2 ? .5 : 1;
            for (let b = barStart; b < barStart + bpb && b < sec.end; b += step) {
              const s = Math.round((b - barStart) * 4);
              const acc = HAT_ACCENT[s % 16];
              if (sec.hat >= 3 && rng() < .1) continue;
              push(b, .125, 'hat', 60, .3 * acc + .07);
            }
          }
          // 段末 fill
          const isLast = (bar + 1) * bpb >= sec.end - sec.start;
          const nextBig = secs[secs.indexOf(sec) + 1];
          if (isLast && nextBig && nextBig.drums > sec.drums && sec.drums > 0) {
            for (let s = 12; s < 16; s++) {
              push(barStart + s * .25, .25, 'snare', 60, .35 + (s - 12) * .13);
            }
          }
        }
      }

      /* — Lead — */
      if (sec.lead) {
        const cell = 8;
        let prev = def.root + 24;
        let dir = rng() < .5 ? 1 : -1;
        for (let b = sec.start; b < sec.end - .001; b += cell) {
          const remaining = sec.end - b;
          const steps = remaining < cell - .01 ? pick(rng, [[4, 2, 2], [2, 1, 1], [1, 1, 2], [3, 1, 2, 2]]) : pick(rng, RHYTHM_CELLS);
          let t = b;
          for (const len of steps) {
            if (t >= sec.end - .01) break;
            const dur = Math.min(len * .93, sec.end - t);
            if (dur <= .05) break;
            const onBar = Math.abs(t % 4) < .01;
            const onHalf = Math.abs(t % 2) < .01;
            let midi;
            if (onBar || onHalf) {
              const cc = ch(t);
              midi = cc.tones[Math.floor(rng() * cc.tones.length)];
              if (midi < def.root + 19) midi += 12;
              if (onBar && rng() < .3) midi += 12;
            } else {
              midi = midiOfDeg(scale, def.root, degOf(scale, def.root, prev) + Math.round(dir * (rng() < .74 ? 1 : 2)));
              if (midi > def.root + 36) midi -= 12;
              if (midi < def.root + 15) midi += 12;
            }
            prev = midi;
            if (rng() < .16) dir *= -1;
            const v = onBar ? .8 : onHalf ? .68 : .55;
            push(t, dur, 'lead', midi, v);
            t += len;
          }
        }
      }
    }

    // Stab：段落切换处的和弦重音
    for (let i = 1; i < secs.length; i++) {
      const sec = secs[i];
      if (sec.drums < 2) continue;
      const cc = chordAt(sec.start);
      push(sec.start, .5, 'stab', cc.tones.map(m => m + 12), .5);
    }

    CUR_DENSE = false;
    ev.sort((a, b) => a.b - b.b);

    return {
      id: def.id, title: def.title, sub: def.sub, artist: 'NEON PULSE',
      bpm: def.bpm, beats: totalBeats, spb: 60 / def.bpm,
      duration: totalBeats * (60 / def.bpm) + 1.4,
      c1: def.c1, c2: def.c2, seed: def.seed, root: def.root,
      scaleName: def.scale, events: ev, custom: false
    };
  }

  /* ───────── 合成器 ───────── */

  function makeIR(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
  function makeNoise(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  class Synth {
    constructor(ctx) {
      const c = this.ctx = ctx;
      this.master = c.createGain(); this.master.gain.value = .9;

      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -15; comp.knee.value = 26; comp.ratio.value = 3.4;
      comp.attack.value = .004; comp.release.value = .22;
      this.master.connect(comp); comp.connect(c.destination);

      this.verb = c.createConvolver();
      this.verb.buffer = makeIR(c, 2.6, 2.6);
      const vg = c.createGain(); vg.gain.value = .85;
      this.verb.connect(vg); vg.connect(this.master);
      this.verbSend = c.createGain(); this.verbSend.gain.value = 1;
      this.verbSend.connect(this.verb);

      this.delay = c.createDelay(1.5);
      const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2800;
      const fb = c.createGain(); fb.gain.value = .33;
      this.delayOut = c.createGain(); this.delayOut.gain.value = .55;
      this.delay.connect(df); df.connect(fb); fb.connect(this.delay);
      this.delay.connect(this.delayOut); this.delayOut.connect(this.master);
      this.delaySend = c.createGain(); this.delaySend.gain.value = 1;
      this.delaySend.connect(this.delay);

      this.noiseBuf = makeNoise(c, 2);

      this.music = c.createGain(); this.music.gain.value = 1;
      this.musicVol = c.createGain(); this.musicVol.gain.value = .7;
      this.music.connect(this.musicVol); this.musicVol.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 1;
      this.sfxVol = c.createGain(); this.sfxVol.gain.value = .6;
      this.sfx.connect(this.sfxVol); this.sfxVol.connect(this.master);
    }
    setMusicVolume(v) { this.musicVol.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, .02); }
    setSfxVolume(v) { this.sfxVol.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, .02); }

    _noise(rate) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      s.playbackRate.value = rate || (0.82 + Math.random() * .36);
      return s;
    }
    _pan(node, pan) {
      if (!pan) return node;
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      return p;
    }

    kick(t, v) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(158, t);
      o.frequency.exponentialRampToValueAtTime(45, t + .08);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + .004);
      g.gain.exponentialRampToValueAtTime(.0001, t + .33);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + .36);

      const n = this._noise(1.6);
      const nf = c.createBiquadFilter(); nf.type = 'bandpass';
      nf.frequency.value = 2300; nf.Q.value = .8;
      const ng = c.createGain();
      ng.gain.setValueAtTime(v * .4, t);
      ng.gain.exponentialRampToValueAtTime(.0001, t + .028);
      n.connect(nf); nf.connect(ng); ng.connect(this.music);
      n.start(t); n.stop(t + .05);
    }

    snare(t, v) {
      const c = this.ctx;
      const n = this._noise(1);
      const nf = c.createBiquadFilter(); nf.type = 'bandpass';
      nf.frequency.value = 1850; nf.Q.value = .7;
      const ng = c.createGain();
      ng.gain.setValueAtTime(v * .8, t);
      ng.gain.exponentialRampToValueAtTime(.0001, t + .17);
      n.connect(nf); nf.connect(ng); ng.connect(this.music);
      const send = c.createGain(); send.gain.value = .16;
      ng.connect(send); send.connect(this.verbSend);
      n.start(t); n.stop(t + .2);

      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(196, t);
      o.frequency.exponentialRampToValueAtTime(140, t + .09);
      const g = c.createGain();
      g.gain.setValueAtTime(v * .5, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .12);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + .14);
    }

    hat(t, v) {
      const c = this.ctx;
      const n = this._noise(1.7);
      const nf = c.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 7600;
      const g = c.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .045);
      n.connect(nf); nf.connect(g); g.connect(this.music);
      n.start(t); n.stop(t + .07);
    }

    bass(t, midi, dur, v) {
      const c = this.ctx;
      const f = mtof(midi);
      const g = c.createGain();
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 7;
      flt.frequency.setValueAtTime(Math.min(2400, f * 9), t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(180, f * 2.2), t + Math.min(dur, .3));
      flt.connect(g); g.connect(this.music);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * .5, t + .008);
      g.gain.setTargetAtTime(v * .34, t + .01, .12);
      g.gain.setValueAtTime(v * .34, t + Math.max(.02, dur - .05));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur + .04);
      for (const det of [-7, 7]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        o.connect(flt); o.start(t); o.stop(t + dur + .08);
      }
      const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(v * .3, t + .01);
      sg.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
      sub.connect(sg); sg.connect(this.music);
      sub.start(t); sub.stop(t + dur + .08);
    }

    lead(t, midi, dur, v) {
      const c = this.ctx;
      const f = mtof(midi);
      const g = c.createGain();
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 3;
      flt.frequency.setValueAtTime(Math.min(6000, f * 7), t);
      flt.frequency.exponentialRampToValueAtTime(Math.min(3400, f * 3.4), t + Math.min(.22, dur));
      flt.connect(g); g.connect(this.music);
      const vs = c.createGain(); vs.gain.value = .3; g.connect(vs); vs.connect(this.verbSend);
      const ds = c.createGain(); ds.gain.value = .16; g.connect(ds); ds.connect(this.delaySend);

      const rel = .06;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * .3, t + .012);
      g.gain.setTargetAtTime(v * .21, t + .012, .09);
      g.gain.setValueAtTime(v * .21, t + Math.max(.03, dur - rel));
      g.gain.exponentialRampToValueAtTime(.0001, t + dur + .1);
      for (const det of [-8, 8, 0]) {
        const o = c.createOscillator();
        o.type = det === 0 ? 'square' : 'sawtooth';
        o.frequency.value = det === 0 ? f * 2 : f;
        o.detune.value = det;
        const og = c.createGain(); og.gain.value = det === 0 ? .22 : .5;
        o.connect(og); og.connect(flt);
        o.start(t); o.stop(t + dur + .14);
      }
    }

    arp(t, midi, dur, v, pan) {
      const c = this.ctx;
      const f = mtof(midi);
      const flt = c.createBiquadFilter(); flt.type = 'lowpass';
      flt.frequency.setValueAtTime(Math.min(7000, f * 8), t);
      flt.frequency.exponentialRampToValueAtTime(Math.min(2200, f * 3), t + Math.min(.16, dur));
      flt.Q.value = 2;
      const g = c.createGain();
      flt.connect(g);
      const out = this._pan(g, pan); out.connect(this.music);
      const vs = c.createGain(); vs.gain.value = .34; out.connect(vs); vs.connect(this.verbSend);

      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * .32, t + .006);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur + .07);
      for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        o.connect(flt); o.start(t); o.stop(t + dur + .1);
      }
    }

    pad(t, midis, dur, v) {
      const c = this.ctx;
      const g = c.createGain();
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 1;
      flt.frequency.setValueAtTime(900, t);
      flt.frequency.linearRampToValueAtTime(2100, t + dur * .5);
      flt.frequency.linearRampToValueAtTime(900, t + dur);
      flt.connect(g); g.connect(this.music);
      const vs = c.createGain(); vs.gain.value = .55; g.connect(vs); vs.connect(this.verbSend);

      const atk = Math.min(.5, dur * .35);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * .12, t + atk);
      g.gain.setValueAtTime(v * .12, t + Math.max(atk, dur - .5));
      g.gain.linearRampToValueAtTime(0, t + dur + .4);

      for (const m of midis) {
        for (const det of [-9, 9]) {
          const o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = mtof(m); o.detune.value = det;
          o.connect(flt); o.start(t); o.stop(t + dur + .5);
        }
      }
    }

    stab(t, midis, dur, v) {
      const c = this.ctx;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass';
      flt.frequency.setValueAtTime(5200, t);
      flt.frequency.exponentialRampToValueAtTime(1300, t + dur);
      const g = c.createGain();
      flt.connect(g); g.connect(this.music);
      const vs = c.createGain(); vs.gain.value = .3; g.connect(vs); vs.connect(this.verbSend);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * .22, t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur + .06);
      for (const m of midis) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
        o.connect(flt); o.start(t); o.stop(t + dur + .1);
      }
    }

    /** 打击反馈音 */
    hit(kind) {
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      const cfg = {
        perfect: { f: 1760, to: 2640, v: .2, d: .07, type: 'triangle' },
        great: { f: 1320, to: 1760, v: .15, d: .06, type: 'triangle' },
        good: { f: 880, to: 990, v: .11, d: .05, type: 'sine' },
        bad: { f: 220, to: 150, v: .12, d: .09, type: 'square' }
      }[kind] || { f: 1000, to: 1200, v: .1, d: .05, type: 'sine' };
      o.type = cfg.type;
      o.frequency.setValueAtTime(cfg.f, t);
      o.frequency.exponentialRampToValueAtTime(cfg.to, t + cfg.d);
      g.gain.setValueAtTime(cfg.v, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + cfg.d);
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + cfg.d + .02);
    }
  }

  /* ───────── 播放器（带前瞻调度） ───────── */
  class MusicPlayer {
    constructor(ctx, synth) {
      this.ctx = ctx; this.synth = synth;
      this.comp = null; this.idx = 0; this.t0 = 0;
      this.timer = null; this.paused = false;
      this.onEnd = null;
      this.src = null;
    }
    load(comp) {
      this.stop();
      this.comp = comp; this.idx = 0;
    }
    start(at) {
      this.t0 = at;
      this.idx = 0;
      this.paused = false;
      clearInterval(this.timer);
      if (this.comp.audioBuffer) {
        const s = this.ctx.createBufferSource();
        s.buffer = this.comp.audioBuffer;
        s.connect(this.synth.music);
        s.start(at);
        this.src = s;
      }
      this.timer = setInterval(() => this._pump(), 25);
      this._pump();
    }
    get time() { return this.ctx.currentTime - this.t0; }
    _pump() {
      if (!this.comp || this.paused) return;
      const spb = this.comp.spb;
      if (!this.comp.audioBuffer) {
        const ahead = this.ctx.currentTime + .28;
        const ev = this.comp.events;
        while (this.idx < ev.length) {
          const e = ev[this.idx];
          const t = this.t0 + e.b * spb;
          if (t > ahead) break;
          this._play(e, Math.max(t, this.ctx.currentTime + .001));
          this.idx++;
        }
      }
      if (this.idx >= this.comp.events.length && this.onEnd) {
        const end = this.t0 + this.comp.duration;
        if (this.ctx.currentTime > end) { const f = this.onEnd; this.onEnd = null; f(); }
      }
    }
    _play(e, t) {
      const s = this.synth, v = e.v;
      switch (e.i) {
        case 'kick': s.kick(t, v); break;
        case 'snare': s.snare(t, v); break;
        case 'hat': s.hat(t, v); break;
        case 'bass': s.bass(t, e.f, e.d * this.comp.spb, v); break;
        case 'lead': s.lead(t, e.f, e.d * this.comp.spb, v); break;
        case 'arp': s.arp(t, e.f, e.d * this.comp.spb, v, e.pan); break;
        case 'pad': s.pad(t, e.f, e.d * this.comp.spb, v); break;
        case 'stab': s.stab(t, e.f, e.d * this.comp.spb, v); break;
      }
    }
    pause() {
      if (this.paused || !this.comp) return;
      this.paused = true;
      this.pausedAt = this.ctx.currentTime;
      clearInterval(this.timer); this.timer = null;
    }
    resume() {
      if (!this.paused) return;
      const gap = this.ctx.currentTime - this.pausedAt;
      this.t0 += gap;              // 音乐时间轴随之推后
      this.paused = false;
      this.timer = setInterval(() => this._pump(), 25);
      this._pump();
    }
    stop() {
      clearInterval(this.timer); this.timer = null;
      this.paused = false; this.idx = 0;
      if (this.src) {
        try { this.src.onended = null; this.src.stop(); } catch (e) { }
        try { this.src.disconnect(); } catch (e) { }
        this.src = null;
      }
    }
    /** 跳到指定歌曲时间（未播放事件会被重新调度） */
    seek(t) {
      if (!this.comp) return;
      this.t0 = this.ctx.currentTime - t;
      this.idx = 0;
      while (this.idx < this.comp.events.length && this.comp.events[this.idx].b * this.comp.spb < t) this.idx++;
    }
  }

  /* 编译缓存 */
  const _cache = new Map();
  function getSong(id) {
    if (_cache.has(id)) return _cache.get(id);
    const def = SONGS.find(s => s.id === id) || SONGS[0];
    const c = compose(def);
    _cache.set(id, c);
    return c;
  }
  function metaOf(id) {
    const def = SONGS.find(s => s.id === id) || SONGS[0];
    return { id: def.id, title: def.title, sub: def.sub, bpm: def.bpm, c1: def.c1, c2: def.c2, custom: false };
  }

  global.NP_Music = { SONGS, compose, Synth, MusicPlayer, getSong, metaOf, mtof, SCALES, CHORDS, mulberry32 };
})(window);
