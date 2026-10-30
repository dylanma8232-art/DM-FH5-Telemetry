export /**
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

export function simplifyRDP(points, epsilon = 2.0) {
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
    if (keep[i]) result.push({
      point: points[i],
      index: i
    });
  }
  return result;
}

export /**
 * 最小二乘法圆弧拟合
 * @param {Array} points - 点数组 [{x, z}, ...]
 * @returns {Object|null} {cx, cz, radius} 或 null
 */
function fitArcToPoints(points) {
  if (!points || points.length < 3) return null;
  const n = points.length;
  let sumX = 0,
    sumZ = 0,
    sumX2 = 0,
    sumZ2 = 0,
    sumX3 = 0,
    sumZ3 = 0;
  let sumXZ = 0,
    sumX2Z = 0,
    sumXZ2 = 0;
  for (const p of points) {
    const x = p.x,
      z = p.z;
    sumX += x;
    sumZ += z;
    sumX2 += x * x;
    sumZ2 += z * z;
    sumX3 += x * x * x;
    sumZ3 += z * z * z;
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
  return {
    cx,
    cz,
    radius
  };
}

/**
 * 弯道几何重建：用圆弧拟合弯道，直线拟合直道
 * 解决走线导致的弯道形状失真问题
 * @param {Array} centerline - 原始中心线
 * @param {Array} turns - 检测到的弯道
 * @returns {Array} 重建后的中心线
 */

export /**
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

