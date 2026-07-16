const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const RoomManager = require('./room-manager');
const auth = require('./auth');
const Engine = require('./engine/quoridor-engine');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let roomManager;

function handleGameEnd(roomId) {
    roomManager.clearBotEmote(roomId);
    const elo = roomManager.tryApplyStatsAndElo(roomId);
    if (elo) auth.updateElo(elo.winnerId, elo.loserId);
}

// Ускоренная задержка хода бота (×2 быстрее)
function getHumanDelay(moveCount) {
    if (moveCount <= 3) return 100 + Math.floor(Math.random() * 200);   // 0.1-0.3s
    if (moveCount <= 8) return 125 + Math.floor(Math.random() * 2000); // 0.125-2.125s
    return 150 + Math.floor(Math.random() * 1000);                      // 0.15-1.15s
}

roomManager = new RoomManager((roomId, room) => {
    if (room && room.status === 'playing') {
        io.to(roomId).emit('game_state', room.state);
    } else if (room && room.status === 'finished') {
        handleGameEnd(roomId);
        io.to(roomId).emit('game_state', room.state);
        const winnerName = room.playerNames[room.winner];
        io.to(roomId).emit('game_over', { winner: room.winner, winnerName, winReason: room.state.winReason || 'timeout' });
    }
});

// Callback для отправки бот-эмоций клиенту
roomManager._onBotEmote = (roomId, botIndex, emoteId) => {
    io.to(roomId).emit('emote_received', { emoteId, fromPlayer: botIndex });
};

app.use(cors());
app.use(express.json());

// ================= SECURITY & SEO HEADERS =================
app.use((req, res, next) => {
    // HSTS — force HTTPS for 2 years
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Clickjacking protection
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Static files with cache headers
const staticOptions = {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        // Service Worker — НИКОГДА не кэшировать, всегда свежий
        if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return;
        }
        if (filePath.endsWith('.html')) {
            // HTML: short cache, always revalidate
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large');
        } else if (filePath.match(/\.(js|css)$/)) {
            // JS/CSS: всегда перепроверять свежесть (max-age=0), но поддерживаем 304 Not Modified
            res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
            // Изображения: кэшировать на сутки, но разрешить перепроверку
            res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        } else if (filePath.endsWith('.xml')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        } else if (filePath.endsWith('.txt')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        } else if (filePath.endsWith('.json') && !filePath.includes('manifest')) {
            res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        }
    }
};

app.use(express.static(path.join(__dirname, '../../client/public'), staticOptions));
app.use('/imgs', express.static(path.join(__dirname, '..', 'imgs'), {
    maxAge: '7d',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=604800, must-revalidate');
    }
}));

// ---- .well-known routes ----
app.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, '../../client/public/.well-known/security.txt'));
});

function getPlayerElo(userId) {
    if (!userId) return 1000;
    const profile = auth.getProfile(userId);
    return profile ? (profile.rating || 1000) : 1000;
}

function buildPlayerAssigned(room, playerIndex) {
    const colorMap = ['red', 'green'];
    const color = colorMap[playerIndex] || 'red';
    const otherIndex = 1 - playerIndex;
    const playerId = room.userIds[playerIndex];
    const otherId = room.userIds[otherIndex];
    return {
        playerIndex,
        color,
        timeControl: room.timeControlName,
        playerName: room.playerNames[playerIndex] || color,
        playerElo: getPlayerElo(playerId),
        playerId: playerId || null,
        opponentName: room.playerNames[otherIndex] || colorMap[otherIndex] || 'green',
        opponentElo: room.isBotRoom ? getPlayerElo(playerId) : getPlayerElo(otherId),
        opponentId: room.isBotRoom ? null : (otherId || null),
        isChallenge: !!room._isChallenge,
    };
}

// ---------- JWT Auth Middleware ----------
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'No token provided.' });
    const decoded = auth.verifyToken(token);
    if (!decoded) return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    req.userId = decoded.userId;
    req.googleId = decoded.googleId;
    next();
}

// ---------- REST Auth ----------
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.json({ success: false, error: 'No idToken provided.' });
    try {
        const result = await auth.googleAuth(idToken);
        res.json(result);
    } catch (e) {
        console.error('Google auth error:', e);
        res.json({ success: false, error: 'Server error.' });
    }
});

app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Введите логин и пароль.' });
    const result = auth.registerWithPassword(username, password);
    res.json(result);
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Введите логин и пароль.' });
    const result = auth.loginWithPassword(username, password);
    res.json(result);
});

app.get('/api/profile', authMiddleware, (req, res) => {
    const profile = auth.getProfile(req.userId);
    if (!profile) return res.json({ success: false, error: 'User not found' });
    res.json({ success: true, profile });
});

app.post('/api/profile/nick', authMiddleware, (req, res) => {
    const { nick } = req.body;
    if (!nick) return res.json({ success: false, error: 'No nick provided.' });
    const result = auth.setNick(req.userId, nick);
    res.json(result);
});

app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ success: true, players: auth.getLeaderboard(limit) });
});

app.get('/api/profile/rank', authMiddleware, (req, res) => {
    const data = auth.getMyRankAndPosition(req.userId);
    if (!data) return res.json({ success: false, error: 'Not ranked yet.' });
    res.json({ success: true, ...data });
});

// Публичный профиль — доступен всем (включая неавторизованных)
app.get('/api/profile/:userId', (req, res) => {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    const profile = auth.getPublicProfile(userId);
    if (!profile) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, profile });
});

app.get('/api/status', (req, res) => res.json({ status: 'ok' }));

// ---------- Друзья ----------
app.post('/api/friend/add', authMiddleware, (req, res) => {
    const { friendId } = req.body;
    if (!friendId) return res.json({ success: false, error: 'No friendId provided.' });
    const result = auth.addFriend(req.userId, parseInt(friendId));
    res.json(result);
});

app.post('/api/friend/remove', authMiddleware, (req, res) => {
    const { friendId } = req.body;
    if (!friendId) return res.json({ success: false, error: 'No friendId provided.' });
    const result = auth.removeFriend(req.userId, parseInt(friendId));
    res.json(result);
});

app.get('/api/friends', authMiddleware, (req, res) => {
    const friends = auth.getFriends(req.userId);
    res.json({ success: true, friends });
});

// Публичный список всех игроков (доступен всем)
app.get('/api/players', (req, res) => {
    const search = req.query.search || '';
    const players = auth.getAllPlayers(search);
    res.json({ success: true, players });
});

// ---------- Socket.IO ----------
// Маппинг userId → socket.id для системы вызовов
const userSocketMap = {};
// Ожидающие вызовы: roomId → {challengerId, challengerName, accepterId, accepterName, tc}
const pendingChallenges = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Регистрация пользователя для приёма вызовов
    socket.on('register_user', ({ userId }) => {
        if (userId) {
            userSocketMap[userId] = socket.id;
            socket._registeredUserId = userId;
        }
    });

    // Вызов на бой
    socket.on('challenge_player', ({ targetUserId, timeControl, challengerName, challengerId }) => {
        if (!targetUserId || !challengerId) return;
        const targetSocketId = userSocketMap[targetUserId];
        if (!targetSocketId) {
            socket.emit('challenge_error', { errorKey: 'challenge_player_offline' });
            return;
        }
        io.to(targetSocketId).emit('challenge_received', {
            fromUserId: challengerId,
            fromName: challengerName,
            timeControl: timeControl,
        });
        socket.emit('challenge_sent', { targetUserId, timeControl });
    });

    // Ответ на вызов
    socket.on('challenge_response', ({ fromUserId, accept, timeControl, myName, myId }) => {
        const challengerSocketId = userSocketMap[fromUserId];
        if (!challengerSocketId) {
            socket.emit('challenge_error', { errorKey: 'challenge_challenger_offline' });
            return;
        }
        if (!accept) {
            io.to(challengerSocketId).emit('challenge_declined', { fromName: myName });
            return;
        }
        const tc = timeControl || '1+5';
        const roomId = roomManager.generateRoomId();
        const challengerProfile = auth.getProfile(fromUserId);
        const challengerName = (challengerProfile && challengerProfile.nick) || ('Player #' + fromUserId);
        // Сохраняем challenge данные — комната создастся при заходе на game.html
        pendingChallenges.set(roomId, {
            challengerId: fromUserId,
            challengerName: challengerName,
            accepterId: myId,
            accepterName: myName,
            tc: tc,
        });
        // Уведомляем обоих
        io.to(challengerSocketId).emit('challenge_accepted', { roomId, opponentName: myName, timeControl: tc });
        socket.emit('challenge_accepted', { roomId, opponentName: challengerName, timeControl: tc });
    });

    // Игрок зашёл на game.html по приглашению
    socket.on('join_challenge', ({ roomId, userId }) => {
        const pending = pendingChallenges.get(roomId);
        if (!pending) {
            socket.emit('join_error', { error: 'Challenge expired or not found.' });
            return;
        }
        const uid = userId;
        let playerIndex = -1;
        if (uid === pending.challengerId) playerIndex = 0;
        else if (uid === pending.accepterId) playerIndex = 1;
        if (playerIndex === -1) {
            socket.emit('join_error', { error: 'You are not part of this challenge.' });
            return;
        }
        // Ищем существующую комнату
        let room = roomManager.getRoom(roomId);
        if (!room) {
            // Создаём комнату с этим игроком как хостом
            const name = playerIndex === 0 ? pending.challengerName : pending.accepterName;
            roomManager.createRoomWithId(roomId, socket.id, name, 'auto', pending.tc, uid);
            room = roomManager.getRoom(roomId);
            room._isChallenge = true;
            room._challengerId = pending.challengerId;
            room._accepterId = pending.accepterId;
            room._challengerName = pending.challengerName;
            room._accepterName = pending.accepterName;
            socket.join(roomId);
            room._pendingPlayerIndex = playerIndex;
            room._pendingOtherReady = false;
            socket.emit('room_joined', { roomId });
            socket.emit('player_assigned', buildPlayerAssigned(room, playerIndex));
            socket.emit('game_state', room.state);
            return;
        }
        // Комната уже существует — присоединяем второго игрока
        socket.join(roomId);
        // Ставим флаг challenge на комнату
        room._isChallenge = true;
        room._challengerId = pending.challengerId;
        room._accepterId = pending.accepterId;
        room._challengerName = pending.challengerName;
        room._accepterName = pending.accepterName;
        room.players[1] = socket.id;
        room.playerNames[1] = playerIndex === 0 ? pending.challengerName : pending.accepterName;
        room.userIds[1] = uid;
        room.socketToPlayer.set(socket.id, 1);
        roomManager.assignColors(room);
        room.status = 'playing';
        roomManager.startTimer(roomId);
        socket.emit('room_joined', { roomId });
        socket.emit('player_assigned', buildPlayerAssigned(room, 1));
        socket.emit('game_state', room.state);
        // Уведомляем первого игрока
        const otherSocketId = room.players[0];
        if (otherSocketId) {
            io.to(otherSocketId).emit('player_assigned', buildPlayerAssigned(room, 0));
        }
        io.to(roomId).emit('game_started');
        io.to(roomId).emit('game_state', room.state);
        pendingChallenges.delete(roomId);
    });

    socket.on('create_room', ({ playerName, color, timeControl, userId }) => {
        const tc = timeControl || '1+5';
        const roomId = roomManager.createRoom(socket.id, playerName, color, tc, userId || null);
        socket.join(roomId);
        const room = roomManager.getRoom(roomId);
        socket.emit('room_created', { roomId, timeControl: tc });
        socket.emit('player_assigned', buildPlayerAssigned(room, 0));
        socket.emit('game_state', room.state);
    });

    socket.on('join_room', ({ roomId, playerName, color, userId }) => {
        const result = roomManager.joinRoom(roomId, socket.id, playerName, color, userId || null);
        if (!result.success) { socket.emit('join_error', { error: result.error }); return; }
        socket.join(roomId);
        const room = roomManager.getRoom(roomId);
        const playerIndex = room.players.indexOf(socket.id);
        socket.emit('room_joined', { roomId });
        socket.emit('player_assigned', buildPlayerAssigned(room, playerIndex));
        socket.emit('game_state', room.state);
        io.to(roomId).emit('game_started');
        const otherIndex = 1 - playerIndex;
        const otherSocketId = room.players[otherIndex];
        if (otherSocketId) {
            io.to(otherSocketId).emit('player_assigned', buildPlayerAssigned(room, otherIndex));
        }
        const updatedRoom = roomManager.getRoom(roomId);
        if (updatedRoom) io.to(roomId).emit('game_state', updatedRoom.state);
    });

    socket.on('bot_match', ({ playerName, color, timeControl, userId }) => {
        const tc = timeControl || '1+5';
        const roomId = roomManager.createBotRoom(socket.id, playerName, color, tc, userId || null);
        socket.join(roomId);
        const room = roomManager.getRoom(roomId);
        const playerIndex = room.socketToPlayer.get(socket.id);
        const idx = playerIndex !== undefined ? playerIndex : 0;
        socket.emit('room_created', { roomId: roomId, timeControl: tc, isBot: true });
        socket.emit('player_assigned', buildPlayerAssigned(room, idx));
        socket.emit('game_state', room.state);
        socket.emit('game_started');
        roomManager.scheduleBotEmote(roomId);
        if (room.state.turn === (room.players[0] === 'bot' ? 0 : 1)) {
            const delay = getHumanDelay(0);
            setTimeout(() => {
                const botResult = roomManager.applyBotMove(roomId);
                if (botResult && botResult.success) {
                    const r = roomManager.getRoom(roomId);
                    if (r) r._botMoveCount = (r._botMoveCount || 0) + 1;
                    io.to(roomId).emit('game_state', botResult.newState);
                }
            }, delay);
        }
    });

    socket.on('auto_match', ({ playerName, color, timeControl, userId }) => {
        const tc = timeControl || '1+5';
        const result = roomManager.autoMatch(socket.id, playerName, color, tc, userId || null);
        const room = roomManager.getRoom(result.roomId);
        socket.join(result.roomId);
        if (result.isNew) {
            socket.emit('room_created', { roomId: result.roomId, timeControl: tc });
            socket.emit('player_assigned', buildPlayerAssigned(room, 0));
            socket.emit('game_state', room.state);
            const fallbackRoomId = result.roomId;
            setTimeout(() => {
                const fbRoom = roomManager.getRoom(fallbackRoomId);
                if (fbRoom && fbRoom.status === 'waiting') {
                    const conv = roomManager.convertToBotRoom(fallbackRoomId);
                    if (conv) {
                        const updated = roomManager.getRoom(fallbackRoomId);
                        const humanIdx = conv.humanIndex;
                        socket.emit('player_assigned', buildPlayerAssigned(updated, humanIdx));
                        socket.emit('game_state', updated.state);
                        socket.emit('game_started');
                        roomManager.scheduleBotEmote(fallbackRoomId);
                        const botIdx = 1 - humanIdx;
                        if (updated.state.turn === botIdx) {
                            const delay = getHumanDelay(0);
                            setTimeout(() => {
                                const botR = roomManager.applyBotMove(fallbackRoomId);
                                if (botR && botR.success) io.to(fallbackRoomId).emit('game_state', botR.newState);
                            }, delay);
                        }
                    }
                }
            }, 10000);
        } else {
            const playerIndex = room.players.indexOf(socket.id);
            socket.emit('room_joined', { roomId: result.roomId, timeControl: tc });
            socket.emit('player_assigned', buildPlayerAssigned(room, playerIndex));
            socket.emit('game_state', room.state);
            io.to(result.roomId).emit('game_started');
            const otherIndex = 1 - playerIndex;
            const otherSocketId = room.players[otherIndex];
            if (otherSocketId) {
                io.to(otherSocketId).emit('player_assigned', buildPlayerAssigned(room, otherIndex));
            }
            const updatedRoom = roomManager.getRoom(result.roomId);
            if (updatedRoom) io.to(result.roomId).emit('game_state', updatedRoom.state);
        }
    });

    socket.on('make_move', (move) => {
        let roomId = null;
        for (let [id, room] of roomManager.rooms) { if (room.players.includes(socket.id)) { roomId = id; break; } }
        if (!roomId) { socket.emit('move_error', { error: 'Not in game' }); return; }
        const result = roomManager.applyMove(roomId, socket.id, move);
        if (!result.success) { socket.emit('move_error', { error: result.error }); return; }
        io.to(roomId).emit('game_state', result.newState);
        const room = roomManager.getRoom(roomId);
        if (room.status === 'finished') {
            handleGameEnd(roomId);
            const winnerName = room.playerNames[room.winner];
            io.to(roomId).emit('game_over', { winner: room.winner, winnerName, winReason: room.state.winReason || 'target' });
        }
        if (room && room.isBotRoom && room.status === 'playing') {
            const botIndex = room.players[0] === 'bot' ? 0 : 1;
            if (room.state.turn === botIndex) {
                const moveNum = (room._botMoveCount || 0);
                const delay = getHumanDelay(moveNum);
                setTimeout(() => {
                    const botResult = roomManager.applyBotMove(roomId);
                    if (botResult && botResult.success) {
                        const r = roomManager.getRoom(roomId);
                        if (r) r._botMoveCount = (r._botMoveCount || 0) + 1;
                        io.to(roomId).emit('game_state', botResult.newState);
                        const updatedRoom = roomManager.getRoom(roomId);
                        if (updatedRoom && updatedRoom.status === 'finished') {
                            handleGameEnd(roomId);
                            const wn = updatedRoom.playerNames[updatedRoom.winner];
                            io.to(roomId).emit('game_over', { winner: updatedRoom.winner, winnerName: wn, winReason: updatedRoom.state.winReason || 'target' });
                        }
                    }
                }, delay);
            }
        }
    });

    socket.on('send_emote', ({ emoteId }) => {
        let roomId = null;
        for (let [id, room] of roomManager.rooms) { if (room.players.includes(socket.id)) { roomId = id; break; } }
        if (!roomId) return;
        const room = roomManager.getRoom(roomId);
        if (!room || room.status !== 'playing') return;
        const playerIndex = room.socketToPlayer.get(socket.id);
        if (playerIndex === undefined) return;
        io.to(roomId).emit('emote_received', { emoteId, fromPlayer: playerIndex });
    });

    // Рематч в challenge-играх
    socket.on('request_rematch', () => {
        let roomId = null;
        for (let [id, room] of roomManager.rooms) {
            if (room.players.includes(socket.id)) { roomId = id; break; }
        }
        if (!roomId) return;
        const room = roomManager.getRoom(roomId);
        if (!room || !room._isChallenge || room.status !== 'finished') return;
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex === -1) return;
        if (!room._rematchReady) room._rematchReady = {};
        room._rematchReady[playerIndex] = true;
        io.to(roomId).emit('rematch_ready', { playerIndex, playersReady: Object.keys(room._rematchReady).length });
        // Если оба готовы — перезапускаем
        if (room._rematchReady[0] && room._rematchReady[1]) {
            const tcName = room.timeControlName || '1+5';
            const tc = Engine.TIME_PRESETS[tcName] || Engine.TIME_PRESETS['1+5'];
            room.state = Engine.initState(tc);
            room.status = 'playing';
            room.winner = null;
            room.statsApplied = false;
            room.eloApplied = false;
            delete room._rematchReady;
            roomManager.assignColors(room);
            roomManager.startTimer(roomId);
            // Сначала player_assigned (сбрасывает клиент)
            for (let i = 0; i < 2; i++) {
                if (room.players[i]) {
                    io.to(room.players[i]).emit('player_assigned', buildPlayerAssigned(room, i));
                }
            }
            // Затем game_state и game_started
            io.to(roomId).emit('game_state', room.state);
            io.to(roomId).emit('game_started');
        }
    });

    socket.on('surrender', () => {
        let roomId = null;
        for (let [id, room] of roomManager.rooms) { if (room.players.includes(socket.id)) { roomId = id; break; } }
        if (!roomId) { socket.emit('move_error', { error: 'Not in game' }); return; }
        const result = roomManager.surrender(roomId, socket.id);
        if (!result.success) { socket.emit('move_error', { error: result.error }); return; }
        const room = roomManager.getRoom(roomId);
        handleGameEnd(roomId);
        io.to(roomId).emit('game_state', result.newState);
        io.to(roomId).emit('game_over', { winner: result.winner, winnerName: room.playerNames[result.winner], winReason: result.winReason });
    });

    socket.on('disconnect', () => {
        // Убираем из маппинга вызовов
        if (socket._registeredUserId && userSocketMap[socket._registeredUserId] === socket.id) {
            delete userSocketMap[socket._registeredUserId];
        }
        // Обработка отключения из игр
        for (let [roomId, room] of roomManager.rooms) {
            if (room.players.includes(socket.id)) {
                roomManager.removePlayer(roomId, socket.id);
                const updatedRoom = roomManager.getRoom(roomId);
                if (updatedRoom) {
                    io.to(roomId).emit('game_state', updatedRoom.state);
                    if (updatedRoom.status === 'finished') {
                        handleGameEnd(roomId);
                        io.to(roomId).emit('game_over', { winner: updatedRoom.winner, winnerName: updatedRoom.playerNames[updatedRoom.winner], winReason: 'disconnect' });
                    }
                } else {
                    const otherId = room.players.find(id => id !== socket.id);
                    if (otherId) io.to(otherId).emit('opponent_disconnected');
                }
                break;
            }
        }
    });
});

// ==================== Account Deletion ====================
app.post('/api/account/request-deletion', authMiddleware, (req, res) => {
    const reason = req.body.reason || '';
    const result = auth.requestDeletion(req.userId, reason);
    res.json(result);
});

app.delete('/api/account/delete', authMiddleware, (req, res) => {
    const result = auth.deleteUser(req.userId);
    res.json(result);
});

// ---- Custom 404 handler (MUST be last, after ALL routes) ----
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404);
        res.setHeader('X-Robots-Tag', 'noindex, follow');
        res.sendFile(path.join(__dirname, '../../client/public/404.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('WolfSheep running on http://localhost:' + PORT));