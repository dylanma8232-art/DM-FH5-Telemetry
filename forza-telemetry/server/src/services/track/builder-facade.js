import { densifyTrajectory, detectLoopAndExtractSingleLap, stitchLoopTrajectory, correctTrajectoryDrivingLine, fixLoopClosure } from './trajectory-cleaner.js';
import { resampleCenterline, smoothCenterline } from './centerline-processor.js';
import { medianFilterWidths } from './track-math.js';
import { filterKinks, detectTurnsEnhanced, reconstructTrackGeometry, mapOldTurnsToNewCenterline } from './track-turns.js';

export function buildTrackFromTrajectories(trajectories, options = {}) {
  const {
    oldTurns = [],
    isPaceNoteLocked = false,
    deletedTurns = []
  } = options;
  if (!trajectories || trajectories.length === 0) return null;

  // ★ 环道检测：对每条轨迹检测是否为环道，如果是则只取单圈
  const processedTrajectories = [];
  let sawLapBasedLoop = false;
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
      sawLapBasedLoop = true;
    } else {
      processedTrajectories.push(traj);
    }
  }

  // ★ 环道首尾对齐：找到所有单圈的起始点聚类中心，对齐所有轨迹的首尾
  const loopTrajectories = processedTrajectories.filter(t => t && t.length > 50);
  if (loopTrajectories.length > 1) {
    // 收集所有单圈的起点和终点
    const startPoints = loopTrajectories.map(t => ({
      x: t[0].x,
      z: t[0].z
    }));
    const endPoints = loopTrajectories.map(t => ({
      x: t[t.length - 1].x,
      z: t[t.length - 1].z
    }));

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
      let dx = traj[i].x - traj[i - 1].x;
      let dz = traj[i].z - traj[i - 1].z;
      let dist = Math.sqrt(dx * dx + dz * dz);
      let moveYaw = Math.atan2(dx, dz);
      let carYaw = traj[i - 1].yaw || 0;
      let yawDiff = moveYaw - carYaw;
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;

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
  // 圈数变化只能算候选证据。点对点赛中混入的其它片段也可能带 lapNum，
  // 不能因为任一片段就把整条冲刺赛强行闭合成环道。
  const primaryStart = skeleton[0];
  const primaryEnd = skeleton.at(-1);
  const primaryGap = primaryStart && primaryEnd ? Math.hypot(primaryEnd.x - primaryStart.x, primaryEnd.z - primaryStart.z) : Infinity;
  const detectedIsLoop = sawLapBasedLoop && primaryGap < 45;

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
  // 保留既有的建议走线校正：它只用于消除轨迹的横向偏置，随后由 RDP 分段与
  // 分段几何拟合稳定化，不能以单圈驾驶线直接定义路书结构。
  const correctedTrajectories = validTrajectories.map(traj => correctTrajectoryDrivingLine(densifyTrajectory(traj, 2.0)));
  let mergedCenterline = [];
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  // 预先计算骨架点切向的法线向量与航向角，避免因撞墙/打转导致 sp.yaw 异常，使路面宽度投影完全平滑
  const skeletonNormals = [];
  const skeletonYaws = [];
  for (let idx = 0; idx < skeleton.length; idx++) {
    let nx = 0,
      nz = 1;
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
    skeletonNormals.push({
      nx,
      nz
    });
    skeletonYaws.push(yaw);
  }
  for (let spIdx = 0; spIdx < skeleton.length; spIdx++) {
    const sp = skeleton[spIdx];
    const norm = skeletonNormals[spIdx];
    const spYaw = skeletonYaws[spIdx];

    // 恢复原始坐标平均法（更稳定）
    let sumX = sp.x,
      sumY = sp.y || 0,
      sumZ = sp.z;
    let sumSin = Math.sin(spYaw),
      sumCos = Math.cos(spYaw);
    let sumDL = sp.drivingLine || 0,
      sumSpeed = sp.speed || 0,
      sumBrake = sp.brake || 0,
      sumGear = sp.gear || 0;
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
        let dist = Math.sqrt((p.x - sp.x) ** 2 + (p.z - sp.z) ** 2);
        if (dist < bestDist && Math.cos(spYaw - (p.yaw || 0)) > 0.5) {
          bestDist = dist;
          bestPoint = p;
        }
      }
      if (bestPoint) {
        sumX += bestPoint.x;
        sumY += bestPoint.y || 0;
        sumZ += bestPoint.z;
        sumSin += Math.sin(bestPoint.yaw || 0);
        sumCos += Math.cos(bestPoint.yaw || 0);
        sumDL += bestPoint.drivingLine || 0;
        sumSpeed += bestPoint.speed || 0;
        sumBrake += bestPoint.brake || 0;
        sumGear += bestPoint.gear || 0;
        sumRoll += bestPoint.roll || 0;
        sumPitch += bestPoint.pitch || 0;
        sumSuspFL += bestPoint.suspFL !== undefined ? bestPoint.suspFL : 0.5;
        sumSuspFR += bestPoint.suspFR !== undefined ? bestPoint.suspFR : 0.5;
        sumSuspRL += bestPoint.suspRL !== undefined ? bestPoint.suspRL : 0.5;
        sumSuspRR += bestPoint.suspRR !== undefined ? bestPoint.suspRR : 0.5;
        sumGLat += bestPoint.gLat || 0;
        count++;
      }
    }
    let ax = sumX / count,
      ay = sumY / count,
      az = sumZ / count;
    minX = Math.min(minX, ax);
    maxX = Math.max(maxX, ax);
    minZ = Math.min(minZ, az);
    maxZ = Math.max(maxZ, az);

    // 宽度计算：MAD + P90（保留此改进）
    const lateralOffsets = [];
    for (const traj of correctedTrajectories) {
      for (const p of traj) {
        let dx = p.x - ax;
        let dz = p.z - az;
        let distSq = dx * dx + dz * dz;
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
      x: ax,
      y: ay,
      z: az,
      yaw: Math.atan2(sumSin / count, sumCos / count),
      drivingLine: sumDL / count,
      speed: sumSpeed / count,
      brake: sumBrake / count,
      gear: sumGear / count,
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

  // RDP 先确定宏观弯段，再对该弯段进行拟合，消除单圈走线造成的局部折角。
  // 拟合器会在不适合圆弧的段落保留原中心线，避免强制改变复杂弯的结构。
  const turnsForReconstruct = detectTurnsEnhanced(centerline);
  let reconstructedCenterline = reconstructTrackGeometry(centerline, turnsForReconstruct);

  // ★ 环道闭合修复：检测起跑线区域的自交叉并截断尾巴（会改变中心线长度）
  if (detectedIsLoop) reconstructedCenterline = fixLoopClosure(reconstructedCenterline);

  // ★ 弯道重建：结合旧有的路书锚点与黑名单
  const getDist2D = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.z - p2.z) ** 2);
  let turns = [];
  if (isPaceNoteLocked) {
    // 全局锁定，只映射旧弯道，不进行新弯道检测
    turns = mapOldTurnsToNewCenterline(oldTurns, reconstructedCenterline, detectedIsLoop);
  } else {
    // 局部锁定，先找出新弯道，然后用黑名单过滤，再用保留的旧弯道覆盖
    let rawTurns = detectTurnsEnhanced(reconstructedCenterline);

    // 黑名单过滤
    if (deletedTurns && deletedTurns.length > 0) {
      rawTurns = rawTurns.filter(t => {
        return !deletedTurns.some(delT => getDist2D(t, delT) < 30);
      });
    }

    // 映射被锁定的旧弯道
    const lockedOldTurns = oldTurns.filter(t => t.isLockedByUser);
    if (lockedOldTurns.length > 0) {
      const mappedLockedTurns = mapOldTurnsToNewCenterline(lockedOldTurns, reconstructedCenterline, detectedIsLoop);

      // 合并逻辑：如果新检测出的弯道与任何 lockedOldTurn 距离 < 30米，则剔除该新弯道
      rawTurns = rawTurns.filter(newT => {
        return !mappedLockedTurns.some(lockedT => getDist2D(newT, lockedT) < 30);
      });
      turns = [...rawTurns, ...mappedLockedTurns];
      // 重新排序
      turns.sort((a, b) => a.index - b.index);
    } else {
      turns = rawTurns;
    }
  }

  // 重新分配 ID
  turns.forEach((t, i) => t.id = 'T' + (i + 1));
  let length = 0;
  for (let i = 1; i < reconstructedCenterline.length; i++) {
    length += Math.sqrt((reconstructedCenterline[i].x - reconstructedCenterline[i - 1].x) ** 2 + (reconstructedCenterline[i].z - reconstructedCenterline[i - 1].z) ** 2);
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
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ
    },
    routeBook: buildRouteBook(reconstructedCenterline, turns, allPoints),
    dataSourceCount: trajectories.length,
    isLoop: detectedIsLoop, // 只信 lapNum，不猜几何
    geometry: {
      schemaVersion: 2,
      algorithm: 'rdp-fit-v1',
      generatedAt: new Date().toISOString(),
      sourceTrajectoryCount: validTrajectories.length,
      // 当前构建结果只能作为候选；由赛道管理器显式提升为活跃参考几何。
      status: 'candidate'
    }
  };
}

/**
 * 自动平均切分3个Sectors
 */
export function generateSectors(centerline) {
  if (!centerline || centerline.length < 10) return [];
  const N = centerline.length;
  const s1Idx = Math.floor(N / 3);
  const s2Idx = Math.floor(2 * N / 3);
  const s3Idx = N - 1;
  return [{
    sectorIndex: 1,
    centerlineIndex: s1Idx,
    x: centerline[s1Idx].x,
    y: centerline[s1Idx].y,
    z: centerline[s1Idx].z
  }, {
    sectorIndex: 2,
    centerlineIndex: s2Idx,
    x: centerline[s2Idx].x,
    y: centerline[s2Idx].y,
    z: centerline[s2Idx].z
  }, {
    sectorIndex: 3,
    centerlineIndex: s3Idx,
    x: centerline[s3Idx].x,
    y: centerline[s3Idx].y,
    z: centerline[s3Idx].z
  }];
}

export function validateTrackQuality(trackData) {
  if (!trackData) {
    return {
      overallScore: 0,
      details: {},
      warnings: ['无赛道数据'],
      suggestions: []
    };
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
      const dx = centerline[i].x - centerline[i - 1].x;
      const dz = centerline[i].z - centerline[i - 1].z;
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
  const overallScore = Math.round((scores.points || 0) * weights.points + (scores.turns || 0) * weights.turns + (scores.routeBook || 0) * weights.routeBook + (scores.dataRichness || 0) * weights.dataRichness + (scores.coverage || 0) * weights.coverage);

  // 评级
  let grade;
  if (overallScore >= 85) grade = 'A';else if (overallScore >= 70) grade = 'B';else if (overallScore >= 50) grade = 'C';else if (overallScore >= 30) grade = 'D';else grade = 'F';
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
      trackLength: trackData.length || 0
    }
  };
}

/**
 * 计算三维空间中点 P 到线段 AB 的垂直距离 (带端点投射钳制)
 */

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
  let lastHintIdx = -1;
  let lastTrajIdx = -1;
  const findNearestCenterlineIndex = (p, cl) => {
    if (!cl || cl.length === 0) return -1;
    if (p.trajIndex !== undefined && lastTrajIdx !== -1 && p.trajIndex !== lastTrajIdx) {
      lastHintIdx = -1;
    }
    if (p.trajIndex !== undefined) {
      lastTrajIdx = p.trajIndex;
    }

    let minD = Infinity;
    let nearestIdx = -1;

    // 1. 优先在上次索引附近窗口查找
    if (lastHintIdx >= 0 && lastHintIdx < cl.length) {
      const start = Math.max(0, lastHintIdx - 40);
      const end = Math.min(cl.length - 1, lastHintIdx + 40);
      const pYaw = p.yaw || 0;
      for (let i = start; i <= end; i++) {
        const clYaw = cl[i].yaw || 0;
        if (Math.cos(pYaw - clYaw) > 0.5) {
          const dx = p.x - cl[i].x;
          const dz = p.z - cl[i].z;
          const d = dx * dx + dz * dz;
          if (d < minD) {
            minD = d;
            nearestIdx = i;
          }
        }
      }
      if (minD < 144) { // 12米内同向
        lastHintIdx = nearestIdx;
        return nearestIdx;
      }
    }

    // 2. 退回原全表遍历 (100% 数学与逻辑一致)
    minD = Infinity;
    nearestIdx = -1;
    for (let i = 0; i < cl.length; i++) {
      const dx = p.x - cl[i].x;
      const dz = p.z - cl[i].z;
      const d = dx * dx + dz * dz;
      if (d < minD) {
        minD = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx !== -1) {
      lastHintIdx = nearestIdx;
    }
    return nearestIdx;
  };
  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    const stats = {
      entrySpeeds: [],
      apexSpeeds: [],
      exitSpeeds: [],
      brakeIndices: [],
      gearDrops: []
    };

    // 获取该弯道在中心线上的物理坐标
    const entryPoint = centerline[turn.startIdx];
    const apexIdx = turn.index != null ? turn.index : Math.floor((turn.startIdx + turn.endIdx) / 2);
    const apexPoint = centerline[apexIdx];
    const exitPoint = centerline[turn.endIdx];
    const brakePoint = turn.brakePointIdx != null && centerline[turn.brakePointIdx] ? centerline[turn.brakePointIdx] : null;

    // 收集所有轨迹中对应弯道位置的数据
    for (const p of allPoints || []) {
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
    const avgBrakeIdx = stats.brakeIndices.length > 0 ? Math.round(stats.brakeIndices.reduce((a, b) => a + b, 0) / stats.brakeIndices.length) : turn.brakePointIdx;
    const avgGearDrop = stats.gearDrops.length > 0 ? Math.round(stats.gearDrops.reduce((a, b) => a + b, 0) / stats.gearDrops.length) : turn.suggestedGearDrop;

    // 计算物理直道距离
    let distanceToNext = 0;
    if (i < turns.length - 1) {
      const nextTurn = turns[i + 1];
      for (let j = turn.endIdx; j < nextTurn.startIdx && j < centerline.length - 1; j++) {
        distanceToNext += Math.sqrt((centerline[j + 1].x - centerline[j].x) ** 2 + (centerline[j + 1].z - centerline[j].z) ** 2);
      }
    }

    // 检查路面材质 (弯道内)
    let maxTurnPuddle = 0;
    let maxTurnRumble = 0;
    for (let j = turn.startIdx; j <= turn.endIdx && j < centerline.length; j++) {
      if (centerline[j].puddle > maxTurnPuddle) maxTurnPuddle = centerline[j].puddle;
      if (centerline[j].surfaceRumble > maxTurnRumble) maxTurnRumble = centerline[j].surfaceRumble;
    }
    let surface = 'tarmac';
    if (maxTurnPuddle > 0.05) surface = 'water';else if (maxTurnRumble > 0.5) surface = 'gravel';
    routeBook.turns.push({
      index: i,
      turnId: turn.id,
      type: turn.type,
      turnCategory: turn.turnCategory,
      direction: turn.direction,
      angle: turn.angle,
      severity: turn.severity,
      camber: turn.camber,
      crest: turn.crest,
      surface: surface,
      entrySpeed: stableEntrySpeed,
      apexSpeed: stableApexSpeed,
      exitSpeed: stableExitSpeed,
      straightMaxSpeed: turn.straightMaxSpeed,
      distanceToNext: Math.round(distanceToNext),
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
      customNote: turn.customNote || '',
      startS: turn.startS ?? centerline[turn.startIdx]?.s ?? null,
      apexS: turn.apexS ?? centerline[turn.index]?.s ?? null,
      endS: turn.endS ?? centerline[turn.endIdx]?.s ?? null,
      // Round 8: 数据来源统计
      dataSources: {
        entrySpeedSamples: stats.entrySpeeds.length,
        apexSpeedSamples: stats.apexSpeeds.length,
        exitSpeedSamples: stats.exitSpeeds.length,
        brakePointSamples: stats.brakeIndices.length
      }
    });
  }

  // 直道段信息（弯道之间的路段）
  for (let i = 0; i <= turns.length; i++) {
    const segmentStart = i === 0 ? 0 : turns[i - 1].endIdx;
    const segmentEnd = i === turns.length ? centerline.length - 1 : turns[i].startIdx;
    if (segmentEnd - segmentStart < 3) continue;
    let segMaxSpeed = 0;
    let segLength = 0;
    for (let j = segmentStart + 1; j <= segmentEnd && j < centerline.length; j++) {
      const dx = centerline[j].x - centerline[j - 1].x;
      const dz = centerline[j].z - centerline[j - 1].z;
      segLength += Math.sqrt(dx * dx + dz * dz);
      if ((centerline[j].speed || 0) > segMaxSpeed) {
        segMaxSpeed = centerline[j].speed || 0;
      }
    }

    // 只记录长度>50米的直道
    if (segLength > 50) {
      // 检查路面材质
      let maxPuddle = 0;
      let maxRumble = 0;
      for (let j = segmentStart; j <= segmentEnd && j < centerline.length; j++) {
        if (centerline[j].puddle > maxPuddle) maxPuddle = centerline[j].puddle;
        if (centerline[j].surfaceRumble > maxRumble) maxRumble = centerline[j].surfaceRumble;
      }
      let surface = 'tarmac';
      if (maxPuddle > 0.05) surface = 'water';else if (maxRumble > 0.5) surface = 'gravel';
      routeBook.straights.push({
        index: i,
        startIndex: segmentStart,
        endIndex: segmentEnd,
        length: Math.round(segLength),
        maxSpeed: Math.round(segMaxSpeed),
        surface: surface,
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
