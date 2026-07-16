import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea, ScatterChart, Scatter, Cell, Legend } from 'recharts';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { useSessionHistory } from '../../hooks/useSessionHistory';
import { toast } from '../shared/Toast';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets';

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
  const [chartSubTab, setChartSubTab] = useState('inputs');
  const [showRawSignals, setShowRawSignals] = useState(false);
  const [selectedIssueCategory, setSelectedIssueCategory] = useState('steering');
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // AI 诊断相关状态
  const [aiDiagnosisLoading, setAiDiagnosisLoading] = useState(false);
  const [aiDiagnosisReport, setAiDiagnosisReport] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [checkingKey, setCheckingKey] = useState(false);
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
      const res = await fetch(`/api/analysis/${sid}/ai-diagnosis`);
      if (res.ok && selectedSessionRef.current === sid) {
        const data = await res.json();
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
      const res = await fetch(`/api/analysis/${selectedSession}/ai-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: selectedIssueId,
          customQuestion: customQuestion.trim(),
          problemDetails: probDetails || null
        })
      });

      if (res.status === 403) {
        setKeyConfigured(false);
        toast('请配置您的百炼 API Key', 'error');
        return;
      }

      if (!res.ok) throw new Error('大模型请求失败');

      const data = await res.json();
      if (data.status === 'success' && selectedSessionRef.current === diagnosisSessionId) {
        setAiDiagnosisReport(data.diagnosis);
        toast('AI 智能诊断生成成功！', 'success');
      } else {
        toast(data.error || '生成失败，请重试', 'error');
      }
    } catch (e) {
      console.error('AI 诊断失败:', e);
      toast('调用 AI 诊断失败，请检查网络或配置', 'error');
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
      const res = await fetch('/api/settings/dashscope-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      });
      if (res.ok) {
        toast('API 配置保存成功！', 'success');
        setKeyConfigured(true);
        setApiKey('');
        handleStartAiDiagnosis();
      } else {
        toast('配置保存失败', 'error');
      }
    } catch (err) {
      console.error('保存 API 配置失败:', err);
      toast('保存失败，请稍后重试', 'error');
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

  // 动态分析寻找严重丢速的前 3 个弯道
  const worstCorners = useMemo(() => {
    if (!turnsData?.turns || turnsData.turns.length === 0) return [];
    return [...turnsData.turns]
      .filter(t => t.recommended?.apexSpeed > 0 && t.current?.apexSpeed > 0)
      .map(t => {
        const rec = t.recommended.apexSpeed;
        const act = t.current.apexSpeed;
        const diff = rec - act;
        // 速度损失每差 5km/h 估算损失 0.15s 左右
        const estTimeLoss = Math.max(0.02, diff * 0.035);
        return {
          ...t,
          diff: Math.round(diff),
          estTimeLoss: Number(estTimeLoss.toFixed(2))
        };
      })
      .filter(t => t.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 3);
  }, [turnsData]);

  const raceOverview = useMemo(() => {
    const score = analysis?.驾驶评分;
    const sectors = advancedData?.lapSectorDetails || [];
    const normalizeToMs = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
      return numericValue < 1000 ? numericValue * 1000 : numericValue;
    };
    const currentLap = normalizeToMs(analysis?.成绩?.最佳圈);
    const theoreticalBest = normalizeToMs(advancedData?.theoreticalBest);
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
  }, [analysis, advancedData, driverPerformanceStats]);

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
      optionalTunes.push('• 直道末端撞断油 ➡️ 可在“齿轮比”菜单中将终传比(Final Drive)滑块向左拉（调疏），或加长断油档位齿比。');
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

  // 转换华氏度为摄氏度，并作为图表数据源使用
  const formattedChannels = useMemo(() => {
    if (!channelsData?.channels) return [];
    return channelsData.channels.map(c => ({
      ...c,
      tempFL: Math.round((c.tempFL - 32) * 5 / 9),
      tempFR: Math.round((c.tempFR - 32) * 5 / 9),
      tempRL: Math.round((c.tempRL - 32) * 5 / 9),
      tempRR: Math.round((c.tempRR - 32) * 5 / 9),
    }));
  }, [channelsData]);

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
          width: 320,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
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

              {/* 重构的四大 Tab 页签按钮 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
                {[
                  { id: 'overview', label: '🏁 赛后总览' },
                  { id: 'corners', label: '🗺️ 赛段与弯道' },
                  { id: 'telemetry_charts', label: '📊 驾驶表现' },
                  { id: 'ai_diagnosis_workshop', label: '🔧 车辆证据' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '6px 14px',
                      background: activeTab === tab.id ? '#58a6ff' : 'transparent',
                      color: activeTab === tab.id ? '#fff' : '#58a6ff',
                      border: '1px solid #30363d',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

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
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 16,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
                  }}>
                    {/* 高光卡片 */}
                    <div style={{ borderRight: '1px solid var(--border)', paddingRight: 12 }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: 12, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🏆</span> 本场亮点
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.highlights.map((h, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#8b949e', lineHeight: 1.45 }}>{h}</div>
                        ))}
                      </div>
                    </div>

                    {/* 缺陷与秒数损失卡片 */}
                    <div style={{ borderRight: '1px solid var(--border)', padding: '0 12px' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: 12, color: '#ff7b72', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>⚠️</span> 本场需要关注
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.flaws.map((f, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#8b949e', lineHeight: 1.45 }}>{f}</div>
                        ))}
                      </div>
                    </div>

                    {/* 驾驶脚法提升指南 */}
                    <div style={{ paddingLeft: 12 }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: 12, color: '#d29922', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🚦</span> 下一次可验证的动作
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.recommendations.map((r, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: r }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 本场重点弯道 */}
                  <div style={sectionStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: '0 0 6px 0' }}>本场重点弯道</h3>
                      <button onClick={() => setActiveTab('corners')} style={{ ...btnActiveStyle, padding: '4px 8px', fontSize: 10 }}>查看全部弯道</button>
                    </div>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 10 }}>
                      按弯心速度赤字排列。进入弯道详情可查看制动区、入弯、弯心和出弯的完整证据。
                    </div>
                    {worstCorners.length === 0 ? (
                      <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>
                        本圈弯心速度与路线把控得当，未发生明显操作失误导致的速度流失。
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '6px 8px' }}>损失弯角</th>
                            <th style={{ padding: '6px 8px' }}>实际 / 推荐速度</th>
                            <th style={{ padding: '6px 8px' }}>速度赤字</th>
                            <th style={{ padding: '6px 8px' }}>估计失秒</th>
                            <th style={{ padding: '6px 8px' }}>本场观察</th>
                            <th style={{ padding: '6px 8px' }}>下一步</th>
                          </tr>
                        </thead>
                        <tbody>
                          {worstCorners.map((t) => {
                            const entryDiff = (t.recommended?.entrySpeed || 0) - (t.current?.entrySpeed || 0);
                            const exitDiff = (t.recommended?.exitSpeed || 0) - (t.current?.exitSpeed || 0);
                            const focus = exitDiff > t.diff * 0.7 ? '出弯速度不足' : entryDiff > t.diff * 0.7 ? '入弯速度不足' : '弯心速度不足';
                            const nextStep = exitDiff > t.diff * 0.7
                              ? '进入弯道详情，检查开油点和出弯速度。'
                              : entryDiff > t.diff * 0.7
                                ? '进入弯道详情，检查刹车点与松刹节奏。'
                                : '进入弯道详情，检查弯心速度与转向修正。';

                            return (
                              <tr key={t.index} onClick={() => { setActiveTurnIdx(turnsData.turns.findIndex(turn => turn.index === t.index)); setActiveTab('corners'); }} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)', background: 'rgba(255,255,255,0.01)', cursor: 'pointer' }}>
                                <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--accent)' }}>{t.name}</td>
                                <td style={{ padding: '8px 8px', fontFamily: 'monospace' }}>{t.current?.apexSpeed} / {t.recommended?.apexSpeed} km/h</td>
                                <td style={{ padding: '8px 8px', color: '#ff7b72', fontWeight: 600, fontFamily: 'monospace' }}>↓{t.diff} km/h</td>
                                <td style={{ padding: '8px 8px', color: '#ff7b72', fontWeight: 700, fontFamily: 'monospace' }}>+{t.estTimeLoss}s</td>
                                <td style={{ padding: '8px 8px', color: '#d29922', fontWeight: 600 }}>{focus}</td>
                                <td style={{ padding: '8px 8px', color: '#8b949e' }}>{nextStep}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
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
                                <th style={{ padding: '6px 8px' }}>分段一 (S1)</th>
                                <th style={{ padding: '6px 8px' }}>分段二 (S2)</th>
                                <th style={{ padding: '6px 8px' }}>分段三 (S3)</th>
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
                  </div>
                </div>
              )}

              {/* ==================== TAB 2: 深度遥测图表 ==================== */}
              {activeTab === 'telemetry_charts' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  {channelsLoading && !channelsData && <LoadingSpinner text="正在载入本场驾驶证据..." />}
                  {!channelsLoading && !channelsData?.channels?.length && (
                    <EmptyState title="暂时没有可用的驾驶信号" description="这场比赛没有保存足够的遥测通道，无法生成驾驶证据图。" />
                  )}
                  {channelsData?.channels?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* 子页签、说明与深层信号控制合并为紧凑工具栏 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { id: 'inputs', label: '制动与入弯' },
                      { id: 'aero', label: '弯中平衡' },
                      { id: 'tires', label: '出弯与牵引力' },
                      { id: 'differential', label: '换挡与直线' },
                      { id: 'suspension', label: '车辆稳定性' }
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
                  <span style={{ flex: '1 1 320px', color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.4 }}>
                    {chartGuidance[chartSubTab]}
                  </span>
                  <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => setShowRawSignals(!showRawSignals)} style={{ ...btnZoomStyle, padding: '4px 8px' }}>
                      {showRawSignals ? '收起原始信号' : '展开原始信号'}
                    </button>
                  </div>
                  </div>

                  {/* 2.2.1 轮胎与定位 */}
                  {chartSubTab === 'tires' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 置顶说明 */}
                      <div style={guideCardStyle}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 8 }}>🛞 轮胎抓地与滑移率</div>
                        <div style={bulletItemStyle}>
                          连续滑移会聚合为事件，而不是按采样点累计。先从弯道复盘确认发生位置与驾驶动作，再决定是否需要查看车辆参数。
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                        {[
                          { label: '制动滑移', value: driverPerformanceStats.lockCount ? `${driverPerformanceStats.lockCount} 次，约 ${driverPerformanceStats.lockDurationSec} 秒` : '未发现连续事件' },
                          { label: '出弯牵引力', value: driverPerformanceStats.spinCount ? `${driverPerformanceStats.spinCount} 次，约 ${driverPerformanceStats.spinDurationSec} 秒` : '未发现连续事件' }
                        ].map(item => <div key={item.label} style={{ ...sectionStyle, margin: 0, padding: 11 }}><div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 5 }}>{item.label}</div><div style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}>{item.value}</div></div>)}
                      </div>

                      {showRawSignals && <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>轮胎工作温度变化曲线（绿色区域为理想工作区间，单位：摄氏度°C）</h4>
                        <div style={{ height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={formattedChannels} syncId="overlaySync">
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[40, 110]} unit="°C" />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)}°C`} />
                              <ReferenceArea y1={75} y2={90} fill="rgba(63,185,80,0.06)" label={{ value: '最佳胎温抓地区 (75-90°C)', fill: '#3fb950', fontSize: 9, position: 'insideTopLeft' }} />
                              <Line type="monotone" dataKey="tempFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="tempFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="tempRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="tempRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>}

                      {showRawSignals && <div style={sectionStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontSize: 11 }}>原始四轮滑移率</h4>
                          <div style={{ display: 'flex', gap: 12, color: 'var(--text-secondary)', fontSize: 10 }}>
                            <span><i style={{ display: 'inline-block', width: 12, borderTop: '1px dashed #f85149', marginRight: 4 }} />牵引力预警 +15%</span>
                            <span><i style={{ display: 'inline-block', width: 12, borderTop: '1px dashed #f85149', marginRight: 4 }} />制动滑移预警 -15%</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>仅用于核对已发现事件的轮位和持续区间。请先看上方事件摘要，而不是在整圈原始信号里寻找尖峰。</div>
                        <div style={{ height: 240 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={formattedChannels} syncId="overlaySync" margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[-0.4, 0.4]} allowDataOverflow={true} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} label={{ value: '轮胎滑移率', angle: -90, position: 'insideLeft', offset: 8, fill: '#8b949e', fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
                              <Legend verticalAlign="top" align="left" height={24} iconType="line" wrapperStyle={{ fontSize: 10, paddingBottom: 4 }} />
                              <ReferenceLine y={0.15} stroke="#f85149" strokeDasharray="4 2" />
                              <ReferenceLine y={-0.15} stroke="#f85149" strokeDasharray="4 2" />
                              <ReferenceLine y={0} stroke="#484f58" />
                              <Line type="monotone" dataKey="slipFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.2} />
                              <Line type="monotone" dataKey="slipFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.2} />
                              <Line type="monotone" dataKey="slipRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.2} />
                              <Line type="monotone" dataKey="slipRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>}
                    </div>
                  )}

                  {/* 2.2.2 避震与高度 */}
                  {chartSubTab === 'suspension' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 置顶说明 */}
                      <div style={guideCardStyle}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 8 }}>车辆稳定性证据</div>
                        <div style={bulletItemStyle}>
                          压缩量仅描述各轮在本场不同工况下使用了多少行程。它不是“好坏评分”，也不直接推导调校结论；先结合压路肩、制动和弯道位置复盘。
                        </div>
                      </div>

                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>各轮压缩量分布（全场工况）</h4>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>横轴 0% 接近满伸展，100% 接近压到底；纵轴为有效样本占比，不是事件次数。</div>
                        <div style={{ height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={suspensionHistogram}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="range" stroke="#8b949e" tick={{ fontSize: 9 }} minTickGap={20} label={{ value: '压缩量区间', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" label={{ value: '样本占比', angle: -90, position: 'insideLeft', offset: 10, fill: '#8b949e', fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} />
                              <Bar dataKey="左前" fill="#58a6ff" />
                              <Bar dataKey="右前" fill="#3fb950" />
                              <Bar dataKey="左后" fill="#d29922" />
                              <Bar dataKey="右后" fill="#ff7b72" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {showRawSignals && (
                        <div style={sectionStyle}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>原始四轮悬挂行程</h4>
                          <div style={{ height: 180 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={channelsData.channels} syncId="overlaySync">
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                                <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)}`} />
                                <Line type="monotone" dataKey="suspensionFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1} />
                                <Line type="monotone" dataKey="suspensionFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1} />
                                <Line type="monotone" dataKey="suspensionRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1} />
                                <Line type="monotone" dataKey="suspensionRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2.2.3 平衡与空气动力 */}
                  {chartSubTab === 'aero' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={guideCardStyle}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 5 }}>弯中表现证据</div>
                        <div style={bulletItemStyle}>先看各弯弯心速度缺口，再进入弯道页核对走线与转向动作。下方前后轴曲线只用于补充高速下的动态变化，不直接给出调校结论。</div>
                      </div>

                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 4px', fontSize: 11 }}>各弯弯心速度与参考对照</h4>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>横轴为弯道，纵轴为弯心速度；两柱差距大的弯优先进入赛段与弯道复盘。</div>
                        <div style={{ height: 220 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cornerApexComparison} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="弯道" stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '弯道', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '弯心速度（km/h）', angle: -90, position: 'insideLeft', offset: 8, fill: '#8b949e', fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)} km/h`} />
                              <Legend verticalAlign="top" align="left" height={24} iconType="square" wrapperStyle={{ fontSize: 10 }} />
                              <Bar dataKey="本场" fill="#58a6ff" radius={0} />
                              <Bar dataKey="参考" fill="#3fb950" radius={0} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>下压力避震压缩率 vs 车速折线</h4>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={aeroData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="speed" stroke="#8b949e" tick={{ fontSize: 9 }} minTickGap={60} unit="km/h" />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(1)}%`} />
                              <Line type="monotone" dataKey="前轴压缩" stroke="#58a6ff" dot={false} strokeWidth={2} />
                              <Line type="monotone" dataKey="后轴压缩" stroke="#3fb950" dot={false} strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2.2.4 传动与差速 */}
                  {chartSubTab === 'differential' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 置顶说明 */}
                      <div style={guideCardStyle}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 8 }}>⚙️ 传动齿比与换挡节奏</div>
                        <div style={bulletItemStyle}>
                          <span style={{ ...bulletLabelStyle, color: '#58a6ff' }}>🏎️ 核心驾驶动作：</span>
                          <strong>如果换挡转速（RPM）死死卡在断油红线上 ➡️ 驾驶中请提前执行手手动升档；如果升档后发动机发出闷响且提速乏力 ➡️ 换挡晚了，需延迟升档点，让转速始终落在绿色马力线以上。</strong>
                        </div>
                        <div style={bulletItemStyle}>
                          <span style={bulletLabelStyle}>🔧 备选调校改动（若操作已无优化空间）：</span>
                          1. <strong>单档齿比调整</strong>：若换挡后转速掉入绿色虚线以下动力断节 ➡️ 将该档齿比滑块向右拉（调密）。<br />
                          2. <strong>终传比调整</strong>：若在长直路中段引擎就已锁死在最高档红线上 ➡️ 将终传比(Final Drive)滑块向左拉（调疏）。
                        </div>
                      </div>

                      {/* 双 Y 轴齿比与换挡折线图 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>发动机转速与档位变化图（绿色虚线为动力带介入点，红色为极限断油线）</h4>
                        <div style={{ height: 220 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={gearingData} syncId="overlaySync">
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

                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>出弯驱动轮速差对比（弯中内侧轮速差偏高代表发生单侧打滑）</h4>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={diffData} syncId="overlaySync">
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)} km/h`} />
                              <Line type="monotone" dataKey="前轴速差" stroke="#58a6ff" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="后轴速差" stroke="#3fb950" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2.2.5 驾驶输入 */}
                  {chartSubTab === 'inputs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 置顶说明 */}
                      <div style={guideCardStyle}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 5 }}>驾驶动作证据</div>
                        <div style={bulletItemStyle}>
                          先看事件与抓地利用，再用踏板曲线核对具体的制动释放和开油时机。原始方向盘信号仅在需要取证时展开。
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                        {[
                          { label: '制动滑移事件', value: driverPerformanceStats.lockCount ? `${driverPerformanceStats.lockCount} 次 / 约 ${driverPerformanceStats.lockDurationSec} 秒` : '未发现', tone: driverPerformanceStats.lockCount ? 'var(--danger)' : 'var(--success)' },
                          { label: '出弯牵引力事件', value: driverPerformanceStats.spinCount ? `${driverPerformanceStats.spinCount} 次 / 约 ${driverPerformanceStats.spinDurationSec} 秒` : '未发现', tone: driverPerformanceStats.spinCount ? 'var(--danger)' : 'var(--success)' },
                          { label: '弯中滑行', value: `${driverPerformanceStats.coastingTimeSec} 秒`, tone: driverPerformanceStats.coastingTimeSec >= 3.5 ? 'var(--warning)' : 'var(--success)' }
                        ].map(item => (
                          <div key={item.label} style={{ ...sectionStyle, margin: 0, padding: 10 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5 }}>{item.label}</div>
                            <div style={{ fontFamily: 'monospace', color: item.tone, fontSize: 17, fontWeight: 800 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ ...sectionStyle, order: 3 }}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>油门与刹车控制踏板深度对比（平滑、顺畅的交替是高圈速的秘密）</h4>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={channelsData.channels} syncId="overlaySync">
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, order: 2 }}>
                        {/* G-G 摩擦力圆散点图 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>循迹制动：抓地利用图</h4>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>左下与右下的弧形区域代表一边减速、一边转向；点越能填满该区域，循迹制动越充分。</div>
                          <div style={{ height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="x" name="横向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} label={{ value: '横向 G 力（G）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                <YAxis type="number" dataKey="y" name="纵向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} label={{ value: '纵向 G 力（G）', angle: -90, position: 'insideLeft', offset: 10, fill: '#8b949e', fontSize: 10 }} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)} G`} />
                                <ReferenceLine x={0} stroke="#484f58" />
                                <ReferenceLine y={0} stroke="#484f58" />
                                <Scatter name="G-G点" data={ggScatterPoints} fill="#bc8cff" opacity={0.6} />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 重刹制动深度 vs 纵向减速 G力 效率 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>重刹制动效率</h4>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>相同刹车深度下，减速度越高代表制动利用越充分；离散或明显下坠的点需要结合滑移事件判断。</div>
                          <div style={{ height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="brake" name="刹车深度" domain={[0, 100]} stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '刹车踏板深度（%）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                <YAxis type="number" dataKey="decel" name="制动力" domain={[0, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} label={{ value: '减速度（G）', angle: -90, position: 'insideLeft', offset: 10, fill: '#8b949e', fontSize: 10 }} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '制动力' ? `${Number(value).toFixed(2)} G` : `${Number(value).toFixed(0)}%`} />
                                <Scatter name="刹车点" data={brakeGScatterData} fill="#f85149" />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* 方向盘原始输入曲线 */}
                      {showRawSignals && <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>方向盘输入与横向G力对照图（正值代表向右，负值代表向左。横向G力反映转弯时的侧向拉力）</h4>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={steeringData} syncId="overlaySync">
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis yAxisId="left" stroke="#58a6ff" tick={{ fontSize: 9 }} domain={[-127, 127]} />
                              <YAxis yAxisId="right" orientation="right" stroke="#bc8cff" tick={{ fontSize: 9 }} domain={[-2.5, 2.5]} allowDataOverflow={true} unit="G" />
                              <Tooltip
                                contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }}
                                formatter={(value, name) => {
                                  const val = Number(value);
                                  if (name.includes('方向盘')) {
                                    if (val < 0) return [`左转打方向 ${Math.abs(val).toFixed(0)}`, '方向盘状态'];
                                    if (val > 0) return [`右转打方向 ${val.toFixed(0)}`, '方向盘状态'];
                                    return ['方向盘居中回正', '方向盘状态'];
                                  }
                                  if (name.includes('横向G力')) {
                                    if (val < 0) return [`左转弯拉力 ${Math.abs(val).toFixed(2)} G`, '车身横向重力'];
                                    if (val > 0) return [`右转弯拉力 ${val.toFixed(2)} G`, '车身横向重力'];
                                    return ['中性直线行驶', '车身横向重力'];
                                  }
                                  return [value, name];
                                }}
                              />
                              <ReferenceLine yAxisId="left" y={0} stroke="#484f58" />
                              <Line yAxisId="left" type="monotone" dataKey="steer" stroke="#58a6ff" name="方向盘输入" dot={false} strokeWidth={1.2} />
                              <Line yAxisId="right" type="monotone" dataKey="gLat" stroke="#bc8cff" name="横向G力" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>}

                    </div>
                  )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== TAB 3: 赛道与弯道 ==================== */}
              {activeTab === 'corners' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16 }}>
                    {/* 左侧：赛道定位 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ ...sectionStyle, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                          <h3 style={{ ...sectionTitleStyle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>赛道诊断热力图</h3>
                          <button
                            onClick={() => setZoomOnSelect(!zoomOnSelect)}
                            style={btnZoomStyle}
                            title={zoomOnSelect ? '切换为完整赛道全貌' : '自动局部放大当前选中的弯道细节'}
                          >
                            {zoomOnSelect ? '🔍 切换全图' : '🔍 弯道放大'}
                          </button>
                        </div>
                        <InteractiveTrackMap
                          trackId={analysis.trackId}
                          fallbackPositions={sessionDetail?.positions || []}
                          width={376}
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
                            turnsData?.turns?.[activeTurnIdx]
                              ? {
                                  x: turnsData.turns[activeTurnIdx].current?.x || turnsData.turns[activeTurnIdx].x || 0,
                                  z: turnsData.turns[activeTurnIdx].current?.z || turnsData.turns[activeTurnIdx].z || 0
                                }
                              : null
                          }
                        />
                      </div>
                    </div>

                    {/* 右侧：弯道列表 */}
                    <div style={{ ...sectionStyle, padding: 12, display: 'flex', flexDirection: 'column' }}>
                      <h3 style={sectionTitleStyle}>弯道列表</h3>
                      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, lineHeight: 1.4 }}>
                        选择一个弯道，查看本场比赛在制动、入弯、弯心和出弯四个阶段的表现。
                      </div>
                      {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                          暂无弯道分析数据
                        </div>
                      ) : (
                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 520 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', position: 'sticky', top: 0, background: '#161b22', zIndex: 1 }}>
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
                                  if (speedDiff < -5) {
                                    diffBadge = <span style={badgeRedStyle}>↓{Math.abs(speedDiff)}</span>;
                                  } else if (speedDiff >= 2) {
                                    diffBadge = <span style={badgeGreenStyle}>↑{speedDiff}</span>;
                                  }
                                }

                                return (
                                  <tr
                                    key={t.index ?? idx}
                                    onClick={() => setActiveTurnIdx(idx)}
                                    style={{
                                      borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
                                      background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent',
                                      cursor: 'pointer',
                                      transition: 'background 0.2s',
                                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent'
                                    }}
                                  >
                                    <td style={{ padding: '8px 4px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'inherit' }}>{t.name}</td>
                                    <td style={{ padding: '8px 4px' }}>{t.turnCategory || (t.direction === 'left' ? '左弯' : '右弯')}</td>
                                    <td style={{ padding: '8px 4px' }}>{t.current?.entrySpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/{recEntry}</span></td>
                                    <td style={{ padding: '8px 4px', fontWeight: 700 }}>
                                      {apexSpeed} <span style={{ color: '#8b949e', fontSize: 9, fontWeight: 'normal' }}>/{recApex}</span>
                                      {diffBadge}
                                    </td>
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
                  </div>

                  <div style={{ ...sectionStyle, margin: 0, padding: 16 }}>
                    {!selectedTurnReview ? (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11, textAlign: 'center', padding: 16 }}>请选择一个弯道开始复盘。</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                          <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 4 }}>单弯复盘</div>
                            <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedTurnReview.turn.name} <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}>{selectedTurnReview.turn.turnCategory || selectedTurnReview.turn.type || '弯道'}</span></div>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--warning)' }}>本场优先关注：{selectedTurnReview.focus}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                          {selectedTurnReview.phases.map((phase, index) => (
                            <div key={phase.id} style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--bg-primary)', borderRadius: 6, padding: 11, minHeight: 116 }}>
                              {index < selectedTurnReview.phases.length - 1 && <div style={{ position: 'absolute', top: 23, right: -6, width: 12, height: 1, background: 'var(--border)' }} />}
                              <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 7 }}>{phase.label}</div>
                              <div style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 800, fontFamily: 'monospace', marginBottom: 5 }}>{phase.value}</div>
                              <div style={{ color: phase.detail.startsWith('慢') ? 'var(--danger)' : 'var(--accent)', fontSize: 10, marginBottom: 8 }}>{phase.detail}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.45 }}>{phase.note}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                            参考速度来自赛道路线记录；它用于定位差距，不代表唯一正确跑法。
                          </div>
                          <button onClick={() => { setChartSubTab('inputs'); setActiveTab('telemetry_charts'); }} style={{ ...btnActiveStyle, padding: '5px 9px', fontSize: 10 }}>
                            查看驾驶输入证据
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== TAB 4: 智能诊断工坊 ==================== */}
              {activeTab === 'ai_diagnosis_workshop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* 置顶说明 */}
                  <div style={guideCardStyle}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 8 }}>🤖 智能诊断与驾驶问诊工序</div>
                    <div style={bulletItemStyle}>
                      1. <strong>常见问题匹配对比</strong>：在上方选择您的车辆操控不适（推头/甩尾/换挡），系统将根据当前车辆的 Tune 改装配置滑块，给出数值目标对比。<br />
                      2. <strong>AI 深度诊断</strong>：在下半区输入补充问题（如地形、天气），AI 教练会提取物理托底数、打滑物理量和工坊调校，输出以<strong>操作改进为核心</strong>的解决方案。
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
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  border: '1px solid var(--border)'
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

// 赛道缩略图
function TrackThumbnail({ trackId }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const drawThumb = async () => {
      try {
        const res = await fetch(`/api/tracks/${trackId}/thumbnail`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.positions || data.positions.length < 2) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const positions = data.positions;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        positions.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        });
        const pad = 3;
        const rX = Math.max(1, maxX - minX);
        const rZ = Math.max(1, maxZ - minZ);
        const toX = x => pad + (x - minX) / rX * (w - pad * 2);
        const toY = z => h - pad - (z - minZ) / rZ * (h - pad * 2);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        positions.forEach((p, i) => {
          if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
          else ctx.lineTo(toX(p.x), toY(p.z));
        });
        ctx.closePath();
        ctx.stroke();
      } catch (e) {
        // 静默忽略
      }
    };
    drawThumb();
  }, [trackId]);

  return (
    <canvas ref={canvasRef} width={60} height={40}
      style={{ width: 60, height: 40, borderRadius: 3, background: 'rgba(88,166,255,0.05)', flexShrink: 0 }}
    />
  );
}

// 赛道 3D 地图渲染
function InteractiveTrackMap({ trackId, fallbackPositions = [], highlightedPoints = [], cursorPoint = null, width = 300, height = 300, zoomOnSelect = false }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const fetchPositions = async () => {
      if (!trackId) return;
      try {
        const res = await fetch(`/api/tracks/${trackId}`);
        if (!res.ok) return;
        const data = await res.json();
        const resolved = (data.centerline && data.centerline.length > 2) ? data.centerline
          : (data.points && data.points.length > 2) ? data.points
          : (data.trajectories && data.trajectories.length > 0 && data.trajectories[0].length > 2) ? data.trajectories[0]
          : [];
        setPositions(resolved);
      } catch (e) {
        console.error('加载赛道地图坐标失败', e);
      }
    };
    fetchPositions();
  }, [trackId]);

  const drawPositions = positions.length >= 2 ? positions : fallbackPositions;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawPositions.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const activePt = highlightedPoints.find(p => p.isActive);
    const hasActiveZoom = zoomOnSelect && activePt && typeof activePt.x === 'number' && typeof activePt.z === 'number';

    if (hasActiveZoom) {
      const zoomRange = 150;
      minX = activePt.x - zoomRange;
      maxX = activePt.x + zoomRange;
      minZ = activePt.z - zoomRange;
      maxZ = activePt.z + zoomRange;
    } else {
      drawPositions.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    }

    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    const pad = hasActiveZoom ? 20 : 40;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * sc) / 2;
    const oz = (h - (maxZ - minZ) * sc) / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    let pts = drawPositions;
    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 500);
      const sampled = [pts[0]];
      for (let i = step; i < pts.length - 1; i += step) sampled.push(pts[i]);
      sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }

    // 绘制路面
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - minX) * sc + ox;
      const pz = h - oz - (p.z - minZ) * sc;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.stroke();

    // 绘制中心线走线
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - minX) * sc + ox;
      const pz = h - oz - (p.z - minZ) * sc;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.stroke();

    // 绘制弯心标记点
    highlightedPoints.forEach((pt) => {
      if (!pt.x || !pt.z) return;
      const tx = (pt.x - minX) * sc + ox;
      const ty = h - oz - (pt.z - minZ) * sc;
      const color = pt.color || '#f85149';
      const isActive = pt.isActive;

      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();
      if (isActive) {
        ctx.fillStyle = color;
        ctx.fill();
      }
    });

    // 绘制实时游标点
    if (cursorPoint && typeof cursorPoint.x === 'number' && typeof cursorPoint.z === 'number') {
      const cx = (cursorPoint.x - minX) * sc + ox;
      const cz = h - oz - (cursorPoint.z - minZ) * sc;
      ctx.fillStyle = '#d29922';
      ctx.beginPath();
      ctx.arc(cx, cz, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [drawPositions, highlightedPoints, cursorPoint, zoomOnSelect]);

  return (
    <canvas ref={canvasRef} width={width} height={height}
      style={{ width, height, borderRadius: 6, background: '#0d1117', border: '1px solid var(--border)' }}
    />
  );
}
