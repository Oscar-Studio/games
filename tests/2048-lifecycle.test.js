import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { slide, isGameOver } from '../legacy-tools/2048/engine.js';

// Minimal DOM/animation clock: advance animations explicitly to reproduce races.
function harness() {
    const animations = [];
    const recorded = [];
    class Element {
        constructor() { this.children = []; this.style = { setProperty() {} }; this.textContent = ''; this.open = false; }
        append(el) { el.parent = this; this.children.push(el); }
        replaceChildren() { this.children = []; }
        remove() { this.parent.children = this.parent.children.filter(x => x !== this); }
        get firstElementChild() { return this.children[0]; }
        getBoundingClientRect() { return { width: 100, left: 0, top: 0 }; }
        querySelector() { return new Element(); }
        setAttribute() {}
        addEventListener() {}
        focus() {}
        close() { this.open = false; }
        showModal() { this.open = true; }
        animate(frames, options) {
            recorded.push({ element: this, frames, options });
            let resolve, reject;
            const animation = { finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel: () => reject(), finish: () => resolve() };
            animations.push(animation);
            return animation;
        }
    }
    const roots = new Map();
    const lookup = id => {
        const visit = el => el.id === id ? el : el.children.map(visit).find(Boolean);
        return roots.get(id) || [...roots.values()].map(visit).find(Boolean);
    };
    const ids = ['tileContainer', 'gameOverModal', 'bestScore', 'currentScore', 'scoreGain', 'gameStatus', 'finalScore', 'finalRank', 'leaderboardList', 'newGameBtn', 'restartBtn', 'closeModalBtn'];
    ids.forEach(id => roots.set(id, new Element()));
    const stored = new Map([['2048_bestScore', '128'], ['2048_leaderboard', JSON.stringify([{ score: 64, date: '2026/10/29', timestamp: 1 }])]]);
    const context = vm.createContext({
        slide, isGameOver, console, ResizeObserver: class { observe() {} },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        getComputedStyle: () => ({ gap: '12' }),
        localStorage: { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v) },
        document: { getElementById: lookup, querySelector: () => new Element(), createElement: () => new Element(), addEventListener() {} },
    });
    const source = readFileSync(new URL('../legacy-tools/2048/game.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/, '').replace('export class Game2048', 'class Game2048').replace('new Game2048();', 'globalThis.game = new Game2048();');
    vm.runInContext(source, context);
    const game = context.game;
    const fixture = rows => {
        game.startNewGame();
        game.grid = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => rows[r]?.[c] ? { id: `fixture-${r}-${c}`, value: rows[r][c] } : null));
        game.render();
    };
    const flush = async () => { animations.splice(0).forEach(a => a.finish()); for (let i = 0; i < 12; i++) await Promise.resolve(); };
    return { game, fixture, flush, lookup, stored, recorded };
}

test('restarting during a slide discards the old turn and delayed game over', async () => {
    const { game, fixture, flush, lookup } = harness();
    fixture([[2, 2, 4, 8], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]]);
    game.move(3);
    assert.ok(game.pendingTurn);
    game.startNewGame();
    await flush();
    assert.equal(game.score, 0);
    assert.equal(game.grid.flat().filter(Boolean).length, 2);
    assert.equal(lookup('tileContainer').children.length, 2);
    assert.equal(game.modal.open, false);
});

test('resize settles an in-flight merge exactly once', async () => {
    const { game, fixture, flush, lookup } = harness();
    fixture([[2, 2]]);
    game.move(3);
    game.resize();
    assert.equal(game.score, 4);
    assert.equal(game.grid.flat().filter(Boolean).length, 2);
    await flush();
    assert.equal(game.score, 4);
    assert.equal(lookup('tileContainer').children.length, 2);
    assert.equal(game.pendingTurn, null);
});

test('rapid inputs buffer only the latest direction, then restart clears it', async () => {
    const { game, fixture, flush } = harness();
    fixture([[2, 2]]);
    game.move(3); game.move(0); game.move(1); game.move(2);
    assert.equal(game.queuedDirection, 2);
    await flush(); // contact
    assert.equal(game.queuedDirection, 2);
    await flush(); // pressure / fusion
    assert.equal(game.queuedDirection, null);
    assert.ok(game.pendingTurn);
    assert.ok(game.pendingTurn.grid[3].some(Boolean));
    game.startNewGame();
    await flush();
    assert.equal(game.score, 0);
    assert.equal(game.pendingTurn, null);
});

test('existing records survive initialization and repeated merges retrigger animation', async () => {
    const { game, fixture, flush, lookup, stored } = harness();
    assert.equal(game.bestScore, 128);
    assert.equal(game.leaderboard[0].score, 64);
    fixture([[2, 2, 4]]);
    game.move(3); await flush(); await flush();
    assert.equal(game.score, 4);
    game.move(3); await flush(); await flush();
    assert.equal(game.score, 12);
    assert.equal(game.grid[0][0].value, 8);
    assert.ok(game.animations.size > 0);
    assert.equal(lookup('fixture-0-0').firstElementChild.textContent, 8);
    assert.equal(stored.get('2048_bestScore'), '128');
    game.startNewGame(); await flush();
});

test('game over saves once, opens after settling, and stays dismissed on resize', async () => {
    const { game, fixture, flush } = harness();
    fixture([[2, 2, 8, 16], [8, 16, 32, 64], [16, 32, 64, 128], [32, 64, 128, 256]]);
    game.move(3); await flush(); await flush();
    assert.equal(game.ended, true);
    assert.equal(game.modal.open, false);
    await flush();
    assert.equal(game.modal.open, true);
    assert.equal(game.leaderboard.length, 2);
    game.resize();
    assert.equal(game.leaderboard.length, 2);
    game.dismissed = true;
    game.modal.close();
    game.resize();
    assert.equal(game.modal.open, false);
});

test('reduced motion retains movement and scoring without squash animations', async () => {
    const { game, fixture, flush } = harness();
    fixture([[2, 2]]);
    game.motion.matches = true;
    game.move(3); await flush(); await flush();
    assert.equal(game.score, 4);
    assert.equal(game.grid[0][0].value, 4);
    assert.equal(game.animations.size, 0);
});


test('both source bodies survive contact and pressure before the new value appears', async () => {
    const { game, fixture, flush, lookup, recorded } = harness();
    fixture([[2, 2]]);
    game.move(3); await flush();
    assert.equal(game.score, 0);
    const lead = lookup('fixture-0-0');
    const incoming = lookup('fixture-0-1');
    assert.equal(lead.firstElementChild.textContent, 2);
    assert.equal(incoming.firstElementChild.textContent, 2);
    for (const el of [lead, incoming]) {
        assert.ok(recorded.some(a => a.element === el.firstElementChild && a.options.duration === 180 && a.frames[1].transform.includes('scale(0.44, 1.08)')));
    }
    await flush();
    assert.equal(lookup('fixture-0-0').firstElementChild.textContent, 4);
    assert.equal(lookup('fixture-0-1'), undefined);
    await flush();
    assert.equal(game.animations.size, 0);
    game.startNewGame(); await flush();
});

test('landing overshoot follows each signed direction and recoils back', async () => {
    for (const [direction, axis, sign, origin] of [[0, 'Y', -1, '50% 0%'], [1, 'X', 1, '100% 50%'], [2, 'Y', 1, '50% 100%'], [3, 'X', -1, '0% 50%']]) {
        const { game, fixture, flush, recorded, lookup } = harness();
        fixture([[], [0, 2]]);
        game.move(direction); await flush();
        const el = lookup('fixture-1-1').firstElementChild;
        const landing = recorded.find(a => a.element === el && a.options.duration === 220);
        assert.ok(landing.frames[1].transform.startsWith(`translate${axis}(${sign * 4.5}px)`));
        assert.ok(landing.frames[2].transform.startsWith(`translate${axis}(${-sign * (100 * .018)}px)`));
        assert.equal(el.style.transformOrigin, origin);
        game.startNewGame(); await flush();
    }
});

test('restart during mutual pressure cancels both bodies and the pending score', async () => {
    const { game, fixture, flush, lookup } = harness();
    fixture([[2, 2]]);
    game.move(3); await flush();
    assert.ok(game.pendingTurn);
    game.startNewGame(); await flush();
    assert.equal(game.score, 0);
    assert.equal(game.pendingTurn, null);
    assert.equal(lookup('tileContainer').children.length, 2);
});


test('merging contact faces stay flat and overlapping throughout pressure in every direction', async () => {
    for (const direction of [0, 1, 2, 3]) {
        const { game, fixture, flush, recorded } = harness();
        fixture(direction % 2 === 0 ? [[2], [2]] : [[2, 2]]);
        game.move(direction); await flush();
        const bodies = recorded.filter(a => a.options.duration === 180 && a.frames[0].opacity === 1);
        assert.equal(bodies.length, 2);
        const horizontal = direction % 2 === 1;
        const outlines = bodies.map(a => a.frames[0].borderRadius);
        assert.ok(outlines.includes(horizontal ? '23% 0 0 23%' : '23% 23% 0 0'));
        assert.ok(outlines.includes(horizontal ? '0 23% 23% 0' : '0 0 23% 23%'));
        // Sample the actual linear keyframe interpolations; widths must exceed
        // centre separation, including between the different keyframe offsets.
        const interpolate = (t, stops) => {
            for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
                const [at, value] = stops[i - 1], [end, target] = stops[i];
                return value + (target - value) * (t - at) / (end - at);
            }
        };
        for (let i = 0; i <= 100; i++) {
            const t = i / 100;
            const width = interpolate(t, [[0, .53], [.65, .44], [1, .30]]);
            const separation = .51 * interpolate(t, [[0, 1], [.72, .72], [1, .36]]);
            assert.ok(width > separation, `gap at progress ${t} in direction ${direction}`);
        }
        game.startNewGame(); await flush();
    }
});
