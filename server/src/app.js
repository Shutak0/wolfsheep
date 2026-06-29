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

let roomManager;

function handleGameEnd(roomId) {
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
        if (filePath.endsWith('.html')) {
            // HTML: short cache, always revalidate
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
            res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large');
        } else if (filePath.match(/\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        } else if (filePath.endsWith('.xml')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        } else if (filePath.endsWith('.txt')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        } else if (filePath.endsWith('.json') && !filePath.includes('manifest')) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    }
};

app.use(express.static(path.join(__dirname, '../../client/public'), staticOptions));
app.use('/imgs', express.static(path.join(__dirname, '..', 'imgs'), {
    maxAge: '30d',
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
}));

// ---- .well-known routes ----
app.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, '../../client/public/.well-known/security.txt'));
});

// ---- Custom 404 handler (after all routes) ----
app.use((req, res, next) => {
    if (req.accepts('html')) {
        res.status(404);
        res.setHeader('X-Robots-Tag', 'noindex, follow');
        res.sendFile(path.join(__dirname, '../../client/public/404.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
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
        opponentName: room.playerNames[otherIndex] || colorMap[otherIndex] || 'green',
        opponentElo: room.isBotRoom ? getPlayerElo(playerId) : getPlayerElo(otherId),
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