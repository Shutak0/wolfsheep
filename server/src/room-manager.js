// room-manager.js
const Engine = require('./engine/quoridor-engine');

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
        };
        room.socketToPlayer.set(hostSocketId, 0);
        this.rooms.set(roomId, room);
        return roomId;
    }

    joinRoom(roomId, socketId, playerName, colorPreference, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Комната не найдена' };
        if (room.players[1] !== null) return { success: false, error: 'Комната уже заполнена' };
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
        for (let [roomId, room] of this.rooms) {
            if (room.status === 'waiting' && room.players[1] === null && room.timeControlName === targetTC) {
                const result = this.joinRoom(roomId, socketId, playerName, colorPreference, userId);
                if (result.success) return { roomId, isNew: false };
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

    startTimer(roomId) {
        this.stopTimer(roomId);
        const interval = setInterval(() => {
            const room = this.rooms.get(roomId);
            if (!room || room.status !== 'playing') { this.stopTimer(roomId); return; }
            const timedOut = Engine.tickTime(room.state, 1000);
            if (timedOut) { room.status = 'finished'; room.winner = room.state.winner; this.stopTimer(roomId); }
            if (this.onTick) this.onTick(roomId, room);
        }, 1000);
        this.timers.set(roomId, interval);
    }

    stopTimer(roomId) { const i = this.timers.get(roomId); if (i) { clearInterval(i); this.timers.delete(roomId); } }
}

module.exports = RoomManager;