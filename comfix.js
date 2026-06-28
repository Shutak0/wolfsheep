var fs = require('fs');
var f = 'c:/Users/HP/Desktop/Wolfsheep/client/public/css/style.css';
var c = fs.readFileSync(f, 'utf8');
// Remove the /* [OLD/DISABLED] block entirely (everything from that line to end)
var idx = c.indexOf('/* [OLD/DISABLED]');
if (idx >= 0) {
  c = c.substring(0, idx).trimEnd() + '\n';
  fs.writeFileSync(f, c, 'utf8');
}
