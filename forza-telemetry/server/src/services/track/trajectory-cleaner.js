export /**
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
    y: first.y
  });
  return result;
}

/**
 * 使用游戏提供的lapNum变更点作为闭合点提取单圈
 * 当lapNum从N变成N+1时，那个点就是闭合点（一圈结束）
 * @param {Array} positions - 轨迹点数组
 * @returns {Object} { isLoop: boolean, singleLap: Array, method: string }
 */

export /**
 * 使用游戏提供的lapNum变更点作为闭合点提取单圈
 * 当lapNum从N变成N+1时，那个点就是闭合点（一圈结束）
 * @param {Array} positions - 轨迹点数组
 * @returns {Object} { isLoop: boolean, singleLap: Array, method: string }
 */
function detectLoopAndExtractSingleLap(positions) {
  if (!positions || positions.length < 100) {
    return {
      isLoop: false,
      singleLap: positions,
      method: 'none'
    };
  }

  // ★ 使用游戏提供的lapNum变更点作为闭合点
  // 当lapNum从N变成N+1时，那个点就是闭合点（一圈结束）
  const lapChanges = [];
  for (let i = 1; i < positions.length; i++) {
    const prevLap = positions[i - 1].lapNum || 0;
    const currLap = positions[i].lapNum || 0;
    if (currLap > prevLap) {
      lapChanges.push({
        idx: i,
        fromLap: prevLap,
        toLap: currLap
      });
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
  return {
    isLoop: false,
    singleLap: positions,
    method: 'none'
  };
}

/**
 * 环道缝合：将环形轨迹的首尾两端平滑连接，抹平起跑线处的物理裂口
 * @param {Array} traj 轨迹点数组
 * @returns {Array} 缝合后的轨迹
 */

export /**
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

export /**
 * 物理纠偏：利用 normalizedDrivingLine 将偏离的轨迹点拉回中心
 */
function densifyTrajectory(traj, maxDist = 2.0) {
  if (!traj || traj.length < 2) return traj;
  let dense = [traj[0]];
  for (let i = 1; i < traj.length; i++) {
    let p1 = traj[i - 1],
      p2 = traj[i];
    let dx = p2.x - p1.x,
      dy = (p2.y || 0) - (p1.y || 0),
      dz = p2.z - p1.z;
    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) {
      let steps = Math.ceil(dist / maxDist);
      for (let j = 1; j < steps; j++) {
        let ratio = j / steps;
        dense.push({
          ...p1,
          x: p1.x + dx * ratio,
          y: (p1.y || 0) + dy * ratio,
          z: p1.z + dz * ratio,
          yaw: (p1.yaw || 0) + ((p2.yaw || 0) - (p1.yaw || 0)) * ratio,
          speed: (p1.speed || 0) + ((p2.speed || 0) - (p1.speed || 0)) * ratio,
          drivingLine: (p1.drivingLine || 0) + ((p2.drivingLine || 0) - (p1.drivingLine || 0)) * ratio
        });
      }
    }
    dense.push(p2);
  }
  return dense;
}

export function correctTrajectoryDrivingLine(traj) {
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
      corrected.push({
        ...p
      });
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



