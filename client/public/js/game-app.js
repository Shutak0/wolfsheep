// game-app.js — игровая страница WolfSheep
(function () {
    var __ = window.__ || function(k){return k;};
    const canvas = document.getElementById('board');
    const turnBadge = document.getElementById('turn-badge');
    const statusMsg = document.getElementById('status-msg');
    const resetBtn = document.getElementById('resetBtn');
    const surrenderBtn = document.getElementById('surrenderBtn');
    const waitingOverlay = document.getElementById('waiting-overlay');
    const waitRoomId = document.getElementById('wait-room-id');
    const tcBadge = document.getElementById('tc-badge');

    const myBlock = document.getElementById('my-block'), opBlock = document.getElementById('op-block');
    const playAgainBtn = document.getElementById('playAgainBtn'), recBtn = document.getElementById('recBtn');
    const myDot = document.getElementById('my-dot'), opDot = document.getElementById('op-dot');
    const myName = document.getElementById('my-name'), opName = document.getElementById('op-name');
    const myElo = document.getElementById('my-elo'), opElo = document.getElementById('op-elo');
    const myWalls = document.getElementById('my-walls'), opWalls = document.getElementById('op-walls');
    const myTimeEl = document.getElementById('my-time'), opTimeEl = document.getElementById('op-time');
    const myTimeText = document.getElementById('my-time-text'), opTimeText = document.getElementById('op-time-text');

    const Engine = window.QuoridorEngine, UI = window.QuoridorUI;
    let state = null, playerImages = [null, null], hoverWall = null;
    let moveRecord = [], prevState = null, replayTimer = null, replayActive = false;
    const network = new QuoridorNetwork();
    let myIndex = null, gameStarted = false;
    const DOT_CLASSES = ['p1', 'p2'];

    function preloadDefaultImages() {
        var wolfImg = new Image();
        wolfImg.onload = function () { playerImages[0] = wolfImg; render(); };
        wolfImg.src = '/imgs/Wolf.png';
        var sheepImg = new Image();
        sheepImg.onload = function () { playerImages[1] = sheepImg; render(); };
        sheepImg.src = '/imgs/Sheep.png';
    }

    const tcName = sessionStorage.getItem('ws_tc') || '1+5';
    const playerName = sessionStorage.getItem('ws_name') || 'Player';
    const playerColor = sessionStorage.getItem('ws_color') || 'auto';
    const userId = sessionStorage.getItem('ws_userId') ? parseInt(sessionStorage.getItem('ws_userId')) : null;
    const tc = Engine.TIME_PRESETS[tcName] || Engine.TIME_PRESETS['1+5'];
    state = Engine.initState(tc);
    tcBadge.textContent = tcName;

    function formatTime(ms) { if (ms < 0) ms = 0; var s = Math.ceil(ms / 1000); return Math.floor(s/60)+':'+(s%60).toString().padStart(2,'0'); }

    function updateTimeDisplay() {
        if (!state || myIndex === null) return;
        var mt = state.players[myIndex].timeLeft, ot = state.players[1 - myIndex].timeLeft;
        myTimeText.textContent = formatTime(mt); opTimeText.textContent = formatTime(ot);
        [myTimeEl, opTimeEl].forEach(e=>e.classList.remove('warning','danger'));
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
            turnBadge.textContent = '🏆 ' + UI.COLOR_NAMES[state.winner] + ' ' + __('game_win_target');
            if (rt) turnBadge.textContent = '🏆 ' + UI.COLOR_NAMES[state.winner] + ' ' + __('game_win_target') + ' ' + rt;
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
        for (var p = 0; p < 2; p++) {
            if (oldS.players[p].row !== newS.players[p].row || oldS.players[p].col !== newS.players[p].col) {
                return { type: 'move', player: p, row: newS.players[p].row, col: newS.players[p].col };
            }
        }
        if (newS.walls.length > oldS.walls.length) {
            var w = newS.walls[newS.walls.length - 1];
            return { type: 'wall', player: oldS.turn, row: w.row, col: w.col, orient: w.orient };
        }
        return null;
    }


    function getReason(r) { switch(r){ case 'timeout':return __('game_win_timeout'); case 'surrender':return __('game_win_surrender'); case 'disconnect':return __('game_win_disconnect'); default:return ''; } }

    function render() { UI.render(canvas, state, playerImages, hoverWall, { playerIndex: myIndex != null ? myIndex : 0, replayMode: replayActive }); updateUI(); }
    function setStatus(msg, isWin) { statusMsg.textContent = msg; statusMsg.className = isWin ? 'win' : ''; }

    function handleCanvasClick(e) {
        if (replayActive || !gameStarted || state.gameOver || myIndex !== state.turn) return;
        var pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) return;
        var wh = UI.findWallHit(canvas, pos.x, pos.y, state);
        if (wh) { network.sendMove({ type:'wall', row:wh.row, col:wh.col, orient:wh.orient }); return; }
        var cell = UI.findCellHit(canvas, pos.x, pos.y);
        if (cell) { network.sendMove({ type:'move', row:cell.row, col:cell.col }); return; }
    }

    function handleMouseMove(e) {
        if (!gameStarted) { hoverWall=null; render(); return; }
        var pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) { hoverWall=null; render(); return; }
        hoverWall = (!state.gameOver && state.turn === myIndex) ? (UI.findWallHit(canvas, pos.x, pos.y, state) || null) : null;
        render();
    }

    function updateNamesAndElo(d) {
        var mc = d.color === 'red' ? 0 : 1, oc = 1 - mc;
        // Имена — из player_assigned (с сервера) или fallback
        if (d.playerName) myName.textContent = d.playerName;
        else myName.textContent = UI.COLOR_NAMES[mc];
        if (d.opponentName) opName.textContent = d.opponentName;
        else opName.textContent = UI.COLOR_NAMES[oc];
        // ELO
        if (d.playerElo !== undefined) myElo.textContent = '🏆 ' + d.playerElo;
        else myElo.textContent = '';
        if (d.opponentElo !== undefined) opElo.textContent = '🏆 ' + d.opponentElo;
        else opElo.textContent = '';
    }

    network.onRoomCreated = (d) => {
        waitingOverlay.classList.add('show');
        waitRoomId.textContent = 'ID: ' + d.roomId;
        setStatus(__('game_room_created'), false);
    };
    network.onRoomJoined = (d) => setStatus(__('game_joined'), false);
    network.onPlayerAssigned = (d) => {
        myIndex = d.playerIndex;
        var mc = d.color === 'red' ? 0 : 1, oc = 1 - mc;
        updateNamesAndElo(d);
        myDot.className = 'dot ' + DOT_CLASSES[mc]; opDot.className = 'dot ' + DOT_CLASSES[oc];
        var myAnimal = d.color === 'red' ? 'Wolf' : 'Sheep', opAnimal = d.color === 'red' ? 'Sheep' : 'Wolf';
        myDot.innerHTML = '<img src="/imgs/' + myAnimal + '.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        opDot.innerHTML = '<img src="/imgs/' + opAnimal + '.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
        if (d.timeControl) { tcBadge.textContent = d.timeControl; }
    };
    network.onGameStarted = () => { gameStarted = true; moveRecord = []; prevState = null; waitingOverlay.classList.remove('show'); setStatus(__('game_started'), false); hoverWall = null; render(); };
    network.onGameState = (newState) => {
        if (replayActive) return;
        if (prevState && !newState.gameOver) {
            var m = diffMove(prevState, newState);
            if (m) moveRecord.push(m);
        }
        state = newState;
        prevState = Engine.deepClone(newState);
        render();
    };
    network.onGameOver = (data) => { state.gameOver = true; state.winner = data.winner; state.winReason = data.winReason || 'target'; render(); setStatus('🏆 ' + data.winnerName + ' ' + __('game_win_target') + ' ' + getReason(state.winReason), true); };
    network.onError = (msg) => setStatus(__('game_error') + msg, false);
    network.onOpponentDisconnected = () => { setStatus(__('game_opponent_left'), true); state.gameOver = true; render(); };

    surrenderBtn.addEventListener('click', () => { if (gameStarted && !state.gameOver) network.surrender(); });
    surrenderBtn.textContent = __('game_surrender');
    resetBtn.textContent = __('game_leave');
    resetBtn.addEventListener('click', () => { if (replayTimer) clearInterval(replayTimer); replayActive = false; window.location.href = '/'; });
    playAgainBtn.textContent = '🔄 ' + __('play_again');
    playAgainBtn.addEventListener('click', () => { window.location.reload(); });
    recBtn.addEventListener('click', () => {
        if (replayActive) return;
        if (moveRecord.length < 2) return;
        replayActive = true;
        recBtn.style.display = 'none';
        playAgainBtn.style.display = 'none';
        surrenderBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        const total = moveRecord.length + 1;

        const replayState = Engine.initState(tc);
        replayState.gameOver = false;
        state = replayState;
        let idx = 0;
        render();
        setStatus('⏯ Replay 0/' + (total - 1), false);

        replayTimer = setInterval(() => {
            if (!replayActive) { clearInterval(replayTimer); return; }
            if (idx >= moveRecord.length) {
                clearInterval(replayTimer);
                replayTimer = null;
                replayState.gameOver = true;
                state = replayState;
                replayActive = false;
                render();
                setStatus('⏯ ' + __('game_win_target'), true);
                recBtn.style.display = 'inline-block';
                playAgainBtn.style.display = 'inline-block';
                resetBtn.style.display = 'inline-block';
                return;
            }
            Engine.applyAction(replayState, moveRecord[idx]);
            Engine.endTurn(replayState);
            replayState.gameOver = false;
            state = replayState;
            render();
            setStatus('⏯ Replay ' + (idx + 1) + '/' + (total - 1), false);
            idx++;
        }, 2000);
    });
    document.querySelector('.wait-text').textContent = __('game_searching');

    window.addEventListener('beforeunload', () => { if (gameStarted && !state.gameOver) network.disconnect(); });
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => { hoverWall = null; render(); });

    network.connect();
    var isBot = sessionStorage.getItem('ws_bot') === '1';
    if (isBot) {
        network.botMatch(playerName, playerColor, tcName, userId ? parseInt(userId) : null);
    } else {
        network.autoMatch(playerName, playerColor, tcName, userId ? parseInt(userId) : null);
    }
    preloadDefaultImages();
    document.querySelector('.time-label') && (document.querySelectorAll('.time-label')[0].textContent = __('game_opponent'));
    document.querySelectorAll('.time-label')[1] && (document.querySelectorAll('.time-label')[1].textContent = __('game_you'));
    setStatus(__('game_status'), false);
    turnBadge.textContent = __('game_turn');
    render();
})();