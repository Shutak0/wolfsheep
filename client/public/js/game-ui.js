// ============================================================
//  QUORIDOR UI – рендеринг и работа с DOM-элементами
// ============================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.QuoridorUI = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

    var SIZE = 9, CANVAS_SIZE = 600, CELL_SIZE = 58, GAP = 6, CORNER_RADIUS = 7;
    var OFFSET = 12; // 1/5 CELL_SIZE — барьер
    var WALL_THICK = 10, HIT_THRESHOLD = 14, PIECE_RADIUS = 26;
    var COLORS = ['#ff3366', '#33ff66'];
    var COLOR_NAMES = ['Red', 'Green'];

    function cx(c) { return OFFSET + c * (CELL_SIZE + GAP); }
    function cy(r) { return OFFSET + r * (CELL_SIZE + GAP); }
    function ccx(c) { return cx(c) + CELL_SIZE / 2; }
    function ccy(r) { return cy(r) + CELL_SIZE / 2; }

    function lerpColor(a, b, t) {
        t = Math.max(0, Math.min(1, t));
        var ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
        var ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
        var br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
        return '#' + ((1 << 24) | (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)).toString(16).slice(1);
    }

    function roundRect(ctx, x, y, w, h, r) {
        if (r > w / 2) r = w / 2; if (r > h / 2) r = h / 2;
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }

    function drawWall(ctx, x1, y1, x2, y2, color, t) {
        t = t || WALL_THICK;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = t; ctx.lineCap = 'round'; ctx.shadowColor = color; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = t * 0.3; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(x1 + 2, y1 - 1); ctx.lineTo(x2 - 2, y2 - 1); ctx.stroke();
        ctx.restore();
    }

    function render(canvas, state, imgs, hoverWall, opt) {
        var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        var myIdx = (opt && opt.playerIndex != null) ? opt.playerIndex : 0;
        var isReplay = opt && opt.replayMode;

        ctx.save();
        if (myIdx === 1) { ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI); ctx.translate(-W / 2, -H / 2); }
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);

        // ---- ZOOM / VIEWPORT (для реплея) ----
        var zLevel = (opt && opt.zoomLevel) || 9;
        var zRow = (opt && opt.zoomRow != null) ? opt.zoomRow : 0;
        var zCol = (opt && opt.zoomCol != null) ? opt.zoomCol : 0;
        if (zLevel < 9) {
            ctx.save();
            // Масштаб с учётом барьера (OFFSET): zLevel клеток + барьер с обеих сторон
            var zScale = CANVAS_SIZE / (zLevel * (CELL_SIZE + GAP) - GAP + 2 * OFFSET);
            ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
            ctx.scale(zScale, zScale);
            // Сдвиг на начало барьера перед колонкой zCol/zRow
            ctx.translate(-zCol * (CELL_SIZE + GAP), -zRow * (CELL_SIZE + GAP));
        }

        var winAnim = state.gameOver && state.winner !== null;
        var wc = winAnim ? COLORS[state.winner] : null;
        var wt = winAnim ? (state._winTime || 0) : 0;

        // ---- cells ----
        for (var r = 0; r < 9; r++) {
            for (var c = 0; c < 9; c++) {
                var x = cx(c), y = cy(r);
                ctx.save();
                ctx.shadowColor = 'rgba(138,43,226,0.10)'; ctx.shadowBlur = 10;
                if (winAnim && wc && wt > 0) {
                    var p = Math.min(wt / 1000, 1);
                    var d = (r + c) * 0.04;
                    var cp = Math.max(0, Math.min(1, (p - d) / (1 - d + 0.01)));
                    // Однотонный цвет без блика для win-анимации
                    ctx.fillStyle = lerpColor('#1c1c32', wc, cp * 0.8);
                } else if (winAnim && wc) {
                    ctx.fillStyle = wc; ctx.globalAlpha = 0.3;
                } else {
                    // Однотонный цвет без блика — чуть светлее чёрного
                    ctx.fillStyle = '#1c1c32';
                }
                roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CORNER_RADIUS); ctx.fill();
                if (winAnim) ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(70, 50, 120, 0.25)'; ctx.lineWidth = 1.2;
                roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CORNER_RADIUS); ctx.stroke();

                var isGG = r === 8, isGR = r === state.players[1].row && c === state.players[1].col;
                if (isGG) { drawSymbol(ctx, x, y, '33ff66', '▼'); }
                if (isGR && !isGG) { drawSymbol(ctx, x, y, 'ff3366', '★'); }
                ctx.restore();
            }
        }

        // ---- walls ----
        var WS = 0.10; ctx.shadowBlur = 14;
        for (var rr = 0; rr < 8; rr++) for (var cc = 0; cc < 9; cc++) {
            if (!state.vEdge[rr][cc]) continue;
            var o = state.vOwner[rr][cc], cl = o === 0 ? '#ff3366' : '#33ff66', yy = cy(rr + 1);
            if (cc < 8 && state.vEdge[rr][cc + 1] && state.vOwner[rr][cc + 1] === o) {
                var f1 = cx(cc), f2 = cx(cc + 2), pad = (f2 - f1) * WS, mid = cx(cc + 1);
                drawWall(ctx, f1 + pad, yy, mid, yy, cl); drawWall(ctx, mid, yy, f2 - pad, yy, cl); cc++;
            } else { var x1 = cx(cc), x2 = cx(cc + 1), pad = (x2 - x1) * WS; drawWall(ctx, x1 + pad, yy, x2 - pad, yy, cl); }
        }
        for (var cc = 0; cc < 8; cc++) for (var rr = 0; rr < 9; rr++) {
            if (!state.hEdge[rr][cc]) continue;
            var o = state.hOwner[rr][cc], cl = o === 0 ? '#ff3366' : '#33ff66', xx = cx(cc + 1);
            if (rr < 8 && state.hEdge[rr + 1][cc] && state.hOwner[rr + 1][cc] === o) {
                var f1 = cy(rr), f2 = cy(rr + 2), pad = (f2 - f1) * WS, mid = cy(rr + 1);
                drawWall(ctx, xx, f1 + pad, xx, mid, cl); drawWall(ctx, xx, mid, xx, f2 - pad, cl); rr++;
            } else { var y1 = cy(rr), y2 = cy(rr + 1), pad = (y2 - y1) * WS; drawWall(ctx, xx, y1 + pad, xx, y2 - pad, cl); }
        }
        ctx.shadowBlur = 0;

        // ---- hover ----
        if (hoverWall && !state.gameOver && state.turn === myIdx && !isReplay && state.players[state.turn].walls > 0) {
            var hw = hoverWall, ok = true;
            if (hw.orient === 'horizontal') { if (state.vEdge[hw.row][hw.col] || state.vEdge[hw.row][hw.col + 1]) ok = false; }
            else { if (state.hEdge[hw.row][hw.col] || state.hEdge[hw.row + 1][hw.col]) ok = false; }
            var E = window.QuoridorEngine;
            if (ok && E && E.hasIllegalIntersection && E.hasIllegalIntersection(hw.row, hw.col, hw.orient, state)) ok = false;
            if (ok && E && E.isWallValid) {
                var tv = state.vEdge.map(function(r){return r.slice();}), th = state.hEdge.map(function(r){return r.slice();});
                if (hw.orient === 'horizontal') { tv[hw.row][hw.col] = true; tv[hw.row][hw.col + 1] = true; }
                else { th[hw.row][hw.col] = true; th[hw.row + 1][hw.col] = true; }
                if (!E.isWallValid(tv, th, state)) ok = false;
            }
            ctx.shadowBlur = ok ? 30 : 0; ctx.shadowColor = ok ? '#00ffc8' : 'transparent';
            var hc = ok ? 'rgba(0, 255, 200, 0.85)' : 'rgba(30, 30, 40, 0.9)';
            if (hw.orient === 'horizontal') drawWall(ctx, cx(hw.col), cy(hw.row + 1), cx(hw.col + 2), cy(hw.row + 1), hc, 12);
            else drawWall(ctx, cx(hw.col + 1), cy(hw.row), cx(hw.col + 1), cy(hw.row + 2), hc, 12);
            ctx.shadowBlur = 0;
        }

        // ---- move hints ----
        if (state.turn === myIdx && !state.gameOver && !isReplay) {
            for (var i = 0; i < state.validMoves.length; i++) {
                var m = state.validMoves[i], mc = ccx(m.col), myv = ccy(m.row);
                ctx.beginPath(); ctx.arc(mc, myv, 14, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 200, 0.15)'; ctx.shadowColor = '#00ffc8'; ctx.shadowBlur = 30; ctx.fill();
                ctx.strokeStyle = 'rgba(0, 255, 200, 0.5)'; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.arc(mc, myv, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffc8'; ctx.shadowBlur = 40; ctx.fill(); ctx.shadowBlur = 0;
            }
        }

        // ---- pieces ----
        for (var pi = 1; pi >= 0; pi--) {
            var pp = state.players[pi], pcx = ccx(pp.col), pcy = ccy(pp.row), rad = PIECE_RADIUS;
            ctx.save();
            if (myIdx === 1) { ctx.translate(pcx, pcy); ctx.rotate(Math.PI); ctx.translate(-pcx, -pcy); }
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
            ctx.beginPath(); ctx.arc(pcx + 2, pcy + 4, rad + 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            var img = imgs && imgs[pi];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save(); ctx.beginPath(); ctx.arc(pcx, pcy, rad, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
                var asp = img.naturalWidth / img.naturalHeight, dw, dh, dx, dy;
                if (asp > 1) { dh = rad * 2; dw = dh * asp; dx = pcx - dw / 2; dy = pcy - rad; }
                else { dw = rad * 2; dh = dw / asp; dx = pcx - rad; dy = pcy - dh / 2; }
                ctx.drawImage(img, dx, dy, dw, dh); ctx.restore();
                ctx.beginPath(); ctx.arc(pcx, pcy, rad, 0, Math.PI * 2);
                ctx.strokeStyle = COLORS[pi]; ctx.lineWidth = 3.5; ctx.shadowColor = COLORS[pi]; ctx.shadowBlur = 30; ctx.stroke();
            } else {
                var gd = ctx.createRadialGradient(pcx - 6, pcy - 6, 6, pcx, pcy, rad + 2);
                gd.addColorStop(0, COLORS[pi]); gd.addColorStop(1, pi === 0 ? '#990033' : '#006633');
                ctx.beginPath(); ctx.arc(pcx, pcy, rad, 0, Math.PI * 2);
                ctx.fillStyle = gd; ctx.shadowColor = COLORS[pi]; ctx.shadowBlur = 40; ctx.fill();
                ctx.shadowBlur = 0; ctx.strokeStyle = COLORS[pi]; ctx.lineWidth = 3.5; ctx.stroke();
                ctx.beginPath(); ctx.arc(pcx - 6, pcy - 7, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
            }
            ctx.restore();

            // badge
            var br = 14, bx = myIdx === 1 ? pcx - rad * 0.7 : pcx + rad * 0.7, by = myIdx === 1 ? pcy + rad * 0.7 : pcy - rad * 0.7;
            ctx.save(); if (myIdx === 1) { ctx.translate(bx, by); ctx.rotate(Math.PI); ctx.translate(-bx, -by); }
            ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = '#0a0a12'; ctx.fill();
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = COLORS[pi]; ctx.lineWidth = 2.5; ctx.shadowColor = COLORS[pi]; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#f0f0ff'; ctx.font = 'bold 15px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.fillText(pp.walls, bx, by + 1); ctx.shadowBlur = 0;
            ctx.restore();

            // turn indicator
            if (state.turn === pi && !state.gameOver && !isReplay) {
                ctx.save(); if (myIdx === 1) { ctx.translate(pcx, pcy); ctx.rotate(Math.PI); ctx.translate(-pcx, -pcy); }
                ctx.beginPath(); ctx.arc(pcx, pcy, rad + 5, 0, Math.PI * 2);
                ctx.strokeStyle = COLORS[pi]; ctx.lineWidth = 2.5; ctx.setLineDash([4, 7]);
                ctx.shadowColor = COLORS[pi]; ctx.shadowBlur = 30; ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
                ctx.restore();
            }
        }

        // ---- win overlay (always, including replay) ----
        if (state.gameOver && state.winner !== null) {
            ctx.save(); if (myIdx === 1) { ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI); ctx.translate(-W / 2, -H / 2); }
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#00ffff'; ctx.font = 'bold 52px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 50;
        //    ctx.fillText('🏆 ' + COLOR_NAMES[state.winner] + ' won!', W / 2, H / 2 - 6); ctx.shadowBlur = 0;
            ctx.restore();
        }

        // Закрываем zoom-блок
        if (zLevel < 9) ctx.restore();

        ctx.restore();
    }

    function drawSymbol(ctx, x, y, color, sym) {
        var c = '#' + color;
        ctx.save();
        ctx.shadowColor = c; ctx.shadowBlur = 40;
        ctx.strokeStyle = 'rgba(' + parseInt(color.slice(0,2),16) + ',' + parseInt(color.slice(2,4),16) + ',' + parseInt(color.slice(4,6),16) + ',0.8)';
        ctx.lineWidth = 3.5;
        roundRect(ctx, x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6, CORNER_RADIUS - 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(' + parseInt(color.slice(0,2),16) + ',' + parseInt(color.slice(2,4),16) + ',' + parseInt(color.slice(4,6),16) + ',0.15)';
        roundRect(ctx, x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, CORNER_RADIUS - 3); ctx.fill();
        ctx.fillStyle = 'rgba(' + parseInt(color.slice(0,2),16) + ',' + parseInt(color.slice(2,4),16) + ',' + parseInt(color.slice(4,6),16) + ',0.6)';
        ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = c; ctx.shadowBlur = 20;
        ctx.fillText(sym, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 2); ctx.shadowBlur = 0;
        ctx.restore();
    }

    function getBoardPos(canvas, mx, my, pi) {
        var r = canvas.getBoundingClientRect(), sx = canvas.width / r.width, sy = canvas.height / r.height;
        var x = (mx - r.left) * sx, y = (my - r.top) * sy;
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
        if (pi === 1) { x = canvas.width - x; y = canvas.height - y; }
        return { x: x, y: y };
    }
    function findWallHit(canvas, x, y, state, wallOrientation) {
        // When wall mode is active, expand hitboxes to half of adjacent cells
        var hHitY = wallOrientation === 'horizontal' ? HIT_THRESHOLD + CELL_SIZE * 0.4 : HIT_THRESHOLD;
        var vHitX = wallOrientation === 'vertical' ? HIT_THRESHOLD + CELL_SIZE * 0.4 : HIT_THRESHOLD;
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
            var ly = cy(r + 1); if (Math.abs(y - ly) < hHitY && x >= cx(c) - 3 && x <= cx(c + 2) + 3 && !state.vEdge[r][c] && !state.vEdge[r][c + 1]) return { row: r, col: c, orient: 'horizontal' };
        }
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
            var lx = cx(c + 1); if (Math.abs(x - lx) < vHitX && y >= cy(r) - 3 && y <= cy(r + 2) + 3 && !state.hEdge[r][c] && !state.hEdge[r + 1][c]) return { row: r, col: c, orient: 'vertical' };
        }
        return null;
    }
    function findCellHit(canvas, x, y) {
        for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) { var xx = cx(c), yy = cy(r); if (x >= xx && x <= xx + CELL_SIZE && y >= yy && y <= yy + CELL_SIZE) return { row: r, col: c }; }
        return null;
    }

    return { render: render, getBoardPos: getBoardPos, findWallHit: findWallHit, findCellHit: findCellHit,
        cellX: cx, cellY: cy, cellCenterX: ccx, cellCenterY: ccy,
        COLORS: COLORS, COLOR_NAMES: COLOR_NAMES,
        SIZE: SIZE, CANVAS_SIZE: CANVAS_SIZE, CELL_SIZE: CELL_SIZE, GAP: GAP, CORNER_RADIUS: CORNER_RADIUS, OFFSET: OFFSET, WALL_THICK: WALL_THICK, HIT_THRESHOLD: HIT_THRESHOLD, PIECE_RADIUS: PIECE_RADIUS };
}));