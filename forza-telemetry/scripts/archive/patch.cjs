const fs = require('fs');
const file = 'server/src/track-builder.js';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("import { simplifyRDP }")) {
  content = "import { simplifyRDP } from './utils/rdp.js';\n" + content;
}

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
  
  // 1. Tag points with original index so we can map back after RDP
  const pts = centerline.map((p, i) => ({ ...p, originalIdx: i }));
  
  // 2. Simplify centerline using RDP (tolerance 4.0 meters)
  const rdpPts = simplifyRDP(pts, 4.0);
  if (rdpPts.length < 3) return turns;
  
  // 3. Compute turn sign and angle at each RDP vertex
  const vertexData = [];
  for (let i = 1; i < rdpPts.length - 1; i++) {
    const pPrev = rdpPts[i-1];
    const pCurr = rdpPts[i];
    const pNext = rdpPts[i+1];
    
    // Vector V1 (Prev -> Curr)
    const v1x = pCurr.x - pPrev.x;
    const v1z = pCurr.z - pPrev.z;
    // Vector V2 (Curr -> Next)
    const v2x = pNext.x - pCurr.x;
    const v2z = pNext.z - pCurr.z;
    
    // Calculate angle difference using atan2
    let yaw1 = Math.atan2(v1z, v1x);
    let yaw2 = Math.atan2(v2z, v2x);
    let angleDiff = yaw2 - yaw1;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    const degDiff = Math.abs(angleDiff * 180 / Math.PI);
    const turnDirection = Math.sign(angleDiff);
    
    // Filter out micro-noise (e.g. < 3 degrees deviation)
    if (degDiff >= 3.0) {
      vertexData.push({
        idx: i,
        originalIdx: pCurr.originalIdx,
        direction: turnDirection,
        degDiff: degDiff
      });
    }
  }
  
  if (vertexData.length === 0) return turns;
  
  // 4. Group consecutive same-sign vertices
  const turnGroups = [];
  let currentGroup = [vertexData[0]];
  
  for (let i = 1; i < vertexData.length; i++) {
    const v = vertexData[i];
    const lastV = currentGroup[currentGroup.length - 1];
    
    if (v.direction === lastV.direction) {
      currentGroup.push(v);
    } else {
      turnGroups.push(currentGroup);
      currentGroup = [v];
    }
  }
  turnGroups.push(currentGroup);
  
  // 5. Build turn objects from merged groups
  let turnCount = 1;
  for (const group of turnGroups) {
    const firstVertexRdpIdx = group[0].idx;
    const lastVertexRdpIdx = group[group.length - 1].idx;
    
    // The physical turn starts slightly before the first vertex and ends slightly after the last vertex
    const startOriginalIdx = rdpPts[Math.max(0, firstVertexRdpIdx - 1)].originalIdx;
    const endOriginalIdx = rdpPts[Math.min(rdpPts.length - 1, lastVertexRdpIdx + 1)].originalIdx;
    
    // Only process if it's a significant segment (e.g. > 4 centerline points)
    if (endOriginalIdx - startOriginalIdx > 4) {
      const turnObj = calculateTurnAttributes(centerline, startOriginalIdx, endOriginalIdx, 'T' + turnCount);
      if (turnObj) {
        turns.push(turnObj);
        turnCount++;
      }
    }
  }
  
  // 6. S弯 (Chicane) 组合识别
  for (let i = 0; i < turns.length - 1; i++) {
    const curr = turns[i];
    const next = turns[i + 1];
    
    const gapIdx = next.startIdx - curr.endIdx;
    const gapDist = gapIdx * 2.0; // Approx 2m per point
    
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
