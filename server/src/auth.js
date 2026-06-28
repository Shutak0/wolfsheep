// auth.js — Google OAuth + JWT аутентификация WolfSheep
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const DB_PATH = path.join(__dirname, '..', 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ==================== DB helpers ====================
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

function findUserByGoogleId(db, googleId) {
    return db.users.find(u => u.googleId === googleId);
}

function findUserById(db, userId) {
    return db.users.find(u => u.id === userId);
}

// ==================== JWT helpers ====================
function generateToken(user) {
    return jwt.sign(
        { userId: user.id, googleId: user.googleId },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

// ==================== Google OAuth ====================
/**
 * Проверяет Google ID-токен и возвращает данные пользователя.
 * Если пользователь с таким googleId не найден — создаёт нового.
 */
async function googleAuth(idToken) {
    if (!idToken) return { success: false, error: 'No token provided.' };

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (e) {
        return { success: false, error: 'Invalid Google token.' };
    }

    const googleId = payload.sub;
    const email = payload.email || '';
    const name = payload.name || email.split('@')[0] || 'Player';
    const picture = payload.picture || '';

    const db = loadDb();

    let user = findUserByGoogleId(db, googleId);

    if (user) {
        // Обновляем имя/аватар при каждом входе (не ник!)
        user.email = email;
        user.name = name;
        user.picture = picture;
        saveDb(db);
    } else {
        // Регистрируем нового пользователя
        user = {
            id: db.nextId++,
            googleId,
            email,
            name,
            picture,
            username: name.trim(),
            createdAt: new Date().toISOString(),
            rating: 1000,
            stats: {
                games: 0,
                wins: 0,
                losses: 0,
            },
            nick: name.trim(), // начальный ник = name, можно сменить один раз
        };
        db.users.push(user);
        saveDb(db);
    }

    const token = generateToken(user);

    return {
        success: true,
        token,
        user: {
            id: user.id,
            username: user.username,
            nick: user.nick,
            rating: user.rating,
            stats: user.stats,
            email: user.email,
            picture: user.picture,
        },
    };
}

// ==================== Профиль и ник ====================
function setNick(userId, nick) {
    const db = loadDb();
    const user = findUserById(db, userId);
    if (!user) return { success: false, error: 'Пользователь не найден.' };
    if (user.nick !== user.username) return { success: false, error: 'Ник уже задан и не может быть изменён.' };
    if (!nick || nick.trim().length < 2) return { success: false, error: 'Ник слишком короткий.' };
    user.nick = nick.trim();
    saveDb(db);
    return { success: true, nick: user.nick };
}

function getProfile(userId) {
    const db = loadDb();
    const user = findUserById(db, userId);
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        nick: user.nick,
        rating: user.rating,
        stats: user.stats,
        email: user.email,
        picture: user.picture,
    };
}

// ==================== Статистика и ELO (без изменений) ====================
function updateStats(userId, didWin) {
    const db = loadDb();
    const user = findUserById(db, userId);
    if (!user) return;
    user.stats.games++;
    if (didWin) user.stats.wins++;
    else user.stats.losses++;
    saveDb(db);
}

function updateElo(winnerId, loserId) {
    const db = loadDb();
    const winner = findUserById(db, winnerId);
    const loser = findUserById(db, loserId);
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

function getLeaderboard(limit) {
    const db = loadDb();
    const sorted = db.users
        .filter(u => u.stats && u.stats.games > 0)
        .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
        .slice(0, limit || 20)
        .map(u => ({ nick: u.nick || u.username, rating: u.rating || 1000, games: u.stats.games }));
    return sorted;
}

module.exports = {
    googleAuth,
    verifyToken,
    getProfile,
    setNick,
    updateStats,
    updateElo,
    getLeaderboard,
};

// Устаревшие методы — удалены: register, login