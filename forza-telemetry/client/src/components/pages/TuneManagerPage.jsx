import { useState, useEffect, useMemo, useRef } from 'react'
import { EmptyState } from '../shared/EmptyState'
import {
  PART_CATEGORIES,
  PART_TIERS,
  TIER_INFO,
  getDefaultParts,
  getTuneParamConstraints,
  getPartOptionDetail,
  getTuneConstraints,
  getTuneDefaults,
  autoUpgradeToPi,
  calculateTotalPi
} from '../../data/parts'
import { DRIVING_PROBLEMS, diagnoseFromTelemetry, PROBLEM_CATEGORIES } from '../../data/tunePresets'

// fixes 扁平 key 到 suggestedChanges 嵌套路径的映射
const FIX_PARAM_MAP = {
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

const defaultFormData = {
  name: '',
  tags: '',
  vehicleId: '',
  tires: {
    frontPressure: 30.0,
    rearPressure: 30.0,
    frontCamber: -1.0,
    rearCamber: -1.0,
    frontToe: 0.0,
    rearToe: 0.0
  },
  suspension: {
    frontSpring: 10.0,
    rearSpring: 10.0,
    frontDamping: 5.0,
    rearDamping: 5.0,
    frontARB: 20.0,
    rearARB: 20.0,
    frontRideHeight: 10.0,
    rearRideHeight: 10.0
  },
  drivetrain: {
    diffAccel: 50,
    diffDecel: 50,
    diffCenter: 50,
    finalDrive: 4.0,
    gear1: 3.5,
    gear2: 2.5,
    gear3: 1.8,
    gear4: 1.4,
    gear5: 1.1,
    gear6: 0.9
  },
  aero: {
    frontDownforce: 100,
    rearDownforce: 200
  },
  parts: getDefaultParts(),
  notes: ''
}

export function TuneManagerPage({ onNavigate }) {
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
  const [formData, setFormData] = useState(defaultFormData)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelected, setCompareSelected] = useState([])
  const [compareResult, setCompareResult] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareTrackId, setCompareTrackId] = useState('')
  const [shareCodeModal, setShareCodeModal] = useState(null)
  // Round 4: 导入预览状态
  const [importPreview, setImportPreview] = useState(null)
  const importFileRef = useRef(null)

  // Round 2: 记录用户手动修改过的参数（嵌套路径如 "tires.frontPressure"）
  const dirtyParamsRef = useRef(new Set())

  // Round 9: 参数分组折叠状态
  const [collapsedSections, setCollapsedSections] = useState(new Set())

  // PI锁定与自动升级相关
  const [targetPi, setTargetPi] = useState(800)
  const [basePi, setBasePi] = useState(500)
  const [autoUpgradeLoading, setAutoUpgradeLoading] = useState(false)

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

  useEffect(() => {
    loadTunes()
    loadVehicles()
    loadTracks()
    loadActiveTune()
    loadTuneSessionStats()
  }, [])

  // 根据配件计算PI增量
  const partsPiDelta = useMemo(() => {
    try {
      const total = calculateTotalPi(basePi, formData.parts);
      return total - basePi;
    } catch (e) {
      return 0
    }
  }, [formData.parts, basePi])

  const totalPi = useMemo(() => {
    return basePi + partsPiDelta
  }, [basePi, partsPiDelta])

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
    spring_front: ['suspension', 'frontSpring'],
    spring_rear: ['suspension', 'rearSpring'],
    damping_front: ['suspension', 'frontDamping'],
    damping_rear: ['suspension', 'rearDamping'],
    arb_front: ['suspension', 'frontARB'],
    arb_rear: ['suspension', 'rearARB'],
    ride_height_front: ['suspension', 'frontRideHeight'],
    ride_height_rear: ['suspension', 'rearRideHeight'],
    diff_accel: ['drivetrain', 'diffAccel'],
    diff_decel: ['drivetrain', 'diffDecel'],
    diff_center: ['drivetrain', 'diffCenter'],
    final_drive: ['drivetrain', 'finalDrive'],
    gear_1: ['drivetrain', 'gear1'],
    gear_2: ['drivetrain', 'gear2'],
    gear_3: ['drivetrain', 'gear3'],
    gear_4: ['drivetrain', 'gear4'],
    gear_5: ['drivetrain', 'gear5'],
    gear_6: ['drivetrain', 'gear6'],
    downforce_front: ['aero', 'frontDownforce'],
    downforce_rear: ['aero', 'rearDownforce'],
  };

  // 配件变更时自动更新推荐调校默认值（Round 2: 跳过用户手动修改过的参数）
  useEffect(() => {
    if (!formData.parts) return
    try {
      const defaults = getTuneDefaults(formData.parts, currentVehicleStats)
      if (defaults) {
        // 将扁平 key 映射为嵌套结构后 merge 到 formData
        const mapped = { tires: {}, suspension: {}, drivetrain: {}, aero: {} };
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
          aero: { ...prev.aero, ...mapped.aero }
        }))
      }
    } catch (e) {
      // getTuneDefaults 可能尚未就绪或参数不匹配，静默忽略
    }
  }, [formData.parts, currentVehicleStats])

  // 一键升级到目标PI
  const handleAutoUpgrade = () => {
    try {
      setAutoUpgradeLoading(true)
      const result = autoUpgradeToPi(formData.parts, basePi, targetPi)
      if (result && result.parts) {
        setFormData(prev => ({
          ...prev,
          parts: result.parts
        }))
      } else {
        alert('无法在目标PI限制内找到升级方案')
      }
    } catch (e) { /* 一键升级失败 */
      alert('一键升级失败: ' + e.message)
    } finally {
      setAutoUpgradeLoading(false)
    }
  }

  // 选择车辆时更新basePi和初始配件
  useEffect(() => {
    if (formData.vehicleId && vehicles[formData.vehicleId]) {
      const v = vehicles[formData.vehicleId]
      if (v.basePi) setBasePi(v.basePi)
      if (v.pi) setBasePi(v.pi)
      // 尝试从车辆数据获取初始配件
      if (v.parts) {
        setFormData(prev => ({
          ...prev,
          parts: { ...getDefaultParts(), ...v.parts }
        }))
      }
    }
  }, [formData.vehicleId, vehicles])

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

      // 调用诊断函数（返回数组格式）
      const rawResult = diagnoseFromTelemetry(telemetryData, formData)

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

    const payload = {
      name: formData.name.trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      vehicleId: formData.vehicleId || null,
      tires: { ...formData.tires },
      suspension: { ...formData.suspension },
      drivetrain: { ...formData.drivetrain },
      aero: { ...formData.aero },
      parts: { ...formData.parts },
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
      if (!res.ok) throw new Error('保存失败')
      await loadTunes()
      closeModal()
    } catch (e) { /* 保存调校失败 */
      alert('保存失败，请检查网络连接')
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
        tires: { ...tune.tires },
        suspension: { ...tune.suspension },
        drivetrain: { ...tune.drivetrain },
        aero: { ...tune.aero },
        parts: { ...tune.parts }
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
      aero: { ...defaultFormData.aero, ...(tune.aero || {}) },
      parts: { ...getDefaultParts(), ...(tune.parts || {}) },
      notes: tune.notes || ''
    })
    // 设置PI相关
    if (tune.vehicleId && vehicles[tune.vehicleId]) {
      const v = vehicles[tune.vehicleId]
      const pi = v.basePi || v.pi || 500
      setBasePi(pi)
      setTargetPi(pi + 300)
    } else {
      setBasePi(tune.basePi || 500)
      setTargetPi(tune.targetPi || 800)
    }
    setEditingTune(tune.id)
    setShowModal(true)
    setDrivingProblemsOpen(false)
    setSelectedProblem(null)
    setTelemetryPanelOpen(false)
    setDiagnosisResult(null)
    setSelectedSessionId('')
    dirtyParamsRef.current.clear()
  }

  const startCreate = () => {
    setFormData({ ...defaultFormData })
    setEditingTune(null)
    setShowModal(true)
    setBasePi(500)
    setTargetPi(800)
    setDrivingProblemsOpen(false)
    setSelectedProblem(null)
    setTelemetryPanelOpen(false)
    setDiagnosisResult(null)
    setSelectedSessionId('')
    dirtyParamsRef.current.clear()
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingTune(null)
    setFormData({ ...defaultFormData })
    dirtyParamsRef.current.clear()
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
      for (const category of ['tires', 'suspension', 'drivetrain', 'aero']) {
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
    'spring_front': '前弹簧硬度', 'spring_rear': '后弹簧硬度',
    'damping_front': '前阻尼', 'damping_rear': '后阻尼',
    'arb_front': '前防倾杆', 'arb_rear': '后防倾杆',
    'ride_height_front': '前车身高度', 'ride_height_rear': '后车身高度',
    'diff_accel': '差速器加速', 'diff_decel': '差速器减速', 'diff_center': '中央差速器',
    'gear_1': '1档齿比', 'gear_2': '2档齿比', 'gear_3': '3档齿比',
    'gear_4': '4档齿比', 'gear_5': '5档齿比', 'gear_6': '6档齿比',
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
  }

  // 根据当前配件计算调校参数约束
  const tuneConstraints = useMemo(() => {
    const rawConstraints = getTuneParamConstraints(formData.parts);

    // getTuneConstraints 返回扁平 key（如 tire_pressure_front），
    // UI 使用嵌套路径（如 tires.frontPressure），这里做映射转换
    const PARAM_KEY_MAP = {
      'tire_pressure_front': 'tires.frontPressure',
      'tire_pressure_rear': 'tires.rearPressure',
      'tire_camber_front': 'tires.frontCamber',
      'tire_camber_rear': 'tires.rearCamber',
      'tire_toe_front': 'tires.frontToe',
      'tire_toe_rear': 'tires.rearToe',
      'spring_front': 'suspension.frontSpring',
      'spring_rear': 'suspension.rearSpring',
      'damping_front': 'suspension.frontDamping',
      'damping_rear': 'suspension.rearDamping',
      'arb_front': 'suspension.frontARB',
      'arb_rear': 'suspension.rearARB',
      'ride_height_front': 'suspension.frontRideHeight',
      'ride_height_rear': 'suspension.rearRideHeight',
      'diff_accel': 'drivetrain.diffAccel',
      'diff_decel': 'drivetrain.diffDecel',
      'diff_center': 'drivetrain.diffCenter',
      'final_drive': 'drivetrain.finalDrive',
      'gear_1': 'drivetrain.gear1', 'gear_2': 'drivetrain.gear2',
      'gear_3': 'drivetrain.gear3', 'gear_4': 'drivetrain.gear4',
      'gear_5': 'drivetrain.gear5', 'gear_6': 'drivetrain.gear6',
      'downforce_front': 'aero.frontDownforce',
      'downforce_rear': 'aero.rearDownforce'
    };

    const mapped = {};
    for (const [flatKey, constraint] of Object.entries(rawConstraints)) {
      const dotPath = PARAM_KEY_MAP[flatKey];
      if (dotPath) {
        mapped[dotPath] = constraint;
      } else {
        // 未知 key 保持原样
        mapped[flatKey] = constraint;
      }
    }
    return mapped;
  }, [formData.parts])

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
    return {
      defaultValue: tuneDefaults[key],
      highlighted: highlightedParams.includes(key),
      onResetDefault: () => resetParamToDefault(category, field),
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

  return (
    <div style={{ padding: 8, height: 'calc(100vh - 60px)', overflow: 'auto', background: '#0d1117' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8, padding: '0 6px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>调校管理</h2>
          <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>
            {tunes.length} 个调校方案
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={toggleCompareMode}
            style={compareMode ? { ...btnPrimaryStyle, background: '#58a6ff', padding: '4px 10px', fontSize: 10 } : { ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}
          >
            {compareMode ? '退出' : '对比'}
          </button>
          <button onClick={() => importFileRef.current?.click()} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            导入
          </button>
          <button onClick={() => setShareCodeModal('input')} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            分享码
          </button>
          <button onClick={startCreate} style={{ ...btnPrimaryStyle, padding: '4px 12px', fontSize: 11 }}>
            + 新建
          </button>
        </div>
      </div>
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {/* 搜索与筛选栏 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="按名称搜索..."
          style={{ ...inputStyle, width: 180, marginBottom: 0 }}
        />
        <select
          value={vehicleFilter}
          onChange={e => setVehicleFilter(e.target.value)}
          style={{ ...inputStyle, width: 160, marginBottom: 0 }}
        >
          <option value="">全部车辆</option>
          {vehicleOptions.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          style={{ ...inputStyle, width: 140, marginBottom: 0 }}
        >
          <option value="">全部标签</option>
          {allTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        {(searchQuery || vehicleFilter || tagFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setVehicleFilter(''); setTagFilter('') }}
            style={btnSmallStyle}
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Round 4: 当前活跃调校 */}
      {activeTune && (
        <div style={{
          background: 'rgba(35, 134, 54, 0.1)',
          border: '1px solid rgba(35, 134, 54, 0.35)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>当前活跃调校:</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--success)' }}>{activeTune.name}</span>
            {activeTune.vehicleId && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                / {getVehicleName(activeTune.vehicleId)}
              </span>
            )}
          </div>
          <button
            onClick={clearActiveTune}
            style={{
              ...btnSmallStyle,
              background: 'rgba(218, 54, 51, 0.15)',
              borderColor: 'rgba(218, 54, 51, 0.3)',
              color: '#da3633'
            }}
          >
            取消活跃
          </button>
        </div>
      )}

      {/* 对比控制栏 */}
      {compareMode && (
        <div style={{
          background: compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.15)' : 'rgba(210, 153, 34, 0.12)',
          border: `1px solid ${compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.4)' : 'rgba(210, 153, 34, 0.35)'}`,
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>已选择: </span>
              <span style={{ fontWeight: 700, color: compareSelected.length === 2 ? 'var(--success)' : 'var(--warning)' }}>
                {compareSelected.length}/2
              </span>
              {compareSelected.length === 2 && (
                <span style={{ color: 'var(--success)', marginLeft: 8 }}>可以开始对比</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>赛道:</span>
              <select
                value={compareTrackId}
                onChange={e => setCompareTrackId(e.target.value)}
                style={{ ...inputStyle, width: 180, marginBottom: 0, padding: '4px 6px', fontSize: 11 }}
              >
                <option value="">-- 选择赛道 --</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.trackName || t.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {compareSelected.length > 0 && (
              <button onClick={clearCompare} style={btnSmallStyle}>清除选择</button>
            )}
            <button
              onClick={runCompare}
              disabled={compareSelected.length !== 2 || !compareTrackId || compareLoading}
              style={compareSelected.length === 2 && compareTrackId ? btnPrimaryStyle : { ...btnPrimaryStyle, opacity: 0.5, cursor: 'not-allowed' }}
            >
              {compareLoading ? '对比中...' : '开始对比'}
            </button>
          </div>
        </div>
      )}

      {/* 对比结果 */}
      {compareResult && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>调校对比结果</h3>
            <button onClick={() => setCompareResult(null)} style={btnSmallStyle}>关闭</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>指标</div>
            <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{compareResult.tuneAName || '调校A'}</div>
            <div style={{ fontWeight: 700, color: 'var(--warning)' }}>{compareResult.tuneBName || '调校B'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>最佳圈速</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{compareResult.tuneA?.bestLap ? formatTime(compareResult.tuneA.bestLap) : '-'}</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{compareResult.tuneB?.bestLap ? formatTime(compareResult.tuneB.bestLap) : '-'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>平均圈速</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.avgLap ? formatTime(compareResult.tuneA.avgLap) : '-'}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.avgLap ? formatTime(compareResult.tuneB.avgLap) : '-'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>总圈数</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.totalLaps || 0}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.totalLaps || 0}</div>

            <div style={{ color: 'var(--text-secondary)' }}>比赛次数</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.sessionCount || 0}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.sessionCount || 0}</div>
          </div>
          {compareResult.winner && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(35, 134, 54, 0.15)',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--success)',
              textAlign: 'center'
            }}>
              {compareResult.winner === 'A' ? compareResult.tuneAName : compareResult.tuneBName} 更快，领先 {formatTime(compareResult.diff)}
            </div>
          )}
        </div>
      )}

      {/* 调校卡片列表 */}
      {filteredTunes.length === 0 ? (
        <EmptyState
          icon="🔧"
          title={tunes.length === 0 ? '暂无调校方案' : '没有匹配的调校方案'}
          description={tunes.length === 0 ? '点击"新建调校"创建第一个方案。' : '尝试调整筛选条件。'}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12
        }}>
          {filteredTunes.map(tune => (
            <div
              key={tune.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 14,
                transition: 'all 0.15s'
              }}
            >
              {/* 卡片头部 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                {compareMode && (
                  <div
                    onClick={() => toggleSelectForCompare(tune.id)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: `2px solid ${compareSelected.includes(tune.id) ? 'var(--accent)' : 'var(--border)'}`,
                      background: compareSelected.includes(tune.id) ? 'var(--accent)' : 'transparent',
                      marginRight: 10,
                      flexShrink: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: '#fff',
                      fontWeight: 700
                    }}
                  >
                    {compareSelected.includes(tune.id) ? '✓' : ''}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {tune.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(tune.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => duplicateTune(tune)} style={btnSmallStyle}>复制</button>
                  <button onClick={() => exportTune(tune)} style={btnSmallStyle}>导出</button>
                  <button onClick={() => {
                    const code = generateShareCode(tune)
                    if (code) {
                      navigator.clipboard?.writeText(code).then(() => alert('分享码已复制到剪贴板')).catch(() => alert(code))
                    }
                  }} style={btnSmallStyle}>分享码</button>
                  <button onClick={() => startEdit(tune)} style={btnSmallStyle}>编辑</button>
                  <button
                    onClick={() => setActiveTuneById(tune.id)}
                    disabled={activeTuneLoading || (activeTune && activeTune.id === tune.id)}
                    style={{
                      ...btnSmallStyle,
                      background: (activeTune && activeTune.id === tune.id) ? 'rgba(35, 134, 54, 0.15)' : 'var(--bg-tertiary)',
                      borderColor: (activeTune && activeTune.id === tune.id) ? 'rgba(35, 134, 54, 0.3)' : 'var(--border)',
                      color: (activeTune && activeTune.id === tune.id) ? '#3fb950' : 'var(--text-primary)'
                    }}
                  >
                    {activeTune && activeTune.id === tune.id ? '活跃中' : '设为活跃'}
                  </button>
                  <button onClick={() => deleteTune(tune.id)} style={btnDangerSmallStyle}>删除</button>
                </div>
              </div>

              {/* 标签 */}
              {(tune.tags || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {tune.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 车辆信息 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 10,
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{ color: 'var(--text-muted)' }}>适用车辆:</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{getVehicleName(tune.vehicleId)}</span>
              </div>

              {/* Round 6: 调校与比赛关联统计 */}
              {tuneSessionStats[tune.id] && (() => {
                const st = tuneSessionStats[tune.id];
                return (
                  <div style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    marginBottom: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 6,
                    fontSize: 10
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>比赛次数</div>
                      <div style={{ fontWeight: 700, color: '#58a6ff', fontFamily: 'monospace' }}>{st.count}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>最佳圈速</div>
                      <div style={{ fontWeight: 700, color: '#d29922', fontFamily: 'monospace' }}>
                        {st.bestLap < Infinity ? formatTime(st.bestLap) : '-'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>总圈数</div>
                      <div style={{ fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>{st.totalLaps}</div>
                    </div>
                    {/* Round 6: 跳转到比赛记录 */}
                    {st.sessions.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <button
                          onClick={() => onNavigate && onNavigate('sessions', { trackName: st.sessions[0].trackName })}
                          style={{ fontSize: 9, color: '#58a6ff', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 3, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          查看使用该调校的比赛记录 ({st.count}) &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 操作栏 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => toggleExpand(tune.id)}
                  style={btnSmallStyle}
                >
                  {expandedTune === tune.id ? '收起详情' : '展开详情'}
                </button>
              </div>

              {/* 详情展开区域 */}
              {expandedTune === tune.id && (() => {
                // Round 5: 计算调校默认值用于差异对比
                const tuneDefaultsForView = (() => {
                  try {
                    const parts = tune.parts || getDefaultParts()
                    const v = tune.vehicleId && vehicles[tune.vehicleId]
                    const stats = v ? (v.stats || v.carStats || null) : null
                    const raw = getTuneDefaults(parts, stats)
                    if (!raw) return {}
                    const mapped = {}
                    for (const [flatKey, value] of Object.entries(raw)) {
                      const path = TUNE_DEFAULT_KEY_MAP[flatKey]
                      if (path) mapped[`${path[0]}.${path[1]}`] = value
                    }
                    return mapped
                  } catch (e) { return {} }
                })()

                return (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {/* 配件改装摘要 */}
                  {tune.parts && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: '#8b949e',
                        marginBottom: 8, borderBottom: '1px solid #21262d', paddingBottom: 4
                      }}>
                        改装配件
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                        {PART_CATEGORIES.map(cat => {
                          const part = tune.parts[cat.id]
                          const isStock = cat.tierSystem
                            ? (!part?.tier || part.tier === PART_TIERS.STOCK)
                            : (!part?.optionId || part.optionId === 'stock')
                          const detail = getPartOptionDetail(cat.id, part)
                          return (
                            <div key={cat.id} style={{
                              fontSize: 9,
                              color: isStock ? 'var(--text-muted)' : 'var(--text-primary)',
                              background: isStock ? 'transparent' : 'var(--bg-tertiary)',
                              padding: '3px 6px', borderRadius: 3,
                              display: 'flex', alignItems: 'center', gap: 3
                            }}>
                              <span>{cat.icon}</span>
                              <span style={{ fontWeight: isStock ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {detail?.label || cat.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Round 5: 轮胎参数 - 蓝色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #58a6ff', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#58a6ff', marginBottom: 8 }}>
                      轮胎参数
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前胎压" value={tune.tires?.frontPressure} unit="PSI" defaultValue={tuneDefaultsForView['tires.frontPressure']} />
                      <ParamItem label="后胎压" value={tune.tires?.rearPressure} unit="PSI" defaultValue={tuneDefaultsForView['tires.rearPressure']} />
                      <ParamItem label="前外倾角" value={tune.tires?.frontCamber} unit="deg" defaultValue={tuneDefaultsForView['tires.frontCamber']} />
                      <ParamItem label="后外倾角" value={tune.tires?.rearCamber} unit="deg" defaultValue={tuneDefaultsForView['tires.rearCamber']} />
                      <ParamItem label="前束角" value={tune.tires?.frontToe} unit="deg" defaultValue={tuneDefaultsForView['tires.frontToe']} />
                      <ParamItem label="后束角" value={tune.tires?.rearToe} unit="deg" defaultValue={tuneDefaultsForView['tires.rearToe']} />
                    </div>
                  </div>

                  {/* Round 5: 悬挂参数 - 橙色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #d29922', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#d29922', marginBottom: 8 }}>
                      悬挂参数
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前弹簧硬度" value={tune.suspension?.frontSpring} defaultValue={tuneDefaultsForView['suspension.frontSpring']} />
                      <ParamItem label="后弹簧硬度" value={tune.suspension?.rearSpring} defaultValue={tuneDefaultsForView['suspension.rearSpring']} />
                      <ParamItem label="前阻尼" value={tune.suspension?.frontDamping} defaultValue={tuneDefaultsForView['suspension.frontDamping']} />
                      <ParamItem label="后阻尼" value={tune.suspension?.rearDamping} defaultValue={tuneDefaultsForView['suspension.rearDamping']} />
                      <ParamItem label="前防倾杆" value={tune.suspension?.frontARB} defaultValue={tuneDefaultsForView['suspension.frontARB']} />
                      <ParamItem label="后防倾杆" value={tune.suspension?.rearARB} defaultValue={tuneDefaultsForView['suspension.rearARB']} />
                      <ParamItem label="前车身高度" value={tune.suspension?.frontRideHeight} unit="cm" defaultValue={tuneDefaultsForView['suspension.frontRideHeight']} />
                      <ParamItem label="后车身高度" value={tune.suspension?.rearRideHeight} unit="cm" defaultValue={tuneDefaultsForView['suspension.rearRideHeight']} />
                    </div>
                  </div>

                  {/* Round 5: 传动系统 - 绿色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #3fb950', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#3fb950', marginBottom: 8 }}>
                      传动系统
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="差速器加速" value={tune.drivetrain?.diffAccel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffAccel']} />
                      <ParamItem label="差速器减速" value={tune.drivetrain?.diffDecel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffDecel']} />
                      <ParamItem label="中央差速器" value={tune.drivetrain?.diffCenter} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffCenter']} />
                      <ParamItem label="终传比" value={tune.drivetrain?.finalDrive} defaultValue={tuneDefaultsForView['drivetrain.finalDrive']} />
                    </div>
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <ParamItem label="1档齿比" value={tune.drivetrain?.gear1} defaultValue={tuneDefaultsForView['drivetrain.gear1']} />
                      <ParamItem label="2档齿比" value={tune.drivetrain?.gear2} defaultValue={tuneDefaultsForView['drivetrain.gear2']} />
                      <ParamItem label="3档齿比" value={tune.drivetrain?.gear3} defaultValue={tuneDefaultsForView['drivetrain.gear3']} />
                      <ParamItem label="4档齿比" value={tune.drivetrain?.gear4} defaultValue={tuneDefaultsForView['drivetrain.gear4']} />
                      <ParamItem label="5档齿比" value={tune.drivetrain?.gear5} defaultValue={tuneDefaultsForView['drivetrain.gear5']} />
                      <ParamItem label="6档齿比" value={tune.drivetrain?.gear6} defaultValue={tuneDefaultsForView['drivetrain.gear6']} />
                    </div>
                  </div>

                  {/* Round 5: 空气动力学 - 紫色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #bc8cff', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#bc8cff', marginBottom: 8 }}>
                      空气动力学
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前下压力" value={tune.aero?.frontDownforce} unit="kg" defaultValue={tuneDefaultsForView['aero.frontDownforce']} />
                      <ParamItem label="后下压力" value={tune.aero?.rearDownforce} unit="kg" defaultValue={tuneDefaultsForView['aero.rearDownforce']} />
                    </div>
                  </div>

                  {/* Round 5: 调校笔记 */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>
                      调校笔记
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--text-primary)',
                      background: 'var(--bg-primary)', borderRadius: 4,
                      padding: 8, minHeight: 30, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                      {tune.notes || '暂无笔记'}
                    </div>
                  </div>

                  {/* Round 8: 赛道表现 + 调校历史 */}
                  {tuneSessionStats[tune.id]?.sessions?.length > 0 && (() => {
                    const st = tuneSessionStats[tune.id];
                    const trackPerf = {};
                    st.sessions.forEach(s => {
                      if (!s.trackName) return;
                      if (!trackPerf[s.trackName]) {
                        trackPerf[s.trackName] = { count: 0, bestLap: Infinity, totalLaps: 0 };
                      }
                      const tp = trackPerf[s.trackName];
                      tp.count++;
                      tp.totalLaps += s.laps?.count || 0;
                      if (s.laps?.best > 0 && s.laps.best < tp.bestLap) {
                        tp.bestLap = s.laps.best;
                      }
                    });
                    const trackEntries = Object.entries(trackPerf)
                      .filter(([, v]) => v.bestLap < Infinity)
                      .sort((a, b) => a[1].bestLap - b[1].bestLap);

                    return (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#58a6ff', marginBottom: 6 }}>
                          赛道表现 ({trackEntries.length} 条赛道)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 6, fontSize: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <div>赛道</div>
                          <div style={{ textAlign: 'right' }}>最佳圈速</div>
                          <div style={{ textAlign: 'right' }}>次数</div>
                        </div>
                        {trackEntries.slice(0, 8).map(([track, perf]) => (
                          <div key={track} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 6, fontSize: 10, padding: '4px 0', borderBottom: '1px solid #21262d', alignItems: 'center' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track}</div>
                            <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#d29922' }}>{formatTime(perf.bestLap)}</div>
                            <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{perf.count}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      {/* Round 9: 配件升级解锁提示 toast */}
      {unlockToast && (
        <div style={{
          position: 'fixed', top: 70, right: 20, zIndex: 9999,
          background: 'rgba(63, 185, 80, 0.95)', color: '#fff',
          padding: '8px 16px', borderRadius: 6,
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'toastSlideIn 0.3s ease-out'
        }}>
          {unlockToast}
        </div>
      )}

      {showModal && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ ...modalContentStyle, maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {editingTune ? '编辑调校' : '新建调校'}
              </h2>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* 基本信息 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>调校名称</label>
              <input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: 公路赛高速调校"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>标签（用逗号分隔）</label>
                <input
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="公路, 漂移, 拉力..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>适用车辆</label>
                <select
                  value={formData.vehicleId}
                  onChange={e => setFormData(prev => ({ ...prev, vehicleId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">未指定</option>
                  {vehicleOptions.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Round 5: 调校笔记 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>调校笔记</label>
              <textarea
                value={formData.notes || ''}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="记录这个调校的特点、适用场景、调校思路等..."
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  lineHeight: 1.6,
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Round 7: 配件推荐引擎 */}
            {formData.vehicleId && (
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                border: '1px solid var(--border)'
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#bc8cff',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>配件推荐</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>基于车辆类型和赛道特性</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                  {(() => {
                    const v = vehicles[formData.vehicleId];
                    const driveType = v?.driveType || v?.drivetrain || 'AWD';
                    const vClass = v?.class || 3;
                    const recommendations = [];
                    // 基于驱动类型的推荐
                    if (driveType === 'FWD') {
                      recommendations.push({ cat: ' diffs', text: '前驱车推荐较硬前弹簧和高前防倾杆，减少转向不足', color: '#58a6ff' });
                      recommendations.push({ cat: ' tires', text: '前驱车前轮承载更多，建议略高前胎压(32-34PSI)', color: '#58a6ff' });
                    } else if (driveType === 'RWD') {
                      recommendations.push({ cat: ' diffs', text: '后驱车推荐较低的差速器减速设定(15-30%)，增强弯中稳定性', color: '#3fb950' });
                      recommendations.push({ cat: ' diffs', text: '后驱车建议后弹簧比前弹簧略软，提升后轮抓地力', color: '#3fb950' });
                    } else if (driveType === 'AWD') {
                      recommendations.push({ cat: ' diffs', text: '全驱车推荐中等差速器设定(40-60%)，平衡加速和弯道表现', color: '#d29922' });
                    }
                    // 基于等级的推荐
                    if (vClass >= 5) {
                      recommendations.push({ cat: ' aero', text: '高等级(S1/S2)车辆建议加大下压力，优先增加后下压力', color: '#bc8cff' });
                      recommendations.push({ cat: ' brakes', text: '高速赛道建议升级刹车套件至赛用级别', color: '#f85149' });
                    } else if (vClass <= 2) {
                      recommendations.push({ cat: ' power', text: '低等级车辆建议优先升级引擎和进气，提升基础马力', color: '#3fb950' });
                    }
                    // 通用推荐
                    recommendations.push({ cat: ' general', text: '大多数赛道推荐中等偏硬的弹簧设定(6-14)，兼顾弯道支撑和路面颠簸吸收', color: 'var(--text-secondary)' });
                    return recommendations.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 8px', background: r.color + '08',
                        border: `1px solid ${r.color}22`,
                        borderRadius: 4
                      }}>
                        <span style={{ color: r.color, fontWeight: 700, flexShrink: 0 }}>{r.cat}</span>
                        <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{r.text}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* PI锁定区域 */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              border: '1px solid var(--border)'
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#d29922',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>PI 锁定区域</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: totalPi > targetPi ? '#da3633' : 'var(--success)'
                }}>
                  总PI: {totalPi} / {targetPi}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>基础PI</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {basePi}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>配件PI增量</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: partsPiDelta > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    +{partsPiDelta}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>总PI</div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, fontFamily: 'monospace',
                    color: totalPi > targetPi ? '#da3633' : 'var(--text-primary)'
                  }}>
                    {totalPi}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>目标PI上限</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range"
                      min={basePi}
                      max={1000}
                      step={1}
                      value={targetPi}
                      onChange={e => setTargetPi(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: '#d29922' }}
                    />
                    <input
                      type="number"
                      min={basePi}
                      max={1000}
                      value={targetPi}
                      onChange={e => {
                        const val = parseInt(e.target.value)
                        if (val >= basePi && val <= 1000) setTargetPi(val)
                      }}
                      style={{ ...inputStyle, width: 70, textAlign: 'center' }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleAutoUpgrade}
                  disabled={autoUpgradeLoading || totalPi >= targetPi}
                  style={{
                    ...btnPrimaryStyle,
                    background: autoUpgradeLoading ? '#484f58' : (totalPi >= targetPi ? '#484f58' : '#d29922'),
                    whiteSpace: 'nowrap',
                    marginTop: 14
                  }}
                >
                  {autoUpgradeLoading ? '升级中...' : (totalPi >= targetPi ? '已达上限' : '一键升级')}
                </button>
              </div>
              {totalPi > targetPi && (
                <div style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  background: 'rgba(218, 54, 51, 0.12)',
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#da3633'
                }}>
                  当前PI已超出目标上限 {totalPi - targetPi} 点，请降低配件等级或提高PI上限
                </div>
              )}
            </div>

            {/* 配件改装区域 */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              border: '1px solid var(--border)'
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>改装配件</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {PART_CATEGORIES.filter(c => {
                    const p = formData.parts[c.id]
                    if (c.tierSystem) return p?.tier && p.tier !== PART_TIERS.STOCK
                    return p?.optionId && p.optionId !== 'stock'
                  }).length} 项改装
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8
              }}>
                {PART_CATEGORIES.map(cat => {
                  const selectedPart = formData.parts[cat.id]
                  return <PartSelector
                    key={cat.id}
                    category={cat}
                    selected={selectedPart}
                    onChange={(tier, optionId) => updatePartSelection(cat.id, tier, optionId)}
                  />
                })}
              </div>
            </div>

            {/* 轮胎参数 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('tires')}>
                <span>{collapsedSections.has('tires') ? '▶ ' : '▼ '}轮胎参数</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('tires.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('tires') && <div style={formGridStyle}>
                <NumberInput
                  label="前胎压"
                  value={formData.tires.frontPressure}
                  onChange={v => updateFormField('tires', 'frontPressure', v)}
                  min={tuneConstraints['tires.frontPressure']?.min ?? 20}
                  max={tuneConstraints['tires.frontPressure']?.max ?? 40}
                  step={0.1}
                  unit="PSI"
                  locked={tuneConstraints['tires.frontPressure']?.locked}
                  {...ni('tires', 'frontPressure')}
                />
                <NumberInput
                  label="后胎压"
                  value={formData.tires.rearPressure}
                  onChange={v => updateFormField('tires', 'rearPressure', v)}
                  min={tuneConstraints['tires.rearPressure']?.min ?? 20}
                  max={tuneConstraints['tires.rearPressure']?.max ?? 40}
                  step={0.1}
                  unit="PSI"
                  locked={tuneConstraints['tires.rearPressure']?.locked}
                  {...ni('tires', 'rearPressure')}
                />
                <NumberInput
                  label="前外倾角"
                  value={formData.tires.frontCamber}
                  onChange={v => updateFormField('tires', 'frontCamber', v)}
                  min={tuneConstraints['tires.frontCamber']?.min ?? -5}
                  max={tuneConstraints['tires.frontCamber']?.max ?? 0}
                  step={tuneConstraints['tires.frontCamber']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.frontCamber']?.locked}
                  {...ni('tires', 'frontCamber')}
                />
                <NumberInput
                  label="后外倾角"
                  value={formData.tires.rearCamber}
                  onChange={v => updateFormField('tires', 'rearCamber', v)}
                  min={tuneConstraints['tires.rearCamber']?.min ?? -5}
                  max={tuneConstraints['tires.rearCamber']?.max ?? 0}
                  step={tuneConstraints['tires.rearCamber']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.rearCamber']?.locked}
                  {...ni('tires', 'rearCamber')}
                />
                <NumberInput
                  label="前束角"
                  value={formData.tires.frontToe}
                  onChange={v => updateFormField('tires', 'frontToe', v)}
                  min={tuneConstraints['tires.frontToe']?.min ?? -0.5}
                  max={tuneConstraints['tires.frontToe']?.max ?? 0.5}
                  step={tuneConstraints['tires.frontToe']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.frontToe']?.locked}
                  {...ni('tires', 'frontToe')}
                />
                <NumberInput
                  label="后束角"
                  value={formData.tires.rearToe}
                  onChange={v => updateFormField('tires', 'rearToe', v)}
                  min={tuneConstraints['tires.rearToe']?.min ?? -0.5}
                  max={tuneConstraints['tires.rearToe']?.max ?? 0.5}
                  step={tuneConstraints['tires.rearToe']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.rearToe']?.locked}
                  {...ni('tires', 'rearToe')}
                />
              </div>}
            </div>

            {/* 悬挂参数 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('suspension')}>
                <span>{collapsedSections.has('suspension') ? '▶ ' : '▼ '}悬挂参数</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('suspension.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('suspension') && <div style={formGridStyle}>
                <NumberInput
                  label="前弹簧硬度"
                  value={formData.suspension.frontSpring}
                  onChange={v => updateFormField('suspension', 'frontSpring', v)}
                  min={tuneConstraints['suspension.frontSpring']?.min ?? 1}
                  max={tuneConstraints['suspension.frontSpring']?.max ?? 100}
                  step={tuneConstraints['suspension.frontSpring']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontSpring']?.locked}
                  {...ni('suspension', 'frontSpring')}
                />
                <NumberInput
                  label="后弹簧硬度"
                  value={formData.suspension.rearSpring}
                  onChange={v => updateFormField('suspension', 'rearSpring', v)}
                  min={tuneConstraints['suspension.rearSpring']?.min ?? 1}
                  max={tuneConstraints['suspension.rearSpring']?.max ?? 100}
                  step={tuneConstraints['suspension.rearSpring']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearSpring']?.locked}
                  {...ni('suspension', 'rearSpring')}
                />
                <NumberInput
                  label="前阻尼"
                  value={formData.suspension.frontDamping}
                  onChange={v => updateFormField('suspension', 'frontDamping', v)}
                  min={tuneConstraints['suspension.frontDamping']?.min ?? 1}
                  max={tuneConstraints['suspension.frontDamping']?.max ?? 20}
                  step={tuneConstraints['suspension.frontDamping']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontDamping']?.locked}
                  {...ni('suspension', 'frontDamping')}
                />
                <NumberInput
                  label="后阻尼"
                  value={formData.suspension.rearDamping}
                  onChange={v => updateFormField('suspension', 'rearDamping', v)}
                  min={tuneConstraints['suspension.rearDamping']?.min ?? 1}
                  max={tuneConstraints['suspension.rearDamping']?.max ?? 20}
                  step={tuneConstraints['suspension.rearDamping']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearDamping']?.locked}
                  {...ni('suspension', 'rearDamping')}
                />
                <NumberInput
                  label="前防倾杆"
                  value={formData.suspension.frontARB}
                  onChange={v => updateFormField('suspension', 'frontARB', v)}
                  min={tuneConstraints['suspension.frontARB']?.min ?? 1}
                  max={tuneConstraints['suspension.frontARB']?.max ?? 50}
                  step={tuneConstraints['suspension.frontARB']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontARB']?.locked}
                  {...ni('suspension', 'frontARB')}
                />
                <NumberInput
                  label="后防倾杆"
                  value={formData.suspension.rearARB}
                  onChange={v => updateFormField('suspension', 'rearARB', v)}
                  min={tuneConstraints['suspension.rearARB']?.min ?? 1}
                  max={tuneConstraints['suspension.rearARB']?.max ?? 50}
                  step={tuneConstraints['suspension.rearARB']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearARB']?.locked}
                  {...ni('suspension', 'rearARB')}
                />
                <NumberInput
                  label="前车身高度"
                  value={formData.suspension.frontRideHeight}
                  onChange={v => updateFormField('suspension', 'frontRideHeight', v)}
                  min={tuneConstraints['suspension.frontRideHeight']?.min ?? 3}
                  max={tuneConstraints['suspension.frontRideHeight']?.max ?? 20}
                  step={tuneConstraints['suspension.frontRideHeight']?.step ?? 1}
                  unit="cm"
                  locked={tuneConstraints['suspension.frontRideHeight']?.locked}
                  {...ni('suspension', 'frontRideHeight')}
                />
                <NumberInput
                  label="后车身高度"
                  value={formData.suspension.rearRideHeight}
                  onChange={v => updateFormField('suspension', 'rearRideHeight', v)}
                  min={tuneConstraints['suspension.rearRideHeight']?.min ?? 3}
                  max={tuneConstraints['suspension.rearRideHeight']?.max ?? 20}
                  step={tuneConstraints['suspension.rearRideHeight']?.step ?? 1}
                  unit="cm"
                  locked={tuneConstraints['suspension.rearRideHeight']?.locked}
                  {...ni('suspension', 'rearRideHeight')}
                />
              </div>}
            </div>

            {/* 传动系统 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('drivetrain')}>
                <span>{collapsedSections.has('drivetrain') ? '▶ ' : '▼ '}传动系统</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('drivetrain.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('drivetrain') && <>
                <div style={formGridStyle}>
                <NumberInput
                  label="差速器加速"
                  value={formData.drivetrain.diffAccel}
                  onChange={v => updateFormField('drivetrain', 'diffAccel', v)}
                  min={tuneConstraints['drivetrain.diffAccel']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffAccel']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffAccel']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffAccel']?.locked}
                  {...ni('drivetrain', 'diffAccel')}
                />
                <NumberInput
                  label="差速器减速"
                  value={formData.drivetrain.diffDecel}
                  onChange={v => updateFormField('drivetrain', 'diffDecel', v)}
                  min={tuneConstraints['drivetrain.diffDecel']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffDecel']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffDecel']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffDecel']?.locked}
                  {...ni('drivetrain', 'diffDecel')}
                />
                <NumberInput
                  label="中央差速器"
                  value={formData.drivetrain.diffCenter}
                  onChange={v => updateFormField('drivetrain', 'diffCenter', v)}
                  min={tuneConstraints['drivetrain.diffCenter']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffCenter']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffCenter']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffCenter']?.locked}
                  {...ni('drivetrain', 'diffCenter')}
                />
                <NumberInput
                  label="终传比"
                  value={formData.drivetrain.finalDrive}
                  onChange={v => updateFormField('drivetrain', 'finalDrive', v)}
                  min={tuneConstraints['drivetrain.finalDrive']?.min ?? 2.0}
                  max={tuneConstraints['drivetrain.finalDrive']?.max ?? 6.0}
                  step={tuneConstraints['drivetrain.finalDrive']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.finalDrive']?.locked}
                  {...ni('drivetrain', 'finalDrive')}
                />
              </div>
              <div style={{ ...formGridStyle, marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <NumberInput
                  label="1档齿比"
                  value={formData.drivetrain.gear1}
                  onChange={v => updateFormField('drivetrain', 'gear1', v)}
                  min={tuneConstraints['drivetrain.gear1']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear1']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear1']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear1']?.locked}
                  {...ni('drivetrain', 'gear1')}
                />
                <NumberInput
                  label="2档齿比"
                  value={formData.drivetrain.gear2}
                  onChange={v => updateFormField('drivetrain', 'gear2', v)}
                  min={tuneConstraints['drivetrain.gear2']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear2']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear2']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear2']?.locked}
                  {...ni('drivetrain', 'gear2')}
                />
                <NumberInput
                  label="3档齿比"
                  value={formData.drivetrain.gear3}
                  onChange={v => updateFormField('drivetrain', 'gear3', v)}
                  min={tuneConstraints['drivetrain.gear3']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear3']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear3']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear3']?.locked}
                  {...ni('drivetrain', 'gear3')}
                />
                <NumberInput
                  label="4档齿比"
                  value={formData.drivetrain.gear4}
                  onChange={v => updateFormField('drivetrain', 'gear4', v)}
                  min={tuneConstraints['drivetrain.gear4']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear4']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear4']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear4']?.locked}
                  {...ni('drivetrain', 'gear4')}
                />
                <NumberInput
                  label="5档齿比"
                  value={formData.drivetrain.gear5}
                  onChange={v => updateFormField('drivetrain', 'gear5', v)}
                  min={tuneConstraints['drivetrain.gear5']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear5']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear5']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear5']?.locked}
                  {...ni('drivetrain', 'gear5')}
                />
                <NumberInput
                  label="6档齿比"
                  value={formData.drivetrain.gear6}
                  onChange={v => updateFormField('drivetrain', 'gear6', v)}
                  min={tuneConstraints['drivetrain.gear6']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear6']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear6']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear6']?.locked}
                  {...ni('drivetrain', 'gear6')}
                />
              </div>
              </>}
            </div>

            {/* 空气动力学 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('aero')}>
                <span>{collapsedSections.has('aero') ? '▶ ' : '▼ '}空气动力学</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('aero.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('aero') && <div style={formGridStyle}>
                <NumberInput
                  label="前下压力"
                  value={formData.aero.frontDownforce}
                  onChange={v => updateFormField('aero', 'frontDownforce', v)}
                  min={tuneConstraints['aero.frontDownforce']?.min ?? 0}
                  max={tuneConstraints['aero.frontDownforce']?.max ?? 500}
                  step={tuneConstraints['aero.frontDownforce']?.step ?? 1}
                  unit="kg"
                  locked={tuneConstraints['aero.frontDownforce']?.locked}
                  {...ni('aero', 'frontDownforce')}
                />
                <NumberInput
                  label="后下压力"
                  value={formData.aero.rearDownforce}
                  onChange={v => updateFormField('aero', 'rearDownforce', v)}
                  min={tuneConstraints['aero.rearDownforce']?.min ?? 0}
                  max={tuneConstraints['aero.rearDownforce']?.max ?? 500}
                  step={tuneConstraints['aero.rearDownforce']?.step ?? 1}
                  unit="kg"
                  locked={tuneConstraints['aero.rearDownforce']?.locked}
                  {...ni('aero', 'rearDownforce')}
                />
              </div>}
            </div>

            {/* 常用驾驶问题面板 + 遥测诊断面板 - 并排显示 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* 常用驾驶问题面板 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                border: '1px solid var(--border)'
              }}>
                <div
                  onClick={() => setDrivingProblemsOpen(!drivingProblemsOpen)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#58a6ff',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                  }}
                >
                  <span>常见问题调校</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{drivingProblemsOpen ? '▲ 收起' : '▼ 展开'}</span>
                </div>

                {drivingProblemsOpen && (
                  <div style={{ marginTop: 10 }}>
                    {/* 分类筛选 */}
                    <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Array.isArray(DRIVING_PROBLEMS) && (() => {
                        const categories = [...new Set(DRIVING_PROBLEMS.map(p => p.category).filter(Boolean))]
                        return categories.map(cat => {
                          const catInfo = PROBLEM_CATEGORIES.find(c => c.id === cat)
                          const label = catInfo?.label || cat
                          const color = catInfo?.color || 'var(--text-secondary)'
                          return (
                            <span key={cat} style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              borderRadius: 3,
                              background: `${color}18`,
                              color,
                              border: `1px solid ${color}40`
                            }}>
                              {label}
                            </span>
                          )
                        })
                      })()}
                    </div>

                    {/* 问题列表 */}
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      {Array.isArray(DRIVING_PROBLEMS) && DRIVING_PROBLEMS.map((problem, idx) => (
                        <div key={idx} style={{ marginBottom: 4 }}>
                          <div
                            onClick={() => setSelectedProblem(selectedProblem === idx ? null : idx)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 4,
                              background: selectedProblem === idx ? 'rgba(88, 166, 255, 0.12)' : 'var(--bg-secondary)',
                              border: `1px solid ${selectedProblem === idx ? 'rgba(88, 166, 255, 0.3)' : 'var(--border)'}`,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {problem.name || problem.problem}
                              </div>
                              {problem.category && (
                                <div style={{ fontSize: 8, marginTop: 1 }}>
                                  {(() => {
                                    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === problem.category)
                                    const catLabel = catInfo?.label || problem.category
                                    const catColor = catInfo?.color || 'var(--text-muted)'
                                    return <span style={{ color: catColor }}>{catLabel}</span>
                                  })()}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                              {selectedProblem === idx ? '▲' : '▼'}
                            </span>
                          </div>

                          {selectedProblem === idx && (
                            <div style={{
                              marginTop: 4,
                              padding: '8px 10px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: 4,
                              border: '1px solid var(--border)',
                              fontSize: 10
                            }}>
                              {problem.symptoms && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>症状</div>
                                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                    {problem.symptoms}
                                  </div>
                                </div>
                              )}
                              {problem.description && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>问题描述</div>
                                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                    {problem.description}
                                  </div>
                                </div>
                              )}
                              {(problem.suggestedChanges || problem.fixes) && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>建议修改</div>
                                  {problem.fixes ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                      {Object.entries(problem.fixes).map(([param, fix]) => (
                                        <div key={param} style={{
                                          padding: '2px 6px',
                                          background: 'var(--bg-primary)',
                                          borderRadius: 3,
                                          fontSize: 8,
                                          fontFamily: 'monospace',
                                          color: fix.delta > 0 ? '#3fb950' : '#f85149'
                                        }}>
                                          {param}: {fix.delta > 0 ? '+' : ''}{fix.delta}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                      {Object.entries(problem.suggestedChanges).map(([cat, params]) =>
                                        Object.entries(params).map(([key, val]) => (
                                          <div key={`${cat}.${key}`} style={{
                                            padding: '2px 6px',
                                            background: 'var(--bg-primary)',
                                            borderRadius: 3,
                                            fontSize: 8,
                                            fontFamily: 'monospace',
                                            color: 'var(--accent)'
                                          }}>
                                            {key}: {val}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(problem.suggestedChanges || problem.fixes) && (
                                <button
                                  onClick={() => applyProblemFix(problem)}
                                  style={{
                                    ...btnSmallStyle,
                                    width: '100%',
                                    background: 'rgba(88, 166, 255, 0.15)',
                                    borderColor: 'rgba(88, 166, 255, 0.3)',
                                    color: '#58a6ff',
                                    fontWeight: 600
                                  }}
                                >
                                  应用此建议
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 遥测诊断面板 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                border: '1px solid var(--border)'
              }}>
                <div
                  onClick={() => {
                    setTelemetryPanelOpen(!telemetryPanelOpen)
                    if (!telemetryPanelOpen) loadTelemetrySessions()
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#3fb950',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                  }}
                >
                  <span>遥测诊断</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{telemetryPanelOpen ? '▲ 收起' : '▼ 展开'}</span>
                </div>

                {telemetryPanelOpen && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>选择遥测Session</label>
                      <select
                        value={selectedSessionId}
                        onChange={e => {
                          setSelectedSessionId(e.target.value)
                          setDiagnosisResult(null)
                        }}
                        style={inputStyle}
                      >
                        <option value="">-- 请选择 --</option>
                        {availableSessions.map(session => (
                          <option key={session.id} value={session.id}>
                            {session.track || '未知赛道'} - {session.car || '未知车辆'} ({formatDate(session.date || session.createdAt)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={runTelemetryDiagnosis}
                      disabled={!selectedSessionId || diagnosing}
                      style={{
                        ...btnPrimaryStyle,
                        width: '100%',
                        background: diagnosing ? '#484f58' : '#238636',
                        marginBottom: 10
                      }}
                    >
                      {diagnosing ? '诊断中...' : '开始诊断'}
                    </button>

                    {diagnosisResult && (
                      <div style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        maxHeight: 350,
                        overflow: 'auto'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>
                          诊断结果
                        </div>
                        {diagnosisResult.summary && (
                          <div style={{
                            fontSize: 10,
                            color: 'var(--text-secondary)',
                            marginBottom: 8,
                            lineHeight: 1.5,
                            padding: '6px 8px',
                            background: diagnosisResult.issues && diagnosisResult.issues.length > 0
                              ? 'rgba(210, 153, 34, 0.1)' : 'rgba(35, 134, 54, 0.1)',
                            borderRadius: 4
                          }}>
                            {diagnosisResult.summary}
                          </div>
                        )}

                        {diagnosisResult.issues && diagnosisResult.issues.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>发现的问题</div>
                            {diagnosisResult.issues.map((issue, idx) => (
                              <div key={idx} style={{
                                fontSize: 10,
                                color: 'var(--text-primary)',
                                padding: '4px 8px',
                                marginBottom: 3,
                                background: 'var(--bg-primary)',
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}>
                                <span style={{ color: issue.severity === 'high' ? '#da3633' : '#d29922', fontSize: 10 }}>
                                  {issue.severity === 'high' ? '!!' : '!'}
                                </span>
                                <span>{issue.description || issue.message || issue}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>建议的参数修改</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                              {Object.entries(diagnosisResult.suggestedChanges).map(([cat, params]) =>
                                Object.entries(params).map(([key, val]) => (
                                  <div key={`${cat}.${key}`} style={{
                                    padding: '2px 6px',
                                    background: 'var(--bg-primary)',
                                    borderRadius: 3,
                                    fontSize: 8,
                                    fontFamily: 'monospace',
                                    color: 'var(--accent)'
                                  }}>
                                    {key}: {val}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                          <button
                            onClick={applyDiagnosisFix}
                            style={{
                              ...btnSmallStyle,
                              width: '100%',
                              background: 'rgba(63, 185, 80, 0.15)',
                              borderColor: 'rgba(63, 185, 80, 0.3)',
                              color: '#3fb950',
                              fontWeight: 600
                            }}
                          >
                            应用全部建议
                          </button>
                        )}
                        {/* Round 2: 重新诊断按钮 */}
                        <button
                          onClick={runTelemetryDiagnosis}
                          disabled={!selectedSessionId || diagnosing}
                          style={{
                            ...btnSmallStyle,
                            width: '100%',
                            marginTop: 4,
                            background: 'rgba(88, 166, 255, 0.15)',
                            borderColor: 'rgba(88, 166, 255, 0.3)',
                            color: '#58a6ff',
                            fontWeight: 600
                          }}
                        >
                          {diagnosing ? '诊断中...' : '重新诊断'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button onClick={saveTune} disabled={loading} style={{ ...btnPrimaryStyle, width: '100%', marginTop: 8 }}>
              {loading ? '保存中...' : (editingTune ? '保存修改' : '创建调校')}
            </button>
            {/* Round 9: 快捷键提示 */}
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', lineHeight: 1.6 }}>
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Esc</span> 关闭 &nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+S</span> 保存 &nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+D</span> 复制调校
            </div>
          </div>
        </div>
      )}

      {/* 分享码弹窗 */}
      {shareCodeModal && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShareCodeModal(null); setImportPreview(null); } }}>
          <div style={{ ...modalContentStyle, maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>通过分享码导入调校</h2>
              <button onClick={() => { setShareCodeModal(null); setImportPreview(null); }} style={{ ...btnSmallStyle, border: 'none' }}>关闭</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>分享码</label>
              <textarea
                id="shareCodeInput"
                placeholder="粘贴分享码..."
                rows={4}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (!code.trim()) return
                  // Round 4: 先预览
                  const preview = parseShareCode(code.trim())
                  if (preview && preview.error) {
                    alert(preview.error)
                  } else if (preview) {
                    setImportPreview(preview)
                  } else {
                    alert('分享码无效')
                  }
                }}
                style={{ ...btnSmallStyle, flex: 1, background: 'rgba(88, 166, 255, 0.15)', borderColor: 'rgba(88, 166, 255, 0.3)', color: '#58a6ff', fontWeight: 600 }}
              >
                预览调校
              </button>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (code.trim()) importFromShareCode(code.trim())
                }}
                style={{ ...btnPrimaryStyle, flex: 1 }}
              >
                直接导入
              </button>
            </div>

            {/* Round 4: 导入预览面板 */}
            {importPreview && (
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 6, padding: 10,
                border: '1px solid var(--border)',
                maxHeight: 350, overflow: 'auto'
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>
                  调校预览: {importPreview.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                  <div style={{ color: 'var(--text-secondary)' }}>车辆</div>
                  <div style={{ color: 'var(--text-primary)' }}>{importPreview.vehicleId || '未指定'}</div>

                  <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>轮胎参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9, marginTop: 6 }}>
                    {importPreview.tires ? Object.entries(importPreview.tires).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>悬挂参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.suspension ? Object.entries(importPreview.suspension).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>传动参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.drivetrain ? Object.entries(importPreview.drivetrain).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>空力参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.aero ? Object.entries(importPreview.aero).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const code = document.getElementById('shareCodeInput').value
                    if (code.trim()) importFromShareCode(code.trim())
                  }}
                  style={{
                    ...btnPrimaryStyle, width: '100%', marginTop: 10
                  }}
                >
                  确认导入
                </button>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              提示：在调校卡片上点击"分享码"按钮即可复制该调校的分享码。支持中文调校名称。
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes paramHighlight { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 12px rgba(63,185,80,0.8); } }
      `}</style>
    </div>
  )
}

function ParamItem({ label, value, unit = '', defaultValue }) {
  const displayValue = value !== undefined && value !== null ? value : '-'
  // Round 5: 计算与默认值的差异
  const diff = defaultValue !== undefined && value !== undefined && value !== null && value !== defaultValue ? value - defaultValue : null
  const diffStr = diff !== null
    ? (diff > 0 ? '+' : '') + (Number.isInteger(diff) ? diff : diff.toFixed(2))
    : null
  // Round 5: 差异颜色逻辑
  // 对于前束角（toe），越接近0越好；对于其他参数用中性色
  const diffColor = diff !== null
    ? (label.includes('束角') || label.includes('Toe')
        ? (Math.abs(value) < Math.abs(defaultValue) ? '#3fb950' : '#f85149')  // 束角越小越好
        : '#d29922')  // 其他参数用黄色表示变化
    : 'inherit'

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 4,
      padding: '6px 8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
          {displayValue}{unit}
        </span>
        {diffStr && (
          <span style={{
            fontSize: 8, fontWeight: 600, fontFamily: 'monospace',
            color: diffColor,
            background: diffColor === '#3fb950' ? 'rgba(63,185,80,0.12)' : (diffColor === '#f85149' ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)'),
            padding: '0 3px', borderRadius: 2
          }}>
            {diffStr}
          </span>
        )}
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange, min, max, step, unit = '', locked = false, defaultValue, highlighted = false, onResetDefault }) {
  const handleChange = (e) => {
    if (locked) return
    const raw = e.target.value
    if (raw === '' || raw === '-') {
      onChange(raw)
      return
    }
    const num = parseFloat(raw)
    if (isNaN(num)) return
    onChange(num)
  }

  const handleBlur = () => {
    if (locked) return
    if (value === '' || value === '-') {
      onChange(min)
      return
    }
    let num = parseFloat(value)
    if (isNaN(num)) num = min
    if (num < min) num = min
    if (num > max) num = max
    onChange(num)
  }

  const isOffDefault = defaultValue !== undefined && value !== undefined && parseFloat(value) !== parseFloat(defaultValue)

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label} {unit && <span style={{ color: 'var(--text-muted)' }}>({unit})</span>}
        {locked && <span style={{ color: '#da3633', marginLeft: 4, fontSize: 9, fontWeight: 400 }}>🔒 需升级配件</span>}
        {highlighted && <span style={{ color: '#3fb950', marginLeft: 4, fontSize: 9, fontWeight: 600, animation: 'paramHighlight 0.5s ease-in-out 3' }}>NEW</span>}
      </label>
      {/* Round 1: 推荐值提示 */}
      {defaultValue !== undefined && !locked && isOffDefault && (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>推荐: {typeof defaultValue === 'number' ? (Number.isInteger(defaultValue) ? defaultValue : defaultValue.toFixed(1)) : defaultValue}</span>
          {onResetDefault && (
            <span onClick={(e) => { e.stopPropagation(); onResetDefault() }} style={{
              cursor: 'pointer', color: '#58a6ff', textDecoration: 'underline', fontSize: 7
            }}>重置</span>
          )}
        </div>
      )}
      <input
        type="number"
        value={locked ? '-' : value}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        style={{
          ...inputStyle,
          opacity: locked ? 0.4 : 1,
          cursor: locked ? 'not-allowed' : 'auto',
          // Round 1: 高亮闪烁边框
          boxShadow: highlighted ? '0 0 8px rgba(63, 185, 80, 0.6)' : (isOffDefault ? 'inset 0 0 0 1px rgba(210, 153, 34, 0.3)' : 'none'),
          borderColor: highlighted ? '#3fb950' : (isOffDefault ? 'rgba(210, 153, 34, 0.5)' : 'var(--border)'),
          animation: highlighted ? 'paramHighlight 0.5s ease-in-out 3' : 'none'
        }}
      />
    </div>
  )
}

// ============================================================
// 配件选择器组件
// ============================================================
function PartSelector({ category, selected, onChange }) {
  const [expanded, setExpanded] = useState(false)

  const isStock = category.tierSystem
    ? (!selected?.tier || selected.tier === PART_TIERS.STOCK)
    : (!selected?.optionId || selected.optionId === 'stock')

  const selectedDetail = getPartOptionDetail(category.id, selected)
  const selectedTierInfo = category.tierSystem && selected?.tier
    ? TIER_INFO[selected.tier]
    : null

  const handleSelect = (tier, optionId) => {
    onChange(tier, optionId)
  }

  return (
    <div style={{
      background: isStock ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
      borderRadius: 6,
      border: `1px solid ${isStock ? 'var(--border)' : ((selectedTierInfo?.color || 'var(--accent)')) + '33'}`,
      overflow: 'hidden'
    }}>
      {/* 头部 - 点击展开/收起 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border)' : 'none'
        }}
      >
        <span style={{ fontSize: 12 }}>{category.icon}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: isStock ? 'var(--text-muted)' : 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {category.label}
        </span>
        {selectedTierInfo && (
          <span style={{
            fontSize: 8,
            padding: '1px 5px',
            borderRadius: 3,
            background: `${selectedTierInfo.color}22`,
            color: selectedTierInfo.color,
            fontWeight: 600
          }}>
            {selectedTierInfo.label}
          </span>
        )}
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 展开的选项列表 */}
      {expanded && (
        <div style={{ padding: '4px 6px 6px' }}>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4, paddingLeft: 2 }}>
            {category.description}
          </div>

          {category.tierSystem ? (
            /* 等级制配件 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {category.tiers.map(tier => {
                const isActive = selected?.tier === tier.id
                const options = tier.options || []
                return (
                  <div key={tier.id}>
                    {options.length === 1 ? (
                      /* 只有一个选项：直接选等级 */
                      <button
                        onClick={() => handleSelect(tier.id, options[0].id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '3px 6px',
                          borderRadius: 3,
                          border: `1px solid ${isActive ? tier.color + '66' : 'transparent'}`,
                          background: isActive ? tier.color + '22' : 'transparent',
                          color: isActive ? tier.color : 'var(--text-secondary)',
                          fontSize: 9,
                          cursor: 'pointer',
                          fontWeight: isActive ? 600 : 400,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: 2,
                          background: isActive ? tier.color : 'var(--border)'
                        }} />
                        <span style={{ flex: 1 }}>{tier.label}</span>
                        {tier.piBonus > 0 && (
                          <span style={{ fontSize: 8, color: tier.color }}>+{tier.piBonus}PI</span>
                        )}
                      </button>
                    ) : (
                      /* 多个选项：显示子选项 */
                      <div>
                        <div style={{
                          fontSize: 8,
                          color: tier.color,
                          fontWeight: 600,
                          padding: '2px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: 2,
                            background: options.some(o => o.id === selected?.optionId) ? tier.color : 'var(--border)'
                          }} />
                          {tier.label}
                          {tier.piBonus > 0 && <span>+{tier.piBonus}PI</span>}
                        </div>
                        <div style={{ paddingLeft: 12 }}>
                          {options.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => handleSelect(tier.id, opt.id)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '2px 6px',
                                borderRadius: 2,
                                border: 'none',
                                background: selected?.optionId === opt.id ? tier.color + '22' : 'transparent',
                                color: selected?.optionId === opt.id ? tier.color : 'var(--text-muted)',
                                fontSize: 8,
                                cursor: 'pointer',
                                fontWeight: selected?.optionId === opt.id ? 600 : 400
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* 选项制配件（如引擎swap） */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {category.options.map(opt => {
                const isActive = selected?.optionId === opt.id
                const color = opt.color || '#8b949e'
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelect(undefined, opt.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '3px 6px',
                      borderRadius: 3,
                      border: `1px solid ${isActive ? color + '66' : 'transparent'}`,
                      background: isActive ? color + '22' : 'transparent',
                      color: isActive ? color : 'var(--text-secondary)',
                      fontSize: 9,
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 2,
                      background: isActive ? color : 'var(--border)'
                    }} />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {opt.piBonus > 0 && (
                      <span style={{ fontSize: 8, color }}>+{opt.piBonus}PI</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const btnPrimaryStyle = {
  padding: '8px 16px',
  background: '#238636',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600
}

const btnSmallStyle = {
  padding: '4px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
}

const btnDangerSmallStyle = {
  padding: '4px 10px',
  background: '#da3633',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 1
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.8)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20
}

const modalContentStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: 10,
  padding: 20,
  width: '100%',
  border: '1px solid var(--border)'
}

const formSectionStyle = {
  background: 'var(--bg-primary)',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  border: '1px solid var(--border)'
}

const formSectionTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  marginBottom: 10
}

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10
}
