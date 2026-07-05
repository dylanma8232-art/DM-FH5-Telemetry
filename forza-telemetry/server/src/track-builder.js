/**
 * 物理纠偏：利用 normalizedDrivingLine 将偏离的轨迹点拉回中心
 */
function densifyTrajectory(traj, maxDist = 2.0) {
  if (!traj || traj.length < 2) return traj;
  let dense = [traj[0]];
  for (let i = 1; i < traj.length; i++) {
    let p1 = traj[i-1], p2 = traj[i];
    let dx = p2.x - p1.x, dy = (p2.y||0) - (p1.y||0), dz = p2.z - p1.z;
    let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > maxDist) {
      let steps = Math.ceil(dist / maxDist);
      for (let j = 1; j < steps; j++) {
        let ratio = j / steps;
        dense.push({
          ...p1,
          x: p1.x + dx * ratio,
          y: (p1.y||0) + dy * ratio,
          z: p1.z + dz * ratio,
          yaw: (p1.yaw||0) + ((p2.yaw||0) - (p1.yaw||0)) * ratio,
          speed: (p1.speed||0) + ((p2.speed||0) - (p1.speed||0)) * ratio,
          drivingLine: (p1.drivingLine||0) + ((p2.drivingLine||0) - (p1.drivingLine||0)) * ratio
        });
      }
    }
    dense.push(p2);
  }
  return dense;
}

function correctTrajectoryDrivingLine(traj) {
  if (!traj || traj.length < 2) return traj;
  const corrected = [];
  for (let i = 0; i < traj.length; i++) {
    const p = traj[i];
    let pNext = traj[Math.min(i + 1, traj.length - 1)];
    let pPrev = traj[Math.max(i - 1, 0)];
    let dx = pNext.x - pPrev.x;
    let dz = pNext.z - pPrev.z;
    let len = Math.sqrt(dx * dx + dz * dz);
    
    if (len < 0.01) {
      corrected.push({ ...p });
      continue;
    }
    
    let tx = dx / len;
    let tz = dz / len;
    let nx = tz;
    let nz = -tx;
    
    let dl = p.drivingLine || 0; 
    let offset = dl * 0.1;
    
    corrected.push({
      ...p,
      x: p.x + nx * offset,
      z: p.z + nz * offset
    });
  }
  return corrected;
}

/**
 * 使用带时间窗限制与方向惩罚的 DTW 对齐两条轨迹
 * @param {Array} ref 基准线
 * @param {Array} target 目标线
 * @param {number} windowSize 搜索窗口大小
 */
function computeDTWPath(ref, target, windowSize = 200) {
  const n = ref.length;
  const m = target.length;
  const dtw = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;
  
  const w = Math.max(windowSize, Math.abs(n - m));

  for (let i = 1; i <= n; i++) {
    let start = Math.max(1, i - w);
    let end = Math.min(m, i + w);
    for (let j = start; j <= end; j++) {
      let dx = ref[i - 1].x - target[j - 1].x;
      let dz = ref[i - 1].z - target[j - 1].z;
      let distCost = Math.sqrt(dx * dx + dz * dz);
      
      let refYaw = ref[i - 1].yaw || 0;
      let targetYaw = target[j - 1].yaw || 0;
      
      // 核心修复：引入 Yaw Penalty 解决交叉赛道（如八球环道）在十字路口误判合并的问题
      let yawPenalty = 1 - Math.cos(refYaw - targetYaw);
      
      // 如果方向垂直或相反，增加巨大的惩罚阻断它们被合并
      let cost = distCost + 50.0 * yawPenalty;
      
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],    // insertion
        dtw[i][j - 1],    // deletion
        dtw[i - 1][j - 1] // match
      );
    }
  }

  let i = n, j = m;
  const mapping = Array.from({ length: n }, () => []);
  
  while (i > 0 && j > 0) {
    mapping[i - 1].push(target[j - 1]);
    const minPath = Math.min(dtw[i - 1][j - 1], dtw[i - 1][j], dtw[i][j - 1]);
    if (minPath === dtw[i - 1][j - 1]) {
      i--; j--;
    } else if (minPath === dtw[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }
  while(i > 0) { mapping[i-1].push(target[0]); i--; }
  
  return mapping;
}

export function buildTrackFromTrajectories(trajectories) {
  if (!trajectories || trajectories.length === 0) return null;

  const cleanTrajectories = [];
  for (const traj of trajectories) {
    if (!traj || traj.length < 2) continue;
    let current = [traj[0]];
    for (let i = 1; i < traj.length; i++) {
      let dx = traj[i].x - traj[i-1].x;
      let dz = traj[i].z - traj[i-1].z;
      let dist = Math.sqrt(dx*dx + dz*dz);
      let moveYaw = Math.atan2(dx, dz);
      let carYaw = traj[i-1].yaw || 0;
      let yawDiff = moveYaw - carYaw;
      while(yawDiff > Math.PI) yawDiff -= 2*Math.PI;
      while(yawDiff < -Math.PI) yawDiff += 2*Math.PI;
      
      // If jump is massive (> 300m) or (jump is > 50m AND angle diff is > 90 deg)
      if (dist > 300.0 || (dist > 50.0 && Math.abs(yawDiff) > Math.PI / 2)) {
        if (current.length >= 10) cleanTrajectories.push(current);
        current = [];
      }
      current.push(traj[i]);
    }
    if (current.length >= 10) cleanTrajectories.push(current);
  }

  if (cleanTrajectories.length === 0) return null;

  cleanTrajectories.sort((a, b) => b.length - a.length);
  const skeleton = resampleCenterline(cleanTrajectories[0], 2.0);
  const correctedTrajectories = cleanTrajectories.map(traj => correctTrajectoryDrivingLine(densifyTrajectory(traj, 2.0)));

  let mergedCenterline = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  for (const sp of skeleton) {
    let sumX = sp.x, sumY = sp.y || 0, sumZ = sp.z;
    let sumSin = Math.sin(sp.yaw || 0), sumCos = Math.cos(sp.yaw || 0);
    let sumDL = sp.drivingLine || 0, sumSpeed = sp.speed || 0, sumBrake = sp.brake || 0, sumGear = sp.gear || 0;
    let count = 1;

    for (const traj of correctedTrajectories) {
      let bestPoint = null;
      let bestDist = 10.0;
      for (const p of traj) {
        let dist = Math.sqrt((p.x - sp.x)**2 + (p.z - sp.z)**2);
        if (dist < bestDist && Math.cos((sp.yaw || 0) - (p.yaw || 0)) > 0.5) {
          bestDist = dist;
          bestPoint = p;
        }
      }
      if (bestPoint) {
        sumX += bestPoint.x; sumY += (bestPoint.y || 0); sumZ += bestPoint.z;
        sumSin += Math.sin(bestPoint.yaw || 0); sumCos += Math.cos(bestPoint.yaw || 0);
        sumDL += (bestPoint.drivingLine || 0); sumSpeed += (bestPoint.speed || 0);
        sumBrake += (bestPoint.brake || 0); sumGear += (bestPoint.gear || 0);
        count++;
      }
    }

    let ax = sumX / count, ay = sumY / count, az = sumZ / count;
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax);
    minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
    
    // Calculate lateral width
    let widthLeft = 1.0; // minimum 1m half-width
    let widthRight = 1.0;
    
    // Second pass to calculate variance (or we can just use the points we found)
    // To be precise without storing all bestPoints, we could do it in one pass if we tracked min/max projections, but since we didn't, let's just do a quick re-scan for boundaries
    for (const traj of correctedTrajectories) {
      for (const p of traj) {
        let dx = p.x - ax;
        let dz = p.z - az;
        let distSq = dx*dx + dz*dz;
        if (distSq < 100) { // within 10m radius
           // Project onto normal vector. Normal vector is (-cos(yaw), sin(yaw)) assuming X is east, Z is north
           // Depending on Forza coords, lateral projection is dot product with normal
           let lateral = dx * Math.cos(sp.yaw || 0) - dz * Math.sin(sp.yaw || 0);
           if (lateral > widthLeft) widthLeft = lateral;
           if (-lateral > widthRight) widthRight = -lateral;
        }
      }
    }

    mergedCenterline.push({
      x: ax, y: ay, z: az,
      yaw: Math.atan2(sumSin / count, sumCos / count),
      drivingLine: sumDL / count, speed: sumSpeed / count,
      brake: sumBrake / count, gear: sumGear / count,
      widthLeft: Math.min(widthLeft, 12.0), // cap at 12m
      widthRight: Math.min(widthRight, 12.0),
      confidence: Math.min(count / trajectories.length, 1)
    });
  }

  const centerline = smoothCenterline(mergedCenterline, 5);
  const turns = detectTurnsEnhanced(centerline);
  let length = 0;
  for (let i = 1; i < centerline.length; i++) {
    length += Math.sqrt((centerline[i].x - centerline[i-1].x)**2 + (centerline[i].z - centerline[i-1].z)**2);
  }

  return {
    centerline,
    turns,
    length: Math.round(length),
    pointCount: centerline.length,
    trajectoryCount: trajectories.length,
    bounds: { minX, maxX, minZ, maxZ },
    routeBook: { turns, straights: [] },
    dataSourceCount: trajectories.length
  };
}
export function resampleCenterline(traj, interval = 2.0) {
  if (!traj || traj.length < 2) return traj;
  const resampled = [traj[0]];
  for (let i = 1; i < traj.length; i++) {
    let p1 = resampled[resampled.length - 1];
    let p2 = traj[i];
    let dx = p2.x - p1.x, dz = p2.z - p1.z;
    let dist = Math.sqrt(dx*dx + dz*dz);
    if (dist >= interval) resampled.push(p2);
  }
  return resampled;
}

export function smoothCenterline(centerline, iterations = 5) {
  if (!centerline || centerline.length < 4) return centerline;
  let pts = [];
  
  // Catmull-Rom Spline Interpolation for smooth curves and consistent point density
  for (let i = 0; i < centerline.length - 3; i++) {
    const p0 = centerline[i];
    const p1 = centerline[i + 1];
    const p2 = centerline[i + 2];
    const p3 = centerline[i + 3];
    
    let dist = Math.sqrt((p2.x - p1.x)**2 + (p2.z - p1.z)**2);
    let numPoints = Math.max(1, Math.ceil(dist / 2.0)); // Densify to ~2m intervals
    
    for (let t = 0; t < 1; t += 1.0 / numPoints) {
      const t2 = t * t;
      const t3 = t2 * t;
      const f0 = -0.5 * t3 + t2 - 0.5 * t;
      const f1 = 1.5 * t3 - 2.5 * t2 + 1.0;
      const f2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
      const f3 = 0.5 * t3 - 0.5 * t2;
      
      const x = p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3;
      const z = p0.z * f0 + p1.z * f1 + p2.z * f2 + p3.z * f3;
      
      const yaw = p1.yaw * (1 - t) + p2.yaw * t;
      const speed = p1.speed * (1 - t) + p2.speed * t;
      
      pts.push({ ...p1, x, z, yaw, speed });
    }
  }
  pts.push(centerline[centerline.length - 2]);
  pts.push(centerline[centerline.length - 1]);
  
  // Light Gaussian smoothing to remove micro-jitter
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 1; i < pts.length - 1; i++) {
      pts[i].x = pts[i-1].x * 0.25 + pts[i].x * 0.5 + pts[i+1].x * 0.25;
      pts[i].z = pts[i-1].z * 0.25 + pts[i].z * 0.5 + pts[i+1].z * 0.25;
    }
  }
  
  // Calculate First & Second Derivatives and Curvature (Kappa)
  for (let i = 1; i < pts.length - 1; i++) {
    let dx = (pts[i+1].x - pts[i-1].x) / 2.0;
    let dz = (pts[i+1].z - pts[i-1].z) / 2.0;
    let ddx = pts[i+1].x - 2 * pts[i].x + pts[i-1].x;
    let ddz = pts[i+1].z - 2 * pts[i].z + pts[i-1].z;
    
    let denominator = Math.pow(dx*dx + dz*dz, 1.5);
    // Signed curvature: positive = Right, negative = Left (depends on coordinate system)
    // Forza X is East, Z is North. Usually Left is positive in standard math, let's just use raw cross product
    let cross = dx * ddz - dz * ddx;
    pts[i].kappa = denominator > 1e-6 ? cross / denominator : 0;
    let radius = Math.abs(pts[i].kappa) > 1e-6 ? 1.0 / Math.abs(pts[i].kappa) : 10000;
    pts[i].radius = Math.min(radius, 10000); // cap at 10km
  }
  pts[0].kappa = 0; pts[0].radius = 10000;
  pts[pts.length-1].kappa = 0; pts[pts.length-1].radius = 10000;
  
  return pts;
}

export function generateNavigationData() { return {}; }
export function calculateTrackSimilarity() { return 1; }
export function generateSectors() { return []; }
export function recognizeTrack() { return null; }
export function validateTrackQuality() { return true; }

export function detectTurnsEnhanced(centerline) {
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
      turnDirection = Math.sign(k);
    } else if (inTurn) {
      if (r < minRadius) {
        minRadius = r;
        turnDirection = Math.sign(k); // update direction at apex
      }
      
      // Threshold to exit a turn (Radius > 300m for a few points)
      if (r > 300) {
        let lengthPts = i - turnStartIdx;
        if (lengthPts > 3) {
          let midIdx = Math.floor((turnStartIdx + i) / 2);
          let pt = centerline[midIdx];
          
          // Rally Pace Note Classification
          let severity = "";
          if (minRadius <= 25) severity = "发卡弯";
          else if (minRadius <= 45) severity = "2";
          else if (minRadius <= 75) severity = "3";
          else if (minRadius <= 110) severity = "4";
          else if (minRadius <= 150) severity = "5";
          else severity = "6";
          
          let dirStr = turnDirection > 0 ? "右" : "左";
          let note = `${dirStr}${severity}`;
          
          let yawStart = centerline[turnStartIdx].yaw || 0;
          let yawEnd = centerline[i].yaw || 0;
          let angleDiff = Math.abs(yawEnd - yawStart) * 180 / Math.PI;
          if (angleDiff > 180) angleDiff = 360 - angleDiff;
          
          let brakePointIdx = Math.max(0, turnStartIdx - Math.floor(100 / 2)); // roughly 100m before
          
          turns.push({
            id: 'T' + turnCount,
            name: note,
            index: midIdx,
            x: pt.x,
            y: pt.y,
            z: pt.z,
            startX: centerline[turnStartIdx].x,
            startZ: centerline[turnStartIdx].z,
            endX: centerline[i].x,
            endZ: centerline[i].z,
            suggestedBrakePoint: brakePointIdx,
            brakePointX: centerline[brakePointIdx].x,
            brakePointZ: centerline[brakePointIdx].z,
            startIdx: turnStartIdx,
            endIdx: i,
            apexRadius: Math.round(minRadius),
            radius: Math.round(minRadius),
            angle: angleDiff,
            severity: severity,
            type: severity,
            turnCategory: note,
            direction: turnDirection > 0 ? "right" : "left"
          });
          turnCount++;
        }
        inTurn = false;
      }
    }
  }
  return turns;
}
export function buildRouteBook() { return { turns: [], straights: [] }; }
