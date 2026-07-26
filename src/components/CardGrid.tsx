import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Tool } from '../types';
import { GlassWrap } from './GlassProvider';

interface Props {
  tools: Tool[];
  loading: boolean;
  error: string | null;
  onSelect: (tool: Tool, rect: DOMRect) => void;
}

export function CardGrid({ tools, loading, error, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return <main className="card-container"><p className="no-results">加载中…</p></main>;
  }
  if (error) {
    return <main className="card-container"><p className="no-results">{error}</p></main>;
  }
  if (tools.length === 0) {
    return <main className="card-container"><p className="no-results">没有找到匹配的工具</p></main>;
  }

  return (
    <main className="card-container" id="cardContainer" ref={containerRef}>
      <AnimatePresence>
        {tools.map((tool, idx) => (
          <motion.div
            key={tool.id}
            className="card glass-element"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onSelect(tool, rect);
            }}
            whileHover={{ y: -4, scale: 1.02 }}
          >
            <GlassWrap
              borderRadius={16}
              style={{
                width: '100%',
                minHeight: 90,
                padding: '15px 20px',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <div className="card-header">
                <span className="card-icon">{tool.icon || '📄'}</span>
                <span className="card-name">{tool.name}</span>
              </div>
              {tool.tags && tool.tags.length > 0 && (
                <div className="card-tags">
                  {tool.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="card-tag">{tag}</span>
                  ))}
                </div>
              )}
            </GlassWrap>
          </motion.div>
        ))}
      </AnimatePresence>
    </main>
  );
}