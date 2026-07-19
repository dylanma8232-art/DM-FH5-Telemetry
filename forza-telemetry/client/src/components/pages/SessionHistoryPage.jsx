import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea, ScatterChart, Scatter, Cell, Legend } from 'recharts';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { useSessionHistory } from '../../hooks/useSessionHistory';
import { toast } from '../shared/Toast';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets';
import { api } from '../../services/api';
import { TrackThumbnail, InteractiveTrackMap } from './session/TrackMaps';

const inputStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11
};

export function SessionHistoryPage({ onNavigate, navIntent }) {
  const {
    sessions,
    vehiclesList,
    selectedSession,
    setSelectedSession,
    analysis,
    sessionDetail,
    loading,
    activeTab,
    setActiveTab,
    channelsData,
    channelsLoading,
    advancedData,
    turnsData,
    activeTurnIdx,
    setActiveTurnIdx,
    zoomOnSelect,
    setZoomOnSelect,
    sessionSearchQuery,
    setSessionSearchQuery,
    trackFilter,
    setTrackFilter,
    tunes,
    showDeleteConfirm,
    setShowDeleteConfirm,
    selectedSessionIds,
    setSelectedSessionIds,
    batchMode,
    setBatchMode,
    sessionPage,
    setSessionPage,
    uniqueTracks,
    ggData,
    sectorTimingData,
    batchDelete,
    batchExportCSV,
    toggleSessionSelect,
    loadAnalysis,
    deleteSession,
    totalPages,
    sessionTune,
    myFilteredSessions,
    paginatedSessions
  } = useSessionHistory({ onNavigate, navIntent });

  // 子页签状态
  const [reviewSubTab, setReviewSubTab] = useState('corners');
  const [selectedIssueCategory, setSelectedIssueCategory] = useState('steering');
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [chartCursorPoint, setChartCursorPoint] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visibleWheels, setVisibleWheels] = useState({ FL: true, FR: true, RL: true, RR: true });
  const chartSubTab = reviewSubTab;
  const setChartSubTab = setReviewSubTab;
  const drivingSubTab = reviewSubTab === 'inputs' ? 'inputs' : 'analysis';
  const setDrivingSubTab = (tab) => setReviewSubTab(tab === 'inputs' ? 'inputs' : 'corners');

  const wheelNames = { FL: '左前', FR: '右前', RL: '左后', RR: '右后' };
  const wheelColors = { FL: '#58a6ff', FR: '#3fb950', RL: '#d29922', RR: '#ff7b72' };
  const wheelVisibilityControls = (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
      {Object.keys(wheelNames).map((wheel) => (
        <label key={wheel} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer', color: wheelColors[wheel], fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={visibleWheels[wheel]}
            onChange={() => setVisibleWheels((previous) => ({ ...previous, [wheel]: !previous[wheel] }))}
            style={{ cursor: 'pointer', margin: 0, accentColor: wheelColors[wheel] }}
          />
          {wheelNames[wheel]}
        </label>
      ))}
    </div>
  );

  const handleChartMouseMove = (state) => {
    if (state && state.activeTooltipIndex !== undefined && channelsData?.channels?.[state.activeTooltipIndex]) {
      const point = channelsData.channels[state.activeTooltipIndex];
      setChartCursorPoint({
        x: point.x,
        z: point.z,
        speed: point.speed !== undefined ? point.speed : (point.speedKmh !== undefined ? point.speedKmh : 0),
        gear: point.gear
      });
    }
  };

  const handleChartMouseLeave = () => {
    setChartCursorPoint(null);
  };

  // AI 诊断相关状态
  const [aiDiagnosisLoading, setAiDiagnosisLoading] = useState(false);
  const [aiDiagnosisReport, setAiDiagnosisReport] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [checkingKey, setCheckingKey] = useState(false);
  const [telemetryTuning, setTelemetryTuning] = useState(null);
  const [telemetryTuningLoading, setTelemetryTuningLoading] = useState(false);
  const selectedSessionRef = useRef(null);

  // AI 配置输入状态
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [model, setModel] = useState('qwen3.7-plus');
  const [savingKey, setSavingKey] = useState(false);

  // 趣言轮播计时器
  const [loadingTip, setLoadingTip] = useState('正在提取弯角出入速度...');
  const tipTimerRef = useRef(null);

  const tips = [
    '正在提取车况物理状态特征...',
    '正在扫描车手刹车与油门输入特征...',
    '正在分析弯中循迹制动与无效滑行占比...',
    '正在比对车辆在各弯心的速度赤字...',
    '正在为您量身定制下一步驾驶脚法改进指南...',
    'AI 正在撰写深度遥测诊断报告...'
  ];

  // 获取缓存的 AI 诊断报告
  const fetchCachedDiagnosis = async (sid) => {
    setCheckingKey(true);
    try {
      const data = await api.analysis.getAiDiagnosis(sid);
      if (selectedSessionRef.current === sid) {
        setKeyConfigured(data.keyConfigured);
        if (data.status === 'success') {
          setAiDiagnosisReport(data.diagnosis);
          if (data.problemId) setSelectedIssueId(data.problemId);
          if (data.customQuestion) setCustomQuestion(data.customQuestion);
        } else {
          setAiDiagnosisReport('');
        }
      }
    } catch (e) {
      console.error('获取 AI 诊断缓存失败:', e);
    } finally {
      setCheckingKey(false);
    }
  };

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
    setAiDiagnosisReport('');
    setSelectedIssueId(null);
    if (selectedSession) {
      fetchCachedDiagnosis(selectedSession);
    }
  }, [selectedSession]);

  useEffect(() => {
    let cancelled = false;
    setTelemetryTuning(null);
    if (!selectedSession) return undefined;
    setTelemetryTuningLoading(true);
    api.analysis.getTuningRecommendations(selectedSession)
      .then(result => { if (!cancelled) setTelemetryTuning(result); })
      .catch(() => { if (!cancelled) setTelemetryTuning({ summary: '暂时无法生成遥测调教建议。', recommendations: [] }); })
      .finally(() => { if (!cancelled) setTelemetryTuningLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSession]);

  const startTipRotation = () => {
    let idx = 0;
    setLoadingTip(tips[0]);
    if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    tipTimerRef.current = setInterval(() => {
      idx = (idx + 1) % tips.length;
      setLoadingTip(tips[idx]);
    }, 2500);
  };

  const handleStartAiDiagnosis = async () => {
    if (!selectedSession) return;
    const diagnosisSessionId = selectedSession;
    setAiDiagnosisLoading(true);
    startTipRotation();
    try {
      const probDetails = DRIVING_PROBLEMS.find(p => p.id === selectedIssueId);
      const data = await api.analysis.generateAiDiagnosis(selectedSession, {
        problemId: selectedIssueId,
        customQuestion: customQuestion.trim(),
        problemDetails: probDetails || null
      });

      if (data.status === 'success' && selectedSessionRef.current === diagnosisSessionId) {
        setAiDiagnosisReport(data.diagnosis);
        toast('AI 智能诊断生成成功！', 'success');
      } else {
        toast(data.error || '生成失败，请重试', 'error');
      }
    } catch (e) {
      console.error('AI 诊断失败:', e);
      if (e.status === 403) {
        setKeyConfigured(false);
        toast('请配置您的百炼 API Key', 'error');
      } else {
        toast(e.message || '大模型请求失败，请稍后重试', 'error');
      }
    } finally {
      setAiDiagnosisLoading(false);
      if (tipTimerRef.current) {
        clearInterval(tipTimerRef.current);
        tipTimerRef.current = null;
      }
    }
  };

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast('请输入 API Key', 'error');
      return;
    }
    setSavingKey(true);
    try {
      await api.system.setDashscopeKey({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim()
      });
      toast('API 配置保存成功！', 'success');
      setKeyConfigured(true);
      setApiKey('');
      handleStartAiDiagnosis();
    } catch (err) {
      console.error('保存 API 配置失败:', err);
      toast(err.message || '保存失败，请稍后重试', 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const formatLapTime = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return '--:--.---';
    const seconds = numericValue > 1000 ? numericValue / 1000 : numericValue;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`;
  };

  const getParamValue = (tune, key) => {
    if (!tune) return null;
    const mapping = {
      frontTirePressure: tune.tires?.frontPressure,
      rearTirePressure: tune.tires?.rearPressure,
      frontCamber: tune.tires?.frontCamber,
      rearCamber: tune.tires?.rearCamber,
      frontToe: tune.tires?.frontToe,
      rearToe: tune.tires?.rearToe,
      frontSpring: tune.suspension?.frontSpring,
      rearSpring: tune.suspension?.rearSpring,
      frontDamping: tune.suspension?.frontDamping,
      rearDamping: tune.suspension?.rearDamping,
      frontARB: tune.suspension?.frontARB,
      rearARB: tune.suspension?.rearARB,
      frontRideHeight: tune.suspension?.frontRideHeight,
      rearRideHeight: tune.suspension?.rearRideHeight,
      diffAccel: tune.drivetrain?.diffAccel,
      diffDecel: tune.drivetrain?.diffDecel,
      diffCenter: tune.drivetrain?.diffCenter,
      finalDrive: tune.drivetrain?.finalDrive,
      brakePressure: tune.brakes?.pressure,
      brakeBalance: tune.brakes?.balance,
      frontDownforce: tune.aero?.frontDownforce,
      rearDownforce: tune.aero?.rearDownforce
    };
    return mapping[key] !== undefined ? mapping[key] : null;
  };

  // 连续遥测信号聚合为事件，避免将采样点数量误认为驾驶失误次数。
  const driverPerformanceStats = useMemo(() => {
    if (!channelsData?.channels || channelsData.channels.length === 0) {
      return { spinCount: 0, lockCount: 0, spinDurationSec: 0, lockDurationSec: 0, coastingTimeSec: 0, totalFrames: 0 };
    }
    let coastingFrames = 0;
    const channels = channelsData.channels;
    const lapTimeSec = analysis?.成绩?.总时长 ? analysis.成绩.总时长 / 1000 : 90;
    const sampleSec = lapTimeSec / channels.length;
    const drivetrain = analysis?.vehicle?.drivetrain || '';
    const driveSlip = (c) => {
      const front = Math.max(c.slipFL || 0, c.slipFR || 0);
      const rear = Math.max(c.slipRL || 0, c.slipRR || 0);
      if (drivetrain === 'FWD') return front;
      if (drivetrain === 'RWD') return rear;
      return Math.max(front, rear);
    };
    const eventSummary = (predicate) => {
      const events = [];
      let start = null;
      channels.forEach((channel, index) => {
        if (predicate(channel)) {
          if (start === null) start = index;
        } else if (start !== null) {
          if (index - start >= 2) events.push({ start, end: index - 1 });
          start = null;
        }
      });
      if (start !== null && channels.length - start >= 2) events.push({ start, end: channels.length - 1 });
      const durationSec = events.reduce((sum, event) => sum + (event.end - event.start + 1) * sampleSec, 0);
      return { count: events.length, durationSec: Number(durationSec.toFixed(1)) };
    };

    channels.forEach(c => {
      // 弯中无效滑行（油门 < 5 且刹车 < 5，同时车辆处于高速转向状态，即横向G力绝对值 > 0.35G，速度 > 30km/h）
      if (c.throttle < 5 && c.brake < 5 && Math.abs(c.gLat || 0) > 0.35 && c.speed > 30) {
        coastingFrames++;
      }
    });

    const coastingTimeSec = Number(((coastingFrames / channels.length) * lapTimeSec).toFixed(1));
    const spinEvents = eventSummary(c => c.throttle > 40 && driveSlip(c) > 0.15);
    const lockEvents = eventSummary(c => c.brake > 40 && Math.min(c.slipFL || 0, c.slipFR || 0, c.slipRL || 0, c.slipRR || 0) < -0.15);

    return {
      spinCount: spinEvents.count,
      lockCount: lockEvents.count,
      spinDurationSec: spinEvents.durationSec,
      lockDurationSec: lockEvents.durationSec,
      coastingTimeSec,
      totalFrames: channels.length
    };
  }, [channelsData, analysis]);

  // 优先显示有参考速度的速度赤字；没有参考时仍显示最慢的三个弯心，避免重点弯道区空白。
  const worstCorners = useMemo(() => {
    if (!turnsData?.turns || turnsData.turns.length === 0) return [];
    return [...turnsData.turns]
      .filter(t => (t.current?.apexSpeed ?? 0) > 0)
      .map(t => {
        const apexSpeedKmh = t.current.apexSpeed;
        const refApexSpeedKmh = t.recommended?.apexSpeed ?? null;
        const deficitKmh = refApexSpeedKmh && refApexSpeedKmh > 0
          ? Math.max(0, refApexSpeedKmh - apexSpeedKmh)
          : null;
        return {
          ...t,
          apexSpeedKmh,
          refApexSpeedKmh,
          deficitKmh,
          hasReference: deficitKmh !== null
        };
      })
      .sort((a, b) => {
        if (a.hasReference && b.hasReference) return b.deficitKmh - a.deficitKmh;
        if (a.hasReference !== b.hasReference) return a.hasReference ? -1 : 1;
        return a.apexSpeedKmh - b.apexSpeedKmh;
      })
      .slice(0, 3);
  }, [turnsData]);

  const raceOverview = useMemo(() => {
    const score = analysis?.驾驶评分;
    const sectors = advancedData?.lapSectorDetails || [];
    const selectedSummary = sessions.find(session => session.id === selectedSession);
    const normalizeToMs = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
      return numericValue < 1000 ? numericValue * 1000 : numericValue;
    };
    const currentLap = normalizeToMs(analysis?.成绩?.最快圈速 || selectedSummary?.laps?.best);
    const theoreticalBest = normalizeToMs(advancedData?.theoreticalBest?.time);
    const recoverableMs = theoreticalBest > 0 && currentLap > theoreticalBest
      ? currentLap - theoreticalBest
      : 0;
    const bestSectorLoss = sectors.flatMap(lap => lap.sectors || [])
      .reduce((max, sector) => Math.max(max, sector.loss || 0), 0);

    const events = [];
    if (driverPerformanceStats.lockCount > 0) {
      events.push({ label: '制动滑移事件', value: `${driverPerformanceStats.lockCount} 次 / 约 ${driverPerformanceStats.lockDurationSec} 秒`, tone: 'danger' });
    }
    if (driverPerformanceStats.spinCount > 0) {
      events.push({ label: '出弯牵引力事件', value: `${driverPerformanceStats.spinCount} 次 / 约 ${driverPerformanceStats.spinDurationSec} 秒`, tone: 'danger' });
    }
    if (driverPerformanceStats.coastingTimeSec >= 3.5) {
      events.push({ label: '弯中滑行', value: `${driverPerformanceStats.coastingTimeSec} 秒`, tone: 'warning' });
    }
    if ((analysis?.底盘悬挂?.totalBottomingTicks || 0) > 35) {
      events.push({ label: '悬挂行程接近极限', value: '建议在车辆证据中核对发生位置', tone: 'warning' });
    }

    return {
      score,
      currentLap,
      theoreticalBest,
      recoverableMs,
      bestSectorLoss,
      events: events.slice(0, 4)
    };
  }, [analysis, advancedData, driverPerformanceStats, selectedSession, sessions]);

  const reviewSummary = useMemo(() => {
    const tempStats = advancedData?.tempStats || {};
    const temperatures = [tempStats.avgFL, tempStats.avgFR, tempStats.avgRL, tempStats.avgRR].filter(Number.isFinite);
    const averageTemperature = temperatures.length
      ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length
      : null;
    const bottomingTicks = analysis?.底盘悬挂?.totalBottomingTicks || 0;
    const highRpmSeconds = Number(analysis?.动力齿比?.maxRpmBangingTimeSec || 0);
    const currentTurn = turnsData?.turns?.[activeTurnIdx];
    const currentTurnData = currentTurn?.current || {};

    const summaries = {
      corners: {
        title: `弯道定位重点${currentTurn?.name ? ` · ${currentTurn.name}` : ''}`,
        items: [
          { label: '入弯速度', value: currentTurnData.entrySpeed ? `${currentTurnData.entrySpeed} 千米/小时` : '暂无' },
          { label: '弯心速度', value: currentTurnData.apexSpeed ? `${currentTurnData.apexSpeed} 千米/小时` : '暂无' },
          { label: '出弯速度', value: currentTurnData.exitSpeed ? `${currentTurnData.exitSpeed} 千米/小时` : '暂无' }
        ],
        note: '先选择重点弯道，再查看地图位置和入弯、弯心、出弯四阶段表现。'
      },
      inputs: {
        title: '驾驶操作重点',
        items: [
          { label: '抱死事件', value: `${driverPerformanceStats.lockCount} 次` },
          { label: '打滑事件', value: `${driverPerformanceStats.spinCount} 次` },
          { label: '弯中滑行', value: `${driverPerformanceStats.coastingTimeSec} 秒` }
        ],
        note: '优先查看制动证据图，再依次核对踏板衔接、转向修正和抓地利用。'
      },
      tires: {
        title: '轮胎抓地重点',
        items: [
          { label: '四轮平均温度', value: averageTemperature === null ? '暂无' : `${averageTemperature.toFixed(1)}°C` },
          { label: '打滑事件', value: `${driverPerformanceStats.spinCount} 次` },
          { label: '抱死事件', value: `${driverPerformanceStats.lockCount} 次` }
        ],
        note: '先判断胎温是否进入 75°C-90°C 工作区，再核对滑移率异常发生位置。'
      },
      suspension: {
        title: '底盘悬挂重点',
        items: [
          { label: '托底采样', value: `${bottomingTicks} 个` },
          { label: '工作区间', value: '5%-95%' },
          { label: '数据状态', value: channelsData?.channels?.length ? '可分析' : '暂无' }
        ],
        note: '先看托底数量，再看悬挂行程位置和四轮压缩分布，避免只根据单个尖峰调校。'
      },
      differential: {
        title: '动力传动重点',
        items: [
          { label: '高转速停留', value: `${highRpmSeconds.toFixed(2)} 秒` },
          { label: '最高转速参考', value: analysis?.动力齿比?.maxRpm ? `${Math.round(analysis.动力齿比.maxRpm)} 转` : '按本场峰值' },
          { label: '轮速差', value: '仅作趋势比较' }
        ],
        note: '先判断换挡是否长期停留高转区，再查看前后轴轮速差趋势；轮速差不用于绝对单位调校。'
      },
      aero: {
        title: '空气动力平衡重点',
        items: [
          { label: '下压力平衡', value: '前后平衡分配合理' },
          { label: '车身高度变化', value: '平稳' },
          { label: '数据状态', value: channelsData?.channels?.length ? '可分析' : '暂无' }
        ],
        note: '高速段重点观察前后下压力与车身高度的变化情况。'
      }
    };
    return summaries[reviewSubTab] || summaries.corners;
  }, [reviewSubTab, advancedData, analysis, worstCorners, turnsData, activeTurnIdx, driverPerformanceStats, channelsData]);

  const selectedTurnReview = useMemo(() => {
    const turn = turnsData?.turns?.[activeTurnIdx];
    if (!turn) return null;
    const current = turn.current || {};
    const reference = turn.recommended || {};
    const delta = (key) => Math.round((current[key] || 0) - (reference[key] || 0));
    const speedText = (key) => {
      if (!reference[key]) return '暂无参考速度';
      const value = delta(key);
      return value === 0 ? '与参考持平' : value > 0 ? `快 ${value} km/h` : `慢 ${Math.abs(value)} km/h`;
    };
    const entryDelta = delta('entrySpeed');
    const apexDelta = delta('apexSpeed');
    const exitDelta = delta('exitSpeed');

    return {
      turn,
      phases: [
        {
          id: 'brake', label: '制动区', value: current.brakeSpeed ? `${current.brakeSpeed} km/h` : '--',
          detail: current.longBrakeG ? `最大制动 ${current.longBrakeG.toFixed(2)} G` : '暂无制动强度数据',
          note: entryDelta < -5 ? '入弯前速度偏低，可在详情曲线中核对制动点与松刹节奏。' : '入弯速度接近参考，重点保持制动释放稳定。'
        },
        {
          id: 'entry', label: '入弯', value: `${current.entrySpeed || '--'} km/h`,
          detail: speedText('entrySpeed'),
          note: entryDelta < -5 ? '本弯时间可能在制动末段或转向初段流失。' : '入弯阶段速度表现稳定。'
        },
        {
          id: 'apex', label: '弯心', value: `${current.apexSpeed || '--'} km/h`,
          detail: speedText('apexSpeed'),
          note: apexDelta < -5 ? '弯心速度是当前最明显的缺口，检查走线与转向修正。' : '弯心速度接近参考，可继续关注出弯。'
        },
        {
          id: 'exit', label: '出弯', value: `${current.exitSpeed || '--'} km/h`,
          detail: speedText('exitSpeed'),
          note: exitDelta < -5 ? '出弯速度偏低，进入驾驶表现页核对开油时机与牵引力。' : '出弯速度接近参考，直线加速基础良好。'
        }
      ],
      focus: exitDelta < Math.min(entryDelta, apexDelta) ? '出弯' : apexDelta < entryDelta ? '弯心' : '入弯'
    };
  }, [turnsData, activeTurnIdx]);

  const chartGuidance = {
    inputs: '先看制动、油门和转向如何共同影响这一圈；需要定位问题时，请从重点弯道进入对应证据。',
    aero: '用于理解弯心附近的车辆平衡表现。原始物理曲线只作为驾驶现象的补充证据。',
    tires: '用于核对出弯时的牵引力和轮胎滑移表现，不把单次波动直接归因于车辆设定。',
    differential: '用于查看换挡、转速和直线加速的使用情况；差速数据仅在需要时深入核对。',
    suspension: '用于核对路肩、触底和车身稳定性事件；完整四轮信号属于深层证据。'
  };

  // 以“驾驶技术改进为核心”进行赛后综合会诊
  const sessionConsultation = useMemo(() => {
    const highlights = [];
    const flaws = [];
    const recommendations = [];
    const optionalTunes = [];

    if (!analysis) return { highlights, flaws, recommendations, optionalTunes };

    const bottomingTicks = analysis.底盘悬挂?.totalBottomingTicks || 0;
    const bangingTime = parseFloat(analysis.动力齿比?.maxRpmBangingTimeSec || 0);

    // 1. 评估驾驶操作亮点
    if (driverPerformanceStats.lockCount === 0) {
      highlights.push('✅ 刹车控制出色：重制动过程中脚法沉稳，未发生轮胎死锁抱死，保持了最优导向力。');
    }
    if (driverPerformanceStats.spinCount === 0) {
      highlights.push('✅ 弯中给油细腻：出弯踩油门动作平缓线性，驱动轮无空转，牵引力高效转化为向前动能。');
    }
    if (driverPerformanceStats.coastingTimeSec < 2.5) {
      highlights.push('✅ 弯道节奏非常紧凑：松刹车到开油门的衔接空档期极短，没有无效的滑行丢速。');
    }
    if (bangingTime < 0.6) {
      highlights.push('✅ 升档档位衔接优秀：升档动作及时，未在红线断油限制区无意义驻留磨损引擎。');
    }
    if (highlights.length === 0) {
      highlights.push('✅ 行驶路线整体保持了赛道的完整性，车辆轨迹运行紧凑。');
    }

    // 2. 评估核心驾驶失误与秒数损失
    if (driverPerformanceStats.lockCount > 0) {
      flaws.push(`❌ 制动滑移事件：重制动时出现 ${driverPerformanceStats.lockCount} 次连续滑移，合计约 ${driverPerformanceStats.lockDurationSec} 秒。请在弯道详情中核对制动释放时机。`);
      recommendations.push('👣 <strong>刹车轻踩慢放，执行循迹制动</strong>：入弯前瞬间重踩制动减速，但随后打方向进弯时必须平滑地抬起脚踏板（从 80% 逐渐释放到 10% ），以循迹余温切入弯心。');
      optionalTunes.push('• 刹车锁死 ➡️ 可考虑在改装的“刹车”菜单中将制动压力下调至 92%-95%，或将刹车平衡向锁死较少的轴向微调 1-2%。');
    }
    if (driverPerformanceStats.spinCount > 0) {
      flaws.push(`❌ 出弯牵引力事件：驱动轴出现 ${driverPerformanceStats.spinCount} 次连续滑移，合计约 ${driverPerformanceStats.spinDurationSec} 秒。请先在重点弯道核对方向回正前的开油节奏。`);
      recommendations.push('👣 <strong>渐进式给油，切忌直接地板油</strong>：出弯车头还未回正时禁止一脚踩死。应随着方向盘逐渐回正，脚下同步线性施加踏板力量（0% ➡️ 30% ➡️ 60% ➡️ 100%）。');
      optionalTunes.push('• 出弯打滑侧滑 ➡️ 可考虑在调校“差速器”中将后轮加速锁锁止率降低 10% - 15%，或调软后弹簧刚度/后防倾杆。');
    }
    if (driverPerformanceStats.coastingTimeSec >= 3.5) {
      const loss = (driverPerformanceStats.coastingTimeSec * 0.25).toFixed(2);
      flaws.push(`❌ 弯中无效空挡滑行：在弯道中既没有踩刹车维持抓地转移，也未踩油门加速（无效空踩滑行达 ${driverPerformanceStats.coastingTimeSec} 秒），预估折损圈速约 ${loss} 秒。`);
      recommendations.push('👣 <strong>缩短刹油切换空档期，带油切弯</strong>：改掉“既不踩刹车也不踩油门”的滑行习惯。入弯刹车放完的瞬间立刻微接 5%-10% 油门维持姿态，过弯心果断踩下。');
    }
    if (bangingTime >= 1.5) {
      const loss = (bangingTime * 0.3).toFixed(2);
      flaws.push(`❌ 换挡断油超时：引擎在红线限制区滞留了 ${bangingTime} 秒，动力输出直接卡死，预估折损圈速约 ${loss} 秒。`);
      recommendations.push('👣 <strong>换挡时机提前</strong>：不要等引擎尖叫并断油后才升档。应在引擎转速到达红线区前的 300 - 500 转（排气声最高亢的瞬间）果断升档。');
      optionalTunes.push('• 直道末端撞断油 ➡️ 可在“齿轮比”菜单中将终传比滑块向左拉（调疏），或加长断油档位齿比。');
    }

    if (bottomingTicks > 35) {
      flaws.push(`❌ 底盘刮地托底：在骑压路肩或避震过度压缩时底盘刮地高达 ${bottomingTicks} 帧，这会大幅削弱直道尾速。`);
      recommendations.push('👣 <strong>减少高路肩碾压</strong>：在高速弯中适当收敛走线，避免过度猛烈骑压高耸的主动马路牙子。');
      optionalTunes.push('• 底盘频繁摩擦托底 ➡️ 可在“弹簧”菜单中将车身高度提升 1.0 - 2.0 厘米，或适当加硬弹簧刚度。');
    }

    if (flaws.length === 0) {
      flaws.push('💡 驾驶操作无任何明显技术失误，脚法极佳！');
    }
    if (recommendations.length === 0) {
      recommendations.push('👣 本圈脚法已至极限。下次可通过推迟 5 米刹车点，多带 3km/h 的弯心速度以压榨车辆极限。');
    }
    if (optionalTunes.length === 0) {
      optionalTunes.push('• 车辆硬件物理极限契合优秀，无需额外改装参数变动。');
    }

    return { highlights, flaws, recommendations, optionalTunes };
  }, [analysis, driverPerformanceStats]);

  // 动态分析本场比赛的最大引擎转速
  const maxSessionRpm = useMemo(() => {
    if (!channelsData?.channels || channelsData.channels.length === 0) return 8000;
    return Math.max(...channelsData.channels.map(c => c.rpm || 0), 6500);
  }, [channelsData]);

  // 悬挂压缩量分箱：0% 为接近满伸展，100% 为接近压到底。
  const suspensionHistogram = useMemo(() => {
    if (!channelsData?.channels || channelsData.channels.length === 0) return [];
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}%-${(i + 1) * 10}%`,
      frontLeft: 0,
      frontRight: 0,
      rearLeft: 0,
      rearRight: 0
    }));

    channelsData.channels.forEach(c => {
      const fl = Math.min(9, Math.floor((1 - (c.suspensionNormFL || 0)) * 10));
      const fr = Math.min(9, Math.floor((1 - (c.suspensionNormFR || 0)) * 10));
      const rl = Math.min(9, Math.floor((1 - (c.suspensionNormRL || 0)) * 10));
      const rr = Math.min(9, Math.floor((1 - (c.suspensionNormRR || 0)) * 10));

      buckets[fl].frontLeft++;
      buckets[fr].frontRight++;
      buckets[rl].rearLeft++;
      buckets[rr].rearRight++;
    });

    const total = channelsData.channels.length;
    return buckets.map(b => ({
      range: b.range,
      '左前': Number((b.frontLeft / total * 100).toFixed(1)),
      '右前': Number((b.frontRight / total * 100).toFixed(1)),
      '左后': Number((b.rearLeft / total * 100).toFixed(1)),
      '右后': Number((b.rearRight / total * 100).toFixed(1)),
    }));
  }, [channelsData]);

  // 空气动力下沉速度比对数据
  const aeroData = useMemo(() => {
    if (!channelsData?.channels) return [];
    const sorted = [...channelsData.channels].sort((a, b) => a.speed - b.speed);
    const step = Math.max(1, Math.ceil(sorted.length / 45));
    const result = [];
    for (let i = 0; i < sorted.length; i += step) {
      const d = sorted[i];
      const avgFront = 1 - ((d.suspensionNormFL || 0) + (d.suspensionNormFR || 0)) / 2;
      const avgRear = 1 - ((d.suspensionNormRL || 0) + (d.suspensionNormRR || 0)) / 2;
      result.push({
        speed: d.speed,
        '前轴压缩': Number((avgFront * 100).toFixed(1)),
        '后轴压缩': Number((avgRear * 100).toFixed(1))
      });
    }
    return result;
  }, [channelsData]);

  // 齿轮比与转速分析数据
  const gearingData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => ({
      distance: c.distance,
      rpm: c.rpm,
      gear: c.gear
    }));
  }, [channelsData]);

  // 驱动轴左右轮速差数据
  const diffData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => {
      const frontDiff = Number.isFinite(c.wheelSpeedFL) && Number.isFinite(c.wheelSpeedFR)
        ? Math.abs(c.wheelSpeedFL - c.wheelSpeedFR) : null;
      const rearDiff = Number.isFinite(c.wheelSpeedRL) && Number.isFinite(c.wheelSpeedRR)
        ? Math.abs(c.wheelSpeedRL - c.wheelSpeedRR) : null;
      return {
        distance: c.distance,
        throttle: c.throttle,
        '前轴速差': frontDiff,
        '后轴速差': rearDiff
      };
    });
  }, [channelsData]);

  // 将弯中表现压缩成可扫读的对照图：先找速度缺口，再下钻到单个弯道复盘动作。
  const cornerApexComparison = useMemo(() => {
    if (!turnsData?.turns) return [];
    return turnsData.turns
      .map((turn, index) => ({
        弯道: turn.name || `弯 ${index + 1}`,
        本场: Number(turn.current?.apexSpeed || 0),
        参考: Number(turn.recommended?.apexSpeed || 0)
      }))
      .filter(turn => turn.本场 > 0 || turn.参考 > 0);
  }, [turnsData]);

  // 刹车滑移对比数据
  const brakeGScatterData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.filter(c => c.brake > 5).map(c => ({
      brake: c.brake,
      decel: Math.abs(c.gLong || 0)
    }));
  }, [channelsData]);

  // G-G 摩擦力圆散点数据
  const ggScatterPoints = useMemo(() => {
    if (!ggData?.sampled) return [];
    return ggData.sampled.map(c => ({
      x: Number((c.gLat || 0).toFixed(3)),
      y: Number((c.gLong || 0).toFixed(3))
    }));
  }, [ggData]);

  // 方向盘输入与转向平顺度数据
  const steeringData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => ({
      distance: c.distance,
      steer: c.steer,
      gLat: c.gLat
    }));
  }, [channelsData]);

  // 方向盘输入与车速对照数据 (新增图表)
  const steeringSpeedData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => ({
      distance: c.distance,
      speed: c.speed !== undefined ? c.speed : (c.speedKmh !== undefined ? c.speedKmh : 0),
      steerPct: Number(((c.steer || 0) / 127 * 100).toFixed(1))
    }));
  }, [channelsData]);

  // 新增：各圈圈速趋势，统一将后端可能返回的毫秒转换为秒。
  const lapTrendData = useMemo(() => {
    const laps = advancedData?.lapSectorDetails || [];
    const normalized = laps
      .map((lap) => {
        const raw = Number(lap.totalTime);
        const totalSeconds = raw > 1000 ? raw / 1000 : raw;
        return Number.isFinite(totalSeconds) && totalSeconds > 0
          ? { lap: lap.lap, totalSeconds }
          : null;
      })
      .filter(Boolean);
    const best = normalized.length ? Math.min(...normalized.map((lap) => lap.totalSeconds)) : 0;
    return normalized.map((lap) => ({
      ...lap,
      delta: Number((lap.totalSeconds - best).toFixed(3)),
      best
    }));
  }, [advancedData]);

  // 新增：制动区证据，锁死点以红色散点叠加在车速曲线上。
  const brakingEvidenceData = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map((channel) => {
      const speed = channel.speed ?? channel.speedKmh ?? 0;
      const minSlip = Math.min(channel.slipFL || 0, channel.slipFR || 0, channel.slipRL || 0, channel.slipRR || 0);
      const isLockup = (channel.brake || 0) > 40 && minSlip < -0.15;
      return {
        distance: channel.distance,
        speed,
        brake: channel.brake || 0,
        decel: Math.abs(channel.gLong || 0),
        lockupSpeed: isLockup ? speed : null
      };
    });
  }, [channelsData]);

  // 转换华氏度为摄氏度，并作为图表数据源使用
  const formattedChannels = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => ({
      ...c,
      tempFL: Math.round((c.tempFL - 32) * 5 / 9),
      tempFR: Math.round((c.tempFR - 32) * 5 / 9),
      tempRL: Math.round((c.tempRL - 32) * 5 / 9),
      tempRR: Math.round((c.tempRR - 32) * 5 / 9),
      // 兼容历史记录与新记录的悬挂字段，图表统一使用归一化的 susp*。
      suspFL: c.suspFL ?? c.suspensionNormFL ?? c.suspensionFL,
      suspFR: c.suspFR ?? c.suspensionNormFR ?? c.suspensionFR,
      suspRL: c.suspRL ?? c.suspensionNormRL ?? c.suspensionRL,
      suspRR: c.suspRR ?? c.suspensionNormRR ?? c.suspensionRR,
    }));
  }, [channelsData]);

  // 根据本场实际滑移峰值扩展纵轴，避免超过正负 40% 的数据被裁掉。
  const slipChartDomain = useMemo(() => {
    const maxAbsSlip = formattedChannels.reduce((max, channel) => {
      const channelPeak = ['slipFL', 'slipFR', 'slipRL', 'slipRR'].reduce((peak, key) => {
        const value = Math.abs(Number(channel[key]));
        return Number.isFinite(value) ? Math.max(peak, value) : peak;
      }, 0);
      return Math.max(max, channelPeak);
    }, 0);
    const limit = Math.max(0.4, Math.ceil(maxAbsSlip * 20) / 20);
    return [-limit, limit];
  }, [formattedChannels]);

  // 极简 Markdown 渲染器
  const renderMarkdown = (mdText) => {
    if (!mdText) return null;

    const lines = mdText.split('\n');
    let insideList = false;
    let listItems = [];
    const elements = [];

    const flushList = (keyPrefix) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list_${keyPrefix}`} style={{ paddingLeft: 20, margin: '8px 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listItems}
          </ul>
        );
        listItems = [];
        insideList = false;
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      const parseInline = (text) => {
        const parts = [];
        const regex = /\*\*(.*?)\*\*/g;
        let match;
        let lastIdx = 0;

        while ((match = regex.exec(text)) !== null) {
          const before = text.substring(lastIdx, match.index);
          if (before) parts.push(before);
          parts.push(<strong key={`bold_${match.index}`} style={{ color: '#58a6ff' }}>{match[1]}</strong>);
          lastIdx = regex.lastIndex;
        }

        const after = text.substring(lastIdx);
        if (after) parts.push(after);

        return parts.length > 0 ? parts : text;
      };

      if (trimmed.startsWith('# ')) {
        flushList(idx);
        elements.push(<h2 key={idx} style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: 6, margin: '20px 0 12px' }}>{parseInline(trimmed.substring(2))}</h2>);
      } else if (trimmed.startsWith('## ')) {
        flushList(idx);
        elements.push(<h3 key={idx} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '18px 0 10px' }}>{parseInline(trimmed.substring(3))}</h3>);
      } else if (trimmed.startsWith('### ')) {
        flushList(idx);
        elements.push(<h4 key={idx} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 8px' }}>{parseInline(trimmed.substring(4))}</h4>);
      } else if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) {
        insideList = true;
        const checked = trimmed.startsWith('- [x] ');
        const text = trimmed.substring(6);
        listItems.push(
          <li key={idx} style={{ listStyleType: 'none', display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={checked} readOnly style={{ marginTop: 2, accentColor: '#3fb950', cursor: 'default' }} />
            <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
              {parseInline(text)}
            </span>
          </li>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        insideList = true;
        const text = trimmed.substring(2);
        listItems.push(
          <li key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {parseInline(text)}
          </li>
        );
      } else if (trimmed === '---') {
        flushList(idx);
        elements.push(<hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />);
      } else if (!trimmed) {
        flushList(idx);
      } else {
        flushList(idx);
        elements.push(
          <p key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px 0' }}>
            {parseInline(trimmed)}
          </p>
        );
      }
    });

    flushList('end');

    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        color: 'var(--text-primary)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        {elements}
      </div>
    );
  };

  // 格式化时间函数
  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // 格式化日期函数
  const formatDate = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左侧边栏：比赛记录列表 */}
        <div style={{
          width: sidebarCollapsed ? 0 : 300,
          borderRight: sidebarCollapsed ? 'none' : '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'relative',
          transition: 'width 0.2s',
          overflow: sidebarCollapsed ? 'hidden' : 'visible'
        }}>
          {/* 折叠/展开按钮 */}
          <div
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              position: 'absolute',
              top: 12,
              right: sidebarCollapsed ? -24 : -12,
              width: 24,
              height: 24,
              background: '#21262d',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              color: '#8b949e',
              fontSize: 10,
              transition: 'all 0.2s'
            }}
            title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </div>
          <div style={{
            padding: 12,
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600
          }}>
            比赛记录 ({sessions.length})
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <button onClick={() => { setBatchMode(b => !b); setSelectedSessionIds(new Set()); }} style={{ ...btnSmallStyle, fontSize: 9 }}>
                {batchMode ? '取消批量' : '批量操作'}
              </button>
              {batchMode && selectedSessionIds.size > 0 && (
                <>
                  <button onClick={batchDelete} style={{ ...btnSmallStyle, fontSize: 9, background: 'rgba(248,81,73,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>
                    删除 ({selectedSessionIds.size})
                  </button>
                  <button onClick={batchExportCSV} style={{ ...btnSmallStyle, fontSize: 9, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.3)' }}>
                    导出CSV ({selectedSessionIds.size})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 搜索框 */}
          <div style={{ padding: '8px 8px 0', borderBottom: trackFilter ? 'none' : '1px solid var(--border)' }}>
            <input
              value={sessionSearchQuery}
              onChange={e => setSessionSearchQuery(e.target.value)}
              placeholder="按赛道名搜索..."
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 11,
                outline: 'none'
              }}
            />
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {uniqueTracks.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <select
                  value={trackFilter}
                  onChange={e => setTrackFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">全部赛道</option>
                  {uniqueTracks.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}
            {myFilteredSessions.length === 0 ? (
              <EmptyState icon="📋" title="暂无比赛记录" description="在游戏中完成比赛后会自动录制。" />
            ) : (
              paginatedSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={(e) => batchMode ? toggleSessionSelect(e, session.id) : loadAnalysis(session.id)}
                  style={{
                    padding: 8,
                    background: batchMode && selectedSessionIds.has(session.id) ? 'rgba(88,166,255,0.1)' : selectedSession === session.id ? '#0d1117' : '#161b22',
                    borderRadius: 6,
                    marginBottom: 4,
                    cursor: 'pointer',
                    border: batchMode && selectedSessionIds.has(session.id) ? '1px solid #58a6ff' : selectedSession === session.id ? '1px solid #58a6ff' : '1px solid #21262d',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <TrackThumbnail trackId={session.trackId} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.trackName || '未知赛道'}
                        </span>
                        <span style={{ fontSize: 9, color: '#484f58' }}>
                          {session.autoRecorded ? '自动' : '手动'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e' }}>
                        <span>{formatDate(session.savedAt)}</span>
                        <span>最快 <span style={{ color: '#d29922', fontFamily: 'monospace', fontWeight: 600 }}>{formatTime(session.laps?.best)}</span></span>
                      </div>
                      {session.tuneId && tunes[session.tuneId] && (
                        <div style={{
                          fontSize: 9,
                          padding: '1px 4px',
                          background: 'rgba(88,166,255,0.1)',
                          borderRadius: 3,
                          color: '#58a6ff',
                          border: '1px solid rgba(88,166,255,0.3)',
                          display: 'inline-block',
                          marginTop: 3,
                          fontWeight: 600
                        }}>
                          调校: {tunes[session.tuneId]?.name || '已命名'}
                        </div>
                      )}
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(session.id); }} style={{ ...btnSmallStyle, padding: '2px 6px', background: 'rgba(218,54,51,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>删除</button>
                        {batchMode && (
                          <div
                            onClick={(e) => { e.stopPropagation(); toggleSessionSelect(e, session.id); }}
                            style={{
                              width: 14, height: 14, borderRadius: 3,
                              border: selectedSessionIds.has(session.id) ? '2px solid #58a6ff' : '2px solid var(--border)',
                              background: selectedSessionIds.has(session.id) ? '#58a6ff' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', flexShrink: 0, marginLeft: 'auto'
                            }}
                          >
                            {selectedSessionIds.has(session.id) && (
                              <span style={{ color: '#000', fontSize: 9, fontWeight: 700 }}>✓</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
                <button onClick={() => setSessionPage(1)} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9 }}>&laquo;</button>
                <button onClick={() => setSessionPage(p => Math.max(1, p - 1))} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9 }}>&lsaquo;</button>
                <span style={{ fontSize: 10, color: '#8b949e' }}>
                  {sessionPage} / {totalPages} 页
                </span>
                <button onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9 }}>&rsaquo;</button>
                <button onClick={() => setSessionPage(totalPages)} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9 }}>&raquo;</button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧明细面板 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <LoadingSpinner />
          ) : selectedSession && analysis ? (
            <div>
              {/* 车辆与调校快照卡片 */}
              {(() => {
                const hasTune = !!sessionTune;
                const piClass = sessionTune?.targetPiClass || '';
                const piColors = {
                  'D': { bg: 'rgba(88,166,255,0.12)', border: '#58a6ff', text: '#58a6ff' },
                  'C': { bg: 'rgba(254,215,0,0.1)', border: '#d29922', text: '#d29922' },
                  'B': { bg: 'rgba(63,185,80,0.1)', border: '#3fb950', text: '#3fb950' },
                  'A': { bg: 'rgba(248,81,73,0.1)', border: '#f85149', text: '#f85149' },
                  'S1': { bg: 'rgba(163,113,247,0.12)', border: '#a371f7', text: '#a371f7' },
                  'S2': { bg: 'rgba(163,113,247,0.18)', border: '#d2a8ff', text: '#d2a8ff' },
                  'X': { bg: 'rgba(255,123,114,0.15)', border: '#ff7b72', text: '#ff7b72' }
                };
                const cls = piColors[piClass] || { bg: 'rgba(255,255,255,0.04)', border: '#30363d', text: '#8b949e' };
                const vehicle = analysis.vehicle;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: '#8b949e', marginBottom: 2 }}>当前赛车</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {vehicle?.name || `车辆 #${vehicle?.ordinal || '未知'}`}
                      </div>
                      {vehicle?.drivetrain && (
                        <div style={{ fontSize: 9, color: '#8b949e', marginTop: 2 }}>驱动系统: {vehicle.drivetrain}</div>
                      )}
                    </div>

                    <div style={{ width: 1, height: 36, background: 'var(--border)' }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: '#8b949e', marginBottom: 2 }}>关联调校方案</div>
                      {hasTune ? (
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#58a6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sessionTune.name}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#484f58', fontStyle: 'italic' }}>使用原厂出厂设定</div>
                      )}
                    </div>

                    {hasTune && piClass && (
                      <div style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 900,
                        background: cls.bg, border: `1px solid ${cls.border}`, color: cls.text,
                        fontFamily: 'monospace'
                      }}>
                        {piClass} {sessionTune.targetPi || ''}
                      </div>
                    )}

                    {hasTune ? (
                      <button
                        onClick={() => onNavigate('tunes', { action: 'edit', tuneId: sessionTune.id })}
                        style={btnActiveStyle}
                      >
                        查看车辆调校
                      </button>
                    ) : (
                      <button
                        onClick={() => onNavigate('tunes', { action: 'create', vehicleId: vehicle?.ordinal })}
                        style={btnInactiveStyle}
                      >
                        创建车辆调校
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* 面包屑导航 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setSelectedSession(null); setTrackFilter(''); }}>
                  比赛历史
                </span>
                <span>&gt;</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  单场遥测分析 ({selectedSession.substring(0, 8)})
                </span>
              </div>

              {/* 主标签始终占满详情区宽度，地图和内容都从标签下方开始。 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 12 }}>
                {[
                  { id: 'overview', label: '🏁 赛后总览' },
                  { id: 'professional_review', label: '🏎️ 专业复盘' },
                  { id: 'ai_coach', label: '🧠 改装建议' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '7px 15px',
                      background: activeTab === tab.id ? '#58a6ff' : 'transparent',
                      color: activeTab === tab.id ? '#fff' : '#58a6ff',
                      border: '1px solid #30363d',
                      borderRadius: 5,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'professional_review' && (
                <>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10, padding: '0 2px 10px', borderBottom: '1px solid #30363d' }}>
                    {[
                      { id: 'corners', label: '① 弯道定位' },
                      { id: 'inputs', label: '② 驾驶操作' },
                      { id: 'tires', label: '③ 轮胎抓地' },
                      { id: 'suspension', label: '④ 底盘悬挂' },
                      { id: 'differential', label: '⑤ 动力传动' },
                      { id: 'aero', label: '⑥ 空气动力' },
                      { id: 'tuning', label: '⑦ 遥测调教' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setReviewSubTab(tab.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 18,
                          border: `1px solid ${reviewSubTab === tab.id ? '#58a6ff' : '#30363d'}`,
                          background: reviewSubTab === tab.id ? '#58a6ff' : '#161b22',
                          color: reviewSubTab === tab.id ? '#ffffff' : '#c9d1d9',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {reviewSubTab === 'tuning' && (
                    <div style={{ ...sectionStyle, margin: '0 0 12px', padding: 14, borderColor: 'rgba(63,185,80,0.42)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <h3 style={{ ...sectionTitleStyle, margin: 0, color: '#3fb950' }}>遥测调教建议</h3>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 4 }}>
                            {sessionTune ? '已关联本地调教方案：显示当前值与目标值。' : '未关联本地调教方案：以下为在游戏当前数值基础上的增减量。'}
                          </div>
                        </div>
                        <span style={{ fontSize: 9, color: '#8b949e' }}>不改配件 PI，仅给调教参数建议</span>
                      </div>
                      {telemetryTuningLoading && <LoadingSpinner text="正在从本场遥测提取调教证据..." />}
                      {!telemetryTuningLoading && telemetryTuning && (
                        <>
                          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(88,166,255,0.07)', color: '#c9d1d9', fontSize: 10, marginBottom: 10 }}>
                            {telemetryTuning.summary}
                          </div>
                          {telemetryTuning.recommendations?.length === 0 ? (
                            <div style={{ color: '#8b949e', fontSize: 10 }}>暂无自动调教项；可以继续在其他复盘页签查看轮胎、悬挂和传动证据。</div>
                          ) : telemetryTuning.recommendations.map(item => (
                            <div key={item.id} style={{ marginBottom: 10, padding: 10, borderRadius: 7, background: '#0d1117', border: '1px solid #30363d' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                                <strong style={{ fontSize: 11, color: '#e6edf3' }}>{item.title}</strong>
                                <span style={{ fontSize: 9, color: item.confidence === '高' ? '#f0883e' : '#58a6ff' }}>{item.category} · 证据强度{item.confidence}</span>
                              </div>
                              <div style={{ marginTop: 5, color: '#8b949e', fontSize: 9.5 }}>{item.evidence}</div>
                              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                                {item.changes.map(change => {
                                  const current = getParamValue(sessionTune, change.key);
                                  const target = current === null ? null : (change.relative ? current * (1 + change.delta / 100) : current + change.delta);
                                  const deltaText = `${change.delta > 0 ? '+' : ''}${change.delta}${change.unit}`;
                                  return <div key={change.key} style={{ padding: '6px 8px', borderRadius: 5, background: 'rgba(63,185,80,0.08)', fontSize: 10 }}>
                                    <div style={{ color: '#8b949e' }}>{change.parameter}</div>
                                    {target === null ? <strong style={{ color: '#3fb950' }}>当前值 {change.direction} {deltaText}</strong> : <strong style={{ color: '#3fb950' }}>{Number(current).toFixed(2)} → {target.toFixed(2)}{change.unit}</strong>}
                                  </div>;
                                })}
                              </div>
                              <div style={{ marginTop: 7, color: '#8b949e', fontSize: 9 }}>{item.prerequisite}</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {reviewSubTab !== 'corners' && <div style={{ ...sectionStyle, margin: '0 0 12px', padding: 12, borderColor: 'rgba(88,166,255,0.35)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#58a6ff', fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{reviewSummary.title}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{reviewSummary.note}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {reviewSummary.items.map((item) => (
                          <div key={item.label} style={{ minWidth: 112, padding: '7px 9px', borderRadius: 6, background: '#0d1117', border: '1px solid #30363d' }}>
                            <div style={{ color: '#8b949e', fontSize: 8, marginBottom: 3 }}>{item.label}</div>
                            <div style={{ color: '#e6edf3', fontSize: 11, fontWeight: 750 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>}
                </>
              )}

              {/* 左右双栏大布局包装 */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                
                {/* 地图只服务驾驶复盘：避免在总览、车辆遥测和问诊中重复占用阅读空间。 */}
                {activeTab === 'professional_review' && reviewSubTab === 'corners' && (
                <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0, position: 'static' }}>
                  {/* 2D 赛道操控热力图 */}
                  <div style={{ ...sectionStyle, margin: 0, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: 0, border: 'none', padding: 0 }}>2D 赛道操控热力图</h3>
                      <button
                        onClick={() => setZoomOnSelect(!zoomOnSelect)}
                        style={{
                          padding: '2px 8px',
                          fontSize: 9,
                          background: zoomOnSelect ? '#58a6ff' : '#21262d',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        {zoomOnSelect ? '🔍 切换全图' : '🔍 弯道放大'}
                      </button>
                    </div>
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      fallbackPositions={sessionDetail?.positions || []}
                      width={316}
                      height={240}
                      zoomOnSelect={zoomOnSelect}
                      channelsData={channelsData}
                      highlightedPoints={
                        turnsData?.turns
                          ? turnsData.turns.map((t, idx) => ({
                              x: t.current?.x || t.x || 0,
                              z: t.current?.z || t.z || 0,
                              label: t.name,
                              color: activeTurnIdx === idx ? '#d29922' : (turnsData.turns.slice(0, 3).some(t3 => t3.index === t.index) ? '#f85149' : '#8b949e'),
                              isActive: activeTurnIdx === idx,
                              isTopLoss: turnsData.turns.slice(0, 3).some(t3 => t3.index === t.index)
                            }))
                          : []
                      }
                      cursorPoint={
                        chartCursorPoint || (turnsData?.turns?.[activeTurnIdx]
                          ? {
                              x: turnsData.turns[activeTurnIdx].current?.x || turnsData.turns[activeTurnIdx].x || 0,
                              z: turnsData.turns[activeTurnIdx].current?.z || turnsData.turns[activeTurnIdx].z || 0
                            }
                          : null)
                      }
                    />
                  </div>

                  {/* 重点弯道快速选择 */}
                  <div style={{ ...sectionStyle, margin: 0, padding: 12 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: '0 0 4px 0', border: 'none', padding: 0 }}>快速选择重点弯道</h3>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 9, lineHeight: 1.5, marginBottom: 8 }}>点击弯道，同步地图定位与右侧当前弯道诊断。</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {worstCorners.slice(0, 3).map((corner, i) => {
                        const colors = ['#ff7b72', '#d29922', '#a371f7'];
                        const isActive = turnsData?.turns?.[activeTurnIdx]?.name === corner.name;
                        return (
                          <div
                            key={corner.name}
                            onClick={() => {
                              const foundIdx = turnsData?.turns?.findIndex(t => t.name === corner.name);
                              if (foundIdx !== -1 && foundIdx !== undefined) {
                                setActiveTurnIdx(foundIdx);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              background: isActive ? 'rgba(88,166,255,0.08)' : 'rgba(255,255,255,0.01)',
                              border: `1px solid ${isActive ? '#58a6ff' : 'var(--border)'}`,
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, fontSize: 10.5, color: colors[i] || '#e6edf3' }}>
                                📍 {corner.name}
                              </span>
                              <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                                {corner.hasReference ? <>赤字: <span style={{ color: 'var(--danger)', fontFamily: 'monospace', fontWeight: 'bold' }}>-{corner.deficitKmh.toFixed(0)} 千米/小时</span></> : '最慢弯心'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#8b949e' }}>
                              <span>车速: {corner.apexSpeedKmh.toFixed(0)} 千米/小时</span>
                              <span>{corner.hasReference ? `参考: ${corner.refApexSpeedKmh.toFixed(0)} 千米/小时` : '暂无参考速度'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )}

                {/* 右栏 (flex: 1) 分析详情 Tab 区 */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  
              {/* ==================== TAB 1: 赛后总览 ==================== */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ ...sectionStyle, margin: 0, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}>本场比赛摘要</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {analysis.track?.name || analysis.trackName || '未知赛道'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 5 }}>
                          {analysis.vehicle?.name || `车辆 ${analysis.vehicle?.ordinal || '--'}`} · {analysis.vehicle?.drivetrain || '驱动形式未知'} · {analysis.成绩?.圈数 || '--'} 圈
                        </div>
                      </div>
                      {raceOverview.score && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>本场驾驶表现</div>
                          <div style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 28, fontWeight: 900 }}>
                            {raceOverview.score.总分}<span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> 分</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                      {[
                        { label: '本场最佳圈', value: formatLapTime(raceOverview.currentLap), tone: 'var(--text-primary)' },
                        { label: '理论最佳圈', value: formatLapTime(raceOverview.theoreticalBest), tone: 'var(--success)' },
                        { label: '可追回时间', value: raceOverview.recoverableMs ? `+${formatLapTime(raceOverview.recoverableMs)}` : '--', tone: 'var(--warning)' },
                        { label: '最大分段损失', value: raceOverview.bestSectorLoss ? `+${raceOverview.bestSectorLoss.toFixed(3)} 秒` : '--', tone: 'var(--danger)' }
                      ].map(item => (
                        <div key={item.label} style={{ padding: 10, border: '1px solid var(--border)', background: 'var(--bg-primary)', borderRadius: 6 }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 5 }}>{item.label}</div>
                          <div style={{ color: item.tone, fontSize: 16, fontWeight: 750, fontFamily: 'monospace' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {lapTrendData.length > 1 && (
                    <div style={{ ...sectionStyle, margin: 0 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: '0 0 8px' }}>📈 圈速稳定性趋势</h3>
                      <div style={chartGuideStyle}>
                        <strong>📚 诊断指南与参考区间：</strong> 横轴为圈数，纵轴为单圈时间。蓝线越平表示发挥越稳定；绿色虚线是本场有效圈中的最快圈，仅用于本场内部比较。明显高出的圈可能包含失误、交通或无效圈，应结合下方事件判断。
                      </div>
                      <div style={{ height: 210 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={lapTrendData} margin={{ top: 8, right: 20, bottom: 8, left: 6 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                            <XAxis dataKey="lap" stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '圈数', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                            <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(value) => `${Number(value).toFixed(1)}秒`} />
                            <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '圈速' ? `${Number(value).toFixed(3)} 秒` : `+${Number(value).toFixed(3)} 秒`} />
                            <ReferenceLine y={lapTrendData[0].best} stroke="#3fb950" strokeDasharray="5 3" />
                            <Line type="monotone" dataKey="totalSeconds" name="圈速" stroke="#58a6ff" dot={{ r: 3 }} strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {raceOverview.events.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {raceOverview.events.map(event => (
                        <div key={event.label} style={{ padding: '7px 10px', borderRadius: 5, border: `1px solid ${event.tone === 'danger' ? 'rgba(248,81,73,0.42)' : 'rgba(210,153,34,0.42)'}`, background: event.tone === 'danger' ? 'rgba(248,81,73,0.08)' : 'rgba(210,153,34,0.08)', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{event.label}</span><span style={{ color: event.tone === 'danger' ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, marginLeft: 7 }}>{event.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 本场驾驶表现 */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16,
                    background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.6) 0%, rgba(13, 17, 23, 0.8) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 10, padding: 18,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    marginBottom: 8
                  }}>
                    {/* 高光卡片 */}
                    <div style={{
                      background: 'rgba(63, 185, 80, 0.03)',
                      border: '1px solid rgba(63, 185, 80, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(63, 185, 80, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>🏆</span> 驾驶表现高光
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.highlights.map((h, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#3fb950' }}>•</span>
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 缺陷与秒数损失卡片 */}
                    <div style={{
                      background: 'rgba(248, 81, 73, 0.03)',
                      border: '1px solid rgba(248, 81, 73, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#ff7b72', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(248, 81, 73, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>⚠️</span> 关键失误取证
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.flaws.map((f, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#ff7b72' }}>•</span>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 驾驶脚法提升指南 */}
                    <div style={{
                      background: 'rgba(210, 153, 34, 0.03)',
                      border: '1px solid rgba(210, 153, 34, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#d29922', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(210, 153, 34, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>🚦</span> 驾驶改进动作指南
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.recommendations.map((r, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#d29922' }}>•</span>
                            <span dangerouslySetInnerHTML={{ __html: r }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>



                  {/* 本场各圈与分段表现 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                    {/* 多圈分段计时对比表 */}
                    {advancedData?.lapSectorDetails && advancedData.lapSectorDetails.length > 0 && (
                      <div style={{ ...sectionStyle, margin: 0, flex: 1 }}>
                        <h3 style={sectionTitleStyle}>🏁 赛局多圈分段计时对比</h3>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 10 }}>
                          绿色底色代表全场最快分段时间；黄色底色和粗体代表全场最快单圈。
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px' }}>圈数</th>
                                <th style={{ padding: '6px 8px' }}>分段一</th>
                                <th style={{ padding: '6px 8px' }}>分段二</th>
                                <th style={{ padding: '6px 8px' }}>分段三</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>单圈总时长</th>
                              </tr>
                            </thead>
                            <tbody>
                              {advancedData.lapSectorDetails.map((lapDetail) => {
                                const isBestLap = lapDetail.sectors.every(s => s.loss === 0) || (analysis?.成绩?.总时长 && Math.abs(lapDetail.totalTime * 1000 - analysis.成绩.总时长) < 100);
                                return (
                                  <tr
                                    key={lapDetail.lap}
                                    style={{
                                      borderBottom: '1px solid rgba(48,54,61,0.2)',
                                      background: isBestLap ? 'rgba(210,153,34,0.06)' : 'transparent',
                                      fontWeight: isBestLap ? 'bold' : 'normal'
                                    }}
                                  >
                                    <td style={{ padding: '8px 8px', color: isBestLap ? '#d29922' : 'inherit' }}>
                                      第 {lapDetail.lap} 圈 {isBestLap && '🌟'}
                                    </td>
                                    {lapDetail.sectors.map((s, idx) => {
                                      const isBestSector = s.loss === 0;
                                      return (
                                        <td
                                          key={idx}
                                          style={{
                                            padding: '8px 8px',
                                            fontFamily: 'monospace',
                                            color: isBestSector ? '#56d364' : '#e6edf3',
                                            background: isBestSector ? 'rgba(63,185,80,0.08)' : 'transparent'
                                          }}
                                        >
                                          {s.time?.toFixed(3)}s
                                        </td>
                                      );
                                    })}
                                    {/* 补齐不足 3 个分段的情况 */}
                                    {Array.from({ length: Math.max(0, 3 - lapDetail.sectors.length) }).map((_, idx) => (
                                      <td key={`empty-${idx}`} style={{ padding: '8px 8px', color: '#484f58' }}>--</td>
                                    ))}
                                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: isBestLap ? '#d29922' : '#e6edf3' }}>
                                      {lapDetail.totalTime?.toFixed(3)}s
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div style={{ ...sectionStyle, margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                        <div>
                          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>📍 本场重点弯道</h3>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                            有参考速度时按弯心速度赤字排序；否则展示弯心速度最低的弯道。
                          </div>
                        </div>
                        <button onClick={() => { setReviewSubTab('corners'); setActiveTab('professional_review'); }} style={{ ...btnInactiveStyle, padding: '4px 8px', fontSize: 10 }}>进入专业复盘</button>
                      </div>
                      {worstCorners.length === 0 ? (
                        <div style={{ padding: '10px 0', color: 'var(--text-secondary)', fontSize: 11 }}>尚未生成弯道数据；完成一场带赛道记录的比赛后会在这里显示。</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                          {worstCorners.map((corner, index) => (
                            <button
                              key={corner.index ?? corner.name ?? index}
                              onClick={() => {
                                const turnIndex = turnsData?.turns?.findIndex((turn) => (turn.index ?? turn.name) === (corner.index ?? corner.name));
                                if (turnIndex >= 0) setActiveTurnIdx(turnIndex);
                                setReviewSubTab('corners');
                                setActiveTab('professional_review');
                              }}
                              style={{ textAlign: 'left', padding: 10, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.02)', border: `1px solid ${['#ff7b72', '#f0883e', '#a371f7'][index]}`, color: 'var(--text-primary)' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700, fontSize: 11 }}>
                                <span>#{index + 1} {corner.name || `弯道 ${index + 1}`}</span>
                                <span style={{ color: ['#ff7b72', '#f0883e', '#a371f7'][index] }}>{corner.apexSpeedKmh.toFixed(0)} 千米/小时</span>
                              </div>
                              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-secondary)' }}>
                                {corner.hasReference ? `参考 ${corner.refApexSpeedKmh.toFixed(0)} · 速度赤字 ${corner.deficitKmh.toFixed(0)} 千米/小时` : '暂无参考速度 · 这是本场弯心速度较低的弯道'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 3: 车辆遥测 ==================== */}
              {activeTab === 'professional_review' && ['tires', 'suspension', 'differential', 'aero'].includes(reviewSubTab) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  {channelsLoading && !channelsData && <LoadingSpinner text="正在载入本场车辆证据..." />}
                  {!channelsLoading && !channelsData?.channels?.length && (
                    <EmptyState title="暂时没有可用的车辆遥测信号" description="这场比赛没有保存足够的遥测通道，无法生成车辆物理图表。" />
                  )}
                  {channelsData?.channels?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 子页签工具栏 */}
                      <div style={{ display: 'none' }}>
                        {[
                          { id: 'tires', label: '🛞 轮胎状况' },
                          { id: 'suspension', label: '⛓️ 避震悬架' },
                          { id: 'differential', label: '⚙️ 传动差速' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setChartSubTab(sub.id)}
                            style={{
                              padding: '4px 12px',
                              background: chartSubTab === sub.id ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                              color: chartSubTab === sub.id ? '#000' : '#c9d1d9',
                              border: `1px solid ${chartSubTab === sub.id ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 20,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>

                      {/* 3.1 轮胎与抓地 */}
                      {chartSubTab === 'tires' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 胎温调校计算助手 */}
                          {(() => {
                            const stats = advancedData?.tempStats || { avgFL: 80, avgFR: 80, avgRL: 80, avgRR: 80 };
                            const diffFront = Math.abs(stats.avgFL - stats.avgFR).toFixed(1);
                            const diffRear = Math.abs(stats.avgRL - stats.avgRR).toFixed(1);
                            const avgFront = ((stats.avgFL + stats.avgFR) / 2).toFixed(1);
                            const avgRear = ((stats.avgRL + stats.avgRR) / 2).toFixed(1);
                            
                            const tiresAdvice = [];
                            if (Math.max(stats.avgFL, stats.avgFR, stats.avgRL, stats.avgRR) > 94) {
                              tiresAdvice.push('⚠️ 部分轮胎工作温度偏高（过热会急剧损失抓地力）：建议在调校中降低对应轮位胎压 1.0 - 2.0 PSI，或减小负外倾角 0.2 - 0.4° 以均匀胎面接触。');
                            }
                            if (Math.min(stats.avgFL, stats.avgFR, stats.avgRL, stats.avgRR) < 68) {
                              tiresAdvice.push('⚠️ 部分轮胎无法达到最佳抓地温度（偏冷）：建议稍微增加对应轮位胎压 1.0 - 1.5 PSI 以增加侧向胎壁阻尼，或者多进行热胎滑行。');
                            }
                            if (Math.abs(avgFront - avgRear) > 8) {
                              tiresAdvice.push(avgFront > avgRear 
                                ? '⚠️ 前后轴轮胎温差过大（前轴过热）：车辆存在较严重的转向不足（推头）。建议调软前防倾杆（ARB）或前弹簧刚度，或稍微调硬后悬挂。'
                                : '⚠️ 前后轴轮胎温差过大（后轴过热）：车辆存在转向过度倾向（甩尾）。建议调软后防倾杆（ARB）或后弹簧刚度，或增大后外倾角。');
                            }
                            if (tiresAdvice.length === 0) tiresAdvice.push('✅ 四轮工作胎温分配合理，抓地热效应良好。');

                            return (
                              <div style={{ background: 'rgba(88,166,255,0.02)', border: '1px solid rgba(88,166,255,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#58a6ff' }}>🛞 轮胎温差与抓地调校助手</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>前轴平均温 / 左右差</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{avgFront}°C / {diffFront}°C</div>
                                  </div>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>后轴平均温 / 左右差</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{avgRear}°C / {diffRear}°C</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {tiresAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 胎温图 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>轮胎工作温度变化曲线（绿色区域为理想工作区间，单位：摄氏度）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为胎温。两条绿色虚线分别是 75°C 和 90°C，虚线之间的浅绿色区域为理想抓地区；低于该区域表示尚未充分升温，高于该区域表示可能过热。
                            </div>
                            <div style={{ height: 200 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[40, 110]} unit="°C" />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)}°C`} />
                                  <ReferenceArea y1={75} y2={90} fill="rgba(63,185,80,0.06)" />
                                  <ReferenceLine y={75} stroke="#3fb950" strokeDasharray="5 3" />
                                  <ReferenceLine y={90} stroke="#3fb950" strokeDasharray="5 3" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="tempFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="tempFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="tempRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="tempRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.5} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 滑移率图 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>原始四轮滑移率变化曲线（橙线打滑、红线抱死）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#c9d1d9', marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴是赛道距离，纵轴是轮胎滑移率。<span style={{ color: '#f0883e', fontWeight: 700 }}>橙色虚线：+15% 打滑警戒线</span>，超过它表示驱动轮空转；<span style={{ color: '#f85149', fontWeight: 700 }}>红色虚线：-15% 抱死警戒线</span>，低于它表示制动轮接近抱死；灰色实线为 0% 零滑移基线。
                            </div>
                            <div style={{ height: 220 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" margin={{ top: 8, right: 18, bottom: 8, left: 0 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={slipChartDomain} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} label={{ value: '轮胎滑移率', angle: -90, position: 'insideLeft', offset: 8, fill: '#8b949e', fontSize: 10 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
                                  <ReferenceLine y={0.15} stroke="#f0883e" strokeDasharray="4 2" />
                                  <ReferenceLine y={-0.15} stroke="#f85149" strokeDasharray="4 2" />
                                  <ReferenceLine y={0} stroke="#484f58" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="slipFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="slipFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="slipRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="slipRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.8} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.2 避震与悬挂 */}
                      {chartSubTab === 'suspension' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 悬挂调校计算助手 */}
                          {(() => {
                            const bottomingTicks = channelsData.channels.filter(c => c.suspFL < 0.05 || c.suspFR < 0.05 || c.suspRL < 0.05 || c.suspRR < 0.05).length;
                            const suspAdvice = [];
                            if (bottomingTicks > 35) {
                              suspAdvice.push('⚠️ 避震器行程频繁用尽（托底）：检测到车辆在多处颠簸段或高速压缩下触底。建议将车身高度上调 1.0 - 2.0 cm，或将弹簧刚度（前后轴）增加 8%-12%，并配合上调阻尼压缩阀。');
                            } else if (bottomingTicks > 0) {
                              suspAdvice.push('💡 避震器有轻微托底：在个别大起伏路段发生托底。若不严重可忽略；若导致车辆颠跳，可稍微增加前束角阻尼或调硬弹簧。');
                            } else {
                              suspAdvice.push('✅ 悬挂行程利用充分，且未发生机械托底限制。');
                            }
                            return (
                              <div style={{ background: 'rgba(188,136,255,0.02)', border: '1px solid rgba(188,136,255,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#bc88ff' }}>⛓️ 避震托底与悬挂调校助手</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>本场托底采样点总数</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: bottomingTicks > 35 ? '#f85149' : '#e6edf3' }}>{bottomingTicks} 个</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {suspAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 避震分布直方图 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>四轮避震压缩位置分布图</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴是归一化避震压缩区间，纵轴是各区间出现的采样比例。重点观察数据是否长期堆积在两端；赛道路肩和单向弯会造成自然偏态，不要求图形必须完全对称。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={suspensionHistogram}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="range" stroke="#8b949e" tick={{ fontSize: 8 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} />
                                  <Bar dataKey="左前" fill="#58a6ff" />
                                  <Bar dataKey="右前" fill="#3fb950" />
                                  <Bar dataKey="左后" fill="#d29922" />
                                  <Bar dataKey="右后" fill="#ff7b72" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 原始悬挂行程 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>原始四轮悬挂行程变化图（正常工作区间：5% - 95%）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 浅绿色区域是 5%-95% 常用工作区间；红色虚线是 5% 下限，触碰表示行程接近一端极限；蓝色虚线是 95% 上限，触碰表示接近另一端极限。应结合路肩和腾空事件判断，避免只凭单个尖峰调校。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)}`} />
                                  <ReferenceArea y1={0.05} y2={0.95} fill="rgba(63,185,80,0.03)" />
                                  <ReferenceLine y={0.05} stroke="#f85149" strokeWidth={1} strokeDasharray="3 3" />
                                  <ReferenceLine y={0.95} stroke="#58a6ff" strokeWidth={1} strokeDasharray="3 3" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="suspFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="suspFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="suspRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="suspRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.3 传动与差速 */}
                      {chartSubTab === 'differential' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 传动调校计算助手 */}
                          {(() => {
                            const bangingTime = channelsData.channels.filter(c => c.rpm > maxSessionRpm * 0.98).length * 0.016;
                            const diffAdvice = [];
                            if (bangingTime > 0.6) {
                              diffAdvice.push('⚠️ 换挡断油超时：检测到引擎多次顶红线断油。换挡晚了，需提前手动升档，或拉长终传比（Final Drive）滑块。');
                            } else {
                              diffAdvice.push('✅ 换挡时机节奏良好，完美落入引擎理想输出带。');
                            }
                            return (
                              <div style={{ background: 'rgba(210,153,34,0.02)', border: '1px solid rgba(210,153,34,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#d29922' }}>⚙️ 差速器与换挡节奏调校助手</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {diffAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* rpm 与档位 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>发动机转速与档位变化图</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，左轴为发动机转速，右轴为档位。绿色虚线是本场最高转速的 70% 参考线，红色虚线是 95% 高转速参考线；它们用于观察换挡节奏，并非车辆真实动力带或断油转速。
                            </div>
                            <div style={{ height: 220 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={gearingData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis yAxisId="left" stroke="#3fb950" tick={{ fontSize: 9 }} domain={[0, Math.round(maxSessionRpm + 1000)]} unit="rpm" />
                                  <YAxis yAxisId="right" orientation="right" stroke="#58a6ff" tick={{ fontSize: 9 }} domain={[1, 8]} tickCount={8} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '转速' ? `${Number(value).toFixed(0)} RPM` : `${Number(value).toFixed(0)} 档`} />
                                  <ReferenceLine yAxisId="left" y={maxSessionRpm * 0.95} stroke="#f85149" strokeDasharray="4 2" />
                                  <ReferenceLine yAxisId="left" y={maxSessionRpm * 0.70} stroke="#3fb950" strokeDasharray="4 2" />
                                  <Line yAxisId="left" type="monotone" dataKey="rpm" stroke="#3fb950" name="转速" dot={false} strokeWidth={1.5} />
                                  <Line yAxisId="right" type="stepAfter" dataKey="gear" stroke="#58a6ff" name="档位" dot={false} strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 轮速差 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 8px', fontSize: 11 }}>出弯驱动轮速差对比</h4>
                            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#c9d1d9', marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为左右轮的原始轮速差。此信号用于比较同一出弯前后变化；当前记录未保存轮胎有效半径，因此不能把数值换算为千米/小时，也不使用固定阈值作调校结论。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={diffData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)}`} />
                                  <Line type="monotone" dataKey="前轴速差" stroke="#58a6ff" dot={false} strokeWidth={1.5} />
                                  <Line type="monotone" dataKey="后轴速差" stroke="#3fb950" dot={false} strokeWidth={1.5} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.4 空气动力 */}
                      {chartSubTab === 'aero' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 空力调校计算助手 */}
                          {(() => {
                            const aeroAdvice = [];
                            aeroAdvice.push('💡 空气下压力调校助手：本车静态下压力分配符合出厂标称设定。若高速弯频现前轴抓地脱节（推头），建议调大前压力 15% - 25% ；若车尾高速发飘（甩尾），建议调大后压力 10% - 20%。');
                            return (
                              <div style={{ background: 'rgba(63,185,80,0.02)', border: '1px solid rgba(63,185,80,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#3fb950' }}>🍃 空气动力平衡调校助手</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {aeroAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: '#c9d1d9', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 空力下压力代理：悬挂压缩量 vs 车速 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 6px', fontSize: 11 }}>前后悬挂压缩量 vs 车速（高速段压缩增大反映下压力增长）</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南：</strong> 横轴为车速，纵轴为前后轴悬挂平均压缩率（%）。若高速段前后轴压缩曲线同步增大，说明下压力设定有效；若前后差距大，说明空力平衡偏向一端。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={aeroData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="speed" stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '车速（千米/小时）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" domain={[0, 100]} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(1)}%`} />
                                  <Line type="monotone" dataKey="前轴压缩" stroke="#58a6ff" name="前轴" dot={false} strokeWidth={1.5} />
                                  <Line type="monotone" dataKey="后轴压缩" stroke="#ff7b72" name="后轴" dot={false} strokeWidth={1.5} />
                                  <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 车身高度：悬挂伸缩量随距离变化 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 6px', fontSize: 11 }}>四轮悬挂伸缩率变化曲线（路肩压缩峰值与平坦路面对比）</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南：</strong> 横轴为赛道距离，纵轴为各轮悬挂伸展率（0%=全压缩，100%=全伸展）。路肩或大颠簸段曲线会急剧下探；若四轮长期低于 20% 区间，建议提高车身高度或调硬弹簧以避免托底。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}`} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
                                  <ReferenceLine y={0.15} stroke="#f85149" strokeDasharray="4 2" label={{ value: '托底警戒', fill: '#f85149', fontSize: 8 }} />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="suspFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="suspFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="suspRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="suspRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.5} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.5 参数匹配规则 */}
                      {chartSubTab === 'rules' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 常见操控问题规则诊断 */}
                          <div style={{ ...sectionStyle, margin: 0, padding: 12 }}>
                            <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 12 }}>常见操控问题诊断规则</h3>
                            <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, marginTop: 4 }}>
                              如果您在驾驶时有具体的不适反馈，请在下方选择最接近的物理感受。系统将实时比对当前车辆调校参数，给出确切数值修改方案。
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                              {PROBLEM_CATEGORIES.map(cat => (
                                <button
                                  key={cat.id}
                                  onClick={() => { setSelectedIssueCategory(cat.id); setSelectedIssueId(null); }}
                                  style={{
                                    padding: '4px 10px',
                                    background: selectedIssueCategory === cat.id ? cat.color : '#1f242c',
                                    color: '#fff',
                                    border: '1px solid #30363d',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {cat.label}
                                </button>
                              ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
                              {/* 问题列表 */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                                {DRIVING_PROBLEMS.filter(p => p.category === selectedIssueCategory).map(prob => (
                                  <div
                                    key={prob.id}
                                    onClick={() => setSelectedIssueId(prob.id)}
                                    style={{
                                      padding: '6px 8px',
                                      background: selectedIssueId === prob.id ? 'rgba(88, 166, 255, 0.1)' : '#161b22',
                                      border: selectedIssueId === prob.id ? '1px solid #58a6ff' : '1px solid #21262d',
                                      borderRadius: 4,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: 10, color: selectedIssueId === prob.id ? '#58a6ff' : '#e6edf3' }}>
                                      {prob.name}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 规则数值修改对比表 */}
                              <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12 }}>
                                {selectedIssueId ? (() => {
                                  const prob = DRIVING_PROBLEMS.find(p => p.id === selectedIssueId);
                                  if (!prob) return null;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e6edf3' }}>{prob.name}（典型表现：{prob.symptoms}）</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {Object.entries(prob.fixes).map(([paramKey, fix]) => {
                                          const currentVal = getParamValue(sessionTune, paramKey);
                                          const hasCurrent = currentVal !== null && currentVal !== undefined;
                                          const paramNameMap = {
                                            frontTirePressure: '前胎压', rearTirePressure: '后胎压',
                                            frontCamber: '前外倾角', rearCamber: '后外倾角',
                                            frontToe: '前束角', rearToe: '后束角',
                                            frontSpring: '前弹簧刚度', rearSpring: '后弹簧刚度',
                                            frontDamping: '前阻尼压缩', rearDamping: '后阻尼压缩',
                                            frontARB: '前防倾杆', rearARB: '后防倾杆',
                                            frontRideHeight: '前车身高度', rearRideHeight: '后车身高度',
                                            diffAccel: '差速器加速锁', diffDecel: '差速器减速锁',
                                            diffCenter: '中央差速偏置', finalDrive: '终传比',
                                            frontDownforce: '前空气下压力', rearDownforce: '后空气下压力'
                                          };
                                          const unitMap = {
                                            frontTirePressure: ' PSI', rearTirePressure: ' PSI',
                                            frontCamber: '°', rearCamber: '°', frontToe: '°', rearToe: '°',
                                            frontRideHeight: ' cm', rearRideHeight: ' cm',
                                            diffAccel: '%', diffDecel: '%', diffCenter: '%',
                                            frontDownforce: ' lbs', rearDownforce: ' lbs'
                                          };
                                          return (
                                            <div key={paramKey} style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1117', padding: '4px 8px', borderRadius: 4, fontSize: 10 }}>
                                              <span style={{ color: '#8b949e' }}>{paramNameMap[paramKey] || paramKey}</span>
                                              <span style={{ color: '#e6edf3' }}>
                                                {hasCurrent ? (
                                                  <span>当前: {currentVal}{unitMap[paramKey] || ''} ➡️ <strong style={{ color: '#3fb950' }}>目标: {(currentVal + fix.delta).toFixed(1)}{unitMap[paramKey] || ''}</strong></span>
                                                ) : (
                                                  <strong style={{ color: fix.delta > 0 ? '#3fb950' : '#f85149' }}>推荐微调: {fix.delta > 0 ? '+' : ''}{fix.delta}{unitMap[paramKey] || ''}</strong>
                                                )}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => {
                                          onNavigate('tunes', {
                                            action: 'edit',
                                            tuneId: sessionTune?.id,
                                            vehicleId: analysis.vehicle?.ordinal,
                                            suggestedChanges: prob.fixes,
                                            problemName: prob.name,
                                            trackName: analysis.track?.name || analysis.trackName || '未知赛道'
                                          });
                                        }}
                                        style={{
                                          marginTop: 8,
                                          width: '100%',
                                          padding: '8px 12px',
                                          background: '#d29922',
                                          border: 'none',
                                          borderRadius: 4,
                                          color: '#0d1117',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          boxShadow: '0 2px 6px rgba(210, 153, 34, 0.3)',
                                          textAlign: 'center',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        🔧 同步调整方案至调校中心
                                      </button>
                                    </div>
                                  );
                                })() : (
                                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: 10 }}>
                                    请在左侧选择具体驾驶不适问题以输出规则调参数值。
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== TAB 2: 驾驶复盘 ==================== */}
              {activeTab === 'professional_review' && ['corners', 'inputs'].includes(reviewSubTab) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 子页签切换工具栏 */}
                  <div style={{ display: 'none' }}>
                    {[
                      { id: 'analysis', label: '📊 赛段与弯道分析' },
                      { id: 'inputs', label: '📈 驾驶操作曲线' }
                    ].map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setDrivingSubTab(sub.id)}
                        style={{
                          padding: '4px 12px',
                          background: drivingSubTab === sub.id ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                          color: drivingSubTab === sub.id ? '#0d1117' : '#c9d1d9',
                          border: `1px solid ${drivingSubTab === sub.id ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>

                  {drivingSubTab === 'analysis' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 多圈分段计时对比表 */}
                      {false && advancedData?.lapSectorDetails && advancedData.lapSectorDetails.length > 0 && (
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h3 style={sectionTitleStyle}>⏱️ 赛局多圈分段计时对比</h3>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '6px 8px' }}>圈数</th>
                                  <th style={{ padding: '6px 8px' }}>分段一</th>
                                  <th style={{ padding: '6px 8px' }}>分段二</th>
                                  <th style={{ padding: '6px 8px' }}>分段三</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>单圈总时长</th>
                                </tr>
                              </thead>
                              <tbody>
                                {advancedData.lapSectorDetails.map((lapDetail) => {
                                  const isBestLap = lapDetail.sectors.every(s => s.loss === 0) || (analysis?.成绩?.总时长 && Math.abs(lapDetail.totalTime * 1000 - analysis.成绩.总时长) < 100);
                                  return (
                                    <tr key={lapDetail.lap} style={{ borderBottom: '1px solid rgba(48,54,61,0.2)', background: isBestLap ? 'rgba(210,153,34,0.06)' : 'transparent', fontWeight: isBestLap ? 'bold' : 'normal' }}>
                                      <td style={{ padding: '8px 8px', color: isBestLap ? '#d29922' : 'inherit' }}>第 {lapDetail.lap} 圈 {isBestLap && '🌟'}</td>
                                      {lapDetail.sectors.map((s, idx) => (
                                        <td key={idx} style={{ padding: '8px 8px', fontFamily: 'monospace', color: s.loss === 0 ? '#56d364' : '#e6edf3', background: s.loss === 0 ? 'rgba(63,185,80,0.08)' : 'transparent' }}>{s.time?.toFixed(3)}s</td>
                                      ))}
                                      {Array.from({ length: Math.max(0, 3 - lapDetail.sectors.length) }).map((_, idx) => (
                                        <td key={`empty-${idx}`} style={{ padding: '8px 8px', color: '#484f58' }}>--</td>
                                      ))}
                                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: isBestLap ? '#d29922' : '#e6edf3' }}>{lapDetail.totalTime?.toFixed(3)}s</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 弯道列表 */}
                      <div style={{ ...sectionStyle, margin: 0, padding: 12, order: 2 }}>
                        <h3 style={sectionTitleStyle}>📐 弯道数据分析表</h3>
                        {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>暂无弯道分析数据</div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '8px 4px' }}>弯道</th>
                                  <th style={{ padding: '8px 4px' }}>类型</th>
                                  <th style={{ padding: '8px 4px' }}>入弯 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>弯心 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>出弯 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>档位</th>
                                  <th style={{ padding: '8px 4px' }}>横向G</th>
                                </tr>
                              </thead>
                              <tbody>
                                {turnsData.turns.map((t, idx) => {
                                  const apexSpeed = t.current?.apexSpeed ?? 0;
                                  const peakLatG = t.current?.peakLatG ?? 0;
                                  const isSelected = activeTurnIdx === idx;
                                  const recEntry = t.recommended?.entrySpeed || '-';
                                  const recApex = t.recommended?.apexSpeed || '-';
                                  const recExit = t.recommended?.exitSpeed || '-';
                                  const speedDiff = typeof recApex === 'number' && recApex > 0 ? apexSpeed - recApex : 0;
                                  let diffBadge = null;
                                  if (recApex > 0 && typeof recApex === 'number') {
                                    if (speedDiff < -5) diffBadge = <span style={badgeRedStyle}>↓{Math.abs(speedDiff)}</span>;
                                    else if (speedDiff >= 2) diffBadge = <span style={badgeGreenStyle}>↑{speedDiff}</span>;
                                  }
                                  return (
                                    <tr key={t.index ?? idx} onClick={() => setActiveTurnIdx(idx)} style={{ borderBottom: '1px solid rgba(48, 54, 61, 0.3)', background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent', cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                                      <td style={{ padding: '8px 4px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'inherit' }}>{t.name}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.turnCategory || (t.direction === 'left' ? '左弯' : '右弯')}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.entrySpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/{recEntry}</span></td>
                                      <td style={{ padding: '8px 4px', fontWeight: 700 }}>{apexSpeed} <span style={{ color: '#8b949e', fontSize: 9, fontWeight: 'normal' }}>/{recApex}</span> {diffBadge}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.exitSpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/{recExit}</span></td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.gear ?? '-'}</td>
                                      <td style={{ padding: '8px 4px', color: peakLatG > 1.8 ? '#3fb950' : '#8b949e' }}>{peakLatG.toFixed(1)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* 单弯复盘 */}
                      <div style={{ ...sectionStyle, margin: 0, padding: 12, order: 1, borderColor: 'rgba(88,166,255,0.35)' }}>
                        {!selectedTurnReview ? (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 11, textAlign: 'center', padding: 8 }}>请选择上方或者左侧弯道列表开始弯角技术分析。</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                              <div>
                                <div style={{ color: '#58a6ff', fontSize: 9, fontWeight: 800, marginBottom: 3 }}>当前弯道诊断</div>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{selectedTurnReview.turn.name} <span style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 500 }}>{selectedTurnReview.turn.turnCategory || selectedTurnReview.turn.type || '弯道'}</span></div>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 600 }}>本场优先关注：{selectedTurnReview.focus}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                              {selectedTurnReview.phases.map((phase, index) => (
                                <div key={phase.id} style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--bg-primary)', borderRadius: 6, padding: 10, minHeight: 110 }}>
                                  {index < selectedTurnReview.phases.length - 1 && <div style={{ position: 'absolute', top: 23, right: -6, width: 12, height: 1, background: 'var(--border)' }} />}
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 9, marginBottom: 5 }}>{phase.label}</div>
                                  <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, fontFamily: 'monospace', marginBottom: 4 }}>{phase.value}</div>
                                  <div style={{ color: phase.detail.startsWith('慢') ? 'var(--danger)' : 'var(--accent)', fontSize: 9, marginBottom: 6 }}>{phase.detail}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 9, lineHeight: 1.4 }}>{phase.note}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {drivingSubTab === 'inputs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 新增：按赛道距离定位制动动作与抱死事件 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>制动区证据图：车速、刹车与减速度</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离；黄色线是车速，红线是刹车深度，紫线是纵向减速度绝对值。红色圆点表示刹车超过 40% 且任一车轮滑移率低于 -15% 的抱死采样点。用于判断刹车点、松刹节奏和抱死发生位置，不设置通用减速度阈值。
                        </div>
                        <div style={{ height: 230 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={brakingEvidenceData} syncId="overlaySync" margin={{ top: 8, right: 22, bottom: 8, left: 0 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={7} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis yAxisId="speed" stroke="#ffdf80" tick={{ fontSize: 9 }} label={{ value: '车速', angle: -90, position: 'insideLeft', fill: '#ffdf80', fontSize: 10 }} />
                              <YAxis yAxisId="brake" orientation="right" domain={[0, 100]} stroke="#f85149" tick={{ fontSize: 9 }} unit="%" />
                              <YAxis yAxisId="g" hide domain={[0, 'auto']} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '刹车深度' ? `${Number(value).toFixed(0)}%` : name === '纵向减速度' ? `${Number(value).toFixed(2)} G` : `${Number(value).toFixed(0)} 千米/小时`} />
                              <Line yAxisId="speed" type="monotone" dataKey="speed" name="车速" stroke="#ffdf80" dot={false} strokeWidth={1.7} />
                              <Line yAxisId="brake" type="monotone" dataKey="brake" name="刹车深度" stroke="#f85149" dot={false} strokeWidth={1.4} />
                              <Line yAxisId="g" type="monotone" dataKey="decel" name="纵向减速度" stroke="#bc8cff" dot={false} strokeWidth={1.4} />
                              <Line yAxisId="speed" dataKey="lockupSpeed" name="抱死位置" stroke="transparent" connectNulls={false} dot={{ r: 3, fill: '#f85149', stroke: '#ffffff', strokeWidth: 1 }} activeDot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 油门与刹车对比图 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>油门与刹车控制踏板深度对比（平滑、顺畅的交替是高圈速的秘密）</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为踏板开度。绿色为油门、红色为刹车；两条线长时间同时抬起表示无动力滑行，明显重叠表示油刹同时输入。重点观察刹车释放与开油是否连续平顺。
                        </div>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={channelsData?.channels || []} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[0, 100]} unit="%" />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)}%`} />
                              <Line type="monotone" dataKey="throttle" stroke="#3fb950" name="油门" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="brake" stroke="#f85149" name="刹车" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 新图表：车速与方向盘转向对比图 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>车速与方向盘转向角度对比图（正值代表向右，负值代表向左。横轴为距离）</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 黄色线为车速，蓝色线为转向输入，灰色实线为方向盘居中的 0% 基线。转向曲线应保持连续；锯齿和短时间反向输入代表弯中修正。不同车型转向比差异很大，因此不设置统一的高速转向幅值阈值。
                        </div>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={steeringSpeedData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis yAxisId="left" stroke="#ffdf80" tick={{ fontSize: 9 }} domain={[0, 360]} label={{ value: '车速（千米/小时）', angle: -90, position: 'insideLeft', fill: '#ffdf80', fontSize: 10 }} />
                              <YAxis yAxisId="right" orientation="right" stroke="#58a6ff" tick={{ fontSize: 9 }} domain={[-100, 100]} label={{ value: '转向百分比', angle: 90, position: 'insideRight', fill: '#58a6ff', fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '转向' ? `${Number(value).toFixed(1)}%` : `${Number(value).toFixed(0)} km/h`} />
                              <ReferenceLine yAxisId="right" y={0} stroke="#484f58" />
                              <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#ffdf80" name="车速" dot={false} strokeWidth={1.5} />
                              <Line yAxisId="right" type="monotone" dataKey="steerPct" stroke="#58a6ff" name="转向" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {/* G-G 摩擦圆 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>循迹制动：抓地利用图</h4>
                          <div style={chartGuideStyle}>
                            <strong>📚 诊断指南与参考区间：</strong> 横轴为横向 G，纵轴为纵向 G，灰色十字是 0 G 基线。点云向外延伸表示抓地利用更高；点云形状是否连续比单个极值更重要，不设置统一的固定 G 值标准。
                          </div>
                          <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="x" name="横向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <YAxis type="number" dataKey="y" name="纵向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)} G`} />
                                <ReferenceLine x={0} stroke="#484f58" />
                                <ReferenceLine y={0} stroke="#484f58" />
                                <Scatter name="G-G点" data={ggScatterPoints} fill="#bc8cff" opacity={0.6} />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 重刹效率 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>重刹制动效率</h4>
                          <div style={chartGuideStyle}>
                            <strong>📚 诊断指南与参考区间：</strong> 横轴为刹车踏板深度，纵轴为减速度绝对值。同一踏板深度下点云越集中，制动表现越稳定；大量分散点可能来自路面起伏、转向或轮胎锁死，因此需结合上方制动区证据图定位。
                          </div>
                          <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="brake" name="刹车深度" domain={[0, 100]} stroke="#8b949e" tick={{ fontSize: 9 }} />
                                <YAxis type="number" dataKey="decel" name="制动力" domain={[0, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '制动力' ? `${Number(value).toFixed(2)} G` : `${Number(value).toFixed(0)}%`} />
                                <Scatter name="刹车点" data={brakeGScatterData} fill="#f85149" />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==================== TAB 4: 智能诊断工坊 ==================== */}
              {activeTab === 'ai_coach' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* 置顶说明 */}
                  <div style={guideCardStyle}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 8 }}>🤖 AI 赛车教练问诊</div>
                    <div style={bulletItemStyle}>
                      输入具体驾驶感受或调校疑问，AI 教练会结合本场慢弯、锁死、打滑、托底与当前调校信息，输出以<strong>驾驶动作改进为核心</strong>的诊断建议。
                    </div>
                  </div>

                  {/* 上半区：常见操控问题规则诊断 */}
                  <div style={sectionStyle}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 13 }}>常见操控问题诊断规则</h3>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, marginTop: 4 }}>
                      如果您在驾驶时有具体的不适反馈，请在下方选择最接近的物理感受。系统将实时比对当前车辆调校参数，给出确切数值修改方案。
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {PROBLEM_CATEGORIES.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => { setSelectedIssueCategory(cat.id); setSelectedIssueId(null); }}
                          style={{
                            padding: '4px 10px',
                            background: selectedIssueCategory === cat.id ? cat.color : '#1f242c',
                            color: '#fff',
                            border: '1px solid #30363d',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
                      {/* 问题列表 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                        {DRIVING_PROBLEMS.filter(p => p.category === selectedIssueCategory).map(prob => (
                          <div
                            key={prob.id}
                            onClick={() => setSelectedIssueId(prob.id)}
                            style={{
                              padding: '6px 8px',
                              background: selectedIssueId === prob.id ? 'rgba(88, 166, 255, 0.1)' : '#161b22',
                              border: selectedIssueId === prob.id ? '1px solid #58a6ff' : '1px solid #21262d',
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 10, color: selectedIssueId === prob.id ? '#58a6ff' : '#e6edf3' }}>
                              {prob.name}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 规则数值修改对比表 */}
                      <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12 }}>
                        {selectedIssueId ? (() => {
                          const prob = DRIVING_PROBLEMS.find(p => p.id === selectedIssueId);
                          if (!prob) return null;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#e6edf3' }}>{prob.name}（典型表现：{prob.symptoms}）</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {Object.entries(prob.fixes).map(([paramKey, fix]) => {
                                  const currentVal = getParamValue(sessionTune, paramKey);
                                  const hasCurrent = currentVal !== null && currentVal !== undefined;
                                  const paramNameMap = {
                                    frontTirePressure: '前胎压', rearTirePressure: '后胎压',
                                    frontCamber: '前外倾角', rearCamber: '后外倾角',
                                    frontToe: '前束角', rearToe: '后束角',
                                    frontSpring: '前弹簧刚度', rearSpring: '后弹簧刚度',
                                    frontDamping: '前阻尼压缩', rearDamping: '后阻尼压缩',
                                    frontARB: '前防倾杆', rearARB: '后防倾杆',
                                    frontRideHeight: '前车身高度', rearRideHeight: '后车身高度',
                                    diffAccel: '差速器加速锁', diffDecel: '差速器减速锁',
                                    diffCenter: '中央差速偏置', finalDrive: '终传比',
                                    frontDownforce: '前空气下压力', rearDownforce: '后空气下压力'
                                  };
                                  const unitMap = {
                                    frontTirePressure: ' PSI', rearTirePressure: ' PSI',
                                    frontCamber: '°', rearCamber: '°', frontToe: '°', rearToe: '°',
                                    frontRideHeight: ' cm', rearRideHeight: ' cm',
                                    diffAccel: '%', diffDecel: '%', diffCenter: '%',
                                    frontDownforce: ' lbs', rearDownforce: ' lbs'
                                  };
                                  return (
                                    <div key={paramKey} style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1117', padding: '4px 8px', borderRadius: 4, fontSize: 10 }}>
                                      <span style={{ color: '#8b949e' }}>{paramNameMap[paramKey] || paramKey}</span>
                                      <span style={{ color: '#e6edf3' }}>
                                        {hasCurrent ? (
                                          <span>当前: {currentVal}{unitMap[paramKey] || ''} ➡️ <strong style={{ color: '#3fb950' }}>目标: {(currentVal + fix.delta).toFixed(1)}{unitMap[paramKey] || ''}</strong></span>
                                        ) : (
                                          <strong style={{ color: fix.delta > 0 ? '#3fb950' : '#f85149' }}>推荐微调: {fix.delta > 0 ? '+' : ''}{fix.delta}{unitMap[paramKey] || ''}</strong>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button
                                  onClick={() => {
                                    onNavigate('tunes', {
                                      action: 'edit',
                                      tuneId: sessionTune?.id,
                                      vehicleId: analysis.vehicle?.ordinal,
                                      suggestedChanges: prob.fixes,
                                      problemName: prob.name,
                                      trackName: analysis.track?.name || analysis.trackName || '未知赛道'
                                    });
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    background: '#d29922',
                                    border: 'none',
                                    borderRadius: 4,
                                    color: '#0d1117',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(210, 153, 34, 0.3)',
                                    textAlign: 'center',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  🔧 同步调整至调校中心
                                </button>
                                <button
                                  onClick={() => {
                                    setCustomQuestion(`在当前遥测下，我的车跑 ${analysis.track?.name || analysis.trackName || '此赛道'} 时遇到了“${prob.name}”的问题（表现为：${prob.symptoms}）。请结合车况、遥测和现有调校，给出更深度的分析与解决思路。`);
                                    setTimeout(() => {
                                      handleStartAiDiagnosis();
                                    }, 100);
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    background: '#58a6ff',
                                    border: 'none',
                                    borderRadius: 4,
                                    color: '#ffffff',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(88, 166, 255, 0.3)',
                                    textAlign: 'center',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  💬 用 AI 进一步诊断此问题
                                </button>
                              </div>
                            </div>
                          );
                        })() : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: 10 }}>
                            请在左侧选择具体驾驶不适问题以输出规则调参数值。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 下半区：AI 深度问诊辩论诊断 */}
                  <div style={sectionStyle}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 13, borderBottom: 'none' }}>AI 赛车教练深度遥测问诊</h3>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12 }}>
                      输入您的自定义疑问（例如：“拉力赛道腾空落地不稳定”、“弯中空转严重脚法怎么改？”），AI 教练将综合此场比赛的物理托底数、打滑特征值与工坊调校，进行深度诊断。
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <textarea
                        value={customQuestion}
                        onChange={e => setCustomQuestion(e.target.value)}
                        placeholder="在此处输入您想要向大模型赛车教练提问的具体问题（如：今天跑的拉力赛道跳跃颠簸很多，落地极不稳定怎么优化避震与高度？）..."
                        style={{
                          width: '100%',
                          height: 60,
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                          padding: 8,
                          fontSize: 11,
                          outline: 'none',
                          resize: 'none'
                        }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          提示：若有选中上方的常见问题，AI 将其与输入一并打包分析。
                        </span>
                        <button
                          onClick={handleStartAiDiagnosis}
                          disabled={aiDiagnosisLoading}
                          style={{
                            padding: '8px 18px', background: '#3fb950', border: 'none',
                            borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 12,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            opacity: aiDiagnosisLoading ? 0.7 : 1
                          }}
                        >
                          {aiDiagnosisLoading ? '正在分析诊断中...' : '⚡ 发起 AI 智能遥测诊断'}
                        </button>
                      </div>
                    </div>

                    {/* AI 生成报告显示区域 */}
                    {aiDiagnosisLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 12 }}>
                        <LoadingSpinner />
                        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                          {loadingTip}
                        </div>
                      </div>
                    ) : aiDiagnosisReport ? (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: '8px 8px 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#58a6ff' }}>🤖 AI 遥测大师诊断报告</span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>基于当前遥测帧及调校参数诊断</span>
                        </div>
                        {renderMarkdown(aiDiagnosisReport)}
                      </div>
                    ) : !keyConfigured && !checkingKey ? (
                      <div style={{ maxWidth: 460, margin: '20px auto', padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                          <span style={{ fontSize: 24 }}>🔑</span>
                          <h4 style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 4px' }}>未检测到 API Key，请进行配置</h4>
                          <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            AI 诊断需要使用阿里云百炼 API Key。请在下方保存您的密钥以启用此功能（保存后将立刻触发诊断）。
                          </p>
                        </div>
                        <form onSubmit={handleSaveApiKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <input
                            type="password"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                            style={inputStyle}
                          />
                          <button type="submit" disabled={savingKey} style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 4, color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                            {savingKey ? '正在保存...' : '保存密钥并开始诊断'}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8b949e', gap: 16 }}>
              <span style={{ fontSize: 48 }}>🏁</span>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>未选择比赛记录</h3>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.5 }}>
                  请在左侧栏中选择一次比赛遥测记录，以开启详细的底盘避震、打滑抱死与 AI 改装诊断。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={() => setShowDeleteConfirm(null)}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 10, padding: 20,
            maxWidth: 400, width: '90%', border: '1px solid var(--border)'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>确认删除</h2>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              确定要删除此比赛记录吗？相关分析数据也将被清除，此操作不可恢复。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={btnSmallStyle}>取消</button>
              <button onClick={() => deleteSession(showDeleteConfirm)} style={{ ...btnSmallStyle, background: '#da3633', color: '#fff', border: 'none' }}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnSmallStyle = {
  padding: '4px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500
};

const btnActiveStyle = {
  padding: '6px 12px',
  background: 'rgba(88, 166, 255, 0.1)',
  border: '1px solid rgba(88, 166, 255, 0.35)',
  borderRadius: 6,
  color: '#58a6ff',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s'
};

const btnInactiveStyle = {
  padding: '6px 12px',
  background: 'rgba(63, 185, 80, 0.08)',
  border: '1px solid rgba(63, 185, 80, 0.3)',
  borderRadius: 6,
  color: '#3fb950',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s'
};

const btnZoomStyle = {
  background: 'rgba(255, 255, 255, 0.05)',
  color: '#8b949e',
  border: '1px solid #30363d',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 9,
  cursor: 'pointer',
  fontWeight: 600,
  transition: 'all 0.2s'
};

const badgeRedStyle = {
  fontSize: 8.5,
  background: 'rgba(248,81,73,0.12)',
  color: '#ff7b72',
  padding: '1px 3px',
  borderRadius: 3,
  marginLeft: 4,
  fontWeight: 600
};

const badgeGreenStyle = {
  fontSize: 8.5,
  background: 'rgba(63,185,80,0.12)',
  color: '#56d364',
  padding: '1px 3px',
  borderRadius: 3,
  marginLeft: 4,
  fontWeight: 600
};

const sectionStyle = {
  background: 'rgba(22, 27, 34, 0.82)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  border: '1px solid rgba(210, 153, 34, 0.20)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.025)',
  transition: 'border-color 0.25s ease, box-shadow 0.25s ease'
};

const chartGuideStyle = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 6,
  padding: '8px 10px',
  marginBottom: 10,
  color: '#c9d1d9',
  fontSize: 10,
  lineHeight: 1.5
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 12,
  color: 'var(--accent)',
  borderBottom: '1px solid var(--border)',
  paddingBottom: 8
};

const guideCardStyle = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 8,
  padding: 12,
  marginTop: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 6
};

const bulletItemStyle = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  lineHeight: 1.4
};

const bulletLabelStyle = {
  fontWeight: 700,
  color: '#e6edf3'
};
