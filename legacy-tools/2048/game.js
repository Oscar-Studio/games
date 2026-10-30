import { slide, isGameOver } from './engine.js';

const $ = id => document.getElementById(id);
const hues = [155, 202, 259, 319, 352, 25, 43, 178, 224, 280, 47];

// Storage may be unavailable in private browsing; the game remains playable.
function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory play still works. */ }
}

export class Game2048 {
    constructor() {
        this.board = document.querySelector('.game-container');
        this.container = $('tileContainer');
        this.modal = $('gameOverModal');
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
        this.animations = new Set();
        this.epoch = 0;
        this.sequence = 0;
        this.pendingTurn = null;
        this.queuedDirection = null;
        this.pointer = null;
        this.ended = false;
        this.bestScore = Number(read('2048_bestScore', 0)) || 0;
        const records = read('2048_leaderboard', []);
        this.leaderboard = Array.isArray(records) ? records.filter(x => x && Number.isFinite(x.score) && typeof x.date === 'string').slice(0, 10) : [];
        $('bestScore').textContent = this.bestScore;
        this.loadLeaderboard();
        this.setupInput();
        this.startNewGame();
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.board);
        this.motion.addEventListener('change', () => this.resize());
    }

    animate(element, frames, options) {
        const animation = element.animate(frames, options);
        animation.jellyHeld = options.fill === 'forwards';
        this.animations.add(animation);
        animation.finished.then(() => {
            // A finished forwards-filled animation still owns the visual style.
            if (!animation.jellyHeld) this.animations.delete(animation);
        }, () => this.animations.delete(animation));
        return animation.finished.catch(() => {});
    }

    cancelAnimations() {
        this.epoch++;
        for (const animation of this.animations) animation.cancel();
        this.animations.clear();
        for (const tile of this.container.children) tile.firstElementChild.removeAttribute('data-contact');
        this.queuedDirection = null;
    }

    startNewGame() {
        this.cancelAnimations();
        this.pendingTurn = null;
        this.pointer = null;
        this.ended = false;
        this.score = 0;
        this.grid = Array.from({ length: 4 }, () => Array(4).fill(null));
        this.container.replaceChildren();
        this.modal.close();
        this.addRandomTile();
        this.addRandomTile();
        this.measure();
        this.render();
        this.updateScore(0);
        $('gameStatus').textContent = '新游戏开始。合并相同数字，挑战 2048。';
    }

    measure() {
        const first = this.board.querySelector('.grid-cell');
        const cell = first.getBoundingClientRect();
        const layer = this.container.getBoundingClientRect();
        const style = getComputedStyle(this.board.querySelector('.grid-container'));
        this.metrics = { size: cell.width, gap: parseFloat(style.gap), x: cell.left - layer.left, y: cell.top - layer.top };
    }

    resize() {
        this.cancelAnimations();
        this.pointer = null;
        if (this.pendingTurn) this.commitTurn();
        this.measure();
        this.render();
        if (this.ended && !this.modal.open && !this.dismissed) this.showGameOver();
    }

    position(r, c) {
        const { size, gap, x, y } = this.metrics;
        return `translate(${x + c * (size + gap)}px, ${y + r * (size + gap)}px)`;
    }

    addRandomTile() {
        const empty = [];
        this.grid.forEach((row, r) => row.forEach((tile, c) => { if (!tile) empty.push([r, c]); }));
        if (!empty.length) return null;
        const [r, c] = empty[Math.floor(Math.random() * empty.length)];
        const tile = { id: `tile-${++this.sequence}`, value: Math.random() < .9 ? 2 : 4 };
        this.grid[r][c] = tile;
        return tile.id;
    }

    render() {
        const alive = new Set();
        this.grid.forEach((row, r) => row.forEach((tile, c) => {
            if (!tile) return;
            alive.add(tile.id);
            let el = $(tile.id);
            if (!el) {
                el = document.createElement('div');
                el.id = tile.id;
                el.className = 'tile';
                const inner = document.createElement('div');
                inner.className = 'tile-inner';
                el.append(inner);
                this.container.append(el);
            }
            el.style.transform = this.position(r, c);
            el.style.width = el.style.height = `${this.metrics.size}px`;
            const inner = el.firstElementChild;
            inner.removeAttribute('data-contact');
            const level = Math.round(Math.log2(tile.value)) - 1;
            inner.style.setProperty('--hue', hues[level] ?? (47 + (level - 10) * 47) % 360);
            const digits = String(tile.value).length;
            inner.style.fontSize = `${this.metrics.size * Math.min(.43, .43 * 3 / Math.max(3, digits))}px`;
            inner.textContent = tile.value;
            el.setAttribute('aria-label', `${tile.value}，第 ${r + 1} 行，第 ${c + 1} 列`);
        }));
        for (const child of [...this.container.children]) if (!alive.has(child.id)) child.remove();
    }

    async move(direction) {
        if (this.modal.open || this.ended) return;
        if (this.pendingTurn) { this.queuedDirection = direction; return; }
        const turn = slide(this.grid, direction);
        if (!turn.changed) return;
        this.cancelAnimations();
        const epoch = this.epoch;
        this.pendingTurn = turn;
        const horizontal = direction === 1 || direction === 3;
        const sign = direction === 1 || direction === 2 ? 1 : -1;
        const shape = (along, across) => horizontal ? `scale(${along}, ${across})` : `scale(${across}, ${along})`;
        const shift = distance => horizontal ? `translateX(${distance}px)` : `translateY(${distance}px)`;
        const contactRadius = (offset, round = '23%') => horizontal
            ? (offset < 0 ? `${round} 0 0 ${round}` : `0 ${round} ${round} 0`)
            : (offset < 0 ? `${round} ${round} 0 0` : `0 0 ${round} ${round}`);
        const origin = horizontal ? `${sign > 0 ? 100 : 0}% 50%` : `50% ${sign > 0 ? 100 : 0}%`;
        const pairIds = new Set(turn.merges.flatMap(pair => [pair.lead, pair.incoming]));
        const contacts = new Map();
        if (!this.motion.matches) {
            for (const pair of turn.merges) {
                // Two separate lobes meet at the centre seam. Their combined footprint
                // stays inside the destination cell, including simultaneous neighbours.
                contacts.set(pair.lead, { ...pair, offset: sign * this.metrics.size * .255 });
                contacts.set(pair.incoming, { ...pair, offset: -sign * this.metrics.size * .255 });
            }
        }
        const sliding = [];
        const destinations = new Map(turn.moves.map(move => [move.id, move]));
        for (const [id, contact] of contacts) destinations.set(id, contact);
        for (const [id, move] of destinations) {
            const el = $(id);
            const from = el.style.transform;
            const contact = contacts.get(id);
            const to = this.position(move.r, move.c) + (contact ? ` ${shift(contact.offset)}` : '');
            el.style.transform = to;
            sliding.push(this.animate(el, [{ transform: from }, { transform: to }], { duration: this.motion.matches ? 65 : (turn.merges.length ? 40 : 150), easing: 'cubic-bezier(.22,.65,.32,1)' }));
            if (!this.motion.matches) {
                const inner = el.firstElementChild;
                inner.style.transformOrigin = contact ? '50% 50%' : origin;
                if (contact) inner.setAttribute('data-contact', horizontal
                    ? (contact.offset < 0 ? 'right' : 'left')
                    : (contact.offset < 0 ? 'bottom' : 'top'));
                sliding.push(this.animate(inner, contact ? [
                    { transform: 'scale(1)', borderRadius: '23%' },
                    { transform: shape(.74, .94), borderRadius: contactRadius(contact.offset), offset: .6 },
                    { transform: shape(.53, .88), borderRadius: contactRadius(contact.offset) }
                ] : [
                    { transform: 'scale(1)' },
                    { transform: shape(1.065, .945), offset: .5 },
                    { transform: 'scale(1)' }
                ], { duration: turn.merges.length ? 40 : 150, fill: contact ? 'forwards' : 'none' }));
            }
        }
        await Promise.all(sliding);
        if (epoch !== this.epoch) return;
        const settling = [];
        if (!this.motion.matches) {
            for (const move of turn.moves) {
                if (pairIds.has(move.id) || !$(move.id)) continue;
                const inner = $(move.id).firstElementChild;
                inner.style.transformOrigin = origin;
                // Signed overshoot + a smaller recoil makes left/right and up/down
                // visibly distinct, with the leading face taking the impact.
                settling.push(this.animate(inner, [
                    { transform: 'scale(1)' },
                    { transform: `${shift(sign * this.metrics.size * .045)} ${shape(.94, 1.045)}`, offset: .25 },
                    { transform: `${shift(-sign * this.metrics.size * .018)} ${shape(1.025, .98)}`, offset: .62 },
                    { transform: `${shift(sign * this.metrics.size * .006)} ${shape(.995, 1.005)}`, offset: .83 },
                    { transform: 'scale(1)' }
                ], { duration: turn.merges.length ? 110 : 220, easing: 'ease-out' }));
            }
        }
        if (contacts.size) {
            const pressure = [];
            for (const [id, contact] of contacts) {
                const el = $(id);
                const inner = el.firstElementChild;
                const centre = this.position(contact.r, contact.c);
                // Both bodies press toward the seam, bulge perpendicular to it,
                // then lose their separate outlines before the new value appears.
                // Position and scale share keyframe offsets and easing: otherwise
                // the bodies shrink faster than they converge, exposing the board.
                // Flat contact faces overlap slightly to cover subpixel antialiasing.
                pressure.push(this.animate(el, [
                    { transform: `${centre} ${shift(contact.offset)}` },
                    { transform: `${centre} ${shift(contact.offset * .72)}`, offset: .65 },
                    { transform: `${centre} ${shift(contact.offset * .36)}` }
                ], { duration: 50, easing: 'ease-in-out', fill: 'forwards' }));
                pressure.push(this.animate(inner, [
                    { transform: shape(.53, .88), opacity: 1, borderRadius: contactRadius(contact.offset) },
                    { transform: shape(.44, 1.08), opacity: 1, borderRadius: contactRadius(contact.offset, '36%'), offset: .65 },
                    { transform: shape(.30, .96), opacity: 1, borderRadius: contactRadius(contact.offset, '48%') }
                ], { duration: 50, easing: 'ease-in-out', fill: 'forwards' }));
            }
            await Promise.all(pressure);
            if (epoch !== this.epoch) return;
        }
        // Release held contact shapes in the same frame as the board commit.
        for (const animation of this.animations) {
            if (animation.jellyHeld) { animation.cancel(); this.animations.delete(animation); }
        }
        const newId = this.commitTurn();
        this.render();
        if (!this.motion.matches) {
            for (const id of turn.merged) {
                const inner = $(id).firstElementChild;
                inner.style.transformOrigin = '50% 50%';
                settling.push(this.animate(inner, [
                    { transform: shape(.72, 1.06), opacity: 1, borderRadius: '38%' },
                    { transform: shape(1.06, .97), opacity: 1, borderRadius: '25%', offset: .42 },
                    { transform: shape(.985, 1.015), opacity: 1, borderRadius: '23%', offset: .76 },
                    { transform: 'scale(1)', opacity: 1, borderRadius: '23%' }
                ], { duration: 60, easing: 'ease-out' }));
            }
            if (newId) settling.push(this.animate($(newId).firstElementChild, [
                { transform: 'scale(.45)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }
            ], { duration: turn.merges.length ? 60 : 200, easing: 'ease-out' }));
        }
        const queued = this.queuedDirection;
        this.queuedDirection = null;
        if (queued !== null && !this.ended) { this.move(queued); return; }
        await Promise.all(settling);
        if (epoch === this.epoch && this.ended) this.showGameOver();
    }

    commitTurn() {
        const turn = this.pendingTurn;
        this.pendingTurn = null;
        this.grid = turn.grid;
        this.score += turn.score;
        this.updateScore(turn.score);
        const id = this.addRandomTile();
        $('gameStatus').textContent = `当前分数 ${this.score}${turn.score ? `，本步增加 ${turn.score} 分` : ''}。`;
        if (isGameOver(this.grid)) {
            this.ended = true;
            this.dismissed = false;
            const rank = this.saveScore();
            $('finalScore').textContent = this.score;
            $('finalRank').textContent = rank ? `本地最佳表现 · 第 ${rank} 名` : '每一步，都是新的可能。';
        }
        return id;
    }

    showGameOver() {
        if (!this.modal.open) {
            this.cancelAnimations();
            this.pointer = null;
            this.modal.showModal();
        }
    }

    updateScore(gain) {
        $('currentScore').textContent = this.score;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            write('2048_bestScore', this.bestScore);
        }
        $('bestScore').textContent = this.bestScore;
        if (gain && !this.motion.matches) {
            $('scoreGain').textContent = `+${gain}`;
            this.animate($('scoreGain'), [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-22px)' }], { duration: 550, easing: 'ease-out' });
        }
    }

    saveScore() {
        if (!this.score) return null;
        const entry = { score: this.score, date: new Date().toLocaleDateString(), timestamp: Date.now() };
        this.leaderboard.push(entry);
        this.leaderboard.sort((a, b) => b.score - a.score);
        const rank = this.leaderboard.indexOf(entry) + 1;
        this.leaderboard = this.leaderboard.slice(0, 10);
        write('2048_leaderboard', this.leaderboard);
        this.loadLeaderboard();
        return rank <= 10 ? rank : null;
    }

    loadLeaderboard() {
        const list = $('leaderboardList');
        list.replaceChildren();
        if (!this.leaderboard.length) {
            const empty = document.createElement('li');
            empty.className = 'empty-records';
            empty.innerHTML = '<span aria-hidden="true">✧</span><p>第一份纪录，等你创造</p><small>完成一局后，你的成绩会留在这里。</small>';
            list.append(empty);
        }
        this.leaderboard.forEach((entry, i) => {
            const li = document.createElement('li');
            li.className = 'leaderboard-item';
            for (const [className, text] of [['rank', String(i + 1).padStart(2, '0')], ['score', entry.score], ['date', entry.date]]) {
                const span = document.createElement('span');
                span.className = className;
                span.textContent = text;
                li.append(span);
            }
            list.append(li);
        });
    }

    setupInput() {
        const keys = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
        document.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey || this.modal.open || event.target.closest('button, a, input, textarea, select')) return;
            const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
            if (direction !== undefined) { event.preventDefault(); this.move(direction); }
        });
        this.board.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0 || this.modal.open) return;
            this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
            this.board.setPointerCapture(event.pointerId);
            this.board.focus({ preventScroll: true });
        });
        this.board.addEventListener('pointerup', event => {
            const start = this.pointer;
            if (!start || start.id !== event.pointerId) return;
            this.pointer = null;
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
        });
        for (const name of ['pointercancel', 'lostpointercapture']) this.board.addEventListener(name, () => { this.pointer = null; });
        $('newGameBtn').addEventListener('click', () => { this.startNewGame(); this.board.focus({ preventScroll: true }); });
        $('restartBtn').addEventListener('click', () => { this.startNewGame(); this.board.focus(); });
        $('closeModalBtn').addEventListener('click', () => { this.dismissed = true; this.modal.close(); this.board.focus(); });
        this.modal.addEventListener('cancel', () => { this.dismissed = true; });
    }
}

new Game2048();
