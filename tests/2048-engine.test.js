import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slide, isGameOver } from '../legacy-tools/2048/engine.js';
const board = rows => Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => rows[r]?.[c] ? { id: `${r}-${c}`, value: rows[r][c] } : null));
const values = grid => grid.map(row => row.map(tile => tile?.value ?? 0));

test('pairs merge once, preserving inputs and unique identities', () => {
    for (const [input, expected, score] of [
        [[2, 2, 2, 2], [4, 4, 0, 0], 8],
        [[2, 2, 4, 0], [4, 4, 0, 0], 4],
        [[4, 4, 8, 8], [8, 16, 0, 0], 24],
        [[2, 0, 2, 4], [4, 4, 0, 0], 4],
    ]) {
        const original = board([input]);
        const snapshot = structuredClone(original);
        const result = slide(original, 3);
        assert.deepEqual(values(result.grid)[0], expected);
        assert.equal(result.score, score);
        assert.deepEqual(original, snapshot);
        const ids = result.grid.flat().filter(Boolean).map(t => t.id);
        assert.equal(new Set(ids).size, ids.length);
    }
});

test('all four directions reach the expected edge', () => {
    for (const direction of [0, 1, 2, 3]) {
        const grid = board([[0, 0, 0, 0], [0, 2, 2, 0], [0, 2, 0, 0]]);
        const result = slide(grid, direction);
        assert.equal(result.changed, true);
        assert.equal(result.score, 4);
        assert.equal(result.grid.flat().filter(Boolean).reduce((sum, t) => sum + t.value, 0), 6);
        if (direction === 0) assert.equal(result.grid[0][1].value, 4);
        if (direction === 1) assert.equal(result.grid[1][3].value, 4);
        if (direction === 2) assert.equal(result.grid[3][1].value, 4);
        if (direction === 3) assert.equal(result.grid[1][0].value, 4);
    }
});

test('invalid moves produce no points or movement', () => {
    const grid = board([[2, 4]]);
    const result = slide(grid, 3);
    assert.equal(result.changed, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.moves, []);
    assert.deepEqual(result.grid, grid);
});

test('game over requires a full board without adjacent matches', () => {
    const full = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
    assert.equal(isGameOver(board(full)), true);
    assert.equal(isGameOver(board([[2, 4]])), false);
    const vertical = structuredClone(full); vertical[1][0] = 2;
    assert.equal(isGameOver(board(vertical)), false);
    const horizontal = structuredClone(full); horizontal[0][1] = 2;
    assert.equal(isGameOver(board(horizontal)), false);
});
