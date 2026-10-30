// Pure board transition. Rendering waits for slides before showing merged values.
export function slide(grid, direction) {
    const next = Array.from({ length: 4 }, () => Array(4).fill(null));
    const moves = [];
    const merged = new Set();
    const merges = [];
    let score = 0;
    let changed = false;
    for (let line = 0; line < 4; line++) {
        const cells = Array.from({ length: 4 }, (_, i) => {
            if (direction === 0) return [i, line];
            if (direction === 1) return [line, 3 - i];
            if (direction === 2) return [3 - i, line];
            return [line, i];
        });
        const tiles = cells.flatMap(([r, c]) => grid[r][c] ? [{ tile: grid[r][c], r, c }] : []);
        let slot = 0;
        for (let i = 0; i < tiles.length; i++, slot++) {
            const first = tiles[i];
            const [r, c] = cells[slot];
            const second = tiles[i + 1];
            const combine = second && first.tile.value === second.tile.value;
            next[r][c] = { ...first.tile, value: first.tile.value * (combine ? 2 : 1) };
            for (const source of combine ? [first, second] : [first]) {
                if (source.r !== r || source.c !== c) {
                    moves.push({ id: source.tile.id, r, c });
                    changed = true;
                }
            }
            if (combine) {
                merged.add(first.tile.id);
                merges.push({ lead: first.tile.id, incoming: second.tile.id, r, c });
                score += next[r][c].value;
                i++;
            }
        }
    }
    return { grid: next, moves, merged, merges, score, changed };
}

export function isGameOver(grid) {
    return grid.every((row, r) => row.every((tile, c) => tile &&
        (!grid[r + 1]?.[c] || grid[r + 1][c].value !== tile.value) &&
        (!row[c + 1] || row[c + 1].value !== tile.value)));
}
