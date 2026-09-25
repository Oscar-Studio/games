import type { Tool } from '../../types';
import { ArcadeHero } from './ArcadeHero';
import { ArcadeCardGrid } from './ArcadeCardGrid';

interface Props {
  tools: Tool[];
}

/**
 * Arcade 主题的整体落地页包装：
 *   - hero + 卡片网格（直接跳转，无 MorphCard 动画）
 */
export function ArcadeLanding({ tools }: Props) {
  return (
    <div className="arcade-landing">
      <ArcadeHero />
      <ArcadeCardGrid tools={tools} />
    </div>
  );
}
