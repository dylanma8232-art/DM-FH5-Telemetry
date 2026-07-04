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
  if (vSq === 0) {
    // A 和 B 重合，直接返回与 A 的欧氏距离
    return Math.sqrt(wx * wx + wy * wy + wz * wz);
  }

  let t = (wx * vx + wy * vy + wz * vz) / vSq;
  t = Math.max(0, Math.min(1, t)); // 限制在线段范围内

  const cx = a.x + t * vx;
  const cy = (a.y || 0) + t * vy;
  const cz = a.z + t * vz;

  const dx = p.x - cx;
  const dy = (p.y || 0) - cy;
  const dz = p.z - cz;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Ramer-Douglas-Peucker (RDP) 曲线简化算法
 * 在保留原轨迹形态骨架的前提下，清除同一直线上的冗余几何点
 * @param {Array} points 坐标点集 [{x, y, z, ...}]
 * @param {number} epsilon 距离容差阈值 (单位: 米，推荐 0.15 ~ 0.3 米)
 */
export function simplifyRDP(points, epsilon = 0.2) {
  if (!points || points.length <= 2) return points || [];

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const distance = getPointToSegmentDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance > epsilon) {
    const results1 = simplifyRDP(points.slice(0, index + 1), epsilon);
    const results2 = simplifyRDP(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
}
