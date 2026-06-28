// ============================================================
//  QUORIDOR UI – рендеринг и работа с DOM-элементами
//  Поддержка поворота доски для игрока 1 (зелёный)
//  Все объекты (фишки, бейджи, оверлей) повёрнуты обратно
//  для нормального отображения с точки зрения игрока
// ============================================================

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QuoridorUI = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SIZE = 9;
    const CANVAS_SIZE = 600;
    const CELL_SIZE = 54;
    const GAP = 6;
    const CORNER_RADIUS = 7;
    const OFFSET = (CANVAS_SIZE - (SIZE * CELL_SIZE + (SIZE - 1) * GAP)) / 2;
    const WALL_THICK = 10;               // −10% ширины (было 11)
    const HIT_THRESHOLD = 14;
    const PIECE_RADIUS = 26;

    const COLORS = ['#ff3366', '#33ff66'];
    const COLOR_NAMES = ['Red', 'Green'];

    function cellX(col) { return OFFSET + col * (CELL_SIZE + GAP); }
    function cellY(row) { return OFFSET + row * (CELL_SIZE + GAP); }
    function cellCenterX(col) { return cellX(col) + CELL_SIZE / 2; }
    function cellCenterY(row) { return cellY(row) + CELL_SIZE / 2; }

    function roundRect(ctx, x, y, w, h, r) {
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawWallBar(ctx, x1, y1, x2, y2, color, thickness) {
        thickness = thickness || WALL_THICK;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = thickness * 0.3;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(x1 + 2, y1 - 1);
        ctx.lineTo(x2 - 2, y2 - 1);
        ctx.stroke();
        ctx.restore();
    }

    // ---------- главная функция рендеринга ----------
    // playerIndex: 0 = красный (доска как есть), 1 = зелёный (доска повёрнута на 180°)
    function render(canvas, state, playerImages, hoverWall, options) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Определяем индекс локального игрока (0 или 1)
        const myIdx = (options && options.playerIndex != null) ? options.playerIndex : 0;

        ctx.save();

        // Поворот всей доски на 180° для игрока 1 (зелёный)
        if (myIdx === 1) {
            ctx.translate(W / 2, H / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-W / 2, -H / 2);
        }

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, W, H);

        // ---- клетки ----
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const x = cellX(c);
                const y = cellY(r);
                const isGoalGreen = (r === 8);
                const isGoalRed = (r === state.players[1].row && c === state.players[1].col);

                ctx.save();
                ctx.shadowColor = 'rgba(138,43,226,0.10)';
                ctx.shadowBlur = 10;
                const grad = ctx.createRadialGradient(x + 8, y + 8, 4, x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE);
                grad.addColorStop(0, '#2e2e4e');
                grad.addColorStop(1, '#1a1a30');
                ctx.fillStyle = grad;
                roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CORNER_RADIUS);
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.strokeStyle = 'rgba(70, 50, 120, 0.25)';
                ctx.lineWidth = 1.2;
                roundRect(ctx, x, y, CELL_SIZE, CELL_SIZE, CORNER_RADIUS);
                ctx.stroke();

                if (isGoalGreen) {
                    ctx.save();
                    // Обратный поворот символа для игрока 1
                    if (myIdx === 1) {
                        const gcx = x + CELL_SIZE / 2;
                        const gcy = y + CELL_SIZE / 2;
                        ctx.translate(gcx, gcy);
                        ctx.rotate(Math.PI);
                        ctx.translate(-gcx, -gcy);
                    }
                    ctx.shadowColor = '#33ff66';
                    ctx.shadowBlur = 40;
                    ctx.strokeStyle = 'rgba(51, 255, 102, 0.8)';
                    ctx.lineWidth = 3.5;
                    roundRect(ctx, x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6, CORNER_RADIUS - 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(51, 255, 102, 0.15)';
                    roundRect(ctx, x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, CORNER_RADIUS - 3);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(51, 255, 102, 0.6)';
                    ctx.font = 'bold 24px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = '#33ff66';
                    ctx.shadowBlur = 20;
                    ctx.fillText('▼', x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 2);
                    ctx.shadowBlur = 0;
                    ctx.restore();
                }

                if (isGoalRed && !isGoalGreen) {
                    ctx.save();
                    // Обратный поворот символа для игрока 1
                    if (myIdx === 1) {
                        const gcx = x + CELL_SIZE / 2;
                        const gcy = y + CELL_SIZE / 2;
                        ctx.translate(gcx, gcy);
                        ctx.rotate(Math.PI);
                        ctx.translate(-gcx, -gcy);
                    }
                    ctx.shadowColor = '#ff3366';
                    ctx.shadowBlur = 40;
                    ctx.strokeStyle = 'rgba(255, 51, 102, 0.8)';
                    ctx.lineWidth = 3.5;
                    roundRect(ctx, x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6, CORNER_RADIUS - 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'rgba(255, 51, 102, 0.15)';
                    roundRect(ctx, x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, CORNER_RADIUS - 3);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255, 51, 102, 0.6)';
                    ctx.font = 'bold 24px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = '#ff3366';
                    ctx.shadowBlur = 20;
                    ctx.fillText('★', x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
                    ctx.shadowBlur = 0;
                    ctx.restore();
                }
                ctx.restore();
            }
        }

        // ---- стены (группировка половинок → целые блоки, −20% длины) ----
        const WS = 0.10; // 10% each end = 20% total
        ctx.shadowBlur = 14;
        // Горизонтальные (vEdge)
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                if (!state.vEdge[r][c]) continue;
                const owner = state.vOwner[r][c];
                const color = (owner === 0) ? '#ff3366' : '#33ff66';
                const y = cellY(r + 1);
                if (c < 8 && state.vEdge[r][c + 1] && state.vOwner[r][c + 1] === owner) {
                    // Полная стена из двух половинок — укорачиваем целое, затем бьём
                    const fx1 = cellX(c), fx2 = cellX(c + 2);
                    const pad = (fx2 - fx1) * WS;
                    const mid = cellX(c + 1);
                    drawWallBar(ctx, fx1 + pad, y, mid, y, color);
                    drawWallBar(ctx, mid, y, fx2 - pad, y, color);
                    c++;
                } else {
                    const x1 = cellX(c), x2 = cellX(c + 1);
                    const pad = (x2 - x1) * WS;
                    drawWallBar(ctx, x1 + pad, y, x2 - pad, y, color);
                }
            }
        }
        // Вертикальные (hEdge)
        for (let c = 0; c < 8; c++) {
            for (let r = 0; r < 9; r++) {
                if (!state.hEdge[r][c]) continue;
                const owner = state.hOwner[r][c];
                const color = (owner === 0) ? '#ff3366' : '#33ff66';
                const x = cellX(c + 1);
                if (r < 8 && state.hEdge[r + 1][c] && state.hOwner[r + 1][c] === owner) {
                    const fy1 = cellY(r), fy2 = cellY(r + 2);
                    const pad = (fy2 - fy1) * WS;
                    const mid = cellY(r + 1);
                    drawWallBar(ctx, x, fy1 + pad, x, mid, color);
                    drawWallBar(ctx, x, mid, x, fy2 - pad, color);
                    r++;
                } else {
                    const y1 = cellY(r), y2 = cellY(r + 1);
                    const pad = (y2 - y1) * WS;
                    drawWallBar(ctx, x, y1 + pad, x, y2 - pad, color);
                }
            }
        }
        ctx.shadowBlur = 0;

        // ---- превью стены (hoverWall) — только в свой ход ----
        if (hoverWall && !state.gameOver && state.turn === myIdx) {
            const { row, col, orient } = hoverWall;
            const p = state.turn;
            if (state.players[p].walls > 0) {
                // Полная валидация через QuoridorEngine
                let valid = true;
                
                // Проверка: клетки не заняты
                if (orient === 'horizontal') {
                    if (state.vEdge[row][col] || state.vEdge[row][col + 1]) valid = false;
                } else {
                    if (state.hEdge[row][col] || state.hEdge[row + 1][col]) valid = false;
                }

                // Проверка пересечения стен (через window, т.к. мы внутри UMD-модуля)
                var Eng = (typeof window !== 'undefined' && window.QuoridorEngine) ? window.QuoridorEngine : null;
                if (valid && Eng && Eng.hasIllegalIntersection) {
                    if (Eng.hasIllegalIntersection(row, col, orient, state)) valid = false;
                }

                // Проверка блокировки путей
                if (valid && Eng && Eng.isWallValid) {
                    const testV = state.vEdge.map(rr => [...rr]);
                    const testH = state.hEdge.map(rr => [...rr]);
                    if (orient === 'horizontal') {
                        testV[row][col] = true;
                        testV[row][col + 1] = true;
                    } else {
                        testH[row][col] = true;
                        testH[row + 1][col] = true;
                    }
                    if (!Eng.isWallValid(testV, testH, state)) valid = false;
                }

                ctx.shadowBlur = valid ? 30 : 0;
                const color = valid ? 'rgba(0, 255, 200, 0.85)' : 'rgba(30, 30, 40, 0.9)';
                ctx.shadowColor = valid ? '#00ffc8' : 'rgba(0,0,0,0)';
                if (orient === 'horizontal') {
                    const x1 = cellX(col);
                    const x2 = cellX(col + 2);
                    const y = cellY(row + 1);
                    drawWallBar(ctx, x1, y, x2, y, color, 12);
                } else {
                    const y1 = cellY(row);
                    const y2 = cellY(row + 2);
                    const x = cellX(col + 1);
                    drawWallBar(ctx, x, y1, x, y2, color, 12);
                }
                ctx.shadowBlur = 0;
            }
        }

        // ---- подсказки ходов (только для текущего игрока в его ход) ----
        if (state.turn === myIdx && !state.gameOver && !(options && options.replayMode)) {
            for (const m of state.validMoves) {
                const cx = cellCenterX(m.col);
                const cy = cellCenterY(m.row);
                ctx.beginPath();
                ctx.arc(cx, cy, 14, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 200, 0.15)';
                ctx.shadowColor = '#00ffc8';
                ctx.shadowBlur = 30;
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 255, 200, 0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffc8';
                ctx.shadowBlur = 40;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // ---- фишки + индикатор стен (с обратным поворотом для игрока 1) ----
        // Рисуем овцу первой (индекс 1), затем волка (индекс 0) — чтобы волк был сверху при захвате
        for (const i of [1, 0]) {
            const p = state.players[i];
            const cx = cellCenterX(p.col);
            const cy = cellCenterY(p.row);
            const radius = PIECE_RADIUS;

            // Для игрока 1 поворачиваем фишку обратно, чтобы она была не вверх ногами
            ctx.save();
            if (myIdx === 1) {
                ctx.translate(cx, cy);
                ctx.rotate(Math.PI);
                ctx.translate(-cx, -cy);
            }

            // ---- тень фишки ----
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetY = 4;
            ctx.beginPath();
            ctx.arc(cx + 2, cy + 4, radius + 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // ---- изображение или градиент ----
            const img = playerImages && playerImages[i];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                const aspect = img.naturalWidth / img.naturalHeight;
                let drawW, drawH, dx, dy;
                if (aspect > 1) {
                    drawH = radius * 2;
                    drawW = drawH * aspect;
                    dx = cx - drawW / 2;
                    dy = cy - radius;
                } else {
                    drawW = radius * 2;
                    drawH = drawW / aspect;
                    dx = cx - radius;
                    dy = cy - drawH / 2;
                }
                ctx.drawImage(img, dx, dy, drawW, drawH);
                ctx.restore();
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.strokeStyle = COLORS[i];
                ctx.lineWidth = 3.5;
                ctx.shadowColor = COLORS[i];
                ctx.shadowBlur = 30;
                ctx.stroke();
            } else {
                const grad = ctx.createRadialGradient(cx - 6, cy - 6, 6, cx, cy, radius + 2);
                const dark = i === 0 ? '#990033' : '#006633';
                grad.addColorStop(0, COLORS[i]);
                grad.addColorStop(1, dark);
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.shadowColor = COLORS[i];
                ctx.shadowBlur = 40;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = COLORS[i];
                ctx.lineWidth = 3.5;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx - 6, cy - 7, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fill();
            }
            ctx.restore(); // завершаем обратный поворот фишки

            // ---- индикатор стен (бейдж) ----
            const badgeRadius = 14;
            // Для игрока 1 зеркально корректируем позицию бейджа,
            // чтобы он оставался визуально справа сверху от фишки
            const badgeX = (myIdx === 1) ? cx - radius * 0.7 : cx + radius * 0.7;
            const badgeY = (myIdx === 1) ? cy + radius * 0.7 : cy - radius * 0.7;

            ctx.save();
            // Обратный поворот содержимого бейджа (текст) для игрока 1
            if (myIdx === 1) {
                ctx.translate(badgeX, badgeY);
                ctx.rotate(Math.PI);
                ctx.translate(-badgeX, -badgeY);
            }

            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 2;
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#0a0a12';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = COLORS[i];
            ctx.lineWidth = 2.5;
            ctx.shadowColor = COLORS[i];
            ctx.shadowBlur = 16;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#f0f0ff';
            ctx.font = 'bold 15px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 6;
            ctx.fillText(p.walls, badgeX, badgeY + 1);
            ctx.shadowBlur = 0;
            ctx.restore(); // завершаем обратный поворот бейджа

            // ---- индикатор хода (пунктирная обводка) ----
            if (state.turn === i && !state.gameOver && !(options && options.replayMode)) {
                ctx.save();
                if (myIdx === 1) {
                    ctx.translate(cx, cy);
                    ctx.rotate(Math.PI);
                    ctx.translate(-cx, -cy);
                }
                ctx.beginPath();
                ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
                ctx.strokeStyle = COLORS[i];
                ctx.lineWidth = 2.5;
                ctx.setLineDash([4, 7]);
                ctx.shadowColor = COLORS[i];
                ctx.shadowBlur = 30;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;
                ctx.restore();
            }
        }

        // ---- оверлей победы (с обратным поворотом для игрока 1) ----
        if (state.gameOver && state.winner !== null && !(options && options.replayMode)) {
            ctx.save();
            if (myIdx === 1) {
                ctx.translate(W / 2, H / 2);
                ctx.rotate(Math.PI);
                ctx.translate(-W / 2, -H / 2);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 52px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 50;
            const name = COLOR_NAMES[state.winner];
            ctx.fillText(`🏆 ${name} won!`, W / 2, H / 2 - 6);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        ctx.restore(); // завершаем общую трансформацию поворота доски
    }

    // ---------- hit-тесты ----------
    function getBoardPos(canvas, mx, my, playerIndex) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let x = (mx - rect.left) * scaleX;
        let y = (my - rect.top) * scaleY;
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
        // Для игрока 1 (зелёный) доска повёрнута на 180°, преобразуем координаты обратно
        if (playerIndex === 1) {
            x = canvas.width - x;
            y = canvas.height - y;
        }
        return { x, y };
    }

    function findWallHit(canvas, x, y, state) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const lineY = cellY(r + 1);
                if (Math.abs(y - lineY) < HIT_THRESHOLD) {
                    const wallX1 = cellX(c);
                    const wallX2 = cellX(c + 2);
                    if (x >= wallX1 - 3 && x <= wallX2 + 3) {
                        if (!state.vEdge[r][c] && !state.vEdge[r][c + 1]) {
                            return { row: r, col: c, orient: 'horizontal' };
                        }
                    }
                }
            }
        }
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const lineX = cellX(c + 1);
                if (Math.abs(x - lineX) < HIT_THRESHOLD) {
                    const wallY1 = cellY(r);
                    const wallY2 = cellY(r + 2);
                    if (y >= wallY1 - 3 && y <= wallY2 + 3) {
                        if (!state.hEdge[r][c] && !state.hEdge[r + 1][c]) {
                            return { row: r, col: c, orient: 'vertical' };
                        }
                    }
                }
            }
        }
        return null;
    }

    function findCellHit(canvas, x, y) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cx = cellX(c);
                const cy = cellY(r);
                if (x >= cx && x <= cx + CELL_SIZE && y >= cy && y <= cy + CELL_SIZE) {
                    return { row: r, col: c };
                }
            }
        }
        return null;
    }

    return {
        render,
        getBoardPos,
        findWallHit,
        findCellHit,
        cellX, cellY, cellCenterX, cellCenterY,
        COLORS, COLOR_NAMES,
        SIZE, CANVAS_SIZE, CELL_SIZE, GAP, CORNER_RADIUS, OFFSET, WALL_THICK, HIT_THRESHOLD, PIECE_RADIUS,
    };
}))