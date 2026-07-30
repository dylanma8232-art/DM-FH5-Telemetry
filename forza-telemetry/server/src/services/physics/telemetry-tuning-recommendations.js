const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percent = (part, total) => total ? Math.round(part / total * 100) : 0;
const control = (frame, name) => Number(frame.controls?.[name] ?? frame[name] ?? 0) / 255;
const value = (frame, path, fallback = 0) => path.reduce((current, key) => current?.[key], frame) ?? fallback;

const wheelValues = (frame, group) => [
  value(frame, [group, 'frontLeft']), value(frame, [group, 'frontRight']),
  value(frame, [group, 'rearLeft']), value(frame, [group, 'rearRight'])
];

const recommendation = (id, category, title, changes, evidence, confidence = '中') => ({
  id, category, title, changes, evidence, confidence,
  prerequisite: '仅在对应调教项目可调时执行；一次只改一组建议，重新跑一场相同赛道验证。'
});

/**
 * 不依赖保存方案的遥测调教建议。
 * 输出的是相对当前游戏数值的安全小步调整；页面若拿到本地方案，再把同一变化量换算为绝对目标值。
 */
export function generateTelemetryTuningRecommendations(data = []) {
  let targetData = data;
  if (data.length > 5000) {
    const step = Math.ceil(data.length / 5000);
    targetData = [];
    for (let i = 0; i < data.length; i += step) {
      targetData.push(data[i]);
    }
  }
  const frames = targetData.filter(frame => Number.isFinite(Number(frame.speedKmh ?? frame.speedMs)));
  if (frames.length < 80) return { recommendations: [], summary: '遥测样本不足，至少录制一段包含制动、过弯和加速的有效圈。', sampleCount: frames.length };

  const throttleFrames = frames.filter(frame => control(frame, 'accel') >= 0.72 && Number(frame.speedKmh || 0) > 25);
  const brakeFrames = frames.filter(frame => control(frame, 'brake') >= 0.62 && Number(frame.speedKmh || 0) > 25);
  const highLoadFrames = frames.filter(frame => Math.abs(value(frame, ['acceleration', 'x'])) / 9.80665 >= 0.65);
  const recommendations = [];

  const axleSlip = (pool, axle, predicate) => pool.filter(frame => {
    const wheels = axle === 'front' ? wheelValues(frame, 'tireSlipRatio').slice(0, 2) : wheelValues(frame, 'tireSlipRatio').slice(2);
    return predicate(average(wheels));
  });
  const drivenSlip = axleSlip(throttleFrames, 'rear', slip => slip > 0.15);
  if (percent(drivenSlip.length, throttleFrames.length) >= 12) {
    recommendations.push(recommendation('power-slip', '差速器与抓地力', '重油门时驱动轮空转偏多', [
      { key: 'diffAccel', parameter: '驱动桥差速器加速锁', delta: -5, unit: '%', direction: '降低' },
      { key: 'rearTirePressure', parameter: '后胎压', delta: -0.1, unit: 'bar', direction: '降低' }
    ], `全油门样本 ${throttleFrames.length} 帧，其中后轴滑移超过 15% 的占 ${percent(drivenSlip.length, throttleFrames.length)}%。`, '高'));
  }

  const frontLock = axleSlip(brakeFrames, 'front', slip => slip < -0.15);
  const rearLock = axleSlip(brakeFrames, 'rear', slip => slip < -0.15);
  if (percent(frontLock.length, brakeFrames.length) >= 8 || percent(rearLock.length, brakeFrames.length) >= 8) {
    const frontDominant = frontLock.length >= rearLock.length;
    recommendations.push(recommendation('brake-lock', '刹车', '重刹时出现抱死', [
      { key: 'brakePressure', parameter: '刹车压力', delta: -5, unit: '%', direction: '降低' },
      { key: 'brakeBalance', parameter: '刹车平衡', delta: frontDominant ? -2 : 2, unit: '%', direction: frontDominant ? '向后调整' : '向前调整' }
    ], `制动样本 ${brakeFrames.length} 帧；${frontDominant ? '前轴' : '后轴'}抱死帧占 ${percent(Math.max(frontLock.length, rearLock.length), brakeFrames.length)}%。`, '高'));
  }

  const bottoming = highLoadFrames.filter(frame => wheelValues(frame, 'suspension').some(item => item > 0 && item <= 0.05));
  if (percent(bottoming.length, highLoadFrames.length) >= 8) {
    recommendations.push(recommendation('bottoming', '悬挂', '高负荷路段悬挂接近行程下限', [
      { key: 'frontRideHeight', parameter: '前车身高度', delta: 1, unit: 'cm', direction: '提高' },
      { key: 'rearRideHeight', parameter: '后车身高度', delta: 1, unit: 'cm', direction: '提高' },
      { key: 'frontSpring', parameter: '前弹簧硬度', delta: 5, unit: '%', direction: '提高', relative: true },
      { key: 'rearSpring', parameter: '后弹簧硬度', delta: 5, unit: '%', direction: '提高', relative: true }
    ], `横向负荷超过 0.65G 的样本 ${highLoadFrames.length} 帧，其中接近行程下限的占 ${percent(bottoming.length, highLoadFrames.length)}%。`, '中'));
  }

  const temps = frames.map(frame => wheelValues(frame, 'tireTemp')).filter(items => items.some(item => item > 0));
  if (temps.length >= 40) {
    const frontTemp = average(temps.map(items => average(items.slice(0, 2))));
    const rearTemp = average(temps.map(items => average(items.slice(2))));
    const difference = frontTemp - rearTemp;
    if (Math.abs(difference) >= 12) {
      const frontHot = difference > 0;
      recommendations.push(recommendation('axle-temperature', '轮胎', `${frontHot ? '前轴' : '后轴'}轮胎温度持续偏高`, [
        { key: frontHot ? 'frontTirePressure' : 'rearTirePressure', parameter: `${frontHot ? '前' : '后'}胎压`, delta: -0.1, unit: 'bar', direction: '降低' },
        { key: frontHot ? 'frontARB' : 'rearARB', parameter: `${frontHot ? '前' : '后'}防倾杆`, delta: -1, unit: '', direction: '降低' }
      ], `前后轴平均胎温差 ${Math.abs(difference).toFixed(1)}°；该建议只处理前后配平，不把单次温度当作轮胎配方结论。`, '中'));
    }
  }

  const limiterFrames = throttleFrames.filter(frame => {
    const maxRpm = Number(frame.engineMaxRpm || 0);
    return maxRpm > 0 && Number(frame.currentEngineRpm || frame.rpm || 0) >= maxRpm * 0.985;
  });
  if (percent(limiterFrames.length, throttleFrames.length) >= 6) {
    recommendations.push(recommendation('rpm-limiter', '齿比', '全油门时多次触及转速上限', [
      { key: 'finalDrive', parameter: '终传比', delta: -0.05, unit: '', direction: '降低数值（拉长）' }
    ], `全油门样本 ${throttleFrames.length} 帧，触及发动机转速上限的占 ${percent(limiterFrames.length, throttleFrames.length)}%。`, '中'));
  }

  return {
    recommendations,
    sampleCount: frames.length,
    summary: recommendations.length
      ? `依据 ${frames.length} 帧遥测生成 ${recommendations.length} 组小步调教建议。`
      : `已分析 ${frames.length} 帧遥测，未发现达到自动调校阈值的问题；可继续结合驾驶感受使用问题诊断。`
  };
}
