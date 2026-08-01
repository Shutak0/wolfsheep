const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'client', 'public');

const ADSENSE_TAG = '\n    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4900795709684139" data-npa="1" crossorigin="anonymous"></script>';

const files = [
    'index.html', 'game.html', 'replays.html', 'players.html', 'profile.html',
    'about.html', '404.html', 'delete-account.html', 'login.html',
    'player.html', 'privacy.html', 'puzzle-game-online.html',
    'quoridor-online.html', 'rules.html', 'strategy-board-game-online.html',
    'terms.html'
];

files.forEach(f => {
    const filePath = path.join(PUBLIC, f);
    let content = fs.readFileSync(filePath, 'utf-8');
    // Insert before </head>
    const headCloseIdx = content.indexOf('</head>');
    if (headCloseIdx === -1) { console.log('SKIP (no </head>):', f); return; }
    // Check if already present
    if (content.includes('pagead2.googlesyndication.com')) { console.log('SKIP (already):', f); return; }
    const before = content.substring(0, headCloseIdx);
    const after = content.substring(headCloseIdx);
    const newContent = before + ADSENSE_TAG + after;
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log('ADDED:', f);
});