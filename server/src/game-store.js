// game-store.js — файловое хранилище публичных партий
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data', 'games');
const INDEX_FILE = path.join(__dirname, '..', 'data', 'games-index.json');
const MAX_INDEX = 100;

// Убедимся что директория существует
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadIndex() {
    try {
        if (fs.existsSync(INDEX_FILE)) {
            return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
    return [];
}

function saveIndex(idx) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2), 'utf-8');
}

function generateGameId() {
    return crypto.randomBytes(5).toString('hex'); // 10 символов
}

/**
 * Сохраняет партию. Возвращает gameId или null.
 * Сохраняются только партии, завершившиеся победой (winReason === 'target').
 */
function saveGame(data) {
    const { players, winner, winReason, timeControl, moves, winnerName } = data;
    const gameId = data.gameId;
    const gameData = {
        id: gameId,
        createdAt: new Date().toISOString(),
        timeControl: timeControl || '1+5',
        players: players || [],
        winner: winner,
        winReason: winReason,
        winnerName: winnerName || 'Unknown',
        moves: moves.map(m => {
            if (m.type === 'wall') return { type: m.type, player: m.player, row: m.row, col: m.col, orient: m.orient };
            if (m.type === 'move') return { type: m.type, player: m.player, row: m.row, col: m.col };
            return null;
        }).filter(Boolean),
        totalMoves: moves.filter(m => m.type === 'move' || m.type === 'wall').length
    };

    const filePath = path.join(DATA_DIR, `${gameId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2), 'utf-8');

    // Обновляем индекс
    const idx = loadIndex();
    idx.unshift({
        id: gameId,
        createdAt: gameData.createdAt,
        timeControl: gameData.timeControl,
        players: gameData.players.map(p => ({ name: p.name, userId: p.userId })),
        winnerName: gameData.winnerName,
        totalMoves: gameData.totalMoves
    });
    if (idx.length > MAX_INDEX) idx.length = MAX_INDEX;
    saveIndex(idx);

    return gameId;
}

/** Загружает полную партию по gameId */
function loadGame(gameId) {
    const filePath = path.join(DATA_DIR, `${gameId}.json`);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

/** Возвращает массив последних N партий (только метаданные) */
function getRecentGames(limit = 20) {
    return loadIndex().slice(0, limit);
}

/** Возвращает все партии, возможна сортировка */
function getAllGames(sort = 'date') {
    const idx = loadIndex();
    // Подгружаем totalMoves из файлов, если в индексе нет
    const enriched = idx.map(function(entry) {
        if (entry.totalMoves !== undefined) return entry;
        const game = loadGame(entry.id);
        return game ? { ...entry, totalMoves: game.totalMoves || 0 } : { ...entry, totalMoves: 0 };
    });
    switch (sort) {
        case 'moves-desc': enriched.sort(function(a, b) { return (b.totalMoves || 0) - (a.totalMoves || 0); }); break;
        case 'moves-asc': enriched.sort(function(a, b) { return (a.totalMoves || 0) - (b.totalMoves || 0); }); break;
        default: break; // date — уже отсортировано (новые первые)
    }
    return enriched;
}

module.exports = { saveGame, loadGame, getRecentGames, getAllGames, generateGameId };
