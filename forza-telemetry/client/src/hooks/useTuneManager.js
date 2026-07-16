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
  freeMode: false,
  notes: ''
}

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
  const [telemetrySuggestions, setTelemetrySuggestions] = useState(null)

  useEffect(() => {
    loadTunes()
    loadVehicles()
    loadTracks()
    loadActiveTune()
    loadTuneSessionStats()
  }, [])

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
        const targetVehicle = vehicles[navIntent.vehicleId]
        const baseCarPi = targetVehicle?.pi || 500
        setFormData({
          ...defaultFormData,
          vehicleId: String(navIntent.vehicleId),
          parts: getDefaultParts()
        })
        setBasePi(baseCarPi)
        setTargetPi(Math.min(998, Math.max(100, Math.ceil(baseCarPi / 100) * 100)))
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
            const targetVehicle = vehicles[navIntent.vehicleId]
            const baseCarPi = targetVehicle?.pi || 500
            setFormData({
              ...defaultFormData,
              vehicleId: String(navIntent.vehicleId),
              parts: getDefaultParts()
            })
            setBasePi(baseCarPi)
            setTargetPi(Math.min(998, Math.max(100, Math.ceil(baseCarPi / 100) * 100)))
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
          const targetVehicle = vehicles[navIntent.vehicleId]
          const baseCarPi = targetVehicle?.pi || 500
          setFormData({
            ...defaultFormData,
            vehicleId: String(navIntent.vehicleId),
            parts: getDefaultParts()
          })
          setBasePi(baseCarPi)
          setTargetPi(Math.min(998, Math.max(100, Math.ceil(baseCarPi / 100) * 100)))
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

    const payload = {
      name: formData.name.trim(),
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      vehicleId: formData.vehicleId || null,
      tires: { ...formData.tires },
      suspension: { ...formData.suspension },
      drivetrain: { ...formData.drivetrain },
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
      aero: { ...defaultFormData.aero, ...(tune.aero || {}) },
      parts: { ...getDefaultParts(), ...(tune.parts || {}) },
      freeMode: !!tune.freeMode,
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
    setTelemetrySuggestions(null)
    setHighlightedParams([])
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
    let currentParts = formData.parts;
    if (!currentParts || Object.keys(currentParts).length === 0) {
      currentParts = {};
      PART_CATEGORIES.forEach(cat => {
        if (cat.tierSystem) currentParts[cat.id] = { tier: 'race' };
        else currentParts[cat.id] = { optionId: 'stock' };
      });
    }

    const rawConstraints = getTuneConstraints(currentParts, formData.freeMode);

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
  }, [formData.parts, formData.freeMode])

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
    if (formData.vehicleId && vehicles[formData.vehicleId]) {
      setBasePi(vehicles[formData.vehicleId].pi || 500);
    }
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
    basePi,
    setBasePi,
    autoUpgradeLoading,
    setAutoUpgradeLoading,
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
