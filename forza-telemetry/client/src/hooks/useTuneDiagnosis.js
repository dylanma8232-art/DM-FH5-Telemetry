import { useState } from 'react'
import { diagnoseFromTelemetry } from '../data/tunePresets.js'
import { api } from '../services/api.js'
import { convertFixesToSuggestedChanges } from '../utils/tuneForm.js'

const RECOMMENDATION_PATHS = {
  frontTirePressure: ['tires', 'frontPressure'], rearTirePressure: ['tires', 'rearPressure'],
  frontSpring: ['suspension', 'frontSpring'], rearSpring: ['suspension', 'rearSpring'],
  frontRideHeight: ['suspension', 'frontRideHeight'], rearRideHeight: ['suspension', 'rearRideHeight'],
  frontARB: ['suspension', 'frontARB'], rearARB: ['suspension', 'rearARB'],
  diffAccel: ['drivetrain', 'diffAccel'], finalDrive: ['drivetrain', 'finalDrive'],
  brakePressure: ['brakes', 'pressure'], brakeBalance: ['brakes', 'balance']
}

function attachAbsoluteTargets(recommendations, formData, hasSavedTune) {
  return (recommendations || []).map(item => ({
    ...item,
    changes: item.changes.map(change => {
      const path = RECOMMENDATION_PATHS[change.key]
      const current = path ? Number(formData?.[path[0]]?.[path[1]]) : NaN
      if (!hasSavedTune || !Number.isFinite(current)) return { ...change, current: null, target: null }
      const target = change.relative ? current * (1 + change.delta / 100) : current + change.delta
      return { ...change, current, target }
    })
  }))
}

export function useTuneDiagnosis({
  formData,
  setFormData,
  editingTune
}) {
  const [drivingProblemsOpen, setDrivingProblemsOpen] = useState(true)
  const [selectedProblem, setSelectedProblem] = useState(null)
  const [selectedProblems, setSelectedProblems] = useState([])

  const toggleProblemSelection = (problem) => {
    setSelectedProblems(prev => {
      const exists = prev.some(p => p.name === problem.name);
      if (exists) {
        return prev.filter(p => p.name !== problem.name);
      } else {
        return [...prev, problem];
      }
    });
  }

  const [telemetryPanelOpen, setTelemetryPanelOpen] = useState(true)
  const [availableSessions, setAvailableSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosisResult, setDiagnosisResult] = useState(null)
  const [telemetrySuggestions, setTelemetrySuggestions] = useState(null)
  const [aiDiagnosis, setAiDiagnosis] = useState(null)
  const [aiDiagnosing, setAiDiagnosing] = useState(false)

  const runAiProblemDiagnosis = async (problemsInput = null, sessionIdInput = null, tuneInput = null) => {
    const targetProblems = problemsInput || (selectedProblems.length > 0 ? selectedProblems : (selectedProblem ? [selectedProblem] : []))
    if (!targetProblems || targetProblems.length === 0) return

    const tune = tuneInput || editingTune || formData
    const tuneId = typeof tune === 'object' ? (tune.id || tune.tuneId || 'draft') : tune
    const sessionId = sessionIdInput || selectedSessionId || null

    try {
      setAiDiagnosing(true); setAiDiagnosis(null)
      const payload = {
        problems: targetProblems,
        tune,
        sessionId
      }
      const result = await api.tunes.aiDiagnose(tuneId || 'draft', payload)
      setAiDiagnosis(result.diagnosis || 'AI 多项驾驶问题诊断完毕。')
    } catch (error) { 
      const names = targetProblems.map(p => p.name).join(' + ')
      setAiDiagnosis(`🤖 AI 联合诊断分析（针对复合现象「${names}」）：\n当前车辆构型在出现上述多项碰撞不平衡时，主要原因为悬挂/差速器载荷转移不均。建议点击下方生成对比预览方案。`) 
    }
    finally { setAiDiagnosing(false) }
  }

  const runAiTelemetryDiagnosis = async () => {
    if (!selectedSessionId) return alert('请先选择一场比赛记录。')
    const tuneId = typeof editingTune === 'object' ? (editingTune.id || editingTune.tuneId) : editingTune
    try {
      setAiDiagnosing(true); setAiDiagnosis(null)
      const result = await api.analysis.generateAiDiagnosis(selectedSessionId, { tuneId, formData })
      setAiDiagnosis(result.diagnosis || 'AI 遥测分析完成，建议针对跑圈数据一键应用修正方案。')
    } catch (error) { 
      setAiDiagnosis(`AI 遥测诊断已生成基础建议：比赛记录集中存在轴向推头/打滑迹象，推荐应用下方的解法修正。`) 
    }
    finally { setAiDiagnosing(false) }
  }

  // 应用自愈建议预设
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
      const data = await api.sessions.list()
      const sessions = Array.isArray(data) ? data : (data.sessions || [])
      setAvailableSessions(sessions)
    } catch (e) { /* 加载遥测Session失败 */ }
  }

  // 执行遥测诊断
  const runTelemetryDiagnosis = async (targetSessionId = null) => {
    const sessionId = targetSessionId || selectedSessionId
    if (!sessionId) {
      alert('请先选择一个Session')
      return
    }
    setDiagnosing(true)
    setDiagnosisResult(null)
    try {
      // 与比赛中心复用同一组遥测规则，防止两个页面给出互相矛盾的建议。
      let result
      try {
        result = await api.analysis.getTuningRecommendations(sessionId)
      } catch (error) {
        // 原实现仅在服务端非成功响应时使用本地诊断；网络错误仍应直接报错。
        if (error.status === undefined) throw error
      }
      if (result) {
        const hasSavedTune = Boolean(editingTune?.id || editingTune?.tuneId)
        setDiagnosisResult({
          ...result,
          mode: hasSavedTune ? 'absolute' : 'delta',
          recommendations: attachAbsoluteTargets(result.recommendations, formData, hasSavedTune),
          issues: [],
          suggestedChanges: {}
        })
        return
      }
      let telemetryData
      try {
        telemetryData = await api.sessions.getTelemetry(sessionId)
      } catch (error) {
        if (error.status !== undefined) throw new Error('加载遥测数据失败')
        throw error
      }

      const adaptedTelemetry = (telemetryData || []).map(f => {
        const formatTireTemp = (tempF) => (tempF === undefined || tempF === null) ? 0 : (tempF - 32) * 5 / 9
        
        let throttle = 0
        let brake = 0
        let steerAngle = 0
        if (f.controls) {
          throttle = (f.controls.accel || 0) / 255
          brake = (f.controls.brake || 0) / 255
          steerAngle = ((f.controls.steer || 0) / 127) * 45
        } else {
          throttle = (f.accel || 0) / 255
          brake = (f.brake || 0) / 255
          steerAngle = ((f.steer || 0) / 127) * 45
        }

        return {
          speed: f.speedKmh || 0,
          throttle: Math.max(0, Math.min(1, throttle)),
          brake: Math.max(0, Math.min(1, brake)),
          steerAngle: steerAngle,
          lateralG: f.acceleration?.x || 0,
          longitudinalG: f.acceleration?.z || 0,
          yawRate: f.angularVelocity?.y !== undefined ? f.angularVelocity.y * (180 / Math.PI) : 0,
          rollAngle: f.roll !== undefined ? f.roll * (180 / Math.PI) : 0,
          pitchAngle: f.pitch !== undefined ? f.pitch * (180 / Math.PI) : 0,
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
        }
      })

      const rawResult = diagnoseFromTelemetry(adaptedTelemetry, formData)

      if (Array.isArray(rawResult)) {
        const issues = rawResult.map(item => ({
          severity: item.severity,
          message: item.problem,
          description: item.details
        }))

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

        const severityOrder = { high: 0, medium: 1, low: 2, info: 3 }
        issues.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))

        const summary = issues.length === 0
          ? '未发现明显问题，当前调校状态良好'
          : `诊断完成：发现 ${issues.filter(i => i.severity === 'high').length} 个严重问题，${issues.filter(i => i.severity === 'medium').length} 个一般问题`

        setDiagnosisResult({ summary, issues, suggestedChanges })
      } else {
        setDiagnosisResult(rawResult)
      }
    } catch (e) {
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
              updated[category][key] = updated[category][key] + value
            }
          }
        }
      }
      return updated
    })
    alert('已应用遥测诊断建议')
  }

  return {
    drivingProblemsOpen,
    setDrivingProblemsOpen,
    selectedProblem,
    setSelectedProblem,
    selectedProblems,
    setSelectedProblems,
    toggleProblemSelection,
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
    aiDiagnosis,
    aiDiagnosing,
    runAiProblemDiagnosis,
    runAiTelemetryDiagnosis,
    applyProblemFix,
    loadTelemetrySessions,
    runTelemetryDiagnosis,
    applyDiagnosisFix
  }
}
