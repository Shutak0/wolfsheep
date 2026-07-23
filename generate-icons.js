// Генератор PWA-иконок на чистом Node.js (zlib + buffer)
// Создаёт logo-192.png и logo-512.png в стиле WolfSheep
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuffer, typeBuffer, data, crcBuffer]);
}

function createPNG(width, height, pixelFn) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixel data with filter byte per row
  const rawRows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      const off = 1 + x * 3;
      row[off] = r;
      row[off + 1] = g;
      row[off + 2] = b;
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// ── Дизайн иконки WolfSheep ──
// Тёмный фон #12122a, градиентный свечение в центре,
// стилизованные глаза волка/овцы
function wolfSheepPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = (x - cx) / (w / 2);
  const dy = (y - cy) / (h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Базовый тёмный фон
  let r = 18, g = 18, b = 42;

  // Центральное свечение (радиальный градиент)
  const glow = Math.max(0, 1 - dist * 1.3);
  const glow2 = Math.max(0, 1 - dist * 0.7);

  // Фиолетово-красное свечение (волк)
  r += Math.floor(glow * 160 + glow2 * 60);
  g += Math.floor(glow * 30 + glow2 * 20);
  b += Math.floor(glow * 100 + glow2 * 50);

  // Левый "глаз" — волк (красный/оранжевый)
  const eyeLx = (x - cx * 0.55) / (w * 0.08);
  const eyeLy = (y - cy * 0.75) / (h * 0.08);
  const eyeLdist = Math.sqrt(eyeLx * eyeLx + eyeLy * eyeLy);
  if (eyeLdist < 1) {
    const eyeGlow = (1 - eyeLdist) * 0.9;
    r = Math.min(255, r + Math.floor(eyeGlow * 220));
    g = Math.min(255, g + Math.floor(eyeGlow * 80));
    b = Math.min(255, b + Math.floor(eyeGlow * 20));
  }

  // Правый "глаз" — овца (зелёный)
  const eyeRx = (x - cx * 1.55) / (w * 0.08);
  const eyeRy = (y - cy * 0.75) / (h * 0.08);
  const eyeRdist = Math.sqrt(eyeRx * eyeRx + eyeRy * eyeRy);
  if (eyeRdist < 1) {
    const eyeGlow = (1 - eyeRdist) * 0.9;
    r = Math.min(255, r + Math.floor(eyeGlow * 30));
    g = Math.min(255, g + Math.floor(eyeGlow * 220));
    b = Math.min(255, b + Math.floor(eyeGlow * 60));
  }

  // Тонкая граница по краю
  const border = Math.max(0, 1 - Math.abs(dist - 0.97) * 20);
  r += Math.floor(border * 40);
  g += Math.floor(border * 20);
  b += Math.floor(border * 50);

  return [
    Math.min(255, Math.max(0, Math.floor(r))),
    Math.min(255, Math.max(0, Math.floor(g))),
    Math.min(255, Math.max(0, Math.floor(b)))
  ];
}

// Генерируем
const sizes = [192, 512];
const outDir = path.join(__dirname, 'client', 'public', 'imgs');

// Убедимся что папка существует
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

sizes.forEach(size => {
  const png = createPNG(size, size, wolfSheepPixel);
  const filePath = path.join(outDir, `logo-${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${png.length} bytes)`);
});

console.log('Done!');