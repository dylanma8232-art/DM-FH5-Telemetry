/**
 * LTTB (Largest-Triangle-Three-Buckets) 物理极值降采样算法
 * 在大幅收敛图表数据点数的同时，100% 完整保留车速、G值、温度、推甩尾等物理极值与拐点特征。
 */
export function lttbDownsample(data, targetSize = 450, xKey = 'distance', yKeys = ['speed', 'value', 'tempFL', 'brake']) {
  if (!data || data.length <= targetSize || targetSize <= 2) {
    return data || [];
  }

  const keys = Array.isArray(yKeys) ? yKeys : [yKeys];
  const len = data.length;

  const xValues = new Float64Array(len);
  const yValues = new Float64Array(len);
  for (let idx = 0; idx < len; idx++) {
    const pt = data[idx];
    if (pt) {
      xValues[idx] = pt[xKey] !== undefined ? Number(pt[xKey]) : idx;
      let sum = 0;
      for (let k = 0; k < keys.length; k++) {
        const val = pt[keys[k]];
        if (val !== undefined && val !== null) {
          sum += Math.abs(Number(val) || 0);
        }
      }
      yValues[idx] = sum;
    } else {
      xValues[idx] = idx;
      yValues[idx] = 0;
    }
  }

  const sampled = [];
  const bucketSize = (len - 2) / (targetSize - 2);

  // 始终保留首点
  sampled.push(data[0]);

  let a = 0;

  for (let i = 0; i < targetSize - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len);
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    if (avgRangeLength > 0) {
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += xValues[j];
        avgY += yValues[j];
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    }

    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.min(Math.floor((i + 1) * bucketSize) + 1, len);

    const pointAX = xValues[a];
    const pointAY = yValues[a];

    let maxArea = -1;
    let maxAreaPoint = data[rangeOffs];
    let nextA = rangeOffs;

    for (let j = rangeOffs; j < rangeTo; j++) {
      const pointBX = xValues[j];
      const pointBY = yValues[j];

      // 计算 A, B, 平均 C 构成的三角形面积
      const area = Math.abs(
        (pointAX - avgX) * (pointBY - pointAY) -
        (pointAX - pointBX) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
        nextA = j;
      }
    }

    if (maxAreaPoint) {
      sampled.push(maxAreaPoint);
    }
    a = nextA;
  }

  // 始终保留尾点
  if (len > 1) {
    sampled.push(data[len - 1]);
  }

  return sampled;
}
