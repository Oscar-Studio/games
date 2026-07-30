import { useEffect, useRef, useState } from 'react';

export function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [settingsOpen]);

  useEffect(() => {
    const id = 'oscar-user-button';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://api.oscarstudio.cn/user-button.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'https://ai.oscarstudio.cn/opilot.css';
    document.head.appendChild(style);
    const id = 'oscar-opilot';
    if (document.getElementById(id)) return;
    const s = document.createElement('script');
    s.id = id;
    s.src = 'https://ai.oscarstudio.cn/opilot.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    // plasma 效果：检查 localStorage 里的 oscar-quality（如果存在 legacy 'plasma' 值，启用）
    let particleUI: any = null;
    const loaded = new Set<string>();

    const isPlasma = () => {
      try {
        return localStorage.getItem('oscar-quality') === 'plasma';
      } catch {
        return false;
      }
    };

    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        if (loaded.has(src)) return resolve();
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => {
          loaded.add(src);
          resolve();
        };
        el.onerror = reject;
        document.head.appendChild(el);
      });

    const destroyParticle = () => {
      if (particleUI && typeof particleUI.destroy === 'function') {
        particleUI.destroy();
      }
      particleUI = null;
    };

    const initParticle = async () => {
      try {
        await loadScript('/particle-engine/particle-core.js');
        await loadScript('/particle-engine/particle-ui.js');
        const W = window as any;
        if (typeof W.ParticleUI === 'function') {
          particleUI = new W.ParticleUI(document.body, {
            particleCount: 200,
            quality: 'plasma',
          });
        }
      } catch (e) {
        console.error('Failed to load particle UI:', e);
      }
    };

    if (isPlasma()) {
      initParticle();
    } else {
      destroyParticle();
    }

    return () => destroyParticle();
  }, []);

  return (
    <header className="top-bar glass-element">
      <div className="breadcrumb">
        <img src="/logo.png" alt="" style={{ height: 24, verticalAlign: 'middle', marginRight: 8 }} />
        <a href="https://oscarstudio.cn">Oscar Studio</a> &gt; <span>益智游戏</span>
      </div>
      <div className="search-box">
        <input ref={inputRef} type="text" id="searchInput" placeholder="Chat with Opilot" />
      </div>
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          className={`settings-btn ${settingsOpen ? 'active' : ''}`}
          id="settingsBtn"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSettingsOpen(v => !v);
          }}
        >
          ⚙
        </button>
        <div className={`settings-dropdown ${settingsOpen ? 'open' : ''}`} id="settingsDropdown">
        </div>
      </div>
      <div id="userButtonContainer" />
    </header>
  );
}