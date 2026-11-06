// =====================================================
// 2048 全站排行榜（TOP 30）
// 与游戏逻辑解耦：game.js 只派发 `game2048:score` 事件，本模块独立加载，
// 因此游戏本体在排行榜模块缺失 / 后端未上线时依然完全可玩。
// 登录态沿用共享 user-button.js；Cookie userToken 是真理之源。
// =====================================================

const API_BASE = 'https://api.oscarstudio.cn/api';
const LOGIN_PAGE = 'https://api.oscarstudio.cn/auth.html';
const PENDING_KEY = '2048_pendingScore';
const RETRY_GAP = 10_000;
const REQUEST_TIMEOUT = 8000;

const $ = id => document.getElementById(id);

function getCookie(name) {
    const parts = `; ${document.cookie}`.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
}
function readLs(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeLs(key, value) { try { localStorage.setItem(key, value); } catch { /* 隐私模式 */ } }
function dropLs(key) { try { localStorage.removeItem(key); } catch { /* 隐私模式 */ } }

function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return !payload.exp || Date.now() >= payload.exp * 1000;
    } catch { return true; }
}
// AGENTS.md 约定：Cookie userToken → ai_token → 旧版 userToken
function getToken() {
    const cookieToken = getCookie('userToken');
    if (cookieToken) return cookieToken;
    for (const key of ['ai_token', 'userToken']) {
        const token = readLs(key);
        if (token && !isTokenExpired(token)) return token;
    }
    return null;
}
function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

let activeTab = 'local';
let boardLoaded = false;
let boardLoading = false;
let lastAttempt = 0;
let flushing = false;

function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function setTab(name) {
    const localTab = $('tabLocal');
    const globalTab = $('tabGlobal');
    if (!localTab || !globalTab) return;
    activeTab = name;
    const local = name === 'local';
    localTab.classList.toggle('is-active', local);
    globalTab.classList.toggle('is-active', !local);
    localTab.setAttribute('aria-selected', String(local));
    globalTab.setAttribute('aria-selected', String(!local));
    $('panelLocal').hidden = !local;
    $('panelGlobal').hidden = local;
    const badge = $('boardBadge');
    if (badge) badge.textContent = local ? 'TOP 10' : 'TOP 30';
    if (!local) refresh(false);
}

function renderMessage(symbol, title, hint, action) {
    const rankBox = $('myRank');
    if (rankBox) { rankBox.hidden = true; rankBox.replaceChildren(); }
    const list = $('globalList');
    list.replaceChildren();
    const box = make('li', 'empty-records');
    const icon = make('span', '', symbol);
    icon.setAttribute('aria-hidden', 'true');
    box.append(icon, make('p', '', title));
    if (hint) box.append(make('small', '', hint));
    if (action) {
        const button = make('button', 'secondary-button board-action', action.label);
        button.type = 'button';
        button.addEventListener('click', action.onClick);
        box.append(button);
    }
    list.append(box);
}

function renderMyRank(data) {
    const box = $('myRank');
    box.replaceChildren();
    box.hidden = false;
    if (!getToken()) {
        box.append(make('span', 'my-rank-label', '登录后即可参与全站排名'));
        const button = make('button', 'board-login', '去登录');
        button.type = 'button';
        button.addEventListener('click', () => {
            location.href = `${LOGIN_PAGE}?return=${encodeURIComponent(location.href)}`;
        });
        box.append(button);
        return;
    }
    if (data.me) {
        box.append(make('span', 'my-rank-label', `我的排名 · 第 ${data.me.rank} 名`));
        box.append(make('strong', 'my-rank-score', Number(data.me.score).toLocaleString()));
    } else {
        box.append(make('span', 'my-rank-label', '还没有全站成绩'));
        box.append(make('strong', 'my-rank-score', '完成一局即可上榜'));
    }
}

function renderBoard(data) {
    $('globalCaption').textContent = data.total
        ? `共 ${data.total} 位玩家上榜 · 每人只记录最高分`
        : '还没有人上榜，第一个纪录等你创造。';
    renderMyRank(data);

    const list = $('globalList');
    list.replaceChildren();
    if (!data.items.length) {
        renderMessage('✧', '榜单还空着', '完成一局，就能留下第一个纪录。');
        return;
    }
    for (const item of data.items) {
        const li = make('li', 'leaderboard-item' + (item.isMe ? ' board-item-me' : ''));
        if (item.date) li.title = `达成于 ${item.date}`;
        li.append(make('span', 'rank', String(item.rank).padStart(2, '0')));
        const name = make('span', 'board-name', item.username || '匿名玩家');
        if (item.isMe) name.append(make('i', 'board-me-tag', '我'));
        li.append(name, make('span', 'score', Number(item.score).toLocaleString()));
        list.append(li);
    }
}

// 公开读接口；失败时只在「全站」面板里提示，不影响本地榜和游戏。
async function refresh(force = false) {
    if (boardLoading) return;
    if (boardLoaded && !force) return;
    boardLoading = true;
    renderMessage('◌', '正在加载排行榜…', '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const resp = await fetch(`${API_BASE}/game2048/leaderboard`, {
            credentials: 'include',
            headers: authHeaders(),
            signal: controller.signal
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || data.success !== true || !Array.isArray(data.items)) throw new Error('bad payload');
        boardLoaded = true;
        renderBoard(data);
    } catch {
        boardLoaded = false;
        renderMessage('☁', '排行榜暂时不可用', '稍后再试，本地记录不受影响。', {
            label: '重新加载',
            onClick: () => refresh(true)
        });
    } finally {
        clearTimeout(timer);
        boardLoading = false;
    }
}

// 结束或弃局都会收到分数。未登录先暂存，登录后自动补报。
function queueScore(score) {
    if (!Number.isFinite(score) || score <= 0) return;
    const pending = Number(readLs(PENDING_KEY)) || 0;
    if (score > pending) writeLs(PENDING_KEY, String(score));
    if (getToken()) flushPending(false);
}

async function flushPending(force = false) {
    if (flushing) return;
    const score = Number(readLs(PENDING_KEY)) || 0;
    if (!getToken() || !score) return;
    if (!force && Date.now() - lastAttempt < RETRY_GAP) return;
    lastAttempt = Date.now();
    flushing = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const resp = await fetch(`${API_BASE}/game2048/score`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ score }),
            signal: controller.signal
        });
        if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            dropLs(PENDING_KEY);
            if (data.improved) {
                boardLoaded = false;
                if (activeTab === 'global') refresh(true);
            }
        }
        // 401 / 403 / 429 / 5xx：保留待上报分数，登录变化或下一局再补报
    } catch { /* 静默降级：成绩同步绝不能打断游戏 */ }
    finally {
        clearTimeout(timer);
        flushing = false;
    }
}

function onLoginChange() {
    boardLoaded = false;   // 「我的排名」依赖登录态，缓存必须失效
    if (activeTab === 'global') refresh(true);
    if (getToken()) flushPending(true);
}

function init() {
    if (!$('tabLocal') || !$('tabGlobal')) return;
    $('tabLocal').addEventListener('click', () => setTab('local'));
    $('tabGlobal').addEventListener('click', () => setTab('global'));

    window.addEventListener('game2048:score', event => {
        queueScore(Number(event.detail && event.detail.score));
    });
    window.addEventListener('user:login-changed', onLoginChange);
    window.addEventListener('storage', event => {
        if (['ai_token', 'ai_user', 'userToken'].includes(event.key)) onLoginChange();
    });

    setTab('local');
    refresh(false);       // 预热；后端未上线也只是静默失败
    flushPending(true);   // 补报上次未登录时留下的成绩
}

init();
