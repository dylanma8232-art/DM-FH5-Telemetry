// 空间最接近点匹配辅助函数 (自适应弹性匹配，避免超长/合并赛道绝对坐标偏移导致弯道速度被误杀强切归0)
export function findClosestPoint(targetX, targetZ, lapPoints) {
  if (!lapPoints || lapPoints.length === 0) return null;
  let closest = null;
  let minD2 = Infinity;
  for (const p of lapPoints) {
    const px = p.position?.x ?? p.positionX ?? p.x ?? 0;
    const pz = p.position?.z ?? p.positionZ ?? p.z ?? 0;
    const d2 = (px - targetX) ** 2 + (pz - targetZ) ** 2;
    if (d2 < minD2) {
      minD2 = d2;
      closest = p;
    }
  }
  return closest;
}