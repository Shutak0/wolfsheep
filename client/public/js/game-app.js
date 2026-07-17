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
    var downloadVidBtn = document.getElementById('downloadVidBtn');
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
            downloadVidBtn.style.display = 'inline-block';
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

    var currentZoom = null; // {level, row, col} — текущий зум для render()

    function render() {
        var opt = { playerIndex: myIndex != null ? myIndex : 0, replayMode: replayActive };
        if (currentZoom && currentZoom.level < 9) {
            opt.zoomLevel = currentZoom.level;
            opt.zoomRow = currentZoom.row;
            opt.zoomCol = currentZoom.col;
        }
        UI.render(canvas, state, playerImages, hoverWall, opt);
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
        downloadVidBtn.style.display = 'none';
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
    downloadVidBtn.textContent = '📥 Download Video';
    var REPLAY_PHRASES = [
        "That's how I won",
        "He didn't expect that",
        "Too easy",
        "Outplayed",
        "Wall trap master",
        "Sheep escaped!",
        "No escape from the Wolf",
        "Calculated moves",
        "Unstoppable",
        "Watch this comeback",
        "EZ win",
        "Best play of the day",
        "You can't stop me",
        "Next level strategy",
        "That ending though!",
    ];

    downloadVidBtn.addEventListener('click', function () {
        if (replayActive || moveRecord.length < 1 || state.winner === null) return;

        // Скрываем кнопки на время записи
        downloadVidBtn.style.display = 'none';
        recBtn.style.display = 'none';
        playAgainBtn.style.display = 'none';
        surrenderBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        // Выбираем случайную фразу
        var randomPhrase = REPLAY_PHRASES[Math.floor(Math.random() * REPLAY_PHRASES.length)];

        // Инициализируем звуки
        ReplaySound.init();

        // Создаём вертикальный canvas (9:16 mobile формата)
        var vertW = 600, vertH = 1067; // ~9:16
        var vertCanvas = document.createElement('canvas');
        vertCanvas.width = vertW;
        vertCanvas.height = vertH;
        var vctx = vertCanvas.getContext('2d');

        // Функция отрисовки вертикального кадра
        function drawVertFrame(showCTA) {
            // Чёрный фон
            vctx.fillStyle = '#000000';
            vctx.fillRect(0, 0, vertW, vertH);

            // Игровой canvas по центру
            var boardY = Math.round((vertH - 600) / 2) + 20; // чуть ниже центра
            vctx.drawImage(canvas, 0, boardY);

            // Заголовок сверху (20% от верха)
            var titleY = Math.round(vertH * 0.18);
            vctx.fillStyle = '#ffffff';
            vctx.font = 'bold 46px "Segoe UI", sans-serif';
            vctx.textAlign = 'center';
            vctx.textBaseline = 'middle';
            vctx.shadowColor = '#c084fc';
            vctx.shadowBlur = 30;
            vctx.fillText(randomPhrase, vertW / 2, titleY);
            vctx.shadowBlur = 0;

            // CTA после игры
            if (showCTA) {
                var ctaY = boardY + 600 + 50;
                vctx.fillStyle = 'rgba(0,0,0,0.6)';
                vctx.fillRect(0, boardY + 600, vertW, vertH - boardY - 600);
                vctx.fillStyle = '#ffffff';
                vctx.font = 'bold 28px "Segoe UI", sans-serif';
                vctx.textAlign = 'center';
                vctx.textBaseline = 'middle';
                vctx.shadowColor = '#c084fc';
                vctx.shadowBlur = 20;
                vctx.fillText('Play on wolfsheep.fun', vertW / 2, boardY + 620);
                vctx.shadowBlur = 0;
            }
        }
        // Подготавливаем запись: вертикальный canvas + звук
        var canvasStream = vertCanvas.captureStream(60);
        var audioStream = ReplaySound.getAudioStream();
        var combinedStream;
        if (audioStream) {
            var audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
                var videoTrack = canvasStream.getVideoTracks()[0];
                combinedStream = new MediaStream([videoTrack, audioTrack]);
            } else {
                combinedStream = canvasStream;
            }
        } else {
            combinedStream = canvasStream;
        }

        var chunks = [];
        var recorder;
        var recOpts = { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 8000000 };
        try {
            recorder = new MediaRecorder(combinedStream, recOpts);
        } catch (e) {
            recOpts = { mimeType: 'video/webm', videoBitsPerSecond: 8000000 };
            recorder = new MediaRecorder(combinedStream, recOpts);
        }
        recorder.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = function () {
            var blob = new Blob(chunks, { type: 'video/webm' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'wolfsheep-replay.webm';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            // Восстанавливаем кнопки
            recBtn.style.display = 'inline-block';
            playAgainBtn.style.display = 'inline-block';
            resetBtn.style.display = 'inline-block';
            downloadVidBtn.style.display = 'inline-block';
            setStatus('📥 Video downloaded!', true);
        };

        recorder.start();

        // Запускаем реплей (копия логики recBtn, но с остановкой recorder в конце)
        setStatus('🎬 Recording replay...', false);

        var finalWinner = state.winner;
        var finalReason = state.winReason || 'target';
        var total = moveRecord.length;

        var movesOnly = [];
        for (var mi = 0; mi < moveRecord.length; mi++) {
            if (moveRecord[mi].type !== 'emote') movesOnly.push(moveRecord[mi]);
        }
        var zoomPlan = computeReplayZooms(movesOnly);
        currentZoom = null;

        function getReplayDelay(moves, mi) {
            var delay = 750;
            if (mi < 1) return 750;
            var p = moves[mi].player, opp = 1 - p;
            var ourMoves = 0, ourWalls = 0;
            for (var k = mi; k >= 0; k--) {
                var mk = moves[k];
                if (mk.player !== p) break;
                if (mk.type === 'move') ourMoves++;
                else if (mk.type === 'wall') ourWalls++;
            }
            var ourMixed = (ourMoves > 0 && ourWalls > 0);
            var oppMoves = 0, oppWalls = 0;
            for (var j = mi - 1; j >= 0; j--) {
                var mj = moves[j];
                if (mj.player !== opp) continue;
                for (var q = j; q >= 0; q--) {
                    var mq = moves[q];
                    if (mq.player !== opp) break;
                    if (mq.type === 'move') oppMoves++;
                    else if (mq.type === 'wall') oppWalls++;
                }
                break;
            }
            var oppMixed = (oppMoves > 0 && oppWalls > 0);
            if (!ourMixed && !oppMixed && ourMoves >= 6 && oppMoves >= 6) delay = 150;
            else if (!ourMixed && !oppMixed && ourWalls >= 2 && oppWalls >= 2) delay = 700;
            else if (!ourMixed && !oppMixed && ourMoves >= 2 && oppMoves >= 2) delay = 300;
            else delay = 750;

            // С 8-го хода задержки ×1.5
            if (mi >= 7) delay = Math.round(delay * 1.5);
            return delay;
        }

        var replayState = Engine.initState(tc);
        replayState.gameOver = false;
        state = replayState;
        var idx = 0;
        var soundIdx = 0;
        replayActive = true;
        render();
        drawVertFrame(false);

        function playNextStepForRec() {
            if (idx >= moveRecord.length) {
                replayActive = false;
                replayState.gameOver = true;
                replayState.winner = finalWinner;
                replayState.winReason = finalReason;
            state = replayState;
            render();
            drawVertFrame(true);

            // Захват 1+ секунды финального кадра с надписью
            setTimeout(function () {
                recorder.stop();
            }, 1200);
                return;
            }

            var move = moveRecord[idx];

            if (move.type === 'emote') {
                playEmoteAnim(move.emoteId, move.fromPlayer);
                idx++;
                replayTimer = setTimeout(playNextStepForRec, 500);
                return;
            }

            Engine.applyAction(replayState, move);
            var winPlayer = isWinningMove(move, replayState);
            if (winPlayer !== null) {
                replayState.gameOver = true;
                replayState.winner = winPlayer;
                replayState.winReason = 'target';
                finalWinner = winPlayer;
            } else {
                Engine.endTurn(replayState);
                replayState.gameOver = false;
            }

            // ---- ЗВУК ДО РЕНДЕРА (на 100ms раньше хода) ----
            if (myIndex !== null) {
                var snd = ReplaySound.getSoundForMove(move, soundIdx, movesOnly, myIndex, finalWinner);
                if (snd) ReplaySound.play(snd);
            }

            if (zoomPlan.length > soundIdx) currentZoom = zoomPlan[soundIdx];
            soundIdx++;

            state = replayState;
            // Небольшая задержка рендера чтобы звук опережал видео
            setTimeout(function () {
                render();
                drawVertFrame(false);
            }, 120);
            idx++;

            var delay = getReplayDelay(movesOnly, soundIdx - 1);
            replayTimer = setTimeout(playNextStepForRec, delay);
        }

        replayTimer = setTimeout(playNextStepForRec, 500);
    });

    // ---- ZOOM PLAN: предвычисление уровней зума для каждого хода реплея ----
    function computeReplayZooms(movesOnly) {
        var N = movesOnly.length;
        if (N === 0) return [];

        // Хелпер: bounding box действий в массиве ходов
        function bboxOf(moves) {
            var rMin = 9, rMax = -1, cMin = 9, cMax = -1;
            var hasWall = false;
            for (var j = 0; j < moves.length; j++) {
                var m = moves[j];
                if (m.type === 'move') {
                    rMin = Math.min(rMin, m.row); rMax = Math.max(rMax, m.row);
                    cMin = Math.min(cMin, m.col); cMax = Math.max(cMax, m.col);
                } else if (m.type === 'wall') {
                    hasWall = true;
                    rMin = Math.min(rMin, m.row, m.row + 1);
                    rMax = Math.max(rMax, m.row, m.row + 1);
                    cMin = Math.min(cMin, m.col, m.col + 1);
                    cMax = Math.max(cMax, m.col, m.col + 1);
                }
            }
            // fit в 6×6
            var fits = (rMax - rMin < 6 && cMax - cMin < 6 && rMin <= rMax && cMin <= cMax);
            return { fits: fits, hasWall: hasWall, rMin: rMin, rMax: rMax, cMin: cMin, cMax: cMax };
        }

        var plan = [];
        var consecutiveInZone = 0;
        var lockedRow = null, lockedCol = null; // фиксированный угол зума
        var zoomCooldown = 0; // перерыв между зумами (2 хода)

        for (var i = 0; i < N; i++) {
            // lookahead: текущий + 2 следующих
            var lookahead = movesOnly.slice(i, i + 3);
            var cur = bboxOf(lookahead);

            // lookahead для следующего хода (i+1..i+3) — нужен для проверки выхода и серии 5+
            var nextLookahead = (i + 1 < N) ? movesOnly.slice(i + 1, i + 4) : [];
            var nxt = nextLookahead.length > 0 ? bboxOf(nextLookahead) : { fits: false };

            var hasNext = (i + 1 < N);
            // Выход: следующий lookahead не помещается в 6×6
            var willExit = hasNext && !nxt.fits;

            var entry = { level: 9, row: 0, col: 0 };

            // Уменьшаем cooldown
            if (zoomCooldown > 0) zoomCooldown--;

            // Зум только если lookahead подтверждает ≥3 хода в зоне, прошло ≥2 ходов, есть стена, и cooldown=0
            if (i >= 2 && zoomCooldown <= 0 && cur.fits && cur.hasWall && !willExit && lookahead.length >= 3) {
                if (consecutiveInZone === 0) {
                    // Фиксируем угол по первому ходу серии
                    var bboxCenterR = (cur.rMin + cur.rMax) / 2;
                    var bboxCenterC = (cur.cMin + cur.cMax) / 2;
                    lockedRow = Math.max(0, Math.min(1, Math.round(bboxCenterR - 4))); // для 8×8: 9-8=1
                    lockedCol = Math.max(0, Math.min(1, Math.round(bboxCenterC - 4)));
                }
                consecutiveInZone++;

                // Только 8×8, без 7×7
                entry.level = 8;
                entry.row = lockedRow;
                entry.col = lockedCol;
            } else {
                // Сброс: действие не в зоне или следующий ход выходит
                if (consecutiveInZone > 0) {
                    zoomCooldown = 2; // перерыв 2 хода после серии зума
                }
                consecutiveInZone = 0;
                lockedRow = null;
                lockedCol = null;
            }

            plan.push(entry);
        }

        return plan;
    }

    recBtn.addEventListener('click', function () {
        if (replayActive) return;
        if (moveRecord.length < 1) return;
        replayActive = true;
        recBtn.style.display = 'none';
        playAgainBtn.style.display = 'none';
        surrenderBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        // Инициализируем звуки реплея
        ReplaySound.init();

        var finalWinner = state.winner;
        var finalReason = state.winReason || 'target';
        var total = moveRecord.length;

        // Отфильтрованный массив без emotes — для правил звуков
        var movesOnly = [];
        for (var mi = 0; mi < moveRecord.length; mi++) {
            if (moveRecord[mi].type !== 'emote') movesOnly.push(moveRecord[mi]);
        }

        // Предвычисляем zoom-план
        var zoomPlan = computeReplayZooms(movesOnly);
        currentZoom = null;

        // Функция расчёта задержки между ходами реплея
        function getReplayDelay(moves, mi) {
            if (mi < 1) return 500; // первый ход — стандартная задержка

            var p = moves[mi].player;
            var opp = 1 - p;

            // Считаем подряд идущие действия текущего игрока (начиная с хода mi)
            var ourMoves = 0, ourWalls = 0;
            for (var k = mi; k >= 0; k--) {
                var mk = moves[k];
                if (mk.player !== p) break;
                if (mk.type === 'move') ourMoves++;
                else if (mk.type === 'wall') ourWalls++;
                // если оба типа встречаются — mixed
            }
            var ourMixed = (ourMoves > 0 && ourWalls > 0);

            // Считаем подряд идущие действия оппонента (начиная с его последнего хода перед mi)
            var oppMoves = 0, oppWalls = 0;
            for (var j = mi - 1; j >= 0; j--) {
                var mj = moves[j];
                if (mj.player !== opp) continue; // ищем первый ход оппонента
                // Считаем его серию
                for (var q = j; q >= 0; q--) {
                    var mq = moves[q];
                    if (mq.player !== opp) break;
                    if (mq.type === 'move') oppMoves++;
                    else if (mq.type === 'wall') oppWalls++;
                }
                break;
            }
            var oppMixed = (oppMoves > 0 && oppWalls > 0);

            // Правила:
            // Оба ≥6 move подряд → 150ms (длинные серии)
            if (!ourMixed && !oppMixed && ourMoves >= 6 && oppMoves >= 6) return 150;
            // Оба ≥2 стен подряд → 700ms
            if (!ourMixed && !oppMixed && ourWalls >= 2 && oppWalls >= 2) return 700;
            // Оба ≥2 move подряд → 300ms
            if (!ourMixed && !oppMixed && ourMoves >= 2 && oppMoves >= 2) return 300;
            // Иначе → 750ms
            return 750;
        }

        var replayState = Engine.initState(tc);
        replayState.gameOver = false;
        state = replayState;
        var idx = 0;
        var soundIdx = 0; // счётчик ходов в movesOnly
        render();
        setStatus('⏯ Replay 0/' + total, false);

        function playNextStep() {
            if (!replayActive) return;

            if (idx >= moveRecord.length) {
                replayTimer = null;
                replayState.gameOver = true;
                replayState.winner = finalWinner;
                replayState.winReason = finalReason;
                state = replayState;
                replayActive = false;
                if (finalWinner !== null && finalWinner !== undefined) {
                    showReplayCTA();
                    startWinAnimation(function () {
                        recBtn.style.display = 'inline-block';
                        downloadVidBtn.style.display = 'inline-block';
                        playAgainBtn.style.display = 'inline-block';
                        resetBtn.style.display = 'inline-block';
                    });
                } else {
                    render();
                    setStatus('⏯ ' + __('game_draw'), true);
                    recBtn.style.display = 'inline-block';
                    downloadVidBtn.style.display = 'inline-block';
                    playAgainBtn.style.display = 'inline-block';
                    resetBtn.style.display = 'inline-block';
                }
                return;
            }

            var move = moveRecord[idx];

            if (move.type === 'emote') {
                playEmoteAnim(move.emoteId, move.fromPlayer);
                setStatus('⏯ Replay ' + (idx + 1) + '/' + total + ' 😀', false);
                idx++;
                replayTimer = setTimeout(playNextStep, 500);
                return;
            }

            Engine.applyAction(replayState, move);

            var winPlayer = isWinningMove(move, replayState);
            if (winPlayer !== null) {
                replayState.gameOver = true;
                replayState.winner = winPlayer;
                replayState.winReason = 'target';
                finalWinner = winPlayer;
            } else {
                Engine.endTurn(replayState);
                replayState.gameOver = false;
            }

            // ---- ZOOM РЕПЛЕЯ ----
            if (zoomPlan.length > soundIdx) {
                currentZoom = zoomPlan[soundIdx];
            }

            // ---- ЗВУК РЕПЛЕЯ ----
            if (myIndex !== null) {
                var soundName = ReplaySound.getSoundForMove(move, soundIdx, movesOnly, myIndex, finalWinner);
                if (soundName) ReplaySound.play(soundName);
            }
            soundIdx++;

            state = replayState;
            render();
            setStatus('⏯ Replay ' + (idx + 1) + '/' + total, false);
            idx++;

            // Задержка до следующего хода
            var delay = getReplayDelay(movesOnly, soundIdx - 1);
            replayTimer = setTimeout(playNextStep, delay);
        }

        // Запуск с небольшой начальной задержкой
        replayTimer = setTimeout(playNextStep, 500);
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