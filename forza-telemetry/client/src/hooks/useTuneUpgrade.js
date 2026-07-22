import { useState } from 'react'
import { api } from '../services/api'

export function useTuneUpgrade({
  formData,
  setFormData,
  targetPi,
  setTargetPi,
  upgradeShop,
  setUpgradeShop,
  draftVersionRef,
  unknownPiSelectionCount,
  createDefaultFormData
}) {
  const [autoUpgradeLoading, setAutoUpgradeLoading] = useState(false)
  const [aiRaceType, setAiRaceType] = useState('road')
  const [segmentType, setSegmentType] = useState('balanced')
  const [aiDriveType, setAiDriveType] = useState('awd')

  // 一键升级：在用户选择的 PI 上限内寻找最高 PI 的组合。只有现有改装项
  // 组合确实无法再提高时，才允许低于目标 PI。
  const handleAutoUpgrade = async ({ preferredDriveType, raceType, selectedSegmentType } = {}) => {
    if (!formData.vehicleId || !upgradeShop) {
      alert('请先选择一辆车辆。')
      return false
    }
    const draftVersion = draftVersionRef.current
    try {
      setAutoUpgradeLoading(true)
      // 配件选择由可复现的约束求解器完成；它只使用已验证的车辆档案和 PI 模型。
      // 大模型不参与离散配件决策，避免不可复现或编造游戏内不存在的选项。
      const autoResult = await api.vehicles.autoSolve(formData.vehicleId, {
        parts: formData.parts || {}, targetPi,
        raceType: raceType || aiRaceType,
        segmentType: selectedSegmentType || segmentType,
        driveType: preferredDriveType || aiDriveType
      })
      if (draftVersion !== draftVersionRef.current) return false
      if (autoResult.withinTarget === false) {
        throw new Error(`当前车辆在目标 ${targetPi} PI 内没有可行方案，求解器返回 ${autoResult.prediction?.totalPi ?? '未知'} PI，未应用该方案。`)
      }
      const resolvedShop = await api.vehicles.getUpgrades(formData.vehicleId, {
        selections: JSON.stringify(autoResult.parts || {}),
        driveType: preferredDriveType || aiDriveType
      })
      const initRecommendations = getInitialParameterRecommendations(resolvedShop, raceType || aiRaceType, selectedSegmentType || segmentType)
      setFormData(prev => ({
        ...prev,
        parts: resolvedShop.effectiveSelections || autoResult.parts || {},
        tires: prev.tires && Object.keys(prev.tires).length > 0 ? prev.tires : initRecommendations.tires,
        suspension: prev.suspension && Object.keys(prev.suspension).length > 0 ? prev.suspension : initRecommendations.suspension,
        drivetrain: prev.drivetrain && Object.keys(prev.drivetrain).length > 0 ? prev.drivetrain : initRecommendations.drivetrain,
        brakes: prev.brakes && Object.keys(prev.brakes).length > 0 ? prev.brakes : initRecommendations.brakes,
        aero: prev.aero && Object.keys(prev.aero).length > 0 ? prev.aero : initRecommendations.aero
      }))
      setUpgradeShop(resolvedShop)
      return true
    } catch (e) { /* 一键升级失败 */
      if (draftVersionRef.current !== draftVersion) return false
      alert('一键升级失败: ' + e.message)
      return false
    } finally {
      setAutoUpgradeLoading(false)
    }
  }

  return {
    autoUpgradeLoading,
    aiRaceType,
    setAiRaceType,
    segmentType,
    setSegmentType,
    aiDriveType,
    setAiDriveType,
    handleAutoUpgrade
  }
}

export function getInitialParameterRecommendations(resolvedShop, raceType = 'road', segmentType = 'balanced') {
  const driveType = (resolvedShop.effectiveDriveType || resolvedShop.baseDriveType || 'awd').toLowerCase();
  const specs = resolvedShop.stockSpecs || {};
  const massKg = Number(specs.massKg) || 1350;
  // 前轴重量比例 (默认 0.52 即前 52%/后 48%)
  const weightRatio = Number(specs.frontWeightRatio) || 0.52;
  
  // 检查是否装配宽体套件
  const hasWidebody = (resolvedShop.effectiveSelections?.widebody?.optionId === 'listed_widebody') ||
                      (resolvedShop.parts?.widebody?.optionId === 'listed_widebody');

  const tires = {};
  const suspension = {};
  const drivetrain = {};
  const brakes = {};
  const aero = {};

  // 1. 轮胎气压与定位角标杆物理推导
  let basePressureFront = 1.95;
  let basePressureRear = 1.95;
  if (raceType === 'cross_country') {
    basePressureFront = 1.55;
    basePressureRear = 1.55;
  } else if (raceType === 'dirt' || raceType === 'rally') {
    basePressureFront = 1.75;
    basePressureRear = 1.75;
  } else if (raceType === 'drift') {
    basePressureFront = 2.15;
    basePressureRear = 1.85;
  }

  // 宽体套件气压微调 (胎宽增加，降低 0.05 bar 维持最佳温区)
  if (hasWidebody) {
    basePressureFront -= 0.05;
    basePressureRear -= 0.05;
  }

  for (const param of resolvedShop.tuneParameters || []) {
    const id = param.id;
    const min = param.range ? Number(param.range.min) : 0;
    const max = param.range ? Number(param.range.max) : 100;
    const mid = (min + max) / 2;

    let val = mid;

    // 车辆级范围尚未核验时不能用占位范围生成假数值
    if (param.rangeConfidence === 'vehicle_specific_unknown') continue;

    // A. 胎压与定位角
    if (id === 'tire_pressure_front') val = basePressureFront;
    else if (id === 'tire_pressure_rear') val = basePressureRear;
    else if (id === 'tire_camber_front') {
      val = raceType === 'drift' ? -2.5 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -1.2 : -1.8);
    }
    else if (id === 'tire_camber_rear') {
      val = raceType === 'drift' ? -0.8 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -0.6 : -1.2);
    }
    else if (id === 'tire_toe_front') val = raceType === 'drift' ? 0.2 : 0.0;
    else if (id === 'tire_toe_rear') val = raceType === 'drift' ? -0.1 : 0.0;
    else if (id === 'caster_front') val = raceType === 'drift' ? 6.5 : 6.0;

    // B. 防倾杆 (根据驱动形式与前轴重量配比计算)
    else if (id === 'arb_front') {
      if (driveType === 'awd') val = raceType === 'drift' ? 35.0 : (raceType === 'dirt' ? 15.0 : 18.0);
      else if (driveType === 'fwd') val = 12.0;
      else val = 30.0; // RWD
      if (hasWidebody) val *= 1.05; // 宽体提升杠杆刚度 5%
    }
    else if (id === 'arb_rear') {
      if (driveType === 'awd') val = raceType === 'drift' ? 55.0 : (raceType === 'dirt' ? 35.0 : 48.0);
      else if (driveType === 'fwd') val = 55.0; // FWD 增强尾部寻迹
      else val = 22.0; // RWD 稳定后轴
      if (hasWidebody) val *= 1.05;
    }

    // C. 弹簧硬度 (依据整车质量与前后重量配比插值)
    else if (id === 'spring_front') {
      const springMod = raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0);
      val = ((max - min) * weightRatio + min) * springMod;
    }
    else if (id === 'spring_rear') {
      const springMod = raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0);
      val = ((max - min) * (1 - weightRatio) + min) * springMod;
    }

    // D. 车身高度
    else if (id === 'ride_height_front' || id === 'ride_height_rear') {
      val = raceType === 'cross_country' ? max : (raceType === 'dirt' || raceType === 'rally' ? min + (max - min) * 0.6 : min);
    }

    // E. 阻尼 (回弹阻尼按弹簧比例插值，压缩阻尼保持 55% 临界比例)
    else if (id === 'rebound_front') {
      val = (max - min) * weightRatio + min;
    }
    else if (id === 'rebound_rear') {
      val = (max - min) * (1 - weightRatio) + min;
    }
    else if (id === 'bump_front') {
      const reboundFront = (max - min) * weightRatio + min;
      val = reboundFront * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55);
    }
    else if (id === 'bump_rear') {
      const reboundRear = (max - min) * (1 - weightRatio) + min;
      val = reboundRear * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55);
    }

    // F. 差速器锁止率
    else if (id === 'diff_front_accel') val = 40.0;
    else if (id === 'diff_front_decel') val = 0.0;
    else if (id === 'diff_rear_accel') val = raceType === 'drift' ? 85.0 : (driveType === 'awd' ? 85.0 : 50.0);
    else if (id === 'diff_rear_decel') val = raceType === 'drift' ? 80.0 : 15.0;
    else if (id === 'diff_center') val = 70.0;

    // G. 刹车系统
    else if (id === 'brake_balance') val = 50.0;
    else if (id === 'brake_pressure') val = 100.0;

    // H. 空气动力学下压力
    else if (id === 'downforce_front') {
      val = segmentType === 'high_speed' ? min : min + (max - min) * 0.45;
    }
    else if (id === 'downforce_rear') {
      val = segmentType === 'high_speed' ? min : min + (max - min) * 0.60;
    }

    // 细分偏好调整
    if (segmentType === 'rough' && (id.startsWith('rebound_') || id.startsWith('bump_'))) val *= 0.85;
    if ((segmentType === 'technical' || segmentType === 'tarmac_bias') && (id.startsWith('arb_'))) val *= 1.1;

    // 参数步长与范围限制约束
    if (param.range) {
      val = Math.max(min, Math.min(max, val));
      const step = Number(param.range.step);
      if (step > 0) {
        const steps = Math.round((val - min) / step);
        val = Number((min + steps * step).toFixed(2));
      }
    }

    // 字段属性归类映射
    if (id.startsWith('tire_') || id === 'caster_front') {
      const field = id.replace('tire_', '');
      tires[field === 'pressure_front' ? 'frontPressure' : field === 'pressure_rear' ? 'rearPressure' : field === 'camber_front' ? 'frontCamber' : field === 'camber_rear' ? 'rearCamber' : field === 'toe_front' ? 'frontToe' : field === 'toe_rear' ? 'rearToe' : 'frontCaster'] = val;
    } else if (id.startsWith('spring_') || id.startsWith('rebound_') || id.startsWith('bump_') || id.startsWith('arb_') || id.startsWith('ride_height_')) {
      const field = id;
      suspension[field === 'spring_front' ? 'frontSpring' : field === 'spring_rear' ? 'rearSpring' : field === 'rebound_front' ? 'frontRebound' : field === 'rebound_rear' ? 'rearRebound' : field === 'bump_front' ? 'frontBump' : field === 'bump_rear' ? 'rearBump' : field === 'arb_front' ? 'frontARB' : field === 'arb_rear' ? 'rearARB' : field === 'ride_height_front' ? 'frontRideHeight' : 'rearRideHeight'] = val;
    } else if (id.startsWith('diff_') || id === 'final_drive' || id.startsWith('gear_')) {
      const field = id;
      drivetrain[field === 'diff_front_accel' ? 'frontDiffAccel' : field === 'diff_front_decel' ? 'frontDiffDecel' : field === 'diff_rear_accel' ? 'rearDiffAccel' : field === 'diff_rear_decel' ? 'rearDiffDecel' : field === 'diff_center' ? 'diffCenter' : field === 'final_drive' ? 'finalDrive' : field] = val;
    } else if (id.startsWith('brake_')) {
      const field = id.replace('brake_', '');
      brakes[field] = val;
    } else if (id.startsWith('downforce_')) {
      const field = id;
      aero[field === 'downforce_front' ? 'frontDownforce' : 'rearDownforce'] = val;
    }
  }

  return { tires, suspension, drivetrain, brakes, aero };
}
