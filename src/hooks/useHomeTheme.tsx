import { useCallback, useEffect, useState } from 'react';

/**
 * games 子站的主题切换 hook
 * — 跟 main-station 的 useHomeTheme 同结构，但：
 *   - 字段名 gamesTheme（不是 homeTheme）
 *   - localStorage key 用 'oscar-games-theme' 避免跟主站冲突
 *   - data-games-theme 属性（不是 data-home-theme）
 *   - 白名单 'classic' | 'arcade'
 */

export type GamesTheme = 'classic' | 'arcade';

const STORAGE_KEY = 'oscar-games-theme';
const DEFAULT_GAMES_THEME: GamesTheme = 'arcade';

const API_BASE_FALLBACK = 'https://api.oscarstudio.cn';

function isValidTheme(v: unknown): v is GamesTheme {
  return v === 'classic' || v === 'arcade';
}

function readStoredTheme(): GamesTheme {
  if (typeof localStorage === 'undefined') return DEFAULT_GAMES_THEME;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isValidTheme(v)) return v;
  } catch { /* ignore */ }
  return DEFAULT_GAMES_THEME;
}

function writeStoredTheme(t: GamesTheme) {
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
}

function readToken(): string | null {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|; )userToken=([^;]*)/);
    if (m) return decodeURIComponent(m[1]);
  }
  try {
    const ls = localStorage.getItem('ai_token') || localStorage.getItem('userToken');
    if (ls) return ls;
  } catch { /* ignore */ }
  return null;
}

function applyThemeAttr(t: GamesTheme) {
  if (typeof document === 'undefined') return;
  const cur = document.documentElement.getAttribute('data-games-theme');
  if (cur !== t) document.documentElement.setAttribute('data-games-theme', t);
}

export function useHomeTheme(): [GamesTheme, (t: GamesTheme) => void] {
  const [theme, setThemeState] = useState<GamesTheme>(readStoredTheme);

  // 1. 同步挂到 <html data-games-theme>
  useEffect(() => {
    applyThemeAttr(theme);
  }, [theme]);

  // 2. 登录态下，把服务端 ui_config.gamesTheme 拉下来覆盖本地缓存。
  useEffect(() => {
    let cancelled = false;
    const token = readToken();
    if (!token) return;

    (async () => {
      try {
        const apiBase = (window.API_BASE || API_BASE_FALLBACK) + '/api';
        const resp = await fetch(`${apiBase}/ui`, { credentials: 'include' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => null);
        if (cancelled || !data?.success) return;
        const remote = data?.ui?.gamesTheme;
        if (isValidTheme(remote) && remote !== readStoredTheme()) {
          writeStoredTheme(remote);
          setThemeState(remote);
        }
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, []);

  const setTheme = useCallback((t: GamesTheme) => {
    if (!isValidTheme(t)) return;
    setThemeState(t);
    writeStoredTheme(t);
    // 同步写服务端（fire-and-forget）
    const token = readToken();
    if (token) {
      try {
        const apiBase = (window.API_BASE || API_BASE_FALLBACK) + '/api';
        fetch(`${apiBase}/ui`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ gamesTheme: t }),
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
  }, []);

  return [theme, setTheme];
}
