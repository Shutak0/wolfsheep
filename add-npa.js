const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/HP/Desktop/Wolfsheep/client/public';
const files = [
  'index.html','game.html','login.html','replays.html','players.html',
  'profile.html','about.html','404.html','delete-account.html','player.html',
  'privacy.html','rules.html','terms.html','quoridor-online.html',
  'puzzle-game-online.html','strategy-board-game-online.html'
];

const oldTag = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4900795709684139" crossorigin="anonymous"></script>';
const newTag = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4900795709684139" data-npa="1" crossorigin="anonymous"></script>';

files.forEach(f => {
  const fp = path.join(dir, f);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('data-npa')) {
    console.log('SKIP', f);
  } else {
    c = c.replace(oldTag, newTag);
    fs.writeFileSync(fp, c, 'utf8');
    console.log('ADDED NPA', f);
  }
});
console.log('DONE');