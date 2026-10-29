import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { SessionChartsPanel } from './session/SessionChartsPanel';
import { AiDiagnosisModal } from './session/AiDiagnosisModal';
import { LinkTrackDialog } from './session/LinkTrackDialog';
import { EmptyState } from '../shared/EmptyState';
import { useSessionHistory } from '../../hooks/useSessionHistory';
import { toast } from '../shared/Toast';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets';
import { api } from '../../services/api';
import { TrackThumbnail, InteractiveTrackMap } from './session/TrackMaps';
import { API_KEY_PLACEHOLDER } from '../../utils/constants';



const inputStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11
};

export const SessionHistoryPage = React.memo(function SessionHistoryPage({ onNavigate, navIntent }) {
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
    batchDelete,
    batchExportCSV,
    toggleSessionSelect,
    loadAnalysis,
    deleteSession,
    loadTelemetryChannels,
    loadAdvancedAnalysis,
    totalPages,
    sessionTune,
    myFilteredSessions,
    paginatedSessions,
    linkSessionTrack,
    batchLinkTracks,
    exportCSV,
    exportEnhancedCSV,
    exportReport,
    exportPDFReport
  } = useSessionHistory({ onNavigate, navIntent });

  // B10：未知赛道会话的「关联赛道」对话框（单场或批量共用）
  const [linkTrackDialog, setLinkTrackDialog] = useState(null);
  const [linkTrackOptions, setLinkTrackOptions] = useState([]);
  const [linkTrackSaving, setLinkTrackSaving] = useState(false);

  const openLinkTrackDialog = (sessionIds) => {
    const ids = [...(sessionIds || [])];
    if (ids.length === 0) { toast('请先勾选要关联的比赛记录', 'warning'); return; }
    setLinkTrackDialog({ sessionIds: ids, selectedTrackId: '' });
    api.tracks.list()
      .then((list) => {
        const options = Object.values(list || {}).map((t) => ({ id: t.id, name: t.name || t.id }));
        setLinkTrackOptions(options);
      })
      .catch(() => { toast('赛道列表加载失败，无法关联', 'error'); setLinkTrackOptions([]); });
  };

  const confirmLinkTrack = async () => {
    if (!linkTrackDialog) return;
    const picked = linkTrackOptions.find((t) => t.id === linkTrackDialog.selectedTrackId);
    if (!picked) { toast('请选择要关联的赛道', 'warning'); return; }
    setLinkTrackSaving(true);
    const payload = { trackId: picked.id, trackName: picked.name };
    const ok = linkTrackDialog.sessionIds.length > 1
      ? await batchLinkTracks(linkTrackDialog.sessionIds, payload)
      : await linkSessionTrack(linkTrackDialog.sessionIds[0], payload);
    setLinkTrackSaving(false);
    if (ok) {
      setLinkTrackDialog(null);
      setSelectedSessionIds(new Set());
    }
  };

  // 子页签状态
  const [reviewSubTab, setReviewSubTab] = useState('corners');
  const [activeSegmentId, setActiveSegmentId] = useState('all');
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
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
  const [coachSubTab, setCoachSubTab] = useState('feel');
  const [telemetryTuning, setTelemetryTuning] = useState(null);
  const [telemetryTuningLoading, setTelemetryTuningLoading] = useState(false);
  const selectedSessionRef = useRef(null);

  // AI 配置输入状态
  const [apiKey, setApiKey] = useState('');
  const [baseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [model] = useState('qwen3.7-plus');
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
      .catch(() => { if (!cancelled) setTelemetryTuning({ summary: '暂时无法生成遥测调校建议。', recommendations: [] }); })
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

  // 转换华氏度为摄氏度，并作为图表数据源使用
  const formattedChannels = useMemo(() => {
    if (!channelsData?.channels) return [];
    let channels = channelsData.channels.map(c => ({
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
    // 前端 DOM 安全防线：如果点数超出 600 点，自动进行二次抽样，确保 Recharts DOM 零卡顿
    if (channels.length > 600) {
      const step = Math.ceil(channels.length / 450);
      channels = channels.filter((_, idx) => idx % step === 0 || idx === channels.length - 1);
    }
    return channels;
  }, [channelsData]);

  // 新增：制动区证据，锁死点以红色散点叠加在车速曲线上。
  const brakingEvidenceData = useMemo(() => {
    if (!formattedChannels || !formattedChannels.length) return [];
    return formattedChannels.map((channel) => {
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
  }, [formattedChannels]);

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

  // 增强型 Markdown 渲染器（全面支持 Markdown 表格、分段卡片高亮与无障碍对比）
  const renderMarkdown = (mdText) => {
    if (!mdText) return null;

    const lines = mdText.split('\n');
    let insideList = false;
    let listItems = [];
    let insideTable = false;
    let tableRows = [];
    const elements = [];

    const parseInline = (text) => {
      if (!text) return '';
      const parts = [];
      const regex = /\*\*(.*?)\*\*/g;
      let match;
      let lastIdx = 0;

      while ((match = regex.exec(text)) !== null) {
        const before = text.substring(lastIdx, match.index);
        if (before) parts.push(before);
        parts.push(<strong key={`bold_${match.index}_${match[1]}`} style={{ color: '#58a6ff', fontWeight: 700 }}>{match[1]}</strong>);
        lastIdx = regex.lastIndex;
      }

      const after = text.substring(lastIdx);
      if (after) parts.push(after);

      return parts.length > 0 ? parts : text;
    };

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

    const flushTable = (keyPrefix) => {
      if (tableRows.length > 0) {
        // 分割表头与表体
        const headerRow = tableRows[0];
        // 过滤分隔符行 (|---|---|)
        const bodyRows = tableRows.slice(1).filter(row => !row.every(cell => /^:?-+:?$/.test(cell.trim())));

        elements.push(
          <div key={`table_wrap_${keyPrefix}`} style={{ overflowX: 'auto', margin: '14px 0', borderRadius: 8, border: '1px solid #30363d', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left', background: '#0d1117' }}>
              <thead>
                <tr style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
                  {headerRow.map((cell, cIdx) => (
                    <th key={cIdx} style={{ padding: '10px 12px', color: '#58a6ff', fontWeight: 750, whiteSpace: 'nowrap' }}>
                      {parseInline(cell.trim())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)', borderBottom: '1px solid #21262d', transition: 'background 0.15s' }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '9px 12px', color: cIdx === 3 ? '#3fb950' : '#c9d1d9', fontWeight: cIdx === 3 ? 750 : 400, lineHeight: 1.5 }}>
                        {parseInline(cell.trim())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        insideTable = false;
      }
    };

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();

      // 判断是否是 Markdown 表格行 (| col1 | col2 |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flushList(idx);
        insideTable = true;
        const cells = trimmed.split('|').slice(1, -1);
        tableRows.push(cells);
        continue;
      } else if (insideTable) {
        flushTable(idx);
      }

      if (trimmed.startsWith('# ')) {
        flushList(idx);
        elements.push(<h2 key={idx} style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: 6, margin: '20px 0 12px' }}>{parseInline(trimmed.substring(2))}</h2>);
      } else if (trimmed.startsWith('## ')) {
        flushList(idx);
        elements.push(<h3 key={idx} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '18px 0 10px' }}>{parseInline(trimmed.substring(3))}</h3>);
      } else if (trimmed.startsWith('### ')) {
        flushList(idx);
        const titleText = trimmed.substring(4);
        let icon = '📌';
        let badgeColor = '#58a6ff';
        let bgTint = 'rgba(88,166,255,0.05)';
        if (titleText.includes('问题') || titleText.includes('诊断')) {
          icon = '⚠️';
          badgeColor = '#d29922';
          bgTint = 'rgba(210,153,34,0.06)';
        } else if (titleText.includes('对比表') || titleText.includes('参数')) {
          icon = '📊';
          badgeColor = '#58a6ff';
          bgTint = 'rgba(88,166,255,0.06)';
        } else if (titleText.includes('驾驶') || titleText.includes('建议')) {
          icon = '🏎️';
          badgeColor = '#3fb950';
          bgTint = 'rgba(63,185,80,0.06)';
        }

        elements.push(
          <div key={idx} style={{ margin: '18px 0 10px', padding: '8px 12px', background: bgTint, borderLeft: `3px solid ${badgeColor}`, borderRadius: '0 6px 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <h4 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: badgeColor }}>{parseInline(titleText)}</h4>
          </div>
        );
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
    }

    flushList('end');
    if (insideTable) flushTable('end');

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


  const sessionChartsProps = useMemo(() => ({
    
    activeTab, reviewSubTab, session: selectedSession, channelsLoading, channelsData, sectionStyle, DRIVING_PROBLEMS, PROBLEM_CATEGORIES, activeTurnIdx, advancedData, aeroData, analysis, badgeGreenStyle, badgeRedStyle, brakeGScatterData, brakingEvidenceData, btnInactiveStyle, btnSmallStyle, chartGuideStyle, chartSubTab, diffData, drivingSubTab, formatLapTime, formattedChannels, gearingData, getParamValue, ggScatterPoints, handleChartMouseLeave, handleChartMouseMove, lapTrendData, maxSessionRpm, onNavigate, raceOverview, sectionTitleStyle, selectedIssueCategory, selectedIssueId, selectedSession, selectedTurnReview, sessionConsultation, sessionTune, setActiveTab, setActiveTurnIdx, setChartSubTab, setDrivingSubTab, setReviewSubTab, setSelectedIssueCategory, setSelectedIssueId, slipChartDomain, steeringSpeedData, suspensionHistogram, turnsData, visibleWheels, wheelVisibilityControls, worstCorners
  
  }), [
    
    activeTab, reviewSubTab, selectedSession, channelsLoading, channelsData, sectionStyle, DRIVING_PROBLEMS, PROBLEM_CATEGORIES, activeTurnIdx, advancedData, aeroData, analysis, badgeGreenStyle, badgeRedStyle, brakeGScatterData, brakingEvidenceData, btnInactiveStyle, btnSmallStyle, chartGuideStyle, chartSubTab, diffData, drivingSubTab, formatLapTime, formattedChannels, gearingData, getParamValue, ggScatterPoints, handleChartMouseLeave, handleChartMouseMove, lapTrendData, maxSessionRpm, onNavigate, raceOverview, sectionTitleStyle, selectedIssueCategory, selectedIssueId, selectedTurnReview, sessionConsultation, sessionTune, setActiveTab, setActiveTurnIdx, setChartSubTab, setDrivingSubTab, setReviewSubTab, setSelectedIssueCategory, setSelectedIssueId, slipChartDomain, steeringSpeedData, suspensionHistogram, turnsData, visibleWheels, wheelVisibilityControls, worstCorners
  
  ]);

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
                  <button onClick={() => openLinkTrackDialog(selectedSessionIds)} style={{ ...btnSmallStyle, fontSize: 9, background: 'rgba(210,153,34,0.1)', color: '#d29922', borderColor: 'rgba(210,153,34,0.35)' }}>
                    关联赛道 ({selectedSessionIds.size})
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {!session.trackId && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openLinkTrackDialog([session.id]); }}
                              style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(210,153,34,0.1)', color: '#d29922', border: '1px solid rgba(210,153,34,0.35)', borderRadius: 3, cursor: 'pointer' }}
                            >
                              关联赛道
                            </button>
                          )}
                          <span style={{ fontSize: 9, color: '#484f58' }}>
                            {session.autoRecorded ? '自动' : '手动'}
                          </span>
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
                const vOrd = analysis.vehicle?.ordinal || analysis.carOrdinal;
                const vehicle = analysis.vehicle || (vOrd ? vehiclesList[vOrd] : null);
                const vehicleName = vehicle?.name || (vOrd && vehiclesList[vOrd]?.name) || (vOrd ? `车辆 #${vOrd}` : '未知车辆');
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: '#8b949e', marginBottom: 2 }}>当前赛车</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {vehicleName}
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

              {/* 面包屑导航 + 单场导出按钮组 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setSelectedSession(null); setTrackFilter(''); }}>
                  比赛历史
                </span>
                <span>&gt;</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  单场遥测分析 ({selectedSession.substring(0, 8)})
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>导出</span>
                  {[
                    { label: '标准 CSV', title: '导出标准遥测 CSV（含 UTF-8 BOM）', onClick: () => exportCSV(selectedSession) },
                    { label: '增强 CSV', title: '导出物理增强 CSV（胎温/悬挂/G力）', onClick: () => exportEnhancedCSV(selectedSession) },
                    { label: '报告 HTML', title: '导出专业分析报告 HTML', onClick: () => exportReport(selectedSession) },
                    { label: '打印 PDF', title: '打开打印视图，可另存为 PDF', onClick: () => exportPDFReport(selectedSession) }
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      title={item.title}
                      style={{
                        padding: '4px 10px',
                        background: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: 4,
                        color: '#c9d1d9',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </span>
              </div>

              {/* 主标签始终占满详情区宽度，地图和内容都从标签下方开始。 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 12 }}>
                {[
                  { id: 'overview', label: '🏁 赛后总览与驾驶诊断' },
                  { id: 'professional_review', label: '🏎️ 专业复盘' },
                  { id: 'ai_coach', label: '🤖 智能诊断工坊' }
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
                      { id: 'aero', label: '⑥ 空气动力' }
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

                  {/* 里程切片与区间范围选择器（针对 >3km 或超长比赛） */}
                  {(() => {
                    const maxDistM = channelsData?.totalDistance || (channelsData?.channels?.length ? Math.max(...channelsData.channels.map(c => c.distance || 0)) : 0);
                    const totalKmNum = Number((maxDistM / 1000).toFixed(1));
                    if (maxDistM <= 3000) return null;

                    const stepMeters = maxDistM > 30000 ? 10000 : 5000;
                    const count = Math.ceil(maxDistM / stepMeters);
                    const segments = [{ id: 'all', label: `🌐 全局概览 (${totalKmNum} km)`, start: null, end: null }];
                    for (let i = 0; i < count; i++) {
                      const start = i * stepMeters;
                      const end = Math.min((i + 1) * stepMeters, Math.ceil(maxDistM));
                      segments.push({
                        id: `seg_${i}`,
                        label: `📍 ${(start / 1000).toFixed(0)} - ${(end / 1000).toFixed(0)} km`,
                        start,
                        end
                      });
                    }

                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '0 0 10px', padding: '8px 12px', background: 'rgba(88,166,255,0.04)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff' }}>🔍 遥测切片区间：</span>
                          {segments.map((seg) => (
                            <button
                              key={seg.id}
                              onClick={() => {
                                setActiveSegmentId(seg.id);
                                loadTelemetryChannels(seg.start, seg.end, true);
                                loadAdvancedAnalysis(seg.start, seg.end, true);
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 12,
                                border: `1px solid ${activeSegmentId === seg.id ? '#58a6ff' : '#30363d'}`,
                                background: activeSegmentId === seg.id ? '#1f6feb' : '#161b22',
                                color: activeSegmentId === seg.id ? '#ffffff' : '#c9d1d9',
                                fontSize: 9,
                                fontWeight: activeSegmentId === seg.id ? 700 : 500,
                                cursor: 'pointer'
                              }}
                            >
                              {seg.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 9, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>⚡ LTTB 极值降采样守护中 ({formattedChannels.length} 点)</span>
                        </div>
                      </div>
                    );
                  })()}
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
                  
              <SessionChartsPanel {...sessionChartsProps} />
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

                  <div style={{ display: 'flex', gap: 7, padding: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 7 }}>
                    {[
                      { id: 'feel', label: '驾驶感受调校', color: '#58a6ff' },
                      { id: 'telemetry', label: '遥测调校', color: '#3fb950' }
                    ].map(tab => (
                      <button key={tab.id} onClick={() => setCoachSubTab(tab.id)} style={{
                        flex: 1, padding: '7px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        border: `1px solid ${coachSubTab === tab.id ? tab.color : 'transparent'}`,
                        background: coachSubTab === tab.id ? `${tab.color}22` : 'transparent',
                        color: coachSubTab === tab.id ? tab.color : 'var(--text-muted)'
                      }}>{tab.label}</button>
                    ))}
                  </div>

                  {coachSubTab === 'telemetry' && (
                    <div style={{ ...sectionStyle, margin: 0, padding: 14, borderColor: 'rgba(63,185,80,0.42)' }}>
                      <h3 style={{ ...sectionTitleStyle, margin: 0, color: '#3fb950' }}>完整遥测调校</h3>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.5, margin: '6px 0 12px' }}>
                        已读取本场完整遥测数据，综合油门、制动、滑移、胎温、悬挂和转速提出车辆参数建议；不会更改配件与 PI。每次只应用一组建议，并在同赛道复跑验证。
                      </div>
                      {telemetryTuningLoading && <LoadingSpinner text="正在分析完整遥测数据..." />}
                      {!telemetryTuningLoading && telemetryTuning && <>
                        <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(88,166,255,0.07)', color: '#c9d1d9', fontSize: 10, marginBottom: 10 }}>{telemetryTuning.summary}</div>
                        {telemetryTuning.recommendations?.length === 0 ? (
                          <div style={{ color: '#8b949e', fontSize: 10 }}>未发现达到自动调校阈值的车辆问题；可改用“驾驶感受调校”描述具体感受。</div>
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
                      </>}
                    </div>
                  )}

                  {/* 上半区：常见操控问题规则诊断 */}
                  <div style={{ ...sectionStyle, display: coachSubTab === 'feel' ? undefined : 'none' }}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161b22', padding: '8px 12px', borderRadius: '8px 8px 0 0', border: '1px solid #30363d', borderBottom: 'none' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#58a6ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            🤖 AI 赛车教练深度诊断报告
                          </span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => setIsAiModalOpen(true)}
                              style={{
                                padding: '3px 10px',
                                background: '#1f6feb',
                                border: '1px solid #58a6ff',
                                borderRadius: 4,
                                color: '#ffffff',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                boxShadow: '0 2px 6px rgba(31, 111, 235, 0.4)'
                              }}
                            >
                              🔍 全屏沉浸阅读
                            </button>
                            <span style={{ fontSize: 9, color: '#8b949e' }}>基于实测遥测与物理模型诊断</span>
                          </div>
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
                            placeholder={API_KEY_PLACEHOLDER}
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

              {/* 全屏沉浸式 AI 遥测诊断剧场弹窗（A7-6 已抽出为 AiDiagnosisModal） */}
              <AiDiagnosisModal
                open={isAiModalOpen}
                analysis={analysis}
                report={aiDiagnosisReport}
                onClose={() => setIsAiModalOpen(false)}
                renderMarkdown={renderMarkdown}
              />
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

      {/* B10：关联赛道对话框（A7 已抽出为 LinkTrackDialog） */}
      {linkTrackDialog && (
        <LinkTrackDialog
          sessionCount={linkTrackDialog.sessionIds.length}
          options={linkTrackOptions}
          selectedTrackId={linkTrackDialog.selectedTrackId}
          saving={linkTrackSaving}
          onChangeTrack={(value) => setLinkTrackDialog((prev) => (prev ? { ...prev, selectedTrackId: value } : prev))}
          onConfirm={confirmLinkTrack}
          onCancel={() => setLinkTrackDialog(null)}
        />
      )}
    </div>
  );
});

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
