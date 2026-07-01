// auth.js — Google OAuth + Password Auth + JWT аутентификация WolfSheep
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

const DB_PATH = path.join(__dirname, '..', 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ==================== Ник-генератор (общий для ботов и новых пользователей) ====================
const BOT_PREFIXES = ['Player', 'Shadow', 'Wolf', 'Sheep', 'Raven', 'Blitz', 'Neon', 'Stryker', 'Zed', 'Kai', 'Rex', 'Max', 'Axel', 'Dash', 'Hunter'];

function generateNick() {
    const prefix = BOT_PREFIXES[Math.floor(Math.random() * BOT_PREFIXES.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return prefix + num;
}

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
        { userId: user.id, googleId: user.googleId || null },
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

// ==================== Password Auth ====================
function registerWithPassword(username, password) {
    if (!username || username.trim().length < 2) return { success: false, error: 'Логин должен быть не менее 2 символов.' };
    if (!password || password.length < 4) return { success: false, error: 'Пароль должен быть не менее 4 символов.' };

    const db = loadDb();
    const trimmed = username.trim();

    // Проверяем, не занят ли username
    const existing = db.users.find(u =>
        u.username === trimmed || u.nick === trimmed
    );
    if (existing) return { success: false, error: 'Этот логин уже занят.' };

    const hash = bcrypt.hashSync(password, 10);
    const nick = generateNick();

    const user = {
        id: db.nextId++,
        googleId: null,
        email: '',
        name: trimmed,
        picture: '',
        username: trimmed,
        password: hash,
        createdAt: new Date().toISOString(),
        rating: 1000,
        stats: { games: 0, wins: 0, losses: 0 },
        nick: nick,
    };

    db.users.push(user);
    saveDb(db);

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

function loginWithPassword(username, password) {
    if (!username || !password) return { success: false, error: 'Введите логин и пароль.' };

    const db = loadDb();
    const user = db.users.find(u =>
        u.username === username.trim() && u.password
    );
    if (!user) return { success: false, error: 'Неверный логин или пароль.' };

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return { success: false, error: 'Неверный логин или пароль.' };

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

// ==================== Google OAuth ====================
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
        user.email = email;
        user.name = name;
        user.picture = picture;
        saveDb(db);
    } else {
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
            nick: generateNick(),
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

// ==================== Статистика и ELO ====================
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

// Расчёт ELO против виртуального бота с таким же рейтингом (±16 очков)
function updateBotRating(userId, didWin) {
    const db = loadDb();
    const user = findUserById(db, userId);
    if (!user) return;
    const R = user.rating || 1000;
    const K = 32;
    // Виртуальный противник имеет такой же рейтинг → E = 0.5
    // Победитель: +16, проигравший: -16
    const score = didWin ? 1 : 0;
    const E = 0.5;
    user.rating = Math.round(R + K * (score - E));
    saveDb(db);
}

function getLeaderboard(limit) {
    const db = loadDb();
    const sorted = db.users
        .filter(u => u.stats && u.stats.games > 0)
        .sort((a, b) => (b.rating || 1000) - (a.rating || 1000))
        .slice(0, limit || 50)
        .map(u => ({ nick: u.nick || u.username, rating: u.rating || 1000, games: u.stats.games }));
    return sorted;
}

function getMyRankAndPosition(userId) {
    if (!userId) return null;
    const db = loadDb();
    const sorted = db.users
        .filter(u => u.stats && u.stats.games > 0)
        .sort((a, b) => (b.rating || 1000) - (a.rating || 1000));
    const idx = sorted.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    const user = sorted[idx];
    return {
        rank: idx + 1,
        nick: user.nick || user.username,
        rating: user.rating || 1000,
        games: user.stats.games,
    };
}

// ==================== Удаление аккаунта ====================
function deleteUser(userId) {
    const db = loadDb();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, error: 'User not found.' };
    db.users.splice(idx, 1);
    saveDb(db);
    return { success: true };
}

// ==================== Запрос на удаление (email-уведомление в консоль) ====================
function requestDeletion(userId, reason) {
    const db = loadDb();
    const user = findUserById(db, userId);
    if (!user) return { success: false, error: 'User not found.' };
    console.log('='.repeat(60));
    console.log('[ACCOUNT DELETION REQUEST]');
    console.log('User ID:', user.id);
    console.log('Nickname:', user.nick || user.username);
    console.log('Email:', user.email || 'not provided');
    console.log('Reason:', reason || 'not provided');
    console.log('Requested at:', new Date().toISOString());
    console.log('='.repeat(60));
    return { success: true, message: 'Deletion request received. We will process it within 7 days.' };
}

module.exports = {
    googleAuth,
    registerWithPassword,
    loginWithPassword,
    verifyToken,
    getProfile,
    setNick,
    updateStats,
    updateElo,
    updateBotRating,
    getLeaderboard,
    getMyRankAndPosition,
    generateNick,
    deleteUser,
    requestDeletion,
};
