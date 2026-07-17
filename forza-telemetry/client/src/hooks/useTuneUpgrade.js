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
