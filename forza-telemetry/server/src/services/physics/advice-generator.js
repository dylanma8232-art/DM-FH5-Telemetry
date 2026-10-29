// 调校-遥测智能诊断引擎
export function generateTuneDiagnosis(session, tune) {
  const diagnoses = [];
  const data = session.data || [];
  if (data.length === 0 || !tune) return diagnoses;
  const temps = {
    fl: [],
    fr: [],
    rl: [],
    rr: []
  };
  const suspensions = {
    fl: [],
    fr: [],
    rl: [],
    rr: []
  };
  const slips = {
    fl: [],
    fr: [],
    rl: [],
    rr: []
  };
  const slipAngles = {
    fl: [],
    fr: [],
    rl: [],
    rr: []
  };
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
      if ((accel.x || 0) > 0) oversteerCount++;else understeerCount++;
    }
    if (frame.controls) {
      if (frame.controls.brake > 50) brakingFrameCount++;
      if (frame.controls.accel > 200) accelFrameCount++;
    }
  });
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const avgTemp = {
    fl: avg(temps.fl),
    fr: avg(temps.fr),
    rl: avg(temps.rl),
    rr: avg(temps.rr)
  };
  const avgSusp = {
    fl: avg(suspensions.fl),
    fr: avg(suspensions.fr),
    rl: avg(suspensions.rl),
    rr: avg(suspensions.rr)
  };
  const frontTemp = (avgTemp.fl + avgTemp.fr) / 2;
  const rearTemp = (avgTemp.rl + avgTemp.rr) / 2;
  const frontSusp = (avgSusp.fl + avgSusp.fr) / 2;
  const rearSusp = (avgSusp.rl + avgSusp.rr) / 2;
  const totalFrames = data.length;
  if (frontTemp > rearTemp + 15) {
    diagnoses.push({
      类别: '轮胎',
      严重程度: 'high',
      问题: '前轮温度明显高于后轮',
      数据: `前${frontTemp.toFixed(1)}°F vs 后${rearTemp.toFixed(1)}°F`,
      建议: '降低前胎压 1-2 PSI 或 增加后胎压 1-2 PSI',
      调整方向: {
        'tires.frontPressure': -1,
        'tires.rearPressure': +1
      }
    });
  } else if (rearTemp > frontTemp + 15) {
    diagnoses.push({
      类别: '轮胎',
      严重程度: 'high',
      问题: '后轮温度明显高于前轮',
      数据: `后${rearTemp.toFixed(1)}°F vs 前${frontTemp.toFixed(1)}°F`,
      建议: '增加前胎压 1-2 PSI 或 降低后胎压 1-2 PSI',
      调整方向: {
        'tires.frontPressure': +1,
        'tires.rearPressure': -1
      }
    });
  }
  const leftTemp = (avgTemp.fl + avgTemp.rl) / 2;
  const rightTemp = (avgTemp.fr + avgTemp.rr) / 2;
  if (Math.abs(leftTemp - rightTemp) > 10) {
    diagnoses.push({
      类别: '轮胎',
      严重程度: 'medium',
      问题: '左右轮胎温度不均',
      数据: `左${leftTemp.toFixed(1)}°F vs 右${rightTemp.toFixed(1)}°F`,
      建议: '检查束角设置，温度高的一侧应增加负束角',
      调整方向: {}
    });
  }
  if (frontSusp < 0.35) {
    diagnoses.push({
      类别: '悬挂',
      严重程度: 'high',
      问题: '前悬挂过度压缩',
      数据: `平均压缩${(frontSusp * 100).toFixed(0)}%`,
      建议: '提高前车身高度 2-3cm 或 降低前弹簧硬度 5-10',
      调整方向: {
        'suspension.frontSpring': -5,
        'suspension.frontRideHeight': +2
      }
    });
  }
  if (rearSusp < 0.35) {
    diagnoses.push({
      类别: '悬挂',
      严重程度: 'high',
      问题: '后悬挂过度压缩',
      数据: `平均压缩${(rearSusp * 100).toFixed(0)}%`,
      建议: '提高后车身高度 2-3cm 或 降低后弹簧硬度 5-10',
      调整方向: {
        'suspension.rearSpring': -5,
        'suspension.rearRideHeight': +2
      }
    });
  }
  if (frontSusp > 0.65) {
    diagnoses.push({
      类别: '悬挂',
      严重程度: 'medium',
      问题: '前悬挂过度伸展',
      数据: `平均伸展${(frontSusp * 100).toFixed(0)}%`,
      建议: '降低前车身高度 2-3cm 或 增加前弹簧硬度 5-10',
      调整方向: {
        'suspension.frontSpring': +5,
        'suspension.frontRideHeight': -2
      }
    });
  }
  if (rearSusp > 0.65) {
    diagnoses.push({
      类别: '悬挂',
      严重程度: 'medium',
      问题: '后悬挂过度伸展',
      数据: `平均伸展${(rearSusp * 100).toFixed(0)}%`,
      建议: '降低后车身高度 2-3cm 或 增加后弹簧硬度 5-10',
      调整方向: {
        'suspension.rearSpring': +5,
        'suspension.rearRideHeight': -2
      }
    });
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
      diagnoses.push({
        类别: '悬挂',
        严重程度: 'medium',
        问题: '刹车时车头下沉严重',
        数据: `严重帧占比${(noseDiveCount / totalFrames * 100).toFixed(1)}%`,
        建议: '增加后弹簧硬度 5-10 或 增加后防倾杆 3-5',
        调整方向: {
          'suspension.rearSpring': +5,
          'suspension.rearARB': +3
        }
      });
    }
  }
  if (understeerCount > oversteerCount * 2 && understeerCount > totalFrames * 0.03) {
    diagnoses.push({
      类别: '传动',
      严重程度: 'medium',
      问题: '转向不足倾向明显',
      数据: `不足${understeerCount}次 vs 过度${oversteerCount}次`,
      建议: '增加差速器加速值 5-10% 以改善出弯牵引力',
      调整方向: {
        'drivetrain.diffAccel': +5
      }
    });
  }
  if (oversteerCount > understeerCount * 2 && oversteerCount > totalFrames * 0.03) {
    diagnoses.push({
      类别: '传动',
      严重程度: 'medium',
      问题: '转向过度倾向明显',
      数据: `过度${oversteerCount}次 vs 不足${understeerCount}次`,
      建议: '降低差速器减速值 5-10% 以改善入弯稳定性',
      调整方向: {
        'drivetrain.diffDecel': -5
      }
    });
  }
  if (understeerCount > totalFrames * 0.02) {
    diagnoses.push({
      类别: '空气动力学',
      严重程度: 'low',
      问题: '高速弯可能存在转向不足',
      数据: `不足事件${understeerCount}次`,
      建议: '增加前下压力 20-50kg 以增加前轴抓地力',
      调整方向: {
        'aero.frontDownforce': +20
      }
    });
  }
  return diagnoses;
}

// 获取最佳圈号辅助函数