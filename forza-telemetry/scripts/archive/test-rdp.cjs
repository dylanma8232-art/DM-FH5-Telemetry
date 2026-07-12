const fs = require('fs');
const db = JSON.parse(fs.readFileSync('server/data/tracks-database.json', 'utf8'));
const eagle = db.tracks.find(t => t.id === 'track_1783743376131');
const { simplifyRDP } = require('./server/src/utils/rdp.js');

const pts = eagle.centerline.map((p, i) => ({...p, originalIdx: i}));
const rdpPts = simplifyRDP(pts, 4.0);

console.log("Centerline points:", pts.length);
console.log("RDP points:", rdpPts.length);

const vertexData = [];
for (let i = 1; i < rdpPts.length - 1; i++) {
  const pPrev = rdpPts[i-1];
  const pCurr = rdpPts[i];
  const pNext = rdpPts[i+1];
  
  const v1x = pCurr.x - pPrev.x;
  const v1z = pCurr.z - pPrev.z;
  const v2x = pNext.x - pCurr.x;
  const v2z = pNext.z - pCurr.z;
  
  let yaw1 = Math.atan2(v1z, v1x);
  let yaw2 = Math.atan2(v2z, v2x);
  let angleDiff = yaw2 - yaw1;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  
  const degDiff = Math.abs(angleDiff * 180 / Math.PI);
  const turnDirection = Math.sign(angleDiff);
  
  if (degDiff >= 3.0) {
    vertexData.push({
      idx: i,
      originalIdx: pCurr.originalIdx,
      direction: turnDirection,
      degDiff: degDiff
    });
  }
}
console.log("Significant RDP vertices:", vertexData.length);
console.log(vertexData.slice(0, 15));
