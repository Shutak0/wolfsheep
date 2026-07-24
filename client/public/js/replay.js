// replay.js — публичный просмотр реплея
(function () {
    var pathParts = window.location.pathname.split('/');
    var gameId = pathParts[pathParts.length - 1];
    if (!gameId || gameId === 'replay') { document.body.innerHTML = '<div style="color:#ff3366;text-align:center;padding:40px;">Game not found</div>'; return; }

    var canvas = document.getElementById('board');
    var turnBadge = document.getElementById('turn-badge');
    var statusMsg = document.getElementById('status-msg');
    var recBtn = document.getElementById('recBtn');
    var downloadVidBtn = document.getElementById('downloadVidBtn');
    var backBtn = document.getElementById('backBtn');
    var myName = document.getElementById('my-name'), opName = document.getElementById('op-name');
    var myWalls = document.getElementById('my-walls'), opWalls = document.getElementById('op-walls');
    var tcBadge = document.getElementById('tc-badge');
    var myDot = document.getElementById('my-dot'), opDot = document.getElementById('op-dot');

    var Engine = window.QuoridorEngine, UI = window.QuoridorUI;
    var REPLAY_PHRASES = ["Classic match","Epic duel","Watch this game!","Replay time!","Wolf vs Sheep"];
    var gameData = null, state = null, replayTimer = null, replayActive = false;
    var moveRecord = [], playerImages = [null, null];

    function preloadImages() {
        var wolfImg = new Image(); wolfImg.onload = function () { playerImages[0] = wolfImg; render(); }; wolfImg.src = '/imgs/Wolf.png';
        var sheepImg = new Image(); sheepImg.onload = function () { playerImages[1] = sheepImg; render(); }; sheepImg.src = '/imgs/Sheep.png';
    }

    function formatTime(ms) { if (ms < 0) ms = 0; var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0'); }

    function updateUI() {
        if (!state) return;
        myWalls.textContent = state.players[0].walls;
        opWalls.textContent = state.players[1].walls;
        var lastMove = !replayActive && gameData && gameData.moves.length > 0;
        if (!replayActive && gameData && gameData.winner !== null && gameData.winner !== undefined) {
            turnBadge.textContent = '🏆 ' + (gameData.winner === 0 ? 'Red' : 'Green') + ' won!';
        } else {
            var idx = moveRecord.filter(function (m) { return m.type === 'move' || m.type === 'wall'; }).length;
            turnBadge.textContent = '⬤ Move ' + idx + '/' + gameData.moves.length;
        }
    }

    function render() {
        UI.render(canvas, state, playerImages, null, { playerIndex: 0, replayMode: true });
        updateUI();
    }

    function getReplayDelay(moves, mi) {
        var baseDelay, isMoveSeries = false;
        if (mi < 1) { baseDelay = 333; } else {
            var p = moves[mi].player, opp = 1 - p;
            var ourMoves = 0, ourWalls = 0;
            for (var k = mi; k >= 0; k--) { var mk = moves[k]; if (mk.player !== p) break; if (mk.type === 'move') ourMoves++; else if (mk.type === 'wall') ourWalls++; }
            var ourMixed = (ourMoves > 0 && ourWalls > 0);
            var oppMoves = 0, oppWalls = 0;
            for (var j = mi - 1; j >= 0; j--) { var mj = moves[j]; if (mj.player !== opp) continue; for (var q = j; q >= 0; q--) { var mq = moves[q]; if (mq.player !== opp) break; if (mq.type === 'move') oppMoves++; else if (mq.type === 'wall') oppWalls++; } break; }
            var oppMixed = (oppMoves > 0 && oppWalls > 0);
            if (!ourMixed && !oppMixed && ourMoves >= 6 && oppMoves >= 6) { baseDelay = 100; isMoveSeries = true; } else if (!ourMixed && !oppMixed && ourWalls >= 2 && oppWalls >= 2) baseDelay = 467; else if (!ourMixed && !oppMixed && ourMoves >= 2 && oppMoves >= 2) { baseDelay = 200; isMoveSeries = true; } else baseDelay = 500;
        }
        var mult; if (mi < 6) mult = 2.2; else if (isMoveSeries) mult = 2.0; else mult = 1.5;
        return Math.round(baseDelay / mult);
    }

    function playReplay() {
        if (!gameData || !gameData.moves || gameData.moves.length === 0) return;
        if (replayActive) return;
        replayActive = true;
        recBtn.textContent = '⏸ Playing...';
        recBtn.disabled = true;
        var tc = Engine.TIME_PRESETS[gameData.timeControl] || Engine.TIME_PRESETS['1+5'];
        var replayState = Engine.initState(tc);
        replayState.gameOver = false;
        state = replayState;
        moveRecord = [];
        var total = gameData.moves.length;
        render();
        statusMsg.textContent = '⏯ Replay 0/' + total;

        var idx = 0, movesOnly = gameData.moves.filter(function (m) { return m.type === 'move' || m.type === 'wall'; });
        function playNextStep() {
            if (idx >= gameData.moves.length) {
                replayActive = false;
                replayState.gameOver = true;
                replayState.winner = gameData.winner;
                state = replayState;
                render();
                statusMsg.textContent = '✅ Replay finished';
                recBtn.textContent = '▶️ Play Replay';
                recBtn.disabled = false;
                return;
            }
            var move = gameData.moves[idx];
            Engine.applyAction(replayState, move);
            Engine.endTurn(replayState);
            moveRecord.push(move);
            state = replayState;
            render();
            statusMsg.textContent = '⏯ Replay ' + (idx + 1) + '/' + total;
            idx++;
            var soundIdx = idx > 0 ? idx - 1 : 0;
            var delay = getReplayDelay(movesOnly, Math.min(soundIdx, movesOnly.length - 1));
            replayTimer = setTimeout(playNextStep, delay);
        }
        replayTimer = setTimeout(playNextStep, 500);
    }

    recBtn.addEventListener('click', playReplay);

    downloadVidBtn.addEventListener('click', function () {
        if (!gameData || replayActive) return;
        setStatus('🎬 Exporting video...', false);
        var vertCanvas = document.createElement('canvas');
        vertCanvas.width = 600; vertCanvas.height = 1067;
        var randomPhrase = REPLAY_PHRASES[Math.floor(Math.random() * REPLAY_PHRASES.length)];
        VideoExport.exportMP4({
            canvas: canvas, vertCanvas: vertCanvas,
            moveRecord: gameData.moves,
            engine: Engine, ui: UI,
            tc: Engine.TIME_PRESETS[gameData.timeControl] || Engine.TIME_PRESETS['1+5'],
            myIndex: 0, finalWinner: gameData.winner, finalReason: 'target',
            randomPhrase: randomPhrase,
            speedMultiplier: 1,
            onProgress: function (phase, detail) {
                if (phase === 'render') setStatus('🎬 Rendering...');
                else if (phase === 'encode') setStatus('🎬 Encoding...');
                else if (phase === 'error') setStatus('❌ ' + detail, true);
            },
            onDone: function (blob) {
                if (!blob) { setStatus('⚠ Export failed', true); return; }
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a'); a.href = url; a.download = 'wolfsheep-replay.mp4';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setStatus('📥 MP4 downloaded!', true);
            }
        });
    });

    backBtn.addEventListener('click', function () { window.location.href = '/'; });

    function setStatus(msg, isWin) { statusMsg.textContent = msg; statusMsg.className = isWin ? 'win' : ''; }

    // Load game data from API
    fetch('/api/games/' + gameId)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.game) {
                document.getElementById('main-content').innerHTML = '<div style="color:#ff3366;text-align:center;padding:40px;">Game not found or expired</div>';
                return;
            }
            gameData = data.game;
            // Setup UI
            var p0 = gameData.players[0] || { name: 'Red', color: 'red' };
            var p1 = gameData.players[1] || { name: 'Green', color: 'green' };
            myName.textContent = p0.name || 'Red';
            opName.textContent = p1.name || 'Green';
            tcBadge.textContent = gameData.timeControl || '1+5';
            myWalls.textContent = '10';
            opWalls.textContent = '10';

            if (p0.color === 'red' || p0.color === 'green') {
                myDot.className = 'dot ' + (p0.color === 'red' ? 'p1' : 'p2');
                opDot.className = 'dot ' + (p1.color === 'red' ? 'p1' : 'p2');
            }

            // Init state
            var tc = Engine.TIME_PRESETS[gameData.timeControl] || Engine.TIME_PRESETS['1+5'];
            state = Engine.initState(tc);
            render();
            statusMsg.textContent = '▶️ Click Play Replay to start (' + gameData.totalMoves + ' moves)';
            preloadImages();
        })
        .catch(function () {
            document.getElementById('main-content').innerHTML = '<div style="color:#ff3366;text-align:center;padding:40px;">Failed to load game</div>';
        });
})();