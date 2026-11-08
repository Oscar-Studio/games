import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { slide, isGameOver } from '../legacy-tools/2048/engine.js';

// Minimal DOM/animation clock: advance animations explicitly to reproduce races.
// Passing a `shared` store replays the same localStorage, i.e. a page reload.
function harness(shared) {
    const animations = [];
    const recorded = [];
    class Element {
        constructor() {
            this.children = []; this.style = { props: {}, setProperty(key, value) { this.props[key] = value; } };
            this.textContent = ''; this.open = false; this.attributes = {}; this.classes = new Set();
            this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c) };
        }
        append(el) { el.parent = this; this.children.push(el); }
        replaceChildren() { this.children = []; }
        remove() { this.parent.children = this.parent.children.filter(x => x !== this); }
        get firstElementChild() { return this.children[0]; }
        getBoundingClientRect() { return { width: 100, left: 0, top: 0 }; }
        querySelector() { return new Element(); }
        setAttribute(key, value) { this.attributes[key] = value; }
        removeAttribute(key) { delete this.attributes[key]; }
        getAttribute(key) { return this.attributes[key] ?? null; }
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
    const ids = ['tileContainer', 'gameOverModal', 'bestScore', 'currentScore', 'currentScoreBox', 'scoreGainLayer', 'gameStatus', 'finalScore', 'finalRank', 'leaderboardList', 'newGameBtn', 'restartBtn', 'closeModalBtn', 'themeJelly', 'themeClassic'];
    ids.forEach(id => roots.set(id, new Element()));
    const stored = shared || new Map([['2048_bestScore', '128'], ['2048_leaderboard', JSON.stringify([{ score: 64, date: '2026/10/29', timestamp: 1 }])]]);
    const context = vm.createContext({
        slide, isGameOver, console, ResizeObserver: class { observe() {} },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        getComputedStyle: () => ({ gap: '12' }),
        localStorage: { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) },
        document: { documentElement: new Element(), getElementById: lookup, querySelector: () => new Element(), createElement: () => new Element(), addEventListener() {} },
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

test('switching themes during a merge commits it once and restores the same run in the chosen theme', async () => {
    const { game, fixture, flush, lookup, stored } = harness();
    fixture([[2, 2]]);
    const turn = game.move(3);
    await flush(); // Jelly tiles have met and are still pressing together.
    game.switchTheme('classic');
    await turn;
    assert.equal(game.score, 4);
    assert.equal(game.grid[0][0].value, 4);
    assert.equal(lookup('fixture-0-0').firstElementChild.getAttribute('data-contact'), null);
    assert.equal(lookup('themeClassic').getAttribute('aria-pressed'), 'true');
    assert.equal(lookup('scoreGainLayer').children.length, 0);

    const reloaded = harness(stored);
    assert.equal(reloaded.game.theme, 'classic');
    assert.equal(reloaded.game.score, 4);
    assert.deepEqual(JSON.stringify(reloaded.game.grid.map(row => row.map(tile => tile?.value))),
        JSON.stringify(game.grid.map(row => row.map(tile => tile?.value))));
});

test('an original theme merge finishes after the slide without jelly or score animations', async () => {
    const { game, fixture, flush, recorded } = harness();
    fixture([[2, 2, 4, 4]]);
    game.switchTheme('classic');
    const turn = game.move(3);
    await flush();
    await turn;
    assert.equal(game.score, 12);
    assert.equal(game.grid[0][0].value, 4);
    assert.equal(game.grid[0][1].value, 8);
    assert.ok(recorded.length > 0 && recorded.every(animation => animation.element.className === 'tile'));
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
        assert.ok(recorded.some(a => a.element === el.firstElementChild && a.options.duration === 138 && a.frames[1].transform.includes('scale(0.44, 1.08)')));
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
        const bodies = recorded.filter(a => a.options.duration === 138 && a.frames[0].opacity === 1);
        assert.equal(bodies.length, 2);
        for (const body of bodies) assert.ok(body.frames.every(f => f.opacity === 1), 'contact skin must stay opaque until the fused tile takes over');
        const horizontal = direction % 2 === 1;
        const outlines = bodies.map(a => a.frames[0].borderRadius);
        assert.ok(outlines.includes(horizontal ? '23% 0 0 23%' : '23% 23% 0 0'));
        assert.ok(outlines.includes(horizontal ? '0 23% 23% 0' : '0 0 23% 23%'));
        // Use recorded animation data AND CSS easing. Linear-only sampling misses
        // gaps caused by independently eased position and scale animations.
        const interpolate = (t, frames, value) => {
            const stops = frames.map((frame, i) => [frame.offset ?? (i / (frames.length - 1)), value(frame)]);
            for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
                const [at, from] = stops[i - 1], [end, to] = stops[i];
                return from + (to - from) * (t - at) / (end - at);
            }
        };
        const eased = (t, easing) => {
            const controls = { 'ease-in': [.42, 0, 1, 1], 'ease-in-out': [.42, 0, .58, 1] }[easing];
            assert.ok(controls, `unsupported easing: ${easing}`);
            const [x1, y1, x2, y2] = controls;
            const cubic = (u, a, b) => 3 * (1-u) ** 2 * u * a + 3 * (1-u) * u ** 2 * b + u ** 3;
            let lo = 0, hi = 1;
            for (let i = 0; i < 40; i++) {
                const mid = (lo + hi) / 2;
                if (cubic(mid, x1, x2) < t) lo = mid; else hi = mid;
            }
            return cubic((lo + hi) / 2, y1, y2);
        };
        const positions = bodies.map(body => recorded.find(a => a.element === body.element.parent && a.options.duration === 138));
        for (let i = 0; i <= 138; i++) {
            const t = i / 138;
            const centres = positions.map(a => interpolate(eased(t, a.options.easing), a.frames,
                f => Number(f.transform.match(/translate[XY]\(([-.\d]+)px\)/)[1])));
            const widths = bodies.map(a => 100 * interpolate(eased(t, a.options.easing), a.frames,
                f => Number(f.transform.match(/scale\(([-.\d]+), ([-.\d]+)\)/)[horizontal ? 1 : 2])));
            const overlap = (widths[0] + widths[1]) / 2 - Math.abs(centres[0] - centres[1]);
            assert.ok(overlap >= 1, `gap / insufficient coverage ${overlap}px at ${i}ms in direction ${direction}`);
        }
        game.startNewGame(); await flush();
    }
});


test('fusion hides only the shared edge and restores normal material on commit or cancel', async () => {
    for (const [direction, leadEdge, incomingEdge] of [[0, 'bottom', 'top'], [1, 'left', 'right'], [2, 'top', 'bottom'], [3, 'right', 'left']]) {
        const { game, fixture, flush, lookup } = harness();
        fixture(direction % 2 === 0 ? [[2], [2]] : [[2, 2]]);
        game.move(direction);
        const { lead, incoming } = game.pendingTurn.merges[0];
        assert.equal(lookup(lead).firstElementChild.getAttribute('data-contact'), leadEdge);
        assert.equal(lookup(incoming).firstElementChild.getAttribute('data-contact'), incomingEdge);
        await flush(); await flush();
        assert.equal(lookup(lead).firstElementChild.getAttribute('data-contact'), null);
        game.startNewGame(); await flush();
        fixture([[2, 2]]); game.move(3); await flush();
        game.resize(); await flush();
        for (const tile of lookup('tileContainer').children) assert.equal(tile.firstElementChild.getAttribute('data-contact'), null);
    }
});

test('a score gain keeps its own chip and the next move does not wipe it', async () => {
    const { game, fixture, flush, lookup } = harness();
    fixture([[2, 2]]);
    game.move(3); await flush(); await flush();
    const layer = lookup('scoreGainLayer');
    assert.equal(layer.children.length, 1);
    assert.equal(layer.children[0].children[0].textContent, '+4');
    game.move(0); // cancelAnimations() runs here and must leave the chip alone
    assert.equal(lookup('scoreGainLayer').children.length, 1, 'the chip must survive the next move');
    game.startNewGame(); await flush();
    assert.equal(lookup('scoreGainLayer').children.length, 0, 'a new game clears the chips');
});

test('concurrent gains stack upwards and shorten their life', () => {
    const { game, lookup, recorded } = harness();
    game.showScoreGain(4);
    game.showScoreGain(8);
    game.showScoreGain(16);
    const layer = lookup('scoreGainLayer');
    assert.equal(layer.children.length, 3);
    assert.deepEqual(layer.children.map(chip => chip.children[0].textContent), ['+4', '+8', '+16']);
    assert.deepEqual(layer.children.map(chip => chip.style.props['--lift']), ['-24px', '-12px', '0px']);
    const durations = recorded.filter(a => a.element.className === 'score-gain-inner').map(a => a.options.duration);
    assert.equal(durations.length, 3);
    assert.ok(durations[0] > durations[1] && durations[1] > durations[2], 'a burst shortens every chip');
    assert.ok(durations[2] >= 460);
});

test('the chip column never grows past the visible limit', () => {
    const { game, lookup } = harness();
    for (const gain of [4, 8, 16, 32]) game.showScoreGain(gain);
    const layer = lookup('scoreGainLayer');
    assert.equal(layer.children.length, 3);
    assert.deepEqual(layer.children.map(chip => chip.children[0].textContent), ['+8', '+16', '+32']);
});

test('a chip leaves the layer once its animation ends', async () => {
    const { game, flush, lookup } = harness();
    game.showScoreGain(4);
    assert.equal(lookup('scoreGainLayer').children.length, 1);
    await flush();
    assert.equal(lookup('scoreGainLayer').children.length, 0);
});

test('a committed turn is checkpointed and the board comes back after a reload', async () => {
    const { game, fixture, flush, lookup, stored } = harness();
    fixture([[2, 2]]);
    game.move(3); await flush(); await flush();
    const saved = JSON.parse(stored.get('2048_savedGame'));
    assert.equal(saved.score, 4);
    assert.equal(saved.grid[0][0], 4);
    const tiles = saved.grid.flat().filter(value => value !== null).length;
    assert.ok(tiles >= 2);
    // a fresh page load picks the run up where it stopped
    const reloaded = harness(stored);
    assert.equal(reloaded.game.score, 4);
    assert.equal(reloaded.lookup('currentScore').textContent, 4);
    assert.equal(reloaded.game.grid[0][0].value, 4);
    assert.equal(reloaded.game.grid.flat().filter(Boolean).length, tiles);
    assert.equal(reloaded.game.ended, false);
});

test('a finished game and a new game both leave no progress behind', async () => {
    const { game, fixture, flush, stored } = harness();
    fixture([[2, 2, 8, 16], [8, 16, 32, 64], [16, 32, 64, 128], [32, 64, 128, 256]]);
    game.move(3); await flush(); await flush();
    assert.equal(game.ended, true);
    assert.equal(stored.get('2048_savedGame'), undefined);
    fixture([[2, 2]]);
    game.move(3); await flush(); await flush();
    assert.ok(stored.get('2048_savedGame'));
    game.startNewGame();
    assert.equal(stored.get('2048_savedGame'), undefined);
});

test('a damaged or empty save is ignored and replaced by a fresh board', () => {
    for (const broken of ['{"grid":"broken"}', '{"grid":[[null,null,null,null],[null,null,null,null],[null,null,null,null],[null,null,null,null]]}', '{"grid":[[1,2,3,4]]}']) {
        const stored = new Map([['2048_bestScore', '128'], ['2048_savedGame', broken]]);
        const { game } = harness(stored);
        assert.equal(game.score, 0);
        assert.equal(game.grid.flat().filter(Boolean).length, 2);
        assert.equal(stored.get('2048_savedGame'), undefined);
    }
});

test('a restored board rings the score box to announce itself', () => {
    const board = [[2, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
    const stored = new Map([['2048_bestScore', '128'], ['2048_savedGame', JSON.stringify({ score: 12, grid: board })]]);
    const { game, lookup } = harness(stored);
    assert.equal(game.score, 12);
    assert.ok(lookup('currentScoreBox').classes.has('is-restored'));
});
