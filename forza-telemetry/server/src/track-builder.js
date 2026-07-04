// 赛道构建器 - 轨迹聚合和中心线提取
// 用于生成准确的赛道数据，支持导航播报
// Deep Round 1-5: 中心线优化、弯道精度、路书增强、匹配优化

const GRID_SIZE = 1; // 网格精度 1米
const DBSCAN_EPS = 3;      // DBSCAN邻域半径（米）- 网格坐标下
const DBSCAN_MIN_PTS = 2;  // DBSCAN最小邻居数
const CENTERLINE_SAMPLE_DIST = 5; // 中心线均匀采样间距（米）

/**
 * 将多次轨迹聚合为中心线
 * @param {Array} trajectories - 多次轨迹数据 [[{x,y,z,yaw,speed,brake,gear,...},...], ...]
 * @returns {Object} 赛道数据 {centerline, turns, length, routeBook}
 */
export function buildTrackFromTrajectories(trajectories) {
  if (!trajectories || trajectories.length === 0) {
    return null;
  }

  // 1. 合并所有轨迹点
  const allPoints = [];
  trajectories.forEach((traj, trajIndex) => {
    traj.forEach((p, pointIndex) => {
      if (p.x !== 0 || p.z !== 0) { // 过滤原点
        allPoints.push({
          x: p.x,
          y: p.y || 0,
          z: p.z,
          yaw: p.yaw || 0,
          drivingLine: p.drivingLine || 0,
          speed: p.speed || 0,
          brake: p.brake || 0,      // Round 3: 刹车数据
          gear: p.gear || 0,        // Round 3: 档位数据
          rpm: p.rpm || 0,          // Round 3: RPM数据
          trajIndex,
          pointIndex
        });
      }
    });
  });

  if (allPoints.length < 10) {
    return null;
  }

  // 2. 找到边界
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  allPoints.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  });

  // 3. 创建网格
  const gridWidth = Math.ceil((maxX - minX) / GRID_SIZE) + 1;
  const gridHeight = Math.ceil((maxZ - minZ) / GRID_SIZE) + 1;
  const grid = Array(gridWidth).fill(null).map(() => 
    Array(gridHeight).fill(null).map(() => ({
      points: [],
      sumX: 0,
      sumY: 0,
      sumZ: 0,
      sumYaw: 0,
      sumDL: 0,
      sumSpeed: 0,
      sumBrake: 0,
      sumGear: 0,
      count: 0
    }))
  );

  // 4. 将点分配到网格
  allPoints.forEach(p => {
    const gx = Math.floor((p.x - minX) / GRID_SIZE);
    const gz = Math.floor((p.z - minZ) / GRID_SIZE);
    if (gx >= 0 && gx < gridWidth && gz >= 0 && gz < gridHeight) {
      const cell = grid[gx][gz];
      cell.points.push(p);
      cell.sumX += p.x;
      cell.sumY += p.y;
      cell.sumZ += p.z;
      cell.sumYaw += p.yaw;
      cell.sumDL += p.drivingLine;
      cell.sumSpeed += p.speed;
      cell.sumBrake += p.brake;
      cell.sumGear += p.gear;
      cell.count++;
    }
  });

  // 5. Round 1: 使用简化DBSCAN去除偏离主轨迹的异常点
  const gridPoints = [];
  for (let gx = 0; gx < gridWidth; gx++) {
    for (let gz = 0; gz < gridHeight; gz++) {
      const cell = grid[gx][gz];
      if (cell.count < 1) continue; // 至少1个点

      // 计算邻居数（网格坐标下8邻域 + 自身）
      let neighborCount = 0;
      let neighborTotalCount = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx >= 0 && nx < gridWidth && nz >= 0 && nz < gridHeight) {
            if (grid[nx][nz].count > 0) neighborCount++;
            neighborTotalCount += grid[nx][nz].count;
          }
        }
      }

      // DBSCAN核心条件：邻居数 >= MIN_PTS 才认为是核心点
      if (neighborCount >= DBSCAN_MIN_PTS) {
        // 聚合邻域加权中心（邻居越近权重越高）
        let weightX = cell.sumX;
        let weightY = cell.sumY;
        let weightZ = cell.sumZ;
        let weightYaw = cell.sumYaw;
        let weightDL = cell.sumDL;
        let weightSpeed = cell.sumSpeed;
        let weightBrake = cell.sumBrake;
        let weightGear = cell.sumGear;
        let weightCount = cell.count;

        // 加入邻居的权重（距离反比）
        for (let ddx = -1; ddx <= 1; ddx++) {
          for (let ddz = -1; ddz <= 1; ddz++) {
            if (ddx === 0 && ddz === 0) continue;
            const nx = gx + ddx;
            const nz = gz + ddz;
            if (nx >= 0 && nx < gridWidth && nz >= 0 && nz < gridHeight) {
              const ncell = grid[nx][nz];
              if (ncell.count > 0) {
                const w = 0.5; // 邻居权重
                weightX += ncell.sumX * w;
                weightY += ncell.sumY * w;
                weightZ += ncell.sumZ * w;
                weightYaw += ncell.sumYaw * w;
                weightDL += ncell.sumDL * w;
                weightSpeed += ncell.sumSpeed * w;
                weightBrake += ncell.sumBrake * w;
                weightGear += ncell.sumGear * w;
                weightCount += ncell.count * w;
              }
            }
          }
        }

        gridPoints.push({
          x: weightX / weightCount,
          y: weightY / weightCount,
          z: weightZ / weightCount,
          yaw: weightYaw / weightCount,
          drivingLine: weightDL / weightCount,
          speed: weightSpeed / weightCount,
          brake: weightBrake / weightCount,
          gear: weightGear / weightCount,
          confidence: Math.min(cell.count / trajectories.length, 1),
          gx,
          gz
        });
      }
    }
  }

  if (gridPoints.length < 5) {
    return null;
  }

  // 6. 按顺序连接中心点（使用最近邻）
  let centerline = orderPoints(gridPoints);

  // Round 1: 中心线平滑（移动平均 5点窗口）
  centerline = smoothCenterline(centerline, 5);

  // Round 1: 中心线均匀采样（每5米一个点）
  centerline = resampleCenterline(centerline, CENTERLINE_SAMPLE_DIST);

  // 7. Round 2: 识别弯道（增强版）
  const turns = detectTurnsEnhanced(centerline);

  // 8. 计算赛道长度
  let length = 0;
  for (let i = 1; i < centerline.length; i++) {
    const dx = centerline[i].x - centerline[i-1].x;
    const dy = centerline[i].y - centerline[i-1].y;
    const dz = centerline[i].z - centerline[i-1].z;
    length += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }

  // Round 3: 从遥测数据提取路书
  const routeBook = buildRouteBook(centerline, turns, allPoints);

  return {
    centerline,
    turns,
    length: Math.round(length),
    pointCount: centerline.length,
    trajectoryCount: trajectories.length,
    bounds: { minX, maxX, minZ, maxZ },
    routeBook,  // Round 3: 路书数据
    // Round 8: 数据来源轨迹数（方便客户端显示"基于N次比赛数据"）
    dataSourceCount: trajectories.length
  };
}

/**
 * Round 1: 中心线平滑 - 指数加权移动平均（EWMA）
 * 比简单移动平均更平滑，对异常值更鲁棒
 */
function smoothCenterline(points, windowSize) {
  if (points.length < windowSize * 2) return points;

  const smoothed = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    if (i < half || i >= points.length - half) {
      smoothed.push({ ...points[i] });
      continue;
    }

    let sumX = 0, sumY = 0, sumZ = 0, sumYaw = 0;
    let sumSpeed = 0, sumBrake = 0, sumGear = 0;
    let weightSum = 0;

    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      // 高斯权重：越近权重越大
      const dist = Math.abs(j);
      const w = Math.exp(-0.5 * (dist / (windowSize / 3)) * (dist / (windowSize / 3)));
      sumX += points[idx].x * w;
      sumY += points[idx].y * w;
      sumZ += points[idx].z * w;
      sumYaw += points[idx].yaw * w;
      sumSpeed += points[idx].speed * w;
      sumBrake += points[idx].brake * w;
      sumGear += points[idx].gear * w;
      weightSum += w;
    }

    smoothed.push({
      x: sumX / weightSum,
      y: sumY / weightSum,
      z: sumZ / weightSum,
      yaw: sumYaw / weightSum,
      speed: sumSpeed / weightSum,
      brake: sumBrake / weightSum,
      gear: sumGear / weightSum,
      confidence: points[i].confidence
    });
  }

  return smoothed;
}

/**
 * Round 1: 中心线均匀采样 - 确保点间距均匀
 * 沿中心线等距采样，间距为 targetSpacing 米
 */
function resampleCenterline(centerline, targetSpacing) {
  if (centerline.length < 2) return centerline;

  // 计算累计距离
  const distances = [0];
  for (let i = 1; i < centerline.length; i++) {
    const dx = centerline[i].x - centerline[i-1].x;
    const dy = centerline[i].y - centerline[i-1].y;
    const dz = centerline[i].z - centerline[i-1].z;
    distances.push(distances[i-1] + Math.sqrt(dx*dx + dy*dy + dz*dz));
  }

  const totalDist = distances[distances.length - 1];
  if (totalDist < targetSpacing) return centerline;

  // 等距采样
  const resampled = [];
  const targetCount = Math.max(10, Math.floor(totalDist / targetSpacing));
  const stepDist = totalDist / targetCount;

  for (let i = 0; i <= targetCount; i++) {
    const targetDist = i * stepDist;

    // 找到目标距离对应的线段
    let segIdx = 0;
    for (let j = 1; j < distances.length; j++) {
      if (distances[j] >= targetDist) {
        segIdx = j - 1;
        break;
      }
      segIdx = j - 1;
    }

    const segLen = distances[segIdx + 1] - distances[segIdx];
    if (segLen < 0.001) {
      resampled.push({ ...centerline[segIdx] });
      continue;
    }

    const t = (targetDist - distances[segIdx]) / segLen;
    const p0 = centerline[segIdx];
    const p1 = centerline[segIdx + 1];

    // 线性插值
    resampled.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      z: p0.z + (p1.z - p0.z) * t,
      yaw: p0.yaw + (p1.yaw - p0.yaw) * t,
      speed: p0.speed + (p1.speed - p0.speed) * t,
      brake: p0.brake + (p1.brake - p0.brake) * t,
      gear: p0.gear + (p1.gear - p0.gear) * t,
      confidence: p0.confidence + (p1.confidence - p0.confidence) * t
    });
  }

  return resampled;
}

/**
 * 按最近邻顺序连接点
 */
function orderPoints(points) {
  if (points.length < 2) return points;

  const ordered = [points[0]];
  const remaining = points.slice(1);
  const used = new Set([0]);

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let nearestIdx = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      if (used.has(i)) continue;
      const dx = remaining[i].x - current.x;
      const dz = remaining[i].z - current.z;
      const dist = dx*dx + dz*dz;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    if (nearestIdx === -1) break;
    ordered.push(remaining[nearestIdx]);
    used.add(nearestIdx);
    if (used.size >= points.length) break;
  }

  return ordered;
}

/**
 * 计算曲率半径（三点圆拟合）
 */
function calculateCurvatureRadius(p1, p2, p3) {
  const ax = p1.x, ay = p1.z;
  const bx = p2.x, by = p2.z;
  const cx = p3.x, cy = p3.z;
  
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 0.001) return Infinity;
  
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  
  const dx = ax - ux;
  const dy = ay - uy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Round 2: 根据角度获取弯道分类
 * 发夹弯(>120)/急弯(60-120)/中速弯(30-60)/慢弯(15-30)/直道微弯(<15)
 */
function getTurnCategory(angleDeg) {
  if (angleDeg > 120) return { type: 'hairpin', label: '发夹弯', severity: 'critical' };
  if (angleDeg > 60)  return { type: 'sharp', label: '急弯', severity: 'high' };
  if (angleDeg > 30)  return { type: 'medium', label: '中速弯', severity: 'medium' };
  if (angleDeg > 15)  return { type: 'slow', label: '慢弯', severity: 'low' };
  return { type: 'gentle', label: '直道微弯', severity: 'info' };
}

/**
 * 计算推荐过弯速度（基于曲率半径）
 */
function calculateRecommendedSpeed(radius) {
  const friction = 1.2; // 轮胎摩擦系数
  const g = 9.81;
  return Math.sqrt(radius * friction * g) * 3.6; // 转换为km/h
}

/**
 * Round 2: 增强版弯道检测 - 基于heading变化率 + 精确起止点 + 细分类
 */
function detectTurnsEnhanced(centerline) {
  const turns = [];

  // 第一步：计算所有 heading（方向角）
  const headings = [];
  for (let i = 0; i < centerline.length; i++) {
    if (i === 0) {
      if (centerline.length > 1) {
        headings.push(Math.atan2(centerline[1].z - centerline[0].z, centerline[1].x - centerline[0].x));
      } else {
        headings.push(0);
      }
    } else {
      headings.push(Math.atan2(centerline[i].z - centerline[i-1].z, centerline[i].x - centerline[i-1].x));
    }
  }

  // 第二步：计算 heading 变化率（每点相对于前一个点的方向变化）
  const headingChangeRates = [0];
  for (let i = 1; i < headings.length; i++) {
    let diff = headings[i] - headings[i-1];
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    headingChangeRates.push(diff);
  }

  // 第三步：使用滑动窗口平滑 heading 变化率
  const windowSize = 2;
  const smoothedRates = [];
  for (let i = 0; i < headingChangeRates.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(headingChangeRates.length - 1, i + windowSize); j++) {
      sum += headingChangeRates[j];
      count++;
    }
    smoothedRates.push(sum / count);
  }

  // 第四步：检测弯道区域（连续正/负 heading 变化超过阈值）
  // 标记每个点是否在弯道中
  const TURN_THRESHOLD = 0.015; // 弧度/点 ≈ 0.86度/点，更敏感地捕捉弯道
  const bendRegions = []; // { startIdx, endIdx, totalAngle, direction }

  let inBend = false;
  let bendStart = -1;
  let bendTotalAngle = 0;
  let bendDirection = 0; // 正=右转，负=左转

  const minPoints = 3; // 至少连续3个点才算弯道
  const skipStart = 3; // 缩减起始过滤区 (15米)
  const skipEnd = 3;   // 缩减结束过滤区 (15米)

  for (let i = skipStart; i < centerline.length - skipEnd; i++) {
    const rate = smoothedRates[i];

    if (!inBend) {
      // 检查是否开始进入弯道
      if (Math.abs(rate) > TURN_THRESHOLD) {
        inBend = true;
        bendStart = i;
        bendTotalAngle = rate;
        bendDirection = rate > 0 ? 1 : -1;
      }
    } else {
      // 在弯道中
      // 如果方向一致，继续累加
      if ((bendDirection > 0 && rate > 0) || (bendDirection < 0 && rate < 0)) {
        bendTotalAngle += rate;
      } else if (Math.abs(rate) <= TURN_THRESHOLD * 0.5) {
        // 方向变化低于阈值的50%，认为弯道可能结束
        // 检查是否满足最小弯道条件
        const bendAngleDeg = Math.abs(bendTotalAngle) * 180 / Math.PI;
        const bendLength = i - bendStart;

        if (bendAngleDeg > 10 && bendLength >= minPoints) {
          bendRegions.push({
            startIdx: bendStart,
            endIdx: i,
            totalAngle: bendAngleDeg,
            direction: bendDirection > 0 ? 'right' : 'left'
          });
        }
        // 重置
        inBend = false;
        bendTotalAngle = 0;
        bendStart = -1;
      } else {
        // 方向反转，可能是一个S弯
        // 先保存当前弯道
        const bendAngleDeg = Math.abs(bendTotalAngle) * 180 / Math.PI;
        const bendLength = i - bendStart;

        if (bendAngleDeg > 10 && bendLength >= minPoints) {
          bendRegions.push({
            startIdx: bendStart,
            endIdx: i,
            totalAngle: bendAngleDeg,
            direction: bendDirection > 0 ? 'right' : 'left'
          });
        }
        // 开始新弯道
        bendStart = i;
        bendTotalAngle = rate;
        bendDirection = rate > 0 ? 1 : -1;
      }
    }
  }

  // 处理最后一个弯道区域
  if (inBend) {
    const bendAngleDeg = Math.abs(bendTotalAngle) * 180 / Math.PI;
    const bendLength = centerline.length - skipEnd - bendStart;
    if (bendAngleDeg > 10 && bendLength >= minPoints) {
      bendRegions.push({
        startIdx: bendStart,
        endIdx: Math.min(centerline.length - skipEnd, centerline.length - 1),
        totalAngle: bendAngleDeg,
        direction: bendDirection > 0 ? 'right' : 'left'
      });
    }
  }

  // 第五步：合并距离太近的弯道区域（间隔 < 5个采样点）
  const mergedBends = [];
  for (const region of bendRegions) {
    if (mergedBends.length > 0) {
      const last = mergedBends[mergedBends.length - 1];
      if (region.startIdx - last.endIdx < 5) {
        // 合并：如果是S弯（方向相反）
        if (last.direction !== region.direction) {
          const bigger = last.totalAngle > region.totalAngle ? last : region;
          mergedBends[mergedBends.length - 1] = {
            ...bigger,
            startIdx: Math.min(last.startIdx, region.startIdx),
            endIdx: Math.max(last.endIdx, region.endIdx),
            isChicane: true,
            chicaneDirections: [last.direction, region.direction]
          };
        } else {
          // 同方向，简单合并
          last.endIdx = region.endIdx;
          last.totalAngle += region.totalAngle;
        }
        continue;
      }
    }
    mergedBends.push({ ...region });
  }

  // 第六步：为每个弯道计算详细属性
  for (const bend of mergedBends) {
    // 弯道中点（apex）
    const apexIdx = Math.floor((bend.startIdx + bend.endIdx) / 2);
    const apex = centerline[apexIdx];

    // 入弯点和出弯点
    const entryIdx = bend.startIdx;
    const exitIdx = bend.endIdx;

    // 计算弯道半径（使用起止点和中点拟合圆）
    const p1 = centerline[bend.startIdx];
    const p2 = centerline[apexIdx];
    const p3 = centerline[bend.endIdx];
    const radius = calculateCurvatureRadius(p1, p2, p3);

    // 弯道分类
    const category = getTurnCategory(bend.totalAngle);
    const recommendedSpeed = calculateRecommendedSpeed(Math.min(radius, 1000));

    // Round 3: 从中心线数据提取入弯/弯中/出弯速度
    const entrySpeed = centerline[bend.startIdx] ? centerline[bend.startIdx].speed || 0 : 0;
    const apexSpeed = apex ? apex.speed || 0 : 0;
    const exitSpeed = centerline[bend.endIdx] ? centerline[bend.endIdx].speed || 0 : 0;

    // Round 3: 检测刹车点（弯道前方速度开始下降的位置）
    let brakePointIdx = bend.startIdx;
    let maxBrakeBefore = 0;
    for (let i = Math.max(5, bend.startIdx - 20); i < bend.startIdx; i++) {
      if ((centerline[i].brake || 0) > maxBrakeBefore) {
        maxBrakeBefore = centerline[i].brake || 0;
        brakePointIdx = i;
      }
    }

    // Round 3: 推荐降档（基于入弯速度和弯中速度差）
    let suggestedGearDrop = 0;
    const gearAtEntry = centerline[bend.startIdx] ? centerline[bend.startIdx].gear || 0 : 0;
    const gearAtApex = centerline[apexIdx] ? centerline[apexIdx].gear || 0 : 0;
    if (gearAtApex > 0 && gearAtEntry > 0 && gearAtApex < gearAtEntry) {
      suggestedGearDrop = gearAtEntry - gearAtApex;
    }

    // Round 3: 直道最大速度（弯道之间的直道段）
    let straightMaxSpeed = 0;
    for (let i = Math.max(0, bend.startIdx - 30); i < bend.startIdx; i++) {
      if ((centerline[i].speed || 0) > straightMaxSpeed) {
        straightMaxSpeed = centerline[i].speed || 0;
      }
    }

    turns.push({
      index: apexIdx,
      x: apex.x,
      y: apex.y,
      z: apex.z,
      angle: Math.round(bend.totalAngle),
      direction: bend.direction,
      type: category.type,
      turnCategory: category.label,
      severity: category.severity,
      radius: radius === Infinity ? 9999 : Math.round(radius),
      recommendedSpeed: Math.round(recommendedSpeed),
      // 弯道起止
      startIdx: entryIdx,
      endIdx: exitIdx,
      startX: p1.x,
      startZ: p1.z,
      endX: p3.x,
      endZ: p3.z,
      isChicane: bend.isChicane || false,
      // Round 3: 速度数据
      entrySpeed: Math.round(entrySpeed),
      apexSpeed: Math.round(apexSpeed),
      exitSpeed: Math.round(exitSpeed),
      straightMaxSpeed: Math.round(straightMaxSpeed),
      // Round 3: 刹车和降档
      brakePointIdx: brakePointIdx,
      brakePointX: centerline[brakePointIdx] ? centerline[brakePointIdx].x : p1.x,
      brakePointZ: centerline[brakePointIdx] ? centerline[brakePointIdx].z : p1.z,
      suggestedGearDrop,
      // 兼容旧字段
      suggestedBrakePoint: brakePointIdx,
      suggestedApex: apexIdx,
      suggestedExit: exitIdx,
      bestEntrySpeed: Math.round(entrySpeed),
      avgEntrySpeed: Math.round(entrySpeed),
      bestExitSpeed: Math.round(exitSpeed),
      avgExitSpeed: Math.round(exitSpeed),
      speedDiff: Math.round(entrySpeed - apexSpeed)
    });
  }

  return turns;
}

/**
 * Round 3: 构建路书数据
 * 从遥测数据中提取每个弯道和直道的最优数据
 * Round 8: 支持多次数据累积优化（轨迹来源计数、稳定性速度、平均刹车点）
 */
function buildRouteBook(centerline, turns, allPoints) {
  if (!turns || turns.length === 0) return null;

  const routeBook = {
    turns: [],
    straights: [],
    maxSpeed: 0,
    bestLapData: {},
    dataSourceCount: new Set(allPoints.map(p => p.trajIndex)).size // Round 8: 数据来源轨迹数
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
    for (const p of allPoints) {
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
      recommendedSpeed: turn.recommendedSpeed,
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
 * 生成导航播报数据
 */
export function generateNavigationData(trackData) {
  if (!trackData || !trackData.turns) return [];

  const navPoints = [];
  
  trackData.turns.forEach((turn, index) => {
    // 刹车点
    const brakeX = turn.brakePointX != null ? turn.brakePointX : turn.x;
    const brakeZ = turn.brakePointZ != null ? turn.brakePointZ : turn.z;
    const brakeCenterline = trackData.centerline[turn.brakePointIdx];

    navPoints.push({
      type: 'brake',
      x: brakeCenterline ? brakeCenterline.x : brakeX,
      y: brakeCenterline ? (brakeCenterline.y || 0) : (turn.y || 0),
      z: brakeCenterline ? brakeCenterline.z : brakeZ,
      message: `前方弯道${index + 1}(${turn.turnCategory || turn.type})，准备刹车`,
      turnIndex: index,
      bestEntrySpeed: turn.entrySpeed || turn.bestEntrySpeed,
      avgEntrySpeed: turn.avgEntrySpeed,
      suggestedGearDrop: turn.suggestedGearDrop || 0
    });

    // 入弯点
    navPoints.push({
      type: 'turn_in',
      x: turn.x,
      y: turn.y,
      z: turn.z,
      message: `入弯${index + 1}，${turn.direction === 'left' ? '左' : '右'}转${turn.angle}度`,
      turnIndex: index,
      angle: turn.angle,
      direction: turn.direction
    });

    // Apex点
    navPoints.push({
      type: 'apex',
      x: turn.x,
      y: turn.y,
      z: turn.z,
      message: `弯心${index + 1}`,
      turnIndex: index
    });

    // 出弯点
    const exitCenterline = trackData.centerline[turn.exitPoint != null ? turn.exitPoint : turn.endIdx];
    navPoints.push({
      type: 'exit',
      x: exitCenterline ? exitCenterline.x : turn.x,
      y: exitCenterline ? (exitCenterline.y || 0) : (turn.y || 0),
      z: exitCenterline ? exitCenterline.z : turn.z,
      message: `出弯${index + 1}，加速`,
      turnIndex: index
    });
  });

  return navPoints;
}

/**
 * 计算赛道相似度（用于识别是否是同一条赛道）
 */
export function calculateTrackSimilarity(track1Points, track2Points) {
  if (!track1Points || !track2Points) return 0;
  if (track1Points.length < 10 || track2Points.length < 10) return 0;

  // 检查轨迹是否有变化（避免固定位置的测试数据）
  const x1Vals = track1Points.map(p => p.x);
  const z1Vals = track1Points.map(p => p.z);
  const x1Range = Math.max(...x1Vals) - Math.min(...x1Vals);
  const z1Range = Math.max(...z1Vals) - Math.min(...z1Vals);
  
  // 如果轨迹位置范围太小（<100米），认为是无效数据
  if (x1Range < 100 && z1Range < 100) return 0;

  // Round 4: 改进轨迹相似度 - 考虑方向
  // 先计算位置相似度
  let totalDist = 0;
  let matchCount = 0;

  const sample1 = samplePoints(track1Points, 100);
  const sample2 = samplePoints(track2Points, 100);

  sample1.forEach(p1 => {
    let minDist = Infinity;
    sample2.forEach(p2 => {
      const dx = p1.x - p2.x;
      const dz = p1.z - p2.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < minDist) minDist = dist;
    });
    if (minDist < 20) {
      totalDist += minDist;
      matchCount++;
    }
  });

  if (matchCount === 0) return 0;
  
  const avgDist = totalDist / matchCount;
  const matchRatio = matchCount / Math.max(sample1.length, sample2.length);
  
  // 位置相似度
  const positionScore = matchRatio * (1 - avgDist / 20);

  // Round 4: 方向相似度（heading 一致性）
  const directionScore = calculateDirectionSimilarity(track1Points, track2Points);

  // Round 4: 综合评分（方向权重30%，位置权重70%）
  return Math.max(0, Math.min(1, positionScore * 0.7 + directionScore * 0.3));
}

/**
 * Round 4: 计算方向相似度
 * 比较两条轨迹的整体方向分布（直道/左转/右转比例）
 */
function calculateDirectionSimilarity(points1, points2) {
  const dir1 = getDirectionDistribution(points1);
  const dir2 = getDirectionDistribution(points2);

  if (!dir1 || !dir2) return 0.5; // 默认中性分

  // 比较分布：左转/直道/右转比例
  const diff = Math.abs(dir1.leftRatio - dir2.leftRatio) +
               Math.abs(dir1.straightRatio - dir2.straightRatio) +
               Math.abs(dir1.rightRatio - dir2.rightRatio);

  // 差异越小相似度越高（最大差异为2，最小为0）
  return Math.max(0, 1 - diff / 2);
}

/**
 * 计算轨迹方向分布
 */
function getDirectionDistribution(points) {
  if (points.length < 20) return null;

  let leftCount = 0, rightCount = 0, straightCount = 0;
  const step = Math.max(1, Math.floor(points.length / 50));

  for (let i = step; i < points.length - step; i += step) {
    const prev = points[i - step];
    const curr = points[i];
    const next = points[i + step];

    const angle1 = Math.atan2(curr.z - prev.z, curr.x - prev.x);
    const angle2 = Math.atan2(next.z - curr.z, next.x - curr.x);
    let diff = angle2 - angle1;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;

    const deg = Math.abs(diff * 180 / Math.PI);
    if (deg < 5) straightCount++;
    else if (diff > 0) rightCount++;
    else leftCount++;
  }

  const total = leftCount + rightCount + straightCount;
  if (total === 0) return null;

  return {
    leftRatio: leftCount / total,
    rightRatio: rightCount / total,
    straightRatio: straightCount / total
  };
}

/**
 * 高级赛道识别算法
 * 综合多种特征进行赛道匹配，提高准确率
 * Round 4: 增加方向权重，支持双向赛道匹配
 * @param {Array} currentPoints - 当前轨迹点
 * @param {Object} trackDatabase - 赛道数据库 {trackId: trackData, ...}
 * @returns {Array} 匹配结果列表，按置信度降序排列
 */
export function recognizeTrack(currentPoints, trackDatabase) {
  if (!currentPoints || currentPoints.length < 20) {
    return [];
  }

  const results = [];

  for (const [trackId, track] of Object.entries(trackDatabase)) {
    const trackPoints = track.points || [];
    if (trackPoints.length < 20) continue;

    // Round 4: 计算顺时针方向相似度
    const similarityCW = calculateAdvancedSimilarity(currentPoints, trackPoints);

    // Round 4: 尝试反向匹配（逆时针方向）
    const reversedPoints = [...trackPoints].reverse();
    const similarityCCW = calculateAdvancedSimilarity(currentPoints, reversedPoints);

    // 取两个方向中较高的分数
    const bestSimilarity = similarityCW.confidence >= similarityCCW.confidence
      ? similarityCW
      : { ...similarityCCW, details: { ...similarityCCW.details, reversedMatch: true } };

    // Round 4: 提高匹配阈值（避免不同赛道被误匹配）
    if (bestSimilarity.confidence > 0.4) {
      results.push({
        trackId,
        trackName: track.name,
        confidence: bestSimilarity.confidence,
        details: bestSimilarity.details,
        trackLength: track.length || 0,
        turnCount: track.turns?.length || 0,
        reversedMatch: bestSimilarity.details.reversedMatch || false
      });
    }
  }

  // 按置信度降序排列
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

/**
 * 高级相似度计算（多维度特征匹配）
 * Round 4: 增加方向维度权重
 */
function calculateAdvancedSimilarity(points1, points2) {
  // 特征1：基于点对点的Hausdorff距离
  const hausdorffScore = calculateHausdorffScore(points1, points2);
  
  // 特征2：轨迹形状特征（曲率分布）
  const shapeScore = calculateShapeScore(points1, points2);
  
  // 特征3：边界框匹配度
  const boundsScore = calculateBoundsScore(points1, points2);
  
  // 特征4：轨迹长度匹配度
  const lengthScore = calculateLengthScore(points1, points2);
  
  // 特征5：采样点匹配（Fréchet距离近似）
  const frechetScore = calculateFrechetScore(points1, points2);

  // Round 4: 特征6 - 方向分布相似度
  const directionScore = calculateDirectionSimilarity(points1, points2);
  
  // 综合评分（加权平均）
  const weights = {
    hausdorff: 0.20,
    shape: 0.15,
    bounds: 0.10,
    length: 0.10,
    frechet: 0.30,
    direction: 0.15  // Round 4: 新增方向维度
  };
  
  const confidence = 
    hausdorffScore * weights.hausdorff +
    shapeScore * weights.shape +
    boundsScore * weights.bounds +
    lengthScore * weights.length +
    frechetScore * weights.frechet +
    directionScore * weights.direction;
  
  return {
    confidence: Math.min(1, Math.max(0, confidence)),
    details: {
      hausdorff: Math.round(hausdorffScore * 100),
      shape: Math.round(shapeScore * 100),
      bounds: Math.round(boundsScore * 100),
      length: Math.round(lengthScore * 100),
      frechet: Math.round(frechetScore * 100),
      direction: Math.round(directionScore * 100)
    }
  };
}

/**
 * 基于Hausdorff距离的匹配分数
 */
function calculateHausdorffScore(points1, points2) {
  const sample1 = samplePoints(points1, 100);
  const sample2 = samplePoints(points2, 100);
  
  const dist1to2 = calculateDirectedHausdorff(sample1, sample2);
  const dist2to1 = calculateDirectedHausdorff(sample2, sample1);
  
  const hausdorffDist = Math.max(dist1to2, dist2to1);
  
  // 50米以内认为是同一赛道
  return Math.max(0, 1 - hausdorffDist / 50);
}

function calculateDirectedHausdorff(from, to) {
  let maxMinDist = 0;
  
  for (const p1 of from) {
    let minDist = Infinity;
    for (const p2 of to) {
      const dx = p1.x - p2.x;
      const dz = p1.z - p2.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }
    maxMinDist = Math.max(maxMinDist, minDist);
  }
  
  return maxMinDist;
}

/**
 * 轨迹形状特征匹配（曲率分布比较）
 */
function calculateShapeScore(points1, points2) {
  const curvatures1 = calculateCurvatureDistribution(points1);
  const curvatures2 = calculateCurvatureDistribution(points2);
  
  if (!curvatures1 || !curvatures2) return 0;
  
  return compareHistograms(curvatures1, curvatures2);
}

function calculateCurvatureDistribution(points) {
  if (points.length < 20) return null;
  
  const curvatures = [];
  const windowSize = 10;
  
  for (let i = windowSize; i < points.length - windowSize; i++) {
    const prev = points[i - windowSize];
    const curr = points[i];
    const next = points[i + windowSize];
    
    const angle1 = Math.atan2(curr.z - prev.z, curr.x - prev.x);
    const angle2 = Math.atan2(next.z - curr.z, next.x - curr.x);
    let angleDiff = angle2 - angle1;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    curvatures.push(Math.abs(angleDiff));
  }
  
  const bins = new Array(10).fill(0);
  const maxCurvature = Math.PI;
  
  for (const c of curvatures) {
    const binIndex = Math.min(9, Math.floor(c / maxCurvature * 10));
    bins[binIndex]++;
  }
  
  const total = curvatures.length;
  return bins.map(b => b / total);
}

function compareHistograms(hist1, hist2) {
  let sum = 0;
  for (let i = 0; i < hist1.length; i++) {
    sum += Math.sqrt(hist1[i] * hist2[i]);
  }
  return sum;
}

/**
 * 边界框匹配度
 */
function calculateBoundsScore(points1, points2) {
  const bounds1 = getBounds(points1);
  const bounds2 = getBounds(points2);
  
  if (!bounds1 || !bounds2) return 0;
  
  const center1 = {
    x: (bounds1.minX + bounds1.maxX) / 2,
    z: (bounds1.minZ + bounds1.maxZ) / 2
  };
  const center2 = {
    x: (bounds2.minX + bounds2.maxX) / 2,
    z: (bounds2.minZ + bounds2.maxZ) / 2
  };
  
  const centerDist = Math.sqrt(
    Math.pow(center1.x - center2.x, 2) + 
    Math.pow(center1.z - center2.z, 2)
  );
  
  const width1 = bounds1.maxX - bounds1.minX;
  const height1 = bounds1.maxZ - bounds1.minZ;
  const width2 = bounds2.maxX - bounds2.minX;
  const height2 = bounds2.maxZ - bounds2.minZ;
  
  const sizeRatio = Math.min(width1, width2) / Math.max(width1, width2) *
                    Math.min(height1, height2) / Math.max(height1, height2);
  
  const centerScore = Math.max(0, 1 - centerDist / 200);
  
  return (centerScore + sizeRatio) / 2;
}

function getBounds(points) {
  if (!points || points.length === 0) return null;
  
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  
  return { minX, maxX, minZ, maxZ };
}

/**
 * 轨迹长度匹配度
 */
function calculateLengthScore(points1, points2) {
  const length1 = calculatePathLength(points1);
  const length2 = calculatePathLength(points2);
  
  if (length1 === 0 || length2 === 0) return 0;
  
  return Math.min(length1, length2) / Math.max(length1, length2);
}

function calculatePathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dz = points[i].z - points[i-1].z;
    length += Math.sqrt(dx * dx + dz * dz);
  }
  return length;
}

/**
 * Fréchet距离近似（采样版本）
 */
function calculateFrechetScore(points1, points2) {
  const sample1 = samplePoints(points1, 50);
  const sample2 = samplePoints(points2, 50);
  
  const frechetDist = discreteFrechet(sample1, sample2);
  
  return Math.max(0, 1 - frechetDist / 100);
}

function discreteFrechet(P, Q) {
  const n = P.length;
  const m = Q.length;
  const dp = Array(n).fill(null).map(() => Array(m).fill(-1));
  
  function dist(i, j) {
    const dx = P[i].x - Q[j].x;
    const dz = P[i].z - Q[j].z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  
  function recurse(i, j) {
    if (dp[i][j] > -1) return dp[i][j];
    
    if (i === 0 && j === 0) {
      dp[i][j] = dist(0, 0);
    } else if (i > 0 && j === 0) {
      dp[i][j] = Math.max(recurse(i-1, 0), dist(i, 0));
    } else if (i === 0 && j > 0) {
      dp[i][j] = Math.max(recurse(0, j-1), dist(0, j));
    } else {
      dp[i][j] = Math.max(
        Math.min(recurse(i-1, j), recurse(i-1, j-1), recurse(i, j-1)),
        dist(i, j)
      );
    }
    
    return dp[i][j];
  }
  
  return recurse(n-1, m-1);
}

/**
 * 均匀采样点
 */
function samplePoints(points, targetCount) {
  if (points.length <= targetCount) return points;
  
  const sampled = [];
  const step = (points.length - 1) / (targetCount - 1);
  
  for (let i = 0; i < targetCount; i++) {
    const index = Math.round(i * step);
    sampled.push(points[Math.min(index, points.length - 1)]);
  }
  
  return sampled;
}

/**
 * 生成分段计时数据
 * 根据赛道弯道和长度，将赛道分为3-5段
 * @param {Array} centerline - 赛道中心线
 * @param {Array} turns - 弯道数据
 * @returns {Array} 分段边界数组
 */
export function generateSectors(centerline, turns) {
  if (!centerline || centerline.length < 20) return [];

  // 计算赛道总长度
  let totalLength = 0;
  const distances = [0];
  for (let i = 1; i < centerline.length; i++) {
    const dx = centerline[i].x - centerline[i - 1].x;
    const dy = (centerline[i].y || 0) - (centerline[i - 1].y || 0);
    const dz = centerline[i].z - centerline[i - 1].z;
    totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
    distances.push(totalLength);
  }

  // 确定分段数量：基于赛道长度
  let sectorCount;
  if (totalLength > 8000) sectorCount = 5;
  else if (totalLength > 4000) sectorCount = 4;
  else sectorCount = 3;

  // 收集有效弯道位置（按距离排序）
  const validTurns = (turns || [])
    .filter(t => {
      const idx = t.index != null ? t.index : (t.startIdx != null ? t.startIdx : 0);
      return idx > 5 && idx < centerline.length - 5;
    })
    .map(t => ({
      index: t.index != null ? t.index : t.startIdx,
      distance: distances[t.index != null ? t.index : t.startIdx] || 0,
      angle: t.angle || 0,
      type: t.type || 'medium'
    }))
    .sort((a, b) => a.distance - b.distance);

  const boundaries = [0];

  if (validTurns.length >= sectorCount - 1) {
    const turnsPerGroup = Math.ceil(validTurns.length / sectorCount);
    for (let g = 1; g < sectorCount; g++) {
      const groupStart = (g - 1) * turnsPerGroup;
      const groupEnd = Math.min(g * turnsPerGroup, validTurns.length);
      const midIdx = Math.floor((groupStart + groupEnd) / 2);
      if (midIdx < validTurns.length) {
        const boundaryIdx = validTurns[midIdx].index;
        if (boundaryIdx > 10 && boundaryIdx < centerline.length - 10) {
          boundaries.push(boundaryIdx);
        }
      }
    }
  } else {
    const sectorLength = totalLength / sectorCount;
    for (let s = 1; s < sectorCount; s++) {
      const targetDist = s * sectorLength;
      let nearestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < distances.length; i++) {
        const diff = Math.abs(distances[i] - targetDist);
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      }
      if (nearestIdx > 10 && nearestIdx < centerline.length - 10) {
        boundaries.push(nearestIdx);
      }
    }
  }

  boundaries.push(centerline.length - 1);

  const uniqueBoundaries = [...new Set(boundaries)].sort((a, b) => a - b);

  const sectors = [];
  for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
    const startIdx = uniqueBoundaries[i];
    const endIdx = uniqueBoundaries[i + 1];
    const startPoint = centerline[startIdx];
    const endPoint = centerline[endIdx];

    const boundaryDx = endPoint.x - startPoint.x;
    const boundaryDz = endPoint.z - startPoint.z;
    const boundaryLen = Math.sqrt(boundaryDx * boundaryDx + boundaryDz * boundaryDz);

    const dirX = boundaryLen > 0 ? boundaryDx / boundaryLen : 0;
    const dirZ = boundaryLen > 0 ? boundaryDz / boundaryLen : 0;

    const normalX = -dirZ;
    const normalZ = dirX;

    let sectorLength = 0;
    for (let j = startIdx + 1; j <= endIdx && j < centerline.length; j++) {
      const dx = centerline[j].x - centerline[j - 1].x;
      const dy = (centerline[j].y || 0) - (centerline[j - 1].y || 0);
      const dz = centerline[j].z - centerline[j - 1].z;
      sectorLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const sectorTurns = validTurns.filter(t => t.index >= startIdx && t.index <= endIdx);

    sectors.push({
      index: i,
      name: 'S' + (i + 1),
      startIndex: startIdx,
      endIndex: endIdx,
      startX: startPoint.x,
      startZ: startPoint.z,
      endX: endPoint.x,
      endZ: endPoint.z,
      boundaryX: startPoint.x,
      boundaryZ: startPoint.z,
      normalX: normalX,
      normalZ: normalZ,
      length: Math.round(sectorLength),
      turnCount: sectorTurns.length,
      hasSharpTurn: sectorTurns.some(t => t.type === 'hairpin' || t.type === 'sharp')
    });
  }

  return sectors;
}

/**
 * Round 7: 赛道数据质量验证
 * 评估轨迹点数量、弯道检测质量、路书完整性
 * @param {Object} trackData - 完整的赛道数据（含 centerline, turns, routeBook, trajectoryCount, pointCount 等）
 * @returns {Object} 验证结果 { overallScore, details, warnings, suggestions }
 */
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
    let turnQualityScore = 80;
    // 检查每个弯道是否有完整的速度数据
    let turnsWithoutSpeed = 0;
    let turnsWithoutBrake = 0;
    for (const turn of turns) {
      if (!turn.entrySpeed && !turn.apexSpeed && !turn.exitSpeed) {
        turnsWithoutSpeed++;
      }
      if (!turn.brakePointX && turn.brakePointX !== 0) {
        turnsWithoutBrake++;
      }
    }
    if (turnsWithoutSpeed > turns.length * 0.3) {
      turnQualityScore -= 20;
      warnings.push(`${turnsWithoutSpeed}/${turns.length} 个弯道缺少速度数据`);
    }
    if (turnsWithoutBrake > turns.length * 0.5) {
      turnQualityScore -= 15;
      warnings.push(`${turnsWithoutBrake}/${turns.length} 个弯道缺少刹车点数据`);
    }
    scores.turns = Math.max(10, Math.min(100, turnQualityScore));
  }

  // 3. 路书完整性评分（0-100）
  const routeBook = trackData.routeBook;
  if (!routeBook || !routeBook.turns || routeBook.turns.length === 0) {
    scores.routeBook = 15;
    warnings.push('路书数据不完整');
    suggestions.push('需要更多比赛数据来生成完整路书');
  } else {
    let rbScore = 70;
    const rbTurns = routeBook.turns;
    // 检查路书弯道是否都有推荐速度
    let noRecSpeed = 0;
    for (const rt of rbTurns) {
      if (!rt.recommendedSpeed && rt.recommendedSpeed !== 0) {
        noRecSpeed++;
      }
    }
    if (noRecSpeed > 0) {
      rbScore -= 15;
      warnings.push(`${noRecSpeed} 个弯道路书中缺少推荐速度`);
    }
    // 检查是否有直道数据
    if (!routeBook.straights || routeBook.straights.length === 0) {
      rbScore -= 10;
    }
    scores.routeBook = Math.max(10, Math.min(100, rbScore));
  }

  // 4. 数据丰富度评分（基于轨迹次数）（0-100）
  const trajCount = trackData.trajectoryCount || 1;
  if (trajCount === 1) {
    scores.dataRichness = 40;
    suggestions.push('仅基于1次比赛数据，建议再跑2-3次以提高数据稳定性');
  } else if (trajCount === 2) {
    scores.dataRichness = 60;
  } else if (trajCount <= 4) {
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

export default {
  buildTrackFromTrajectories,
  generateNavigationData,
  calculateTrackSimilarity,
  generateSectors,
  recognizeTrack,
  validateTrackQuality
};
