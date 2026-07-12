const fs = require('fs');
const eagle = JSON.parse(fs.readFileSync('server/data/tracks/track_1783742311138.json', 'utf8')); // Goliath

const centerline = eagle.centerline;
console.log("Centerline points:", centerline.length);

const INTEGRATION_DIST = 45.0; // meters window
const YAW_RATE_THRESHOLD = 5.0; // degrees

let turns = 0;
let inTurn = false;
let turnStart = 0;

const getDist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.z - p2.z)**2);

let radiusStats = [];

for (let i = 0; i < centerline.length; i++) {
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
  
  if (!inTurn) {
    if (absDegDiff > YAW_RATE_THRESHOLD) {
      inTurn = true;
      turnStart = i;
    }
  } else {
    if (absDegDiff < 2.0 || (Math.sign(yawDiff) !== Math.sign(centerline[turnStart].yaw) && absDegDiff > 2.5)) {
      if (i - turnStart > 4) {
        turns++;
        let minRadius = 10000;
        for (let k = turnStart; k <= i; k++) {
          if (centerline[k].radius < minRadius) minRadius = centerline[k].radius;
        }
        radiusStats.push(minRadius);
      }
      inTurn = false;
      i = i + Math.floor((j - i) / 2); // Skip ahead slightly
    }
  }
}
console.log("Found turns:", turns);
let largeRadiusCount = radiusStats.filter(r => r >= 200).length;
console.log(`Turns with min radius >= 200m: ${largeRadiusCount}`);
