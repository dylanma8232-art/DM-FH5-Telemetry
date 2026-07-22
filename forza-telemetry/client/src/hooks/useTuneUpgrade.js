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

export function getInitialParameterRecommendations(resolvedShop = {}, raceType = 'road', segmentType = 'balanced') {
  const driveType = (resolvedShop.effectiveDriveType || resolvedShop.baseDriveType || 'awd').toLowerCase();
  const specs = resolvedShop.stockSpecs || {};
  const massKg = Number(specs.massKg) || 1350;
  const weightRatio = Number(specs.frontWeightRatio) || 0.52;
  
  const hasWidebody = (resolvedShop.effectiveSelections?.widebody?.optionId === 'listed_widebody') ||
                      (resolvedShop.parts?.widebody?.optionId === 'listed_widebody');

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

  if (hasWidebody) {
    basePressureFront -= 0.05;
    basePressureRear -= 0.05;
  }

  // 构建默认全套物理推导基准字典
  const baseValues = {
    tire_pressure_front: basePressureFront,
    tire_pressure_rear: basePressureRear,
    tire_camber_front: raceType === 'drift' ? -2.5 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -1.2 : -1.8),
    tire_camber_rear: raceType === 'drift' ? -0.8 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -0.6 : -1.2),
    tire_toe_front: raceType === 'drift' ? 0.2 : 0.0,
    tire_toe_rear: raceType === 'drift' ? -0.1 : 0.0,
    caster_front: raceType === 'drift' ? 6.5 : 6.0,

    arb_front: (driveType === 'awd' ? (raceType === 'drift' ? 35.0 : (raceType === 'dirt' ? 15.0 : 18.0)) : (driveType === 'fwd' ? 12.0 : 30.0)) * (hasWidebody ? 1.05 : 1.0),
    arb_rear: (driveType === 'awd' ? (raceType === 'drift' ? 55.0 : (raceType === 'dirt' ? 35.0 : 48.0)) : (driveType === 'fwd' ? 55.0 : 22.0)) * (hasWidebody ? 1.05 : 1.0),

    spring_front: (115.0 * weightRatio * 2) * (raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0)),
    spring_rear: (105.0 * (1 - weightRatio) * 2) * (raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0)),
    rebound_front: 11.5 * weightRatio * 2,
    rebound_rear: 10.5 * (1 - weightRatio) * 2,
    bump_front: (11.5 * weightRatio * 2) * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55),
    bump_rear: (10.5 * (1 - weightRatio) * 2) * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55),
    ride_height_front: raceType === 'cross_country' ? 25.0 : (raceType === 'dirt' || raceType === 'rally' ? 18.0 : 12.0),
    ride_height_rear: raceType === 'cross_country' ? 25.0 : (raceType === 'dirt' || raceType === 'rally' ? 18.0 : 12.0),

    final_drive: 3.80,
    gear_1: 3.40,
    gear_2: 2.40,
    gear_3: 1.75,
    gear_4: 1.35,
    gear_5: 1.08,
    gear_6: 0.90,
    gear_7: 0.78,
    gear_8: 0.69,
    gear_9: 0.61,
    gear_10: 0.55,

    diff_front_accel: 40.0,
    diff_front_decel: 0.0,
    diff_rear_accel: raceType === 'drift' ? 85.0 : (driveType === 'awd' ? 85.0 : 50.0),
    diff_rear_decel: raceType === 'drift' ? 80.0 : 15.0,
    diff_center: 70.0,
    diff_accel: raceType === 'drift' ? 85.0 : (driveType === 'awd' ? 85.0 : 50.0),
    diff_decel: 15.0,

    brake_balance: 50.0,
    brake_pressure: 100.0,

    downforce_front: segmentType === 'high_speed' ? 45.0 : 75.0,
    downforce_rear: segmentType === 'high_speed' ? 70.0 : 120.0
  };

  // 若 resolvedShop 中包含参数的限制范围，对基准值进行约束插值
  const paramMap = {};
  for (const param of (resolvedShop.tuneParameters || [])) {
    if (param?.id) paramMap[param.id] = param;
  }

  const tires = {};
  const suspension = {};
  const drivetrain = {};
  const brakes = {};
  const aero = {};

  for (const [id, rawVal] of Object.entries(baseValues)) {
    let val = rawVal;
    const param = paramMap[id];
    if (param?.range) {
      const min = Number(param.range.min);
      const max = Number(param.range.max);
      if (!isNaN(min) && !isNaN(max) && max > min) {
        val = Math.max(min, Math.min(max, val));
        const step = Number(param.range.step);
        if (step > 0) {
          const steps = Math.round((val - min) / step);
          val = Number((min + steps * step).toFixed(2));
        }
      }
    }

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
