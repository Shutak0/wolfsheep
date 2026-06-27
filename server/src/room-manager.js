// room-manager.js
const Engine = require('./engine/quoridor-engine');
const BotEngine = require('./bot-engine');

class RoomManager {
    constructor(onTick) {
        this.rooms = new Map();
        this.timers = new Map();
        this.onTick = onTick || null;
    }

    createRoom(hostSocketId, playerName, colorPreference, timeControlName, userId) {
        const roomId = this.generateRoomId();
        const tc = Engine.TIME_PRESETS[timeControlName] || Engine.TIME_PRESETS['1+5'];
        const state = Engine.initState(tc);
        const room = {
            players: [hostSocketId, null],
            playerNames: [playerName, null],
            userIds: [userId || null, null],
            state: state,
            status: 'waiting',
            winner: null,
            colorPreference: [colorPreference || 'auto', null],
            socketToPlayer: new Map(),
            timeControlName: timeControlName || '1+5',
            eloApplied: false,
            isGuestRoom: !userId, // комната создана гостем
        };
        room.socketToPlayer.set(hostSocketId, 0);
        this.rooms.set(roomId, room);
        return roomId;
    }

    joinRoom(roomId, socketId, playerName, colorPreference, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Комната не найдена' };
        if (room.players[1] !== null) return { success: false, error: 'Комната уже заполнена' };
        // Гости не могут заходить в комнаты авторизованных и наоборот
        const isGuest = !userId;
        if (room.isGuestRoom !== isGuest) {
            return { success: false, error: 'Нельзя смешивать гостевые и авторизованные комнаты.' };
        }
        room.players[1] = socketId;
        room.playerNames[1] = playerName;
        room.userIds[1] = userId || null;
        room.colorPreference[1] = colorPreference || 'auto';
        room.socketToPlayer.set(socketId, 1);
        this.assignColors(room);
        room.status = 'playing';
        this.startTimer(roomId);
        return { success: true };
    }

    assignColors(room) {
        const pref0 = room.colorPreference[0] || 'auto';
        const pref1 = room.colorPreference[1] || 'auto';
        if ((pref0 === 'green' && pref1 === 'red') ||
            (pref0 === 'green' && pref1 === 'auto') ||
            (pref0 === 'auto' && pref1 === 'red')) {
            this.swapPlayers(room);
        }
        room.socketToPlayer.clear();
        for (let i = 0; i < 2; i++) { if (room.players[i] !== null) room.socketToPlayer.set(room.players[i], i); }
        const tc = Engine.TIME_PRESETS[room.timeControlName] || Engine.TIME_PRESETS['1+5'];
        room.state = Engine.initState(tc);
    }

    swapPlayers(room) {
        [room.players[0], room.players[1]] = [room.players[1], room.players[0]];
        [room.playerNames[0], room.playerNames[1]] = [room.playerNames[1], room.playerNames[0]];
        [room.userIds[0], room.userIds[1]] = [room.userIds[1], room.userIds[0]];
    }

    generateRoomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

    autoMatch(socketId, playerName, colorPreference, timeControlName, userId) {
        const targetTC = timeControlName || '1+5';
        const isGuest = !userId;
        for (let [roomId, room] of this.rooms) {
            if (room.status === 'waiting' && room.players[1] === null && room.timeControlName === targetTC) {
                // Гости матчатся только с комнатами гостей
                if (room.isGuestRoom === isGuest) {
                    const result = this.joinRoom(roomId, socketId, playerName, colorPreference, userId);
                    if (result.success) return { roomId, isNew: false };
                }
            }
        }
        const roomId = this.createRoom(socketId, playerName, colorPreference, targetTC, userId);
        return { roomId, isNew: true };
    }

    getRoom(roomId) { return this.rooms.get(roomId); }

    removePlayer(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        if (room.status === 'waiting') { this.stopTimer(roomId); this.rooms.delete(roomId); return; }
        const playerIndex = room.socketToPlayer.get(socketId);
        if (playerIndex !== undefined && playerIndex !== -1) {
            Engine.surrender(room.state, playerIndex);
            room.state.winReason = 'disconnect';
            room.status = 'finished';
            room.winner = room.state.winner;
        }
        this.stopTimer(roomId);
        setTimeout(() => this.rooms.delete(roomId), 60000);
    }

    surrender(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'playing') return { success: false, error: 'Not found' };
        const playerIndex = room.socketToPlayer.get(socketId);
        if (playerIndex === undefined) return { success: false, error: 'Not in room' };
        Engine.surrender(room.state, playerIndex);
        room.status = 'finished'; room.winner = room.state.winner;
        this.stopTimer(roomId);
        return { success: true, newState: room.state, winReason: room.state.winReason, winner: room.winner };
    }

    applyMove(roomId, socketId, move) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'playing') return { success: false, error: 'Not active' };
        const playerIndex = room.socketToPlayer.get(socketId);
        if (playerIndex === undefined || room.state.turn !== playerIndex) return { success: false, error: 'Not your turn' };
        const stateCopy = Engine.deepClone(room.state);
        let result;
        if (move.type === 'move') result = Engine.tryMove(stateCopy, move.row, move.col);
        else if (move.type === 'wall') { result = Engine.tryPlaceWall(stateCopy, move.row, move.col, move.orient); if (result.success) Engine.endTurn(stateCopy); }
        if (!result.success) return { success: false, error: result.message };
        room.state = stateCopy;
        if (room.state.gameOver) { room.status = 'finished'; room.winner = room.state.winner; this.stopTimer(roomId); }
        return { success: true, newState: room.state };
    }

    // Проверка: можно ли применить ELO. Возвращает { winnerId, loserId } или null.
    tryApplyElo(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        // Только если оба авторизованы и ELO ещё не применялось
        if (room.eloApplied) return null;
        if (!room.userIds[0] || !room.userIds[1]) return null;
        if (room.winner === null || room.winner === undefined) return null;
        room.eloApplied = true;
        return {
            winnerId: room.userIds[room.winner],
            loserId: room.userIds[1 - room.winner],
        };
    }

    startTimer(roomId) {
        this.stopTimer(roomId);
        const self = this;
        const interval = setInterval(() => {
            const room = self.rooms.get(roomId);
            if (!room || room.status !== 'playing') { self.stopTimer(roomId); return; }

            // Время тикает для текущего игрока (включая бота)
            const timedOut = Engine.tickTime(room.state, 1000);
            if (timedOut) { room.status = 'finished'; room.winner = room.state.winner; self.stopTimer(roomId); return; }

            if (self.onTick) self.onTick(roomId, room);
        }, 1000);
        this.timers.set(roomId, interval);
    }

    // ---------- бот ----------
    createBotRoom(socketId, playerName, colorPreference, timeControlName, userId) {
        const roomId = this.generateRoomId();
        const tc = Engine.TIME_PRESETS[timeControlName] || Engine.TIME_PRESETS['1+5'];
        const state = Engine.initState(tc);
        const room = {
            players: [socketId, 'bot'],
            playerNames: [playerName, '🤖 Bot'],
            userIds: [userId || null, null],
            state: state,
            status: 'waiting', // сразу начнём
            winner: null,
            colorPreference: [colorPreference || 'auto', 'auto'],
            socketToPlayer: new Map(),
            timeControlName: timeControlName || '1+5',
            eloApplied: false,
            isGuestRoom: false,
            isBotRoom: true,
        };
        room.socketToPlayer.set(socketId, 0);
        // Рандомный выбор стороны бота (50/50)
        // Если выпало — бот волк (индекс 0), игрок овца (индекс 1)
        if (Math.random() < 0.5) {
            room.players = ['bot', socketId];
            room.playerNames = ['🤖 Bot', playerName];
            room.userIds = [null, userId || null];
            room.socketToPlayer.clear();
            room.socketToPlayer.set(socketId, 1);
        }
        room.status = 'playing';
        this.rooms.set(roomId, room);
        // Запускаем таймер для бот-комнаты (тики нужны для времени игрока)
        this.startTimer(roomId);
        return roomId;
    }

    // Бот делает ход
    applyBotMove(roomId) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'playing' || !room.isBotRoom) return null;
        const botIndex = room.players[0] === 'bot' ? 0 : 1;
        if (room.state.turn !== botIndex) return null; // не ход бота
        const move = BotEngine.makeMove(room.state, botIndex);
        if (!move) return null;

        const stateCopy = Engine.deepClone(room.state);
        let result;
        if (move.type === 'move') result = Engine.tryMove(stateCopy, move.row, move.col);
        else if (move.type === 'wall') { result = Engine.tryPlaceWall(stateCopy, move.row, move.col, move.orient); if (result.success) Engine.endTurn(stateCopy); }
        if (!result.success) return null;
        room.state = stateCopy;
        if (room.state.gameOver) { room.status = 'finished'; room.winner = room.state.winner; this.stopTimer(roomId); }
        return { newState: room.state, move: move, success: true };
    }

    // Конвертировать ожидающую комнату в бот-комнату (fallback)
    convertToBotRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'waiting') return false;
        const playerName = room.playerNames[0] || 'Player';
        const userId = room.userIds[0];
        const tcName = room.timeControlName;
        const tc = Engine.TIME_PRESETS[tcName] || Engine.TIME_PRESETS['1+5'];
        const state = Engine.initState(tc);

        // Случайная сторона для бота
        const botIsWolf = Math.random() < 0.5;
        if (botIsWolf) {
            room.players = ['bot', room.players[0]];
            room.playerNames = ['🤖 Bot', playerName];
            room.userIds = [null, userId || null];
        } else {
            room.players = [room.players[0], 'bot'];
            room.playerNames = [playerName, '🤖 Bot'];
            room.userIds = [userId || null, null];
        }
        room.socketToPlayer.clear();
        const humanIdx = botIsWolf ? 1 : 0;
        room.socketToPlayer.set(room.players[humanIdx], humanIdx);
        room.state = state;
        room.status = 'playing';
        room.isBotRoom = true;
        room._botMoveCount = 0; // счётчик ходов бота для "человеческого" поведения
        this.startTimer(roomId);
        return { humanIndex: humanIdx, botIsWolf };
    }

    stopTimer(roomId) { const i = this.timers.get(roomId); if (i) { clearInterval(i); this.timers.delete(roomId); } }
}

module.exports = RoomManager;