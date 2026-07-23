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
      if (draftVersionRef.current !== draftVersionRef.current) return false
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
  const pi = Number(resolvedShop.targetPi || resolvedShop.basePi || 700);

  // 获取用户在 Step 1 指定的档位数 (默认为 6 档)
  const gearCount = Number(resolvedShop.capabilities?.gearCount || resolvedShop.drivetrain?.gearCount || 6);

  // 检查是否为中置 MR 或后置 RR 引擎 / 后配重车型 (前轴配重 < 48%)
  const isRearOrMidEngine = weightRatio < 0.48 || (specs.enginePos && (specs.enginePos === 'MR' || specs.enginePos === 'RR'));

  const hasWidebody = (resolvedShop.effectiveSelections?.widebody?.optionId === 'listed_widebody') ||
                      (resolvedShop.parts?.widebody?.optionId === 'listed_widebody');

  const hasTurboOrSupercharger = resolvedShop.parts?.aspiration_swap?.optionId &&
                                resolvedShop.parts.aspiration_swap.optionId !== 'stock' &&
                                resolvedShop.parts.aspiration_swap.optionId !== 'none';

  // 1. 轮胎冷气压推导
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

  // 2. PI 级别悬挂与刚度调整系数
  const piScaleFactor = 0.85 + 0.30 * Math.max(0, Math.min(1, (pi - 500) / 498));

  // 3. 弹簧与阻尼物理基础推导（底盘极低时触发支撑保护，防底盘擦地失抓）
  const rideHeightFactor = raceType === 'road' ? 1.08 : 1.0;
  const baseSpringFront = (massKg * weightRatio * 0.165 * piScaleFactor * rideHeightFactor) * (raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0));
  const baseSpringRear = (massKg * (1 - weightRatio) * 0.165 * piScaleFactor * rideHeightFactor) * (raceType === 'cross_country' ? 0.60 : (raceType === 'dirt' || raceType === 'rally' ? 0.75 : 1.0));
  const baseReboundFront = Math.max(3.0, Math.min(20.0, baseSpringFront * 0.08 + 2.5));
  const baseReboundRear = Math.max(3.0, Math.min(20.0, baseSpringRear * 0.08 + 2.5));

  // 4. 驱动形式刹车解耦（AWD 48%帮助重刹弯心切入，RWD 52%防止甩尾）
  const brakeBalanceValue = driveType === 'awd' ? 48.0 : (driveType === 'rwd' ? 52.0 : 50.0);

  // 5. 终传比基于 PI 目标与极速需求缩放
  const finalDriveValue = pi >= 900 ? 3.35 : (pi >= 800 ? 3.65 : (pi >= 700 ? 3.85 : 4.20));

  // 6. 动态按用户指定的 N 档分配递减齿轮比曲线 (确保几档车的最高档都能拉到极速)
  const dynamicGears = {};
  const gCount = Math.max(4, Math.min(10, gearCount));
  const startRatio = 3.50;
  const endRatio = gCount >= 8 ? 0.65 : (gCount >= 6 ? 0.78 : 0.88);
  for (let g = 1; g <= 10; g++) {
    if (g <= gCount) {
      const progress = (g - 1) / Math.max(1, gCount - 1);
      // 几何等比平滑曲线插值
      const ratio = startRatio * Math.pow(endRatio / startRatio, progress);
      dynamicGears[`gear_${g}`] = Number(ratio.toFixed(2));
    } else {
      dynamicGears[`gear_${g}`] = 0.55;
    }
  }

  // 7. 差速器保护与中置/后置引擎布局解耦
  // 针对增压/大马力后驱下调 5% 加速锁止，防止突发爆扭甩尾
  const rwdAccelLock = raceType === 'drift' ? 85.0 : (hasTurboOrSupercharger ? 45.0 : 52.0);
  // 中置/后置引擎在松油门时容易发生 Coast 甩尾，因此后减速锁止从 15% 上调至 22% 维持入弯稳定
  const rearDecelLock = raceType === 'drift' ? 80.0 : (isRearOrMidEngine ? 24.0 : 15.0);
  // 中央差速偏置根据赛事类型解耦：漂移 85% 偏后，泥地/越野 60% 增强四轮拉力，公路 70%
  const diffCenterValue = raceType === 'drift' ? 85.0 : (raceType === 'dirt' || raceType === 'cross_country' ? 60.0 : 70.0);

  // 8. 引擎位置对防倾杆刚度微调 (中置/后置稍微收紧后防倾杆，防 Snap Oversteer)
  const rearArbMod = isRearOrMidEngine ? 0.90 : 1.0;

  const baseValues = {
    tire_pressure_front: basePressureFront,
    tire_pressure_rear: basePressureRear,
    tire_camber_front: raceType === 'drift' ? -2.5 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -1.2 : -1.8),
    tire_camber_rear: raceType === 'drift' ? -0.8 : (raceType === 'dirt' || raceType === 'rally' || raceType === 'cross_country' ? -0.6 : -1.2),
    tire_toe_front: raceType === 'drift' ? 0.2 : 0.0,
    tire_toe_rear: raceType === 'drift' ? -0.1 : 0.0,
    caster_front: raceType === 'drift' ? 6.5 : 6.0,

    arb_front: (driveType === 'awd' ? (raceType === 'drift' ? 35.0 : (raceType === 'dirt' ? 15.0 : 18.0)) : (driveType === 'fwd' ? 12.0 : 30.0)) * (hasWidebody ? 1.05 : 1.0),
    arb_rear: (driveType === 'awd' ? (raceType === 'drift' ? 55.0 : (raceType === 'dirt' ? 35.0 : 48.0)) : (driveType === 'fwd' ? 55.0 : 22.0)) * (hasWidebody ? 1.05 : 1.0) * rearArbMod,

    spring_front: baseSpringFront,
    spring_rear: baseSpringRear,
    rebound_front: baseReboundFront,
    rebound_rear: baseReboundRear,
    bump_front: baseReboundFront * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55),
    bump_rear: baseReboundRear * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55),
    ride_height_front: raceType === 'cross_country' ? 25.0 : (raceType === 'dirt' || raceType === 'rally' ? 18.0 : 12.0),
    ride_height_rear: raceType === 'cross_country' ? 25.0 : (raceType === 'dirt' || raceType === 'rally' ? 18.0 : 12.0),

    final_drive: finalDriveValue,
    ...dynamicGears,

    diff_front_accel: 40.0,
    diff_front_decel: 0.0,
    diff_rear_accel: driveType === 'awd' ? 85.0 : rwdAccelLock,
    diff_rear_decel: rearDecelLock,
    diff_center: diffCenterValue,
    diff_accel: driveType === 'awd' ? 85.0 : rwdAccelLock,
    diff_decel: rearDecelLock,

    brake_balance: brakeBalanceValue,
    brake_pressure: 100.0,

    downforce_front: segmentType === 'high_speed' ? 45.0 : 75.0,
    downforce_rear: segmentType === 'high_speed' ? 70.0 : 120.0
  };

  // 若 resolvedShop 中包含参数的限制范围，对基准值进行物理区间插值
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
        // 对于弹簧与阻尼，优先基于车辆实际配重比例在 [min, max] 区间进行插值
        if (id === 'spring_front' || id === 'rebound_front') {
          val = (max - min) * weightRatio + min;
          if (id === 'spring_front' && (raceType === 'cross_country' || raceType === 'dirt')) val *= (raceType === 'cross_country' ? 0.6 : 0.75);
        } else if (id === 'spring_rear' || id === 'rebound_rear') {
          val = (max - min) * (1 - weightRatio) + min;
          if (id === 'spring_rear' && (raceType === 'cross_country' || raceType === 'dirt')) val *= (raceType === 'cross_country' ? 0.6 : 0.75);
        } else if (id === 'bump_front') {
          const rf = paramMap['rebound_front']?.range ? ((Number(paramMap['rebound_front'].range.max) - Number(paramMap['rebound_front'].range.min)) * weightRatio + Number(paramMap['rebound_front'].range.min)) : val / 0.55;
          val = rf * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55);
        } else if (id === 'bump_rear') {
          const rr = paramMap['rebound_rear']?.range ? ((Number(paramMap['rebound_rear'].range.max) - Number(paramMap['rebound_rear'].range.min)) * (1 - weightRatio) + Number(paramMap['rebound_rear'].range.min)) : val / 0.55;
          val = rr * (raceType === 'dirt' || raceType === 'cross_country' ? 0.65 : 0.55);
        } else if (id === 'downforce_front') {
          val = segmentType === 'high_speed' ? min : min + (max - min) * 0.45;
        } else if (id === 'downforce_rear') {
          val = segmentType === 'high_speed' ? min : min + (max - min) * 0.60;
        } else {
          val = Math.max(min, Math.min(max, val));
        }

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
