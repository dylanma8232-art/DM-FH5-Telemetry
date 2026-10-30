// 用于地图几何标准化渲染的移动平均平滑。
// origIdx 保留原始索引，路书的 startIdx/endIdx 不受平滑影响。
export function movingAverageSmooth(points, isLoop, windowSize = 30, passes = 3) {
  if (points.length < 3) return points.map((p, i) => ({ ...p, origIdx: i }));
  const n = points.length;
  const half = Math.floor(windowSize / 2);

  let current = points.map((p, i) => ({ ...p, origIdx: i }));

  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    for (let i = 0; i < n; i++) {
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (let j = -half; j <= half; j++) {
        const idx = isLoop
          ? ((i + j) % n + n) % n
          : Math.max(0, Math.min(n - 1, i + j));
        sumX += current[idx].x;
        sumZ += current[idx].z;
        count++;
      }
      next.push({
        ...current[i],
        x: sumX / count,
        z: sumZ / count,
        origIdx: current[i].origIdx
      });
    }
    current = next;
  }

  return current;
}
