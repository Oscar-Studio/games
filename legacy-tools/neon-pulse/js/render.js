/* ═══════════════════════════════════════════════════════════
 * render.js — 画面渲染（背景动效 / 游玩场地）
 * ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const LANE_COLORS = [
    '#ff3d6e', '#ff8a3d', '#ffd93d', '#5ce08a', '#25e0ff', '#4d7cff',
    '#9b5cff', '#e04dff', '#ff4ddb', '#ff6b6b', '#f4d35e', '#2dd4bf'
  ];

  const JUDGE_COLORS = {
    perfect: '#ffe14d', great: '#25e0ff', good: '#ff3d81',
    miss: '#ff4d4d', break: '#ff8a3d'
  };

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function hex2rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ═══════════ 预渲染精灵 ═══════════ */
  function makeSprite(w, h, dpr, draw) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * dpr));
    cv.height = Math.max(1, Math.ceil(h * dpr));
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    draw(g, w, h);
    return cv;
  }

  class SpriteCache {
    constructor() { this.map = new Map(); }
    get(key, w, h, dpr, draw) {
      const k = key + '|' + Math.round(w) + '|' + Math.round(h) + '|' + dpr;
      let s = this.map.get(k);
      if (!s) { s = makeSprite(w, h, dpr, draw); this.map.set(k, s); }
      return s;
    }
    clear() { this.map.clear(); }
  }

  /* ═══════════ 背景动效 ═══════════ */
  class BgFx {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.dots = [];
      this.t = 0;
      this.enabled = true;
      this.dim = .45;
      this.tint = ['#ff3d81', '#8b5cff', '#25e0ff'];
      this.resize();
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.cv.width = Math.max(1, Math.floor(this.w * dpr));
      this.cv.height = Math.max(1, Math.floor(this.h * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
      const want = Math.round(Math.min(90, this.w / 22));
      this.dots = [];
      for (let i = 0; i < want; i++) {
        this.dots.push({
          x: Math.random() * this.w, y: Math.random() * this.h,
          r: 1 + Math.random() * 2.4,
          vx: (Math.random() - .5) * .22, vy: -(.12 + Math.random() * .3),
          a: .16 + Math.random() * .38,
          hue: Math.random()
        });
      }
    }
    draw(dt, pulse) {
      const g = this.ctx, w = this.w, h = this.h;
      this.t += dt;
      g.clearRect(0, 0, w, h);
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#0a0818');
      grd.addColorStop(.5, '#07060e');
      grd.addColorStop(1, '#0c0714');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      if (!this.enabled) return;

      // 呼吸光晕
      const R = Math.max(w, h) * .55;
      const pulseK = 1 + (pulse || 0) * .12;
      for (let i = 0; i < 3; i++) {
        const a = this.t * (.06 + i * .017) + i * 2.1;
        const x = w * (.5 + .34 * Math.cos(a));
        const y = h * (.5 + .3 * Math.sin(a * .82));
        const rad = R * pulseK;
        const rg = g.createRadialGradient(x, y, 0, x, y, rad);
        const col = this.tint[i];
        rg.addColorStop(0, hex2rgba(col, .13 * this.dim * 2.2 * pulseK));
        rg.addColorStop(1, hex2rgba(col, 0));
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      }
      // 粒子
      for (const d of this.dots) {
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y < -8) { d.y = h + 8; d.x = Math.random() * w; }
        if (d.x < -8) d.x = w + 8; else if (d.x > w + 8) d.x = -8;
        const col = this.tint[Math.floor(d.hue * 3) % 3];
        g.fillStyle = hex2rgba(col, d.a * this.dim * 1.5);
        g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
      }
    }
  }

  /* ═══════════ 游玩场地渲染 ═══════════ */
  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.sprites = new SpriteCache();
      this.bloom = true;
      this.bgDim = .45;
      // 只有「主指针是触摸」才算触摸设备；触屏笔记本主指针仍是鼠标，不受影响
      try {
        this.coarse = window.matchMedia('(pointer: coarse)').matches;
      } catch (e) { this.coarse = (navigator.maxTouchPoints || 0) > 0; }
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.dpr = dpr;
      this.cv.width = Math.max(1, Math.floor(this.w * dpr));
      this.cv.height = Math.max(1, Math.floor(this.h * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
    }

    layout() {
      const w = this.w, h = this.h;
      // 主指针是触摸才算「触摸设备」—— 触屏笔记本的主指针仍是鼠标/触控板，
      // 不应该被降级成手机布局。matchMedia 不可用时才退回 maxTouchPoints。
      const touch = this.coarse;
      const narrow = w < 760;                 // 竖屏手机 / 窄窗口
      const short = h < 620;                  // 横屏手机：纵向空间紧张
      const compact = narrow || short || touch;

      let playW;
      if (narrow) playW = Math.min(w * .985, 760);
      else if (short) playW = Math.min(w * .90, 900);
      else if (touch) playW = Math.min(w * .80, 900);
      else playW = Math.min(w * .62, 880);

      const judgeY = Math.round(h * (short ? .58 : narrow ? .705 : touch ? .62 : .745));
      const keyH = Math.round(compact
        ? Math.max(46, Math.min(70, h * .085))
        : Math.max(30, Math.min(58, h * .075)));

      this.L = {
        w, h, playW, padL: (w - playW) / 2, laneW: playW / Math.max(1, this.keyCount || 4), judgeY,
        keyTop: judgeY + Math.max(8, h * (compact ? .014 : .012)),
        keyH,
        topGap: h * (compact ? .16 : .12),
        noteH: Math.round(compact
          ? Math.max(22, Math.min(58, h * .05))
          : Math.max(20, Math.min(48, h * .052))),
        compact
      };
      this.L.keyBot = this.L.keyTop + keyH;
      // 触摸判定区：从场地中部往下都可点，上面留白避免误触
      this.L.touchTop = h * .22;
    }

    /** 屏幕坐标 → 轨道；不在判定区内返回 -1 */
    laneAt(x, y) {
      const L = this.L;
      if (x < L.padL || x >= L.padL + L.playW) return -1;
      if (y !== undefined && y < L.touchTop) return -1;
      const k = Math.max(1, this.keyCount || 1);
      return Math.max(0, Math.min(k - 1, Math.floor((x - L.padL) / L.laneW)));
    }

    setKeyCount(k) { this.keyCount = k; this.layout(); this.sprites.clear(); }

    laneX(lane) { return this.L.padL + (lane + .5) * this.L.laneW; }

    /** 预渲染单点音符 */
    tapSprite(color, laneW, noteH) {
      const w = Math.max(6, laneW * .78), h = this.L.noteH;
      const pad = 22;
      return this.sprites.get('tap' + color, w + pad * 2, h + pad * 2, this.dpr, (g, W, H) => {
        const x = pad, y = pad;
        if (this.bloom) {
          g.shadowColor = hex2rgba(color, .85);
          g.shadowBlur = 18;
        }
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, shade(color, .5));
        grd.addColorStop(.16, color);
        grd.addColorStop(1, shade(color, -.45));
        g.fillStyle = grd;
        roundRect(g, x, y, w, h, Math.min(h / 2, 11));
        g.fill();
        g.shadowBlur = 0;
        // 高光
        g.fillStyle = 'rgba(255,255,255,.42)';
        roundRect(g, x + w * .12, y + h * .16, w * .76, Math.max(2, h * .12), h * .06);
        g.fill();
        // 描边
        g.strokeStyle = 'rgba(255,255,255,.75)';
        g.lineWidth = 1.4;
        roundRect(g, x + .7, y + .7, w - 1.4, h - 1.4, Math.min(h / 2, 11));
        g.stroke();
      });
    }

    lineSprite(w) {
      return this.sprites.get('line', w, 26, this.dpr, (g, W, H) => {
        const y = 12;
        if (this.bloom) { g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 14; }
        const grd = g.createLinearGradient(0, y - 2, 0, y + 2);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(.5, 'rgba(255,255,255,.95)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, y - 2, W, 4);
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(0, y - .8, W, 1.6);
      });
    }

    glowSprite(r) {
      return this.sprites.get('glow' + Math.round(r), r * 2, r * 2, this.dpr, (g, W) => {
        const rg = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
        rg.addColorStop(0, 'rgba(255,255,255,1)');
        rg.addColorStop(.35, 'rgba(255,255,255,.45)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, W);
      });
    }

    /* ───── 主绘制 ───── */
    render(g) {
      const ctx = this.ctx, L = this.L;
      ctx.clearRect(0, 0, L.w, L.h);

      const keyCount = g.keyCount;
      const laneW = L.laneW, padL = L.padL, judgeY = L.judgeY;
      const top = 0, bot = judgeY;

      /* 场地底 */
      const bg = ctx.createLinearGradient(0, 0, 0, L.h);
      bg.addColorStop(0, 'rgba(8,6,18,' + (0.30 + this.bgDim * .5) + ')');
      bg.addColorStop(.72, 'rgba(6,5,14,' + (0.45 + this.bgDim * .4) + ')');
      bg.addColorStop(1, 'rgba(4,3,10,' + (0.72 + this.bgDim * .25) + ')');
      ctx.fillStyle = bg;
      ctx.fillRect(padL - laneW * .35, top, laneW * keyCount + laneW * .7, L.h);

      /* 律动光带 */
      const beatPulse = g.beatPulse;
      const tintA = hex2rgba(g.c1 || '#ff3d81', .10 + beatPulse * .1);
      const tintB = hex2rgba(g.c2 || '#8b5cff', .09 + beatPulse * .09);
      const tg = ctx.createLinearGradient(0, 0, 0, judgeY);
      tg.addColorStop(0, tintB);
      tg.addColorStop(1, tintA);
      ctx.fillStyle = tg;
      ctx.fillRect(padL - laneW * .35, top, laneW * keyCount + laneW * .7, judgeY);

      /* 轨道分隔 */
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.055)';
      ctx.lineWidth = 1;
      for (let i = 1; i < keyCount; i++) {
        const x = Math.round(padL + i * laneW) + .5;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, L.keyBot); ctx.stroke();
      }
      ctx.restore();

      /* 判定线上下辉光 */
      if (this.bloom) {
        const gg = ctx.createLinearGradient(0, judgeY - 46, 0, judgeY + 46);
        gg.addColorStop(0, 'rgba(255,255,255,0)');
        gg.addColorStop(.5, 'rgba(255,255,255,' + (.05 + beatPulse * .07) + ')');
        gg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(padL - laneW * .5, judgeY - 46, laneW * keyCount + laneW, 92);
      }

      /* 音符（先长按后单点） */
      const ppb = g.ppb;
      const cur = g.currentBeat;
      const visible = 6.2;
      const taps = [];

      for (const n of g.notes) {
        if (n.judged && !n.holding && !(n.type === 'tap' && n.hitFlash > 0)) continue;
        if (n.holding && n.broken) continue;
        const dtb = n.b - cur;
        if (dtb > visible) continue;
        if (dtb < -0.9) continue;
        if (n.type === 'hold') {
          const headY = judgeY - dtb * ppb;
          let endBeat = n.b + n.dur;
          if (n.holding) endBeat = Math.min(endBeat, cur);
          const tailY = judgeY - (endBeat - cur) * ppb;
          if (tailY < judgeY - visible * ppb - 40) continue;
          this.drawHold(ctx, n, headY, tailY, laneW, beatPulse);
        } else {
          taps.push(n);
        }
      }

      for (const n of taps) {
        const y = judgeY - (n.b - cur) * ppb;
        const approaching = Math.max(0, 1 - Math.abs(n.b - cur) / 2.2);
        const c = LANE_COLORS[n.lane % LANE_COLORS.length];
        const spr = this.tapSprite(c, laneW, L.noteH);
        const sw = spr.width / this.dpr, sh = spr.height / this.dpr;
        const x = this.laneX(n.lane);
        // 击碎闪光：命中瞬间向外炸开并消失
        const f = n.hitFlash > 0 ? Math.max(0, 1 - n.hitFlash) : 1;
        const k = n.hitFlash > 0 ? 1 + (1 - f) * .9 : 1;
        const dw = sw * k, dh = sh * k;
        ctx.globalAlpha = (0.34 + approaching * 0.66) * f;
        ctx.drawImage(spr, x - dw / 2, y - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
      }

      /* 长按光柱 */
      for (const b of g.beams) {
        const c = LANE_COLORS[b.lane % LANE_COLORS.length];
        const x = this.laneX(b.lane);
        const y0 = judgeY - 6;
        const y1 = b.topY;
        const bgd = ctx.createLinearGradient(0, y0, 0, y1);
        bgd.addColorStop(0, hex2rgba(c, .40));
        bgd.addColorStop(1, hex2rgba(c, 0));
        ctx.fillStyle = bgd;
        ctx.fillRect(x - laneW * .32, Math.min(y0, y1), laneW * .64, Math.abs(y0 - y1));
      }

      /* 判定线 */
      const ls = this.lineSprite(L.playW);
      ctx.globalAlpha = .75 + beatPulse * .25;
      ctx.drawImage(ls, padL, judgeY - 13, L.playW, 26);
      ctx.globalAlpha = 1;

      /* 接收器 / 按键 */
      for (let i = 0; i < keyCount; i++) {
        const x = padL + i * laneW;
        const flash = g.laneFlash[i] || 0;
        const c = LANE_COLORS[i % LANE_COLORS.length];
        const y = L.keyTop, h = L.keyH;

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.035)';
        roundRect(ctx, x + 2, y, laneW - 4, h, 9); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.09)';
        ctx.lineWidth = 1;
        roundRect(ctx, x + 2.5, y + .5, laneW - 5, h - 1, 9); ctx.stroke();

        if (flash > 0) {
          ctx.shadowColor = hex2rgba(c, .9);
          ctx.shadowBlur = 22 * flash;
          const grd = ctx.createLinearGradient(0, y, 0, y + h);
          grd.addColorStop(0, hex2rgba(c, .18 + flash * .6));
          grd.addColorStop(1, hex2rgba(c, .55 + flash * .45));
          ctx.fillStyle = grd;
          roundRect(ctx, x + 2, y, laneW - 4, h, 9); ctx.fill();
        }
        ctx.restore();

        // 判定点（触摸设备加大加亮，作为明确的点按目标）
        const px = this.laneX(i), py = judgeY;
        const base = L.compact ? 8 : 5;
        const pr = base + flash * (L.compact ? 8 : 5);
        ctx.save();
        if (L.compact) {
          ctx.strokeStyle = hex2rgba(c, .35 + flash * .5);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, pr + 7, 0, 7); ctx.stroke();
        }
        if (this.bloom && flash > 0) { ctx.shadowColor = hex2rgba(c, 1); ctx.shadowBlur = 18; }
        ctx.fillStyle = flash > 0 ? '#fff' : (L.compact ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.35)');
        ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
        ctx.restore();
      }

      /* 特效 */
      this.drawEffects(ctx, g);

      /* 连击：画在场地左侧空白区，避免压住 note */
      if (g.combo > 1 && padL > 96) {
        const pop = 1 + g.comboPop * .45;
        const size = Math.min(62, 34 + Math.min(g.combo, 300) * .06) * pop;
        const cx = Math.max(14, padL - laneW * .5 - 26);
        const baseY = judgeY - 30;
        ctx.save();
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '900 ' + size.toFixed(1) + 'px Inter, system-ui, sans-serif';
        ctx.shadowColor = 'rgba(255,61,129,.7)';
        ctx.shadowBlur = 26;
        ctx.fillStyle = '#fff';
        ctx.fillText(String(g.combo), cx, baseY);
        ctx.shadowBlur = 0;
        ctx.font = '800 11px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.letterSpacing = '4px';
        ctx.fillText('COMBO', cx - 2, baseY + 17);
        ctx.letterSpacing = '0px';
        ctx.restore();
      }

      /* 判定文字 */
      for (const t of g.texts) {
        const k = t.t / t.life;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.textAlign = 'center';
        ctx.font = '900 20px Inter, system-ui, sans-serif';
        ctx.shadowColor = t.color; ctx.shadowBlur = 14;
        ctx.fillStyle = t.color;
        const y = t.y - k * 34;
        const sc = 1 + (1 - Math.min(1, k * 5)) * .25;
        ctx.translate(t.x, y); ctx.scale(sc, sc);
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
      }

      /* 判定线区域暗角 */
      const vg = ctx.createLinearGradient(0, judgeY - 90, 0, judgeY);
      vg.addColorStop(0, 'rgba(4,3,10,0)');
      vg.addColorStop(1, 'rgba(4,3,10,.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(padL - laneW * .5, judgeY - 90, L.playW + laneW, 90);

      /* 顶部压暗：保证 HUD 在 note 从上方落下时仍然可读 */
      if (L.compact) {
        const ts = ctx.createLinearGradient(0, 0, 0, L.h * .2);
        ts.addColorStop(0, 'rgba(4,3,10,.72)');
        ts.addColorStop(1, 'rgba(4,3,10,0)');
        ctx.fillStyle = ts;
        ctx.fillRect(0, 0, L.w, L.h * .2);
      }

      /* 左右边缘柔化，避免场地出现生硬的直边 */
      const bleed = laneW * .35;             // 场地底色比轨道区多画出的余量
      const fadeW = bleed + laneW * .45;
      const lx = padL - bleed;
      const fl = ctx.createLinearGradient(lx, 0, lx + fadeW, 0);
      fl.addColorStop(0, 'rgba(4,3,10,.92)');
      fl.addColorStop(1, 'rgba(4,3,10,0)');
      ctx.fillStyle = fl;
      ctx.fillRect(lx, 0, fadeW, L.h);
      const rx = padL + L.playW + bleed;
      const fr = ctx.createLinearGradient(rx, 0, rx - fadeW, 0);
      fr.addColorStop(0, 'rgba(4,3,10,.92)');
      fr.addColorStop(1, 'rgba(4,3,10,0)');
      ctx.fillStyle = fr;
      ctx.fillRect(rx - fadeW, 0, fadeW, L.h);
    }

    drawHold(ctx, n, headY, tailY, laneW, beatPulse) {
      const c = LANE_COLORS[n.lane % LANE_COLORS.length];
      const x = this.laneX(n.lane);
      const w = laneW * .58;
      const yTop = Math.min(tailY, headY);
      const yBot = headY;
      const hh = Math.max(2, yBot - yTop);
      const hold = n.holding;

      ctx.save();
      if (hold && this.bloom) { ctx.shadowColor = hex2rgba(c, .7); ctx.shadowBlur = 18; }
      const grd = ctx.createLinearGradient(0, yTop, 0, yBot);
      grd.addColorStop(0, hex2rgba(c, hold ? .95 : .6));
      grd.addColorStop(.55, hex2rgba(c, hold ? .6 : .34));
      grd.addColorStop(1, hex2rgba(c, hold ? .3 : .16));
      ctx.fillStyle = grd;
      roundRect(ctx, x - w / 2, yTop, w, hh, Math.min(9, w / 2));
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hex2rgba('#ffffff', hold ? .5 : .22);
      ctx.lineWidth = 1.2;
      roundRect(ctx, x - w / 2 + .6, yTop + .6, w - 1.2, Math.max(1, hh - 1.2), Math.min(9, w / 2));
      ctx.stroke();
      ctx.restore();

      // 头部
      const spr = this.tapSprite(c, laneW, this.L.noteH);
      const sw = spr.width / this.dpr, sh = spr.height / this.dpr;
      ctx.drawImage(spr, x - sw / 2, headY - sh / 2 + this.L.noteH / 2, sw, sh);
    }

    drawEffects(ctx, g) {
      // 光柱之外的光环
      for (const r of g.rings) {
        const k = r.t / r.life;
        const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
        ctx.save();
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(1, 5 * (1 - k));
        ctx.shadowColor = r.color; ctx.shadowBlur = this.bloom ? 16 : 0;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // 粒子
      for (const p of g.particles) {
        const k = p.t / p.life;
        ctx.save();
        ctx.globalAlpha = (1 - k * k) * .95;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot + p.spin * p.t * 6);
        ctx.fillStyle = p.color;
        if (this.bloom) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
        const s = p.size * (1 - k * .55);
        ctx.fillRect(-s / 2, -s / 4, s, s / 2);
        ctx.restore();
      }
    }
  }

  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  global.NP_Render = { Renderer, BgFx, LANE_COLORS, JUDGE_COLORS, hex2rgba, roundRect };
})(window);
