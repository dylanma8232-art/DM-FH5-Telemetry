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
  
  const INTEGRATION_DIST = 45.0; // meters window
  const YAW_RATE_THRESHOLD = 5.0; // degrees
  
  const getDist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.z - p2.z)**2);
  
  let turns = 0;
  let inTurn = false;
  let turnStart = 0;
  
  for (let i = 0; i < centerline.length; i += 100) {
    let j = i;
    let dist = 0;
    while (j < centerline.length - 1 && dist < INTEGRATION_DIST) {
      dist += getDist(centerline[j], centerline[j+1]);
      j++;
    }
    
    let yawStart = centerline[i].yaw || 0;
    let yawEnd = centerline[j].yaw || 0;
    let yawDiff = yawEnd - yawStart;
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
    
    const absDegDiff = Math.abs(yawDiff * 180 / Math.PI);
    console.log(`Point ${i}, dist=${dist.toFixed(1)}, yawDiff=${(yawDiff * 180 / Math.PI).toFixed(2)} deg`);
  }
} catch (e) {
  console.error(e);
}
