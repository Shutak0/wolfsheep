// ============================================================
//  WOLFSHEEP ENGINE – Quoridor logic
//  Поддержка разных временных контролей
// ============================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.QuoridorEngine = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

    const SIZE = 9;
    const CELL_SIZE = 54;
    const GAP = 6;
    const OFFSET = (600 - (SIZE * CELL_SIZE + (SIZE - 1) * GAP)) / 2;

    // Пресеты временного контроля
    const TIME_PRESETS = {
        '1+5':  { initial:  60000, increment:  5000 },
        '3+2':  { initial: 180000, increment:  2000 },
        '5':    { initial: 300000, increment:     0 },
    };

    function cellX(col) { return OFFSET + col * (CELL_SIZE + GAP); }
    function cellY(row) { return OFFSET + row * (CELL_SIZE + GAP); }

    function segmentsIntersect(s1, s2) {
        function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
        const p1 = { x: s1.x1, y: s1.y1 }, p2 = { x: s1.x2, y: s1.y2 };
        const p3 = { x: s2.x1, y: s2.y1 }, p4 = { x: s2.x2, y: s2.y2 };
        const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
        const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
        if (d1 === 0 && isPointOnSegment(p3, p4, p1)) return true;
        if (d2 === 0 && isPointOnSegment(p3, p4, p2)) return true;
        if (d3 === 0 && isPointOnSegment(p1, p2, p3)) return true;
        if (d4 === 0 && isPointOnSegment(p1, p2, p4)) return true;
        return false;
    }
    function isPointOnSegment(a, b, p) { return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y); }
    function getIntersectionPoint(s1, s2) {
        const x1 = s1.x1, y1 = s1.y1, x2 = s1.x2, y2 = s1.y2;
        const x3 = s2.x1, y3 = s2.y1, x4 = s2.x2, y4 = s2.y2;
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denom === 0) return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
        return null;
    }
    function isEndpoint(point, seg) {
        const eps = 0.1;
        return Math.hypot(point.x - seg.x1, point.y - seg.y1) < eps || Math.hypot(point.x - seg.x2, point.y - seg.y2) < eps;
    }
    function getWallSegments(row, col, orient) {
        if (orient === 'horizontal') {
            const y = cellY(row + 1), x1 = cellX(col), x2 = cellX(col + 1), x3 = cellX(col + 2);
            return [{ x1, y1: y, x2, y2: y }, { x1: x2, y1: y, x2: x3, y2: y }];
        } else {
            const x = cellX(col + 1), y1 = cellY(row), y2 = cellY(row + 1), y3 = cellY(row + 2);
            return [{ x1: x, y1, x2: x, y2: y2 }, { x1: x, y1: y2, x2: x, y2: y3 }];
        }
    }
    function getWallSegment(row, col, orient) {
        if (orient === 'horizontal') return { x1: cellX(col), y1: cellY(row + 1), x2: cellX(col + 2), y2: cellY(row + 1) };
        else return { x1: cellX(col + 1), y1: cellY(row), x2: cellX(col + 1), y2: cellY(row + 2) };
    }
    function hasIllegalIntersection(row, col, orient, state) {
        if (!state.walls || !Array.isArray(state.walls)) state.walls = [];
        const newSeg = getWallSegment(row, col, orient);
        for (const wall of state.walls) {
            const existSeg = getWallSegment(wall.row, wall.col, wall.orient);
            if (segmentsIntersect(newSeg, existSeg)) {
                const pt = getIntersectionPoint(newSeg, existSeg);
                if (pt && !isEndpoint(pt, newSeg) && !isEndpoint(pt, existSeg)) return true;
            }
        }
        return false;
    }
    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
    function isOnBoard(r, c) { return r >= 0 && r < 9 && c >= 0 && c < 9; }
    function otherPlayer(p) { return 1 - p; }

    // timeControl: { initial: ms, increment: ms }
    function initState(timeControl) {
        var tc = timeControl || TIME_PRESETS['1+5'];
        var state = {
            players: [
                { row: 8, col: 4, walls: 10, timeLeft: tc.initial },
                { row: 0, col: 4, walls: 10, timeLeft: tc.initial },
            ],
            turn: 0,
            gameOver: false,
            winner: null,
            winReason: null,
            vEdge: Array.from({ length: 8 }, () => Array(9).fill(false)),
            hEdge: Array.from({ length: 9 }, () => Array(8).fill(false)),
            vOwner: Array.from({ length: 8 }, () => Array(9).fill(-1)),
            hOwner: Array.from({ length: 9 }, () => Array(8).fill(-1)),
            walls: [],
            validMoves: [],
            timeControl: tc,
            positionHistory: [],
        };
        state.validMoves = computeValidMoves(state);
        return state;
    }

    function isWallBlockingVertical(r, c, state) { if (r < 0 || r >= 8 || c < 0 || c >= 9) return true; return state.vEdge[r][c]; }
    function isWallBlockingHorizontal(r, c, state) { if (r < 0 || r >= 9 || c < 0 || c >= 8) return true; return state.hEdge[r][c]; }

    function canReachTarget(row, col, targetRow, targetCol, vEdge, hEdge) {
        if (row === targetRow && col === targetCol) return true;
        const visited = Array.from({ length: 9 }, () => Array(9).fill(false));
        const queue = [{ row, col }]; visited[row][col] = true;
        while (queue.length > 0) {
            const { row: r, col: c } = queue.shift();
            for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nr = r + dr, nc = c + dc;
                if (!isOnBoard(nr, nc) || visited[nr][nc]) continue;
                let blocked = false;
                if (dr === -1) blocked = (r-1<0||r-1>=8) ? true : vEdge[r-1][c];
                else if (dr === 1) blocked = (r<0||r>=8) ? true : vEdge[r][c];
                else if (dc === -1) blocked = (c-1<0||c-1>=8) ? true : hEdge[r][c-1];
                else if (dc === 1) blocked = (c<0||c>=8) ? true : hEdge[r][c];
                if (blocked) continue;
                visited[nr][nc] = true;
                if (nr === targetRow && nc === targetCol) return true;
                queue.push({ row: nr, col: nc });
            }
        }
        return false;
    }

    function isWallValid(vEdge, hEdge, state) {
        const green = state.players[1]; let greenCanReach = false;
        for (let c = 0; c < 9; c++) { if (canReachTarget(green.row, green.col, 8, c, vEdge, hEdge)) { greenCanReach = true; break; } }
        if (!greenCanReach) return false;
        return canReachTarget(state.players[0].row, state.players[0].col, state.players[1].row, state.players[1].col, vEdge, hEdge);
    }

    function computeValidMoves(state) {
        const p = state.turn, { row, col } = state.players[p], opp = state.players[otherPlayer(p)];
        const moves = [];
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = row + dr, nc = col + dc; if (!isOnBoard(nr, nc)) continue;
            let blocked = false;
            if (dr === -1) blocked = isWallBlockingVertical(row-1, col, state);
            else if (dr === 1) blocked = isWallBlockingVertical(row, col, state);
            else if (dc === -1) blocked = isWallBlockingHorizontal(row, col-1, state);
            else if (dc === 1) blocked = isWallBlockingHorizontal(row, col, state);
            if (blocked) continue;
            if (nr === opp.row && nc === opp.col) {
                if (p === 0) { moves.push({ row: nr, col: nc }); continue; }
                const jr = nr + dr, jc = nc + dc;
                if (isOnBoard(jr, jc)) {
                    let jb = false;
                    if (dr===-1) jb=isWallBlockingVertical(nr-1,nc,state); else if (dr===1) jb=isWallBlockingVertical(nr,nc,state);
                    else if (dc===-1) jb=isWallBlockingHorizontal(nr,nc-1,state); else if (dc===1) jb=isWallBlockingHorizontal(nr,nc,state);
                    if (!jb) {
                        if (state.players.findIndex(pl=>pl.row===jr&&pl.col===jc)===-1) { moves.push({row:jr,col:jc}); }
                        else {
                            const diagDirs = dr===0 ? [[-1,dc],[1,dc]] : [[dr,-1],[dr,1]];
                            for (const [ddr,ddc] of diagDirs) {
                                const dr2=nr+ddr, dc2=nc+ddc; if (!isOnBoard(dr2,dc2)) continue;
                                if (state.players.findIndex(pl=>pl.row===dr2&&pl.col===dc2)!==-1) continue;
                                let db=false;
                                if (ddr===-1&&isWallBlockingVertical(row-1,col,state)) db=true;
                                else if (ddr===1&&isWallBlockingVertical(row,col,state)) db=true;
                                if (!db&&ddc===-1&&isWallBlockingHorizontal(row,col-1,state)) db=true;
                                else if (!db&&ddc===1&&isWallBlockingHorizontal(row,col,state)) db=true;
                                if (!db) { if (ddr===-1&&isWallBlockingVertical(row-1+ddr,col+ddc,state)) db=true; else if (ddr===1&&isWallBlockingVertical(row+ddr,col+ddc,state)) db=true; }
                                if (!db&&ddc===-1&&isWallBlockingHorizontal(row+ddr,col-1+ddc,state)) db=true;
                                else if (!db&&ddc===1&&isWallBlockingHorizontal(row+ddr,col+ddc,state)) db=true;
                                if (!db) moves.push({row:dr2,col:dc2});
                            }
                        }
                    }
                } else {
                    const diagDirs = dr===0 ? [[-1,dc],[1,dc]] : [[dr,-1],[dr,1]];
                    for (const [ddr,ddc] of diagDirs) {
                        const dr2=nr+ddr, dc2=nc+ddc; if (!isOnBoard(dr2,dc2)) continue;
                        if (state.players.findIndex(pl=>pl.row===dr2&&pl.col===dc2)!==-1) continue;
                        let db=false;
                        if (ddr===-1&&isWallBlockingVertical(row-1,col,state)) db=true;
                        else if (ddr===1&&isWallBlockingVertical(row,col,state)) db=true;
                        if (!db&&ddc===-1&&isWallBlockingHorizontal(row,col-1,state)) db=true;
                        else if (!db&&ddc===1&&isWallBlockingHorizontal(row,col,state)) db=true;
                        if (!db) { if (ddr===-1&&isWallBlockingVertical(row-1+ddr,col+ddc,state)) db=true; else if (ddr===1&&isWallBlockingVertical(row+ddr,col+ddc,state)) db=true; }
                        if (!db&&ddc===-1&&isWallBlockingHorizontal(row+ddr,col-1+ddc,state)) db=true;
                        else if (!db&&ddc===1&&isWallBlockingHorizontal(row+ddr,col+ddc,state)) db=true;
                        if (!db) moves.push({row:dr2,col:dc2});
                    }
                }
            } else { moves.push({ row: nr, col: nc }); }
        }
        const seen = new Set(), unique = [];
        for (const m of moves) { const k = `${m.row},${m.col}`; if (!seen.has(k)) { seen.add(k); unique.push(m); } }
        state.validMoves = unique;
        return unique;
    }

    function applyAction(state, action) {
        if (action.type === 'move') { state.players[action.player].row = action.row; state.players[action.player].col = action.col; }
        else if (action.type === 'wall') {
            const p = action.player, orient = action.orient, row = action.row, col = action.col;
            if (orient === 'horizontal') { state.vEdge[row][col]=true; state.vEdge[row][col+1]=true; state.vOwner[row][col]=p; state.vOwner[row][col+1]=p; }
            else { state.hEdge[row][col]=true; state.hEdge[row+1][col]=true; state.hOwner[row][col]=p; state.hOwner[row+1][col]=p; }
            state.players[p].walls--;
            state.walls.push({ row, col, orient });
        }
    }

    function tryPlaceWall(state, row, col, orient) {
        if (state.gameOver) return { success: false, message: 'Game over.' };
        const p = state.turn; if (state.players[p].walls <= 0) return { success: false, message: 'No walls left.' };
        if (row<0||row>=8||col<0||col>=8) return { success: false, message: 'Invalid coordinates.' };
        if (orient==='horizontal') { if (state.vEdge[row][col]||state.vEdge[row][col+1]) return { success: false, message: 'Wall already there.' }; }
        else { if (state.hEdge[row][col]||state.hEdge[row+1][col]) return { success: false, message: 'Wall already there.' }; }
        if (hasIllegalIntersection(row,col,orient,state)) return { success: false, message: 'Crossing forbidden.' };
        let testV = state.vEdge.map(r=>[...r]), testH = state.hEdge.map(r=>[...r]);
        if (orient==='horizontal') { testV[row][col]=true; testV[row][col+1]=true; } else { testH[row][col]=true; testH[row+1][col]=true; }
        if (!isWallValid(testV,testH,state)) return { success: false, message: 'Blocks only path.' };
        applyAction(state, { type:'wall', player:p, row, col, orient });
        return { success: true };
    }

    function posKey(state) {
        const p0 = state.players[0], p1 = state.players[1];
        let vh = 0, hh = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) if (state.vEdge[r][c]) vh ^= (1 << ((r * 9 + c) & 31));
        for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) if (state.hEdge[r][c]) hh ^= (1 << ((r * 8 + c) & 31));
        return `${p0.row},${p0.col}|${p1.row},${p1.col}|${vh}|${hh}`;
    }

    function tryMove(state, row, col) {
        if (state.gameOver) return { success: false, message: 'Game over.' };
        const p = state.turn;
        if (!state.validMoves || !state.validMoves.length) computeValidMoves(state);
        if (!state.validMoves.some(m=>m.row===row&&m.col===col)) return { success: false, message: 'Invalid move.' };
        applyAction(state, { type:'move', player:p, row, col });
        if (p===0 && row===state.players[1].row && col===state.players[1].col) { state.gameOver=true; state.winner=0; state.winReason='target'; return { success:true, gameOver:true, winner:0 }; }
        if (p===1 && row===8) { state.gameOver=true; state.winner=1; state.winReason='target'; return { success:true, gameOver:true, winner:1 }; }
        endTurn(state);
        return { success: true };
    }

    function endTurn(state) {
        if (state.gameOver) return;
        state.players[state.turn].timeLeft += state.timeControl.increment;
        state.turn = otherPlayer(state.turn);
        computeValidMoves(state);
        if (!state.validMoves.length) { state.turn = otherPlayer(state.turn); computeValidMoves(state); }

        // Проверка трёхкратного повторения позиции
        if (!state.positionHistory) state.positionHistory = [];
        const key = posKey(state);
        state.positionHistory.push(key);
        let count = 0;
        for (const h of state.positionHistory) {
            if (h === key) count++;
        }
        if (count >= 3) {
            state.gameOver = true;
            state.winner = null;  // ничья
            state.winReason = 'repetition';
        }
    }

    function tickTime(state, deltaMs) {
        if (state.gameOver) return false;
        state.players[state.turn].timeLeft -= deltaMs;
        if (state.players[state.turn].timeLeft <= 0) { state.players[state.turn].timeLeft = 0; state.gameOver = true; state.winner = otherPlayer(state.turn); state.winReason = 'timeout'; return true; }
        return false;
    }

    function surrender(state, playerIndex) { if (state.gameOver) return false; state.gameOver = true; state.winner = otherPlayer(playerIndex); state.winReason = 'surrender'; return true; }
    function checkGameOver(state) { return state.gameOver; }

    return {
        initState, computeValidMoves, applyAction, tryPlaceWall, tryMove, endTurn, checkGameOver,
        isWallValid, canReachTarget, isWallBlockingVertical, isWallBlockingHorizontal,
        deepClone, otherPlayer, tickTime, surrender,
        getWallSegments, getWallSegment, hasIllegalIntersection,
        TIME_PRESETS,
    };
}));