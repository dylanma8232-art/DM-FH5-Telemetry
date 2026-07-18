import { useState, useMemo } from 'react'

const PI_CLASS_CAPS = [500, 600, 700, 800, 900, 998, 999]
const nextPiClassCap = basePi => PI_CLASS_CAPS.find(cap => cap > Number(basePi)) || 999

export function useTuneUpgrade({
  formData,
  setFormData,
  basePi,
  setBasePi,
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
      // 公式模型是非线性的：候选卡片的 PI 是相对“当前构型”的差值，不能再
      // 用旧的前端动态规划相加。统一交由服务端的整车预测器求解。
      const formulaResponse = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: formData.parts || {}, targetPi,
          raceType: raceType || aiRaceType,
          driveType: preferredDriveType || aiDriveType
        })
      })
      if (!formulaResponse.ok) throw new Error('公式改装方案生成失败')
      const formula = await formulaResponse.json()
      if (draftVersion !== draftVersionRef.current) return false
      const refreshed = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades?selections=${encodeURIComponent(JSON.stringify(formula.parts || {}))}&driveType=${encodeURIComponent(preferredDriveType || aiDriveType)}`)
      if (!refreshed.ok) throw new Error('无法读取公式改装结果')
      const resolvedShop = await refreshed.json()
      const initRecommendations = getInitialParameterRecommendations(resolvedShop, raceType || aiRaceType)
      setFormData(prev => ({
        ...prev,
        parts: resolvedShop.effectiveSelections || formula.parts || {},
        tires: prev.tires && Object.keys(prev.tires).length > 0 ? prev.tires : initRecommendations.tires,
        suspension: prev.suspension && Object.keys(prev.suspension).length > 0 ? prev.suspension : initRecommendations.suspension,
        drivetrain: prev.drivetrain && Object.keys(prev.drivetrain).length > 0 ? prev.drivetrain : initRecommendations.drivetrain,
        brakes: prev.brakes && Object.keys(prev.brakes).length > 0 ? prev.brakes : initRecommendations.brakes,
        aero: prev.aero && Object.keys(prev.aero).length > 0 ? prev.aero : initRecommendations.aero
      }))
      setUpgradeShop(resolvedShop)
      return true

      /* legacy static-PI solver retained below for source history; unreachable once
         formula solver is available. */
      const targetLimit = targetPi
      let nextParts = JSON.parse(JSON.stringify(formData.parts || {}))
      let currentShop = upgradeShop
      let currentPi = basePi

      const declaredDriveType = preferredDriveType || currentShop.baseDriveType
      const encodedInitialSelections = encodeURIComponent(JSON.stringify(nextParts))
      const initialResponse = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades?selections=${encodedInitialSelections}&driveType=${encodeURIComponent(declaredDriveType)}`)
      if (!initialResponse.ok) throw new Error('无法应用用户选择的驱动形式')
      currentShop = await initialResponse.json()
      nextParts = currentShop.effectiveSelections || nextParts

      const estimatePi = (shop, parts) => basePi + (shop.slots || []).reduce((total, slot) => {
        const optionId = parts[slot.id]?.optionId || 'stock'
        const option = slot.options?.find(item => item.id === optionId)
        return total + (Number(option?.piEstimate) || 0)
      }, 0)

      const isRaceCompatible = (slotId, optionId) => {
        const specialized = {
          dirt: { tires_compound: ['rally'], suspension: ['rally'], differential: ['rally'] },
          rally: { tires_compound: ['rally'], suspension: ['rally'], differential: ['rally'] },
          cross_country: { tires_compound: ['offroad'], suspension: ['offroad'], differential: ['offroad'] },
          drift: { tires_compound: ['drift'], suspension: ['drift'], differential: ['drift'], transmission: ['drift_4'] }
        }
        const allowed = specialized[raceType]?.[slotId]
        return !allowed || allowed.includes(optionId)
      }

      const priorities = {
        road: ['tires_compound', 'tires_width_front', 'tires_width_rear', 'suspension', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear', 'weight_reduction'],
        dirt: ['tires_compound', 'suspension', 'differential', 'weight_reduction', 'brakes'],
        rally: ['tires_compound', 'suspension', 'differential', 'weight_reduction', 'brakes'],
        cross_country: ['tires_compound', 'suspension', 'differential', 'roll_cage', 'weight_reduction'],
        drift: ['suspension', 'differential', 'tires_width_rear', 'transmission', 'engine_camshaft']
      }
      // 这些改装在通用目录中可能是 0 PI，但仍有明确的驾驶收益。只有已在
      // AI 白名单中的项目才参与同 PI 的取舍；未核验的空气动力学等不盲选。
      const zeroPiBenefits = {
        road: { clutch: 12, engine_flywheel: 8, engine_oil_cooling: 2 },
        dirt: { clutch: 8, engine_flywheel: 4, engine_oil_cooling: 4 },
        rally: { clutch: 8, engine_flywheel: 4, engine_oil_cooling: 4 },
        cross_country: { clutch: 8, engine_oil_cooling: 5 },
        drift: { clutch: 6, engine_flywheel: 10 }
      }
      const selectClosestBuild = shop => {
        // 动态规划按 PI 总和保留最佳方案；相比逐件贪心，可用小件补足 1～数 PI 的缺口。
        let states = new Map([[basePi, { parts: {}, score: 0 }]])
        for (const slot of shop.slots || []) {
          const priority = priorities[raceType]?.indexOf(slot.id) ?? -1
          const options = (slot.options || []).filter(option => {
            if (!isRaceCompatible(slot.id, option.id)) return false
            return option.id === 'stock' || (option.aiEligible === true && Number.isFinite(Number(option.piEstimate)))
          })
          if (!options.length) continue
          const nextStates = new Map()
          for (const [pi, state] of states) {
            for (const option of options) {
              const nextPi = pi + (Number(option.piEstimate) || 0)
              if (nextPi > targetLimit || nextPi < 0) continue
              const optionScore = Number(option.performanceScore) || Number(option.piEstimate) || 0
              const zeroPiBonus = option.id !== 'stock' && Number(option.piEstimate) === 0 && option.aiEligible === true
                ? (zeroPiBenefits[raceType]?.[slot.id] || 0)
                : 0
              const score = state.score + optionScore + zeroPiBonus + (option.id !== 'stock' && priority >= 0 ? (priorities[raceType].length - priority) * 1000 : 0)
              const existing = nextStates.get(nextPi)
              if (!existing || score > existing.score) {
                nextStates.set(nextPi, { score, parts: { ...state.parts, [slot.id]: { optionId: option.id } } })
              }
            }
          }
          states = nextStates
        }
        // 目标低于该场景的最低可用组合时，保留已知可行方案，让后续服务端
        // 返回明确原因，而不是生成无效的负无穷 PI。
        if (!states.size) return { parts: {}, pi: basePi }
        const bestPi = Math.max(...states.keys())
        return { parts: states.get(bestPi)?.parts || {}, pi: bestPi }
      }

      // 选择会解锁或取消某些联动改装，最多重新解析三次，直到方案稳定。
      for (let pass = 0; pass < 3; pass++) {
        const result = selectClosestBuild(currentShop)
        nextParts = result.parts
        currentPi = result.pi
        const encoded = encodeURIComponent(JSON.stringify(nextParts))
        const res = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades?selections=${encoded}&driveType=${encodeURIComponent(declaredDriveType)}`)
        if (!res.ok) break
        currentShop = await res.json()
        nextParts = currentShop.effectiveSelections || nextParts
        const resolvedPi = estimatePi(currentShop, nextParts)
        if (resolvedPi === currentPi) break
        currentPi = resolvedPi
      }

      if (currentPi > targetLimit) {
        if (draftVersion !== draftVersionRef.current) return false
        alert('当前已选配件的预估 PI 已超过目标上限，请先降低已有改装。')
        return false
      } else {
        if (draftVersion !== draftVersionRef.current) return false
        setFormData(prev => ({
          ...prev,
          parts: nextParts
        }))
        setUpgradeShop(currentShop)
        return true
      }
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

export function getInitialParameterRecommendations(resolvedShop, raceType = 'road') {
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
