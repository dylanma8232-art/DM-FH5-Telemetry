import fs from 'fs';
import path from 'path';
import { readTrackDetail } from '../storage/session-db.js';

const DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../data');

// 自动识别赛道：稀疏坐标内存缓存 (trackId -> downsampled [{x, z}])
export const trackCoordinatesCache = new Map();

// 自动识别赛道核心算法：空间距离 + 时序单调性
export function recognizeTrack(currentPositions, tracksDict) {
  if (!currentPositions || currentPositions.length < 15) return [];

  // 1. 确保所有已知赛道的稀疏坐标点都已解压加载到内存缓存中
  for (const trackId of Object.keys(tracksDict)) {
    if (!trackCoordinatesCache.has(trackId)) {
      try {
        const detail = readTrackDetail(trackId);
        if (detail) {
          const rawPts = (detail.centerline && detail.centerline.length > 0) 
            ? detail.centerline 
            : (detail.points || []);
            
          if (rawPts.length > 0) {
            // 等间距均匀抽取 100 个点用于匹配，保持极高运算速度
            const sampled = [];
            const step = Math.max(1, Math.floor(rawPts.length / 100));
            for (let i = 0; i < rawPts.length; i += step) {
              sampled.push({ x: rawPts[i].x, z: rawPts[i].z });
              if (sampled.length >= 100) break;
            }
            trackCoordinatesCache.set(trackId, sampled);
          }
        }
      } catch (err) {
        console.error(`[recognizeTrack] 惰性缓存加载失败 ${trackId}:`, err.message);
      }
    }
  }

  // 2. 对当前行驶轨迹进行下采样，取最近的 150 个点并稀疏化到 30 个点
  const recentPositions = currentPositions.slice(-150);
  const S = [];
  const sStep = Math.max(1, Math.floor(recentPositions.length / 30));
  for (let i = 0; i < recentPositions.length; i += sStep) {
    S.push({ x: recentPositions[i].x, z: recentPositions[i].z });
    if (S.length >= 30) break;
  }
  if (S.length < 10) return []; // 轨迹太短不进行比对

  const matches = [];

  // 3. 遍历比对各个赛道
  for (const [trackId, centerline] of trackCoordinatesCache.entries()) {
    const M = centerline.length;
    let matchedCount = 0;
    let totalDist = 0;
    const matchedIndices = [];

    // 计算当前轨迹的各个采样点到中心线的最短距离
    for (const s of S) {
      let minDist = Infinity;
      let minIdx = -1;
      
      for (let j = 0; j < M; j++) {
        const c = centerline[j];
        const dx = s.x - c.x;
        const dz = s.z - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) {
          minDist = dist;
          minIdx = j;
        }
      }

      // 距离阈值设定为 25 米
      if (minDist < 25) {
        matchedCount++;
        totalDist += minDist;
        matchedIndices.push(minIdx);
      }
    }

    // 匹配比率
    const matchRatio = matchedCount / S.length;
    if (matchRatio < 0.4) continue; // 匹配率太低，放弃

    // 平均匹配距离
    const avgDist = totalDist / matchedCount;
    const distScore = Math.exp(-avgDist / 20.0);

    // 时序单调性校验
    let forwardSteps = 0;
    let backwardSteps = 0;
    for (let k = 1; k < matchedIndices.length; k++) {
      const idxA = matchedIndices[k - 1];
      const idxB = matchedIndices[k];
      const diff = (idxB - idxA + M) % M;
      if (diff === 0) continue;
      if (diff < M / 2) {
        forwardSteps++;
      } else {
        backwardSteps++;
      }
    }
    const stepsTotal = forwardSteps + backwardSteps;
    const seqScore = stepsTotal > 0 ? Math.max(forwardSteps, backwardSteps) / stepsTotal : 1.0;

    const confidence = matchRatio * distScore * (0.3 + 0.7 * seqScore);

    matches.push({
      trackId,
      trackName: tracksDict[trackId]?.name || trackId,
      confidence,
      details: {
        matchRatio: parseFloat(matchRatio.toFixed(2)),
        avgDistance: parseFloat(avgDist.toFixed(1)),
        monotonicity: parseFloat(seqScore.toFixed(2))
      }
    });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}
