import assert from 'node:assert/strict';
import test from 'node:test';
import { countSolutions, DIFFICULTY, generatePuzzle, ratePuzzle } from '../legacy-tools/数独/engine.js';

function parseBoard(digits) {
  return digits.match(/.{9}/g).map(row => Array.from(row, Number));
}

test('boards with the same clue count can require different techniques', () => {
  const locked = parseBoard('000000000072084900104035070350016040800000000000008301000020008760801250020509000');
  const pair = parseBoard('004020001020891350890050607040700012900000000016040000030070069000900700000003005');
  const expert = parseBoard('700090010200406703400000095037002000009000050000930800370000000008060000650307948');

  for (const [board, level] of [[locked, 3], [pair, 4], [expert, 5]]) {
    assert.equal(board.flat().filter(value => value === 0).length, 51);
    assert.equal(ratePuzzle(board).level, level);
    assert.equal(ratePuzzle(board, level - 1), null);
  }
});

test('generated puzzles are uniquely solvable with the requested technique level', () => {
  for (let level = 1; level <= 5; level++) {
    for (let i = 0; i < 4; i++) {
      const { puzzle, solution, openingSingles } = generatePuzzle(level);
      const [min, max] = DIFFICULTY[level].holes;
      const givens = puzzle.flat();
      const holes = givens.filter(value => value === 0).length;
      assert.ok(holes >= min && holes <= max);
      assert.equal(countSolutions(puzzle), 1);
      assert.equal(countSolutions(solution), 1);
      assert.ok(solution.flat().every((value, cell) => value && (!givens[cell] || value === givens[cell])));
      assert.equal(ratePuzzle(puzzle).level, level);
      if (level === 1) assert.ok(openingSingles >= 8);
      else assert.equal(ratePuzzle(puzzle, level - 1), null);
    }
  }
});
