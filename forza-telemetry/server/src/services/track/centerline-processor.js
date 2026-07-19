export function resampleCenterline(traj, interval = 2.0) {
  if (!traj || traj.length < 2) return traj;
  // 必须按弧长取样：旧实现在跨过 interval 时直接取原始点，会把 UDP
  // 采样频率和驾驶速度变成地图的几何形状。
  const resampled = [{ ...traj[0], s: 0 }];
  let carry = 0;
  for (let i = 1; i < traj.length; i++) {
    const from = traj[i - 1];
    const to = traj[i];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength < 1e-4) continue;
    let consumed = 0;
    while (carry + (segmentLength - consumed) >= interval) {
      const needed = interval - carry;
      consumed += needed;
      const ratio = consumed / segmentLength;
      const yawA = from.yaw || 0;
      let yawDelta = (to.yaw || yawA) - yawA;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      resampled.push({
        ...from,
        x: from.x + dx * ratio,
        y: (from.y || 0) + ((to.y || 0) - (from.y || 0)) * ratio,
        z: from.z + dz * ratio,
        yaw: yawA + yawDelta * ratio,
        s: resampled.length * interval
      });
      carry = 0;
    }
    carry += segmentLength - consumed;
  }
  const last = traj[traj.length - 1];
  if (Math.hypot(last.x - resampled.at(-1).x, last.z - resampled.at(-1).z) > interval * 0.35) {
    resampled.push({ ...last, s: resampled.at(-1).s + carry });
  }
  return resampled;
}

export function annotateArcLength(centerline) {
  if (!centerline?.length) return centerline;
  let s = 0;
  centerline[0].s = 0;
  for (let i = 1; i < centerline.length; i++) {
    s += Math.hypot(centerline[i].x - centerline[i - 1].x, centerline[i].z - centerline[i - 1].z);
    centerline[i].s = s;
  }
  return centerline;
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
    let dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
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
      let yaw1 = p1.yaw || 0,
        yaw2 = p2.yaw || 0;
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
        x,
        z,
        yaw,
        speed,
        roll,
        pitch,
        suspFL,
        suspFR,
        suspRL,
        suspRR
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
  pts[0].kappa = 0;
  pts[pts.length - 1].kappa = 0;

  // 曲率感知高斯平滑：弯道弱平滑，直道强平滑
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 2; i < pts.length - 2; i++) {
      const absK = Math.abs(pts[i].kappa);
      // 曲率越大，平滑越弱（直道 κ≈0 → 强平滑，弯道 κ 大 → 弱平滑）
      const smoothingStrength = Math.max(0.1, 1.0 - absK * 100);

      // 自适应窗口：直道用5点窗口，弯道用3点窗口
      const windowSize = absK < 0.01 ? 2 : 1;
      let sumX = pts[i].x,
        sumZ = pts[i].z,
        weight = 1.0;
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

  // 坐标平滑完成后，航向必须由几何中心线重新计算。遥测里的车辆 yaw 是驾驶
  // 姿态，漂移、反打和碰撞都会让它偏离道路切线，不能用于弯角或路书。
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    pts[i].yaw = Math.atan2(next.z - prev.z, next.x - prev.x);
  }

  // Calculate First & Second Derivatives and Curvature (Kappa)
  for (let i = 1; i < pts.length - 1; i++) {
    let dx = (pts[i + 1].x - pts[i - 1].x) / 2.0;
    let dz = (pts[i + 1].z - pts[i - 1].z) / 2.0;
    let ddx = pts[i + 1].x - 2 * pts[i].x + pts[i - 1].x;
    let ddz = pts[i + 1].z - 2 * pts[i].z + pts[i - 1].z;
    let denominator = Math.pow(dx * dx + dz * dz, 1.5);
    // FH5 左手坐标系：X=East, Z=North, Y=Up
    // 叉积取反：positive kappa = clockwise = Right turn
    let cross = dz * ddx - dx * ddz;
    pts[i].kappa = denominator > 1e-6 ? cross / denominator : 0;
    let radius = Math.abs(pts[i].kappa) > 1e-6 ? 1.0 / Math.abs(pts[i].kappa) : 10000;
    pts[i].radius = Math.min(radius, 10000); // cap at 10km
  }
  pts[0].kappa = 0;
  pts[0].radius = 10000;
  pts[pts.length - 1].kappa = 0;
  pts[pts.length - 1].radius = 10000;
  return annotateArcLength(pts);
}

/**
 * 自动平均切分3个Sectors
 */
