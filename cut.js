var fs = require('fs');
var file = 'c:/Users/HP/Desktop/Wolfsheep/client/public/css/style.css';
var css = fs.readFileSync(file, 'utf8');
var idx = css.lastIndexOf('/* ---------- responsive ---------- */');
if (idx >= 0) {
  css = css.substring(0, idx).trimEnd() + '\n';
  fs.writeFileSync(file, css, 'utf8');
}

