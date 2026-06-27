const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const RoomManager = require('./room-manager');
const auth = require('./auth');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let roomManager; // объявим ниже

// Единая точка для применения статистики и ELO после завершения игры
function handleGameEnd(roomId) {
    const elo = roomManager.tryApplyStatsAndElo(roomId);
    if (elo) auth.updateElo(elo.winnerId, elo.loserId);
}

// Человеческая задержка хода бота: первые ходы быстро, потом вариативно
function getHumanDelay(moveCount) {
    if (moveCount <= 3) return 800 + Math.floor(Math.random() * 1200);       // 0.8-2.0s
    if (moveCount <= 8) return 1500 + Math.floor(Math.random() * 3500);      // 1.5-5.0s
    return 1000 + Math.floor(Math.random() * 5000);                           // 1.0-6.0s
}

roomManager = new RoomManager((roomId, room) => {
    if (room && room.status === 'playing') {
        io.to(roomId).emit('game_state', room.state);
    } else if (room && room.status === 'finished') {
        // При таймауте тоже применяем статистику и ELO (один раз)
        handleGameEnd(roomId);
        io.to(roomId).emit('game_state', room.state);
        const winnerName = room.playerNames[room.winner];
        io.to(roomId).emit('game_over', { winner: room.winner, winnerName, winReason: room.state.winReason || 'timeout' });
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client/public')));
app.use('/imgs', express.static(path.join(__dirname, '..', 'imgs')));

// ---------- REST Auth ----------
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const result = auth.register(username, password);
    res.json(result);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const result = auth.login(username, password);
    res.json(result);
});

app.get('/api/profile', (req, res) => {
    const userId = parseInt(req.query.userId);
    if (!userId) return res.json({ success: false, error: 'No userId' });
    const profile = auth.getProfile(userId);
    if (!profile) return res.json({ success: false, error: 'User not found' });
    res.json({ success: true, profile });
});

app.post('/api/profile/nick', (req, res) => {
    const { userId, nick } = req.body;
    if (!userId) return res.json({ success: false, error: 'No userId' });
    const result = auth.setNick(userId, nick);
    res.json(result);
});

app.get('/api/leaderboard', (req, res) => {
    res.json({ success: true, players: auth.getLeaderboard(10) });
});

app.get('/api/status', (req, res) => res.json({ status: 'ok' }));

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('create_room', ({ playerName, color, timeControl, userId }) => {
        const tc = timeControl || '1+5';
        const roomId = roomManager.createRoom(socket.id, playerName, color, tc, userId || null);
        socket.join(roomId);
        const room = roomManager.getRoom(roomId);
        socket.emit('room_created', { roomId, timeControl: tc });
        socket.emit('player_assigned', { playerIndex: 0, color: 'red' });
        socket.emit('game_state', room.state);
        // game_started отправляем только когда оба игрока в комнате
    });

    socket.on('join_room', ({ roomId, playerName, color, userId }) => {
        const result = roomManager.joinRoom(roomId, socket.id, playerName, color, userId || null);
        if (!result.success) { socket.emit('join_error', { error: result.error }); return; }
        socket.join(roomId);
        const room = roomManager.getRoom(roomId);
        const playerIndex = room.players.indexOf(socket.id);
        const colorMap = ['red', 'green'];
        const assignedColor = colorMap[playerIndex];
        socket.emit('room_joined', { roomId });
        socket.emit('player_assigned', { playerIndex, color: assignedColor, timeControl: room.timeControlName });
        socket.emit('game_state', room.state);
        io.to(roomId).emit('game_started');
        const otherIndex = 1 - playerIndex;
        const otherSocketId = room.players[otherIndex];
        if (otherSocketId) {
            io.to(otherSocketId).emit('player_assigned', { playerIndex: otherIndex, color: colorMap[otherIndex], timeControl: room.timeControlName });
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
        const colorMap = ['red', 'green'];
        const assignedColor = colorMap[playerIndex !== undefined ? playerIndex : 0];
        socket.emit('room_created', { roomId: roomId, timeControl: tc, isBot: true });
        socket.emit('player_assigned', { playerIndex: playerIndex !== undefined ? playerIndex : 0, color: assignedColor, timeControl: tc });
        socket.emit('game_state', room.state);
        socket.emit('game_started');
        // Если ход бота — делаем первый ход с человеческой задержкой
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
            socket.emit('player_assigned', { playerIndex: 0, color: 'red', timeControl: tc });
            socket.emit('game_state', room.state);
            // Таймер 10с: если не нашёлся соперник — незаметно подключаем бота
            const fallbackRoomId = result.roomId;
            setTimeout(() => {
                const fbRoom = roomManager.getRoom(fallbackRoomId);
                if (fbRoom && fbRoom.status === 'waiting') {
                    const conv = roomManager.convertToBotRoom(fallbackRoomId);
                    if (conv) {
                        const updated = roomManager.getRoom(fallbackRoomId);
                        const colorMap = ['red', 'green'];
                        const humanIdx = conv.humanIndex;
                        socket.emit('player_assigned', { playerIndex: humanIdx, color: colorMap[humanIdx], timeControl: tc });
                        socket.emit('game_state', updated.state);
                        socket.emit('game_started');
                        // Первый ход бота если нужно
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
            const colorMap = ['red', 'green'];
            const assignedColor = colorMap[playerIndex];
            socket.emit('room_joined', { roomId: result.roomId, timeControl: tc });
            socket.emit('player_assigned', { playerIndex, color: assignedColor, timeControl: room.timeControlName });
            socket.emit('game_state', room.state);
            io.to(result.roomId).emit('game_started');
            const otherIndex = 1 - playerIndex;
            const otherSocketId = room.players[otherIndex];
            if (otherSocketId) {
                io.to(otherSocketId).emit('player_assigned', { playerIndex: otherIndex, color: colorMap[otherIndex], timeControl: room.timeControlName });
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
        // Если это бот-комната и сейчас ход бота — делаем ход с человеческой задержкой
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WolfSheep running on http://localhost:${PORT}`));