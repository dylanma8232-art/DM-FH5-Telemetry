import { simplifyRDP, fitArcToPoints } from './track-math.js';

export function detectTurnsEnhanced(centerline) {
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

  // 3. 同向折点合并算法 (宏观测绘法防碎裂)
  if (rdpTurns.length === 0) return [];
  let currentTurnStartIdx = rdpTurns[0].idx;
  let currentTurnEndIdx = rdpTurns[0].idx;
  let currentDirection = rdpTurns[0].direction;
  for (let i = 1; i < rdpTurns.length; i++) {
    const curr = rdpTurns[i];
    const distToLast = Math.sqrt(Math.pow(centerline[curr.idx].x - centerline[currentTurnEndIdx].x, 2) + Math.pow(centerline[curr.idx].z - centerline[currentTurnEndIdx].z, 2));
    if (curr.direction === currentDirection) {
      if (distToLast < 200) {
        // 同向且距离近，正常延长当前弯道
        currentTurnEndIdx = curr.idx;
      } else {
        // 距离太远，视为脱节，结算当前弯道
        if (currentTurnEndIdx - currentTurnStartIdx > 4) {
          const turnObj = calculateTurnAttributes(centerline, currentTurnStartIdx, currentTurnEndIdx, 'T' + turnCount);
          if (turnObj) {
            turns.push(turnObj);
            turnCount++;
          }
        }
        currentTurnStartIdx = curr.idx;
        currentTurnEndIdx = curr.idx;
        currentDirection = curr.direction;
      }
    } else {
      // 遇到反向偏转！判断是轻微抖动还是真正的 S 弯
      // 如果发生在高频密集区 (<15米) 且 偏转角度很小 (<15度)
      if (distToLast < 25 && curr.deg < 15) {
        // 这仅仅是车手的微操反打方向，或者地图的微小颠簸。
        // 上帝视角：忽略它，不结算当前大弯。只是不把它当做 endIdx 更新。
        // （相当于平滑越过）
      } else {
        // 真正的反向弯，或者是长直道后的反向入弯，立即阻断合并！
        if (currentTurnEndIdx - currentTurnStartIdx > 4) {
          const turnObj = calculateTurnAttributes(centerline, currentTurnStartIdx, currentTurnEndIdx, 'T' + turnCount);
          if (turnObj) {
            turns.push(turnObj);
            turnCount++;
          }
        }
        currentTurnStartIdx = curr.idx;
        currentTurnEndIdx = curr.idx;
        currentDirection = curr.direction;
      }
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

  // S弯 组合识别
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
}

export /**
 * 弯道几何重建：用圆弧拟合弯道，直线拟合直道
 * 解决走线导致的弯道形状失真问题
 * @param {Array} centerline - 原始中心线
 * @param {Array} turns - 检测到的弯道
 * @returns {Array} 重建后的中心线
 */
function reconstructTrackGeometry(centerline, turns) {
  if (!centerline || centerline.length < 10) return centerline;
  if (!turns || turns.length === 0) return centerline;
  const result = [];
  const turnSet = new Set();

  // 标记所有弯道段
  for (const turn of turns) {
    for (let i = turn.startIdx; i <= turn.endIdx; i++) {
      turnSet.add(i);
    }
  }

  // 处理每个弯道段
  for (const turn of turns) {
    const start = turn.startIdx;
    const end = turn.endIdx;

    // 收集弯道内的点
    const turnPoints = [];
    for (let i = start; i <= end; i++) {
      turnPoints.push(centerline[i]);
    }

    // 拟合圆弧（跳过角度 > 60° 的弯道，避免圆弧拟合失败导致路径交叉）
    const arc = fitArcToPoints(turnPoints);
    const turnAngle = turn.angle || 0;
    if (arc && arc.radius > 5 && arc.radius < 500 && turnAngle < 60) {
      // 计算弯道的起始和结束角度
      const startAngle = Math.atan2(turnPoints[0].z - arc.cz, turnPoints[0].x - arc.cx);
      const endAngle = Math.atan2(turnPoints[turnPoints.length - 1].z - arc.cz, turnPoints[turnPoints.length - 1].x - arc.cx);

      // 计算角度差（考虑方向）
      let angleDiff = endAngle - startAngle;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      // 根据曲率符号确定方向
      const direction = turn.direction || (angleDiff > 0 ? 1 : -1);
      if (direction < 0 && angleDiff > 0) angleDiff -= 2 * Math.PI;
      if (direction > 0 && angleDiff < 0) angleDiff += 2 * Math.PI;

      // 用圆弧重新生成点（保持原始点密度）
      const numPoints = turnPoints.length;
      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = startAngle + angleDiff * t;
        const x = arc.cx + arc.radius * Math.cos(angle);
        const z = arc.cz + arc.radius * Math.sin(angle);

        // 保留原始点的其他属性
        const orig = turnPoints[i];
        result.push({
          ...orig,
          x,
          z,
          yaw: angle + (direction > 0 ? Math.PI / 2 : -Math.PI / 2)
        });
      }
    } else {
      // 拟合失败，保留原始点
      result.push(...turnPoints);
    }
  }

  // 处理直道段（弯道之间的部分）
  if (result.length === 0) return centerline;

  // 重建完整的中心线（弯道用圆弧，直道用直线插值）
  const finalCenterline = [];
  let resultIdx = 0;
  for (let i = 0; i < centerline.length; i++) {
    if (turnSet.has(i)) {
      // 弯道点，从重建结果中取
      if (resultIdx < result.length) {
        finalCenterline.push(result[resultIdx++]);
      }
    } else {
      // 直道点，保留原始但简化
      finalCenterline.push(centerline[i]);
    }
  }
  return finalCenterline.length > 0 ? finalCenterline : centerline;
}

/**
 * 宽度中值滤波：消除宽度序列中的毛刺/突变
 * @param {Array} centerline - 中心线
 * @param {number} kernelSize - 滤波窗口大小（奇数）
 */

export /**
 * 折角过滤器：检测并平滑中心线中的尖锐折角（车辆打滑/碰撞/UDP丢包导致）
 * @param {Array} centerline - 中心线
 * @param {number} angleThreshold - 角度阈值（度），超过则视为折角
 */
function filterKinks(centerline, angleThreshold = 35) {
  if (!centerline || centerline.length < 5) return;
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 2; i < centerline.length - 2; i++) {
      const prev = centerline[i - 1];
      const curr = centerline[i];
      const next = centerline[i + 1];
      const angle1 = Math.atan2(curr.z - prev.z, curr.x - prev.x);
      const angle2 = Math.atan2(next.z - curr.z, next.x - curr.x);
      let diff = Math.abs(angle2 - angle1) * 180 / Math.PI;
      if (diff > 180) diff = 360 - diff;
      if (diff > angleThreshold) {
        // 用前后点的中点替代，平滑折角
        const t = 0.5;
        curr.x = prev.x * (1 - t) + next.x * t;
        curr.z = prev.z * (1 - t) + next.z * t;
        curr.yaw = Math.atan2(next.z - prev.z, next.x - prev.x);
      }
    }
  }
}

export function calculateTurnAttributes(centerline, turnStartIdx, turnEndIdx, idStr = 'T0') {
  if (turnStartIdx === turnEndIdx || !centerline[turnStartIdx] || !centerline[turnEndIdx]) return null;
  const len = centerline.length;
  const loopCount = turnStartIdx > turnEndIdx ? (len - turnStartIdx + turnEndIdx + 1) : (turnEndIdx - turnStartIdx + 1);

  let minRadius = 10000;
  let turnDirection = 0;
  let apexIdx = turnStartIdx;
  for (let step = 0; step < loopCount; step++) {
    const i = (turnStartIdx + step) % len;
    let r = centerline[i].radius;
    if (r < minRadius) {
      minRadius = r;
      turnDirection = Math.sign(centerline[i].kappa);
      apexIdx = i;
    }
  }
  let pt = centerline[apexIdx];
  let yawStart = centerline[turnStartIdx].yaw || 0;
  let yawEnd = centerline[turnEndIdx].yaw || 0;
  let angleDiff = Math.abs(yawEnd - yawStart) * 180 / Math.PI;
  if (angleDiff > 180) angleDiff = 360 - angleDiff;

  // 离心侧倾侧向力补偿计算
  let totalCompRoll = 0;
  let ptsCount = 0;
  let hasRollData = false;
  for (let step = 0; step < loopCount; step++) {
    const idx = (turnStartIdx + step) % len;
    const p = centerline[idx];
    if (!p) continue;
    if (p.roll !== undefined && p.roll !== null) hasRollData = true;
    const rollVal = p.roll || 0;
    const rollDeg = rollVal * 180 / Math.PI;
    const latG = p.gLat || (p.acceleration ? p.acceleration.x || 0 : 0);
    const compRoll = rollDeg - 1.5 * latG; // 侧向G力补偿：1.5度/G
    totalCompRoll += compRoll;
    ptsCount++;
  }
  const avgCompRoll = ptsCount > 0 ? totalCompRoll / ptsCount : 0;
  let camberType = null;
  if (hasRollData) {
    if (turnDirection > 0) {
      // 右弯
      if (avgCompRoll > 4.5) camberType = 'banking';else if (avgCompRoll < -4.5) camberType = 'off-camber';
    } else {
      // 左弯
      if (avgCompRoll < -4.5) camberType = 'banking';else if (avgCompRoll > 4.5) camberType = 'off-camber';
    }
  }

  // 盲坡与飞跳检测 (crest/jump)
  const getDist2D = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
  let maxSlopeDrop = 0;
  let maxSlopeDropIdx = -1;
  for (let j = Math.max(4, turnStartIdx - 15); j <= Math.min(len - 5, turnStartIdx + 5); j++) {
    const idxPrev = (j - 4 + len) % len;
    const idxCurr = j % len;
    const idxNext = (j + 4) % len;
    const pPrev = centerline[idxPrev];
    const pCurr = centerline[idxCurr];
    const pNext = centerline[idxNext];
    const slope1 = (pCurr.y - pPrev.y) / (getDist2D(pPrev, pCurr) || 1.0);
    const slope2 = (pNext.y - pCurr.y) / (getDist2D(pCurr, pNext) || 1.0);
    const slopeDrop = slope1 - slope2;
    if (slopeDrop > maxSlopeDrop) {
      maxSlopeDrop = slopeDrop;
      maxSlopeDropIdx = j % len;
    }
  }
  let crestType = null;
  if (maxSlopeDrop > 0.04) {
    let totalSusp = 0;
    let suspCount = 0;
    for (let idx = Math.max(0, maxSlopeDropIdx - 2); idx <= Math.min(len - 1, maxSlopeDropIdx + 4); idx++) {
      const p = centerline[idx];
      if (p) {
        const FL = p.suspFL !== undefined ? p.suspFL : p.suspension ? p.suspension.frontLeft || 0.5 : 0.5;
        const FR = p.suspFR !== undefined ? p.suspFR : p.suspension ? p.suspension.frontRight || 0.5 : 0.5;
        const RL = p.suspRL !== undefined ? p.suspRL : p.suspension ? p.suspension.rearLeft || 0.5 : 0.5;
        const RR = p.suspRR !== undefined ? p.suspRR : p.suspension ? p.suspension.rearRight || 0.5 : 0.5;
        totalSusp += (FL + FR + RL + RR) / 4.0;
        suspCount++;
      }
    }
    const avgSusp = suspCount > 0 ? totalSusp / suspCount : 0.5;
    if (avgSusp > 0.85) {
      crestType = 'jump';
    } else {
      crestType = 'crest';
    }
  }
  let severity = "";
  let type = "micro";
  if (angleDiff >= 130.0) {
    severity = "1";
    type = "hairpin";
  } else if (angleDiff >= 90.0) {
    severity = "2";
    type = "sharp";
  } else if (angleDiff >= 60.0) {
    severity = "3";
    type = "medium";
  } else if (angleDiff >= 40.0) {
    severity = "4";
    type = "gentle";
  } else if (angleDiff >= 20.0) {
    severity = "5";
    type = "slight";
  } else {
    severity = "6";
    type = "micro";
  }
  let dirStr = turnDirection > 0 ? "右" : "左";
  let note = `${dirStr}${severity}`;
  let physicalDistance = 0;
  for (let step = 0; step < loopCount - 1; step++) {
    const i = (turnStartIdx + step) % len;
    const nextI = (i + 1) % len;
    const dx = centerline[nextI].x - centerline[i].x;
    const dz = centerline[nextI].z - centerline[i].z;
    physicalDistance += Math.sqrt(dx * dx + dz * dz);
  }
  let isLong = physicalDistance > 60 && angleDiff > 60;
  if (isLong) note += "长";
  let brakePointIdx = turnStartIdx - Math.floor(100 / 2); // roughly 100m before
  if (brakePointIdx < 0) {
    brakePointIdx = (brakePointIdx + len) % len;
  }

  return {
    id: idStr,
    name: note,
    index: apexIdx,
    x: pt.x,
    y: pt.y,
    z: pt.z,
    startX: centerline[turnStartIdx].x,
    startZ: centerline[turnStartIdx].z,
    endX: centerline[turnEndIdx].x,
    endZ: centerline[turnEndIdx].z,
    suggestedBrakePoint: brakePointIdx,
    brakePointX: centerline[brakePointIdx].x,
    brakePointZ: centerline[brakePointIdx].z,
    startIdx: turnStartIdx,
    endIdx: turnEndIdx,
    apexRadius: Math.round(minRadius),
    radius: Math.round(minRadius),
    angle: angleDiff,
    severity: severity,
    turnType: type,
    isLong: isLong,
    turnCategory: note,
    direction: turnDirection > 0 ? "right" : "left",
    camber: camberType,
    crest: crestType
  };
}

export function mapOldTurnsToNewCenterline(oldTurns, centerline, isLoop = false) {
  if (!oldTurns || oldTurns.length === 0) return [];
  const mapped = [];
  const getDist2D = (x1, z1, x2, z2) => Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
  const findClosestIdx = (x, z) => {
    let minD = Infinity;
    let minIdx = -1;
    for (let i = 0; i < centerline.length; i++) {
      let d = getDist2D(x, z, centerline[i].x, centerline[i].z);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }
    return minIdx;
  };
  oldTurns.forEach(oldT => {
    let startIdx = findClosestIdx(oldT.startX, oldT.startZ);
    let endIdx = findClosestIdx(oldT.endX, oldT.endZ);

    const isLoopCrossing = isLoop && (oldT.startIdx > oldT.endIdx || Math.abs(startIdx - endIdx) > centerline.length * 0.7);

    if (isLoopCrossing) {
      if (startIdx < endIdx) {
        const temp = startIdx;
        startIdx = endIdx;
        endIdx = temp;
      }
    } else {
      if (startIdx >= endIdx) {
        startIdx = Math.max(0, endIdx - 5);
      }
      if (endIdx - startIdx < 4) {
        startIdx = Math.max(0, endIdx - 4);
      }
    }

    const newT = calculateTurnAttributes(centerline, startIdx, endIdx, oldT.id);
    if (newT) {
      newT.direction = oldT.direction; // 保留修改后的转向方向
      newT.severity = oldT.severity;
      newT.camber = oldT.camber;       // 保留修改后的路面倾角
      newT.crest = oldT.crest;         // 保留修改后的坡度起伏
      newT.name = oldT.name;
      newT.customNote = oldT.customNote;
      newT.turnCategory = oldT.turnCategory;
      newT.isLockedByUser = oldT.isLockedByUser !== undefined ? oldT.isLockedByUser : true;
      if (oldT.isChicane) newT.isChicane = true;
      mapped.push(newT);
    }
  });
  return mapped;
}

export function remapLockedTurns(oldTurns, oldCenterline, newCenterline) {
  if (!oldTurns || !oldTurns.length || !oldCenterline || !newCenterline || !newCenterline.length) return oldTurns;
  const getDistance = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
  const findClosestIdx = pt => {
    if (!pt) return 0;
    let minD = Infinity;
    let minIdx = 0;
    for (let i = 0; i < newCenterline.length; i++) {
      const d = getDistance(pt, newCenterline[i]);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }
    return minIdx;
  };
  return oldTurns.map(turn => {
    const startPt = oldCenterline[turn.startIdx] || oldCenterline[0];
    const endPt = oldCenterline[turn.endIdx] || oldCenterline[oldCenterline.length - 1];
    const apexPt = oldCenterline[turn.apexIdx] || oldCenterline[Math.floor((turn.startIdx + turn.endIdx) / 2)];
    const newStart = findClosestIdx(startPt);
    const newEnd = findClosestIdx(endPt);
    const newApex = findClosestIdx(apexPt);
    return {
      ...turn,
      startIdx: Math.min(newStart, newEnd),
      endIdx: Math.max(newStart, newEnd),
      apexIdx: newApex
    };
  });
}

