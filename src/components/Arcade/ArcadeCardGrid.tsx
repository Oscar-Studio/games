import type { Tool } from '../../types';

interface Props {
  tools: Tool[];
}

/**
 * Arcade 风卡片网格 —— 参照 tools/codec 的 .output-card + .surface card：
 *   - 大圆角（22px）+ hairline 边框 + 浅阴影
 *   - 每张卡：eyebrow tag + 游戏名（大字） + lede + 底部悬停 accent 边框
 *   - 点击直接跳转（<a href>），不用 MorphCard 开启动画
 */
export function ArcadeCardGrid({ tools }: Props) {
  return (
    <section className="arcade-grid" id="arcadeGrid">
      <div className="arcade-grid__inner">
        <header className="arcade-grid__header">
          <p className="eyebrow">所有游戏</p>
          <h2 className="arcade-grid__title">挑一个开始</h2>
        </header>

        <div className="arcade-grid__list">
          {tools.map((tool) => (
            <a
              key={tool.id}
              href={tool.demoFile}
              data-cursor="hover"
              className="arcade-card"
            >
              <div className="arcade-card__head">
                {tool.tags?.[0] && (
                  <span className="arcade-card__tag">{tool.tags[0]}</span>
                )}
                {tool.icon && <span className="arcade-card__icon">{tool.icon}</span>}
              </div>
              <h3 className="arcade-card__name">{tool.name}</h3>
              {tool.description && (
                <p className="arcade-card__desc">{tool.description}</p>
              )}
              <span className="arcade-card__arrow" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
