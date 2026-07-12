// 空间最接近点匹配辅助函数
export function findClosestPoint(targetX, targetZ, lapPoints) {
  let closest = null;
  let minD2 = Infinity;
  for (const p of lapPoints) {
    const px = p.position?.x || p.positionX || p.x || 0;
    const pz = p.position?.z || p.positionZ || p.z || 0;
    const d2 = (px - targetX) ** 2 + (pz - targetZ) ** 2;
    if (d2 < minD2) {
      minD2 = d2;
      closest = p;
    }
  }
  return minD2 < 6400 ? closest : null; // 80米内有效
}