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
  const [aiDriveType, setAiDriveType] = useState('awd')

  // 一键升级：在用户选择的 PI 上限内寻找最高 PI 的组合。只有现有改装项
  // 组合确实无法再提高时，才允许低于目标 PI。
  const handleAutoUpgrade = async ({ preferredDriveType, raceType } = {}) => {
    if (!formData.vehicleId || !upgradeShop) {
      alert('请先选择一辆车辆。')
      return false
    }
    const draftVersion = draftVersionRef.current
    try {
      setAutoUpgradeLoading(true)
      // AI 只负责在服务端已解析、且 PI 有实测或样本校准依据的候选中做取舍。
      // 最终构型必须由服务端再校验，客户端绝不自行拼凑或估算。
      const aiResult = await api.vehicles.aiSolve(formData.vehicleId, {
        parts: formData.parts || {}, targetPi,
        raceType: raceType || aiRaceType,
        driveType: preferredDriveType || aiDriveType
      })
      if (draftVersion !== draftVersionRef.current) return false
      if (aiResult.withinTarget === false) {
        throw new Error(`当前车辆在目标 ${targetPi} PI 内没有可行方案，模型返回 ${aiResult.prediction?.totalPi ?? '未知'} PI，未应用该方案。`)
      }
      const resolvedShop = await api.vehicles.getUpgrades(formData.vehicleId, {
        selections: JSON.stringify(aiResult.parts || {}),
        driveType: preferredDriveType || aiDriveType
      })
      const initRecommendations = getInitialParameterRecommendations(resolvedShop, raceType || aiRaceType)
      setFormData(prev => ({
        ...prev,
        parts: resolvedShop.effectiveSelections || aiResult.parts || {},
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
    aiDriveType,
    setAiDriveType,
    handleAutoUpgrade
  }
}

function getInitialParameterRecommendations(resolvedShop, raceType = 'road') {
  const driveType = (resolvedShop.effectiveDriveType || resolvedShop.baseDriveType || 'awd').toLowerCase();
  
  const tires = {};
  const suspension = {};
  const drivetrain = {};
  const brakes = {};
  const aero = {};
  
  for (const param of resolvedShop.tuneParameters || []) {
    const id = param.id;
    const min = param.range ? Number(param.range.min) : 0;
    const max = param.range ? Number(param.range.max) : 100;
    const mid = (min + max) / 2;
    
    let val = mid;

    // 车辆级范围尚未核验时不能用占位范围生成“推荐值”。
    if (param.rangeConfidence === 'vehicle_specific_unknown') continue;
    
    if (id === 'tire_pressure_front' || id === 'tire_pressure_rear') {
      val = raceType === 'cross_country' ? 1.6 : (raceType === 'dirt' || raceType === 'rally' ? 1.8 : 2.0);
    }
    else if (id === 'tire_camber_front') val = -1.5;
    else if (id === 'tire_camber_rear') val = -1.0;
    else if (id === 'tire_toe_front' || id === 'tire_toe_rear') val = 0.0;
    else if (id === 'caster_front') val = 6.0;
    else if (id === 'arb_front') {
      val = driveType === 'awd' ? 15.0 : (driveType === 'fwd' ? 10.0 : 20.0);
    }
    else if (id === 'arb_rear') {
      val = driveType === 'awd' ? 40.0 : (driveType === 'fwd' ? 45.0 : 30.0);
    }
    else if (id === 'ride_height_front' || id === 'ride_height_rear') {
      val = raceType === 'cross_country' ? max : (raceType === 'dirt' || raceType === 'rally' ? min + (max - min) * 0.7 : min);
    }
    else if (id === 'rebound_front' || id === 'rebound_rear') val = 8.0;
    else if (id === 'bump_front' || id === 'bump_rear') val = 4.8;
    else if (id === 'diff_front_accel') val = 50.0;
    else if (id === 'diff_front_decel') val = 0.0;
    else if (id === 'diff_rear_accel') val = 90.0;
    else if (id === 'diff_rear_decel') val = 10.0;
    else if (id === 'diff_center') val = 70.0;
    else if (id === 'brake_balance') val = 50.0;
    else if (id === 'brake_pressure') val = 100.0;
    
    if (param.range) {
      val = Math.max(min, Math.min(max, val));
      const step = Number(param.range.step);
      if (step > 0) {
        const steps = Math.round((val - min) / step);
        val = Number((min + steps * step).toFixed(2));
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
