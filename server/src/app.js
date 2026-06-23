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

const roomManager = new RoomManager((roomId, room) => {
    if (room && room.status === 'playing') {
        io.to(roomId).emit('game_state', room.state);
    } else if (room && room.status === 'finished') {
        io.to(roomId).emit('game_state', room.state);
        const winnerName = room.playerNames[room.winner];
        io.to(roomId).emit('game_over', { winner: room.winner, winnerName, winReason: room.state.winReason || 'timeout' });
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client/public')));

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
        socket.emit('game_started');
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

    socket.on('auto_match', ({ playerName, color, timeControl, userId }) => {
        const tc = timeControl || '1+5';
        const result = roomManager.autoMatch(socket.id, playerName, color, tc, userId || null);
        const room = roomManager.getRoom(result.roomId);
        socket.join(result.roomId);
        if (result.isNew) {
            socket.emit('room_created', { roomId: result.roomId, timeControl: tc });
            socket.emit('player_assigned', { playerIndex: 0, color: 'red', timeControl: tc });
            socket.emit('game_state', room.state);
            socket.emit('game_started');
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
            const winnerName = room.playerNames[room.winner];
            // Обновляем статистику
            if (room.userIds) {
                for (let i = 0; i < 2; i++) {
                    if (room.userIds[i]) {
                        auth.updateStats(room.userIds[i], i === room.winner);
                    }
                }
                // Обновление ELO
                if (room.userIds[0] && room.userIds[1]) {
                    const winnerId = room.userIds[room.winner];
                    const loserId = room.userIds[1 - room.winner];
                    auth.updateElo(winnerId, loserId);
                }
            }
            io.to(roomId).emit('game_over', { winner: room.winner, winnerName, winReason: room.state.winReason || 'target' });
        }
    });

    socket.on('surrender', () => {
        let roomId = null;
        for (let [id, room] of roomManager.rooms) { if (room.players.includes(socket.id)) { roomId = id; break; } }
        if (!roomId) { socket.emit('move_error', { error: 'Not in game' }); return; }
        const result = roomManager.surrender(roomId, socket.id);
        if (!result.success) { socket.emit('move_error', { error: result.error }); return; }
        const room = roomManager.getRoom(roomId);
        if (room.userIds) {
            for (let i = 0; i < 2; i++) {
                if (room.userIds[i]) {
                    auth.updateStats(room.userIds[i], i === result.winner);
                }
            }
            if (room.userIds[0] && room.userIds[1]) {
                auth.updateElo(room.userIds[result.winner], room.userIds[1 - result.winner]);
            }
        }
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
                        if (updatedRoom.userIds) {
                            for (let i = 0; i < 2; i++) {
                                if (updatedRoom.userIds[i]) {
                                    auth.updateStats(updatedRoom.userIds[i], i === updatedRoom.winner);
                                }
                            }
                            if (updatedRoom.userIds[0] && updatedRoom.userIds[1]) {
                                auth.updateElo(updatedRoom.userIds[updatedRoom.winner], updatedRoom.userIds[1 - updatedRoom.winner]);
                            }
                        }
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