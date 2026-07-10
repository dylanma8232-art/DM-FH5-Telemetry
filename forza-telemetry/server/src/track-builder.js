/**
 * 环道闭合修复：检测首尾重叠并截断尾巴
 * 问题：中心线在起跑线区域来回折叠，产生自交叉
 * 修复：找到中心线第一次回到起点的位置，截断之后的尾巴
 * @param {Array} centerline - 中心线
 * @returns {Array} 修复后的中心线
 */
function fixLoopClosure(centerline) {
  if (!centerline || centerline.length < 50) return centerline;
  
  const first = centerline[0];
  const last = centerline[centerline.length - 1];
  const endGap = Math.sqrt((first.x - last.x) ** 2 + (first.z - last.z) ** 2);
  
  // 只处理环道（首尾距离<50米）
  if (endGap >= 50) return centerline;
  
  // 从第10%位置开始找中心线第一次回到起点附近的位置
  // （跳过起点附近的噪声）
  const minSearchIdx = Math.floor(centerline.length * 0.1);
  let returnIdx = -1;
  
  for (let i = minSearchIdx; i < centerline.length - 1; i++) {
    const dist = Math.sqrt((centerline[i].x - first.x) ** 2 + (centerline[i].z - first.z) ** 2);
    if (dist < 15) {
      returnIdx = i;
      break;
    }
  }
  
  // 如果没有找到回到起点的位置，不需要修复
  if (returnIdx === -1) return centerline;
  
  // 如果截断点太靠近起点（<30%），不需要修复
  if (returnIdx < centerline.length * 0.3) return centerline;
  
  // 截断尾巴，保留干净的中心线
  const tailSize = centerline.length - returnIdx;
  console.log(`[环道闭合修复] 中心线在点${returnIdx}回到起点，截断尾部${tailSize}个点`);
  
  const result = centerline.slice(0, returnIdx + 1);
  
  // 强制首尾闭合
  result.push({
    ...first,
    x: first.x,
    z: first.z,
    y: first.y,
  });
  
  return result;
}

/**
 * 使用游戏提供的lapNum变更点作为闭合点提取单圈
 * 当lapNum从N变成N+1时，那个点就是闭合点（一圈结束）
 * @param {Array} positions - 轨迹点数组
 * @returns {Object} { isLoop: boolean, singleLap: Array, method: string }
 */
function detectLoopAndExtractSingleLap(positions) {
  if (!positions || positions.length < 100) {
    return { isLoop: false, singleLap: positions, method: 'none' };
  }
  
  // ★ 使用游戏提供的lapNum变更点作为闭合点
  // 当lapNum从N变成N+1时，那个点就是闭合点（一圈结束）
  const lapChanges = [];
  for (let i = 1; i < positions.length; i++) {
    const prevLap = positions[i-1].lapNum || 0;
    const currLap = positions[i].lapNum || 0;
    if (currLap > prevLap) {
      lapChanges.push({ idx: i, fromLap: prevLap, toLap: currLap });
    }
  }
  
  // 如果有圈数变更，直接用变更点提取单圈
  if (lapChanges.length >= 1) {
    // 选择中间的变更点（避免第一圈和最后一圈）
    const targetIdx = Math.min(Math.floor(lapChanges.length / 2), lapChanges.length - 1);
    const change = lapChanges[targetIdx];
    
    // 找到这一圈的开始位置（上一个变更点或起点）
    const startIdx = targetIdx > 0 ? lapChanges[targetIdx - 1].idx : 0;
    let singleLap = positions.slice(startIdx, change.idx);
    
    if (singleLap.length >= 50) {
      // 环道缝合：将首尾两端平滑连接，抹平起跑线处的物理裂口
      singleLap = stitchLoopTrajectory(singleLap);
      console.log(`[环道检测] 使用lapNum变更点: 圈${change.fromLap}→${change.toLap}在点${change.idx}, 单圈${singleLap.length}点 (从点${startIdx}到${change.idx})`);
      return {
        isLoop: true,
        singleLap: singleLap,
        method: 'lapNum'
      };
    }
  }
  
  // 没有lapNum变更，说明是点对点赛道（只跑了一圈或没跑完）
  return { isLoop: false, singleLap: positions, method: 'none' };
}

/**
 * 环道缝合：将环形轨迹的首尾两端平滑连接，抹平起跑线处的物理裂口
 * @param {Array} traj 轨迹点数组
 * @returns {Array} 缝合后的轨迹
 */
function stitchLoopTrajectory(traj) {
  if (!traj || traj.length < 50) return traj;
  
  const pStart = traj[0];
  const pEnd = traj[traj.length - 1];
  const dx = pStart.x - pEnd.x;
  const dz = pStart.z - pEnd.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  // 如果断口在 5米到 300米之间，进行渐进式平滑缝合
  if (dist > 5 && dist < 300) {
    // 选取最后 15% 的点（至少20个点，最多100个点）用于过渡缝合
    const stitchCount = Math.max(20, Math.min(100, Math.floor(traj.length * 0.15)));
    const startStitchIdx = traj.length - stitchCount;
    
    console.log(`[环道缝合] 缝合断口距离: ${dist.toFixed(2)}米, 过渡点数: ${stitchCount}`);
    
    // 对所有的坐标和属性进行线性渐进偏置
    for (let i = 0; i < stitchCount; i++) {
      const idx = startStitchIdx + i;
      const ratio = (i + 1) / stitchCount; // 渐变系数：0 -> 1
      
      traj[idx].x += dx * ratio;
      traj[idx].z += dz * ratio;
      if (traj[idx].y !== undefined && pStart.y !== undefined) {
        traj[idx].y += (pStart.y - traj[idx].y) * ratio;
      }
      
      // 平滑过度 yaw 方向角
      let startYaw = pStart.yaw || 0;
      let currYaw = traj[idx].yaw || 0;
      let yawDiff = startYaw - currYaw;
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
      
      traj[idx].yaw = currYaw + yawDiff * ratio;
    }
    
    // 强制最后一点完全等同于起点
    traj[traj.length - 1].x = pStart.x;
    traj[traj.length - 1].z = pStart.z;
    if (pStart.y !== undefined) traj[traj.length - 1].y = pStart.y;
    traj[traj.length - 1].yaw = pStart.yaw;
  }
  
  return traj;
}

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

  // ★ 环道检测：对每条轨迹检测是否为环道，如果是则只取单圈
  const processedTrajectories = [];
  let detectedIsLoop = false; // 记录是否检测到环道
  for (const traj of trajectories) {
    if (!traj || traj.length < 100) {
      processedTrajectories.push(traj);
      continue;
    }
    
    // 物理补密预处理，防止因丢包或点稀疏导致闭合点与曲率周期检测失败
    const denseTraj = densifyTrajectory(traj, 5.0);
    const result = detectLoopAndExtractSingleLap(denseTraj);
    if (result.isLoop) {
      console.log(`[环道检测] 检测到环道，方法: ${result.method}，原始点数: ${traj.length} -> 单圈点数: ${result.singleLap.length}`);
      processedTrajectories.push(result.singleLap);
      detectedIsLoop = true;
    } else {
      processedTrajectories.push(traj);
    }
  }

  // ★ 环道首尾对齐：找到所有单圈的起始点聚类中心，对齐所有轨迹的首尾
  const loopTrajectories = processedTrajectories.filter(t => t && t.length > 50);
  if (loopTrajectories.length > 1) {
    // 收集所有单圈的起点和终点
    const startPoints = loopTrajectories.map(t => ({ x: t[0].x, z: t[0].z }));
    const endPoints = loopTrajectories.map(t => ({ x: t[t.length-1].x, z: t[t.length-1].z }));
    
    // 找到起点的聚类中心（排除异常值）
    const avgStartX = startPoints.reduce((s, p) => s + p.x, 0) / startPoints.length;
    const avgStartZ = startPoints.reduce((s, p) => s + p.z, 0) / startPoints.length;
    
    // 对每个单圈，计算起点到聚类中心的偏移，然后平移整个轨迹
    for (const traj of loopTrajectories) {
      const offsetX = avgStartX - traj[0].x;
      const offsetZ = avgStartZ - traj[0].z;
      const dist = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
      
      // 只对齐偏移较大的轨迹（>10米）
      if (dist > 10) {
        console.log(`[环道对齐] 轨迹起点偏移${dist.toFixed(1)}米，平移到聚类中心`);
        for (const p of traj) {
          p.x += offsetX;
          p.z += offsetZ;
        }
        // 重新缝合
        stitchLoopTrajectory(traj);
      }
    }
  }

  const cleanTrajectories = [];
  for (const traj of processedTrajectories) {
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
      
      // 物理极限截断：移距 > 150米百分之百为传送或严重丢包，直接在此强行切断！
      if (dist > 150.0) {
        if (current.length >= 15) cleanTrajectories.push(current);
        current = [];
      }
      current.push(traj[i]);
    }
    if (current.length >= 15) cleanTrajectories.push(current);
  }

  if (cleanTrajectories.length === 0) return null;

  cleanTrajectories.sort((a, b) => b.length - a.length);
  const skeleton = resampleCenterline(cleanTrajectories[0], 2.0);

  // 核心安全升级：过滤丢弃那些平均偏离主中线超过 20 米的脏轨迹段（主要是悬空传送线或乱车线）
  const validTrajectories = [];
  for (let idx = 0; idx < cleanTrajectories.length; idx++) {
    const traj = cleanTrajectories[idx];
    if (idx === 0) {
      validTrajectories.push(traj);
      continue;
    }

    // 计算整条轨迹上的点到 skeleton 的平均最近距离
    let sumMinDist = 0;
    for (const p of traj) {
      let minDist = Infinity;
      for (const sp of skeleton) {
        const d = Math.sqrt((p.x - sp.x) ** 2 + (p.z - sp.z) ** 2);
        if (d < minDist) minDist = d;
      }
      sumMinDist += minDist;
    }
    const avgDist = sumMinDist / traj.length;

    // 如果平均偏差 > 20 米，说明是偏离极远的脏线或传送跳跃轨迹线，直接予以剔除
    if (avgDist > 20.0) {
      console.log(`[对齐过滤] 丢弃与主赛道平均偏离过大的脏轨迹段, 平均偏离距离: ${avgDist.toFixed(2)}米, 点数: ${traj.length}`);
    } else {
      validTrajectories.push(traj);
    }
  }

  const correctedTrajectories = validTrajectories.map(traj => correctTrajectoryDrivingLine(densifyTrajectory(traj, 2.0)));

  let mergedCenterline = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  // 预先计算骨架点切向的法线向量与航向角，避免因撞墙/打转导致 sp.yaw 异常，使路面宽度投影完全平滑
  const skeletonNormals = [];
  const skeletonYaws = [];
  for (let idx = 0; idx < skeleton.length; idx++) {
    let nx = 0, nz = 1;
    let yaw = skeleton[idx].yaw || 0;
    if (idx < skeleton.length - 1) {
      const dx = skeleton[idx + 1].x - skeleton[idx].x;
      const dz = skeleton[idx + 1].z - skeleton[idx].z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
      nx = -dz / len;
      nz = dx / len;
      yaw = Math.atan2(dz, dx);
    } else if (idx > 0) {
      const dx = skeleton[idx].x - skeleton[idx - 1].x;
      const dz = skeleton[idx].z - skeleton[idx - 1].z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1.0;
      nx = -dz / len;
      nz = dx / len;
      yaw = Math.atan2(dz, dx);
    }
    skeletonNormals.push({ nx, nz });
    skeletonYaws.push(yaw);
  }

  for (let spIdx = 0; spIdx < skeleton.length; spIdx++) {
    const sp = skeleton[spIdx];
    const norm = skeletonNormals[spIdx];
    const spYaw = skeletonYaws[spIdx];

    // 恢复原始坐标平均法（更稳定）
    let sumX = sp.x, sumY = sp.y || 0, sumZ = sp.z;
    let sumSin = Math.sin(spYaw), sumCos = Math.cos(spYaw);
    let sumDL = sp.drivingLine || 0, sumSpeed = sp.speed || 0, sumBrake = sp.brake || 0, sumGear = sp.gear || 0;
    let sumRoll = sp.roll || 0;
    let sumPitch = sp.pitch || 0;
    let sumSuspFL = sp.suspFL !== undefined ? sp.suspFL : 0.5;
    let sumSuspFR = sp.suspFR !== undefined ? sp.suspFR : 0.5;
    let sumSuspRL = sp.suspRL !== undefined ? sp.suspRL : 0.5;
    let sumSuspRR = sp.suspRR !== undefined ? sp.suspRR : 0.5;
    let sumGLat = sp.gLat || 0;
    let count = 1;

    for (const traj of correctedTrajectories) {
      let bestPoint = null;
      let bestDist = 10.0;
      for (const p of traj) {
        let dist = Math.sqrt((p.x - sp.x)**2 + (p.z - sp.z)**2);
        if (dist < bestDist && Math.cos(spYaw - (p.yaw || 0)) > 0.5) {
          bestDist = dist;
          bestPoint = p;
        }
      }
      if (bestPoint) {
        sumX += bestPoint.x; sumY += (bestPoint.y || 0); sumZ += bestPoint.z;
        sumSin += Math.sin(bestPoint.yaw || 0); sumCos += Math.cos(bestPoint.yaw || 0);
        sumDL += (bestPoint.drivingLine || 0); sumSpeed += (bestPoint.speed || 0);
        sumBrake += (bestPoint.brake || 0); sumGear += (bestPoint.gear || 0);
        sumRoll += (bestPoint.roll || 0);
        sumPitch += (bestPoint.pitch || 0);
        sumSuspFL += (bestPoint.suspFL !== undefined ? bestPoint.suspFL : 0.5);
        sumSuspFR += (bestPoint.suspFR !== undefined ? bestPoint.suspFR : 0.5);
        sumSuspRL += (bestPoint.suspRL !== undefined ? bestPoint.suspRL : 0.5);
        sumSuspRR += (bestPoint.suspRR !== undefined ? bestPoint.suspRR : 0.5);
        sumGLat += (bestPoint.gLat || 0);
        count++;
      }
    }

    let ax = sumX / count, ay = sumY / count, az = sumZ / count;
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax);
    minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
    
    // 宽度计算：MAD + P90（保留此改进）
    const lateralOffsets = [];
    for (const traj of correctedTrajectories) {
      for (const p of traj) {
        let dx = p.x - ax;
        let dz = p.z - az;
        let distSq = dx*dx + dz*dz;
        if (distSq < 100) {
           let lateral = dx * norm.nx + dz * norm.nz;
           lateralOffsets.push(lateral);
        }
      }
    }

    let halfWidth = 6.0;
    if (lateralOffsets.length > 0) {
      const sorted = [...lateralOffsets].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const devs = lateralOffsets.map(l => Math.abs(l - median)).sort((a, b) => a - b);
      const mad = devs[Math.floor(devs.length / 2)];
      const p90 = devs[Math.floor(devs.length * 0.9)] || 0;
      halfWidth = Math.min(Math.max(mad * 2.5, p90), 12.0);
      halfWidth = Math.max(halfWidth, 6.0);
    }

    mergedCenterline.push({
      x: ax, y: ay, z: az,
      yaw: Math.atan2(sumSin / count, sumCos / count),
      drivingLine: sumDL / count, speed: sumSpeed / count,
      brake: sumBrake / count, gear: sumGear / count,
      roll: sumRoll / count,
      pitch: sumPitch / count,
      suspFL: sumSuspFL / count,
      suspFR: sumSuspFR / count,
      suspRL: sumSuspRL / count,
      suspRR: sumSuspRR / count,
      gLat: sumGLat / count,
      widthLeft: halfWidth,
      widthRight: halfWidth,
      confidence: Math.min(count / trajectories.length, 1)
    });
  }

  // 宽度毛刺消除：中值滤波后处理
  medianFilterWidths(mergedCenterline, 5);
  filterKinks(mergedCenterline, 35);

  const centerline = smoothCenterline(mergedCenterline, 5);

  // 弯道几何重建：用圆弧拟合弯道，消除走线影响（先用临时 turns 做圆弧拟合）
  const turnsForReconstruct = detectTurnsEnhanced(centerline);
  let reconstructedCenterline = reconstructTrackGeometry(centerline, turnsForReconstruct);

  // ★ 环道闭合修复：检测起跑线区域的自交叉并截断尾巴（会改变中心线长度）
  reconstructedCenterline = fixLoopClosure(reconstructedCenterline);

  // ★ 在最终中心线上重新检测弯道，确保 startIdx/endIdx/index 与 reconstructedCenterline 完全对齐
  const turns = detectTurnsEnhanced(reconstructedCenterline);


  let length = 0;
  for (let i = 1; i < reconstructedCenterline.length; i++) {
    length += Math.sqrt((reconstructedCenterline[i].x - reconstructedCenterline[i-1].x)**2 + (reconstructedCenterline[i].z - reconstructedCenterline[i-1].z)**2);
  }

  // 收集校准后轨迹的所有点，传入以统计推荐数据和直道信息
  const allPoints = [];
  correctedTrajectories.forEach(traj => {
    if (traj) allPoints.push(...traj);
  });

  // 几何兜底：如果 lapNum 未触发但中心线首尾距离 < 30m，也标记为环道
  return {
    centerline: reconstructedCenterline,
    turns,
    length: Math.round(length),
    pointCount: reconstructedCenterline.length,
    trajectoryCount: trajectories.length,
    bounds: { minX, maxX, minZ, maxZ },
    routeBook: buildRouteBook(reconstructedCenterline, turns, allPoints),
    dataSourceCount: trajectories.length,
    isLoop: detectedIsLoop  // 只信 lapNum，不猜几何
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
      
      // ====== P1 改动：yaw 角度插值修正（处理 359°→1° wrap-around） ======
      let yaw1 = p1.yaw || 0, yaw2 = p2.yaw || 0;
      let yawDiff = yaw2 - yaw1;
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
      const yaw = yaw1 + yawDiff * t;
      const speed = p1.speed * (1 - t) + p2.speed * t;
      const roll = (p1.roll || 0) * (1 - t) + (p2.roll || 0) * t;
      const pitch = (p1.pitch || 0) * (1 - t) + (p2.pitch || 0) * t;
      const suspFL = (p1.suspFL !== undefined ? p1.suspFL : 0.5) * (1 - t) + (p2.suspFL !== undefined ? p2.suspFL : 0.5) * t;
      const suspFR = (p1.suspFR !== undefined ? p1.suspFR : 0.5) * (1 - t) + (p2.suspFR !== undefined ? p2.suspFR : 0.5) * t;
      const suspRL = (p1.suspRL !== undefined ? p1.suspRL : 0.5) * (1 - t) + (p2.suspRL !== undefined ? p2.suspRL : 0.5) * t;
      const suspRR = (p1.suspRR !== undefined ? p1.suspRR : 0.5) * (1 - t) + (p2.suspRR !== undefined ? p2.suspRR : 0.5) * t;
      
      pts.push({ 
        ...p1, 
        x, z, yaw, speed, 
        roll, pitch, 
        suspFL, suspFR, suspRL, suspRR 
      });
    }
  }
  pts.push(centerline[centerline.length - 2]);
  pts.push(centerline[centerline.length - 1]);
  
  // ====== P0 改动：曲率感知高斯平滑（弯道弱平滑，直道强平滑） ======
  // 先计算初始曲率（用于自适应平滑）
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = (pts[i + 1].x - pts[i - 1].x) / 2.0;
    const dz = (pts[i + 1].z - pts[i - 1].z) / 2.0;
    const ddx = pts[i + 1].x - 2 * pts[i].x + pts[i - 1].x;
    const ddz = pts[i + 1].z - 2 * pts[i].z + pts[i - 1].z;
    const denom = Math.pow(dx * dx + dz * dz, 1.5);
    const cross = dz * ddx - dx * ddz;
    pts[i].kappa = denom > 1e-6 ? cross / denom : 0;
  }
  pts[0].kappa = 0; pts[pts.length - 1].kappa = 0;

  // 曲率感知高斯平滑：弯道弱平滑，直道强平滑
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 2; i < pts.length - 2; i++) {
      const absK = Math.abs(pts[i].kappa);
      // 曲率越大，平滑越弱（直道 κ≈0 → 强平滑，弯道 κ 大 → 弱平滑）
      const smoothingStrength = Math.max(0.1, 1.0 - absK * 100);

      // 自适应窗口：直道用5点窗口，弯道用3点窗口
      const windowSize = absK < 0.01 ? 2 : 1;

      let sumX = pts[i].x, sumZ = pts[i].z, weight = 1.0;
      for (let j = 1; j <= windowSize; j++) {
        const w = Math.exp(-0.5 * (j / (windowSize * 0.7)) ** 2) * smoothingStrength;
        sumX += (pts[i - j].x + pts[i + j].x) * w * 0.5;
        sumZ += (pts[i - j].z + pts[i + j].z) * w * 0.5;
        weight += w;
      }
      pts[i].x = sumX / weight;
      pts[i].z = sumZ / weight;
    }
  }
  
  // Calculate First & Second Derivatives and Curvature (Kappa)
  for (let i = 1; i < pts.length - 1; i++) {
    let dx = (pts[i+1].x - pts[i-1].x) / 2.0;
    let dz = (pts[i+1].z - pts[i-1].z) / 2.0;
    let ddx = pts[i+1].x - 2 * pts[i].x + pts[i-1].x;
    let ddz = pts[i+1].z - 2 * pts[i].z + pts[i-1].z;
    
    let denominator = Math.pow(dx*dx + dz*dz, 1.5);
    // FH5 左手坐标系：X=East, Z=North, Y=Up
    // 叉积取反：positive kappa = clockwise = Right turn
    let cross = dz * ddx - dx * ddz;
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
/**
 * 自动平均切分3个Sectors
 */
export function generateSectors(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const N = centerline.length;
  const s1Idx = Math.floor(N / 3);
  const s2Idx = Math.floor(2 * N / 3);
  const s3Idx = N - 1;

  return [
    {
      sectorIndex: 1,
      centerlineIndex: s1Idx,
      x: centerline[s1Idx].x,
      y: centerline[s1Idx].y,
      z: centerline[s1Idx].z
    },
    {
      sectorIndex: 2,
      centerlineIndex: s2Idx,
      x: centerline[s2Idx].x,
      y: centerline[s2Idx].y,
      z: centerline[s2Idx].z
    },
    {
      sectorIndex: 3,
      centerlineIndex: s3Idx,
      x: centerline[s3Idx].x,
      y: centerline[s3Idx].y,
      z: centerline[s3Idx].z
    }
  ];
}
export function recognizeTrack() { return null; }
export function validateTrackQuality(trackData) {
  if (!trackData) {
    return { overallScore: 0, details: {}, warnings: ['无赛道数据'], suggestions: [] };
  }

  const scores = {};
  const warnings = [];
  const suggestions = [];

  // 1. 轨迹点数量评分（0-100）
  const pointCount = trackData.pointCount || (trackData.centerline ? trackData.centerline.length : 0);
  if (pointCount < 20) {
    scores.points = 10;
    warnings.push('轨迹点数量严重不足（少于20个），赛道数据不可靠');
    suggestions.push('请至少跑1圈完整的赛道');
  } else if (pointCount < 50) {
    scores.points = 35;
    warnings.push('轨迹点数量偏少，弯道检测可能不准确');
    suggestions.push('建议再跑1-2圈来增加轨迹点密度');
  } else if (pointCount < 100) {
    scores.points = 65;
  } else if (pointCount < 200) {
    scores.points = 85;
  } else {
    scores.points = 100;
  }

  // 2. 弯道检测质量评分（0-100）
  const turns = trackData.turns || [];
  const centerline = trackData.centerline || [];
  if (turns.length === 0) {
    scores.turns = 20;
    warnings.push('未检测到弯道，路书数据为空');
    suggestions.push('赛道数据可能不完整，尝试重新录制');
  } else {
    let turnQualityScore = 100;
    // 检查每个弯道是否有有效的方向几何属性
    let invalidTurns = 0;
    for (const turn of turns) {
      if (turn.direction !== 'left' && turn.direction !== 'right') {
        invalidTurns++;
      }
    }
    if (invalidTurns > 0) {
      turnQualityScore -= Math.min(40, invalidTurns * 10);
      warnings.push(`${invalidTurns}/${turns.length} 个弯道方向未知`);
    }
    scores.turns = Math.max(10, Math.min(100, turnQualityScore));
  }

  // 3. 路书完整性评分（0-100）
  const routeBook = trackData.routeBook;
  if (!routeBook || !routeBook.turns || routeBook.turns.length === 0) {
    scores.routeBook = 15;
    warnings.push('路书结构不完整');
    suggestions.push('需要录制完整的地图中心线来生成路书');
  } else {
    let rbScore = 100;
    // 检查是否有直道数据
    if (!routeBook.straights || routeBook.straights.length === 0) {
      rbScore -= 20;
      warnings.push('路书缺少直道间距数据');
    }
    scores.routeBook = Math.max(10, Math.min(100, rbScore));
  }

  // 4. 数据丰富度评分（基于轨迹次数）（0-100）
  const trajCount = trackData.trajectoryCount || 1;
  if (trajCount === 1) {
    scores.dataRichness = 50;
    suggestions.push('仅录制了1圈，建议多跑1-2圈以重合校准中心线');
  } else if (trajCount === 2) {
    scores.dataRichness = 80;
  } else {
    scores.dataRichness = 100;
  }

  // 5. 赛道覆盖度评分（0-100）- 基于中心线是否连续
  let coverageScore = 60;
  if (centerline.length > 10) {
    // 检查中心线是否有大间距（可能有断点）
    let maxGap = 0;
    let gapCount = 0;
    for (let i = 1; i < centerline.length; i++) {
      const dx = centerline[i].x - centerline[i-1].x;
      const dz = centerline[i].z - centerline[i-1].z;
      const gap = Math.sqrt(dx * dx + dz * dz);
      if (gap > 20) gapCount++;
      if (gap > maxGap) maxGap = gap;
    }
    if (gapCount > centerline.length * 0.1) {
      coverageScore -= 20;
      warnings.push(`中心线有${gapCount}个大间距点（>20米），可能存在数据断点`);
    }
    if (maxGap > 50) {
      coverageScore -= 15;
      warnings.push(`中心线最大间距${Math.round(maxGap)}米，数据质量较差`);
    }
  }
  scores.coverage = Math.max(10, Math.min(100, coverageScore));

  // 综合评分（加权平均）
  const weights = {
    points: 0.15,
    turns: 0.25,
    routeBook: 0.30,
    dataRichness: 0.15,
    coverage: 0.15
  };
  const overallScore = Math.round(
    (scores.points || 0) * weights.points +
    (scores.turns || 0) * weights.turns +
    (scores.routeBook || 0) * weights.routeBook +
    (scores.dataRichness || 0) * weights.dataRichness +
    (scores.coverage || 0) * weights.coverage
  );

  // 评级
  let grade;
  if (overallScore >= 85) grade = 'A';
  else if (overallScore >= 70) grade = 'B';
  else if (overallScore >= 50) grade = 'C';
  else if (overallScore >= 30) grade = 'D';
  else grade = 'F';

  return {
    overallScore,
    grade,
    details: scores,
    warnings,
    suggestions,
    metadata: {
      pointCount,
      turnCount: turns.length,
      trajectoryCount: trajCount,
      hasRouteBook: !!(routeBook && routeBook.turns && routeBook.turns.length > 0),
      centerlineLength: centerline.length,
      trackLength: trackData.length || 0,
    }
  };
}

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
            let midIdx = Math.floor((turnStartIdx + i) / 2);
            let pt = centerline[midIdx];
          
          let yawStart = centerline[turnStartIdx].yaw || 0;
          let yawEnd = centerline[i].yaw || 0;
          let angleDiff = Math.abs(yawEnd - yawStart) * 180 / Math.PI;
          if (angleDiff > 180) angleDiff = 360 - angleDiff;
          
          // 过滤掉小于8度（如直道上的微调、超车避让等）的微小转角，防止路书误判
          if (angleDiff >= 8.0) {
            // 离心侧倾侧向力补偿计算 (camber)
            let totalCompRoll = 0;
            let ptsCount = 0;
            let hasRollData = false;
            for (let idx = turnStartIdx; idx <= i; idx++) {
              const p = centerline[idx];
              if (!p) continue;
              if (p.roll !== undefined && p.roll !== null) hasRollData = true;
              const rollVal = p.roll || 0;
              const rollDeg = rollVal * 180 / Math.PI;
              const latG = p.gLat || (p.acceleration ? (p.acceleration.x || 0) : 0); // 使用 p.gLat 字段
              const compRoll = rollDeg - (1.5 * latG); // 侧向G力补偿：1.5度/G
              totalCompRoll += compRoll;
              ptsCount++;
            }
            const avgCompRoll = ptsCount > 0 ? totalCompRoll / ptsCount : 0;
            
            let camberType = null;
            if (hasRollData) {
              if (turnDirection > 0) { // 右弯
                if (avgCompRoll > 4.5) camberType = 'banking';
                else if (avgCompRoll < -4.5) camberType = 'off-camber';
              } else { // 左弯
                if (avgCompRoll < -4.5) camberType = 'banking';
                else if (avgCompRoll > 4.5) camberType = 'off-camber';
              }
            }

            // 盲坡与飞跳检测 (crest/jump)
            const getDist2D = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
            let maxSlopeDrop = 0;
            let maxSlopeDropIdx = -1;
            for (let j = Math.max(4, turnStartIdx - 15); j <= Math.min(centerline.length - 5, turnStartIdx + 5); j++) {
              const pPrev = centerline[j-4];
              const pCurr = centerline[j];
              const pNext = centerline[j+4];
              const slope1 = (pCurr.y - pPrev.y) / (getDist2D(pPrev, pCurr) || 1.0);
              const slope2 = (pNext.y - pCurr.y) / (getDist2D(pCurr, pNext) || 1.0);
              const slopeDrop = slope1 - slope2;
              if (slopeDrop > maxSlopeDrop) {
                maxSlopeDrop = slopeDrop;
                maxSlopeDropIdx = j;
              }
            }
            
            let crestType = null;
            if (maxSlopeDrop > 0.04) { // 坡度变化大于 4%
              // 检测通过坡顶时的平均悬挂伸展
              let totalSusp = 0;
              let suspCount = 0;
              for (let idx = Math.max(0, maxSlopeDropIdx - 2); idx <= Math.min(centerline.length - 1, maxSlopeDropIdx + 4); idx++) {
                const p = centerline[idx];
                if (p) {
                  const FL = p.suspFL !== undefined ? p.suspFL : (p.suspension ? (p.suspension.frontLeft || 0.5) : 0.5);
                  const FR = p.suspFR !== undefined ? p.suspFR : (p.suspension ? (p.suspension.frontRight || 0.5) : 0.5);
                  const RL = p.suspRL !== undefined ? p.suspRL : (p.suspension ? (p.suspension.rearLeft || 0.5) : 0.5);
                  const RR = p.suspRR !== undefined ? p.suspRR : (p.suspension ? (p.suspension.rearRight || 0.5) : 0.5);
                  totalSusp += (FL + FR + RL + RR) / 4.0;
                  suspCount++;
                }
              }
              const avgSusp = suspCount > 0 ? totalSusp / suspCount : 0.5;
              if (avgSusp > 0.85) { // 悬挂拉伸度超过85%说明严重失重/离地
                crestType = 'jump';
              } else {
                crestType = 'crest';
              }
            }

            // 标准拉力路书分级：统一 1-6 等级（基于绝对偏转角度）
            let severity = "";
            let type = "micro";
            if (angleDiff >= 130.0) {
              severity = "1"; type = "hairpin";
            } else if (angleDiff >= 90.0) {
              severity = "2"; type = "sharp";
            } else if (angleDiff >= 60.0) {
              severity = "3"; type = "medium";
            } else if (angleDiff >= 40.0) {
              severity = "4"; type = "gentle";
            } else if (angleDiff >= 20.0) {
              severity = "5"; type = "slight";
            } else {
              severity = "6"; type = "micro";
            }
            
            let dirStr = turnDirection > 0 ? "右" : "left" === "left" ? "左" : "右"; // 保证跟原来note拼接相同
            let note = `${dirStr}${severity}`;
            
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
              type: type,
              turnCategory: note,
              direction: turnDirection > 0 ? "right" : "left",
              camber: camberType,
              crest: crestType
            });
            turnCount++;
          }
        }
        inTurn = false;
      }
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
}
export function buildRouteBook(centerline, turns, allPoints) {
  if (!turns || turns.length === 0) return null;

  const routeBook = {
    turns: [],
    straights: [],
    maxSpeed: 0,
    bestLapData: {},
    dataSourceCount: new Set((allPoints || []).map(p => p.trajIndex)).size // Round 8: 数据来源轨迹数
  };

  // 赛道最大速度
  for (const p of centerline) {
    if ((p.speed || 0) > routeBook.maxSpeed) {
      routeBook.maxSpeed = Math.round(p.speed || 0);
    }
  }

  // Round 8: 按弯道索引分组统计多条轨迹的速度数据
  const turnSpeedStats = {}; // turnIndex -> { entrySpeeds: [], apexSpeeds: [], exitSpeeds: [], brakeIndices: [], gearDrops: [] }
  
  // 空间距离计算与最接近中线点查找的辅助函数
  const getDist2D = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
  const findNearestCenterlineIndex = (p, cl) => {
    let minD = Infinity;
    let nearestIdx = -1;
    for (let i = 0; i < cl.length; i++) {
      const dx = p.x - cl[i].x;
      const dz = p.z - cl[i].z;
      const d = dx * dx + dz * dz;
      if (d < minD) {
        minD = d;
        nearestIdx = i;
      }
    }
    return nearestIdx;
  };

  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    const stats = { entrySpeeds: [], apexSpeeds: [], exitSpeeds: [], brakeIndices: [], gearDrops: [] };

    // 获取该弯道在中心线上的物理坐标
    const entryPoint = centerline[turn.startIdx];
    const apexIdx = turn.index != null ? turn.index : Math.floor((turn.startIdx + turn.endIdx) / 2);
    const apexPoint = centerline[apexIdx];
    const exitPoint = centerline[turn.endIdx];
    const brakePoint = turn.brakePointIdx != null && centerline[turn.brakePointIdx] ? centerline[turn.brakePointIdx] : null;

    // 收集所有轨迹中对应弯道位置的数据
    for (const p of (allPoints || [])) {
      if (!p || p.speed <= 0) continue;

      // 1. 入弯区域速度收集 (距离 entryPoint <= 10 米)
      if (entryPoint && getDist2D(p, entryPoint) <= 10) {
        stats.entrySpeeds.push(p.speed);
      }

      // 2. 弯中区域速度收集 (距离 apexPoint <= 10 米)
      if (apexPoint && getDist2D(p, apexPoint) <= 10) {
        stats.apexSpeeds.push(p.speed);
      }

      // 3. 出弯区域速度收集 (距离 exitPoint <= 10 米)
      if (exitPoint && getDist2D(p, exitPoint) <= 10) {
        stats.exitSpeeds.push(p.speed);
      }

      // 4. 刹车点收集 (若在此处刹车, 且位置靠近刹车点物理位置 <= 15 米)
      if (p.brake > 50) {
        const targetBrakePoint = brakePoint || entryPoint; // 如果没有计算出刹车点, 以入弯点作为参考
        if (targetBrakePoint && getDist2D(p, targetBrakePoint) <= 15) {
          const clIdx = findNearestCenterlineIndex(p, centerline);
          if (clIdx !== -1) {
            stats.brakeIndices.push(clIdx);
          }
        }
      }

      // 5. 降档收集 (在弯道入口附近 L <= 15 米)
      if (entryPoint && getDist2D(p, entryPoint) <= 15) {
        const apexGear = apexPoint ? apexPoint.gear : 0;
        if (p.gear > 0 && apexGear > 0 && p.gear > apexGear) {
          stats.gearDrops.push(p.gear - apexGear);
        }
      }
    }

    turnSpeedStats[ti] = stats;
  }

  // Round 8: 稳定性速度计算（取中位数而非最大值，"最稳定的最快"）
  function getStableSpeed(speeds) {
    if (!speeds || speeds.length === 0) return 0;
    const sorted = [...speeds].sort((a, b) => a - b);
    // 取 P75 分位数（比中位数快，但排除极端值）
    const p75Idx = Math.floor(sorted.length * 0.75);
    return sorted[Math.min(p75Idx, sorted.length - 1)];
  }

  // 每个弯道的路书信息
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const stats = turnSpeedStats[i] || {};

    // Round 8: 使用累积统计值
    const stableEntrySpeed = Math.round(getStableSpeed(stats.entrySpeeds)) || turn.entrySpeed;
    const stableApexSpeed = Math.round(getStableSpeed(stats.apexSpeeds)) || turn.apexSpeed;
    const stableExitSpeed = Math.round(getStableSpeed(stats.exitSpeeds)) || turn.exitSpeed;
    const avgBrakeIdx = stats.brakeIndices.length > 0
      ? Math.round(stats.brakeIndices.reduce((a, b) => a + b, 0) / stats.brakeIndices.length)
      : turn.brakePointIdx;
    const avgGearDrop = stats.gearDrops.length > 0
      ? Math.round(stats.gearDrops.reduce((a, b) => a + b, 0) / stats.gearDrops.length)
      : turn.suggestedGearDrop;

    routeBook.turns.push({
      index: i,
      type: turn.type,
      turnCategory: turn.turnCategory,
      direction: turn.direction,
      angle: turn.angle,
      severity: turn.severity,
      camber: turn.camber,
      crest: turn.crest,
      entrySpeed: stableEntrySpeed,
      apexSpeed: stableApexSpeed,
      exitSpeed: stableExitSpeed,
      straightMaxSpeed: turn.straightMaxSpeed,
      brakePoint: {
        x: centerline[avgBrakeIdx] ? centerline[avgBrakeIdx].x : turn.brakePointX,
        z: centerline[avgBrakeIdx] ? centerline[avgBrakeIdx].z : turn.brakePointZ,
        centerlineIndex: avgBrakeIdx
      },
      apex: {
        x: turn.x,
        z: turn.z,
        centerlineIndex: turn.index
      },
      exit: {
        x: turn.endX,
        z: turn.endZ,
        centerlineIndex: turn.endIdx
      },
      suggestedGearDrop: avgGearDrop,
      radius: turn.radius,
      isChicane: turn.isChicane,
      // Round 8: 数据来源统计
      dataSources: {
        entrySpeedSamples: stats.entrySpeeds.length,
        apexSpeedSamples: stats.apexSpeeds.length,
        exitSpeedSamples: stats.exitSpeeds.length,
        brakePointSamples: stats.brakeIndices.length,
      }
    });
  }

  // 直道段信息（弯道之间的路段）
  for (let i = 0; i <= turns.length; i++) {
    const segmentStart = i === 0 ? 0 : turns[i-1].endIdx;
    const segmentEnd = i === turns.length ? centerline.length - 1 : turns[i].startIdx;

    if (segmentEnd - segmentStart < 3) continue;

    let segMaxSpeed = 0;
    let segLength = 0;
    for (let j = segmentStart + 1; j <= segmentEnd && j < centerline.length; j++) {
      const dx = centerline[j].x - centerline[j-1].x;
      const dz = centerline[j].z - centerline[j-1].z;
      segLength += Math.sqrt(dx*dx + dz*dz);
      if ((centerline[j].speed || 0) > segMaxSpeed) {
        segMaxSpeed = centerline[j].speed || 0;
      }
    }

    // 只记录长度>50米的直道
    if (segLength > 50) {
      routeBook.straights.push({
        index: i,
        startIndex: segmentStart,
        endIndex: segmentEnd,
        length: Math.round(segLength),
        maxSpeed: Math.round(segMaxSpeed),
        afterTurn: i > 0 ? i - 1 : -1,
        beforeTurn: i < turns.length ? i : -1
      });
    }
  }

  return routeBook;
}

/**
 * 最小二乘法圆弧拟合
 * @param {Array} points - 点数组 [{x, z}, ...]
 * @returns {Object|null} {cx, cz, radius} 或 null
 */
function fitArcToPoints(points) {
  if (!points || points.length < 3) return null;
  
  const n = points.length;
  let sumX = 0, sumZ = 0, sumX2 = 0, sumZ2 = 0, sumX3 = 0, sumZ3 = 0;
  let sumXZ = 0, sumX2Z = 0, sumXZ2 = 0;
  
  for (const p of points) {
    const x = p.x, z = p.z;
    sumX += x; sumZ += z;
    sumX2 += x * x; sumZ2 += z * z;
    sumX3 += x * x * x; sumZ3 += z * z * z;
    sumXZ += x * z;
    sumX2Z += x * x * z;
    sumXZ2 += x * z * z;
  }
  
  const A = n * sumX2 - sumX * sumX;
  const B = n * sumXZ - sumX * sumZ;
  const C = n * sumX3 + n * sumXZ2 - (sumX2 + sumZ2) * sumX;
  const D = n * sumXZ - sumX * sumZ;
  const E = n * sumZ2 - sumZ * sumZ;
  const F = n * sumX2Z + n * sumZ3 - (sumX2 + sumZ2) * sumZ;
  
  const det = A * E - B * D;
  if (Math.abs(det) < 1e-10) return null;
  
  const cx = (C * E - F * B) / det;
  const cz = (A * F - C * D) / det;
  
  let radius = 0;
  for (const p of points) {
    radius += Math.sqrt((p.x - cx) ** 2 + (p.z - cz) ** 2);
  }
  radius /= n;
  
  return { cx, cz, radius };
}

/**
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
          x, z,
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
function medianFilterWidths(centerline, kernelSize = 5) {
  if (!centerline || centerline.length < kernelSize) return;
  const half = Math.floor(kernelSize / 2);
  
  for (let iter = 0; iter < 2; iter++) {
    for (let i = half; i < centerline.length - half; i++) {
      const leftWindow = [];
      const rightWindow = [];
      for (let j = -half; j <= half; j++) {
        leftWindow.push(centerline[i + j].widthLeft);
        rightWindow.push(centerline[i + j].widthRight);
      }
      leftWindow.sort((a, b) => a - b);
      rightWindow.sort((a, b) => a - b);
      centerline[i].widthLeft = leftWindow[half];
      centerline[i].widthRight = rightWindow[half];
    }
  }
}

/**
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
