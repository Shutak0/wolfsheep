// app.js
(function () {
    const canvas = document.getElementById('board');
    const turnBadge = document.getElementById('turn-badge');
    const statusMsg = document.getElementById('status-msg');
    const resetBtn = document.getElementById('resetBtn');
    const surrenderBtn = document.getElementById('surrenderBtn');
    const fileP1 = document.getElementById('imgP1');
    const fileP2 = document.getElementById('imgP2');
    const replayIndicator = document.getElementById('replay-indicator');

    // Блоки игроков в правой колонке
    const myBlock = document.getElementById('my-block');
    const opBlock = document.getElementById('op-block');
    const myDot = document.getElementById('my-dot');
    const opDot = document.getElementById('op-dot');
    const myName = document.getElementById('my-name');
    const opName = document.getElementById('op-name');
    const myWalls = document.getElementById('my-walls');
    const opWalls = document.getElementById('op-walls');
    const myTimeEl = document.getElementById('my-time');
    const opTimeEl = document.getElementById('op-time');
    const myTimeText = document.getElementById('my-time-text');
    const opTimeText = document.getElementById('op-time-text');

    const Engine = window.QuoridorEngine;
    const UI = window.QuoridorUI;

    let state = Engine.initState();
    let playerImages = [null, null]; // всегда: 0=красный, 1=зелёный
    let hoverWall = null;

    const network = new QuoridorNetwork();
    let isOnline = false;
    let myIndex = null;   // 0 или 1
    let gameStarted = false;

    // CSS-классы точек для аватарок
    const DOT_CLASSES = ['p1', 'p2']; // p1=красный, p2=зелёный

    function formatTime(ms) {
        if (ms < 0) ms = 0;
        const totalSec = Math.ceil(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    function updateTimeDisplay() {
        if (!state || !state.players || myIndex === null) return;
        const myTime = state.players[myIndex].timeLeft;
        const opTime = state.players[1 - myIndex].timeLeft;
        myTimeText.textContent = formatTime(myTime);
        opTimeText.textContent = formatTime(opTime);

        [myTimeEl, opTimeEl].forEach(el => el.classList.remove('warning', 'danger'));
        if (myTime <= 10000) myTimeEl.classList.add('danger');
        else if (myTime <= 20000) myTimeEl.classList.add('warning');
        if (opTime <= 10000) opTimeEl.classList.add('danger');
        else if (opTime <= 20000) opTimeEl.classList.add('warning');

        myTimeEl.style.borderColor = state.turn === myIndex
            ? (myTime <= 10000 ? '#ff3366' : myTime <= 20000 ? '#ffaa00' : '#c084fc') : '#2a1a5a';
        opTimeEl.style.borderColor = state.turn === (1 - myIndex)
            ? (opTime <= 10000 ? '#ff3366' : opTime <= 20000 ? '#ffaa00' : '#c084fc') : '#2a1a5a';
    }

    function updateUI() {
        if (!state || !state.players) return;
        // Обновляем стены (из логического состояния, где players[0]=красный, players[1]=зелёный)
        if (myIndex === 0) {
            myWalls.textContent = state.players[0].walls;
            opWalls.textContent = state.players[1].walls;
        } else {
            myWalls.textContent = state.players[1].walls;
            opWalls.textContent = state.players[0].walls;
        }

        // Подсветка активного блока
        myBlock.classList.toggle('active', state.turn === myIndex && !state.gameOver && gameStarted);
        opBlock.classList.toggle('active', state.turn === (1 - myIndex) && !state.gameOver && gameStarted);

        if (state.gameOver) {
            const reasonText = state.winReason ? getWinReasonText(state.winReason) : '';
            turnBadge.textContent = state.winner !== null
                ? `🏆 ${UI.COLOR_NAMES[state.winner]} победил! ${reasonText}`
                : 'Игра окончена';
        } else {
            turnBadge.textContent = `⬤ ${UI.COLOR_NAMES[state.turn]}`;
            turnBadge.style.color = UI.COLORS[state.turn];
            turnBadge.style.textShadow = `0 0 20px ${UI.COLORS[state.turn]}`;
        }
        updateTimeDisplay();
    }

    function getWinReasonText(reason) {
        switch (reason) {
            case 'timeout': return '(по времени)';
            case 'surrender': return '(сдача)';
            case 'disconnect': return '(отключение)';
            default: return '';
        }
    }

    function render() {
        UI.render(canvas, state, playerImages, hoverWall, { playerIndex: myIndex != null ? myIndex : 0 });
        updateUI();
    }

    function setStatus(msg, isWin) {
        statusMsg.textContent = msg;
        statusMsg.className = isWin ? 'win' : '';
    }

    function handleCanvasClick(e) {
        if (!isOnline || !gameStarted) { setStatus("Игра ещё не началась или вы не в сети.", false); return; }
        if (state.gameOver) { setStatus("Игра окончена.", false); return; }
        if (myIndex !== state.turn) { setStatus("Сейчас не ваш ход.", false); return; }

        const pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) return;

        const wallHit = UI.findWallHit(canvas, pos.x, pos.y, state);
        if (wallHit) { network.sendMove({ type: 'wall', row: wallHit.row, col: wallHit.col, orient: wallHit.orient }); return; }
        const cell = UI.findCellHit(canvas, pos.x, pos.y);
        if (cell) { network.sendMove({ type: 'move', row: cell.row, col: cell.col }); return; }
        setStatus("Кликните по клетке или линии.", false);
    }

    function handleMouseMove(e) {
        if (!isOnline || !gameStarted) { hoverWall = null; render(); return; }
        const pos = UI.getBoardPos(canvas, e.clientX, e.clientY, myIndex != null ? myIndex : 0);
        if (!pos) { hoverWall = null; render(); return; }
        if (!state.gameOver && state.turn === myIndex) {
            hoverWall = UI.findWallHit(canvas, pos.x, pos.y, state) || null;
        } else { hoverWall = null; }
        render();
    }

    function handleMouseLeave() { hoverWall = null; render(); }

    // Сетевые колбэки
    network.onRoomCreated = (data) => setStatus(`Комната создана! ID: ${data.roomId}. Ждём второго игрока...`, false);
    network.onRoomJoined = (data) => setStatus(`Присоединились к комнате ${data.roomId}. Ожидаем начала игры...`, false);

    network.onPlayerAssigned = (data) => {
        myIndex = data.playerIndex;
        const myColor = data.color; // 'red' или 'green'
        const opColor = myColor === 'red' ? 'green' : 'red';
        const myColorIdx = myColor === 'red' ? 0 : 1;
        const opColorIdx = 1 - myColorIdx;
        const myColorName = UI.COLOR_NAMES[myColorIdx];
        const opColorName = UI.COLOR_NAMES[opColorIdx];

        setStatus(`Вы играете за ${myColorName}`, false);

        // Обновляем имена
        myName.textContent = myColorName;
        opName.textContent = opColorName;

        // Обновляем классы точек под цвета
        myDot.className = 'dot ' + DOT_CLASSES[myColorIdx];
        opDot.className = 'dot ' + DOT_CLASSES[opColorIdx];
    };

    network.onGameStarted = () => { gameStarted = true; setStatus("Игра началась!", false); hoverWall = null; render(); };
    network.onGameState = (newState) => { state = newState; render(); };

    network.onGameOver = (data) => {
        state.gameOver = true;
        state.winner = data.winner;
        state.winReason = data.winReason || 'target';
        render();
        const reasonText = getWinReasonText(state.winReason);
        setStatus(`🏆 ${data.winnerName} победил! ${reasonText}`, true);
    };

    network.onError = (msg) => setStatus(`Ошибка: ${msg}`, false);
    network.onOpponentDisconnected = () => { setStatus("Соперник отключился. Вы победили!", true); state.gameOver = true; render(); };

    function handleSurrender() {
        if (!isOnline || !gameStarted || state.gameOver) return;
        if (!confirm('Вы уверены, что хотите сдаться?')) return;
        network.surrender();
    }

    function handleBeforeUnload() {
        if (isOnline && gameStarted && !state.gameOver) network.disconnect();
    }

    // Загрузка аватарок (0=красный, 1=зелёный — это их фиксированные индексы в движке)
    function loadImage(file, engineIndex) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                playerImages[engineIndex] = img;
                // Определяем, в какой dot элемент вставить (свой/чужой)
                const isMyColor = (myIndex !== null) && (engineIndex === myIndex);
                const dotEl = isMyColor ? myDot : opDot;
                dotEl.innerHTML = '';
                const clone = img.cloneNode();
                clone.style.width = '100%'; clone.style.height = '100%';
                clone.style.objectFit = 'cover'; clone.style.borderRadius = '50%';
                dotEl.appendChild(clone);
                render();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function resetGame() {
        if (isOnline) { location.reload(); }
        else { state = Engine.initState(); render(); setStatus("Новая игра!", false); }
    }

    // Меню
    function initMenu() {
        const menu = document.createElement('div');
        menu.id = 'menu';
        menu.style.cssText = `
            display:flex; flex-direction:column; align-items:center; gap:15px;
            background:#0d0d1a; padding:30px; border-radius:28px;
            border:1px solid #2a1a4a; box-shadow:0 0 40px rgba(138,43,226,0.3);
            max-width:400px; margin:0 auto;
        `;
        menu.innerHTML = `
            <h2 style="color:#c084fc;">Выберите режим</h2>
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                <button id="btnAuto" style="padding:10px 20px; background:#2a1a5a; color:white; border-radius:10px; border:none; cursor:pointer;">🔍 Автоподбор</button>
                <button id="btnCreate" style="padding:10px 20px; background:#2a1a5a; color:white; border-radius:10px; border:none; cursor:pointer;">➕ Создать комнату</button>
                <button id="btnJoin" style="padding:10px 20px; background:#2a1a5a; color:white; border-radius:10px; border:none; cursor:pointer;">🔗 Присоединиться</button>
            </div>
            <div id="roomInput" style="display:none; gap:10px; align-items:center; width:100%; justify-content:center;">
                <input id="roomIdInput" placeholder="ID комнаты" style="padding:8px; border-radius:10px; background:#1a1a30; color:white; border:1px solid #4a2a8a; width:150px;">
                <button id="btnJoinConfirm" style="padding:8px 16px; background:#4a2a8a; color:white; border-radius:10px; border:none; cursor:pointer;">Присоединиться</button>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <label style="color:#94a3b8;">Имя:</label>
                <input id="playerNameInput" value="Игрок" style="padding:8px; border-radius:10px; background:#1a1a30; color:white; border:1px solid #4a2a8a; width:150px;">
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <label style="color:#94a3b8;">Цвет:</label>
                <select id="colorSelect" style="padding:8px; border-radius:10px; background:#1a1a30; color:white; border:1px solid #4a2a8a;">
                    <option value="auto">Авто</option>
                    <option value="red">Красный</option>
                    <option value="green">Зелёный</option>
                </select>
            </div>
            <div style="margin-top:10px; color:#94a3b8; font-size:14px;">Время: 1 мин + 5 сек/ход</div>
        `;
        document.body.prepend(menu);
        document.getElementById('game-container').style.display = 'none';

        document.getElementById('btnAuto').onclick = () => { network.connect(); isOnline = true; network.autoMatch(getName(), getColor()); hideMenu(); };
        document.getElementById('btnCreate').onclick = () => { network.connect(); isOnline = true; network.createRoom(getName(), getColor()); hideMenu(); };
        document.getElementById('btnJoin').onclick = () => {
            const d = document.getElementById('roomInput');
            d.style.display = d.style.display === 'none' ? 'flex' : 'none';
        };
        document.getElementById('btnJoinConfirm').onclick = () => {
            const roomId = document.getElementById('roomIdInput').value.trim();
            if (!roomId) return alert('Введите ID комнаты');
            network.connect(); isOnline = true;
            network.joinRoom(roomId, getName(), getColor());
            hideMenu();
        };
    }

    function getName() { return document.getElementById('playerNameInput')?.value || 'Игрок'; }
    function getColor() { return document.getElementById('colorSelect')?.value || 'auto'; }

    function hideMenu() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('game-container').style.display = 'flex';
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    function init() {
        initMenu();
        resetBtn.addEventListener('click', resetGame);
        surrenderBtn.addEventListener('click', handleSurrender);
        fileP1.addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0], 0); });
        fileP2.addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0], 1); });
        window.addEventListener('beforeunload', handleBeforeUnload);
        state = Engine.initState();
        render();
    }

    document.addEventListener('DOMContentLoaded', init);
})();