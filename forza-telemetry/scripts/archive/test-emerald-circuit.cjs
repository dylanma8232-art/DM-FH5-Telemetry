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
  
  console.log(`[翡翠环岛] Total Points: ${detail.centerline.length}`);
  console.log(`[翡翠环岛] Total Turns detected: ${detail.turns.length}`);
  
  if (detail.turns.length > 0) {
    console.log("Turns:");
    detail.turns.forEach(t => {
      console.log(`  ${t.id}: Dir=${t.direction}, Sev=${t.severity}, Type=${t.type || 'normal'}, ApexIdx=${t.index}, StartIdx=${t.startIdx}, EndIdx=${t.endIdx}`);
    });
  }
} catch (e) {
  console.error("Error reading 翡翠环岛:", e.message);
}
