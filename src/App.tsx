import { useRef, useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { CardGrid } from './components/CardGrid';
import { ArcadeLanding } from './components/Arcade/ArcadeLanding';
import { useToolsConfig } from './hooks/useToolsConfig';
import { useOpilot } from './hooks/useOpilot';
import { useUserBackground } from './components/GlassProvider';
import { useHomeTheme } from './hooks/useHomeTheme';
import { MorphCard } from './components/MorphCard';
import type { Tool } from './types';

export type Phase = 'idle' | 'opening' | 'open' | 'closing';

function AppContent() {
  useUserBackground();
  const { tools, loading, error } = useToolsConfig();
  const [selected, setSelected] = useState<{ tool: Tool; rect: DOMRect } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [gamesTheme] = useHomeTheme();
  const lockRef = useRef(false);
  const rectsRef = useRef<Record<string, DOMRect>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useOpilot(searchInputRef.current, tools, 'games');

  const handleSelect = useCallback((tool: Tool, rect: DOMRect) => {
    if (lockRef.current) return;
    lockRef.current = true;
    rectsRef.current[tool.id] = rect;
    setSelected({ tool, rect });
    setPhase('opening');
  }, []);

  const handleClose = useCallback(() => {
    setPhase('closing');
  }, []);

  const handlePhaseChange = useCallback((next: Phase) => {
    setPhase(next);
    if (next === 'idle') {
      setSelected(null);
      rectsRef.current = {};
      lockRef.current = false;
    }
  }, []);

  return (
    <>
      <TopBar section="益智游戏" />
      {/* Classic 主题：原版卡片网格。Arcade 主题下用 .classic-only 隐藏 */}
      <div className="classic-only">
        <Hero />
        <CardGrid
          tools={tools}
          loading={loading}
          error={error}
          selectedId={selected?.tool.id ?? null}
          phase={phase}
          rects={rectsRef.current}
          onSelect={handleSelect}
        />
      </div>
      {/* Arcade 主题：落地页（点击直接跳转，无 MorphCard）。Classic 主题下不渲染（节省 JS） */}
      {!loading && !error && gamesTheme === 'arcade' && (
        <ArcadeLanding tools={tools} />
      )}
      {/* MorphCard 复用：两个主题共用工具开启动画 */}
      <MorphCard
        tool={selected?.tool ?? null}
        sourceRect={selected?.rect ?? null}
        phase={phase}
        onClose={handleClose}
        onPhaseChange={handlePhaseChange}
      />
    </>
  );
}

export default function App() {
  return <AppContent />;
}
