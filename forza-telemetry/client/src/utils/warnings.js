import { WARNING_TYPES, WARNING_CATEGORIES, defaultWarningConfig, getWarningColor, getWarningAnimation } from './warningConfig';
import { WarningHistory } from './warningHistory';

export { getWarningColor, getWarningAnimation };

const warningHistory = new WarningHistory();

const historyBuffer = {
  tireSlip: [],
  acceleration: [],
  yawChange: [],
  speed: []
};

function smoothValue(buffer, newValue, maxSamples = 10) {
  buffer.push(newValue);
  if (buffer.length > maxSamples) buffer.shift();
  return buffer.reduce((a, b) => a + b, 0) / buffer.length;
}

function getDynamicThreshold(baseThreshold, speedKmh) {
  const speedFactor = Math.max(0.5, Math.min(2, speedKmh / 100));
  return baseThreshold * speedFactor;
}

export function checkWarnings(data, prevYaw = 0, config = defaultWarningConfig) {
  if (!data || !config.enabled) return [];
  
  const warnings = [];
  const now = Date.now();
  
  const ts = data.tireCombinedSlip || {};
  const onR = data.onRumbleStrip || {};
  const pd = data.puddleDepth || {};
  const suspension = data.suspension || {};
  const tireTemp = data.tireTemp || {};
  const tireSlipRatio = data.tireSlipRatio || {};
  const yaw = data.yaw || 0;
  const steer = data.controls?.steer || 0;
  const rpm = data.currentEngineRpm || 0;
  const maxRpm = data.engineMaxRpm || 8000;
  const fuel = data.fuel || 0;
  const boost = data.boost || 0;
  const speedKmh = data.speedKmh || 0;
  const acceleration = data.acceleration || {};
  
  let yawChange = Math.abs(yaw - prevYaw);
  if (yawChange > Math.PI) yawChange -= 2 * Math.PI;
  yawChange = Math.abs(yawChange);
  
  const steerAbs = Math.abs(steer);
  
  const slipFL = Math.abs(ts.frontLeft || 0);
  const slipFR = Math.abs(ts.frontRight || 0);
  const slipRL = Math.abs(ts.rearLeft || 0);
  const slipRR = Math.abs(ts.rearRight || 0);
  
  const smoothedSlip = smoothValue(historyBuffer.tireSlip, Math.max(slipFL, slipFR, slipRL, slipRR));
  const smoothedYaw = smoothValue(historyBuffer.yawChange, yawChange);
  const smoothedSpeed = smoothValue(historyBuffer.speed, speedKmh);
  
  const gMagnitude = Math.sqrt(
    (acceleration.x || 0) ** 2 + 
    (acceleration.z || 0) ** 2
  );
  
  const dynamicSlipSevere = getDynamicThreshold(config.thresholds.tireSlipSevere, smoothedSpeed);
  const dynamicSlipModerate = getDynamicThreshold(config.thresholds.tireSlipModerate, smoothedSpeed);
  
  // 轮胎打滑检测
  if (config.categories[WARNING_CATEGORIES.TIRE].enabled) {
    if (slipFL > dynamicSlipSevere || slipFR > dynamicSlipSevere || 
        slipRL > dynamicSlipSevere || slipRR > dynamicSlipSevere) {
      const warning = {
        type: WARNING_TYPES.DANGER,
        category: WARNING_CATEGORIES.TIRE,
        icon: '⚠',
        text: '轮胎严重打滑！',
        value: `最大: ${Math.max(slipFL, slipFR, slipRL, slipRR).toFixed(2)}`,
        cooldown: config.cooldowns[WARNING_TYPES.DANGER]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    } else if (slipFL > dynamicSlipModerate || slipFR > dynamicSlipModerate || 
               slipRL > dynamicSlipModerate || slipRR > dynamicSlipModerate) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.TIRE,
        icon: '▲',
        text: '轮胎打滑',
        value: `最大: ${Math.max(slipFL, slipFR, slipRL, slipRR).toFixed(2)}`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 轮胎温度预警已移除 (用户不关心轮胎温度)
  
  // 引擎转速预警
  if (config.categories[WARNING_CATEGORIES.ENGINE].enabled) {
    const rpmPercent = rpm / maxRpm;
    if (rpmPercent > config.thresholds.engineRedline) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.ENGINE,
        icon: '🔴',
        text: '引擎红区',
        value: `${(rpmPercent * 100).toFixed(0)}%`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 制动锁死检测
  if (config.categories[WARNING_CATEGORIES.BRAKE].enabled) {
    const slipRatios = [tireSlipRatio.frontLeft, tireSlipRatio.frontRight, 
                       tireSlipRatio.rearLeft, tireSlipRatio.rearRight]
      .filter(s => s !== undefined);
    
    if (slipRatios.length > 0) {
      const minSlip = Math.min(...slipRatios);
      if (minSlip < config.thresholds.brakeLockSevere) {
        const warning = {
          type: WARNING_TYPES.DANGER,
          category: WARNING_CATEGORIES.BRAKE,
          icon: '🔒',
          text: '制动锁死！',
          value: `最小: ${minSlip.toFixed(2)}`,
          cooldown: config.cooldowns[WARNING_TYPES.DANGER]
        };
        if (warningHistory.addWarning(warning)) {
          warnings.push(warning);
        }
      } else if (minSlip < config.thresholds.brakeLockModerate) {
        const warning = {
          type: WARNING_TYPES.WARNING,
          category: WARNING_CATEGORIES.BRAKE,
          icon: '⚠',
          text: '制动锁死风险',
          value: `最小: ${minSlip.toFixed(2)}`,
          cooldown: config.cooldowns[WARNING_TYPES.WARNING]
        };
        if (warningHistory.addWarning(warning)) {
          warnings.push(warning);
        }
      }
    }
  }
  
  // 动力打滑检测
  if (config.categories[WARNING_CATEGORIES.BRAKE].enabled) {
    const slipRatios = [tireSlipRatio.frontLeft, tireSlipRatio.frontRight, 
                       tireSlipRatio.rearLeft, tireSlipRatio.rearRight]
      .filter(s => s !== undefined);
    
    if (slipRatios.length > 0) {
      const maxSlip = Math.max(...slipRatios);
      if (maxSlip > config.thresholds.powerSlipSevere) {
        const warning = {
          type: WARNING_TYPES.WARNING,
          category: WARNING_CATEGORIES.BRAKE,
          icon: '💨',
          text: '动力打滑',
          value: `最大: ${maxSlip.toFixed(2)}`,
          cooldown: config.cooldowns[WARNING_TYPES.WARNING]
        };
        if (warningHistory.addWarning(warning)) {
          warnings.push(warning);
        }
      }
    }
  }
  
  // 转向不足检测
  if (config.categories[WARNING_CATEGORIES.TIRE].enabled) {
    if (steerAbs > 50 && smoothedYaw < 0.02 && smoothedSpeed > 30) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.TIRE,
        icon: '→',
        text: '转向不足',
        value: `转向: ${steerAbs.toFixed(0)}°`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 转向过度检测
  if (config.categories[WARNING_CATEGORIES.TIRE].enabled) {
    if (smoothedYaw > 0.05 && steerAbs < 30 && smoothedSpeed > 30) {
      const warning = {
        type: WARNING_TYPES.DANGER,
        category: WARNING_CATEGORIES.TIRE,
        icon: '↺',
        text: '转向过度！',
        value: `偏航: ${smoothedYaw.toFixed(3)}`,
        cooldown: config.cooldowns[WARNING_TYPES.DANGER]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 悬挂状态预警
  if (config.categories[WARNING_CATEGORIES.SUSPENSION].enabled) {
    const suspensions = [suspension.frontLeft, suspension.frontRight, 
                        suspension.rearLeft, suspension.rearRight]
      .filter(s => s !== undefined);
    
    if (suspensions.length > 0) {
      const minSusp = Math.min(...suspensions);
      const maxSusp = Math.max(...suspensions);
      
      if (minSusp < config.thresholds.suspensionCompress) {
        const warning = {
          type: WARNING_TYPES.WARNING,
          category: WARNING_CATEGORIES.SUSPENSION,
          icon: '⬇',
          text: '悬挂过度压缩',
          value: `最小: ${(minSusp * 100).toFixed(0)}%`,
          cooldown: config.cooldowns[WARNING_TYPES.WARNING]
        };
        if (warningHistory.addWarning(warning)) {
          warnings.push(warning);
        }
      }
      
      if (maxSusp > config.thresholds.suspensionExtend) {
        const warning = {
          type: WARNING_TYPES.WARNING,
          category: WARNING_CATEGORIES.SUSPENSION,
          icon: '⬆',
          text: '悬挂过度伸展',
          value: `最大: ${(maxSusp * 100).toFixed(0)}%`,
          cooldown: config.cooldowns[WARNING_TYPES.WARNING]
        };
        if (warningHistory.addWarning(warning)) {
          warnings.push(warning);
        }
      }
    }
  }
  
  // 高G力警告
  if (config.categories[WARNING_CATEGORIES.GFORCE].enabled) {
    if (gMagnitude > config.thresholds.gforceHigh) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.GFORCE,
        icon: '🎯',
        text: '高G力',
        value: `${gMagnitude.toFixed(2)}G`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 出界警告
  if (config.categories[WARNING_CATEGORIES.TRACK].enabled) {
    if (onR.frontLeft || onR.frontRight || onR.rearLeft || onR.rearRight) {
      const warning = {
        type: WARNING_TYPES.INFO,
        category: WARNING_CATEGORIES.TRACK,
        icon: '■',
        text: '出界警告',
        value: '路肩检测',
        cooldown: config.cooldowns[WARNING_TYPES.INFO]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 湿滑路面
  if (config.categories[WARNING_CATEGORIES.TRACK].enabled) {
    if (pd.frontLeft > 0.5 || pd.frontRight > 0.5 || pd.rearLeft > 0.5 || pd.rearRight > 0.5) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.TRACK,
        icon: '☔',
        text: '湿滑路面',
        value: `深度: ${Math.max(pd.frontLeft, pd.frontRight, pd.rearLeft, pd.rearRight).toFixed(2)}`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 燃油量低
  if (config.categories[WARNING_CATEGORIES.FUEL].enabled) {
    if (fuel < config.thresholds.fuelLow && fuel > 0) {
      const warning = {
        type: WARNING_TYPES.INFO,
        category: WARNING_CATEGORIES.FUEL,
        icon: '⛽',
        text: '燃油量低',
        value: `${(fuel * 100).toFixed(0)}%`,
        cooldown: config.cooldowns[WARNING_TYPES.INFO]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 涡轮增压过高
  if (config.categories[WARNING_CATEGORIES.ENGINE].enabled) {
    if (boost > config.thresholds.boostHigh) {
      const warning = {
        type: WARNING_TYPES.WARNING,
        category: WARNING_CATEGORIES.ENGINE,
        icon: '💨',
        text: '涡轮增压过高',
        value: `${boost.toFixed(2)} bar`,
        cooldown: config.cooldowns[WARNING_TYPES.WARNING]
      };
      if (warningHistory.addWarning(warning)) {
        warnings.push(warning);
      }
    }
  }
  
  // 状态正常
  if (warnings.length === 0) {
    const warning = {
      type: WARNING_TYPES.INFO,
      category: 'status',
      icon: '●',
      text: '状态正常',
      value: '',
      cooldown: 5000
    };
    if (warningHistory.addWarning(warning)) {
      warnings.push(warning);
    }
  }
  
  warningHistory.clearOldCooldowns();
  
  return warnings;
}

export function getWarningHistory() {
  return warningHistory.getHistory();
}

export function getWarningStats() {
  return warningHistory.getWarningStats();
}

export function clearWarningHistory() {
  warningHistory.clear();
}