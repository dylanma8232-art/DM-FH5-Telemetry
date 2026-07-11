// Forza Telemetry Physics Analyzer Service

// 计算走线分析
export function calculateDrivingLineAnalysis(positions) {
  if (!positions || positions.length === 0) {
    return { 评分: 0, 良好比例: 0, 偏差比例: 0, 严重偏离: 0 };
  }
  
  let good = 0, medium = 0, bad = 0;
  positions.forEach(p => {
    const dl = Math.abs(p.drivingLine || 0);
    if (dl < 30) good++;
    else if (dl < 70) medium++;
    else bad++;
  });
  
  const total = positions.length;
  const score = Math.round((good / total) * 100);
  
  return {
    评分: score,
    良好比例: Math.round((good / total) * 100),
    偏差比例: Math.round((medium / total) * 100),
    严重偏离: Math.round((bad / total) * 100),
    总点数: total
  };
}

// 计算驾驶风格
export function calculateDrivingStyle(data) {
  if (!data || data.length === 0) {
    return { 油门控制: 0, 刹车控制: 0, 转向平顺性: 0, G力分布: {} };
  }
  
  let maxAccel = 0, maxBrake = 0, maxGLong = 0, maxGLat = 0;
  let steerChanges = 0;
  let prevSteer = 0;
  
  data.forEach(d => {
    const accel = d.controls?.accel || 0;
    const brake = d.controls?.brake || 0;
    const steer = d.controls?.steer || 0;
    const gLong = Math.abs(d.acceleration?.z || 0);
    const gLat = Math.abs(d.acceleration?.x || 0);
    
    if (accel > maxAccel) maxAccel = accel;
    if (brake > maxBrake) maxBrake = brake;
    if (gLong > maxGLong) maxGLong = gLong;
    if (gLat > maxGLat) maxGLat = gLat;
    
    // 计算转向变化次数
    if (Math.abs(steer - prevSteer) > 20) {
      steerChanges++;
    }
    prevSteer = steer;
  });
  
  // 计算平顺性评分（转向变化越少越平顺）
  const steerSmoothness = Math.max(0, 100 - Math.round((steerChanges / data.length) * 100));
  
  return {
    油门控制: Math.round((maxAccel / 255) * 100),
    刹车控制: Math.round((maxBrake / 255) * 100),
    转向平顺性: steerSmoothness,
    G力分布: {
      最大纵向: Math.round(maxGLong * 100) / 100,
      最大横向: Math.round(maxGLat * 100) / 100
    }
  };
}

// 计算详细统计
export function calculateDetailedStats(data) {
  if (!data || data.length === 0) {
    return {};
  }
  
  let maxSpeed = 0, maxRpm = 0, maxPower = 0;
  let speedSum = 0, rpmSum = 0;
  let count = 0;
  
  data.forEach(d => {
    const speed = d.speedKmh || 0;
    const rpm = d.currentEngineRpm || 0;
    const power = d.powerHP || 0;
    
    if (speed > maxSpeed) maxSpeed = speed;
    if (rpm > maxRpm) maxRpm = rpm;
    if (power > maxPower) maxPower = power;
    
    speedSum += speed;
    rpmSum += rpm;
    count++;
  });
  
  return {
    最高速度: Math.round(maxSpeed),
    最高转速: Math.round(maxRpm),
    最大马力: Math.round(maxPower),
    平均速度: Math.round(speedSum / count),
    平均转速: Math.round(rpmSum / count),
    数据点数: count
  };
}

// 驾驶综合评分
export function calculateDrivingScore(session) {
  const data = session.data || [];
  const positions = session.positions || [];
  const laps = session.laps || {};
  
  if (data.length === 0) {
    return { 总分: 0, 等级: 'N/A', 维度: {}, 建议: ['数据不足，无法评分'] };
  }
  
  // === 维度 1: 圈速（20分）===
  const lapTimes = [];
  let prevLapNum = 0;
  data.forEach((d) => {
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
    if (heavyRatio > 0.2 && heavyRatio < 0.6) brakeScore = 18;
    else if (heavyRatio > 0.1 && heavyRatio < 0.7) brakeScore = 15;
    else if (heavyRatio > 0.05) brakeScore = 12;
    else brakeScore = 8;
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
    lineScore = Math.round((goodLineCount / positions.length) * 20);
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
  if (total >= 90) grade = 'S+';
  else if (total >= 80) grade = 'S';
  else if (total >= 70) grade = 'A';
  else if (total >= 60) grade = 'B';
  else if (total >= 40) grade = 'C';
  else grade = 'D';
  
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
      圈速: { 分数: lapScore, 满分: 20, 最佳圈: bestLap, 平均圈: lapTimes.length > 0 ? Math.round((lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length) * 1000) / 1000 : 0 },
      刹车: { 分数: brakeScore, 满分: 20, 重刹占比: totalBrakeCount > 0 ? Math.round((heavyBrakeCount / totalBrakeCount) * 100) : 0 },
      油门: { 分数: throttleScore, 满分: 20, 弯中给油比: corneringCount > 0 ? Math.round((goodThrottleInCorner / corneringCount) * 100) : 0 },
      走线: { 分数: lineScore, 满分: 20, 良好比例: positions.length > 0 ? Math.round((goodLineCount / positions.length) * 100) : 0 },
      一致性: { 分数: consistencyScore, 满分: 20, 圈数: lapTimes.length }
    },
    建议: advice
  };
}

// 轮胎性能分析
export function calculateTireAnalysis(data) {
  if (!data || data.length === 0) {
    return { 温度分布: {}, 打滑统计: {}, 侧偏角分析: {} };
  }
  
  const tireTempFL = [], tireTempFR = [], tireTempRL = [], tireTempRR = [];
  const slipFL = [], slipFR = [], slipRL = [], slipRR = [];
  const angleFL = [], angleFR = [], angleRL = [], angleRR = [];
  
  data.forEach(d => {
    if (d.tireTemp) {
      tireTempFL.push(d.tireTemp.frontLeft || 0);
      tireTempFR.push(d.tireTemp.frontRight || 0);
      tireTempRL.push(d.tireTemp.rearLeft || 0);
      tireTempRR.push(d.tireTemp.rearRight || 0);
    }
    if (d.tireCombinedSlip) {
      slipFL.push(d.tireCombinedSlip.frontLeft || 0);
      slipFR.push(d.tireCombinedSlip.frontRight || 0);
      slipRL.push(d.tireCombinedSlip.rearLeft || 0);
      slipRR.push(d.tireCombinedSlip.rearRight || 0);
    }
    if (d.tireSlipAngle) {
      angleFL.push(d.tireSlipAngle.frontLeft || 0);
      angleFR.push(d.tireSlipAngle.frontRight || 0);
      angleRL.push(d.tireSlipAngle.rearLeft || 0);
      angleRR.push(d.tireSlipAngle.rearRight || 0);
    }
  });
  
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const max = arr => arr.length > 0 ? Math.max(...arr) : 0;
  
  const toCelsius = f => (f - 32) * 5 / 9;
  const avgTempFL = toCelsius(avg(tireTempFL));
  const avgTempFR = toCelsius(avg(tireTempFR));
  const avgTempRL = toCelsius(avg(tireTempRL));
  const avgTempRR = toCelsius(avg(tireTempRR));
  
  return {
    温度分布: {
      前左: Math.round(avgTempFL),
      前右: Math.round(avgTempFR),
      后左: Math.round(avgTempRL),
      后右: Math.round(avgTempRR),
      平均温度: Math.round((avgTempFL + avgTempFR + avgTempRL + avgTempRR) / 4),
      最高温差: Math.round(Math.max(avgTempFL, avgTempFR, avgTempRL, avgTempRR) - Math.min(avgTempFL, avgTempFR, avgTempRL, avgTempRR))
    },
    打滑统计: {
      前左平均: (avg(slipFL)).toFixed(2),
      前右平均: (avg(slipFR)).toFixed(2),
      后左平均: (avg(slipRL)).toFixed(2),
      后右平均: (avg(slipRR)).toFixed(2),
      最大打滑: (max([...slipFL, ...slipFR, ...slipRL, ...slipRR])).toFixed(2),
      打滑时间比例: Math.round(data.filter(d => {
        const slip = d.tireCombinedSlip || {};
        return (slip.frontLeft || 0) > 0.8 || (slip.frontRight || 0) > 0.8 || 
               (slip.rearLeft || 0) > 0.8 || (slip.rearRight || 0) > 0.8;
      }).length / data.length * 100)
    },
    侧偏角分析: {
      前左平均: (avg(angleFL)).toFixed(1),
      前右平均: (avg(angleFR)).toFixed(1),
      后左平均: (avg(angleRL)).toFixed(1),
      后右平均: (avg(angleRR)).toFixed(1)
    }
  };
}

// 制动分析
export function calculateBrakingAnalysis(data, positions) {
  if (!data || data.length === 0) {
    return { 刹车点: [], 刹车力度: {}, 刹车效率: 0 };
  }
  
  const brakeEvents = [];
  let isBraking = false;
  let brakeStart = null;
  
  data.forEach((d, i) => {
    const brake = d.controls?.brake || 0;
    
    if (brake > 50 && !isBraking) {
      isBraking = true;
      brakeStart = {
        index: i,
        speed: d.speedKmh || 0,
        position: d.position || {},
        time: d.timestampMS || 0
      };
    } else if (brake <= 50 && isBraking) {
      isBraking = false;
      if (brakeStart) {
        const brakeEnd = {
          index: i,
          speed: d.speedKmh || 0,
          position: d.position || {},
          time: d.timestampMS || 0
        };
        
        brakeEvents.push({
          起始速度: Math.round(brakeStart.speed),
          结束速度: Math.round(brakeEnd.speed),
          速度损失: Math.round(brakeStart.speed - brakeEnd.speed),
          持续时间: brakeEnd.time - brakeStart.time,
          起始位置: brakeStart.position,
          结束位置: brakeEnd.position
        });
      }
    }
  });
  
  const brakeValues = data.map(d => d.controls?.brake || 0).filter(b => b > 0);
  const avgBrake = brakeValues.length > 0 ? brakeValues.reduce((a, b) => a + b, 0) / brakeValues.length : 0;
  
  const brakeGForces = data.map(d => Math.abs(d.acceleration?.z || 0)).filter(g => g > 0.1);
  const avgBrakeG = brakeGForces.length > 0 ? brakeGForces.reduce((a, b) => a + b, 0) / brakeGForces.length : 0;
  
  return {
    刹车事件: brakeEvents.slice(0, 20),
    刹车事件总数: brakeEvents.length,
    平均刹车力度: Math.round(avgBrake),
    平均刹车G力: avgBrakeG.toFixed(2),
    刹车效率: avgBrake > 0 ? (avgBrakeG / (avgBrake / 255) * 100).toFixed(0) : 0
  };
}

// 加速效率分析
export function calculateAccelerationAnalysis(data) {
  if (!data || data.length === 0) {
    return { 加速G力: {}, 牵引力利用率: 0, 出弯加速点: [] };
  }
  
  const accelEvents = [];
  let isAccelerating = false;
  let accelStart = null;
  
  data.forEach((d, i) => {
    const accel = d.controls?.accel || 0;
    const brake = d.controls?.brake || 0;
    
    if (accel > 200 && brake < 30 && !isAccelerating) {
      isAccelerating = true;
      accelStart = {
        index: i,
        speed: d.speedKmh || 0,
        time: d.timestampMS || 0
      };
    } else if ((accel < 100 || brake > 50) && isAccelerating) {
      isAccelerating = false;
      if (accelStart) {
        const accelEnd = {
          index: i,
          speed: d.speedKmh || 0,
          time: d.timestampMS || 0
        };
        
        accelEvents.push({
          起始速度: Math.round(accelStart.speed),
          结束速度: Math.round(accelEnd.speed),
          速度提升: Math.round(accelEnd.speed - accelStart.speed),
          持续时间: accelEnd.time - accelStart.time
        });
      }
    }
  });
  
  const accelGForces = data.map(d => d.acceleration?.z || 0).filter(g => g > 0.1);
  const avgAccelG = accelGForces.length > 0 ? accelGForces.reduce((a, b) => a + b, 0) / accelGForces.length : 0;
  const maxAccelG = accelGForces.length > 0 ? Math.max(...accelGForces) : 0;
  
  const slipDuringAccel = data.filter(d => (d.controls?.accel || 0) > 200)
    .map(d => {
      const slip = d.tireCombinedSlip || {};
      return Math.max(slip.frontLeft || 0, slip.frontRight || 0, slip.rearLeft || 0, slip.rearRight || 0);
    });
  const avgSlipDuringAccel = slipDuringAccel.length > 0 ? slipDuringAccel.reduce((a, b) => a + b, 0) / slipDuringAccel.length : 0;
  
  return {
    加速事件: accelEvents.slice(0, 20),
    加速事件总数: accelEvents.length,
    平均加速G力: avgAccelG.toFixed(2),
    最大加速G力: maxAccelG.toFixed(2),
    牵引力利用率: ((1 - avgSlipDuringAccel) * 100).toFixed(0),
    平均加速打滑: avgSlipDuringAccel.toFixed(2)
  };
}

// 换挡分析
export function calculateShiftAnalysis(data) {
  if (!data || data.length === 0) {
    return { 换挡点: [], 档位统计: {}, 转速利用率: 0 };
  }
  
  const shifts = [];
  let prevGear = 0;
  const isForward = (g) => g >= 1 && g <= 10;
  
  data.forEach((d, i) => {
    const gear = d.controls?.gear ?? d.gear ?? 0;
    const rpm = d.currentEngineRpm || d.rpm || 0;
    const maxRpm = d.engineMaxRpm || 8000;
    
    if (gear !== prevGear && isForward(prevGear) && isForward(gear)) {
      shifts.push({
        从档位: prevGear,
        到档位: gear,
        换挡转速: Math.round(rpm),
        转速百分比: Math.round((rpm / maxRpm) * 100),
        速度: Math.round(d.speedKmh || 0)
      });
    }
    prevGear = gear;
  });
  
  const gearUsage = {};
  data.forEach(d => {
    const gear = d.controls?.gear ?? d.gear ?? 0;
    if (isForward(gear)) {
      const gearName = gear + '档';
      gearUsage[gearName] = (gearUsage[gearName] || 0) + 1;
    }
  });
  
  const totalGearTime = Object.values(gearUsage).reduce((a, b) => a + b, 0);
  const gearPercentages = {};
  Object.entries(gearUsage).forEach(([gear, count]) => {
    gearPercentages[gear] = Math.round((count / totalGearTime) * 100);
  });
  
  const rpmValues = data.map(d => (d.currentEngineRpm || 0) / (d.engineMaxRpm || 8000) * 100);
  const avgRpmPercent = rpmValues.length > 0 ? rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length : 0;
  
  return {
    换挡事件: shifts.slice(0, 30),
    换挡总数: shifts.length,
    档位使用: gearPercentages,
    平均换挡转速: shifts.length > 0 ? Math.round(shifts.reduce((a, b) => a + b.换挡转速, 0) / shifts.length) : 0,
    平均转速利用率: Math.round(avgRpmPercent)
  };
}

// 赛道分段分析
export function calculateSectorAnalysis(data, positions) {
  if (!data || data.length === 0 || !positions || positions.length === 0) {
    return { 分段: [] };
  }
  
  const sectorCount = 5;
  const sectorLength = Math.floor(positions.length / sectorCount);
  const sectors = [];
  
  for (let i = 0; i < sectorCount; i++) {
    const startIdx = i * sectorLength;
    const endIdx = i === sectorCount - 1 ? positions.length - 1 : (i + 1) * sectorLength;
    
    const sectorPositions = positions.slice(startIdx, endIdx + 1);
    const sectorData = data.filter(d => {
      const pos = d.position;
      if (!pos) return false;
      
      const startX = sectorPositions[0]?.x || 0;
      const startZ = sectorPositions[0]?.z || 0;
      const endX = sectorPositions[sectorPositions.length - 1]?.x || 0;
      const endZ = sectorPositions[sectorPositions.length - 1]?.z || 0;
      
      const minX = Math.min(startX, endX) - 50;
      const maxX = Math.max(startX, endX) + 50;
      const minZ = Math.min(startZ, endZ) - 50;
      const maxZ = Math.max(startZ, endZ) + 50;
      
      return pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ;
    });
    
    const speeds = sectorData.map(d => d.speedKmh || 0).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    
    const drivingLines = sectorPositions.map(p => Math.abs(p.drivingLine || 0));
    const goodLines = drivingLines.filter(dl => dl < 30).length;
    const lineScore = drivingLines.length > 0 ? Math.round((goodLines / drivingLines.length) * 100) : 0;
    
    sectors.push({
      段落: i + 1,
      平均速度: Math.round(avgSpeed),
      最高速度: Math.round(maxSpeed),
      走线评分: lineScore,
      数据点数: sectorData.length
    });
  }
  
  return {
    分段数: sectorCount,
    分段: sectors
  };
}

// 赛道分段计时分析
export function analyzeSectors(positions, numSectors = 3, bestLapHint = 0) {
  if (!positions || positions.length < 10) return null;

  const laps = new Map();
  for (const p of positions) {
    const ln = p.lapNum || 0;
    if (!laps.has(ln)) laps.set(ln, []);
    laps.get(ln).push(p);
  }

  const lapCandidates = [];
  for (const [ln, lapPos] of laps) {
    if (lapPos.length < 500) continue;
    const times = lapPos.map(p => p.lapTime || 0).filter(t => t > 0);
    if (times.length < 2) continue;
    const duration = Math.max(...times) - Math.min(...times);
    if (duration <= 15) continue;
    lapCandidates.push({ ln, lapPos, duration });
  }

  let bestLapPositions = positions;
  if (lapCandidates.length > 0) {
    if (bestLapHint > 15) {
      const best = lapCandidates.reduce((min, c) =>
        Math.abs(c.duration - bestLapHint) < Math.abs(min.duration - bestLapHint) ? c : min
      );
      bestLapPositions = best.lapPos;
    } else {
      const best = lapCandidates.reduce((max, c) => c.duration > max.duration ? c : max);
      bestLapPositions = best.lapPos;
    }
  }

  const pos = bestLapPositions;
  let totalDist = 0;
  const dists = [0];
  for (let i = 1; i < pos.length; i++) {
    const dx = pos[i].x - pos[i - 1].x;
    const dz = pos[i].z - pos[i - 1].z;
    totalDist += Math.sqrt(dx * dx + dz * dz);
    dists.push(totalDist);
  }

  const sectorLength = totalDist / numSectors;
  const sectors = [];

  for (let s = 0; s < numSectors; s++) {
    const startDist = s * sectorLength;
    const endDist = (s + 1) * sectorLength;

    let startIdx = 0, endIdx = pos.length - 1;
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= startDist) { startIdx = i; break; }
    }
    for (let i = dists.length - 1; i >= 0; i--) {
      if (dists[i] <= endDist) { endIdx = i; break; }
    }
    if (startIdx >= endIdx) endIdx = Math.min(startIdx + 1, pos.length - 1);

    const slice = pos.slice(startIdx, endIdx + 1);
    if (slice.length === 0) continue;

    let startTime = slice[0].lapTime || 0;
    let endTime = slice[slice.length - 1].lapTime || 0;
    let sectorTime = endTime - startTime;

    if (sectorTime <= 0 && slice[0].timestampMS && slice[slice.length - 1].timestampMS) {
      startTime = slice[0].timestampMS / 1000;
      endTime = slice[slice.length - 1].timestampMS / 1000;
      sectorTime = endTime - startTime;
    }

    let maxSpeed = 0, sumSpeed = 0, sumAccel = 0, sumBrake = 0;
    slice.forEach(p => {
      if (p.speed > maxSpeed) maxSpeed = p.speed;
      sumSpeed += p.speed || 0;
      sumAccel += p.accel || 0;
      sumBrake += p.brake || 0;
    });

    sectors.push({
      sectorIndex: s + 1,
      startDist,
      endDist,
      sectorTime: sectorTime > 0 ? sectorTime : 0,
      maxSpeed,
      avgSpeed: slice.length > 0 ? sumSpeed / slice.length : 0,
      avgAccel: slice.length > 0 ? sumAccel / slice.length : 0,
      avgBrake: slice.length > 0 ? sumBrake / slice.length : 0,
      dataPoints: slice.length
    });
  }

  return {
    numSectors,
    totalDist,
    sectors,
    totalSectorTime: sectors.reduce((sum, s) => sum + s.sectorTime, 0)
  };
}

// 驾驶建议系统
export function generateDrivingAdvice(analysis) {
  const advice = [];
  
  if (analysis.走线分析 && analysis.走线分析.偏差比例 > 30) {
    advice.push({
      类型: '走线',
      严重程度: 'high',
      消息: '走线偏差较大，建议练习参考线',
      具体: '偏差比例' + analysis.走线分析.偏差比例 + '%，良好比例仅' + analysis.走线分析.良好比例 + '%'
    });
  }
  
  if (analysis.制动分析 && analysis.制动分析.平均刹车G力) {
    const brakeG = parseFloat(analysis.制动分析.平均刹车G力);
    if (brakeG < 0.8) {
      advice.push({
        类型: '刹车',
        严重程度: 'medium',
        消息: '刹车力度不足，可以更晚更重地刹车',
        具体: '刹车G力平均仅' + brakeG + 'G，车辆极限可达1.5G'
      });
    }
  }
  
  if (analysis.轮胎分析 && analysis.轮胎分析.温度分布) {
    const tempDiff = analysis.轮胎分析.温度分布.最高温差;
    if (tempDiff > 20) {
      advice.push({
        类型: '轮胎',
        严重程度: 'medium',
        消息: '轮胎温度不均匀，检查悬挂调校',
        具体: '前后温差' + tempDiff + '°，建议增加前轮负外倾角'
      });
    }
  }
  
  if (analysis.加速分析 && analysis.加速分析.平均加速打滑) {
    const slip = parseFloat(analysis.加速分析.平均加速打滑);
    if (slip > 0.3) {
      advice.push({
        类型: '加速',
        严重程度: 'low',
        消息: '出弯打滑较多，油门控制需要更细腻',
        具体: '平均轮胎打滑' + slip.toFixed(2) + '，建议渐进加油'
      });
    }
  }
  
  if (analysis.换挡分析 && analysis.换挡分析.平均转速利用率) {
    const rpmUtil = analysis.换挡分析.平均转速利用率;
    if (rpmUtil < 70) {
      advice.push({
        类型: '换挡',
        严重程度: 'low',
        消息: '转速利用率偏低，可以延迟换挡',
        具体: '平均转速利用率仅' + rpmUtil + '%，建议在90%以上换挡'
      });
    }
  }
  
  if (advice.length === 0) {
    advice.push({
      类型: '综合',
      严重程度: 'info',
      消息: '驾驶表现良好',
      具体: '各项指标均在合理范围内'
    });
  }
  
  return advice;
}

// 调校-遥测智能诊断引擎
export function generateTuneDiagnosis(session, tune) {
  const diagnoses = [];
  const data = session.data || [];
  if (data.length === 0 || !tune) return diagnoses;

  const temps = { fl: [], fr: [], rl: [], rr: [] };
  const suspensions = { fl: [], fr: [], rl: [], rr: [] };
  const slips = { fl: [], fr: [], rl: [], rr: [] };
  const slipAngles = { fl: [], fr: [], rl: [], rr: [] };
  let understeerCount = 0;
  let oversteerCount = 0;
  let brakingFrameCount = 0;
  let accelFrameCount = 0;

  data.forEach(frame => {
    if (frame.tireTemp) {
      temps.fl.push(frame.tireTemp.frontLeft || 0);
      temps.fr.push(frame.tireTemp.frontRight || 0);
      temps.rl.push(frame.tireTemp.rearLeft || 0);
      temps.rr.push(frame.tireTemp.rearRight || 0);
    }
    if (frame.suspension) {
      suspensions.fl.push(frame.suspension.frontLeft || 0.5);
      suspensions.fr.push(frame.suspension.frontRight || 0.5);
      suspensions.rl.push(frame.suspension.rearLeft || 0.5);
      suspensions.rr.push(frame.suspension.rearRight || 0.5);
    }
    if (frame.tireCombinedSlip) {
      slips.fl.push(frame.tireCombinedSlip.frontLeft || 0);
      slips.fr.push(frame.tireCombinedSlip.frontRight || 0);
      slips.rl.push(frame.tireCombinedSlip.rearLeft || 0);
      slips.rr.push(frame.tireCombinedSlip.rearRight || 0);
    }
    if (frame.tireSlipAngle) {
      slipAngles.fl.push(frame.tireSlipAngle.frontLeft || 0);
      slipAngles.fr.push(frame.tireSlipAngle.frontRight || 0);
      slipAngles.rl.push(frame.tireSlipAngle.rearLeft || 0);
      slipAngles.rr.push(frame.tireSlipAngle.rearRight || 0);
    }
    const accel = frame.acceleration || {};
    if (Math.abs(accel.x || 0) > 1.5) {
      if ((accel.x || 0) > 0) oversteerCount++;
      else understeerCount++;
    }
    if (frame.controls) {
      if (frame.controls.brake > 50) brakingFrameCount++;
      if (frame.controls.accel > 200) accelFrameCount++;
    }
  });

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgTemp = { fl: avg(temps.fl), fr: avg(temps.fr), rl: avg(temps.rl), rr: avg(temps.rr) };
  const avgSusp = { fl: avg(suspensions.fl), fr: avg(suspensions.fr), rl: avg(suspensions.rl), rr: avg(suspensions.rr) };
  const frontTemp = (avgTemp.fl + avgTemp.fr) / 2;
  const rearTemp = (avgTemp.rl + avgTemp.rr) / 2;
  const frontSusp = (avgSusp.fl + avgSusp.fr) / 2;
  const rearSusp = (avgSusp.rl + avgSusp.rr) / 2;
  const totalFrames = data.length;

  if (frontTemp > rearTemp + 15) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'high', 问题: '前轮温度明显高于后轮', 数据: `前${frontTemp.toFixed(1)}°F vs 后${rearTemp.toFixed(1)}°F`, 建议: '降低前胎压 1-2 PSI 或 增加后胎压 1-2 PSI', 调整方向: { 'tires.frontPressure': -1, 'tires.rearPressure': +1 } });
  } else if (rearTemp > frontTemp + 15) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'high', 问题: '后轮温度明显高于前轮', 数据: `后${rearTemp.toFixed(1)}°F vs 前${frontTemp.toFixed(1)}°F`, 建议: '增加前胎压 1-2 PSI 或 降低后胎压 1-2 PSI', 调整方向: { 'tires.frontPressure': +1, 'tires.rearPressure': -1 } });
  }

  const leftTemp = (avgTemp.fl + avgTemp.rl) / 2;
  const rightTemp = (avgTemp.fr + avgTemp.rr) / 2;
  if (Math.abs(leftTemp - rightTemp) > 10) {
    diagnoses.push({ 类别: '轮胎', 严重程度: 'medium', 问题: '左右轮胎温度不均', 数据: `左${leftTemp.toFixed(1)}°F vs 右${rightTemp.toFixed(1)}°F`, 建议: '检查束角(Toe)设置，温度高的一侧应增加负束角', 调整方向: {} });
  }

  if (frontSusp < 0.35) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'high', 问题: '前悬挂过度压缩', 数据: `平均压缩${(frontSusp * 100).toFixed(0)}%`, 建议: '提高前车身高度 2-3cm 或 降低前弹簧硬度 5-10', 调整方向: { 'suspension.frontSpring': -5, 'suspension.frontRideHeight': +2 } });
  }
  if (rearSusp < 0.35) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'high', 问题: '后悬挂过度压缩', 数据: `平均压缩${(rearSusp * 100).toFixed(0)}%`, 建议: '提高后车身高度 2-3cm 或 降低后弹簧硬度 5-10', 调整方向: { 'suspension.rearSpring': -5, 'suspension.rearRideHeight': +2 } });
  }
  if (frontSusp > 0.65) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '前悬挂过度伸展', 数据: `平均伸展${(frontSusp * 100).toFixed(0)}%`, 建议: '降低前车身高度 2-3cm 或 增加前弹簧硬度 5-10', 调整方向: { 'suspension.frontSpring': +5, 'suspension.frontRideHeight': -2 } });
  }
  if (rearSusp > 0.65) {
    diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '后悬挂过度伸展', 数据: `平均伸展${(rearSusp * 100).toFixed(0)}%`, 建议: '降低后车身高度 2-3cm 或 增加后弹簧硬度 5-10', 调整方向: { 'suspension.rearSpring': +5, 'suspension.rearRideHeight': -2 } });
  }

  if (data.length > 0) {
    let noseDiveCount = 0;
    data.forEach(frame => {
      if (frame.controls && frame.controls.brake > 100 && frame.suspension) {
        if (frame.suspension.frontLeft < 0.35 && frame.suspension.frontRight < 0.35 && frame.suspension.rearLeft > 0.55 && frame.suspension.rearRight > 0.55) {
          noseDiveCount++;
        }
      }
    });
    if (noseDiveCount > totalFrames * 0.05) {
      diagnoses.push({ 类别: '悬挂', 严重程度: 'medium', 问题: '刹车时车头下沉严重', 数据: `严重帧占比${(noseDiveCount / totalFrames * 100).toFixed(1)}%`, 建议: '增加后弹簧硬度 5-10 或 增加后防倾杆 3-5', 调整方向: { 'suspension.rearSpring': +5, 'suspension.rearARB': +3 } });
    }
  }

  if (understeerCount > oversteerCount * 2 && understeerCount > totalFrames * 0.03) {
    diagnoses.push({ 类别: '传动', 严重程度: 'medium', 问题: '转向不足倾向明显', 数据: `不足${understeerCount}次 vs 过度${oversteerCount}次`, 建议: '增加差速器加速值 5-10% 以改善出弯牵引力', 调整方向: { 'drivetrain.diffAccel': +5 } });
  }
  if (oversteerCount > understeerCount * 2 && oversteerCount > totalFrames * 0.03) {
    diagnoses.push({ 类别: '传动', 严重程度: 'medium', 问题: '转向过度倾向明显', 数据: `过度${oversteerCount}次 vs 不足${understeerCount}次`, 建议: '降低差速器减速值 5-10% 以改善入弯稳定性', 调整方向: { 'drivetrain.diffDecel': -5 } });
  }

  if (understeerCount > totalFrames * 0.02) {
    diagnoses.push({ 类别: '空气动力学', 严重程度: 'low', 问题: '高速弯可能存在转向不足', 数据: `不足事件${understeerCount}次`, 建议: '增加前下压力 20-50kg 以增加前轴抓地力', 调整方向: { 'aero.frontDownforce': +20 } });
  }

  return diagnoses;
}

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
