import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  PART_CATEGORIES,
  TIER_LABELS,
  getDefaultParts,
  getTuneConstraints,
  getTuneDefaults
} from '../data/parts'
import { api } from '../services/api'
import { useTuneStore } from '../stores/useTuneStore'
import { getInitialParameterRecommendations, useTuneUpgrade } from './useTuneUpgrade'
import { useTuneDiagnosis } from './useTuneDiagnosis'
import {
  FIX_PARAM_MAP,
  convertFixesToSuggestedChanges,
  createDefaultFormData,
  defaultFormData,
  isPiClassCap,
  nextPiClassCap
} from '../utils/tuneForm'

// 保持既有模块导出，避免外部调用方在重构期间失效。
export { FIX_PARAM_MAP } from '../utils/tuneForm'

export function useTuneManager({ onNavigate, navIntent }) {
  const {
    tunes,
    vehicles,
    tracks,
    tuneSessionStats,
    loadTunes,
    loadVehicles,
    loadTracks,
    loadTuneSessionStats
  } = useTuneStore()

  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTune, setEditingTune] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const setTunes = () => {}
  const setVehicles = () => {}
  const setTracks = () => {}
  const setTuneSessionStats = () => {}

  const [vehicleFilter, setVehicleFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [formData, setFormData] = useState(createDefaultFormData)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelected, setCompareSelected] = useState([])
  const [compareResult, setCompareResult] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareTrackId, setCompareTrackId] = useState('')
  const [shareCodeModal, setShareCodeModal] = useState(null)
  // Round 4: 导入预览状态
  const [importPreview, setImportPreview] = useState(null)
  const importFileRef = useRef(null)
  const upgradeRequestRef = useRef(0)
  const draftVersionRef = useRef(0)
  // 编辑已有调校时，先存配件选项，等 vehicleId effect 触发后再用，避免异步覆盖问题
  const pendingPartsRef = useRef(null)

  // Round 2: 记录用户手动修改过的参数（嵌套路径如 "tires.frontPressure"）
  const dirtyParamsRef = useRef(new Set())

  // Round 9: 参数分组折叠状态
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // PI锁定与自动升级相关
  const [targetPi, setTargetPi] = useState(800)
  const [basePi, setBasePi] = useState(500)
  // 留空时跟随配件预估；用户输入后作为这套已保存方案的实际 PI。
  const [solutionPi, setSolutionPi] = useState(null)
  const [upgradeShop, setUpgradeShop] = useState(null)
  const [wizardStep, setWizardStep] = useState(1)
  const [buildMode, setBuildMode] = useState(null)
  // Ref to always read the latest buildMode in async/effect contexts
  const buildModeRef = useRef(null)
  const _setBuildMode = (mode) => {
    buildModeRef.current = mode
    setBuildMode(mode)
  }

  const currentVehicleStats = useMemo(() => {
    if (!formData.vehicleId || !vehicles[formData.vehicleId]) return null
    const v = vehicles[formData.vehicleId]
    return v.stats || v.carStats || { drivetrain: v.drivetrain }
  }, [formData.vehicleId, vehicles])

  const partsPiDelta = useMemo(() => {
    if (upgradeShop?.prediction && Number.isFinite(Number(upgradeShop.prediction.deltaFromStock))) {
      return Number(upgradeShop.prediction.deltaFromStock)
    }
    // 车辆档案中的 piEstimate 是“从该车原厂状态开始”的估算增量。
    // 它优先于旧的全局等级表，避免不同车辆共用同一套假定增量。
    if (upgradeShop?.slots?.length) {
      return upgradeShop.slots.reduce((total, slot) => {
        const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
        const option = slot.options?.find(item => item.id === optionId)
        return total + (Number.isFinite(Number(option?.piEstimate)) ? Number(option.piEstimate) : 0)
      }, 0)
    }
    return 0;
  }, [formData.parts, basePi, upgradeShop, currentVehicleStats])

  const totalPi = useMemo(() => {
    if (upgradeShop?.prediction && Number.isFinite(Number(upgradeShop.prediction.totalPi))) {
      return Number(upgradeShop.prediction.totalPi)
    }
    return basePi + partsPiDelta
  }, [basePi, partsPiDelta, upgradeShop])

  const totalPiUpper = useMemo(() => {
    if (upgradeShop?.prediction && Number.isFinite(Number(upgradeShop.prediction.maxPi))) {
      return Number(upgradeShop.prediction.maxPi)
    }
    if (!upgradeShop?.slots?.length) return totalPi
    return basePi + upgradeShop.slots.reduce((total, slot) => {
      const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
      const option = slot.options?.find(item => item.id === optionId)
      const value = Number.isFinite(Number(option?.piUpperEstimate)) ? Number(option.piUpperEstimate) : Number(option?.piEstimate)
      return total + (Number(value) || 0)
    }, 0)
  }, [basePi, formData.parts, totalPi, upgradeShop])

  const unknownPiSelectionCount = useMemo(() => {
    if (upgradeShop?.prediction) return 0
    if (!upgradeShop?.slots?.length) return 0
    return upgradeShop.slots.reduce((count, slot) => {
      const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
      if (optionId === 'stock') return count
      const option = slot.options?.find(item => item.id === optionId)
      return count + (Number.isFinite(Number(option?.piEstimate)) ? 0 : 1)
    }, 0)
  }, [formData.parts, upgradeShop])
  // 引用改装子 Hook
  const {
    autoUpgradeLoading,
    aiRaceType,
    setAiRaceType,
    segmentType,
    setSegmentType,
    aiDriveType,
    setAiDriveType,
    handleAutoUpgrade
  } = useTuneUpgrade({
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
  })

  // 引用诊断子 Hook
  const {
    drivingProblemsOpen,
    setDrivingProblemsOpen,
    selectedProblem,
    setSelectedProblem,
    telemetryPanelOpen,
    setTelemetryPanelOpen,
    availableSessions,
    setAvailableSessions,
    selectedSessionId,
    setSelectedSessionId,
    diagnosing,
    setDiagnosing,
    diagnosisResult,
    setDiagnosisResult,
    telemetrySuggestions,
    setTelemetrySuggestions,
    applyProblemFix,
    loadTelemetrySessions,
    runTelemetryDiagnosis,
    applyDiagnosisFix,
    aiDiagnosis, aiDiagnosing, runAiProblemDiagnosis, runAiTelemetryDiagnosis
  } = useTuneDiagnosis({
    formData,
    setFormData,
    editingTune
  })



  useEffect(() => {
    loadTunes()
    loadVehicles()
    loadTracks()
    loadTuneSessionStats()
  }, [])

  const refreshUpgradeShop = async (vehicleId, parts = {}, driveType = null, tuningCapabilities = null) => {
    const requestId = ++upgradeRequestRef.current
    if (!vehicleId) {
      setUpgradeShop(null)
      return
    }
    try {
      const resolved = await api.vehicles.getUpgrades(vehicleId, {
        selections: JSON.stringify(parts),
        ...(driveType ? { driveType } : {}),
        ...(tuningCapabilities ? { capabilities: JSON.stringify(tuningCapabilities) } : {})
      })
      if (requestId !== upgradeRequestRef.current) return
      setUpgradeShop(resolved)
      if (resolved.effectiveSelections) {
        setFormData(prev => ({ ...prev, parts: resolved.effectiveSelections }))
        if (resolved.invalidated?.length) {
          setUnlockToast(`已清除 ${resolved.invalidated.length} 个不再兼容的下游改装`)
          setTimeout(() => setUnlockToast(null), 4000)
        }
      }

      // 改装配件或能力变更后，自动实时更新参数推荐
      if (resolved?.tuneParameters?.length) {
        const mergedShop = {
          ...resolved,
          targetPi: targetPi || basePi || resolved.targetPi || resolved.basePi,
          parts: resolved.effectiveSelections || parts,
          capabilities: tuningCapabilities || resolved.capabilities,
          effectiveDriveType: driveType || resolved.effectiveDriveType || resolved.baseDriveType
        }
        const recommended = getInitialParameterRecommendations(mergedShop, aiRaceType, segmentType)
        if (recommended) {
          setFormData(prev => ({
            ...prev,
            tires: { ...prev.tires, ...recommended.tires },
            suspension: { ...prev.suspension, ...recommended.suspension },
            drivetrain: { ...prev.drivetrain, ...recommended.drivetrain },
            brakes: { ...prev.brakes, ...recommended.brakes },
            aero: { ...prev.aero, ...recommended.aero }
          }))
        }
      }
    } catch (_) {
      if (requestId !== upgradeRequestRef.current) return
      setUpgradeShop({ status: 'unverified', message: '无法读取该车辆的改装资料。', slots: [], tuneParameters: [] })
    }
  }

  useEffect(() => {
    // 如果是编辑模式加载，使用已保存的配件；否则用当前 formData.parts（可能是空的）
    const partsToLoad = pendingPartsRef.current !== null ? pendingPartsRef.current : formData.parts
    pendingPartsRef.current = null
    const isCapabilityMode = _buildMode === 'capability'
    refreshUpgradeShop(formData.vehicleId, partsToLoad, null, isCapabilityMode ? formData.tuningCapabilities : null)
  }, [formData.vehicleId])

  useEffect(() => {
    if (upgradeShop?.baseDriveType && (!formData.parts?.drivetrain_swap?.optionId || formData.parts?.drivetrain_swap?.optionId === 'stock')) {
      setAiDriveType(upgradeShop.baseDriveType)
    }
  }, [upgradeShop?.baseDriveType, formData.parts?.drivetrain_swap?.optionId])

  useEffect(() => {
    const officialBasePi = Number(upgradeShop?.basePi)
    if (!Number.isFinite(officialBasePi)) return
    setBasePi(officialBasePi)
    if (!editingTune) setTargetPi(nextPiClassCap(officialBasePi))
  }, [upgradeShop?.basePi, formData.vehicleId, editingTune])

  useEffect(() => {
    if (navIntent) {
      if (navIntent.vehicleId) {
        setVehicleFilter(String(navIntent.vehicleId))
      }
      
      // 提取遥测诊断建议
      if (navIntent.suggestedChanges) {
        setTelemetrySuggestions({
          changes: navIntent.suggestedChanges,
          problemName: navIntent.problemName || '遥测诊断建议',
          trackName: navIntent.trackName || '未知赛道'
        })
      }

      if (navIntent.action === 'create' && navIntent.vehicleId) {
        setFormData({ ...createDefaultFormData(), vehicleId: String(navIntent.vehicleId) })
        setBasePi(500)
        setTargetPi(800)
        setSolutionPi(null)
        setEditingTune(null)
        setShowModal(true)
        setDrivingProblemsOpen(false)
        setSelectedProblem(null)
        setTelemetryPanelOpen(false)
        setDiagnosisResult(null)
        setSelectedSessionId('')
        dirtyParamsRef.current.clear()
      } else if (navIntent.action === 'edit') {
        if (navIntent.tuneId) {
          const found = tunes.find(t => String(t.id) === String(navIntent.tuneId))
          if (found) {
            startEdit(found)
          } else if (navIntent.vehicleId) {
            // 没有对应的tuneId，降级为为该车创建调校
            setFormData({ ...createDefaultFormData(), vehicleId: String(navIntent.vehicleId) })
            setBasePi(500)
            setTargetPi(800)
            setSolutionPi(null)
            setEditingTune(null)
            setShowModal(true)
            setDrivingProblemsOpen(false)
            setSelectedProblem(null)
            setTelemetryPanelOpen(false)
            setDiagnosisResult(null)
            setSelectedSessionId('')
            dirtyParamsRef.current.clear()
          }
        } else if (navIntent.vehicleId) {
          // 没有 tuneId，降级为创建
          setFormData({ ...createDefaultFormData(), vehicleId: String(navIntent.vehicleId) })
          setBasePi(500)
          setTargetPi(800)
          setSolutionPi(null)
          setEditingTune(null)
          setShowModal(true)
          setDrivingProblemsOpen(false)
          setSelectedProblem(null)
          setTelemetryPanelOpen(false)
          setDiagnosisResult(null)
          setSelectedSessionId('')
          dirtyParamsRef.current.clear()
        }
      }
      if (navIntent.openTelemetry) {
        setTelemetryPanelOpen(true)
        setSelectedSessionId(navIntent.sessionId ? String(navIntent.sessionId) : '')
        loadTelemetrySessions()
      }
    }
  }, [navIntent, vehicles, tunes])

  // 根据配件计算PI增量
  

  // getTuneDefaults 返回扁平 key（如 tire_pressure_front），需映射为嵌套 formData 格式
  const TUNE_DEFAULT_KEY_MAP = {
    tire_pressure_front: ['tires', 'frontPressure'],
    tire_pressure_rear: ['tires', 'rearPressure'],
    tire_camber_front: ['tires', 'frontCamber'],
    tire_camber_rear: ['tires', 'rearCamber'],
    tire_toe_front: ['tires', 'frontToe'],
    tire_toe_rear: ['tires', 'rearToe'],
    caster_front: ['tires', 'frontCaster'],
    spring_front: ['suspension', 'frontSpring'],
    spring_rear: ['suspension', 'rearSpring'],
    damping_front: ['suspension', 'frontDamping'],
    damping_rear: ['suspension', 'rearDamping'],
    rebound_front: ['suspension', 'frontRebound'],
    rebound_rear: ['suspension', 'rearRebound'],
    bump_front: ['suspension', 'frontBump'],
    bump_rear: ['suspension', 'rearBump'],
    arb_front: ['suspension', 'frontARB'],
    arb_rear: ['suspension', 'rearARB'],
    ride_height_front: ['suspension', 'frontRideHeight'],
    ride_height_rear: ['suspension', 'rearRideHeight'],
    diff_accel: ['drivetrain', 'diffAccel'],
    diff_decel: ['drivetrain', 'diffDecel'],
    diff_center: ['drivetrain', 'diffCenter'],
    diff_front_accel: ['drivetrain', 'frontDiffAccel'],
    diff_front_decel: ['drivetrain', 'frontDiffDecel'],
    diff_rear_accel: ['drivetrain', 'rearDiffAccel'],
    diff_rear_decel: ['drivetrain', 'rearDiffDecel'],
    final_drive: ['drivetrain', 'finalDrive'],
    gear_1: ['drivetrain', 'gear1'],
    gear_2: ['drivetrain', 'gear2'],
    gear_3: ['drivetrain', 'gear3'],
    gear_4: ['drivetrain', 'gear4'],
    gear_5: ['drivetrain', 'gear5'],
    gear_6: ['drivetrain', 'gear6'],
    gear_7: ['drivetrain', 'gear7'], gear_8: ['drivetrain', 'gear8'], gear_9: ['drivetrain', 'gear9'], gear_10: ['drivetrain', 'gear10'],
    brake_balance: ['brakes', 'balance'], brake_pressure: ['brakes', 'pressure'],
    downforce_front: ['aero', 'frontDownforce'],
    downforce_rear: ['aero', 'rearDownforce'],
  };

  // 配件变更时自动更新推荐调校默认值（Round 2: 跳过用户手动修改过的参数）
  // 仅 AI 改装模式下生效；自主改装模式严禁自动填参。
  useEffect(() => {
    // 使用 ref 读取最新 buildMode，避免异步 state 闭包竞争导致在手动模式下误触发
    if (!formData.parts || buildModeRef.current !== 'ai') return
    try {
      // 旧的 getTuneDefaults 使用 PSI 作为胎压单位，而调校管理和服务端都
      // 以 bar 保存。AI 不能再复用它，否则会把 30 之类的 PSI 数值写入 bar
      // 字段并在保存时被拒绝。
      const defaults = {}
      const allowedTuneIds = new Set((upgradeShop?.tuneParameters || []).map(parameter => parameter.id))
      for (const key of Object.keys(defaults)) {
        if (!allowedTuneIds.has(key)) delete defaults[key]
      }
      // Allow defaults to be populated for vehicle_specific_unknown parameters in AI mode
      // for (const parameter of upgradeShop?.tuneParameters || []) {
      //   if (parameter.rangeConfidence === 'vehicle_specific_unknown') delete defaults[parameter.id]
      // }
      const recommended = {
        tire_pressure_front: 1.9, tire_pressure_rear: 1.9,
        tire_camber_front: aiRaceType === 'drift' ? -4 : -2,
        tire_camber_rear: aiRaceType === 'drift' ? -1.5 : -1.2,
        tire_toe_front: 0, tire_toe_rear: 0, caster_front: aiRaceType === 'drift' ? 7 : 5.5,
        rebound_front: 10, rebound_rear: 10, bump_front: 6, bump_rear: 6,
        arb_front: aiRaceType === 'drift' ? 35 : 25, arb_rear: aiRaceType === 'drift' ? 45 : 20,
        diff_front_accel: 30, diff_front_decel: 10,
        diff_rear_accel: aiRaceType === 'drift' ? 100 : 60, diff_rear_decel: aiRaceType === 'drift' ? 100 : 20,
        diff_center: aiRaceType === 'drift' ? 80 : 65,
        final_drive: 3.7,
        brake_balance: 50, brake_pressure: 100
      }
      ;(upgradeShop?.tuneParameters || []).forEach(parameter => {
        if (defaults[parameter.id] != null) return
        // Allow fallback midpoint values for unknown ranges in AI mode
        // if (parameter.rangeConfidence === 'vehicle_specific_unknown') return
        const range = parameter.range || {}
        let value = recommended[parameter.id]
        const gear = parameter.id.match(/^gear_(\d+)$/)?.[1]
        if (gear) value = Math.max(0.65, Number((4.2 / Math.pow(Number(gear), 0.72)).toFixed(2)))
        if (parameter.rangeConfidence === 'vehicle_specific_unknown') return
        if (parameter.id.startsWith('spring_')) value = Number(((range.min + range.max) * 0.4).toFixed(1))
        if (parameter.id.startsWith('ride_height_')) value = Number((range.min + (range.max - range.min) * (aiRaceType === 'cross_country' ? 0.75 : 0.2)).toFixed(1))
        if (parameter.id.startsWith('downforce_')) value = Number((range.min + (range.max - range.min) * 0.55).toFixed(0))
        if (segmentType === 'rough' && (parameter.id.startsWith('rebound_') || parameter.id.startsWith('bump_'))) value = Number((value * 0.85).toFixed(2))
        if ((segmentType === 'technical' || segmentType === 'tarmac_bias') && parameter.id.startsWith('arb_')) value = Number((value * 1.1).toFixed(2))
        if (value != null) defaults[parameter.id] = Math.min(range.max, Math.max(range.min, value))
      })
      if (Object.keys(defaults).length) {
        // 将扁平 key 映射为嵌套结构后 merge 到 formData
        const mapped = { tires: {}, suspension: {}, drivetrain: {}, brakes: {}, aero: {} };
        for (const [flatKey, value] of Object.entries(defaults)) {
          if (value == null) continue;
          const path = TUNE_DEFAULT_KEY_MAP[flatKey];
          if (path) {
            const nestedKey = `${path[0]}.${path[1]}`
            // 跳过用户手动修改过的参数
            if (dirtyParamsRef.current.has(nestedKey)) continue
            mapped[path[0]][path[1]] = value;
          }
        }
        setFormData(prev => ({
          ...prev,
          tires: { ...prev.tires, ...mapped.tires },
          suspension: { ...prev.suspension, ...mapped.suspension },
          drivetrain: { ...prev.drivetrain, ...mapped.drivetrain },
          brakes: { ...prev.brakes, ...mapped.brakes },
          aero: { ...prev.aero, ...mapped.aero }
        }))
      }
    } catch (e) {
      // getTuneDefaults 可能尚未就绪或参数不匹配，静默忽略
    }
  }, [formData.parts, currentVehicleStats, buildMode, upgradeShop, aiRaceType, segmentType])





  const saveTune = async () => {
    if (!formData.name.trim()) {
      alert('请输入调校名称')
      return
    }

    if (!formData.vehicleId || upgradeShop?.status === 'unverified') {
      alert('请先选择一辆已录入游戏内改装资料的车辆。')
      return
    }

    if (buildMode === 'capability' && solutionPi === null) {
      alert('自动调教需要当前车辆在游戏内显示的实际 PI。')
      return
    }

    try {
      await api.vehicles.validateUpgrades(formData.vehicleId, { parts: formData.parts });
    } catch (e) {
      alert(e.message || '所选改装件不适用于当前车辆。');
      return;
    }

    const confirmedPi = Number(solutionPi === null ? totalPi : solutionPi)
    if (!Number.isInteger(confirmedPi) || confirmedPi < 100 || confirmedPi > 999) {
      alert('方案 PI 必须是 100 到 999 之间的整数。')
      return
    }

    const normalizeGroup = (category, values) => Object.fromEntries(Object.entries(values || {}).map(([field, raw]) => {
      const constraint = tuneConstraints[`${category}.${field}`]
      if (raw === '' || raw === null || raw === undefined || !constraint || constraint.locked || !Number.isFinite(Number(raw))) return [field, raw]
      let value = Number(raw)
      if (category === 'tires' && (field === 'frontPressure' || field === 'rearPressure') && value > constraint.max * 2) {
        value *= 0.0689476
      }
      const step = Number(constraint.step)
      if (step > 0) value = constraint.min + Math.round((value - constraint.min) / step) * step
      value = Math.min(constraint.max, Math.max(constraint.min, value))
      return [field, Number(value.toFixed(6))]
    }))
    const normalizedTune = {
      tires: normalizeGroup('tires', formData.tires),
      suspension: normalizeGroup('suspension', formData.suspension),
      drivetrain: normalizeGroup('drivetrain', formData.drivetrain),
      brakes: normalizeGroup('brakes', formData.brakes),
      aero: normalizeGroup('aero', formData.aero)
    }
    setFormData(prev => ({ ...prev, ...normalizedTune }))

    const payload = {
      name: formData.name.trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      vehicleId: formData.vehicleId || null,
      basePi,
      targetPi: buildMode === 'ai' ? targetPi : null,
      totalPi: confirmedPi,
      piConfirmed: solutionPi !== null,
      generationMode: buildMode === 'capability' ? 'assisted' : (buildMode === 'ai' ? 'ai' : 'manual'),
      raceType: buildMode === 'ai' ? aiRaceType : null,
      segmentType: buildMode === 'ai' ? segmentType : null,
      driveType: buildMode === 'ai' ? aiDriveType : (upgradeShop?.effectiveDriveType || upgradeShop?.baseDriveType || null),
      ...normalizedTune,
      parts: { ...formData.parts },
      tuningCapabilities: formData.tuningCapabilities,
      freeMode: !!formData.freeMode,
      notes: formData.notes || ''
    }

    setLoading(true)
    try {
      if (editingTune) {
        await api.tunes.update(editingTune, payload);
      } else {
        await api.tunes.create(payload);
      }
      await loadTunes()
      closeModal()
    } catch (e) { /* 保存调校失败 */
      alert(`保存失败：${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteTune = async (id) => {
    if (!confirm('确定删除此调校方案？此操作不可恢复。')) return
    try {
      await api.tunes.delete(id);
      await loadTunes()
    } catch (e) { /* 删除调校失败 */
      alert('删除失败')
    }
  }

  // Round 3: 复制调校
  const duplicateTune = async (tune) => {
    try {
      const payload = {
        name: (tune.name || '未命名调校') + ' (副本)',
        tags: [...(tune.tags || [])],
        vehicleId: tune.vehicleId || null,
        basePi: tune.basePi || null,
        targetPi: tune.generationMode === 'ai' ? tune.targetPi : null,
        totalPi: tune.totalPi ?? tune.estimatedPi ?? null,
        generationMode: tune.generationMode === 'ai' ? 'ai' : 'manual',
        raceType: tune.raceType || null,
        segmentType: tune.segmentType || null,
        driveType: tune.driveType || null,
        tires: { ...tune.tires },
        suspension: { ...tune.suspension },
        drivetrain: { ...tune.drivetrain },
        brakes: { ...tune.brakes },
        aero: { ...tune.aero },
        parts: { ...tune.parts },
        freeMode: !!tune.freeMode
      }
      const newTune = await api.tunes.create(payload);
      await loadTunes()
      if (newTune && newTune.id) {
        const updatedTunes = await api.tunes.list();
        const found = Array.isArray(updatedTunes) && updatedTunes.find(t => t.id === newTune.id)
        if (found) {
          await loadVehicles()
          startEdit(found)
        }
      }
      alert('调校复制成功')
    } catch (e) { /* 复制调校失败 */
      alert('复制失败')
    }
  }


  const startEdit = (tune) => {
    // 在 setFormData 之前把 parts 存入 ref，vehicleId effect 会在 formData 更新后读取它
    pendingPartsRef.current = { ...getDefaultParts(), ...(tune.parts || {}) }
    setFormData({
      name: tune.name || '',
      tags: (tune.tags || []).join(', '),
      vehicleId: tune.vehicleId || '',
      tires: { ...defaultFormData.tires, ...(tune.tires || {}) },
      suspension: { ...defaultFormData.suspension, ...(tune.suspension || {}) },
      drivetrain: { ...defaultFormData.drivetrain, ...(tune.drivetrain || {}) },
      brakes: { ...defaultFormData.brakes, ...(tune.brakes || {}) },
      aero: { ...defaultFormData.aero, ...(tune.aero || {}) },
      parts: { ...getDefaultParts(), ...(tune.parts || {}) },
      tuningCapabilities: tune.tuningCapabilities || null,
      freeMode: !!tune.freeMode,
      notes: tune.notes || ''
    })
    // 已保存方案的 basePi 由服务端按车辆原厂档案计算；加载档案后还会再次校正。
    setBasePi(tune.basePi || 500)
    setSolutionPi(tune.piStatus === 'user_confirmed' ? Number(tune.totalPi) : null)
    const savedTargetPi = Number(tune.targetPi)
    setTargetPi(isPiClassCap(savedTargetPi) ? savedTargetPi : nextPiClassCap(tune.basePi || 500))
    setEditingTune(tune.id)
    setWizardStep(3)
    _setBuildMode(tune.generationMode === 'ai' ? 'ai' : (tune.generationMode === 'assisted' ? 'capability' : 'manual'))
    setAiRaceType(tune.raceType || 'road')
    setSegmentType(tune.segmentType || 'balanced')
    setAiDriveType(tune.driveType || 'awd')
    setShowModal(true)
    setDrivingProblemsOpen(false)
    setSelectedProblem(null)
    setTelemetryPanelOpen(false)
    setDiagnosisResult(null)
    setSelectedSessionId('')
    dirtyParamsRef.current.clear()
  }

  const startCreate = () => {
    draftVersionRef.current += 1
    pendingPartsRef.current = null
    setFormData(createDefaultFormData())
    setEditingTune(null)
    setWizardStep(1)
    _setBuildMode(null)
    setAiRaceType('road')
    setSegmentType('balanced')
    setAiDriveType('awd')
    setShowModal(true)
    setBasePi(500)
    setTargetPi(800)
    setSolutionPi(null)
    setUpgradeShop(null)
    setDrivingProblemsOpen(false)
    setSelectedProblem(null)
    setTelemetryPanelOpen(false)
    setDiagnosisResult(null)
    setSelectedSessionId('')
    dirtyParamsRef.current.clear()
  }

  const closeModal = () => {
    draftVersionRef.current += 1
    setShowModal(false)
    setEditingTune(null)
    setFormData(createDefaultFormData())
    setWizardStep(1)
    _setBuildMode(null)
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
    setTelemetrySuggestions(null)
    setHighlightedParams([])
  }

  const selectVehicleForDraft = (vehicleId) => {
    draftVersionRef.current += 1
    setFormData({ ...createDefaultFormData(), vehicleId })
    _setBuildMode(null)
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
  }

  const chooseBuildMode = mode => {
    draftVersionRef.current += 1
    pendingPartsRef.current = null
    setFormData(prev => ({
      ...createDefaultFormData(),
      vehicleId: prev.vehicleId,
      name: prev.name,
      tags: prev.tags,
      notes: prev.notes,
      tuningCapabilities: mode === 'capability' ? {
        alignment: true, suspension: false, frontAntiRollBar: false, rearAntiRollBar: false,
        transmission: 'none', gearCount: 6, brakes: false, differential: false,
        frontAero: false, rearAero: false, driveType: upgradeShop?.baseDriveType || 'awd'
      } : null
    }))
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
    _setBuildMode(mode)  // 同步更新 ref，防止异步 effect 竞争
    refreshUpgradeShop(formData.vehicleId, {}, null, mode === 'capability' ? {
      alignment: true, suspension: false, frontAntiRollBar: false, rearAntiRollBar: false,
      transmission: 'none', gearCount: 6, brakes: false, differential: false,
      frontAero: false, rearAero: false, driveType: upgradeShop?.baseDriveType || 'awd'
    } : null)
  }

  const updateTuningCapabilities = async (patch) => {
    const capabilities = { ...(formData.tuningCapabilities || {}), ...patch }
    setFormData(prev => ({ ...prev, tuningCapabilities: capabilities }))
    await refreshUpgradeShop(formData.vehicleId, formData.parts, capabilities.driveType, capabilities)
  }

  const generateAssistedTune = () => {
    if (!upgradeShop?.tuneParameters?.length) {
      alert('请先确认至少一个可调项目。')
      return false
    }
    const mergedShop = {
      ...upgradeShop,
      targetPi: targetPi || basePi || upgradeShop.targetPi || upgradeShop.basePi,
      parts: formData.parts || upgradeShop.parts,
      capabilities: formData.tuningCapabilities || upgradeShop.capabilities,
      effectiveDriveType: aiDriveType || formData.parts?.drivetrain_swap?.optionId || formData.tuningCapabilities?.driveType || upgradeShop.effectiveDriveType || upgradeShop.baseDriveType
    }
    const recommended = getInitialParameterRecommendations(mergedShop, aiRaceType, segmentType)
    setFormData(prev => ({
      ...prev,
      tires: { ...prev.tires, ...recommended.tires },
      suspension: { ...prev.suspension, ...recommended.suspension },
      drivetrain: { ...prev.drivetrain, ...recommended.drivetrain },
      brakes: { ...prev.brakes, ...recommended.brakes },
      aero: { ...prev.aero, ...recommended.aero }
    }))
    return true
  }

  const applyTelemetrySuggestions = (suggestions) => {
    if (!suggestions || !suggestions.changes) return

    const suggestedChanges = convertFixesToSuggestedChanges(suggestions.changes)
    if (!suggestedChanges) return

    setFormData(prev => {
      const updated = { ...prev }
      const newHighlighted = []
      for (const [category, params] of Object.entries(suggestedChanges)) {
        if (updated[category]) {
          updated[category] = { ...updated[category] }
          for (const [key, value] of Object.entries(params)) {
            if (key in updated[category]) {
              updated[category][key] = Number((updated[category][key] + value).toFixed(2))
              newHighlighted.push(`${category}.${key}`)
            }
          }
        }
      }
      setHighlightedParams(newHighlighted)
      return updated
    })
  }

  const toggleCompareMode = () => {
    setCompareMode(prev => !prev)
    setCompareSelected([])
    setCompareResult(null)
  }

  const toggleSelectForCompare = (tuneId) => {
    setCompareSelected(prev => {
      if (prev.includes(tuneId)) {
        return prev.filter(id => id !== tuneId)
      }
      if (prev.length >= 2) {
        return [prev[1], tuneId]
      }
      return [...prev, tuneId]
    })
  }

  const runCompare = async () => {
    if (compareSelected.length !== 2) return
    if (!compareTrackId) {
      alert('请先选择对比赛道')
      return
    }
    setCompareLoading(true)
    try {
      const [tuneA, tuneB] = compareSelected
      const data = await api.tunes.compare({
        tuneIdA: tuneA,
        tuneIdB: tuneB,
        trackId: compareTrackId
      })
      setCompareResult(data)
    } catch (e) { /* 调校对比失败 */
      alert('对比失败，请检查网络连接')
    } finally {
      setCompareLoading(false)
    }
  }

  const clearCompare = () => {
    setCompareSelected([])
    setCompareResult(null)
  }

  const allTags = useMemo(() => {
    const tagSet = new Set()
    tunes.forEach(t => {
      (t.tags || []).forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [tunes])

  const filteredTunes = useMemo(() => {
    return tunes.filter(t => {
      const matchSearch = !searchQuery.trim() || (t.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      const matchVehicle = !vehicleFilter || t.vehicleId === vehicleFilter
      const matchTag = !tagFilter || (t.tags || []).includes(tagFilter)
      return matchSearch && matchVehicle && matchTag
    })
  }, [tunes, searchQuery, vehicleFilter, tagFilter])

  const vehicleOptions = useMemo(() => {
    return Object.entries(vehicles).map(([id, v]) => ({
      id,
      name: v?.name || '车辆 #' + id
    })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [vehicles])

  const getVehicleName = (vehicleId) => {
    if (!vehicleId) return '未指定车辆'
    const v = vehicles[vehicleId]
    return v?.name || '车辆 #' + vehicleId
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '-'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }

  const updateFormField = (category, field, value) => {
    dirtyParamsRef.current.add(`${category}.${field}`)
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value === '' ? '' : parseFloat(value)
      }
    }))
  }

  // Round 1: 配件升级解锁提示 toast + 高亮参数列表
  const [unlockToast, setUnlockToast] = useState(null)
  const [highlightedParams, setHighlightedParams] = useState([])

  // Round 1: 获取当前推荐的默认值（嵌套路径格式）
  const tuneDefaults = useMemo(() => {
    if (!formData.parts) return {}
    try {
      const raw = getTuneDefaults(formData.parts, currentVehicleStats)
      if (!raw) return {}
      const mapped = {}
      for (const [flatKey, value] of Object.entries(raw)) {
        const path = TUNE_DEFAULT_KEY_MAP[flatKey]
        if (path) {
          // 旧推荐表的胎压是 PSI；调校表单统一使用 bar。
          const isTirePressure = flatKey === 'tire_pressure_front' || flatKey === 'tire_pressure_rear'
          mapped[`${path[0]}.${path[1]}`] = isTirePressure && Number.isFinite(Number(value))
            ? Number((Number(value) * 0.0689476).toFixed(1))
            : value
        }
      }
      return mapped
    } catch (e) {
      return {}
    }
  }, [formData.parts, currentVehicleStats])

  // Round 1: 重置单个参数为推荐值
  const resetParamToDefault = (category, field) => {
    const key = `${category}.${field}`
    const defaultVal = tuneDefaults[key]
    if (defaultVal !== undefined) {
      updateFormField(category, field, defaultVal)
      dirtyParamsRef.current.delete(key)
    }
  }

  // Round 1: 重置所有参数为推荐值
  const resetAllToDefaults = () => {
    if (Object.keys(tuneDefaults).length === 0) return
    setFormData(prev => {
      const updated = { ...prev }
      for (const category of ['tires', 'suspension', 'drivetrain', 'brakes', 'aero']) {
        if (!updated[category]) continue
        updated[category] = { ...updated[category] }
        for (const field of Object.keys(updated[category])) {
          const key = `${category}.${field}`
          if (tuneDefaults[key] !== undefined) {
            updated[category][field] = tuneDefaults[key]
          }
        }
      }
      return updated
    })
    dirtyParamsRef.current.clear()
  }

  // 将当前车辆的所有改装槽位恢复为原厂，并让服务端重新解析整车构型。
  // 不能直接使用旧的前端 PART_CATEGORIES 默认表：车型专属槽位和通用槽位
  // 可能不同，直接替换会让 PartSelector 的 selected/slotInfo 结构短暂失配。
  const resetAllPartsToStock = async () => {
    const stockParts = Object.fromEntries((upgradeShop?.slots || []).map(slot => [
      slot.id,
      slot.tierSystem ? { tier: 'stock', optionId: 'stock' } : { optionId: 'stock' }
    ]))
    const vehicleId = formData.vehicleId
    if (!vehicleId) return

    dirtyParamsRef.current.clear()
    setSolutionPi(null)
    setFormData(prev => ({ ...prev, parts: stockParts }))
    await refreshUpgradeShop(vehicleId, stockParts)
  }

  // 配件选择处理（Round 9: 对比解锁参数）
  const TUNE_PARAM_LABELS = {
    'tire_camber_front': '前外倾角', 'tire_camber_rear': '后外倾角',
    'tire_toe_front': '前束角', 'tire_toe_rear': '后束角',
    'caster_front': '前后倾角',
    'spring_front': '前弹簧硬度', 'spring_rear': '后弹簧硬度',
    'damping_front': '前阻尼', 'damping_rear': '后阻尼',
    'rebound_front': '前回弹阻尼', 'rebound_rear': '后回弹阻尼',
    'bump_front': '前压缩阻尼', 'bump_rear': '后压缩阻尼',
    'arb_front': '前防倾杆', 'arb_rear': '后防倾杆',
    'ride_height_front': '前车身高度', 'ride_height_rear': '后车身高度',
    'diff_accel': '差速器加速', 'diff_decel': '差速器减速', 'diff_center': '中央差速器',
    'diff_front_accel': '前差速器加速', 'diff_front_decel': '前差速器减速',
    'diff_rear_accel': '后差速器加速', 'diff_rear_decel': '后差速器减速',
    'gear_1': '1档齿比', 'gear_2': '2档齿比', 'gear_3': '3档齿比',
    'gear_4': '4档齿比', 'gear_5': '5档齿比', 'gear_6': '6档齿比',
    'gear_7': '7档齿比', 'gear_8': '8档齿比', 'gear_9': '9档齿比', 'gear_10': '10档齿比',
    'brake_balance': '制动力平衡', 'brake_pressure': '制动力压力',
    'downforce_front': '前下压力', 'downforce_rear': '后下压力'
  }

  const updatePartSelection = (categoryId, tier, optionId) => {
    // Round 9: 对比升级前后解锁的参数
    const oldParts = formData.parts
    const newParts = {
      ...oldParts,
      [categoryId]: {
        tier: tier || 'stock',
        optionId: optionId || 'stock'
      }
    }
    const oldConstraints = getTuneConstraints(oldParts)
    const newConstraints = getTuneConstraints(newParts)
    const newlyUnlocked = []
    for (const [paramId, constraint] of Object.entries(newConstraints)) {
      if (!constraint.locked && oldConstraints[paramId]?.locked) {
        newlyUnlocked.push(TUNE_PARAM_LABELS[paramId] || paramId)
      }
    }
    if (newlyUnlocked.length > 0) {
      setUnlockToast('已解锁: ' + newlyUnlocked.join(' / '))
      // Round 1: 记录高亮参数的嵌套路径（用于闪烁动画）
      const flatToNested = {}
      for (const [flatKey, label] of Object.entries(TUNE_PARAM_LABELS)) {
        const path = TUNE_DEFAULT_KEY_MAP[flatKey]
        if (path) flatToNested[flatKey] = `${path[0]}.${path[1]}`
      }
      const nestedPaths = newlyUnlocked.flatMap(label => {
        const flatKey = Object.entries(TUNE_PARAM_LABELS).find(([, v]) => v === label)?.[0]
        return flatKey && flatToNested[flatKey] ? [flatToNested[flatKey]] : []
      })
      setHighlightedParams(nestedPaths)
      // 自动清除 toast 和高亮
      setTimeout(() => { setUnlockToast(null); setHighlightedParams([]) }, 4000)
    }

    const activeDriveType = categoryId === 'drivetrain_swap' ? optionId : (newParts.drivetrain_swap?.optionId || aiDriveType)
    if (categoryId === 'drivetrain_swap' && optionId) {
      setAiDriveType(optionId)
    }

    setFormData(prev => ({
      ...prev,
      parts: newParts
    }))
    const isCapMode = _buildMode === 'capability'
    refreshUpgradeShop(formData.vehicleId, newParts, activeDriveType, isCapMode ? formData.tuningCapabilities : null)
  }

  // 根据当前配件计算调校参数约束
  const tuneConstraints = useMemo(() => {
    let currentParts = formData.parts;
    if (!currentParts || Object.keys(currentParts).length === 0) {
      currentParts = {};
      PART_CATEGORIES.forEach(cat => {
        if (cat.tierSystem) currentParts[cat.id] = { tier: 'race' };
        else currentParts[cat.id] = { optionId: 'stock' };
      });
    }

    const rawConstraints = getTuneConstraints(currentParts, formData.freeMode);
    // 调校范围以车辆档案为唯一真值。未建档时全部锁定；已建档时也只
    // 解锁档案明确给出的项目，不能回退到旧的通用范围表。
    if (!upgradeShop || upgradeShop.status === 'unverified') {
      Object.keys(rawConstraints).forEach(key => {
        rawConstraints[key] = { locked: true, min: null, max: null, step: null, reason: '该车辆的调校资料尚未录入' }
      })
    } else {
      Object.keys(rawConstraints).forEach(key => {
        rawConstraints[key] = { locked: true, min: null, max: null, step: null, reason: '当前改装配置未解锁该调校项' }
      })
      ;(upgradeShop.tuneParameters || []).forEach(parameter => {
        if (!parameter?.id || !parameter.range) return
        rawConstraints[parameter.id] = {
          locked: false,
          min: parameter.range.min,
          max: parameter.range.max,
          step: parameter.range.step || null
        }
      })
    }

    // getTuneConstraints 返回扁平 key（如 tire_pressure_front），
    // UI 使用嵌套路径（如 tires.frontPressure），这里做映射转换
    const PARAM_KEY_MAP = {
      'tire_pressure_front': 'tires.frontPressure',
      'tire_pressure_rear': 'tires.rearPressure',
      'tire_camber_front': 'tires.frontCamber',
      'tire_camber_rear': 'tires.rearCamber',
      'tire_toe_front': 'tires.frontToe',
      'tire_toe_rear': 'tires.rearToe',
      'caster_front': 'tires.frontCaster',
      'spring_front': 'suspension.frontSpring',
      'spring_rear': 'suspension.rearSpring',
      'damping_front': 'suspension.frontDamping',
      'damping_rear': 'suspension.rearDamping',
      'rebound_front': 'suspension.frontRebound',
      'rebound_rear': 'suspension.rearRebound',
      'bump_front': 'suspension.frontBump',
      'bump_rear': 'suspension.rearBump',
      'arb_front': 'suspension.frontARB',
      'arb_rear': 'suspension.rearARB',
      'ride_height_front': 'suspension.frontRideHeight',
      'ride_height_rear': 'suspension.rearRideHeight',
      'diff_accel': 'drivetrain.diffAccel',
      'diff_decel': 'drivetrain.diffDecel',
      'diff_front_accel': 'drivetrain.frontDiffAccel',
      'diff_front_decel': 'drivetrain.frontDiffDecel',
      'diff_rear_accel': 'drivetrain.rearDiffAccel',
      'diff_rear_decel': 'drivetrain.rearDiffDecel',
      'diff_center': 'drivetrain.diffCenter',
      'final_drive': 'drivetrain.finalDrive',
      'gear_1': 'drivetrain.gear1', 'gear_2': 'drivetrain.gear2',
      'gear_3': 'drivetrain.gear3', 'gear_4': 'drivetrain.gear4',
      'gear_5': 'drivetrain.gear5', 'gear_6': 'drivetrain.gear6',
      'gear_7': 'drivetrain.gear7', 'gear_8': 'drivetrain.gear8',
      'gear_9': 'drivetrain.gear9', 'gear_10': 'drivetrain.gear10',
      'brake_balance': 'brakes.balance',
      'brake_pressure': 'brakes.pressure',
      'downforce_front': 'aero.frontDownforce',
      'downforce_rear': 'aero.rearDownforce'
    };

    const getLockedHint = (constraint) => {
      if (!constraint.locked || !constraint.reqCategory) return '';
      const cat = PART_CATEGORIES.find(c => c.id === constraint.reqCategory);
      const tier = TIER_LABELS[constraint.reqTier];
      if (cat && tier) {
        return `需改装 ${tier.zh}${cat.label}解锁`;
      }
      return '需升级配件';
    };

    const mapped = {};
    for (const [flatKey, constraint] of Object.entries(rawConstraints)) {
      const dotPath = PARAM_KEY_MAP[flatKey];
      const enhancedConstraint = {
        ...constraint,
        lockedHint: getLockedHint(constraint)
      };
      if (dotPath) {
        mapped[dotPath] = enhancedConstraint;
      } else {
        // 未知 key 保持原样
        mapped[flatKey] = enhancedConstraint;
      }
    }
    return mapped;
  }, [formData.parts, formData.freeMode, upgradeShop])

  // 导出调校为JSON文件
  const exportTune = (tune) => {
    const payload = {
      version: 3,  // Round 4: 升级版本号到3
      exportedAt: new Date().toISOString(),
      generator: 'forza-telemetry-tune-export',
      compatibility: 'v1,v2,v3',
      tune: {
        name: tune.name,
        tags: tune.tags || [],
        vehicleId: tune.vehicleId,
        tires: tune.tires,
        suspension: tune.suspension,
        drivetrain: tune.drivetrain,
        aero: tune.aero,
        parts: tune.parts
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tune_${tune.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Round 4: 分享码工具函数（TextEncoder支持中文）
  const SHARE_CODE_VERSION = 2
  const uint8ToBase64 = (bytes) => {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
  const base64ToUint8 = (base64) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  const simpleChecksum = (str) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + c
      hash |= 0
    }
    return Math.abs(hash) % 1000
  }

  // 生成分享码（TextEncoder编码 + 校验和）
  const generateShareCode = (tune) => {
    const compact = {
      v: SHARE_CODE_VERSION,
      n: tune.name,
      vid: tune.vehicleId,
      t: tune.tires,
      s: tune.suspension,
      d: tune.drivetrain,
      a: tune.aero,
      p: tune.parts
    }
    try {
      const jsonStr = JSON.stringify(compact)
      const encoder = new TextEncoder()
      const bytes = encoder.encode(jsonStr)
      // 校验和：对原始JSON字符串计算
      const cs = simpleChecksum(jsonStr)
      // 格式: base64(payload) + '.' + 3位校验和
      return uint8ToBase64(bytes) + '.' + String(cs).padStart(3, '0')
    } catch (e) {
      return null
    }
  }

  // 解析分享码（含校验和验证）
  const parseShareCode = (code) => {
    try {
      const parts = code.trim().split('.')
      const base64Part = parts[0]
      const checksum = parts.length > 1 ? parseInt(parts[1], 10) : null

      const bytes = base64ToUint8(base64Part)
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(bytes)
      const decoded = JSON.parse(jsonStr)

      // 校验和验证
      if (checksum !== null) {
        const expectedCs = simpleChecksum(jsonStr)
        if (expectedCs !== checksum) {
          return { error: '分享码校验失败，可能复制不完整，请重新复制' }
        }
      }

      // 版本兼容性检查
      const version = decoded.v || 1
      if (version > SHARE_CODE_VERSION) {
        return { error: `分享码版本 v${version} 高于当前支持的 v${SHARE_CODE_VERSION}，请更新软件` }
      }

      return {
        name: decoded.n || '导入的调校',
        tags: [],
        vehicleId: decoded.vid || decoded.v || '',
        tires: decoded.t || {},
        suspension: decoded.s || {},
        drivetrain: decoded.d || {},
        aero: decoded.a || {},
        parts: decoded.p || {}
      }
    } catch (e) {
      return { error: '分享码格式无效，请检查后重试' }
    }
  }

  // 从文件导入调校
  const handleImportFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const tune = data.tune || data
      const payload = {
        name: (tune.name || '导入调校') + '_导入',
        tags: tune.tags || [],
        vehicleId: tune.vehicleId || null,
        tires: tune.tires || {},
        suspension: tune.suspension || {},
        drivetrain: tune.drivetrain || {},
        brakes: tune.brakes || {},
        aero: tune.aero || {},
        parts: tune.parts || {},
        notes: tune.notes || '',
        description: tune.description || ''
      }
      await api.tunes.create(payload);
      await loadTunes()
      alert('调校导入成功')
    } catch (err) { /* 导入失败 */
      alert('导入失败，请检查文件格式')
    } finally {
      e.target.value = ''
    }
  }

  // 从分享码导入
  const importFromShareCode = async (code) => {
    const tune = parseShareCode(code)
    if (!tune || tune.error) {
      alert(tune?.error || '分享码无效')
      return
    }
    try {
      await api.tunes.create(tune);
      await loadTunes()
      setShareCodeModal(null)
      setImportPreview(null)
      alert('调校导入成功')
    } catch (err) {
      alert('导入失败')
    }
  }

  // Round 1: NumberInput 辅助函数，自动注入 defaultValue / highlighted / onResetDefault
  const ni = (category, field, extra = {}) => {
    const key = `${category}.${field}`
    let suggestedValue = undefined
    if (telemetrySuggestions && telemetrySuggestions.changes) {
      const paramKey = Object.keys(telemetrySuggestions.changes).find(k => {
        const dotPath = FIX_PARAM_MAP[k] || ''
        return dotPath === key
      })
      if (paramKey) {
        const fix = telemetrySuggestions.changes[paramKey]
        const originalValue = editingTune
          ? (editingTune[category]?.[field])
          : (formData[category]?.[field])
        if (originalValue !== undefined && fix) {
          suggestedValue = Number((originalValue + fix.delta).toFixed(2))
        }
      }
    }
    return {
      defaultValue: tuneDefaults[key],
      highlighted: highlightedParams.includes(key),
      onResetDefault: () => resetParamToDefault(category, field),
      lockedHint: tuneConstraints[key]?.lockedHint || '',
      suggestedValue,
      ...extra
    }
  }

  // Round 9: 折叠切换
  const toggleSection = (sectionId) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // Round 9: 快捷键支持
  // 智能改装与调校预设生成器
  const applyPresetTune = (raceType, targetPiClass) => {
    const classPiMap = { D: 500, C: 600, B: 700, A: 800, S1: 900, S2: 998, X: 999 };
    const targetPiVal = classPiMap[targetPiClass] || 800;
    const newParts = { ...getDefaultParts() };

    newParts.suspension = { tier: 'race' };
    newParts.differential = { tier: 'race' };
    newParts.transmission = { tier: 'race' };
    newParts.anti_roll_bars = { tier: 'race' };
    newParts.brakes = { tier: 'race' };

    if (raceType === 'road' || raceType === 'street') {
      newParts.tires_compound = { tier: targetPiVal >= 900 ? 'race' : 'sport' };
      newParts.aero_front = { tier: 'race' };
      newParts.aero_rear = { tier: 'race' };
      newParts.weight_reduction = { tier: targetPiVal >= 800 ? 'race' : 'sport' };
    } else if (raceType === 'dirt' || raceType === 'rally') {
      newParts.tires_compound = { tier: 'sport' };
      newParts.aero_front = { tier: 'stock' };
      newParts.aero_rear = { tier: 'stock' };
      newParts.weight_reduction = { tier: 'sport' };
      newParts.drivetrain_swap = { optionId: 'awd' };
    } else if (raceType === 'cross_country') {
      newParts.tires_compound = { tier: 'sport' };
      newParts.aero_front = { tier: 'stock' };
      newParts.aero_rear = { tier: 'stock' };
      newParts.weight_reduction = { tier: 'sport' };
      newParts.drivetrain_swap = { optionId: 'awd' };
    } else if (raceType === 'drift') {
      newParts.tires_compound = { tier: 'sport' };
      newParts.aero_front = { tier: 'stock' };
      newParts.aero_rear = { tier: 'stock' };
      newParts.drivetrain_swap = { optionId: 'rwd' };
    }

    const newTires = {
      frontPressure: raceType === 'drift' ? 32.0 : raceType === 'cross_country' ? 26.0 : 28.5,
      rearPressure: raceType === 'drift' ? 26.0 : raceType === 'cross_country' ? 26.0 : 28.5,
      frontCamber: raceType === 'drift' ? -5.0 : raceType === 'cross_country' ? -1.2 : -2.0,
      rearCamber: raceType === 'drift' ? -0.5 : raceType === 'cross_country' ? -0.8 : -1.5,
      frontToe: raceType === 'drift' ? 0.8 : 0.0,
      rearToe: 0.0
    };

    const newSuspension = {
      frontSpring: raceType === 'cross_country' ? 45.0 : (raceType === 'dirt' || raceType === 'rally') ? 60.0 : 95.0,
      rearSpring: raceType === 'cross_country' ? 40.0 : (raceType === 'dirt' || raceType === 'rally') ? 50.0 : 80.0,
      frontDamping: raceType === 'cross_country' ? 4.5 : (raceType === 'dirt' || raceType === 'rally') ? 5.5 : 8.5,
      rearDamping: raceType === 'cross_country' ? 4.0 : (raceType === 'dirt' || raceType === 'rally') ? 5.0 : 7.5,
      frontARB: raceType === 'cross_country' ? 8.0 : (raceType === 'dirt' || raceType === 'rally') ? 10.0 : 15.0,
      rearARB: raceType === 'cross_country' ? 30.0 : (raceType === 'dirt' || raceType === 'rally') ? 35.0 : 40.0,
      frontRideHeight: raceType === 'cross_country' ? 18.0 : (raceType === 'dirt' || raceType === 'rally') ? 15.0 : 8.0,
      rearRideHeight: raceType === 'cross_country' ? 18.5 : (raceType === 'dirt' || raceType === 'rally') ? 15.5 : 8.5
    };

    const newDrivetrain = {
      diffAccel: raceType === 'drift' ? 100 : raceType === 'road' ? 50 : 40,
      diffDecel: raceType === 'drift' ? 100 : raceType === 'road' ? 10 : 0,
      diffCenter: raceType === 'drift' ? 85 : 65,
      finalDrive: 3.8,
      gear1: 3.2,
      gear2: 2.2,
      gear3: 1.6,
      gear4: 1.2,
      gear5: 1.0,
      gear6: 0.85
    };

    const newAero = {
      frontDownforce: raceType === 'road' ? 150 : 100,
      rearDownforce: raceType === 'road' ? 250 : 150
    };

    setFormData(prev => ({
      ...prev,
      parts: newParts,
      tires: newTires,
      suspension: newSuspension,
      drivetrain: newDrivetrain,
      aero: newAero,
      freeMode: false
    }));

    setTargetPi(targetPiVal);
    if (Number.isFinite(Number(upgradeShop?.basePi))) setBasePi(Number(upgradeShop.basePi));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!showModal) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          saveTune();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  return {
    tunes,
    setTunes,
    vehicles,
    setVehicles,
    tracks,
    setTracks,
    loading,
    setLoading,
    showModal,
    setShowModal,
    editingTune,
    setEditingTune,
    searchQuery,
    setSearchQuery,
    vehicleFilter,
    setVehicleFilter,
    tagFilter,
    setTagFilter,
    formData,
    setFormData,
    compareMode,
    setCompareMode,
    compareSelected,
    setCompareSelected,
    compareResult,
    setCompareResult,
    compareLoading,
    setCompareLoading,
    compareTrackId,
    setCompareTrackId,
    shareCodeModal,
    setShareCodeModal,
    importPreview,
    setImportPreview,
    importFileRef,
    dirtyParamsRef,
    collapsedSections,
    setCollapsedSections,
    targetPi,
    setTargetPi,
    solutionPi,
    setSolutionPi,
    basePi,
    setBasePi,
    autoUpgradeLoading,
    wizardStep,
    setWizardStep,
    buildMode,
    setBuildMode,
    selectVehicleForDraft,
    chooseBuildMode,
    updateTuningCapabilities,
    generateAssistedTune,
    aiRaceType,
    setAiRaceType,
    segmentType,
    setSegmentType,
    aiDriveType,
    setAiDriveType,
    drivingProblemsOpen,
    setDrivingProblemsOpen,
    selectedProblem,
    setSelectedProblem,
    telemetryPanelOpen,
    setTelemetryPanelOpen,
    availableSessions,
    setAvailableSessions,
    selectedSessionId,
    setSelectedSessionId,
    diagnosing,
    setDiagnosing,
    diagnosisResult,
    setDiagnosisResult,
    tuneSessionStats,
    setTuneSessionStats,
    partsPiDelta,
    totalPi,
    totalPiUpper,
    unknownPiSelectionCount,
    canAutoUpgrade: Boolean(formData.vehicleId && upgradeShop && upgradeShop.status !== 'unverified'),
    piIsVerified: upgradeShop?.piStatus === 'verified',
    currentVehicleStats,
    handleAutoUpgrade,
    applyProblemFix,
    loadTelemetrySessions,
    runTelemetryDiagnosis,
    applyDiagnosisFix,
    aiDiagnosis,
    aiDiagnosing,
    runAiProblemDiagnosis,
    runAiTelemetryDiagnosis,
    loadTunes,
    loadVehicles,
    loadTracks,
    loadTuneSessionStats,
    saveTune,
    deleteTune,
    duplicateTune,
    startEdit,
    startCreate,
    closeModal,
    toggleCompareMode,
    toggleSelectForCompare,
    runCompare,
    clearCompare,
    allTags,
    filteredTunes,
    vehicleOptions,
    getVehicleName,
    formatDate,
    formatTime,
    updateFormField,
    unlockToast,
    setUnlockToast,
    highlightedParams,
    setHighlightedParams,
    tuneDefaults,
    resetParamToDefault,
    resetAllToDefaults,
    resetAllPartsToStock,
    updatePartSelection,
    tuneConstraints,
    upgradeShop,
    visiblePartCategories: upgradeShop?.slots || [],
    exportTune,
    uint8ToBase64,
    base64ToUint8,
    simpleChecksum,
    generateShareCode,
    parseShareCode,
    handleImportFile,
    importFromShareCode,
    applyPresetTune,
    ni,
    toggleSection,
    TUNE_DEFAULT_KEY_MAP,
    telemetrySuggestions,
    setTelemetrySuggestions,
    applyTelemetrySuggestions
  };
}
