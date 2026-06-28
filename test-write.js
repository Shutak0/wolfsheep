var fs = require('fs');
try {
  fs.writeFileSync('c:/Users/HP/Desktop/Wolfsheep/test-out.txt', 'hello world', 'utf8');
  console.log('write OK');
} catch(e) {
  console.log('write FAIL:', e.message);
}
try {
  var content = fs.readFileSync('c:/Users/HP/Desktop/Wolfsheep/test-out.txt', 'utf8');
  console.log('read:', content);
} catch(e) {
  console.log('read FAIL:', e.message);
}
