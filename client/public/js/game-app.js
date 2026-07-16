// game-app.js — игровая страница WolfSheep
(function () {
    var __ = window.__ || function(k){return k;};
    var canvas = document.getElementById('board');
    var turnBadge = document.getElementById('turn-badge');
    var statusMsg = document.getElementById('status-msg');
    var resetBtn = document.getElementById('resetBtn');
    var surrenderBtn = document.getElementById('surrenderBtn');
    var waitingOverlay = document.getElementById('waiting-overlay');
    var waitRoomId = document.getElementById('wait-room-id');
    var tcBadge = document.getElementById('tc-badge');
    var myBlock = document.getElementById('my-block'), opBlock = document.getElementById('op-block');
    var playAgainBtn = document.getElementById('playAgainBtn'), recBtn = document.getElementById('recBtn');
    var myDot = document.getElementById('my-dot'), opDot = document.getElementById('op-dot');
    var myName = document.getElementById('my-name'), opName = document.getElementById('op-name');
    var myElo = document.getElementById('my-elo'), opElo = document.getElementById('op-elo');
    var myWalls = document.getElementById('my-walls'), opWalls = document.getElementById('op-walls');
    var myTimeEl = document.getElementById('my-time'), opTimeEl = document.getElementById('op-time');
    var myTimeText = document.getElementById('my-time-text'), opTimeText = document.getElementById('op-time-text');

    var Engine = window.QuoridorEngine, UI = window.QuoridorUI;
    var isChallengeRoom = false;
    var rematchReady = false;
    var state = null, playerImages = [null, null], hoverWall = null;
    var moveRecord = [], prevState = null, pendingState = null, replayTimer = null, replayActive = false;
    var winAnimTimer = null, winStartTime = 0;
    var network = new QuoridorNetwork();
    var myIndex = null, gameStarted = false;
    var DOT_CLASSES = ['p1', 'p2'];
    var emoteCooldown = 0;
    var wallMode = null; // null=off, 'horizontal' or 'vertical' — mobile wall placement toggle

    // Определяет, видна ли мобильная панель стен (т.е. экран ≤900px)
    function isMobile() {
        var bar = document.getElementById('wall-mode-bar');
        if (!bar) return false;
        return window.getComputedStyle(bar).display !== 'none';
    }

    function preloadDefaultImages() {
        var wolfImg = new Image();
        wolfImg.onload = function () { playerImages[0] = wolfImg; render(); };
        wolfImg.src = '/imgs/Wolf.png';
        var sheepImg = new Image();
        sheepImg.onload = function () { playerImages[1] = sheepImg; render(); };
        sheepImg.src = '/imgs/Sheep.png';
    }

    var tcName = sessionStorage.getItem('ws_tc') || '1+5';
    var playerName = sessionStorage.getItem('ws_name') || 'Player';
    var playerColor = sessionStorage.getItem('ws_color') || 'auto';
    var userId = sessionStorage.getItem('ws_userId') ? parseInt(sessionStorage.getItem('ws_userId')) : null;
    var tc = Engine.TIME_PRESETS[tcName] || Engine.TIME_PRESETS['1+5'];
    state = Engine.initState(tc);
    tcBadge.textContent = tcName;

    function formatTime(ms) { if (ms < 0) ms = 0; var s = Math.ceil(ms / 1000); return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0'); }

    function updateTimeDisplay() {
        if (!state || myIndex === null) return;
        var mt = state.players[myIndex].timeLeft, ot = state.players[1 - myIndex].timeLeft;
        myTimeText.textContent = formatTime(mt); opTimeText.textContent = formatTime(ot);
        [myTimeEl, opTimeEl].forEach(function(e){e.classList.remove('warning','danger');});
        if (mt <= 10000) myTimeEl.classList.add('danger'); else if (mt <= 20000) myTimeEl.classList.add('warning');
        if (ot <= 10000) opTimeEl.classList.add('danger'); else if (ot <= 20000) opTimeEl.classList.add('warning');
        myTimeEl.style.borderColor = state.turn === myIndex ? (mt<=10000?'#ff3366':mt<=20000?'#ffaa00':'#c084fc') : '#2a1a5a';
        opTimeEl.style.borderColor = state.turn === (1-myIndex) ? (ot<=10000?'#ff3366':ot<=20000?'#ffaa00':'#c084fc') : '#2a1a5a';
    }

    function updateUI() {
        if (!state || myIndex === null) return;
        if (myIndex === 0) { myWalls.textContent = state.players[0].walls; opWalls.textContent = state.players[1].walls; }
        else { myWalls.textContent = state.players[1].walls; opWalls.textContent = state.players[0].walls; }
        myBlock.classList.toggle('active', state.turn === myIndex && !state.gameOver && gameStarted);
        opBlock.classList.toggle('active', state.turn === (1-myIndex) && !state.gameOver && gameStarted);
        if (state.gameOver) {
            var rt = getReason(state.winReason);
            if (state.winner !== null && state.winner !== undefined) {
                turnBadge.textContent = '🏆 ' + UI.COLOR_NAMES[state.winner] + ' ' + __('game_win_target');
                if (rt) turnBadge.textContent = '🏆 ' + UI.COLOR_NAMES[state.winner] + ' ' + __('game_win_target') + ' ' + rt;
            } else {
                turnBadge.textContent = '🤝 ' + __('game_draw') + (rt ? ' ' + rt : '');
            }
            surrenderBtn.style.display = 'none';
            recBtn.style.display = 'inline-block';
            playAgainBtn.style.display = 'inline-block';
        } else {
            turnBadge.textContent = '⬤ ' + UI.COLOR_NAMES[state.turn] + '\'s turn';
            turnBadge.style.color = UI.COLORS[state.turn]; turnBadge.style.textShadow = '0 0 20px ' + UI.COLORS[state.turn];
        }
        updateTimeDisplay();
    }

    function diffMove(oldS, newS) {
        if (!oldS || !newS) return null;
        var ow = (oldS.walls && Array.isArray(oldS.walls)) ? oldS.walls.length : 0;
        var nw = (newS.walls && Array.isArray(newS.walls)) ? newS.walls.length : 0;
        // Проверяем стену ПЕРВОЙ — стена не меняет позиции игроков
        if (nw > ow) {
            var w = newS.walls[nw - 1];
            console.log('[diffMove] Wall:', w.row, w.col, w.orient, 'player:', oldS.turn, 'oldWalls:', ow, 'newWalls:', nw);
            return { type: 'wall', player: oldS.turn, row: w.row, col: w.col, orient: w.orient };
        }
        for (var p = 0; p < 2; p++) {
            if (oldS.players[p].row !== newS.players[p].row || oldS.players[p].col !== newS.players[p].col) {
                console.log('[diffMove] Move: p' + p + ' from ' + oldS.players[p].row + ',' + oldS.players[p].col + ' to ' + newS.players[p].row + ',' + newS.players[p].col + ' player:' + oldS.turn);
                return { type: 'move', player: oldS.turn, row: newS.players[p].row, col: newS.players[p].col };
            }
        }
        console.log('[diffMove] No diff found');
        return null;
    }

    function getReason(r) {
        switch(r){
            case 'timeout': return __('game_win_timeout');
            case 'surrender': return __('game_win_surrender');
            case 'disconnect': return __('game_win_disconnect');
            case 'repetition': return __('game_draw_repetition');
            default: return '';
        }
    }

    function render() {
        UI.render(canvas, state, playerImages, hoverWall, { playerIndex: myIndex != null ? myIndex : 0, replayMode: replayActive });
        updateUI();
    }

    function setStatus(msg, isWin) { statusMsg.textContent = msg; statusMsg.className = isWin ? 'win' : ''; }

    function showReplayCTA() {
        var boardWrapper = document.getElementById('board-wrapper');
        var overlay = document.getElementById('replay-cta');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'replay-cta';
            overlay.className = 'replay-cta-overlay';
            overlay.innerHTML = '<div class="replay-cta-text">Play on wolfsheep.fun</div>';
            boardWrapper.appendChild(overlay);
        }
        overlay.classList.remove('show');
        void overlay.offsetWidth;
        overlay.classList.add('show');
    }

    function startWinAnimation(onDone) {
        if (winAnimTimer) clearInterval(winAnimTimer);
        state._winTime = 0;
        winStartTime = Date.now();
        winAnimTimer = setInterval(function () {
            if (!state.gameOver) { clearInterval(winAnimTimer); winAnimTimer = null; if (onDone) onDone(); return; }
            var elapsed = Date.now() - winStartTime;
            state._winTime = elapsed;
            render();
            if (elapsed >= 1200) {
                clearInterval(winAnimTimer);
                winAnimTimer = null;
                state._winTime = 9999; // флаг «анимация завершена», рисуем финальный цвет
                render();
                if (onDone) onDone();
            }
        }, 30);
    }

    function isWinningMove(move, rs) {
        if (move.type !== 'move') return null;
        if (move.player === 0 && move.row === rs.players[1].row && move.col === rs.players[1].col) return 0;
        if (move.player === 1 && move.row === 8) return 1;
        return null;
    }

    // ---- Обработчики сети ----
    network.onRoomCreated = function (d) {
        waitingOverlay.classList.add('show');
        waitRoomId.textContent = 'ID: ' + d.roomId;
        setStatus(__('game_room_created'), false);
    };
    network.onRoomJoined = function (d) {
        setStatus(__('game_joined'), false);
        // При challenge-подключении скрываем waiting overlay сразу (не ждём game_started)
        waitingOverlay.classList.remove('show');
    };
    network.onPlayerAssigned = function (d) {
        myIndex = d.playerIndex;
        isChallengeRoom = !!d.isChallenge;
        rematchReady = false;
        // gameStarted сбрасывается в onGameStarted — не здесь, чтобы избежать гонки событий
        // при неактивной вкладке (game_started мог прийти раньше player_assigned)
        // Сбрасываем кнопку Play Again
        playAgainBtn.textContent = '🔄 ' + __('play_again');
        playAgainBtn.disabled = false;
        playAgainBtn.style.background = '';
        playAgainBtn.style.color = '';
        surrenderBtn.style.display = 'inline-block';
        surrenderBtn.disabled = false;
        recBtn.style.display = 'none';
        playAgainBtn.style.display = 'none';
        var mc = d.color === 'red' ? 0 : 1, oc = 1 - mc;
        updateNamesAndElo(d);
        myDot.className = 'dot ' + DOT_CLASSES[mc]; opDot.className = 'dot ' + DOT_CLASSES[oc];
        var myAnimal = d.color === 'red' ? 'Wolf' : 'Sheep', opAnimal = d.color === 'red' ? 'Sheep' : 'Wolf';
        myDot.innerHTML = '<img src="/imgs/' + myAnimal + '.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        opDot.innerHTML = '<img src="/imgs/' + opAnimal + '.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        if (d.timeControl) { tcBadge.textContent = d.timeControl; }
        // Сбрасываем запись ходов при старте новой игры
        moveRecord = [];
        prevState = null;
        pendingState = null;
    };
    network.onGameStarted = function () {
        // Защита от гонки событий: если myIndex ещё не назначен, игнорируем
        // (сервер пошлёт player_assigned до следующего game_started)
        if (myIndex === null) return;
        gameStarted = true;
        // Если был получен game_state до старта — используем его как начальную точку
        if (pendingState) {
            prevState = pendingState;
            pendingState = null;
        }
        waitingOverlay.classList.remove('show'); setStatus(__('game_started'), false); hoverWall = null; render();
    };
    network.onGameState = function (newState) {
        if (replayActive) return;
        // До старта игры — накапливаем состояния (бот мог сходить первым)
        if (!gameStarted) {
            // Записываем ход относительно pendingState
            if (pendingState) {
                var pm = diffMove(pendingState, newState);
                if (pm) moveRecord.push(pm);
            }
            pendingState = Engine.deepClone(newState);
            state = newState;
            render();
            return;
        }
        // Первый вызов после game_started без prevState — используем pendingState
        if (!prevState) {
            if (pendingState) {
                prevState = pendingState;
                pendingState = null;
            } else {
                prevState = Engine.deepClone(newState);
            }
            state = newState;
            render();
            return;
        }
        // Записываем ход (включая победные)
        var m = diffMove(prevState, newState);
        if (m) moveRecord.push(m);
        state = newState;
        prevState = Engine.deepClone(newState);
        if (newState.gameOver && newState.winner !== null && newState.winner !== undefined) {
            startWinAnimation();
        }
        render();
    };
    network.onGameOver = function (data) {
        state.gameOver = true; state.winner = data.winner; state.winReason = data.winReason || 'target';
        if (state.winner !== null && state.winner !== undefined) startWinAnimation();
        render();
        setStatus('🏆 ' + data.winnerName + ' ' + __('game_win_target') + ' ' + getReason(state.winReason), true);
    };
    network.onError = function (msg) { setStatus(__('game_error') + msg, false); };
    network.onOpponentDisconnected = function () { setStatus(__('game_opponent_left'), true); state.gameOver = true; render(); };
    network.onEmote = function (d) {
        if (!replayActive) moveRecord.push({ type: 'emote', emoteId: d.emoteId, fromPlayer: d.fromPlayer });
        playEmoteAnim(d.emoteId, d.fromPlayer);
    };
    network.onRematchReady = function (d) {
        if (d.playerIndex !== myIndex) {
            setStatus('🔄 Opponent wants a rematch!', false);
            if (!rematchReady) {
                playAgainBtn.textContent = '🔄 Accept Rematch';
                playAgainBtn.style.background = '#33ff66';
                playAgainBtn.style.color = '#0a0a1a';
            }
        }
        if (d.playersReady >= 2) {
            setStatus('⚡ Rematch starting!', false);
        }
    };

    // ---- Кнопки ----
    surrenderBtn.addEventListener('click', function () { if (gameStarted && !state.gameOver) network.surrender(); });
    surrenderBtn.textContent = __('game_surrender');
    resetBtn.textContent = __('game_leave');
    resetBtn.addEventListener('click', function () {
        if (replayTimer) clearInterval(replayTimer);
        if (winAnimTimer) clearInterval(winAnimTimer);
        replayActive = false;
        window.location.href = '/';
    });
    playAgainBtn.textContent = '🔄 ' + __('play_again');
    playAgainBtn.addEventListener('click', function () {
        if (isChallengeRoom && !rematchReady) {
            rematchReady = true;
            playAgainBtn.textContent = '⏳ Waiting for opponent…';
            playAgainBtn.disabled = true;
            network.requestRematch();
        } else {
            window.location.reload();
        }
    });
    recBtn.textContent = '▶️ Replay';

    recBtn.addEventListener('click', function () {
        if (replayActive) return;
        if (moveRecord.length < 1) return;
        replayActive = true;
        recBtn.style.display = 'none';
        playAgainBtn.style.display = 'none';
        surrenderBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        var finalWinner = state.winner;
        var finalReason = state.winReason || 'target';
        var total = moveRecord.length;

        var replayState = Engine.initState(tc);
        replayState.gameOver = false;
        state = replayState;
        var idx = 0;
        render();
        setStatus('⏯ Replay 0/' + total, false);

        replayTimer = setInterval(function () {
            if (!replayActive) { clearInterval(replayTimer); return; }

            if (idx >= moveRecord.length) {
                clearInterval(replayTimer);
                replayTimer = null;
                replayState.gameOver = true;
                replayState.winner = finalWinner;
                replayState.winReason = finalReason;
                state = replayState;
                replayActive = false; // replay завершён — показываем финал
                if (finalWinner !== null && finalWinner !== undefined) {
                    showReplayCTA();
                    startWinAnimation(function () {
                        recBtn.style.display = 'inline-block';
                        playAgainBtn.style.display = 'inline-block';
                        resetBtn.style.display = 'inline-block';
                    });
                } else {
                    render();
                    setStatus('⏯ ' + __('game_draw'), true);
                    recBtn.style.display = 'inline-block';
                    playAgainBtn.style.display = 'inline-block';
                    resetBtn.style.display = 'inline-block';
                }
                return;
            }

            var move = moveRecord[idx];

            if (move.type === 'emote') {
                // Проигрываем анимацию смайлика без изменения состояния доски
                playEmoteAnim(move.emoteId, move.fromPlayer);
                setStatus('⏯ Replay ' + (idx + 1) + '/' + total + ' 😀', false);
                idx++;
                return;
            }

            Engine.applyAction(replayState, move);

            // Детект победного хода сразу после applyAction
            var winPlayer = isWinningMove(move, replayState);
            if (winPlayer !== null) {
                replayState.gameOver = true;
                replayState.winner = winPlayer;
                replayState.winReason = 'target';
                // НЕ вызываем endTurn — оставляем финальное состояние
            } else {
                Engine.endTurn(replayState);
                replayState.gameOver = false;
            }

            state = replayState;
            render();
            setStatus('⏯ Replay ' + (idx + 1) + '/' + total, false);
            idx++;
        }, 2000);
    });

    document.querySelector('.wait-text').textContent = __('game_searching');

    // ---- Emotes ----
    var emoteWrapper = document.getElementById('emote-toggle-wrapper');
    var emoteToggleBtn = document.getElementById('emote-toggle-btn');
    var emoteFlyout = document.getElementById('emote-flyout');
    var emoteBackdrop = document.getElementById('emote-backdrop');
    var boardWrapper = document.getElementById('board-wrapper');
    var emoteBtns = emoteFlyout.querySelectorAll('.emote-btn');
    var flyoutOpen = false;

    function toggleFlyout(show) {
        flyoutOpen = typeof show === 'boolean' ? show : !flyoutOpen;
        if (flyoutOpen) {
            emoteFlyout.classList.add('open');
            emoteToggleBtn.classList.add('active');
            emoteBackdrop.classList.add('show');
        } else {
            emoteFlyout.classList.remove('open');
            emoteToggleBtn.classList.remove('active');
            emoteBackdrop.classList.remove('show');
        }
    }

    emoteToggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFlyout();
    });

    // Close flyout when clicking backdrop
    emoteBackdrop.addEventListener('click', function (e) {
        toggleFlyout(false);
    });

    // Close flyout when clicking outside
    document.addEventListener('click', function (e) {
        if (flyoutOpen && !emoteWrapper.contains(e.target)) {
            toggleFlyout(false);
        }
    });

    function playEmoteAnim(emoteId, fromPlayer) {
        if (!state || myIndex === null) return;
        var pp = state.players[fromPlayer];
        if (!pp) return;
        var pieceX = UI.cellCenterX(pp.col), pieceY = UI.cellCenterY(pp.row);
        // Конвертируем canvas-координаты в координаты относительно #board-wrapper
        var canvasRect = canvas.getBoundingClientRect();
        var wrapperRect = boardWrapper.getBoundingClientRect();
        var scaleX = canvasRect.width / canvas.width, scaleY = canvasRect.height / canvas.height;
        // Корректировка с учётом поворота доски для player 1
        var sx = pieceX, sy = pieceY;
        if (myIndex === 1) {
            sx = canvas.width - pieceX;
            sy = canvas.height - pieceY;
        }
        // Позиция относительно board-wrapper (компенсируем scroll через разницу rect'ов)
        var relX = (canvasRect.left - wrapperRect.left) + sx * scaleX;
        var relY = (canvasRect.top - wrapperRect.top) + sy * scaleY;
        // Смещение слева-сверху от фишки
        var offsetX = -38 * scaleX, offsetY = -38 * scaleY;
        var emoteEl = document.createElement('img');
        emoteEl.src = '/emotes/emote-' + emoteId + '.webp';
        emoteEl.className = 'emote-anim';
        emoteEl.style.left = (relX + offsetX) + 'px';
        emoteEl.style.top = (relY + offsetY) + 'px';
        boardWrapper.appendChild(emoteEl);
        emoteEl.addEventListener('animationend', function () {
            if (emoteEl.parentNode) emoteEl.parentNode.removeChild(emoteEl);
        });
    }

    function sendEmote(emoteId) {
        if (!gameStarted || !state || state.gameOver) return;
        var now = Date.now();
        if (now < emoteCooldown) return;
        emoteCooldown = now + 2000; // 2s cooldown
        toggleFlyout(false);
        network.sendEmote(emoteId);
        // Локальная анимация от своего игрока
        if (myIndex !== null) playEmoteAnim(emoteId, myIndex);
        // Визуальный фидбек — disable кнопок на 2s
        emoteBtns.forEach(function (b) { b.disabled = true; });
        emoteToggleBtn.disabled = true;
        setTimeout(function () {
            emoteBtns.forEach(function (b) { b.disabled = false; });
            emoteToggleBtn.disabled = false;
        }, 2000);
    }

    emoteBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = parseInt(btn.getAttribute('data-emote'));
            if (id) sendEmote(id);
        });
    });

    function handleCanvasClick(e) {
        if (replayActive || !gameStarted || state.gameOver || myIndex !== state.turn) return;
        var pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) return;

        // Если выбран режим стены (wallMode), ищем только линию стены
        if (wallMode) {
            var wh = UI.findWallHit(canvas, pos.x, pos.y, state);
            if (wh) {
                // Отправляем стену с нужной ориентацией, игнорируя hit-ориентацию
                network.sendMove({ type: 'wall', row: wh.row, col: wh.col, orient: wallMode });
                // Сбрасываем wallMode после размещения
                setWallMode(null);
            }
            // Если промахнулись мимо линии — просто сбрасываем режим
            return;
        }

        // Обычный режим:
        // На десктопе — можно ставить стену кликом по линии
        // На мобильных — стена ТОЛЬКО через wallMode (кнопки под доской)
        if (!isMobile()) {
            var wh = UI.findWallHit(canvas, pos.x, pos.y, state);
            if (wh) { network.sendMove({ type:'wall', row:wh.row, col:wh.col, orient:wh.orient }); return; }
        }
        var cell = UI.findCellHit(canvas, pos.x, pos.y);
        if (cell) { network.sendMove({ type:'move', row:cell.row, col:cell.col }); return; }
    }

    function handleMouseMove(e) {
        if (!gameStarted) { hoverWall=null; render(); return; }
        var pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) { hoverWall=null; render(); return; }
        if (!state.gameOver && state.turn === myIndex) {
            var wh = UI.findWallHit(canvas, pos.x, pos.y, state);
            // Если включён wallMode, показываем только линии стены И ТОЛЬКО С НУЖНОЙ ОРИЕНТАЦИЕЙ
            if (wallMode && wh && wh.orient !== wallMode) {
                hoverWall = null; // Не подсвечиваем стены неправильной ориентации
            } else {
                hoverWall = wh || null;
            }
        } else {
            hoverWall = null;
        }
        render();
    }

    // ---- Mobile wall mode bar ----
    var wallBtnH = document.getElementById('wall-btn-h');
    var wallBtnV = document.getElementById('wall-btn-v');
    var wallBtnClear = document.getElementById('wall-btn-clear');

    function setWallMode(mode) {
        wallMode = mode;
        // Обновляем активный класс на кнопках
        if (wallBtnH) wallBtnH.classList.toggle('active', mode === 'horizontal');
        if (wallBtnV) wallBtnV.classList.toggle('active', mode === 'vertical');
        // Обновляем подсказку
        if (mode === 'horizontal') {
            statusMsg.textContent = '🧱 Tap a horizontal line to place wall';
            statusMsg.style.color = '#00ffff';
        } else if (mode === 'vertical') {
            statusMsg.textContent = '🧱 Tap a vertical line to place wall';
            statusMsg.style.color = '#00ffff';
        } else {
            statusMsg.textContent = 'Click cell to move, click line for wall.';
            statusMsg.style.color = '';
        }
        // Перерисовываем hover
        hoverWall = null;
        render();
    }

    if (wallBtnH) {
        wallBtnH.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!gameStarted || state.gameOver || myIndex !== state.turn) return;
            if (state.players[state.turn].walls <= 0) return;
            setWallMode(wallMode === 'horizontal' ? null : 'horizontal');
        });
    }
    if (wallBtnV) {
        wallBtnV.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!gameStarted || state.gameOver || myIndex !== state.turn) return;
            if (state.players[state.turn].walls <= 0) return;
            setWallMode(wallMode === 'vertical' ? null : 'vertical');
        });
    }
    if (wallBtnClear) {
        wallBtnClear.addEventListener('click', function (e) {
            e.stopPropagation();
            setWallMode(null);
        });
    }

    function updateNamesAndElo(d) {
        var mc = d.color === 'red' ? 0 : 1, oc = 1 - mc;
        // Свой ник
        if (d.playerName) {
            myName.innerHTML = d.playerId
                ? '<a href="/player.html?id=' + d.playerId + '" target="_blank" style="color:#c084fc;text-decoration:none;cursor:pointer;">' + d.playerName + '</a>'
                : d.playerName;
        } else { myName.textContent = UI.COLOR_NAMES[mc]; }
        // Ник оппонента
        if (d.opponentName) {
            opName.innerHTML = d.opponentId
                ? '<a href="/player.html?id=' + d.opponentId + '" target="_blank" style="color:#c084fc;text-decoration:none;cursor:pointer;">' + d.opponentName + '</a>'
                : d.opponentName;
        } else { opName.textContent = UI.COLOR_NAMES[oc]; }
        if (d.playerElo !== undefined) myElo.textContent = '🏆 ' + d.playerElo; else myElo.textContent = '';
        if (d.opponentElo !== undefined) opElo.textContent = '🏆 ' + d.opponentElo; else opElo.textContent = '';
        // Аватары тоже кликабельны
        if (d.playerId) {
            myDot.style.cursor = 'pointer';
            myDot.title = 'View profile';
            myDot.onclick = function(e) { e.stopPropagation(); window.open('/player.html?id=' + d.playerId, '_blank'); };
        }
        if (d.opponentId) {
            opDot.style.cursor = 'pointer';
            opDot.title = 'View profile';
            opDot.onclick = function(e) { e.stopPropagation(); window.open('/player.html?id=' + d.opponentId, '_blank'); };
        }
    }

    window.addEventListener('beforeunload', function () { if (gameStarted && !state.gameOver) network.disconnect(); });
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', function () { hoverWall = null; render(); });

    network.connect();
    var isBot = sessionStorage.getItem('ws_bot') === '1';
    var isChallenge = sessionStorage.getItem('ws_challenge') === '1';
    var challengeRoomId = sessionStorage.getItem('ws_room');
    // Fallback: читаем room из URL параметров (всегда есть при редиректе)
    var urlParams = new URLSearchParams(window.location.search);
    var urlRoom = urlParams.get('room');
    if (!isChallenge && urlRoom) {
        isChallenge = true;
        challengeRoomId = urlRoom;
        var urlTc = urlParams.get('tc');
        if (urlTc) { tcName = urlTc; sessionStorage.setItem('ws_tc', urlTc); }
    }
    // userId может быть в localStorage если sessionStorage пуст
    if (!userId) {
        var lsUserId = localStorage.getItem('ws_userId');
        if (lsUserId) userId = parseInt(lsUserId);
    }
    if (isChallenge && challengeRoomId) {
        sessionStorage.removeItem('ws_challenge');
        network.joinChallenge(challengeRoomId, userId || null);
    } else if (isBot) {
        network.botMatch(playerName, playerColor, tcName, userId ? parseInt(userId) : null);
    } else {
        network.autoMatch(playerName, playerColor, tcName, userId ? parseInt(userId) : null);
    }
    preloadDefaultImages();
    var labels = document.querySelectorAll('.time-label');
    if (labels[0]) labels[0].textContent = __('game_opponent');
    if (labels[1]) labels[1].textContent = __('game_you');
    setStatus(__('game_status'), false);
    turnBadge.textContent = __('game_turn');
    render();
})();