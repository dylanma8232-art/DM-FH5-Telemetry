import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  PART_CATEGORIES,
  TIER_LABELS,
  getDefaultParts,
  getTuneConstraints,
  getTuneDefaults,
  autoUpgradeToPi,
  calculateTotalPi
} from '../data/parts'
import { DRIVING_PROBLEMS, diagnoseFromTelemetry, PROBLEM_CATEGORIES } from '../data/tunePresets'

// fixes 扁平 key 到 suggestedChanges 嵌套路径的映射
export const FIX_PARAM_MAP = {
  'frontTirePressure': 'tires.frontPressure',
  'rearTirePressure': 'tires.rearPressure',
  'frontCamber': 'tires.frontCamber',
  'rearCamber': 'tires.rearCamber',
  'frontToe': 'tires.frontToe',
  'rearToe': 'tires.rearToe',
  'frontSpring': 'suspension.frontSpring',
  'rearSpring': 'suspension.rearSpring',
  'frontDamping': 'suspension.frontDamping',
  'rearDamping': 'suspension.rearDamping',
  'frontARB': 'suspension.frontARB',
  'rearARB': 'suspension.rearARB',
  'frontRideHeight': 'suspension.frontRideHeight',
  'rearRideHeight': 'suspension.rearRideHeight',
  'diffAccel': 'drivetrain.diffAccel',
  'diffDecel': 'drivetrain.diffDecel',
  'diffCenter': 'drivetrain.diffCenter',
  'finalDrive': 'drivetrain.finalDrive',
  'frontDownforce': 'aero.frontDownforce',
  'rearDownforce': 'aero.rearDownforce',
  'brakeBias': 'brakes.bias'
}

/**
 * 将 DRIVING_PROBLEMS.fixes 格式转换为 UI 需要的 suggestedChanges 格式。
 * fixes:  { frontTirePressure: { delta: -2, reason: '...' }, ... }
 * suggestedChanges: { tires: { frontPressure: delta_value, ... }, ... }
 */
function convertFixesToSuggestedChanges(fixes) {
  if (!fixes) return null
  const result = {}
  for (const [paramKey, fix] of Object.entries(fixes)) {
    const dotPath = FIX_PARAM_MAP[paramKey]
    if (!dotPath) continue
    const [category, field] = dotPath.split('.')
    if (!result[category]) result[category] = {}
    result[category][field] = fix.delta
  }
  return result
}

const createDefaultFormData = () => ({
  name: '',
  tags: '',
  vehicleId: '',
  tires: {
    frontPressure: '', rearPressure: '', frontCamber: '', rearCamber: '', frontToe: '', rearToe: '', frontCaster: ''
  },
  suspension: {
    frontSpring: '', rearSpring: '', frontDamping: '', rearDamping: '',
    frontRebound: '', rearRebound: '', frontBump: '', rearBump: '',
    frontARB: '', rearARB: '', frontRideHeight: '', rearRideHeight: ''
  },
  drivetrain: {
    diffAccel: '', diffDecel: '', frontDiffAccel: '', frontDiffDecel: '', rearDiffAccel: '', rearDiffDecel: '', diffCenter: '',
    finalDrive: '', gear1: '', gear2: '', gear3: '', gear4: '', gear5: '', gear6: '', gear7: '', gear8: '', gear9: '', gear10: ''
  },
  brakes: { balance: '', pressure: '' },
  aero: {
    frontDownforce: '', rearDownforce: ''
  },
  parts: getDefaultParts(),
  freeMode: false,
  notes: ''
})

const defaultFormData = createDefaultFormData()

const PI_CLASS_CAPS = [500, 600, 700, 800, 900, 998, 999]
const nextPiClassCap = basePi => PI_CLASS_CAPS.find(cap => cap > Number(basePi)) || 999

export function useTuneManager({ onNavigate, navIntent }) {
  const [tunes, setTunes] = useState([])
  const [vehicles, setVehicles] = useState({})
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTune, setEditingTune] = useState(null)
  const [expandedTune, setExpandedTune] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
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

  // Round 2: 记录用户手动修改过的参数（嵌套路径如 "tires.frontPressure"）
  const dirtyParamsRef = useRef(new Set())

  // Round 9: 参数分组折叠状态
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // PI锁定与自动升级相关
  const [targetPi, setTargetPi] = useState(800)
  const [basePi, setBasePi] = useState(500)
  // 留空时跟随配件预估；用户输入后作为这套已保存方案的实际 PI。
  const [solutionPi, setSolutionPi] = useState(null)
  const [autoUpgradeLoading, setAutoUpgradeLoading] = useState(false)
  // 游戏内改装资料只按车辆加载；未建档车辆不得回退到全局通用配件。
  const [upgradeShop, setUpgradeShop] = useState(null)
  const [wizardStep, setWizardStep] = useState(1)
  const [buildMode, setBuildMode] = useState(null)
  const [aiRaceType, setAiRaceType] = useState('road')
  const [aiDriveType, setAiDriveType] = useState('awd')

  // 常用驾驶问题面板
  const [drivingProblemsOpen, setDrivingProblemsOpen] = useState(false)
  const [selectedProblem, setSelectedProblem] = useState(null)

  // Round 4: 活跃调校
  const [activeTune, setActiveTune] = useState(null)
  const [activeTuneLoading, setActiveTuneLoading] = useState(false)

  // 遥测诊断面板
  const [telemetryPanelOpen, setTelemetryPanelOpen] = useState(false)
  const [availableSessions, setAvailableSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosisResult, setDiagnosisResult] = useState(null)

  // Round 6: 调校与比赛关联
  const [tuneSessionStats, setTuneSessionStats] = useState({})
  const [telemetrySuggestions, setTelemetrySuggestions] = useState(null)

  useEffect(() => {
    loadTunes()
    loadVehicles()
    loadTracks()
    loadActiveTune()
    loadTuneSessionStats()
  }, [])

  const refreshUpgradeShop = async (vehicleId, parts = {}, driveType = null) => {
    const requestId = ++upgradeRequestRef.current
    if (!vehicleId) {
      setUpgradeShop(null)
      return
    }
    try {
      const encodedSelections = encodeURIComponent(JSON.stringify(parts))
      const driveQuery = driveType ? `&driveType=${encodeURIComponent(driveType)}` : ''
      const res = await fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/upgrades?selections=${encodedSelections}${driveQuery}`)
      if (!res.ok) throw new Error('无法读取改装资料')
      const resolved = await res.json()
      if (requestId !== upgradeRequestRef.current) return
      setUpgradeShop(resolved)
      if (resolved.invalidated?.length && resolved.effectiveSelections) {
        setFormData(prev => ({ ...prev, parts: resolved.effectiveSelections }))
        setUnlockToast(`已清除 ${resolved.invalidated.length} 个不再兼容的下游改装`)
        setTimeout(() => setUnlockToast(null), 4000)
      }
    } catch (_) {
      if (requestId !== upgradeRequestRef.current) return
      setUpgradeShop({ status: 'unverified', message: '无法读取该车辆的改装资料。', slots: [], tuneParameters: [] })
    }
  }

  useEffect(() => {
    refreshUpgradeShop(formData.vehicleId, formData.parts)
  }, [formData.vehicleId])

  useEffect(() => {
    if (upgradeShop?.baseDriveType) setAiDriveType(upgradeShop.baseDriveType)
  }, [upgradeShop?.baseDriveType])

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
    }
  }, [navIntent, vehicles, tunes])

  // 根据配件计算PI增量
  const partsPiDelta = useMemo(() => {
    // 车辆档案中的 piEstimate 是“从该车原厂状态开始”的估算增量。
    // 它优先于旧的全局等级表，避免不同车辆共用同一套假定增量。
    if (upgradeShop?.slots?.length) {
      return upgradeShop.slots.reduce((total, slot) => {
        const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
        const option = slot.options?.find(item => item.id === optionId)
        return total + (Number.isFinite(Number(option?.piEstimate)) ? Number(option.piEstimate) : 0)
      }, 0)
    }
    try {
      const total = calculateTotalPi(basePi, formData.parts);
      return total - basePi;
    } catch (e) {
      return 0
    }
  }, [formData.parts, basePi, upgradeShop])

  const totalPi = useMemo(() => {
    return basePi + partsPiDelta
  }, [basePi, partsPiDelta])

  const totalPiUpper = useMemo(() => {
    if (!upgradeShop?.slots?.length) return totalPi
    return basePi + upgradeShop.slots.reduce((total, slot) => {
      const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
      const option = slot.options?.find(item => item.id === optionId)
      const value = Number.isFinite(Number(option?.piUpperEstimate)) ? Number(option.piUpperEstimate) : Number(option?.piEstimate)
      return total + (Number(value) || 0)
    }, 0)
  }, [basePi, formData.parts, totalPi, upgradeShop])

  const unknownPiSelectionCount = useMemo(() => {
    if (!upgradeShop?.slots?.length) return 0
    return upgradeShop.slots.reduce((count, slot) => {
      const optionId = formData.parts?.[slot.id]?.optionId || 'stock'
      if (optionId === 'stock') return count
      const option = slot.options?.find(item => item.id === optionId)
      return count + (Number.isFinite(Number(option?.piEstimate)) ? 0 : 1)
    }, 0)
  }, [formData.parts, upgradeShop])

  // 获取当前车辆的基础属性（用于getTuneDefaults）
  const currentVehicleStats = useMemo(() => {
    if (!formData.vehicleId || !vehicles[formData.vehicleId]) return null
    const v = vehicles[formData.vehicleId]
    return v.stats || v.carStats || null
  }, [formData.vehicleId, vehicles])

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
  useEffect(() => {
    if (!formData.parts || buildMode !== 'ai') return
    try {
      const defaults = getTuneDefaults(formData.parts, currentVehicleStats) || {}
      const allowedTuneIds = new Set((upgradeShop?.tuneParameters || []).map(parameter => parameter.id))
      for (const key of Object.keys(defaults)) {
        if (!allowedTuneIds.has(key)) delete defaults[key]
      }
      for (const parameter of upgradeShop?.tuneParameters || []) {
        if (parameter.rangeConfidence === 'vehicle_specific_unknown') delete defaults[parameter.id]
      }
      const recommended = {
        tire_pressure_front: 28, tire_pressure_rear: 28,
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
        if (parameter.rangeConfidence === 'vehicle_specific_unknown') return
        const range = parameter.range || {}
        let value = recommended[parameter.id]
        const gear = parameter.id.match(/^gear_(\d+)$/)?.[1]
        if (gear) value = Math.max(0.65, Number((4.2 / Math.pow(Number(gear), 0.72)).toFixed(2)))
        if (parameter.id.startsWith('spring_')) value = Number(((range.min + range.max) * 0.4).toFixed(1))
        if (parameter.id.startsWith('ride_height_')) value = Number((range.min + (range.max - range.min) * (aiRaceType === 'cross_country' ? 0.75 : 0.2)).toFixed(1))
        if (parameter.id.startsWith('downforce_')) value = Number((range.min + (range.max - range.min) * 0.55).toFixed(0))
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
  }, [formData.parts, currentVehicleStats, buildMode, upgradeShop, aiRaceType])

  // 一键升级：只从当前车辆档案允许的选项中挑选，并在预估 PI 下留出安全余量。
  const handleAutoUpgrade = async ({ preferredDriveType, raceType } = {}) => {
    if (!formData.vehicleId || !upgradeShop || upgradeShop.status === 'unverified') {
      alert('请先选择一辆已录入改装资料的车辆。')
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

  // 应用驾驶问题建议
  const applyProblemFix = (problem) => {
    const suggestedChanges = problem.suggestedChanges || convertFixesToSuggestedChanges(problem.fixes)
    if (!suggestedChanges) {
      alert('该问题暂无建议的参数修改')
      return
    }
    setFormData(prev => {
      const updated = { ...prev }
      for (const [category, params] of Object.entries(suggestedChanges)) {
        if (updated[category]) {
          updated[category] = { ...updated[category] }
          for (const [key, value] of Object.entries(params)) {
            if (key in updated[category]) {
              updated[category][key] = updated[category][key] + value
            }
          }
        }
      }
      return updated
    })
    alert(`已应用「${problem.name}」的调校建议`)
  }

  // 加载可用遥测Session
  const loadTelemetrySessions = async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data = await res.json()
      const sessions = Array.isArray(data) ? data : (data.sessions || [])
      setAvailableSessions(sessions)
    } catch (e) { /* 加载遥测Session失败 */ }
  }

  // 执行遥测诊断
  const runTelemetryDiagnosis = async () => {
    if (!selectedSessionId) {
      alert('请先选择一个Session')
      return
    }
    setDiagnosing(true)
    setDiagnosisResult(null)
    try {
      // 加载遥测数据
      const res = await fetch(`/api/sessions/${selectedSessionId}/telemetry`)
      if (!res.ok) throw new Error('加载遥测数据失败')
      const telemetryData = await res.json()

      // 适配层：将原始遥测包转换成诊断函数期望的简化物理单位格式
      const adaptedTelemetry = (telemetryData || []).map(f => {
        const formatTireTemp = (tempF) => (tempF === undefined || tempF === null) ? 0 : (tempF - 32) * 5 / 9;
        
        // 提取输入控制
        let throttle = 0;
        let brake = 0;
        let steerAngle = 0;
        if (f.controls) {
          throttle = (f.controls.accel || 0) / 255;
          brake = (f.controls.brake || 0) / 255;
          steerAngle = ((f.controls.steer || 0) / 127) * 45;
        } else {
          throttle = (f.accel || 0) / 255;
          brake = (f.brake || 0) / 255;
          steerAngle = ((f.steer || 0) / 127) * 45;
        }

        return {
          speed: f.speedKmh || 0,
          throttle: Math.max(0, Math.min(1, throttle)),
          brake: Math.max(0, Math.min(1, brake)),
          steerAngle: steerAngle,
          lateralG: f.acceleration?.x || 0,
          longitudinalG: f.acceleration?.z || 0,
          yawRate: f.angularVelocity?.y !== undefined ? f.angularVelocity.y * (180 / Math.PI) : 0, // rad/s -> deg/s
          rollAngle: f.roll !== undefined ? f.roll * (180 / Math.PI) : 0, // rad -> deg
          pitchAngle: f.pitch !== undefined ? f.pitch * (180 / Math.PI) : 0, // rad -> deg
          suspension: f.suspension ? {
            frontLeft: f.suspension.frontLeft,
            frontRight: f.suspension.frontRight,
            rearLeft: f.suspension.rearLeft,
            rearRight: f.suspension.rearRight
          } : {
            frontLeft: f.suspFL !== undefined ? f.suspFL : 1.0,
            frontRight: f.suspFR !== undefined ? f.suspFR : 1.0,
            rearLeft: f.suspRL !== undefined ? f.suspRL : 1.0,
            rearRight: f.suspRR !== undefined ? f.suspRR : 1.0
          },
          tireTemp: f.tireTemp ? {
            frontLeft: formatTireTemp(f.tireTemp.frontLeft),
            frontRight: formatTireTemp(f.tireTemp.frontRight),
            rearLeft: formatTireTemp(f.tireTemp.rearLeft),
            rearRight: formatTireTemp(f.tireTemp.rearRight)
          } : {
            frontLeft: formatTireTemp(f.tireTempFL),
            frontRight: formatTireTemp(f.tireTempFR),
            rearLeft: formatTireTemp(f.tireTempRL),
            rearRight: formatTireTemp(f.tireTempRR)
          }
        };
      });

      // 调用诊断函数（返回数组格式）
      const rawResult = diagnoseFromTelemetry(adaptedTelemetry, formData)

      // 转换为 UI 期望的 { summary, issues, suggestedChanges } 格式
      if (Array.isArray(rawResult)) {
        const issues = rawResult.map(item => ({
          severity: item.severity,
          message: item.problem,
          description: item.details
        }))

        // 合并所有 fix 到 suggestedChanges（使用 FIX_PARAM_MAP 映射）
        const suggestedChanges = {}
        for (const item of rawResult) {
          if (!item.fix) continue
          const converted = convertFixesToSuggestedChanges(item.fix)
          if (!converted) continue
          for (const [category, params] of Object.entries(converted)) {
            if (!suggestedChanges[category]) suggestedChanges[category] = {}
            for (const [key, value] of Object.entries(params)) {
              if (suggestedChanges[category][key] === undefined) {
                suggestedChanges[category][key] = value
              } else {
                suggestedChanges[category][key] += value
              }
            }
          }
        }

        // Round 2: 按严重程度排序（high > medium > low > info）
        const severityOrder = { high: 0, medium: 1, low: 2, info: 3 }
        issues.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))

        const summary = issues.length === 0
          ? '未发现明显问题，当前调校状态良好'
          : `诊断完成：发现 ${issues.filter(i => i.severity === 'high').length} 个严重问题，${issues.filter(i => i.severity === 'medium').length} 个一般问题`

        setDiagnosisResult({ summary, issues, suggestedChanges })
      } else {
        // 如果已经是对象格式，直接使用
        setDiagnosisResult(rawResult)
      }
    } catch (e) { /* 遥测诊断失败 */
      setDiagnosisResult({
        summary: '诊断失败: ' + e.message,
        issues: [],
        suggestedChanges: {}
      })
    } finally {
      setDiagnosing(false)
    }
  }

  // 应用遥测诊断建议
  const applyDiagnosisFix = () => {
    if (!diagnosisResult || !diagnosisResult.suggestedChanges) {
      alert('无可用的诊断建议')
      return
    }
    setFormData(prev => {
      const updated = { ...prev }
      for (const [category, params] of Object.entries(diagnosisResult.suggestedChanges)) {
        if (updated[category]) {
          updated[category] = { ...updated[category] }
          for (const [key, value] of Object.entries(params)) {
            if (key in updated[category]) {
              // suggestedChanges 中的 value 是 delta，累加到当前值
              updated[category][key] = updated[category][key] + value
            }
          }
        }
      }
      return updated
    })
    alert('已应用遥测诊断建议')
  }

  const loadTunes = async () => {
    try {
      const res = await fetch('/api/tunes')
      if (!res.ok) {
        setTunes([])
        return
      }
      const data = await res.json()
      setTunes(Array.isArray(data) ? data : [])
    } catch (e) {
      setTunes([])
    }
  }

  const loadVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles')
      if (!res.ok) return
      const data = await res.json()
      setVehicles(data || {})
    } catch (e) { /* 加载车辆失败 */ }
  }

  const loadTracks = async () => {
    try {
      const res = await fetch('/api/tracks')
      if (!res.ok) return
      const data = await res.json()
      // tracks 可能是数组或对象
      setTracks(Array.isArray(data) ? data : Object.values(data || {}))
    } catch (e) { /* 加载赛道失败 */ }
  }

  // Round 6: 加载调校与比赛关联统计
  const loadTuneSessionStats = async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data = await res.json()
      const allSessions = Array.isArray(data) ? data : []
      const stats = {}
      allSessions.forEach(s => {
        if (!s.tuneId) return
        if (!stats[s.tuneId]) {
          stats[s.tuneId] = { count: 0, bestLap: Infinity, totalLaps: 0, sessions: [] }
        }
        const st = stats[s.tuneId]
        st.count++
        st.totalLaps += s.laps?.count || 0
        if (s.laps?.best > 0 && s.laps.best < st.bestLap) {
          st.bestLap = s.laps.best
        }
        st.sessions.push(s)
      })
      setTuneSessionStats(stats)
    } catch (e) { /* 加载统计失败 */ }
  }

  // Round 4: 加载活跃调校
  const loadActiveTune = async () => {
    try {
      const res = await fetch('/api/tunes/active')
      if (!res.ok) return
      const data = await res.json()
      setActiveTune(data.tune || null)
    } catch (e) { /* 加载活跃调校失败 */ }
  }

  // Round 4: 设置活跃调校
  const setActiveTuneById = async (tuneId) => {
    setActiveTuneLoading(true)
    try {
      const res = await fetch('/api/tunes/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tuneId })
      })
      if (!res.ok) throw new Error('设置失败')
      await loadActiveTune()
      alert('已设为当前活跃调校')
    } catch (e) { /* 设置活跃调校失败 */
      alert('设置活跃调校失败')
    } finally {
      setActiveTuneLoading(false)
    }
  }

  // Round 4: 取消活跃调校
  const clearActiveTune = async () => {
    try {
      await fetch('/api/tunes/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tuneId: null })
      })
      setActiveTune(null)
    } catch (e) { /* 取消活跃调校失败 */ }
  }

  const saveTune = async () => {
    if (!formData.name.trim()) {
      alert('请输入调校名称')
      return
    }

    if (!formData.vehicleId || upgradeShop?.status === 'unverified') {
      alert('请先选择一辆已录入游戏内改装资料的车辆。')
      return
    }

    try {
      const validation = await fetch(`/api/vehicles/${encodeURIComponent(formData.vehicleId)}/upgrades/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parts: formData.parts })
      })
      if (!validation.ok) {
        const result = await validation.json()
        alert(result.errors?.join('\n') || '所选改装件不适用于当前车辆。')
        return
      }
    } catch (_) {
      alert('无法验证当前车辆的改装件。')
      return
    }

    const confirmedPi = Number(solutionPi === null ? totalPi : solutionPi)
    if (!Number.isInteger(confirmedPi) || confirmedPi < 100 || confirmedPi > 999) {
      alert('方案 PI 必须是 100 到 999 之间的整数。')
      return
    }

    const payload = {
      name: formData.name.trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      vehicleId: formData.vehicleId || null,
      basePi,
      targetPi: buildMode === 'ai' ? targetPi : null,
      totalPi: confirmedPi,
      generationMode: buildMode === 'ai' ? 'ai' : 'manual',
      raceType: buildMode === 'ai' ? aiRaceType : null,
      driveType: buildMode === 'ai' ? aiDriveType : (upgradeShop?.effectiveDriveType || upgradeShop?.baseDriveType || null),
      tires: { ...formData.tires },
      suspension: { ...formData.suspension },
      drivetrain: { ...formData.drivetrain },
      brakes: { ...formData.brakes },
      aero: { ...formData.aero },
      parts: { ...formData.parts },
      freeMode: !!formData.freeMode,
      notes: formData.notes || ''
    }

    setLoading(true)
    try {
      const url = editingTune ? '/api/tunes/' + editingTune : '/api/tunes'
      const method = editingTune ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.errors?.join('\n') || result.error || '保存失败')
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
      await fetch('/api/tunes/' + id, { method: 'DELETE' })
      await loadTunes()
      if (expandedTune === id) setExpandedTune(null)
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
        driveType: tune.driveType || null,
        tires: { ...tune.tires },
        suspension: { ...tune.suspension },
        drivetrain: { ...tune.drivetrain },
        brakes: { ...tune.brakes },
        aero: { ...tune.aero },
        parts: { ...tune.parts },
        freeMode: !!tune.freeMode
      }
      const res = await fetch('/api/tunes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('复制失败')
      await loadTunes()
      // 获取新建调校的ID，打开编辑
      const newTune = await res.json()
      if (newTune && newTune.id) {
        // 加载最新列表后找到新调校并进入编辑
        const updatedTunes = await fetch('/api/tunes').then(r => r.ok ? r.json() : [])
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
      freeMode: !!tune.freeMode,
      notes: tune.notes || ''
    })
    // 已保存方案的 basePi 由服务端按车辆原厂档案计算；加载档案后还会再次校正。
    setBasePi(tune.basePi || 500)
    setSolutionPi(Number.isFinite(Number(tune.totalPi)) ? String(tune.totalPi) : null)
    const savedTargetPi = Number(tune.targetPi)
    setTargetPi(PI_CLASS_CAPS.includes(savedTargetPi) ? savedTargetPi : nextPiClassCap(tune.basePi || 500))
    setEditingTune(tune.id)
    setWizardStep(4)
    setBuildMode(tune.generationMode === 'ai' ? 'ai' : 'manual')
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
    setFormData(createDefaultFormData())
    setEditingTune(null)
    setWizardStep(1)
    setBuildMode(null)
    setAiRaceType('road')
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
    setBuildMode(null)
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
    setTelemetrySuggestions(null)
    setHighlightedParams([])
  }

  const selectVehicleForDraft = (vehicleId) => {
    draftVersionRef.current += 1
    setFormData({ ...createDefaultFormData(), vehicleId })
    setBuildMode(null)
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
  }

  const chooseBuildMode = mode => {
    draftVersionRef.current += 1
    setFormData(prev => ({
      ...createDefaultFormData(),
      vehicleId: prev.vehicleId,
      name: prev.name,
      tags: prev.tags,
      notes: prev.notes
    }))
    setSolutionPi(null)
    setUpgradeShop(null)
    dirtyParamsRef.current.clear()
    setBuildMode(mode)
    refreshUpgradeShop(formData.vehicleId, {})
    if (mode === 'manual') setWizardStep(3)
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

  const toggleExpand = (id) => {
    setExpandedTune(expandedTune === id ? null : id)
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
      const res = await fetch(`/api/tunes/compare?tuneIdA=${tuneA}&tuneIdB=${tuneB}&trackId=${encodeURIComponent(compareTrackId)}`)
      if (!res.ok) throw new Error('对比失败')
      const data = await res.json()
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
          mapped[`${path[0]}.${path[1]}`] = value
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

  // 配件选择处理（Round 9: 对比解锁参数）
  const TUNE_PARAM_LABELS = {
    'tire_camber_front': '前外倾角', 'tire_camber_rear': '后外倾角',
    'tire_toe_front': '前束角', 'tire_toe_rear': '后束角',
    'caster_front': '主销后倾角',
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
        tier: tier || undefined,
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

    setFormData(prev => ({
      ...prev,
      parts: newParts
    }))
    refreshUpgradeShop(formData.vehicleId, newParts, buildMode === 'ai' ? aiDriveType : null)
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
        aero: tune.aero || {},
        parts: tune.parts || {}
      }
      const res = await fetch('/api/tunes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('导入失败')
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
      const res = await fetch('/api/tunes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tune)
      })
      if (!res.ok) throw new Error('导入失败')
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
    } else if (raceType === 'dirt') {
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
      frontSpring: raceType === 'cross_country' ? 45.0 : raceType === 'dirt' ? 60.0 : 95.0,
      rearSpring: raceType === 'cross_country' ? 40.0 : raceType === 'dirt' ? 50.0 : 80.0,
      frontDamping: raceType === 'cross_country' ? 4.5 : raceType === 'dirt' ? 5.5 : 8.5,
      rearDamping: raceType === 'cross_country' ? 4.0 : raceType === 'dirt' ? 5.0 : 7.5,
      frontARB: raceType === 'cross_country' ? 8.0 : raceType === 'dirt' ? 10.0 : 15.0,
      rearARB: raceType === 'cross_country' ? 30.0 : raceType === 'dirt' ? 35.0 : 40.0,
      frontRideHeight: raceType === 'cross_country' ? 18.0 : raceType === 'dirt' ? 15.0 : 8.0,
      rearRideHeight: raceType === 'cross_country' ? 18.5 : raceType === 'dirt' ? 15.5 : 8.5
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
    expandedTune,
    setExpandedTune,
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
    setAutoUpgradeLoading,
    wizardStep,
    setWizardStep,
    buildMode,
    setBuildMode,
    selectVehicleForDraft,
    chooseBuildMode,
    aiRaceType,
    setAiRaceType,
    aiDriveType,
    setAiDriveType,
    drivingProblemsOpen,
    setDrivingProblemsOpen,
    selectedProblem,
    setSelectedProblem,
    activeTune,
    setActiveTune,
    activeTuneLoading,
    setActiveTuneLoading,
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
    loadTunes,
    loadVehicles,
    loadTracks,
    loadTuneSessionStats,
    loadActiveTune,
    setActiveTuneById,
    clearActiveTune,
    saveTune,
    deleteTune,
    duplicateTune,
    startEdit,
    startCreate,
    closeModal,
    toggleExpand,
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
