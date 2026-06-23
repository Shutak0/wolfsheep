// game-app.js — игровая страница WolfSheep
(function () {
    const canvas = document.getElementById('board');
    const turnBadge = document.getElementById('turn-badge');
    const statusMsg = document.getElementById('status-msg');
    const resetBtn = document.getElementById('resetBtn');
    const surrenderBtn = document.getElementById('surrenderBtn');
    const waitingOverlay = document.getElementById('waiting-overlay');
    const waitRoomId = document.getElementById('wait-room-id');
    const tcBadge = document.getElementById('tc-badge');

    const myBlock = document.getElementById('my-block'), opBlock = document.getElementById('op-block');
    const myDot = document.getElementById('my-dot'), opDot = document.getElementById('op-dot');
    const myName = document.getElementById('my-name'), opName = document.getElementById('op-name');
    const myWalls = document.getElementById('my-walls'), opWalls = document.getElementById('op-walls');
    const myTimeEl = document.getElementById('my-time'), opTimeEl = document.getElementById('op-time');
    const myTimeText = document.getElementById('my-time-text'), opTimeText = document.getElementById('op-time-text');

    const Engine = window.QuoridorEngine, UI = window.QuoridorUI;
    let state = null, playerImages = [null, null], hoverWall = null;
    const network = new QuoridorNetwork();
    let myIndex = null, gameStarted = false;
    const DOT_CLASSES = ['p1', 'p2'];

    // Параметры из sessionStorage (с главной)
    const tcName = sessionStorage.getItem('ws_tc') || '1+5';
    const playerName = sessionStorage.getItem('ws_name') || 'Игрок';
    const playerColor = sessionStorage.getItem('ws_color') || 'auto';
    const userId = sessionStorage.getItem('ws_userId') || null;
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
            turnBadge.textContent = state.winner !== null ? `🏆 ${UI.COLOR_NAMES[state.winner]} победил! ${rt}` : 'Игра окончена';
        } else {
            turnBadge.textContent = `⬤ ${UI.COLOR_NAMES[state.turn]}`;
            turnBadge.style.color = UI.COLORS[state.turn]; turnBadge.style.textShadow = `0 0 20px ${UI.COLORS[state.turn]}`;
        }
        updateTimeDisplay();
    }
    function getReason(r) { switch(r){ case 'timeout':return '(по времени)'; case 'surrender':return '(сдача)'; case 'disconnect':return '(отключение)'; default:return ''; } }

    function render() { UI.render(canvas, state, playerImages, hoverWall, { playerIndex: myIndex != null ? myIndex : 0 }); updateUI(); }
    function setStatus(msg, isWin) { statusMsg.textContent = msg; statusMsg.className = isWin ? 'win' : ''; }

    function handleCanvasClick(e) {
        if (!gameStarted || state.gameOver || myIndex !== state.turn) return;
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

    network.onRoomCreated = (d) => {
        waitingOverlay.classList.add('show');
        waitRoomId.textContent = 'ID: ' + d.roomId;
        setStatus('Комната создана! Ждём соперника...', false);
    };
    network.onRoomJoined = (d) => setStatus('Присоединились!', false);
    network.onPlayerAssigned = (d) => {
        myIndex = d.playerIndex;
        var mc = d.color === 'red' ? 0 : 1, oc = 1 - mc;
        myName.textContent = UI.COLOR_NAMES[mc]; opName.textContent = UI.COLOR_NAMES[oc];
        myDot.className = 'dot ' + DOT_CLASSES[mc]; opDot.className = 'dot ' + DOT_CLASSES[oc];
        if (d.timeControl) { tcBadge.textContent = d.timeControl; }
    };
    network.onGameStarted = () => { gameStarted = true; waitingOverlay.classList.remove('show'); setStatus('Игра началась!', false); hoverWall = null; render(); };
    network.onGameState = (newState) => { state = newState; render(); };
    network.onGameOver = (data) => { state.gameOver = true; state.winner = data.winner; state.winReason = data.winReason || 'target'; render(); setStatus(`🏆 ${data.winnerName} победил! ${getReason(state.winReason)}`, true); };
    network.onError = (msg) => setStatus('Ошибка: ' + msg, false);
    network.onOpponentDisconnected = () => { setStatus('Соперник отключился. Вы победили!', true); state.gameOver = true; render(); };

    surrenderBtn.addEventListener('click', () => { if (gameStarted && !state.gameOver && confirm('Сдаться?')) network.surrender(); });
    resetBtn.addEventListener('click', () => { window.location.href = '/'; });
    window.addEventListener('beforeunload', () => { if (gameStarted && !state.gameOver) network.disconnect(); });

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => { hoverWall = null; render(); });

    network.connect();
    network.autoMatch(playerName, playerColor, tcName, userId ? parseInt(userId) : null);
    render();
})();