const sharp = require('D:/שולחן עבודה/קלוד/פרויקט ביגבוט/wabot-final/client/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const srcImage = 'D:/הורדות/ChatGPT Image Apr 9, 2026, 08_00_14 PM.png';
const resBase = 'D:/שולחן עבודה/קלוד/פרויקט ביגבוט/bigbot/android/app/src/main/res';

const sizes = [
  ['mipmap-mdpi',    48,  108],
  ['mipmap-hdpi',    72,  162],
  ['mipmap-xhdpi',   96,  216],
  ['mipmap-xxhdpi',  144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

// Flood-fill outer white → transparent, only touches pixels connected to edges
async function removeOuterWhite(inputPath) {
  const { width, height } = await sharp(inputPath).metadata();
  const raw = await sharp(inputPath).raw().toBuffer();

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i*4] = raw[i*3]; rgba[i*4+1] = raw[i*3+1];
    rgba[i*4+2] = raw[i*3+2]; rgba[i*4+3] = 255;
  }

  const isWhitish = (idx) => rgba[idx*4] > 200 && rgba[idx*4+1] > 200 && rgba[idx*4+2] > 200;
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x++) {
    for (const y of [0, height-1]) {
      const idx = y*width+x;
      if (!visited[idx] && isWhitish(idx)) { visited[idx]=1; queue.push(idx); }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width-1]) {
      const idx = y*width+x;
      if (!visited[idx] && isWhitish(idx)) { visited[idx]=1; queue.push(idx); }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    rgba[idx*4+3] = 0;
    const x = idx%width, y = Math.floor(idx/width);
    if (x>0)        { const n=idx-1;      if(!visited[n]&&isWhitish(n)){visited[n]=1;queue.push(n);} }
    if (x<width-1)  { const n=idx+1;      if(!visited[n]&&isWhitish(n)){visited[n]=1;queue.push(n);} }
    if (y>0)        { const n=idx-width;  if(!visited[n]&&isWhitish(n)){visited[n]=1;queue.push(n);} }
    if (y<height-1) { const n=idx+width;  if(!visited[n]&&isWhitish(n)){visited[n]=1;queue.push(n);} }
  }

  return { buf: sharp(rgba, { raw: { width, height, channels: 4 } }), width, height };
}

async function main() {
  console.log('Processing circle logo...');

  const { buf } = await removeOuterWhite(srcImage);

  // Trim to exact circle bounds
  const trimmedBuf = await buf.trim({ threshold: 10 }).png().toBuffer();
  const meta = await sharp(trimmedBuf).metadata();
  console.log(`Circle logo: ${meta.width}x${meta.height}px`);

  // Sample the dark green from the circle edge (top-center, just inside)
  const rawTrimmed = await sharp(trimmedBuf).raw().toBuffer();
  // Scan from top-center downward to find first opaque dark green pixel
  let edgeColor = { r: 20, g: 70, b: 30 };
  const cx = Math.floor(meta.width / 2);
  for (let y = 0; y < meta.height; y++) {
    const idx = (y * meta.width + cx) * 4;
    if (rawTrimmed[idx+3] > 200) { // opaque
      edgeColor = { r: rawTrimmed[idx], g: rawTrimmed[idx+1], b: rawTrimmed[idx+2] };
      console.log(`Edge color at y=${y}: rgb(${edgeColor.r},${edgeColor.g},${edgeColor.b})`);
      break;
    }
  }

  for (const [folder, legacySize, adaptiveSize] of sizes) {
    const dir = path.join(resBase, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Legacy — circle on transparent bg, exact size
    await sharp(trimmedBuf)
      .resize(legacySize, legacySize, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
      .png().toFile(path.join(dir, 'ic_launcher.png'));

    await sharp(trimmedBuf)
      .resize(legacySize, legacySize, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
      .png().toFile(path.join(dir, 'ic_launcher_round.png'));

    // Adaptive foreground — circle fills the FULL 108dp canvas
    // The circle image IS the correct shape; background same dark green = seamless
    await sharp(trimmedBuf)
      .resize(adaptiveSize, adaptiveSize, { fit: 'contain', background: edgeColor })
      .png().toFile(path.join(dir, 'ic_launcher_foreground.png'));

    console.log(`✓ ${folder}`);
  }

  // In-app drawable (transparent bg)
  await sharp(trimmedBuf)
    .resize(256, 256, { fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
    .webp({ lossless: true })
    .toFile(path.join(resBase, 'drawable', 'logo_bigbot.webp'));
  console.log('✓ drawable/logo_bigbot.webp');

  // Update colors.xml
  const hex = (v) => v.toString(16).padStart(2,'0');
  const colorHex = `#${hex(edgeColor.r)}${hex(edgeColor.g)}${hex(edgeColor.b)}`;
  fs.writeFileSync(path.join(resBase, 'values', 'colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="launcher_bg">${colorHex}</color>\n</resources>\n`);
  console.log(`✓ colors.xml → ${colorHex}`);

  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
