var fs = require('fs');
var cssPath = 'c:/Users/HP/Desktop/Wolfsheep/client/public/css/style.css';
var mobilePath = 'c:/Users/HP/Desktop/Wolfsheep/mobile.css';
var css = fs.readFileSync(cssPath, 'utf8');
var mobile = fs.readFileSync(mobilePath, 'utf8');

// Find index of "/* ---------- responsive ---------- */"
var idx = css.indexOf('/* ---------- responsive ---------- */');
console.log('Found responsive at index:', idx);
if (idx >= 0) {
  css = css.substring(0, idx).trimEnd() + '\n\n' + mobile + '\n';
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('Patched!');
} else {
  console.log('Not found');
}
