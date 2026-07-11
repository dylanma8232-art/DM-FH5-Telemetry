const fs = require('fs');
const file = 'server/src/track-builder.js';
let content = fs.readFileSync(file, 'utf8');

const target = `export function detectTurnsEnhanced(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const turns = [];
  let turnCount = 1;
  let inTurn = false;
  let turnStartIdx = 0;
  let minRadius = 10000;
  let turnDirection = 0; // 1 for Right, -1 for Left
  
  for (let i = 1; i < centerline.length - 1; i++) {
    let r = centerline[i].radius;
    let k = centerline[i].kappa;
    
    // Threshold to enter a turn (Radius < 200m)
    if (r < 200 && !inTurn) {
      inTurn = true;
      turnStartIdx = i;
      minRadius = r;
      turnDirection = -Math.sign(k);
    } else if (inTurn) {
      if (r < minRadius) {
        minRadius = r;
        turnDirection = -Math.sign(k); // update direction at apex
      }
      
      // Threshold to exit a turn (Radius > 300m confirmed by look-ahead debounce)
      if (r > 300) {
        let confirmExit = true;
        const lookAheadCount = 5;
        for (let j = 1; j <= lookAheadCount; j++) {
          if (i + j < centerline.length) {
            if (centerline[i + j].radius <= 300) {
              confirmExit = false; // Look-ahead failed, cancel exit
              break;
            }
          }
        }
        
        if (confirmExit) {
          let lengthPts = i - turnStartIdx;
          if (lengthPts > 4) { // Only count turns of significant length
            const turnObj = calculateTurnAttributes(centerline, turnStartIdx, i, 'T' + turnCount);
            if (turnObj) {
              turns.push(turnObj);
              turnCount++;
            }
          }
        }
        inTurn = false;
      }
    }
  }

  // S弯 (Chicane) 组合识别：相邻反向且物理间距很近的弯道标记为组合S弯
  // 不再覆盖 severity，保持各自 1-6 等级
  for (let i = 0; i < turns.length - 1; i++) {
    const curr = turns[i];
    const next = turns[i + 1];
    
    const gapIdx = next.startIdx - curr.endIdx;
    const gapDist = gapIdx * 2.0;
    
    if (curr.direction !== next.direction && gapDist < 25.0) {
      curr.isChicane = true;
      next.isChicane = true;
    }
  }
  
  return turns;
}`;

const replacement = `export function detectTurnsEnhanced(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const turns = [];
  let turnCount = 1;
  
  const INTEGRATION_DIST = 45.0; // meters window
  const YAW_RATE_THRESHOLD = 5.0; // degrees
  const EXIT_THRESHOLD = 2.0; // degrees
  
  let inTurn = false;
  let turnStartIdx = 0;
  let turnDirection = 0;
  
  const getDist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.z - p2.z)**2);
  
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
    
    const degDiff = yawDiff * 180 / Math.PI;
    const absDegDiff = Math.abs(degDiff);
    
    if (!inTurn) {
      if (absDegDiff > YAW_RATE_THRESHOLD) {
        inTurn = true;
        turnStartIdx = i;
        turnDirection = Math.sign(degDiff);
      }
    } else {
      let isExit = false;
      if (absDegDiff < EXIT_THRESHOLD) {
        isExit = true;
      } else if (Math.sign(degDiff) !== turnDirection && absDegDiff > YAW_RATE_THRESHOLD / 2) {
        isExit = true;
      }
      
      if (isExit) {
        let endIdx = Math.min(centerline.length - 1, i + Math.floor((j - i) / 2));
        let lengthPts = endIdx - turnStartIdx;
        
        if (lengthPts > 4) {
          const turnObj = calculateTurnAttributes(centerline, turnStartIdx, endIdx, 'T' + turnCount);
          if (turnObj) {
            turns.push(turnObj);
            turnCount++;
          }
        }
        inTurn = false;
        
        // Skip ahead slightly to avoid rapid re-triggering
        i = endIdx; 
      }
    }
  }
  
  if (inTurn) {
    let lengthPts = (centerline.length - 1) - turnStartIdx;
    if (lengthPts > 4) {
      const turnObj = calculateTurnAttributes(centerline, turnStartIdx, centerline.length - 1, 'T' + turnCount);
      if (turnObj) {
        turns.push(turnObj);
      }
    }
  }

  // S弯 (Chicane) 组合识别
  for (let i = 0; i < turns.length - 1; i++) {
    const curr = turns[i];
    const next = turns[i + 1];
    
    const gapIdx = next.startIdx - curr.endIdx;
    const gapDist = gapIdx * 2.0;
    
    if (curr.direction !== next.direction && gapDist < 25.0) {
      curr.isChicane = true;
      next.isChicane = true;
    }
  }
  
  return turns;
}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log('Replaced successfully');
