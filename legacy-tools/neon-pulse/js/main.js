/* ═══════════════════════════════════════════════════════════
 * main.js — 引导层
 * ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    const ui = new NP_UI.UI();
    window.__game = ui;              // 方便在控制台调试

    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ui.tick(dt);
      requestAnimationFrame(loop);
    })(last);

    // 切到后台时暂停，避免回来一堆 MISS
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ui.game && ui.game.state === 'playing') ui.togglePause(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

