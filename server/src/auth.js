// auth.js — система аккаунтов WolfSheep
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'db.json');

function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { users: [], nextId: 1 };
}
function saveDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function findUser(db, username) {
    return db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function register(username, password) {
    const db = loadDb();
    if (!username || username.trim().length < 2) return { success: false, error: 'Имя должно быть не менее 2 символов.' };
    if (!password || password.length < 4) return { success: false, error: 'Пароль должен быть не менее 4 символов.' };
    if (findUser(db, username)) return { success: false, error: 'Это имя уже занято.' };

    const hash = bcrypt.hashSync(password, 10);
    const user = {
        id: db.nextId++,
        username: username.trim(),
        password: hash,
        createdAt: new Date().toISOString(),
        rating: 1000,
        stats: {
            games: 0,
            wins: 0,
            losses: 0,
        },
        // nick можно задать только один раз
        nick: username.trim(),
    };
    db.users.push(user);
    saveDb(db);
    return { success: true, user: { id: user.id, username: user.username, nick: user.nick, rating: user.rating, stats: user.stats } };
    }

function login(username, password) {
    const db = loadDb();
    const user = findUser(db, username);
    if (!user) return { success: false, error: 'Пользователь не найден.' };
    if (!bcrypt.compareSync(password, user.password)) return { success: false, error: 'Неверный пароль.' };
    return { success: true, user: { id: user.id, username: user.username, nick: user.nick, stats: user.stats } };
}

// Обновить ник (только если не задан)
function setNick(userId, nick) {
    const db = loadDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'Пользователь не найден.' };
    if (user.nick !== user.username) return { success: false, error: 'Ник уже задан и не может быть изменён.' };
    if (!nick || nick.trim().length < 2) return { success: false, error: 'Ник слишком короткий.' };
    user.nick = nick.trim();
    saveDb(db);
    return { success: true, nick: user.nick };
}

// Получить профиль
function getProfile(userId) {
    const db = loadDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) return null;
    return { id: user.id, username: user.username, nick: user.nick, rating: user.rating, stats: user.stats };
}

// Обновить статистику
function updateStats(userId, didWin) {
    const db = loadDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) return;
    user.stats.games++;
    if (didWin) user.stats.wins++;
    else user.stats.losses++;
    saveDb(db);
}

// ELO (единый для всех контролей)
function updateElo(winnerId, loserId) {
    const db = loadDb();
    const winner = db.users.find(u => u.id === winnerId);
    const loser = db.users.find(u => u.id === loserId);
    if (!winner || !loser) return;

    const Ra = winner.rating || 1000;
    const Rb = loser.rating || 1000;
    const K = 32;

    const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
    const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));

    winner.rating = Math.round(Ra + K * (1 - Ea));
    loser.rating = Math.round(Rb + K * (0 - Eb));

    saveDb(db);
}

// Получить топ-N игроков по ELO
function getLeaderboard(limit) {
    const db = loadDb();
    const sorted = db.users
        .filter(u => u.stats && u.stats.games > 0)
        .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
        .slice(0, limit || 20)
        .map(u => ({ nick: u.nick || u.username, rating: u.rating || 1000, games: u.stats.games }));
    return sorted;
}

module.exports = { register, login, getProfile, setNick, updateStats, updateElo, getLeaderboard };
