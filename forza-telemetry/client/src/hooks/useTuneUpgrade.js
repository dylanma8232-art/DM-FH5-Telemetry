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

  // 一键升级：只从当前车辆档案允许的选项中挑选，并在预估 PI 下留出安全余量。
  const handleAutoUpgrade = async ({ preferredDriveType, raceType } = {}) => {
    if (!formData.vehicleId || !upgradeShop) {
      alert('请先选择一辆车辆。')
      return false
    }
    if (unknownPiSelectionCount > 0) {
      alert('当前已有缺少 PI 数据的配件。AI 无法保证等级上限，请先恢复这些配件为原厂后再生成。')
      return false
    }
    const unsafeExisting = (upgradeShop.slots || []).find(slot => {
      const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
      if (optionId === 'stock') return false
      return slot.options?.find(option => option.id === optionId)?.aiEligible !== true
    })
    if (unsafeExisting) {
      alert(`当前已选择的“${unsafeExisting.label}”仅供手动核对，AI 不会基于低置信配件继续生成。`)
      return false
    }
    const essentialByRace = {
      dirt: [['tires_compound', 'rally'], ['suspension', 'rally']],
      cross_country: [['tires_compound', 'offroad'], ['suspension', 'offroad']],
      drift: [['suspension', 'drift'], ['differential', 'drift']]
    }
    const missingEssential = (essentialByRace[raceType] || []).find(([slotId, optionId]) => {
      const option = upgradeShop.slots?.find(slot => slot.id === slotId)?.options?.find(item => item.id === optionId)
      return !option || option.aiEligible !== true || !Number.isFinite(Number(option.piUpperEstimate))
    })
    if (missingEssential) {
      alert('该车辆缺少此用途所需核心配件的高置信资料。AI 为避免给出错误方案不会强行生成，请使用手动改装并对照游戏。')
      return false
    }
    const draftVersion = draftVersionRef.current
    try {
      setAutoUpgradeLoading(true)
      const safetyMargin = Math.max(10, Math.ceil(targetPi * 0.02))
      const safeLimit = targetPi - safetyMargin
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
        const conservativePi = Number.isFinite(Number(option?.piUpperEstimate)) ? Number(option.piUpperEstimate) : Number(option?.piEstimate)
        return total + (Number(conservativePi) || 0)
      }, 0)

      const isRaceCompatible = (slotId, optionId) => {
        const specialized = {
          dirt: { tires_compound: ['rally'], suspension: ['rally'], differential: ['rally'] },
          cross_country: { tires_compound: ['offroad'], suspension: ['offroad'], differential: ['offroad'] },
          drift: { tires_compound: ['drift'], suspension: ['drift'], differential: ['drift'], transmission: ['drift_4'] }
        }
        const allowed = specialized[raceType]?.[slotId]
        return !allowed || allowed.includes(optionId)
      }

      currentPi = estimatePi(currentShop, nextParts)
      for (let step = 0; step < 60; step++) {
        const candidates = currentShop.slots.flatMap(slot => {
          const selectedId = nextParts[slot.id]?.optionId || 'stock'
          const selectedOption = slot.options?.find(option => option.id === selectedId)
          const selectedScore = Number(selectedOption?.performanceScore) || Number(selectedOption?.piEstimate) || 0
          return (slot.options || []).filter(option => {
            const optionScore = Number(option.performanceScore) || Number(option.piEstimate) || 0
            return option.id !== selectedId && option.aiEligible === true && isRaceCompatible(slot.id, option.id) && Number.isFinite(Number(option.piEstimate)) && optionScore > selectedScore
          }).map(option => ({ slot, option }))
        }).map(candidate => {
          const candidateParts = { ...nextParts, [candidate.slot.id]: { optionId: candidate.option.id } }
          const priorities = {
            road: ['tires_compound', 'tires_width_front', 'tires_width_rear', 'suspension', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear', 'weight_reduction'],
            dirt: ['tires_compound', 'suspension', 'differential', 'weight_reduction', 'brakes'],
            cross_country: ['tires_compound', 'suspension', 'differential', 'roll_cage', 'weight_reduction'],
            drift: ['suspension', 'differential', 'tires_width_rear', 'transmission', 'engine_camshaft']
          }
          const priority = priorities[raceType]?.indexOf(candidate.slot.id) ?? -1
          return { ...candidate, priority, parts: candidateParts, pi: estimatePi(currentShop, candidateParts) }
        }).filter(candidate => candidate.pi <= safeLimit)

        if (candidates.length === 0) break
        candidates.sort((a, b) => {
          if (a.priority >= 0 || b.priority >= 0) {
            if (a.priority < 0) return 1
            if (b.priority < 0) return -1
            if (a.priority !== b.priority) return a.priority - b.priority
          }
          return (Number(b.option.performanceScore) || Number(b.option.piEstimate)) - (Number(a.option.performanceScore) || Number(a.option.piEstimate))
        })
        const best = candidates[0]
        nextParts = best.parts
        currentPi = best.pi
        const encoded = encodeURIComponent(JSON.stringify(nextParts))
        const res = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades?selections=${encoded}&driveType=${encodeURIComponent(declaredDriveType)}`)
        if (!res.ok) break
        currentShop = await res.json()
        nextParts = currentShop.effectiveSelections || nextParts
        currentPi = estimatePi(currentShop, nextParts)
      }

      if (currentPi > safeLimit) {
        if (draftVersion !== draftVersionRef.current) return false
        alert('当前已选配件的预估 PI 已超过安全上限，请先降低已有改装。')
        return false
      } else {
        if (draftVersion !== draftVersionRef.current) return false
        setFormData(prev => ({
          ...prev,
          parts: nextParts
        }))
        setUpgradeShop(currentShop)
        if (currentPi < safeLimit - 20) {
          alert(`AI 已生成保守方案，PI 上界约为 ${currentPi}。由于其余配件缺少足够置信度，没有继续强行堆到目标等级。`)
        }
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
