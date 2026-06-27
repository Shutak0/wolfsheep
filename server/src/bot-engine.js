// bot-engine.js — Negamax depth 3 с ходами фишкой + стенами
const Engine = require('./engine/quoridor-engine');

const BOARD_SIZE = 9;
const GOAL_ROW_SHEEP = 8;
const MAX_WALL_CANDIDATES = 8;
const BASE_DEPTH = 3;
const CRITICAL_DEPTH = 4;
const RANDOM_MOVE_CHANCE = 0.20;
const MAX_WALL_DIST = 6;

let distCache = null;

function distKey(fr, fc, tr, tc, vEdge, hEdge) {
    let vh = 0, hh = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) if (vEdge[r][c]) vh ^= (1 << ((r * 9 + c) & 31));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) if (hEdge[r][c]) hh ^= (1 << ((r * 8 + c) & 31));
    return `${fr},${fc}|${tr},${tc}|${vh}|${hh}`;
}

function bfsDist(state, fr, fc, tr, tc) {
    if (fr === tr && fc === tc) return 0;
    const key = distKey(fr, fc, tr, tc, state.vEdge, state.hEdge);
    if (distCache && distCache.has(key)) return distCache.get(key);
    const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const queue = [{ row: fr, col: fc, dist: 0 }];
    visited[fr][fc] = true;
    while (queue.length) {
        const { row, col, dist } = queue.shift();
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
            if (visited[nr][nc]) continue;
            let blocked = false;
            if (dr === -1) blocked = Engine.isWallBlockingVertical(row - 1, col, state);
            else if (dr === 1) blocked = Engine.isWallBlockingVertical(row, col, state);
            else if (dc === -1) blocked = Engine.isWallBlockingHorizontal(row, col - 1, state);
            else if (dc === 1) blocked = Engine.isWallBlockingHorizontal(row, col, state);
            if (blocked) continue;
            if (nr === tr && nc === tc) { const d = dist + 1; if (distCache) distCache.set(key, d); return d; }
            visited[nr][nc] = true;
            queue.push({ row: nr, col: nc, dist: dist + 1 });
        }
    }
    const d = Infinity;
    if (distCache) distCache.set(key, d);
    return d;
}

function shortestToRow(state, pr, pc, targetRow) {
    let best = Infinity;
    for (let c = 0; c < BOARD_SIZE; c++) { const d = bfsDist(state, pr, pc, targetRow, c); if (d < best) best = d; }
    return best;
}

function clone(state) {
    return {
        players: [
            { row: state.players[0].row, col: state.players[0].col, walls: state.players[0].walls, timeLeft: state.players[0].timeLeft },
            { row: state.players[1].row, col: state.players[1].col, walls: state.players[1].walls, timeLeft: state.players[1].timeLeft },
        ],
        turn: state.turn, gameOver: !!state.gameOver, winner: state.winner != null ? state.winner : null, winReason: state.winReason || null,
        vEdge: state.vEdge.map(r => [...r]), hEdge: state.hEdge.map(r => [...r]),
        walls: state.walls ? [...state.walls] : [], timeControl: state.timeControl || { increment: 0 },
    };
}

function evaluate(state, playerIndex) {
    const wolf = state.players[0], sheep = state.players[1];
    const w2s = bfsDist(state, wolf.row, wolf.col, sheep.row, sheep.col);
    const s2g = shortestToRow(state, sheep.row, sheep.col, GOAL_ROW_SHEEP);
    if (w2s === 0) return playerIndex === 0 ? 1e8 : -1e8;
    if (s2g === 0) return playerIndex === 1 ? 1e8 : -1e8;
    if (w2s === Infinity) return playerIndex === 1 ? 1e8 : -1e8;
    if (s2g === Infinity) return playerIndex === 0 ? 1e8 : -1e8;
    const wallDiff = state.players[playerIndex].walls - state.players[1 - playerIndex].walls;
    const myP = state.players[playerIndex];
    const centerBonus = (8 - (Math.abs(myP.row - 4) + Math.abs(myP.col - 4))) * 0.3;
    if (playerIndex === 0) return -w2s * 130 + s2g * 65 + wallDiff * 30 - sheep.row * 18 + centerBonus;
    else return -s2g * 110 + w2s * 55 + wallDiff * 25 + sheep.row * 18 + centerBonus;
}

// Генерация ходов: фишки + отфильтрованные стены (без isWallValid)
function generateMoves(state, playerIndex) {
    const moves = [];
    const vm = Engine.computeValidMoves(clone(state));
    for (const m of vm) {
        if (playerIndex === 1 && m.row < state.players[1].row) continue; // овца не назад
        if (playerIndex === 0) {
            const curD = Math.abs(state.players[0].row - state.players[1].row) + Math.abs(state.players[0].col - state.players[1].col);
            const newD = Math.abs(m.row - state.players[1].row) + Math.abs(m.col - state.players[1].col);
            if (newD > curD + 2) continue;
        }
        moves.push({ type: 'move', row: m.row, col: m.col });
    }

    if (state.players[playerIndex].walls > 0) {
        const walls = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const d0 = Math.abs(r - state.players[0].row) + Math.abs(c - state.players[0].col);
                const d1 = Math.abs(r - state.players[1].row) + Math.abs(c - state.players[1].col);
                if (d0 > MAX_WALL_DIST && d1 > MAX_WALL_DIST) continue;

                if (!state.vEdge[r][c] && !state.vEdge[r][c + 1] && !Engine.hasIllegalIntersection(r, c, 'horizontal', state)) {
                    walls.push({ type: 'wall', row: r, col: c, orient: 'horizontal' });
                }
                if (!state.hEdge[r][c] && !state.hEdge[r + 1][c] && !Engine.hasIllegalIntersection(r, c, 'vertical', state)) {
                    walls.push({ type: 'wall', row: r, col: c, orient: 'vertical' });
                }
            }
        }
        // Сортируем стены по манхэттену до противника (ближе = лучше)
        walls.sort((a, b) => {
            const opp = state.players[1 - playerIndex];
            const da = Math.abs(a.row - opp.row) + Math.abs(a.col - opp.col);
            const db = Math.abs(b.row - opp.row) + Math.abs(b.col - opp.col);
            return da - db;
        });
        for (const w of walls.slice(0, MAX_WALL_CANDIDATES)) moves.push(w);
    }

    // Сортировка: выигрышные ходы первыми
    moves.sort((a, b) => {
        if (a.type === 'move' && playerIndex === 0 && a.row === state.players[1].row && a.col === state.players[1].col) return -1;
        if (b.type === 'move' && playerIndex === 0 && b.row === state.players[1].row && b.col === state.players[1].col) return 1;
        if (a.type === 'move' && playerIndex === 1 && a.row === GOAL_ROW_SHEEP) return -1;
        if (b.type === 'move' && playerIndex === 1 && b.row === GOAL_ROW_SHEEP) return 1;
        return 0;
    });
    return moves;
}

function applyMove(state, move, playerIndex) {
    const c = clone(state);
    if (move.type === 'move') {
        c.players[playerIndex].row = move.row;
        c.players[playerIndex].col = move.col;
        if (playerIndex === 0 && move.row === c.players[1].row && move.col === c.players[1].col) { c.gameOver = true; c.winner = 0; }
        if (playerIndex === 1 && move.row === GOAL_ROW_SHEEP) { c.gameOver = true; c.winner = 1; }
        if (!c.gameOver) { c.turn = 1 - playerIndex; c.players[playerIndex].timeLeft += (c.timeControl.increment || 0); }
    } else {
        // Проверка isWallValid лениво — если невалидна, возвращаем null
        if (move.orient === 'horizontal') { c.vEdge[move.row][move.col] = true; c.vEdge[move.row][move.col + 1] = true; }
        else { c.hEdge[move.row][move.col] = true; c.hEdge[move.row + 1][move.col] = true; }
        if (!Engine.isWallValid(c.vEdge, c.hEdge, state)) return null;
        c.players[playerIndex].walls--;
        c.walls.push({ row: move.row, col: move.col, orient: move.orient });
        c.turn = 1 - playerIndex;
        c.players[playerIndex].timeLeft += (c.timeControl.increment || 0);
    }
    return c;
}

// Negamax
let nodes = 0;
const tt = new Map();

function stateKey(state, playerIndex) {
    const p0 = state.players[0], p1 = state.players[1];
    let vh = 0, hh = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) if (state.vEdge[r][c]) vh ^= (1 << ((r * 9 + c) & 31));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) if (state.hEdge[r][c]) hh ^= (1 << ((r * 8 + c) & 31));
    return `${playerIndex}|${p0.row}${p0.col}${p1.row}${p1.col}|${p0.walls}${p1.walls}|${vh}|${hh}`;
}

function negamax(state, depth, alpha, beta, playerIndex) {
    nodes++;
    if (state.gameOver) return state.winner === playerIndex ? 1e8 + depth : -1e8 - depth;
    if (depth === 0) return evaluate(state, playerIndex);

    const key = stateKey(state, playerIndex);
    const entry = tt.get(key);
    if (entry && entry.depth >= depth) {
        if (entry.flag === 'exact') return entry.value;
        if (entry.flag === 'lower' && entry.value >= beta) return entry.value;
        if (entry.flag === 'upper' && entry.value <= alpha) return entry.value;
    }

    const moves = generateMoves(state, playerIndex);
    if (moves.length === 0) return -1e8 - (BASE_DEPTH - depth);

    let best = -Infinity, flag = 'upper';
    for (const move of moves) {
        const child = applyMove(state, move, playerIndex);
        if (!child) continue; // стена оказалась невалидной
        const val = -negamax(child, depth - 1, -beta, -alpha, 1 - playerIndex);
        if (val > best) { best = val; flag = 'exact'; }
        alpha = Math.max(alpha, val);
        if (alpha >= beta) { flag = 'lower'; break; }
    }
    if (tt.size < 200000) tt.set(key, { value: best, depth, flag });
    return best;
}

function searchBestMove(state, botIndex, maxDepth) {
    // Сначала генерируем ходы верхнего уровня (с isWallValid для валидации стен)
    const rawMoves = generateMoves(state, botIndex);
    const validMoves = [];
    for (const m of rawMoves) {
        if (m.type === 'move') {
            validMoves.push(m);
        } else {
            const child = applyMove(state, m, botIndex);
            if (child) validMoves.push(m); // стена прошла isWallValid
        }
    }
    if (validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    tt.clear(); distCache = new Map(); nodes = 0;
    let bestMove = validMoves[0];

    for (let d = 1; d <= maxDepth; d++) {
        let bestAtD = null, bestScore = -Infinity;
        for (const move of validMoves) {
            const child = applyMove(state, move, botIndex);
            if (!child) continue;
            const score = -negamax(child, d - 1, -1e15, 1e15, 1 - botIndex);
            if (score > bestScore) { bestScore = score; bestAtD = move; }
        }
        if (bestAtD) { bestMove = bestAtD; if (bestScore > 9e7) break; }
    }
    return bestMove;
}

function makeMove(state, botIndex) {
    const vm = Engine.computeValidMoves(clone(state));
    if (vm.length === 0) return { type: 'move', row: state.players[botIndex].row, col: state.players[botIndex].col };

    if (botIndex === 0) {
        const win = vm.find(m => m.row === state.players[1].row && m.col === state.players[1].col);
        if (win) return { type: 'move', row: win.row, col: win.col };
    } else {
        const win = vm.find(m => m.row === GOAL_ROW_SHEEP);
        if (win) return { type: 'move', row: win.row, col: win.col };
    }

    const wolf = state.players[0], sheep = state.players[1];
    const manh = Math.abs(wolf.row - sheep.row) + Math.abs(wolf.col - sheep.col);
    const s2g = GOAL_ROW_SHEEP - sheep.row;
    let depth = BASE_DEPTH;
    if (botIndex === 0 && manh <= 3) depth = CRITICAL_DEPTH;
    else if (botIndex === 1 && s2g <= 3) depth = CRITICAL_DEPTH;

    distCache = new Map();
    const bestMove = searchBestMove(state, botIndex, depth);

    let chosen = bestMove;
    if (Math.random() < RANDOM_MOVE_CHANCE && bestMove) {
        const allPieceMoves = generateMoves(state, botIndex).filter(m => m.type === 'move');
        if (allPieceMoves.length > 0) chosen = allPieceMoves[Math.floor(Math.random() * allPieceMoves.length)];
    }

    if (chosen) {
        const clean = { type: chosen.type, row: chosen.row, col: chosen.col };
        if (chosen.type === 'wall') clean.orient = chosen.orient;
        return clean;
    }
    return vm.length > 0 ? { type: 'move', row: vm[0].row, col: vm[0].col } : null;
}

module.exports = { makeMove };