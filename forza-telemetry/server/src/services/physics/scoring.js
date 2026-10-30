// Forza Telemetry Physics Analyzer Service

// 计算走线分析
export function calculateDrivingLineAnalysis(positions) {
  if (!positions || positions.length === 0) {
    return {
      评分: 0,
      良好比例: 0,
      偏差比例: 0,
      严重偏离: 0
    };
  }
  let good = 0,
    medium = 0,
    bad = 0;
  positions.forEach(p => {
    const dl = Math.abs(p.drivingLine || 0);
    if (dl < 30) good++;else if (dl < 70) medium++;else bad++;
  });
  const total = positions.length;
  const score = Math.round(good / total * 100);
  return {
    评分: score,
    良好比例: Math.round(good / total * 100),
    偏差比例: Math.round(medium / total * 100),
    严重偏离: Math.round(bad / total * 100),
    总点数: total
  };
}

// 计算驾驶风格

// 驾驶综合评分
export function calculateDrivingScore(session) {
  const data = session.data || [];
  const positions = session.positions || [];
  const laps = session.laps || {};
  if (data.length === 0) {
    return {
      总分: 0,
      等级: 'N/A',
      维度: {},
      建议: ['数据不足，无法评分']
    };
  }

  // === 维度 1: 圈速（20分）===
  const lapTimes = [];
  let prevLapNum = 0;
  data.forEach(d => {
    const ln = d.lapNumber || d.lapNum || 0;
    if (ln > prevLapNum && prevLapNum > 0 && d.lapTime) {
      lapTimes.push(d.lapTime);
    }
    if (ln > 0) prevLapNum = ln;
  });
  const bestLap = laps.best || 0;
  let lapScore = 0;
  if (bestLap > 0 && lapTimes.length > 0) {
    const avg = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
    const avgDelta = avg - bestLap;
    lapScore = Math.max(0, Math.min(20, 20 - Math.round(avgDelta * 2))); // 每+0.5s 扣 1 分
  } else if (bestLap > 0) {
    lapScore = 15;
  }

  // === 维度 2: 刹车（20分）===
  let heavyBrakeCount = 0;
  let totalBrakeCount = 0;
  let consecutiveBrake = 0;
  let maxConsecutive = 0;
  data.forEach(d => {
    const brake = d.controls?.brake || d.brake || 0;
    const gLong = Math.abs(d.acceleration?.z || d.gLong || 0);
    if (brake > 100) {
      totalBrakeCount++;
      if (gLong > 0.7) heavyBrakeCount++;
    }
    if (brake > 50) {
      consecutiveBrake++;
      if (consecutiveBrake > maxConsecutive) maxConsecutive = consecutiveBrake;
    } else {
      consecutiveBrake = 0;
    }
  });
  let brakeScore = 10;
  if (totalBrakeCount > 0) {
    const heavyRatio = heavyBrakeCount / totalBrakeCount;
    if (heavyRatio > 0.2 && heavyRatio < 0.6) brakeScore = 18;else if (heavyRatio > 0.1 && heavyRatio < 0.7) brakeScore = 15;else if (heavyRatio > 0.05) brakeScore = 12;else brakeScore = 8;
    if (maxConsecutive > 100) brakeScore -= 3;
  }
  brakeScore = Math.max(0, Math.min(20, brakeScore));

  // === 维度 3: 油门（20分）===
  let corneringCount = 0;
  let goodThrottleInCorner = 0;
  data.forEach(d => {
    const gLat = Math.abs(d.acceleration?.x || d.gLat || 0);
    const accel = d.controls?.accel || d.accel || 0;
    if (gLat > 0.5) {
      corneringCount++;
      if (accel > 150) goodThrottleInCorner++;
    }
  });
  let throttleScore = 10;
  if (corneringCount > 0) {
    const ratio = goodThrottleInCorner / corneringCount;
    throttleScore = Math.round(ratio * 20);
  }
  throttleScore = Math.max(0, Math.min(20, throttleScore));

  // === 维度 4: 走线（20分）===
  let goodLineCount = 0;
  positions.forEach(p => {
    const dl = Math.abs(p.drivingLine || 0);
    if (dl < 30) goodLineCount++;
  });
  let lineScore = 0;
  if (positions.length > 0) {
    lineScore = Math.round(goodLineCount / positions.length * 20);
  }
  lineScore = Math.max(0, Math.min(20, lineScore));

  // === 维度 5: 一致性（20分）===
  let consistencyScore = 0;
  if (lapTimes.length >= 2) {
    const avg = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
    const variance = lapTimes.reduce((sum, t) => sum + (t - avg) ** 2, 0) / lapTimes.length;
    const stdDev = Math.sqrt(variance);
    consistencyScore = Math.max(0, Math.min(20, Math.round(20 - stdDev * 6)));
  } else {
    consistencyScore = 8;
  }
  const total = lapScore + brakeScore + throttleScore + lineScore + consistencyScore;
  let grade = 'C';
  if (total >= 90) grade = 'S+';else if (total >= 80) grade = 'S';else if (total >= 70) grade = 'A';else if (total >= 60) grade = 'B';else if (total >= 40) grade = 'C';else grade = 'D';
  const advice = [];
  const avgLap = lapTimes.length > 0 ? lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length : 0;
  if (lapScore < 14) {
    const delta = avgLap > 0 && bestLap > 0 ? (avgLap - bestLap).toFixed(1) : '?';
    advice.push(`平均圈速比最佳圈慢${delta}秒，专注每圈复刻最佳圈的刹车点和走线节奏`);
  }
  if (brakeScore < 12) {
    const heavyPct = totalBrakeCount > 0 ? Math.round(heavyBrakeCount / totalBrakeCount * 100) : 0;
    if (heavyPct < 20) {
      advice.push(`重刹占比仅${heavyPct}%，制动偏保守，建议在直道末端大胆重刹以缩短制动距离`);
    } else if (maxConsecutive > 100) {
      advice.push(`存在连续长刹（最长${maxConsecutive}帧），尝试分段制动：先重刹再松开再轻刹入弯`);
    } else {
      advice.push(`重刹占比${heavyPct}%，刹车节奏需优化，注意在直道末端而非弯中才开始重刹`);
    }
  }
  if (throttleScore < 12) {
    const throttlePct = corneringCount > 0 ? Math.round(goodThrottleInCorner / corneringCount * 100) : 0;
    advice.push(`弯中给油比例仅${throttlePct}%，出弯时应渐进给油，弯心过后尽早建立牵引力`);
  }
  if (lineScore < 12) {
    const goodPct = positions.length > 0 ? Math.round(goodLineCount / positions.length * 100) : 0;
    advice.push(`走线良好率${goodPct}%，偏差较大，建议参考赛道理想赛车线，利用路缘石扩大弯道半径`);
  }
  if (consistencyScore < 12) {
    const std = lapTimes.length >= 2 ? Math.sqrt(lapTimes.reduce((sum, t) => sum + (t - avgLap) ** 2, 0) / lapTimes.length) : 0;
    advice.push(`圈速标准差${std.toFixed(2)}秒，波动明显，专注每圈相同节奏而非刻意刷单圈`);
  }
  if (advice.length === 0) advice.push('表现优秀！保持当前节奏，尝试挑战理论最快圈（各分段最佳拼接）');
  return {
    总分: total,
    等级: grade,
    圈数统计: lapTimes.length,
    维度: {
      圈速: {
        分数: lapScore,
        满分: 20,
        最佳圈: bestLap,
        平均圈: lapTimes.length > 0 ? Math.round(lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length * 1000) / 1000 : 0
      },
      刹车: {
        分数: brakeScore,
        满分: 20,
        重刹占比: totalBrakeCount > 0 ? Math.round(heavyBrakeCount / totalBrakeCount * 100) : 0
      },
      油门: {
        分数: throttleScore,
        满分: 20,
        弯中给油比: corneringCount > 0 ? Math.round(goodThrottleInCorner / corneringCount * 100) : 0
      },
      走线: {
        分数: lineScore,
        满分: 20,
        良好比例: positions.length > 0 ? Math.round(goodLineCount / positions.length * 100) : 0
      },
      一致性: {
        分数: consistencyScore,
        满分: 20,
        圈数: lapTimes.length
      }
    },
    建议: advice
  };
}

// FH5 动力与传动透视图分析

// 获取最佳圈号辅助函数
export function getBestLapNum(data) {
  if (!data || data.length === 0) return 0;
  let minBestLap = Infinity;
  let bestLapNum = 0;
  for (const d of data) {
    const bl = d.bestLap || 0;
    const ln = d.lapNumber || d.lapNum || 0;
    if (bl > 0 && bl < minBestLap) {
      minBestLap = bl;
      bestLapNum = ln;
    }
  }
  if (bestLapNum === 0) {
    const laps = data.map(d => d.lapNumber || d.lapNum || 0).filter(l => l > 0);
    if (laps.length > 0) {
      const counts = {};
      laps.forEach(l => counts[l] = (counts[l] || 0) + 1);
      bestLapNum = parseInt(Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b));
    } else {
      bestLapNum = 0;
    }
  }
  return bestLapNum;
}

// 空间最接近点匹配辅助函数