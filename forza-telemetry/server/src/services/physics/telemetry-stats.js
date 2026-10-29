// 计算驾驶风格
export function calculateDrivingStyle(data) {
  if (!data || data.length === 0) {
    return {
      油门控制: 0,
      刹车控制: 0,
      转向平顺性: 0,
      G力分布: {}
    };
  }
  let maxAccel = 0,
    maxBrake = 0,
    maxGLong = 0,
    maxGLat = 0;
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
  const steerSmoothness = Math.max(0, 100 - Math.round(steerChanges / data.length * 100));
  return {
    油门控制: Math.round(maxAccel / 255 * 100),
    刹车控制: Math.round(maxBrake / 255 * 100),
    转向平顺性: steerSmoothness,
    G力分布: {
      最大纵向: Math.round(maxGLong * 100) / 100,
      最大横向: Math.round(maxGLat * 100) / 100
    }
  };
}

// 计算详细统计

// 计算详细统计
export function calculateDetailedStats(data) {
  if (!data || data.length === 0) {
    return {};
  }
  let maxSpeed = 0,
    maxRpm = 0,
    maxPower = 0;
  let speedSum = 0,
    rpmSum = 0;
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

// FH5 动力与传动透视图分析
export function calculateGearingAnalysis(data) {
  if (!data || data.length === 0) return {
    powerBand: [],
    shifts: [],
    maxRpmBangingTimeSec: 0
  };
  const shifts = [];
  const powerBandMap = new Map();
  let prevGear = 0;
  let rpmBangingTicks = 0;
  data.forEach(d => {
    const gear = d.controls?.gear ?? d.gear ?? 0;
    const rpm = d.currentEngineRpm || d.rpm || 0;
    const power = d.powerWatts || d.powerHP || 0;
    const torque = d.torque || 0;
    const maxRpm = d.engineMaxRpm || 8000;
    if (gear >= 4 && rpm > maxRpm * 0.98) {
      rpmBangingTicks++;
    }
    if (gear > prevGear && prevGear > 0 && gear <= 10) {
      shifts.push({
        gear: `${prevGear}->${gear}`,
        rpm: Math.round(rpm),
        speed: Math.round(d.speedKmh || (d.speedMs ? d.speedMs * 3.6 : 0)),
        time: d.timestampMS || 0
      });
    }
    prevGear = gear;
    if (power > 0 || torque > 0) {
      const roundedRpm = Math.floor(rpm / 100) * 100;
      if (!powerBandMap.has(roundedRpm)) {
        powerBandMap.set(roundedRpm, {
          power: [],
          torque: []
        });
      }
      powerBandMap.get(roundedRpm).power.push(power);
      powerBandMap.get(roundedRpm).torque.push(torque);
    }
  });
  const powerBand = Array.from(powerBandMap.keys()).sort((a, b) => a - b).map(rpm => {
    const pts = powerBandMap.get(rpm);
    return {
      rpm,
      power: Math.round(pts.power.reduce((a, b) => a + b, 0) / pts.power.length),
      torque: Math.round(pts.torque.reduce((a, b) => a + b, 0) / pts.torque.length)
    };
  });
  return {
    powerBand,
    shifts: shifts.slice(0, 50),
    maxRpmBangingTimeSec: (rpmBangingTicks / 60).toFixed(2)
  };
}

// FH5 底盘与避震扫描分析

// FH5 底盘与避震扫描分析
export function calculateSuspensionAnalysis(data, positions) {
  if (!data || data.length === 0) return {
    bottomingEvents: [],
    bottomingScore: 100
  };
  const bottomingEvents = [];
  let bottomingTicks = 0;
  data.forEach((d, i) => {
    const susp = d.suspension || {};
    const isBottoming = susp.frontLeft >= 0.98 || susp.frontRight >= 0.98 || susp.rearLeft >= 0.98 || susp.rearRight >= 0.98;
    if (isBottoming) {
      bottomingTicks++;
      if (bottomingTicks % 10 === 1) {
        bottomingEvents.push({
          time: d.timestampMS || 0,
          speed: Math.round(d.speedKmh || 0),
          position: positions && positions[i] ? positions[i] : null
        });
      }
    }
  });
  return {
    bottomingEvents: bottomingEvents.slice(0, 30),
    bottomingScore: Math.max(0, 100 - bottomingTicks / 10),
    totalBottomingTicks: bottomingTicks
  };
}

// FH5 差速器与滑移角动态分析

// FH5 差速器与滑移角动态分析
export function calculateDifferentialAnalysis(data) {
  if (!data || data.length === 0) return {
    cornerExitSlip: [],
    oversteerEvents: []
  };
  const cornerExitSlip = [];
  const oversteerEvents = [];
  data.forEach(d => {
    const accel = d.controls?.accel || 0;
    const yaw = Math.abs(d.angularVelocity?.y || 0);
    const slipRatio = d.tireSlipRatio || {};
    if (accel > 127 && yaw > 0.5) {
      const frontSlip = ((slipRatio.frontLeft || 0) + (slipRatio.frontRight || 0)) / 2;
      const rearSlip = ((slipRatio.rearLeft || 0) + (slipRatio.rearRight || 0)) / 2;
      cornerExitSlip.push({
        time: d.timestampMS || 0,
        frontSlip: frontSlip.toFixed(3),
        rearSlip: rearSlip.toFixed(3),
        speed: Math.round(d.speedKmh || 0)
      });
      if (rearSlip > frontSlip + 0.5) {
        oversteerEvents.push({
          time: d.timestampMS,
          severity: 'High'
        });
      }
    }
  });
  return {
    cornerExitSlip: cornerExitSlip.filter((_, i) => i % 5 === 0).slice(0, 50),
    oversteerEvents: oversteerEvents.slice(0, 20)
  };
}

// 赛道分段分析

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
    lapCandidates.push({
      ln,
      lapPos,
      duration
    });
  }
  let bestLapPositions = positions;
  if (lapCandidates.length > 0) {
    if (bestLapHint > 15) {
      const best = lapCandidates.reduce((min, c) => Math.abs(c.duration - bestLapHint) < Math.abs(min.duration - bestLapHint) ? c : min);
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
    let startIdx = 0,
      endIdx = pos.length - 1;
    for (let i = 0; i < dists.length; i++) {
      if (dists[i] >= startDist) {
        startIdx = i;
        break;
      }
    }
    for (let i = dists.length - 1; i >= 0; i--) {
      if (dists[i] <= endDist) {
        endIdx = i;
        break;
      }
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
    let maxSpeed = 0,
      sumSpeed = 0,
      sumAccel = 0,
      sumBrake = 0;
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