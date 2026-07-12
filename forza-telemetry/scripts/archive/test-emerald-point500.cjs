const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

const DATA_DIR = path.resolve(__dirname, 'data');
const trackId = 'track_1783235683305'; // 翡翠环岛
const brPath = path.join(DATA_DIR, 'tracks', `${trackId}.json.br`);

try {
  const buffer = fs.readFileSync(brPath);
  const decompressed = zlib.brotliDecompressSync(buffer);
  const detail = JSON.parse(decompressed.toString('utf8'));
  const centerline = detail.centerline;
  
  for (let i = 490; i <= 510; i++) {
    console.log(`Point ${i}, x=${centerline[i].x.toFixed(1)}, z=${centerline[i].z.toFixed(1)}, rawYaw=${centerline[i].yaw.toFixed(2)} (${(centerline[i].yaw * 180 / Math.PI).toFixed(1)} deg)`);
  }
} catch (e) {
  console.error(e);
}
