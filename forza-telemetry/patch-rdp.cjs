const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'server/src/track-builder.js');
let code = fs.readFileSync(filepath, 'utf8');

// 1. Inject RDP helpers if not exist
const rdpCode = `
/**
 * 计算三维空间中点 P 到线段 AB 的垂直距离 (带端点投射钳制)
 */
function getPointToSegmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = (b.y || 0) - (a.y || 0);
  const vz = b.z - a.z;

  const wx = p.x - a.x;
  const wy = (p.y || 0) - (a.y || 0);
  const wz = p.z - a.z;

  const vSq = vx * vx + vy * vy + vz * vz;
  if (vSq === 0) return Math.sqrt(wx * wx + wy * wy + wz * wz);

  let t = (wx * vx + wy * vy + wz * vz) / vSq;
  t = Math.max(0, Math.min(1, t));

  const cx = a.x + t * vx;
  const cy = (a.y || 0) + t * vy;
  const cz = a.z + t * vz;

  const dx = p.x - cx;
  const dy = (p.y || 0) - cy;
  const dz = p.z - cz;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function simplifyRDP(points, epsilon = 2.0) {
  if (!points || points.length <= 2) return points || [];
  const len = points.length;
  const keep = new Array(len).fill(true);
  const stack = [[0, len - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start <= 1) continue;

    let maxDistance = 0;
    let index = start;

    for (let i = start + 1; i < end; i++) {
      const distance = getPointToSegmentDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }

    if (maxDistance > epsilon) {
      stack.push([start, index]);
      stack.push([index, end]);
    } else {
      for (let i = start + 1; i < end; i++) {
        keep[i] = false;
      }
    }
  }

  const result = [];
  for (let i = 0; i < len; i++) {
    if (keep[i]) result.push({ point: points[i], index: i });
  }
  return result;
}
`;

if (!code.includes('function simplifyRDP')) {
  code = code.replace('export function detectTurnsEnhanced', rdpCode + '\nexport function detectTurnsEnhanced');
}

// 2. Replace detectTurnsEnhanced
const newDetectTurns = `export function detectTurnsEnhanced(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const turns = [];
  let turnCount = 1;

  // 1. 使用 RDP 提取视觉骨架 (容差 2.0 米，过滤所有直道上的微操晃动)
  const rdpPoints = simplifyRDP(centerline, 2.0);
  if (rdpPoints.length < 3) return [];

  // 2. 遍历 RDP 折点，计算每个折点的转向角度和方向
  const rdpTurns = [];
  for (let i = 1; i < rdpPoints.length - 1; i++) {
    const pPrev = rdpPoints[i - 1].point;
    const pCurr = rdpPoints[i].point;
    const pNext = rdpPoints[i + 1].point;
    
    // 向量 v1 (Prev -> Curr) 和 v2 (Curr -> Next)
    const v1x = pCurr.x - pPrev.x;
    const v1z = pCurr.z - pPrev.z;
    const v2x = pNext.x - pCurr.x;
    const v2z = pNext.z - pCurr.z;
    
    // 计算偏转角
    let angleDiff = Math.atan2(v2z, v2x) - Math.atan2(v1z, v1x);
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    const absDeg = Math.abs(angleDiff * 180 / Math.PI);
    
    // 如果折点有超过 3 度的转向，记为一个弯道碎片
    if (absDeg > 3.0) {
      // 这里的 sign: 正数代表向右 (顺时针)，负数代表向左 (逆时针)
      // 在 x-z 平面上，z向下为正时 atan2(z, x): 向右转 angleDiff 减小（或增加，取决于坐标系）
      // Forza: Math.atan2 规则同标准数学。因为 x向右，z向下，所以右转是 angleDiff > 0。
      // 为保持统一，我们用叉积方向:
      const cross = v1x * v2z - v1z * v2x;
      const turnDirection = Math.sign(cross); // 1 = Right, -1 = Left (基于 Forza 的 x-z 左手坐标系)
      
      rdpTurns.push({
        idx: rdpPoints[i].index,
        deg: absDeg,
        direction: turnDirection
      });
    }
  }

  // 3. 同向折点合并算法 (Polygon Vertex Merging)
  if (rdpTurns.length === 0) return [];
  
  let currentTurnStartIdx = rdpTurns[0].idx;
  let currentTurnEndIdx = rdpTurns[0].idx;
  let currentDirection = rdpTurns[0].direction;
  
  for (let i = 1; i < rdpTurns.length; i++) {
    const curr = rdpTurns[i];
    
    // 如果方向相同，并且物理距离不是很远 (比如 200米以内连续转向)，视为同一个大弯
    const distToLast = Math.sqrt(
      Math.pow(centerline[curr.idx].x - centerline[currentTurnEndIdx].x, 2) +
      Math.pow(centerline[curr.idx].z - centerline[currentTurnEndIdx].z, 2)
    );
    
    if (curr.direction === currentDirection && distToLast < 200) {
      // 合并到当前弯道
      currentTurnEndIdx = curr.idx;
    } else {
      // 方向变了，或者距离太远脱节了，结算上一个弯道
      if (currentTurnEndIdx - currentTurnStartIdx > 4) { // 需要有一定的跨度
        const turnObj = calculateTurnAttributes(centerline, currentTurnStartIdx, currentTurnEndIdx, 'T' + turnCount);
        if (turnObj) {
          turns.push(turnObj);
          turnCount++;
        }
      }
      
      // 开启新弯道
      currentTurnStartIdx = curr.idx;
      currentTurnEndIdx = curr.idx;
      currentDirection = curr.direction;
    }
  }
  
  // 结算最后一个弯道
  if (currentTurnEndIdx - currentTurnStartIdx > 4) {
    const turnObj = calculateTurnAttributes(centerline, currentTurnStartIdx, currentTurnEndIdx, 'T' + turnCount);
    if (turnObj) {
      turns.push(turnObj);
      turnCount++;
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

// Extract everything except detectTurnsEnhanced
const beforeDetectTurns = code.split('export function detectTurnsEnhanced(centerline) {')[0];
let afterDetectTurns = code.split('export function detectTurnsEnhanced(centerline) {')[1];
// Find the end of detectTurnsEnhanced
const endIdx = afterDetectTurns.indexOf('export function buildRouteBook');
afterDetectTurns = afterDetectTurns.substring(endIdx);

code = beforeDetectTurns + newDetectTurns + '\n' + afterDetectTurns;

// 3. Fix left/right bug
code = code.replace('turnDirection = -Math.sign(centerline[i].kappa);', 'turnDirection = Math.sign(centerline[i].kappa);');

fs.writeFileSync(filepath, code, 'utf8');
console.log("Successfully patched track-builder.js");
