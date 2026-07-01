// network.js — WolfSheep
class QuoridorNetwork {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.playerIndex = null;
        this.color = null;
        this.onGameState = null;
        this.onPlayerAssigned = null;
        this.onGameStarted = null;
        this.onGameOver = null;
        this.onError = null;
        this.onOpponentDisconnected = null;
        this.onRoomCreated = null;
        this.onRoomJoined = null;
        this.onEmote = null;
    }

    connect() { this.socket = io(); this.setupListeners(); }

    setupListeners() {
        this.socket.on('connect', () => console.log('Connected'));
        this.socket.on('room_created', (d) => { this.roomId = d.roomId; if (this.onRoomCreated) this.onRoomCreated(d); });
        this.socket.on('room_joined', (d) => { this.roomId = d.roomId; if (this.onRoomJoined) this.onRoomJoined(d); });
        this.socket.on('player_assigned', (d) => { this.playerIndex = d.playerIndex; this.color = d.color; if (this.onPlayerAssigned) this.onPlayerAssigned(d); });
        this.socket.on('game_state', (s) => { if (this.onGameState) this.onGameState(s); });
        this.socket.on('game_started', () => { if (this.onGameStarted) this.onGameStarted(); });
        this.socket.on('game_over', (d) => { if (this.onGameOver) this.onGameOver(d); });
        this.socket.on('move_error', (d) => { if (this.onError) this.onError(d.error); });
        this.socket.on('join_error', (d) => { if (this.onError) this.onError(d.error); });
        this.socket.on('opponent_disconnected', () => { if (this.onOpponentDisconnected) this.onOpponentDisconnected(); });
        this.socket.on('emote_received', (d) => { if (this.onEmote) this.onEmote(d); });
        this.socket.on('disconnect', () => console.log('Disconnected'));
    }

    createRoom(playerName, color, timeControl, userId) { this.socket.emit('create_room', { playerName, color, timeControl, userId }); }
    joinRoom(roomId, playerName, color, userId) { this.socket.emit('join_room', { roomId, playerName, color, userId }); }
    autoMatch(playerName, color, timeControl, userId) { this.socket.emit('auto_match', { playerName, color, timeControl, userId }); }
    botMatch(playerName, color, timeControl, userId) { this.socket.emit('bot_match', { playerName, color, timeControl, userId }); }
    sendMove(move) { this.socket.emit('make_move', move); }
    surrender() { this.socket.emit('surrender'); }
    sendEmote(emoteId) { this.socket.emit('send_emote', { emoteId: emoteId }); }
    disconnect() { if (this.socket) this.socket.disconnect(); }
}
