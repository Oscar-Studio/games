/**
 * Arcade 风 hero —— 参照 tools/word-counter 的 .intro-row 风格：
 *   - 大标题 + eyebrow + lede + 隐私/状态脚注
 *   - 不用像素字，不用 CRT 扫描线
 *   - 单色 accent 强调（靛蓝），不混入多色霓虹
 */
export function ArcadeHero() {
  return (
    <section className="arcade-hero" id="heroSection">
      <div className="arcade-hero__inner">
        <div className="intro-row">
          <div className="intro-left">
            <p className="eyebrow">益智游戏集 · ARCADE</p>
            <h1>
              选一个游戏，<em>玩一会儿。</em>
            </h1>
          </div>
          <div className="intro-right">
            <p className="intro-copy">
              棋类、数字、记忆挑战 — 一组安静的小游戏，专注在玩法本身，
              没有积分榜、没有弹窗、没有干扰。
            </p>
            <p className="privacy-note">
              <span className="privacy-dot" />
              <span>
                所有游戏在浏览器内运行。
                <small>无需登录，无需下载。</small>
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
