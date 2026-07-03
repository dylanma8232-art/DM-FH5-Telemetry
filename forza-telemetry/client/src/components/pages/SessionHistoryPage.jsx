import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ScatterChart, Scatter } from 'recharts';
import { LapComparison } from '../dashboard/LapComparison';
import { ThrottleBrakeHeatmap } from '../dashboard/ThrottleBrakeHeatmap';
import { ReplayPlayer } from '../dashboard/ReplayPlayer';
import { SectorAnalysis } from '../dashboard/SectorAnalysis';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { toast } from '../shared/Toast';

export function SessionHistoryPage({ onNavigate, navIntent }) {
  // 主Tab: 'sessions' = 比赛记录, 'leaderboard' = 圈速排行榜
  const [mainTab, setMainTab] = useState('sessions');

  // 比赛记录状态
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeChart, setActiveChart] = useState('overview');
  const [shiftAnalysis, setShiftAnalysis] = useState(null);
  const [tireAnalysis, setTireAnalysis] = useState(null);
  const [brakeAnalysis, setBrakeAnalysis] = useState(null);
  const [accelAnalysis, setAccelAnalysis] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [channelsData, setChannelsData] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [turnsData, setTurnsData] = useState(null);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [tunes, setTunes] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // 圈速排行榜状态
  const [lbEntries, setLbEntries] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbExpandedKeys, setLbExpandedKeys] = useState(new Set());
  const [lbTrendData, setLbTrendData] = useState(null);
  const [lbTrendLoading, setLbTrendLoading] = useState(false);
  const [lbSearchQuery, setLbSearchQuery] = useState('');
  const [lbTrackFilter, setLbTrackFilter] = useState('');
  const [lbLoaded, setLbLoaded] = useState(false);
  // Round 8: 时间范围筛选
  const [lbTimeRange, setLbTimeRange] = useState('all'); // '7d' | '30d' | 'all'
  // Round 3: 车辆筛选
  const [lbVehicleFilter, setLbVehicleFilter] = useState('');
  // Round 6: 排行榜趋势缓存 - 使用Map缓存已加载的趋势数据
  const lbTrendCacheRef = useRef(new Map());
  const lbTrendLoadingSetRef = useRef(new Set());

  // Round 2: session detail是否已加载（延迟加载标记）
  const [detailLoaded, setDetailLoaded] = useState(false);

  // Round 3: Tab缓存 - 已加载的tab数据不重复请求
  const loadedTabsRef = useRef(new Set(['overview']));

  // Round 5: 批量操作
  const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
  const [batchMode, setBatchMode] = useState(false);

  // Round 7: 比赛对比功能
  const [compareSessionA, setCompareSessionA] = useState(null);
  const [compareSessionB, setCompareSessionB] = useState(null);
  const [compareAnalysisA, setCompareAnalysisA] = useState(null);
  const [compareAnalysisB, setCompareAnalysisB] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Round 9: Session列表分页
  const [sessionPage, setSessionPage] = useState(1);
  const SESSION_PAGE_SIZE = 20;

  // Round 5: 可用的sub-tabs
  const allSubTabs = ['overview', 'dynamics', 'tires', 'shifts', 'pedals', 'overlay', 'replay'];

  // 赛道标签筛选器
  const uniqueTracks = useMemo(() => {
    return [...new Set(sessions.map(s => s.trackName || '未知赛道'))].filter(Boolean)
  }, [sessions])

  const myFilteredSessions = sessions.filter(s => {
    const matchSearch = !sessionSearchQuery.trim() || (s.trackName || '未知赛道').toLowerCase().includes(sessionSearchQuery.trim().toLowerCase())
    const matchTrack = !trackFilter || (s.trackName || '未知赛道') === trackFilter
    return matchSearch && matchTrack
  });

  useEffect(() => {
    loadSessions();
    loadTunes();
  }, []);

  // Round 5: 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 忽略输入框内的按键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // 左右箭头切换Session
        e.preventDefault();
        const idx = myFilteredSessions.findIndex(s => s.id === selectedSession);
          if (e.key === 'ArrowLeft' && idx > 0) {
            loadAnalysis(myFilteredSessions[idx - 1].id);
          } else if (e.key === 'ArrowRight' && idx < myFilteredSessions.length - 1) {
            loadAnalysis(myFilteredSessions[idx + 1].id);
          }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // 上下箭头切换Tab
        e.preventDefault();
        const curIdx = allSubTabs.indexOf(activeChart);
        if (e.key === 'ArrowUp' && curIdx > 0) {
          setActiveChart(allSubTabs[curIdx - 1]);
          const tab = { id: allSubTabs[curIdx - 1] };
          if (tab.loadType) loadDetailData(tab.loadType);
          if ((tab.id === 'replay' || tab.id === 'heatmap') && selectedSession && !detailLoaded) {
            loadSessionDetail(selectedSession);
          }
        } else if (e.key === 'ArrowDown' && curIdx < allSubTabs.length - 1) {
          setActiveChart(allSubTabs[curIdx + 1]);
          const tab = { id: allSubTabs[curIdx + 1] };
          if (tab.loadType) loadDetailData(tab.loadType);
          if ((tab.id === 'replay' || tab.id === 'heatmap') && selectedSession && !detailLoaded) {
            loadSessionDetail(selectedSession);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [myFilteredSessions, selectedSession, activeChart, allSubTabs, detailLoaded]);

  // Round 5: 批量删除
  const batchDelete = async () => {
    try {
      const ids = Array.from(selectedSessionIds);
      await Promise.all(ids.map(id => fetch('/api/sessions/' + id, { method: 'DELETE' })));
      setSessions(prev => prev.filter(s => !selectedSessionIds.has(s.id)));
      if (selectedSessionIds.has(selectedSession)) {
        setSelectedSession(null);
        setAnalysis(null);
        setSessionDetail(null);
        setDiagnosis(null);
        setActiveChart('overview');
        setDetailLoaded(false);
        loadedTabsRef.current = new Set(['overview']);
        setShiftAnalysis(null);
        setTireAnalysis(null);
        setBrakeAnalysis(null);
        setAccelAnalysis(null);
        setChannelsData(null);
        setTurnsData(null);
      }
      setSelectedSessionIds(new Set());
      setBatchMode(false);
      toast(`已删除 ${ids.length} 条记录`, 'success');
    } catch (e) {
      toast('批量删除失败', 'error');
    }
  };

  // Round 5: 批量导出CSV
  const batchExportCSV = async () => {
    try {
      for (const id of selectedSessionIds) {
        await downloadBlob('/api/export/csv/' + id, 'telemetry_' + id + '.csv');
      }
      toast(`已导出 ${selectedSessionIds.size} 个CSV`, 'success');
    } catch (e) {
      toast('批量导出失败', 'error');
    }
  };

  // Round 7: 选择对比session
  const selectCompareSession = async (sessionId) => {
    if (compareSessionA === null) {
      setCompareSessionA(sessionId);
      toast('已选择第一个Session，请再选择一个', 'info');
    } else if (compareSessionB === null && sessionId !== compareSessionA) {
      setCompareSessionB(sessionId);
      setCompareLoading(true);
      try {
        const [resA, resB] = await Promise.all([
          fetch('/api/analysis/' + compareSessionA),
          fetch('/api/analysis/' + sessionId)
        ]);
        const dataA = await resA.json();
        const dataB = await resB.json();
        setCompareAnalysisA(dataA);
        setCompareAnalysisB(dataB);
      } catch (e) {
        toast('加载对比数据失败', 'error');
      } finally {
        setCompareLoading(false);
      }
    } else {
      toast('已选择两个Session，请先清除', 'info');
    }
  };

  const clearCompare = () => {
    setCompareSessionA(null);
    setCompareSessionB(null);
    setCompareAnalysisA(null);
    setCompareAnalysisB(null);
  };

  // Round 7: 对比维度差值计算
  const getCompareDiff = (keyA, keyB, label, unit = '', invert = false) => {
    const valA = keyA != null && keyA !== undefined ? parseFloat(keyA) : null;
    const valB = keyB != null && keyB !== undefined ? parseFloat(keyB) : null;
    if (valA === null || valB === null) return { label, valA, valB, diff: null, color: 'var(--text-secondary)' };
    const diff = valA - valB;
    // 对于圈速等越小越好的指标，invert=true时正差值表示A更慢（红色）
    let color = 'var(--text-secondary)';
    if (Math.abs(diff) > 0.001) {
      if (invert) {
        color = diff > 0 ? 'var(--danger)' : 'var(--success)';
      } else {
        color = diff > 0 ? 'var(--success)' : 'var(--danger)';
      }
    }
    return { label, valA, valB, diff: Math.abs(diff), color, displayDiff: (diff > 0 ? '+' : '') + (unit === 's' ? diff.toFixed(3) : diff.toFixed(1)) + unit };
  };

  // Round 5: 切换选择Session
  const toggleSessionSelect = (e, sessionId) => {
    e.stopPropagation();
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // 处理跨页导航意图
  useEffect(() => {
    if (!navIntent) return;
    // 从其他模块跳转到圈速榜（通过_subTab标记或仅传trackId无trackName）
    if (navIntent._subTab === 'leaderboard') {
      setMainTab('leaderboard');
      if (navIntent.trackId) setLbTrackFilter(navIntent.trackId);
    } else if (navIntent.trackId && !navIntent.trackName) {
      setMainTab('leaderboard');
      setLbTrackFilter(navIntent.trackId);
    } else if (navIntent.trackName) {
      setTrackFilter(navIntent.trackName);
    }
    if (navIntent.tuneId) {
      setSessionSearchQuery(tunes[navIntent.tuneId]?.name || '');
    }
  }, [navIntent, tunes]);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      toast('加载比赛记录失败', 'error');
    }
  };

  const loadTunes = async () => {
    try {
      const res = await fetch('/api/tunes');
      if (!res.ok) return;
      const data = await res.json();
      const map = {};
      (Array.isArray(data) ? data : []).forEach(t => {
        if (t.id) map[t.id] = t;
      });
      setTunes(map);
    } catch (e) {
      toast('加载调校方案失败', 'error');
    }
  };

  // Round 1: 删除session功能
  const deleteSession = async (id) => {
    try {
      const res = await fetch('/api/sessions/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selectedSession === id) {
        setSelectedSession(null);
        setAnalysis(null);
        setSessionDetail(null);
        setDiagnosis(null);
        setActiveChart('overview');
        setDetailLoaded(false);
        loadedTabsRef.current = new Set(['overview']);
        setShiftAnalysis(null);
        setTireAnalysis(null);
        setBrakeAnalysis(null);
        setAccelAnalysis(null);
      }
      setShowDeleteConfirm(null);
      toast('比赛记录已删除', 'success');
    } catch (e) {
      toast('删除失败', 'error');
    }
  };

  // Round 2: 选中session时只加载 analysis + diagnosis（轻量），不加载完整session detail
  const loadAnalysis = async (sessionId) => {
    setLoading(true);
    try {
      const [analysisRes, diagnosisRes] = await Promise.all([
        fetch('/api/analysis/' + sessionId),
        fetch('/api/analysis/' + sessionId + '/diagnosis')
      ]);
      const analysisData = await analysisRes.json();
      const diagnosisData = await diagnosisRes.json();
      setAnalysis(analysisData);
      setDiagnosis(diagnosisData);
      setSelectedSession(sessionId);
      // 切换session时重置tab缓存和detail标记
      setDetailLoaded(false);
      setSessionDetail(null);
      loadedTabsRef.current = new Set(['overview']);
      setShiftAnalysis(null);
      setTireAnalysis(null);
      setBrakeAnalysis(null);
      setAccelAnalysis(null);
      setChannelsData(null);
      setTurnsData(null);
    } catch (e) {
      toast('加载分析失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Round 2: 延迟加载完整session detail（回放/热力图需要时才加载）
  const loadSessionDetail = async (sessionId) => {
    if (detailLoaded) return;
    try {
      const res = await fetch('/api/sessions/' + sessionId);
      if (!res.ok) throw new Error('加载失败');
      const detailData = await res.json();
      setSessionDetail(detailData);
      setDetailLoaded(true);
    } catch (e) {
      toast('加载遥测数据失败', 'error');
    }
  };

  const loadTelemetryChannels = async () => {
    if (!selectedSession) return;
    if (channelsData && channelsData.sessionId === selectedSession) return;
    setChannelsLoading(true);
    try {
      const res = await fetch(`/api/analysis/${selectedSession}/telemetry-channels?downsampleStep=4`);
      if (!res.ok) throw new Error('Failed to fetch channels');
      const data = await res.json();
      setChannelsData(data);
    } catch (e) {
      toast('加载遥测数据失败', 'error');
    } finally {
      setChannelsLoading(false);
    }
  };

  const loadTurnsData = async () => {
    if (!selectedSession) return;
    if (turnsData && turnsData.sessionId === selectedSession) return;
    setTurnsLoading(true);
    try {
      const res = await fetch(`/api/analysis/${selectedSession}/turns`);
      if (!res.ok) throw new Error('Failed to fetch turns');
      const data = await res.json();
      setTurnsData(data);
    } catch (e) {
      toast('加载弯道数据失败', 'error');
    } finally {
      setTurnsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSession) return;
    if (activeChart === 'overview') {
      loadTurnsData();
    } else if (['dynamics', 'tires', 'shifts', 'pedals', 'overlay'].includes(activeChart)) {
      loadTelemetryChannels();
    } else if (activeChart === 'replay') {
      loadSessionDetail(selectedSession);
    }
  }, [activeChart, selectedSession]);

  const loadDetailData = async (type) => {
    if (!selectedSession) return;
    // Round 3: Tab缓存 - 已加载的tab不重复请求
    if (loadedTabsRef.current.has(type)) return;
    loadedTabsRef.current.add(type);

    const typeMap = {
      shifts: 'shiftAnalysis',
      tires: 'tireAnalysis',
      braking: 'brakeAnalysis',
      accel: 'accelAnalysis'
    };
    const setterMap = {
      shifts: setShiftAnalysis,
      tires: setTireAnalysis,
      braking: setBrakeAnalysis,
      accel: setAccelAnalysis
    };

    try {
      const res = await fetch('/api/analysis/' + selectedSession + '/' + type);
      const data = await res.json();
      setterMap[type](data);
    } catch (e) {
      toast('加载数据失败', 'error');
    }
  };

  // ========== 圈速排行榜函数 ==========
  const loadLeaderboard = async () => {
    setLbLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setLbEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('加载排行榜失败:', e);
      setLbEntries([]);
    } finally {
      setLbLoading(false);
      setLbLoaded(true);
    }
  };

  // 切换到排行榜Tab时自动加载数据
  useEffect(() => {
    if (mainTab === 'leaderboard' && !lbLoaded) {
      loadLeaderboard();
    }
  }, [mainTab, lbLoaded]);

  const loadLbTrend = async (trackId, vehicleOrdinal) => {
    const key = trackId + '_' + vehicleOrdinal;
    // Round 6: 命中缓存则直接返回
    if (lbTrendCacheRef.current.has(key)) {
      setLbTrendData(lbTrendCacheRef.current.get(key));
      return;
    }
    setLbTrendLoading(true);
    lbTrendLoadingSetRef.current.add(key);
    try {
      const res = await fetch(`/api/leaderboard/trend?trackId=${encodeURIComponent(trackId)}&vehicleOrdinal=${encodeURIComponent(vehicleOrdinal)}`);
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      // Round 6: 写入缓存
      lbTrendCacheRef.current.set(key, data);
      setLbTrendData(data);
    } catch (e) {
      console.error('加载趋势失败:', e);
      setLbTrendData(null);
    } finally {
      lbTrendLoadingSetRef.current.delete(key);
      setLbTrendLoading(false);
    }
  };

  // Round 6: 清除单个排行项的趋势缓存
  const clearLbTrendCache = (key) => {
    lbTrendCacheRef.current.delete(key);
  };

  // Round 6: 清除全部排行榜趋势缓存
  const clearAllLbTrendCache = () => {
    lbTrendCacheRef.current.clear();
    setLbTrendData(null);
    // 同时重新加载排行榜数据
    loadLeaderboard();
  };

  const toggleLbExpand = (entry) => {
    const key = entry.trackId + '_' + entry.vehicleOrdinal;
    // Round 7: 支持多展开 - toggle该key在Set中
    setLbExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Round 6: 收起时保留缓存，不再清除
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // 仅在新展开时加载趋势数据（如果不在缓存中）
    if (!lbExpandedKeys.has(key) && !lbTrendCacheRef.current.has(key)) {
      loadLbTrend(entry.trackId, entry.vehicleOrdinal);
    } else if (!lbExpandedKeys.has(key) && lbTrendCacheRef.current.has(key)) {
      // 有缓存，恢复显示
      setLbTrendData(lbTrendCacheRef.current.get(key));
    }
  };

  const lbFormatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '-';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const lbAllTracks = useMemo(() => {
    const map = new Map();
    lbEntries.forEach(e => map.set(e.trackId, e.trackName));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  }, [lbEntries]);

  // Round 3: 所有唯一车辆
  const lbAllVehicles = useMemo(() => {
    const map = new Map();
    lbEntries.forEach(e => {
      const key = e.vehicleOrdinal + '_' + e.vehicleName;
      if (!map.has(key)) {
        map.set(key, { ordinal: e.vehicleOrdinal, name: e.vehicleName || `Car #${e.vehicleOrdinal}`, pi: e.vehiclePI, cls: e.vehicleClass });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.ordinal - b.ordinal);
  }, [lbEntries]);

  const lbFiltered = useMemo(() => {
    // Round 8: 计算时间范围截止日期
    const now = Date.now();
    let cutoffMs = 0;
    if (lbTimeRange === '7d') cutoffMs = 7 * 24 * 60 * 60 * 1000;
    else if (lbTimeRange === '30d') cutoffMs = 30 * 24 * 60 * 60 * 1000;

    return lbEntries.filter(e => {
      const matchSearch = !lbSearchQuery.trim() ||
        (e.trackName || '').toLowerCase().includes(lbSearchQuery.trim().toLowerCase()) ||
        String(e.vehicleOrdinal).includes(lbSearchQuery.trim());
      const matchTrack = !lbTrackFilter || e.trackId === lbTrackFilter;
      // Round 3: 车辆筛选
      const matchVehicle = !lbVehicleFilter || e.vehicleOrdinal === lbVehicleFilter;
      // Round 8: 时间范围过滤 - 使用lastSessionAt字段
      const matchTime = lbTimeRange === 'all' || !e.lastSessionAt ||
        (now - new Date(e.lastSessionAt).getTime()) <= cutoffMs;
      return matchSearch && matchTrack && matchVehicle && matchTime;
    });
  }, [lbEntries, lbSearchQuery, lbTrackFilter, lbTimeRange, lbVehicleFilter]);

  const getVehicleClass = (cls) => {
    const classes = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
    return classes[cls] || '?';
  };

  // ========== End 圈速排行榜函数 ==========

  // Round 5: 导出改为 fetch + blob 下载，失败时 toast 提示
  const downloadBlob = async (url, filename) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      toast('导出失败，请重试', 'error');
    }
  };

  const exportCSV = (sessionId) => {
    downloadBlob('/api/export/csv/' + sessionId, 'telemetry_' + sessionId + '.csv');
  };

  // Round 6: 增强版CSV导出 - 包含轮胎温度、悬挂行程、G力
  const exportEnhancedCSV = async (sessionId) => {
    try {
      toast('正在生成增强版CSV...', 'info');
      const res = await fetch('/api/sessions/' + sessionId);
      if (!res.ok) throw new Error('加载失败');
      const detail = await res.json();
      const positions = detail.positions || detail.data || [];
      if (positions.length === 0) {
        toast('无遥测数据可导出', 'error');
        return;
      }
      // 构建增强版CSV
      const headers = [
        'timestamp_ms', 'speed_kmh', 'gear', 'rpm', 'throttle_pct', 'brake_pct',
        'steer_input', 'position_x', 'position_z',
        'tire_temp_fl', 'tire_temp_fr', 'tire_temp_rl', 'tire_temp_rr',
        'suspension_travel_fl', 'suspension_travel_fr', 'suspension_travel_rl', 'suspension_travel_rr',
        'g_force_lateral', 'g_force_longitudinal', 'g_force_vertical',
        'lap_number', 'is_drifting', 'is_abs_active', 'is_tc_active',
        'accel_x', 'accel_y', 'accel_z'
      ];
      const rows = positions.map(p => [
        p.timestampMS || p.timestamp || 0,
        (p.speed || 0).toFixed(1),
        p.gear || 0,
        p.rpm || 0,
        ((p.accel || 0) / 255 * 100).toFixed(1),
        ((p.brake || 0) / 255 * 100).toFixed(1),
        (p.steer || 0).toFixed(3),
        (p.positionX || p.x || 0).toFixed(2),
        (p.positionZ || p.z || 0).toFixed(2),
        p.tireTempFL != null ? p.tireTempFL.toFixed(1) : '',
        p.tireTempFR != null ? p.tireTempFR.toFixed(1) : '',
        p.tireTempRL != null ? p.tireTempRL.toFixed(1) : '',
        p.tireTempRR != null ? p.tireTempRR.toFixed(1) : '',
        p.suspFL != null ? p.suspFL.toFixed(3) : '',
        p.suspFR != null ? p.suspFR.toFixed(3) : '',
        p.suspRL != null ? p.suspRL.toFixed(3) : '',
        p.suspRR != null ? p.suspRR.toFixed(3) : '',
        p.lateralG != null ? p.lateralG.toFixed(3) : '',
        p.longitudinalG != null ? p.longitudinalG.toFixed(3) : '',
        p.verticalG != null ? p.verticalG.toFixed(3) : '',
        p.lapNumber || p.lap || 0,
        p.isDrifting ? 1 : 0,
        p.isAbsActive ? 1 : 0,
        p.isTcActive ? 1 : 0,
        p.accelX != null ? p.accelX.toFixed(3) : '',
        p.accelY != null ? p.accelY.toFixed(3) : '',
        p.accelZ != null ? p.accelZ.toFixed(3) : ''
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'telemetry_enhanced_' + sessionId + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('增强版CSV已导出 (' + positions.length + ' 行)', 'success');
    } catch (e) {
      toast('增强版CSV导出失败', 'error');
    }
  };

  // Round 6: PDF报告导出 - 使用浏览器print功能
  const exportPDFReport = (sessionId) => {
    try {
      const session = sessions.find(s => s.id === sessionId);
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast('请允许弹出窗口以生成PDF', 'error');
        return;
      }
      const score = analysis?.驾驶评分;
      const worstItems = worst3 || [];
      const stats = analysis?.成绩 || {};
      const detailStats = analysis?.详细统计 || {};
      const brakeInfo = analysis?.制动分析 || {};
      const accelInfo = analysis?.加速分析 || {};
      const lineInfo = analysis?.走线分析 || {};

      printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>比赛分析报告 - ${session?.trackName || '未知赛道'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a2e; background: #fff; font-size: 12px; }
  @media print { body { padding: 0; } }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
  .header h1 { font-size: 20px; color: #2563eb; margin-bottom: 4px; }
  .header .sub { font-size: 11px; color: #666; }
  .section { margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
  .section-title { background: #f0f4ff; padding: 8px 12px; font-weight: 700; font-size: 13px; color: #2563eb; border-bottom: 1px solid #e5e7eb; }
  .section-body { padding: 10px 12px; }
  .score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .score-big { font-size: 36px; font-weight: 900; color: #2563eb; }
  .grade { font-size: 18px; font-weight: 700; padding: 4px 12px; border-radius: 4px; color: #000; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat-card { background: #f9fafb; border-radius: 6px; padding: 10px; text-align: center; }
  .stat-label { font-size: 9px; color: #888; margin-bottom: 3px; }
  .stat-value { font-size: 16px; font-weight: 700; font-family: monospace; }
  .dim-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
  .dim-card { background: #f9fafb; border-radius: 6px; padding: 8px; text-align: center; border: 1px solid #e5e7eb; }
  .dim-name { font-size: 9px; color: #888; margin-bottom: 2px; }
  .dim-score { font-size: 18px; font-weight: 700; font-family: monospace; }
  .dim-bar { height: 3px; background: #e5e7eb; border-radius: 2px; margin-top: 4px; overflow: hidden; }
  .dim-bar-fill { height: 100%; border-radius: 2px; }
  .improve-box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
  .improve-title { font-size: 13px; font-weight: 700; color: #dc2626; margin-bottom: 8px; }
  .improve-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 11px; }
  .priority-tag { font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 3px; }
  .p-high { background: #fee2e2; color: #dc2626; }
  .p-med { background: #fef3c7; color: #d97706; }
  .p-low { background: #dbeafe; color: #2563eb; }
  .eff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; padding: 6px 8px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; color: #555; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #999; }
  .print-btn { margin: 16px auto; display: block; padding: 10px 32px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style></head><body>
<div class="header">
  <h1>比赛分析报告</h1>
  <div class="sub">${session?.trackName || '未知赛道'} | ${formatDate(session?.savedAt)} | ${stats.圈数 || 0}圈</div>
</div>
<button class="print-btn" onclick="window.print()">打印 / 保存为PDF</button>
${score ? `<div class="section"><div class="section-title">驾驶综合评分</div><div class="section-body">
<div class="score-header"><div class="score-big">${score.总分}</div><div class="grade" style="background:${score.总分 >= 80 ? '#22c55e' : score.总分 >= 60 ? '#eab308' : '#ef4444'}">${score.等级 || '-'}</div></div>
<div class="dim-grid">
${Object.entries(score.维度 || {}).map(([n, d]) => {
  const r = d.分数 / d.满分;
  const c = r >= 0.8 ? '#22c55e' : r >= 0.6 ? '#eab308' : '#ef4444';
  return `<div class="dim-card"><div class="dim-name">${n}</div><div class="dim-score" style="color:${c}">${d.分数}</div><div style="font-size:9px;color:#aaa">/${d.满分}</div><div class="dim-bar"><div class="dim-bar-fill" style="width:${r*100}%;background:${c}"></div></div></div>`;
}).join('')}
</div>
${worstItems.length > 0 ? `<div class="improve-box"><div class="improve-title">最需改进 (Top ${worstItems.length})</div>${worstItems.map((item, idx) => {
  const pc = idx === 0 ? 'p-high' : idx === 1 ? 'p-med' : 'p-low';
  const pl = idx === 0 ? '最需改进' : idx === 1 ? '次要改进' : '建议关注';
  return `<div class="improve-item"><span class="priority-tag ${pc}">${pl}</span><span>${item.name}</span><span style="font-family:monospace;font-weight:700">${item.分数}/${item.满分} (${Math.round(item.ratio*100)}%)</span></div>`;
}).join('')}</div>` : ''}
</div></div>` : ''}
<div class="section"><div class="section-title">成绩统计</div><div class="section-body"><div class="stats-grid">
<div class="stat-card"><div class="stat-label">最快圈速</div><div class="stat-value" style="color:#eab308">${formatTime(stats.最快圈速)}</div></div>
<div class="stat-card"><div class="stat-label">最高速度</div><div class="stat-value">${detailStats.最高速度 || 0} km/h</div></div>
<div class="stat-card"><div class="stat-label">平均速度</div><div class="stat-value">${detailStats.平均速度 || 0} km/h</div></div>
</div></div></div>
<div class="section"><div class="section-title">制动 & 加速效率</div><div class="section-body"><div class="eff-grid">
<div class="stat-card"><div class="stat-label">制动效率</div><div class="stat-value" style="color:${(brakeInfo.制动效率||0)>=70?'#22c55e':(brakeInfo.制动效率||0)>=50?'#eab308':'#ef4444'}">${brakeInfo.制动效率 || 0}%</div></div>
<div class="stat-card"><div class="stat-label">牵引力利用率</div><div class="stat-value" style="color:${(accelInfo.牵引力利用率||0)>=70?'#22c55e':(accelInfo.牵引力利用率||0)>=50?'#eab308':'#ef4444'}">${accelInfo.牵引力利用率 || 0}%</div></div>
<div class="stat-card"><div class="stat-label">走线评分</div><div class="stat-value" style="color:${(lineInfo.评分||0)>=70?'#22c55e':'#eab308'}">${lineInfo.评分 || 0}%</div></div>
</div></div></div>
<div class="footer">Forza Telemetry - 赛后分析报告 | 生成时间: ${new Date().toLocaleString('zh-CN')}</div>
</body></html>`);
      printWindow.document.close();
    } catch (e) {
      toast('PDF报告导出失败', 'error');
    }
  };

  const exportReport = (sessionId) => {
    downloadBlob('/api/export/report/' + sessionId, 'report_' + sessionId + '.html');
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toFixed(3).padStart(6, '0');
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // Round 4: 诊断区域颜色逻辑提取为函数，替代4层嵌套三元运算
  const getDiagnosisStyle = (diagnosis) => {
    if (!diagnosis?.tuneId) {
      return { border: '2px solid var(--text-muted)', background: 'rgba(139, 148, 158, 0.05)' };
    }
    if (!diagnosis.diagnoses?.length) {
      return { border: '2px solid var(--success)', background: 'rgba(0, 200, 150, 0.05)' };
    }
    const hasHigh = diagnosis.diagnoses.some(d => d.严重程度 === 'high');
    const hasMedium = diagnosis.diagnoses.some(d => d.严重程度 === 'medium');
    if (hasHigh) {
      return { border: '2px solid var(--danger)', background: 'rgba(248, 81, 73, 0.05)' };
    }
    if (hasMedium) {
      return { border: '2px solid var(--warning)', background: 'rgba(210, 153, 34, 0.05)' };
    }
    return { border: '2px solid var(--accent)', background: 'rgba(88, 166, 255, 0.05)' };
  };

  const generateChartData = () => {
    if (!analysis && !tireAnalysis) return {};
    const tire = tireAnalysis || analysis?.轮胎分析 || {};
    
    const tireData = [
      { name: '左前', temp: tire.温度分布?.前左 || 0, slip: parseFloat(tire.打滑统计?.前左平均 || 0) },
      { name: '右前', temp: tire.温度分布?.前右 || 0, slip: parseFloat(tire.打滑统计?.右前平均 || 0) },
      { name: '左后', temp: tire.温度分布?.后左 || 0, slip: parseFloat(tire.打滑统计?.后左平均 || 0) },
      { name: '右后', temp: tire.温度分布?.后右 || 0, slip: parseFloat(tire.打滑统计?.后右平均 || 0) }
    ];

    const styleData = [
      { name: '油门', value: analysis.驾驶风格?.油门控制 || 0 },
      { name: '刹车', value: analysis.驾驶风格?.刹车控制 || 0 },
      { name: '转向', value: analysis.驾驶风格?.转向平顺性 || 0 }
    ];

    const sectorData = (analysis.分段分析?.分段 || []).map(s => ({
      name: '段' + s.段落,
      speed: s.平均速度 || 0,
      maxSpeed: s.最高速度 || 0,
      score: s.走线评分 || 0
    }));

    return { tireData, styleData, sectorData };
  };

  const { tireData, styleData, sectorData } = generateChartData();

  // 圈速趋势数据 - Round 2: 从analysis中提取也支持
  const lapTrendData = useMemo(() => {
    if (!sessionDetail?.data) return null
    const lapMap = {}
    sessionDetail.data.forEach(d => {
      const lap = d.lapNumber || 0
      if (!lapMap[lap]) {
        lapMap[lap] = { start: d.timestampMS, end: d.timestampMS }
      }
      lapMap[lap].end = d.timestampMS
    })
    const data = Object.entries(lapMap)
      .filter(([, v]) => v.end - v.start > 10000)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([num, v]) => ({
        lap: '第' + num + '圈',
        time: (v.end - v.start) / 1000
      }))
    if (data.length < 2) return null
    const bestTime = Math.min(...data.map(d => d.time))
    return { data, bestTime }
  }, [sessionDetail?.data])

  // Round 9: 分页后的session列表
  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * SESSION_PAGE_SIZE;
    return myFilteredSessions.slice(start, start + SESSION_PAGE_SIZE);
  }, [myFilteredSessions, sessionPage]);
  const totalPages = Math.ceil(myFilteredSessions.length / SESSION_PAGE_SIZE);

  // Round 1: 改进优先级 - 从5维度中找得分最低的3个
  const worst3 = useMemo(() => {
    if (!analysis?.驾驶评分?.维度) return [];
    const sorted = Object.entries(analysis.驾驶评分.维度)
      .map(([name, dim]) => ({ name, ratio: dim.分数 / dim.满分, 分数: dim.分数, 满分: dim.满分 }))
      .sort((a, b) => a.ratio - b.ratio);
    return sorted.slice(0, 3);
  }, [analysis?.驾驶评分?.维度]);

  const worst2 = useMemo(() => worst3.slice(0, 2), [worst3]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* 主Tab栏: 比赛记录 / 圈速排行榜 */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        {[
          { id: 'sessions', label: '比赛记录' },
          { id: 'leaderboard', label: '圈速排行榜' },
        ].map(tab => (
          <div
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            style={{
              padding: '10px 20px',
              cursor: 'pointer',
              color: mainTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: mainTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 13,
              fontWeight: mainTab === tab.id ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {/* ===== 比赛记录视图 ===== */}
      {mainTab === 'sessions' && (
    <div style={{ display: 'flex', flex: 1 }}>
      <div style={{ 
        width: 320, 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          padding: 12, 
          borderBottom: '1px solid var(--border)',
          fontSize: 14,
          fontWeight: 600
        }}>
          比赛记录 ({sessions.length})
          {/* Round 5: 批量操作按钮 */}
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
                <button onClick={() => setSelectedSessionIds(new Set(prev => {
                  const next = new Set(myFilteredSessions.map(s => s.id));
                  return next.size === prev.size ? new Set() : next;
                }))} style={{ ...btnSmallStyle, fontSize: 9 }}>
                  {selectedSessionIds.size === myFilteredSessions.length ? '取消全选' : '全选'}
                </button>
              </>
            )}
          </div>
          {/* Round 5: 快捷键提示 */}
          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            快捷键: <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Left/Right</span> 切换记录 &nbsp;
            <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Up/Down</span> 切换Tab
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
          {/* 赛道标签筛选器 - 下拉选择器 */}
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
                onClick={() => batchMode ? toggleSessionSelect(event, session.id) : loadAnalysis(session.id)}
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
                {/* Round 5: 缩略图 + 复选框 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <TrackThumbnail trackId={session.trackId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span
                    style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)' }}
                  >
                    {session.trackName || '未知赛道'}
                  </span>
                  <span style={{ fontSize: 9, color: '#484f58' }}>
                    {session.autoRecorded ? '自动' : '手动'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#8b949e' }}>
                  <span>{formatDate(session.savedAt)}</span>
                  <span>最快 <span style={{ color: '#d29922', fontFamily: 'monospace' }}>{formatTime(session.laps?.best)}</span></span>
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
                    调校: {typeof tunes[session.tuneId] === 'string' ? tunes[session.tuneId] : (tunes[session.tuneId]?.name || '未知')}
                  </div>
                )}
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {/* Round 6: PDF报告 */}
                  <button onClick={(e) => { e.stopPropagation(); exportPDFReport(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(188,140,255,0.1)', color: '#bc8cff', borderColor: 'rgba(188,140,255,0.3)' }}>PDF报告</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(218,54,51,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>删除</button>
                  {/* Round 7: 对比按钮 */}
                  <button onClick={(e) => { e.stopPropagation(); selectCompareSession(session.id); }} style={{ ...btnSmallStyle, background: (compareSessionA === session.id || compareSessionB === session.id) ? 'rgba(210,153,34,0.15)' : 'var(--bg-tertiary)', color: (compareSessionA === session.id || compareSessionB === session.id) ? '#d29922' : 'var(--text-primary)', borderColor: (compareSessionA === session.id || compareSessionB === session.id) ? 'rgba(210,153,34,0.3)' : 'var(--border)' }}>
                    {compareSessionA === session.id ? 'A已选' : compareSessionB === session.id ? 'B已选' : '对比'}
                  </button>
                  {/* Round 5: 批量选择复选框 */}
                  {batchMode && (
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSessionSelect(e, session.id); }}
                      style={{
                        width: 16, height: 16, borderRadius: 3,
                        border: selectedSessionIds.has(session.id) ? '2px solid #58a6ff' : '2px solid var(--border)',
                        background: selectedSessionIds.has(session.id) ? '#58a6ff' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0, marginLeft: 'auto'
                      }}
                    >
                      {selectedSessionIds.has(session.id) && (
                        <span style={{ color: '#000', fontSize: 10, fontWeight: 700 }}>&#10003;</span>
                      )}
                    </div>
                  )}
                </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {/* Round 9: 分页控件 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
              <button onClick={() => setSessionPage(1)} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === 1 ? 0.4 : 1 }}>&laquo;</button>
              <button onClick={() => setSessionPage(p => Math.max(1, p - 1))} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === 1 ? 0.4 : 1 }}>&lsaquo;</button>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                {sessionPage} / {totalPages} 页
              </span>
              <button onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === totalPages ? 0.4 : 1 }}>&rsaquo;</button>
              <button onClick={() => setSessionPage(totalPages)} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === totalPages ? 0.4 : 1 }}>&raquo;</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <LoadingSpinner />
        ) : !analysis ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>选择左侧比赛记录查看分析</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>点击任意记录以加载分析数据</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { id: 'overview', label: '总览 (诊断与弯角)' },
                { id: 'dynamics', label: '驾驶动力学 (摩擦圆)' },
                { id: 'tires', label: '轮荷载荷 (底盘)' },
                { id: 'shifts', label: '换挡扭矩 (路线图)' },
                { id: 'pedals', label: '踏板动力学 (滑行区)' },
                { id: 'overlay', label: '对标工作台 (多通道)' },
                { id: 'replay', label: '影子车回放 (HUD)' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveChart(tab.id);
                  }}
                  style={{
                    padding: '4px 12px',
                    background: activeChart === tab.id ? '#58a6ff' : '#161b22',
                    color: activeChart === tab.id ? '#fff' : '#8b949e',
                    border: activeChart === tab.id ? 'none' : '1px solid #21262d',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: activeChart === tab.id ? 600 : 400,
                    transition: 'all 0.2s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeChart === 'overview' && (
              <>
                {/* 驾驶综合评分 */}
                {analysis.驾驶评分 && (
                  <div style={{
                    ...sectionStyle,
                    background: 'linear-gradient(135deg, rgba(0,120,255,0.08) 0%, rgba(0,200,150,0.08) 100%)',
                    border: '1px solid var(--accent)',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: 0 }}>驾驶综合评分</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          fontSize: 36, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace',
                          textShadow: '0 0 12px rgba(0,120,255,0.4)'
                        }}>
                          {analysis.驾驶评分.总分}
                        </div>
                        <div style={{
                          fontSize: 18, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
                          background: analysis.驾驶评分.总分 >= 80 ? 'var(--success)' :
                                      analysis.驾驶评分.总分 >= 60 ? 'var(--warning)' : 'var(--danger)',
                          color: '#000'
                        }}>
                          {analysis.驾驶评分.等级}
                        </div>
                      </div>
                    </div>
                    
                    {/* 子指标评分 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                      {Object.entries(analysis.驾驶评分.维度 || {}).map(([name, dim]) => {
                        const ratio = dim.分数 / dim.满分;
                        const color = ratio >= 0.8 ? 'var(--success)' : ratio >= 0.6 ? 'var(--warning)' : 'var(--danger)';
                        return (
                          <div key={name} style={{
                            background: 'var(--bg-primary)', borderRadius: 6, padding: 10,
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>{name}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'monospace' }}>
                                {dim.分数}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {dim.满分}</span>
                            </div>
                            <div style={{ height: 3, background: '#21262d', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${ratio * 100}%`, background: color, transition: 'width 0.3s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 智能教练建议 */}
                    {analysis.建议 && analysis.建议.length > 0 && (
                      <div style={{ background: 'rgba(218,54,51,0.05)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: 6, padding: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f85149', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>💡</span> 教练驾驶诊断建议
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {analysis.建议.map((adv, idx) => (
                            <li key={idx} style={{ marginBottom: 4 }}>{adv}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 赛道地图与车辆调校诊断（双栏布局） */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* 左栏：Canvas 痛点赛道图 */}
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>赛道诊断热力图</h3>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                      红色虚线标出本场比赛时间流失最严重的 3 个弯道
                    </div>
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      width={380}
                      height={320}
                      highlightedPoints={
                        turnsData?.turns
                          ? turnsData.turns
                              .slice(0, 3)
                              .map(t => ({ x: t.current?.x || t.x || 0, z: t.current?.z || t.z || 0, label: t.name }))
                          : []
                      }
                    />
                  </div>

                  {/* 右栏：车辆调校与诊断 */}
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>车辆调校与车况诊断</h3>
                    {diagnosis ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 11 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>马力/扭矩：</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{analysis.详细统计?.最高功率 || 0} HP / {analysis.详细统计?.最大扭矩 || 0} N·m</span>
                          </div>
                          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 11 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>最高车速：</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{analysis.详细统计?.最高速度 || 0} km/h</span>
                          </div>
                        </div>

                        {diagnosis.diagnoses && diagnosis.diagnoses.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {diagnosis.diagnoses.map((diag, idx) => (
                              <div key={idx} style={{
                                padding: 8,
                                background: diag.严重程度 === 'high' ? 'rgba(240,80,80,0.08)' : 'rgba(240,180,80,0.08)',
                                borderLeft: diag.严重程度 === 'high' ? '4px solid var(--danger)' : '4px solid var(--warning)',
                                borderRadius: '0 6px 6px 0',
                                fontSize: 11
                              }}>
                                <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                  <span>🔧 {diag.系统 || diag.类别 || '系统'}</span>
                                  <span style={{ color: diag.严重程度 === 'high' ? 'var(--danger)' : 'var(--warning)', fontSize: 9 }}>
                                    {diag.严重程度 === 'high' ? '严重问题' : '一般问题'}
                                  </span>
                                </div>
                                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{diag.诊断描述 || diag.问题 || '车辆故障'}</div>
                                <div style={{ color: 'var(--accent)', marginTop: 4, fontSize: 10 }}>建议：{diag.调整建议 || diag.建议 || '检查调校'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: 20, color: 'var(--success)', fontSize: 11 }}>
                            ✔ 车辆调校正常，未检测到悬挂或制动过热问题。
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>加载调校诊断中...</div>
                    )}
                  </div>
                </div>

                {/* 弯道进化分析 */}
                {turnsData && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>弯道车速进化分析 (Cornering Evolution)</h3>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
                      点击下方弯道可查看该弯道历史前 5 次最快圈的速度演进趋势
                    </div>
                    <CornerEvolutionPanel turns={turnsData.turns || []} />
                  </div>
                )}
              </>
            )}

            {activeChart === 'dynamics' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>G-G 摩擦力圆 (Traction Circle)</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    散点反映横向G力与纵向G力的物理结合。散点分布越宽阔、越饱满，代表轮胎物理抓地极限压榨得越充分。
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
                  <div style={{ ...sectionStyle, height: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis type="number" dataKey="gLat" name="横向G值" domain={[-1.5, 1.5]} stroke="#8b949e" unit="G" style={{ fontSize: 9 }} />
                        <YAxis type="number" dataKey="gLong" name="纵向G值" domain={[-1.5, 1.5]} stroke="#8b949e" unit="G" style={{ fontSize: 9 }} />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10 }}
                        />
                        <Scatter name="遥测G值" data={channelsData.channels || []} fill="#58a6ff" shape="circle" />
                        <ReferenceLine x={0} stroke="#484f58" />
                        <ReferenceLine y={0} stroke="#484f58" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 10px', fontSize: 12 }}>极限诊断分析</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11 }}>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>最高横向力 (G-Lat)：</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                          {Math.max(...(channelsData.channels || []).map(c => Math.abs(c.gLat || 0))).toFixed(2)} G
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>最大制动减速 (G-Long)：</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#f85149', fontFamily: 'monospace' }}>
                          {Math.min(...(channelsData.channels || []).map(c => c.gLong || 0)).toFixed(2)} G
                        </div>
                      </div>
                      <div style={{ background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.2)', padding: 10, borderRadius: 6, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, color: '#58a6ff', marginBottom: 4 }}>💡 摩擦圆识图指南</div>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-secondary)' }}>
                          散点偏下代表大力刹车，偏上代表全力加速，偏左/偏右代表左右急速过弯。<br/>
                          如果您的摩擦圆散点呈**“十字形”**（只有直道大力刹车和弯中横向，没有斜向散点），说明您存在“刹车没松完不敢打方向”或“方向没回正不敢开油”的问题，即**入弯循迹刹车 (Trail Braking) 不足**。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'tires' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>轮荷载荷与温度底盘 (Tires & Chassis)</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    车轮 2x2 底盘布局。轮胎温区包含内/中/外 (IMO) 细节（调校必备）；轴荷反映过弯侧滑角与驱动轮打滑率。
                  </div>
                </div>
                
                <TiresChassisPanel channels={channelsData.channels || []} />
              </div>
            )}

            {activeChart === 'shifts' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>换挡点赛道空间分布 (Shifts & Power Band)</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    在 2D 赛道轨迹上用红点（降档）和绿点（升档）标出您的实际换挡物理位置，避免空洞的纯时间表格。
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
                  <div style={sectionStyle}>
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      width={440}
                      height={320}
                      highlightedPoints={
                        (() => {
                          const pts = [];
                          const points = channelsData.channels || [];
                          for (let i = 1; i < points.length; i++) {
                            const prev = points[i - 1];
                            const curr = points[i];
                            if (curr.gear !== prev.gear && curr.gear > 0 && prev.gear > 0) {
                              pts.push({
                                x: curr.x,
                                z: curr.z,
                                label: `${prev.gear}→${curr.gear}`,
                                color: curr.gear > prev.gear ? '#3fb950' : '#f85149'
                              });
                            }
                          }
                          return pts.slice(0, 30);
                        })()
                      }
                    />
                  </div>

                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 10px', fontSize: 12 }}>换挡诊断说明</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11, lineHeight: 1.5 }}>
                      <div style={{ background: 'rgba(63,185,80,0.05)', border: '1px solid rgba(63,185,80,0.2)', padding: 10, borderRadius: 6 }}>
                        <span style={{ color: '#3fb950', fontWeight: 700 }}>● 绿色标识：升档点</span>
                        <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-secondary)' }}>
                          升档应当发生在引擎功率红线爆发点附近。若升档点在赛道直道过早出现（拖档），会导致转速低于最佳马力区间。
                        </p>
                      </div>
                      
                      <div style={{ background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.2)', padding: 10, borderRadius: 6 }}>
                        <span style={{ color: '#f85149', fontWeight: 700 }}>● 红色标识：降档点</span>
                        <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-secondary)' }}>
                          降档应当在制动区平滑完成。**切忌在横向弯心 G 力达到最高时剧烈降档**，因为瞬间的引擎刹车突变会打破车辆后轴抓地平衡，导致甩尾失控。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'pedals' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>踏板动力学与滑行区间 (Pedal Overlap & Coasting)</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    油门与刹车重叠对齐图。**空油空刹滑行 (Coasting)** 区域是由于入弯过早或犹豫不决导致的圈速隐形杀手。
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
                  <div style={{ ...sectionStyle, height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={channelsData.channels || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" name="距离" stroke="#8b949e" unit="m" style={{ fontSize: 9 }} />
                        <YAxis stroke="#8b949e" domain={[0, 100]} unit="%" style={{ fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                          labelStyle={{ fontSize: 10, color: '#8b949e' }}
                          itemStyle={{ fontSize: 10 }}
                        />
                        <Line type="monotone" dataKey="throttle" stroke="#3fb950" strokeWidth={2} dot={false} name="油门开度" />
                        <Line type="monotone" dataKey="brake" stroke="#f85149" strokeWidth={2} dot={false} name="刹车压力" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 10px', fontSize: 12 }}>滑行效率分析</h4>
                    {(() => {
                      const list = channelsData.channels || [];
                      let coastingCount = 0;
                      let totalCount = list.length;
                      list.forEach(c => {
                        if ((c.throttle || 0) < 5 && (c.brake || 0) < 5 && (c.speed || 0) > 20) {
                          coastingCount++;
                        }
                      });
                      const ratio = totalCount > 0 ? Math.round((coastingCount / totalCount) * 100) : 0;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11 }}>
                          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>本圈滑行段占比 (Coasting Ratio)：</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: ratio > 15 ? 'var(--danger)' : ratio > 8 ? 'var(--warning)' : 'var(--success)', fontFamily: 'monospace' }}>
                              {ratio} %
                            </div>
                            <div style={{ height: 4, background: '#21262d', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${ratio}%`, background: ratio > 15 ? 'var(--danger)' : ratio > 8 ? 'var(--warning)' : 'var(--success)' }} />
                            </div>
                          </div>
                          
                          <div style={{ background: 'rgba(188,140,255,0.05)', border: '1px solid rgba(188,140,255,0.2)', padding: 10, borderRadius: 6, lineHeight: 1.4 }}>
                            <div style={{ fontWeight: 700, color: '#bc8cff', marginBottom: 4 }}>💡 驾驶诊断：关于滑行</div>
                            <p style={{ margin: 0, fontSize: 9, color: 'var(--text-secondary)' }}>
                              滑行是指车辆在弯角非旋转区间，没有加油也没有刹车的游离滑行状态。<br/>
                              若滑行占比大于 10%，说明您刹车过早，或者弯中不敢开油。**高手的目标是把滑行比例压缩在 5% 以下**。
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'overlay' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>多通道距离对齐对标工作台 (Distance-Aligned Overlay)</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    以相同的物理距离为 X 轴。鼠标滑动时，所有通道图表的十字准星将保持**实时跨轴同步联动**，实现最高精度对标。
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ ...sectionStyle, height: 160, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>车速曲线 (Speed Profile)</span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>最高: {Math.max(...channelsData.channels.map(c => c.speed))} km/h</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={['auto', 'auto']} unit="km/h" />
                        <Tooltip contentStyle={{ display: 'none' }} />
                        <Line type="monotone" dataKey="speed" stroke="#58a6ff" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>踏板深度 (Pedals)</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[0, 100]} unit="%" />
                        <Tooltip contentStyle={{ display: 'none' }} />
                        <Line type="monotone" dataKey="throttle" stroke="#3fb950" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="brake" stroke="#f85149" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>方向盘转角 (Steering)</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[-127, 127]} />
                        <Tooltip contentStyle={{ display: 'none' }} />
                        <Line type="monotone" dataKey="steer" stroke="#d29922" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>档位 (Gear Selection)</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" style={{ fontSize: 8 }} unit="m" />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[0, 8]} tickCount={9} />
                        <Tooltip 
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10 }}
                        />
                        <Line type="step" dataKey="gear" stroke="#bc8cff" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'replay' && sessionDetail && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>单圈回放</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    回放本次session的驾驶轨迹与遥测数据
                  </div>
                </div>
                <ReplayPlayer positions={sessionDetail.positions || []} data={sessionDetail.data || []} />
              </div>
            )}

            {activeChart === 'replay' && !sessionDetail && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                请先从左侧选择一个比赛记录以查看回放
              </div>
            )}
          </div>
        )}
      </div>
    </div>
      )}

      {/* ===== 圈速排行榜视图 ===== */}
      {mainTab === 'leaderboard' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>圈速排行榜</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                共 {lbEntries.length} 个赛道-车辆组合
              </div>
            </div>
            <button onClick={clearAllLbTrendCache} style={lbBtnPrimaryStyle}>
              刷新
            </button>
          </div>

          {/* 筛选栏 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={lbSearchQuery}
              onChange={e => setLbSearchQuery(e.target.value)}
              placeholder="搜索赛道或车辆..."
              style={{ ...lbInputStyle, width: 200, marginBottom: 0 }}
            />
            <select
              value={lbTrackFilter}
              onChange={e => setLbTrackFilter(e.target.value)}
              style={{ ...lbInputStyle, width: 180, marginBottom: 0 }}
            >
              <option value="">全部赛道</option>
              {lbAllTracks.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            {/* Round 8: 时间范围筛选 */}
            <select
              value={lbTimeRange}
              onChange={e => setLbTimeRange(e.target.value)}
              style={{ ...lbInputStyle, width: 120, marginBottom: 0 }}
            >
              <option value="all">全部时间</option>
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
            </select>
            {/* Round 3: 车辆筛选 */}
            <select
              value={lbVehicleFilter}
              onChange={e => setLbVehicleFilter(e.target.value)}
              style={{ ...lbInputStyle, width: 160, marginBottom: 0 }}
            >
              <option value="">全部车辆</option>
              {lbAllVehicles.map(v => (
                <option key={v.ordinal} value={v.ordinal}>
                  #{v.ordinal} · {v.name} ({getVehicleClass(v.cls)} {v.PI || v.pi}PI)
                </option>
              ))}
            </select>
            {(lbSearchQuery || lbTrackFilter || lbTimeRange !== 'all' || lbVehicleFilter) && (
              <button onClick={() => { setLbSearchQuery(''); setLbTrackFilter(''); setLbTimeRange('all'); setLbVehicleFilter(''); }} style={btnSmallStyle}>
                清除筛选
              </button>
            )}
          </div>

          {lbLoading && <LoadingSpinner />}

          {!lbLoading && lbFiltered.length === 0 && (
            <EmptyState icon="🏁" title="暂无排行榜数据" description="完成比赛并保存记录后，此处将显示你的圈速排行榜。" />
          )}

          {!lbLoading && lbFiltered.map((entry, idx) => {
            const key = entry.trackId + '_' + entry.vehicleOrdinal;
            const isExpanded = lbExpandedKeys.has(key);
            // Round 7: 每项独立从缓存读取趋势数据和加载状态
            const cachedTrend = lbTrendCacheRef.current.get(key);
            const isTrendLoading = lbTrendLoadingSetRef.current.has(key);
            // Round 7 + 9: 每项独立的chartData，包含详细信息供tooltip使用
            const trendBestLap = cachedTrend?.bestLap || Infinity;
            const entryChartData = cachedTrend?.sessions ? cachedTrend.sessions.map((s, i) => ({
              index: i + 1,
              date: formatDate(s.savedAt).split(' ')[0],
              dateFull: formatDate(s.savedAt),
              bestLap: s.bestLap > 0 ? s.bestLap : null,
              lastLap: s.lastLap > 0 ? s.lastLap : null,
              delta: s.bestLap > 0 && trendBestLap > 0 ? s.bestLap - trendBestLap : null,
            })) : [];
            return (
              <div key={key} style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                marginBottom: 10,
                overflow: 'hidden',
              }}>
                {/* 主行 */}
                <div
                  onClick={() => toggleLbExpand(entry)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 100px 80px 60px',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 11,
                    borderBottom: '1px solid #21262d',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#58a6ff', fontSize: 12 }}>#{idx + 1}</div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#c9d1d9' }}>{entry.trackName}</div>
                    <div style={{ fontSize: 9, color: '#8b949e', marginTop: 1 }}>
                      #{entry.vehicleOrdinal} · {getVehicleClass(entry.vehicleClass)} {entry.vehiclePI} PI
                    </div>
                  </div>
                  {/* Round 3: 趋势箭头 + 最佳圈速 */}
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    {/* Round 3: 趋势箭头 */}
                    {entry.improvement > 0 && (
                      <span style={{ color: '#3fb950', fontSize: 12, fontWeight: 700 }}>&#9650;</span>
                    )}
                    {entry.improvement < 0 && (
                      <span style={{ color: '#f85149', fontSize: 12, fontWeight: 700 }}>&#9660;</span>
                    )}
                    {(!entry.improvement || entry.improvement === 0) && entry.sessionCount > 1 && (
                      <span style={{ color: '#8b949e', fontSize: 10 }}>=</span>
                    )}
                    <div style={{ fontFamily: 'monospace', fontWeight: 700,
                      color: entry.optimalLap && entry.bestLap > 0 && entry.bestLap <= entry.optimalLap ? '#d29922' : '#3fb950'
                    }}>
                      {lbFormatTime(entry.bestLap)}
                    </div>
                    {entry.optimalLap && entry.bestLap > 0 && entry.bestLap <= entry.optimalLap && (
                      <span style={{ fontSize: 8, color: '#d29922', fontWeight: 700 }} title="理论最佳">TL</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'monospace', color: '#8b949e' }}>{lbFormatTime(entry.avgBestLap)}</div>
                    <div style={{ fontSize: 9, color: '#484f58' }}>平均</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: '#8b949e' }}>{entry.sessionCount}次</div>
                    <div style={{ fontSize: 9, color: '#484f58' }}>{entry.totalLaps}圈</div>
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid #21262d',
                    padding: '10px 12px',
                    background: '#0d1117',
                  }}>
                    {isTrendLoading && <div style={{ textAlign: 'center', padding: 12, color: '#8b949e', fontSize: 11 }}>加载趋势...</div>}

                    {!isTrendLoading && cachedTrend && (
                      <div>
                        {/* Round 6: 单项刷新按钮 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                          <button
                            onClick={() => {
                              clearLbTrendCache(key);
                              loadLbTrend(entry.trackId, entry.vehicleOrdinal);
                            }}
                            style={{ ...btnSmallStyle, fontSize: 9, color: 'var(--text-secondary)' }}
                          >
                            刷新趋势
                          </button>
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                          gap: 6,
                          marginBottom: 10,
                        }}>
                          <LbStatCard label="最佳" value={lbFormatTime(cachedTrend.bestLap)} color="#3fb950" />
                          <LbStatCard label="平均" value={lbFormatTime(cachedTrend.avgBestLap)} color="#58a6ff" />
                          {/* Round 3: 理论最佳圈速金色高亮 */}
                          {cachedTrend.optimalLap > 0 && (
                            <LbStatCard label="理论最佳" value={lbFormatTime(cachedTrend.optimalLap)} color="#d29922" highlight />
                          )}
                          <LbStatCard label="总圈" value={cachedTrend.totalLaps} color="#fff" />
                          <LbStatCard label="次数" value={cachedTrend.sessionCount} color="#fff" />
                          {cachedTrend.improvement > 0 && (
                            <LbStatCard label="进步" value={'-' + cachedTrend.improvement.toFixed(2) + 's'} color="#3fb950" />
                          )}
                        </div>

                        {/* 理论最佳Sector详情 */}
                        {cachedTrend.optimalSectors && cachedTrend.optimalSectors.length > 0 && cachedTrend.bestLap > 0 && (
                          <div style={{ marginBottom: 10, padding: 8, background: 'rgba(210, 153, 34, 0.08)', border: '1px solid rgba(210, 153, 34, 0.25)', borderRadius: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: '#d29922' }}>
                              理论潜力: 可提升 {(cachedTrend.bestLap - cachedTrend.optimalLap).toFixed(2)}s
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {cachedTrend.optimalSectors.map(os => (
                                <div key={os.sectorIndex} style={{
                                  background: '#161b22',
                                  border: '1px solid #21262d',
                                  borderRadius: 4,
                                  padding: '4px 8px',
                                  fontSize: 9,
                                  minWidth: 70,
                                }}>
                                  <div style={{ color: '#8b949e', marginBottom: 1 }}>S{os.sectorIndex}</div>
                                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d29922' }}>
                                    {lbFormatTime(os.optimalTime)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 趋势图 */}
                        {entryChartData.length >= 2 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>圈速趋势</div>
                            <div style={{ width: '100%', height: 220 }}>
                              <ResponsiveContainer>
                                <LineChart data={entryChartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                                  <YAxis
                                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                    domain={['auto', 'auto']}
                                    tickFormatter={(v) => {
                                      const m = Math.floor(v / 60);
                                      const s = Math.floor(v % 60);
                                      return `${m}:${s.toString().padStart(2, '0')}`;
                                    }}
                                  />
                                  <Tooltip
                                    contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                                    formatter={(value, name, props) => {
                                      if (value == null) return ['-', name === 'bestLap' ? '最佳圈速' : '末圈圈速'];
                                      const label = name === 'bestLap' ? '最佳圈速' : '末圈圈速';
                                      const delta = props.payload.delta;
                                      let suffix = '';
                                      if (delta != null && delta > 0) suffix = ` (+${delta.toFixed(3)}s)`;
                                      else if (delta != null && delta === 0) suffix = ' (PB)';
                                      return [lbFormatTime(value) + suffix, label];
                                    }}
                                    labelFormatter={(label) => {
                                      const item = entryChartData[label - 1];
                                      return item ? `第 ${label} 次 · ${item.dateFull || item.date}` : `第 ${label} 次`;
                                    }}
                                  />
                                  <Line type="monotone" dataKey="bestLap" stroke="#3fb950" strokeWidth={2} dot={{ r: 3 }} name="最佳圈速" />
                                  <Line type="monotone" dataKey="lastLap" stroke="#58a6ff" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 4" name="末圈圈速" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* 调校方案效果 */}
                        {cachedTrend.tunesUsed && cachedTrend.tunesUsed.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>调校方案效果对比</div>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 80px 80px',
                              gap: 8,
                              fontSize: 11,
                              padding: '8px 0',
                              borderBottom: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                            }}>
                              <div>调校名称</div>
                              <div style={{ textAlign: 'right' }}>使用次数</div>
                              <div style={{ textAlign: 'right' }}>最佳圈速</div>
                            </div>
                            {cachedTrend.tunesUsed.map(t => (
                              <div key={t.tuneId} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 80px 80px',
                                gap: 8,
                                padding: '8px 0',
                                fontSize: 11,
                                borderBottom: '1px solid var(--border)',
                                alignItems: 'center',
                              }}>
                                <div>{t.name}</div>
                                <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{t.count}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>
                                  {lbFormatTime(t.bestLap)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 跨页跳转：查看比赛记录 */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              setMainTab('sessions');
                              setTrackFilter(entry.trackName);
                            }}
                            style={{ ...btnSmallStyle, background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff' }}
                          >
                            查看该赛道比赛记录
                          </button>
                          <button
                            onClick={() => onNavigate && onNavigate('tracks', { selectTrackId: entry.trackId })}
                            style={{ ...btnSmallStyle, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}
                          >
                            查看赛道详情
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>确认删除</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
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
  )
}

const btnSmallStyle = {
  padding: '3px 8px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
};

const sectionStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  border: '1px solid var(--border)'
};

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  color: 'var(--accent)',
  borderBottom: '1px solid var(--border)',
  paddingBottom: 8
};

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8
};

const statItemStyle = {
  background: 'var(--bg-primary)',
  padding: 10,
  borderRadius: 6,
  textAlign: 'center'
};

const statLabelStyle = {
  fontSize: 9,
  color: 'var(--text-secondary)',
  marginBottom: 4
};

const statValueStyle = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
  fontFamily: 'monospace'
};

const thStyle = {
  padding: '8px',
  textAlign: 'left',
  fontSize: 10,
  color: 'var(--text-secondary)'
};

const tdStyle = {
  padding: '8px',
  fontSize: 11
};

// 圈速排行榜辅助组件和样式
// Round 3: 增强辅助组件 - 支持highlight高亮
function LbStatCard({ label, value, color, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(210, 153, 34, 0.12)' : 'var(--bg-secondary)',
      border: highlight ? '1px solid rgba(210, 153, 34, 0.4)' : '1px solid var(--border)',
      borderRadius: 6,
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: highlight ? '#d29922' : 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}

// Round 5: 赛道轨迹缩略图
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
        // 缩略图加载失败，静默忽略
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

const lbBtnPrimaryStyle = {
  padding: '6px 14px',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 11,
};

const lbInputStyle = {
  padding: '6px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 11,
  marginBottom: 8,
};
// 交互式 Canvas 赛道图组件
function InteractiveTrackMap({ trackId, highlightedPoints = [], cursorPoint = null, width = 300, height = 300, showCoasting = false, coastingPoints = [] }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState([]);
  
  useEffect(() => {
    const fetchPositions = async () => {
      if (!trackId) return;
      try {
        const res = await fetch(`/api/tracks/${trackId}/thumbnail`);
        if (!res.ok) return;
        const data = await res.json();
        setPositions(data.positions || []);
      } catch (e) {
        console.error('Failed to load track map coordinates', e);
      }
    };
    fetchPositions();
  }, [trackId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || positions.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    positions.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    
    const pad = 20;
    const rX = Math.max(1, maxX - minX);
    const rZ = Math.max(1, maxZ - minZ);
    
    const scale = Math.min((w - pad * 2) / rX, (h - pad * 2) / rZ);
    const offsetX = (w - rX * scale) / 2;
    const offsetY = (h - rZ * scale) / 2;
    
    const toX = x => offsetX + (x - minX) * scale;
    const toY = z => h - offsetY - (z - minZ) * scale;
    
    ctx.clearRect(0, 0, w, h);
    
    // 1. 绘制灰色底线轨迹
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    positions.forEach((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
      else ctx.lineTo(toX(p.x), toY(p.z));
    });
    ctx.closePath();
    ctx.stroke();
    
    // 2. 绘制高亮蓝色走线
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    positions.forEach((p, i) => {
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
      else ctx.lineTo(toX(p.x), toY(p.z));
    });
    ctx.closePath();
    ctx.stroke();

    // 3. 绘制滑行高亮（Coasting）
    if (showCoasting && coastingPoints && coastingPoints.length > 0) {
      ctx.fillStyle = 'rgba(188, 140, 255, 0.4)';
      coastingPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.z), 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    // 4. 绘制弯道高亮与标签
    highlightedPoints.forEach((pt) => {
      if (!pt.x || !pt.z) return;
      const tx = toX(pt.x);
      const ty = toY(pt.z);
      
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(tx, ty, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = '#f85149';
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(pt.label || '', tx + 8, ty - 8);
    });
    
    // 5. 绘制当前联动游标点
    if (cursorPoint && cursorPoint.x && cursorPoint.z) {
      const cx = toX(cursorPoint.x);
      const cy = toY(cursorPoint.z);
      
      ctx.strokeStyle = 'rgba(210, 153, 34, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#d29922';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [positions, highlightedPoints, cursorPoint, showCoasting, coastingPoints]);
  
  return (
    <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}

// 弯道历史速度演进面板组件
function CornerEvolutionPanel({ turns }) {
  const [selectedTurnIdx, setSelectedTurnIdx] = useState(0);
  const turn = turns[selectedTurnIdx];
  
  const chartData = useMemo(() => {
    if (!turn || !turn.history) return [];
    return turn.history.map((h, i) => ({
      index: i + 1,
      date: new Date(h.savedAt).toLocaleDateString('zh-CN'),
      '入弯速度': h.entrySpeed,
      '弯心速度': h.apexSpeed,
      '出弯速度': h.exitSpeed,
      '推荐速度': turn.recommendedSpeed
    }));
  }, [turn]);
  
  if (!turn) return null;
  
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* 左侧：弯道列表 */}
      <div style={{ width: 280, maxHeight: 300, overflowY: 'auto', borderRight: '1px solid var(--border)', paddingRight: 12 }}>
        {turns.map((t, idx) => (
          <div
            key={t.index}
            onClick={() => setSelectedTurnIdx(idx)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: selectedTurnIdx === idx ? 'rgba(88,166,255,0.1)' : 'transparent',
              border: selectedTurnIdx === idx ? '1px solid #58a6ff' : '1px solid transparent',
              cursor: 'pointer',
              marginBottom: 4,
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>{t.name} ({t.direction === 'left' ? '左转' : '右转'})</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: '#21262d', color: 'var(--text-secondary)' }}>
                {t.turnCategory}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
              <span>弯心: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>{t.current?.apexSpeed || t.apexSpeed} km/h</span></span>
              <span>档位: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#58a6ff' }}>{t.current?.gear || t.gear || 0} 档</span></span>
            </div>
          </div>
        ))}
      </div>

      {/* 右侧：趋势分析折线图 */}
      <div style={{ flex: 1, height: 300 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>
            {turn.name} 弯道历史速度变化 (推荐速度: {turn.recommendedSpeed} km/h)
          </h4>
          <div style={{ display: 'flex', gap: 12, fontSize: 9 }}>
            <span style={{ color: '#58a6ff' }}>● 入弯速度</span>
            <span style={{ color: '#3fb950' }}>● 弯心速度</span>
            <span style={{ color: '#d29922' }}>● 出弯速度</span>
          </div>
        </div>

        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" stroke="#8b949e" style={{ fontSize: 9 }} />
              <YAxis stroke="#8b949e" unit="km/h" style={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                labelStyle={{ fontSize: 10, color: '#8b949e' }}
                itemStyle={{ fontSize: 10 }}
              />
              <Line type="monotone" dataKey="入弯速度" stroke="#58a6ff" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="弯心速度" stroke="#3fb950" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="出弯速度" stroke="#d29922" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <ReferenceLine y={turn.recommendedSpeed} stroke="#f85149" strokeDasharray="3 3" label={{ value: '推荐速度', fill: '#f85149', fontSize: 8, position: 'insideTopLeft' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '90%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: 11, background: '#0d1117', borderRadius: 8, border: '1px solid #21262d' }}>
            需要至少 2 个历史 Session 以展示进化曲线趋势 (当前: {chartData.length} 个)
          </div>
        )}
      </div>
    </div>
  );
}

// 轮胎底盘载荷面板组件 (2x2 布局与侧偏/滑移分析)
function TiresChassisPanel({ channels }) {
  const getAverage = (arr) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const getAverageAbs = (arr) => arr.length === 0 ? 0 : (arr.reduce((a, b) => a + Math.abs(b), 0) / arr.length).toFixed(3);
  
  const tempFL = getAverage(channels.map(c => c.tempFL));
  const tempFR = getAverage(channels.map(c => c.tempFR));
  const tempRL = getAverage(channels.map(c => c.tempRL));
  const tempRR = getAverage(channels.map(c => c.tempRR));
  
  const slipFL = getAverageAbs(channels.map(c => c.slipFL));
  const slipFR = getAverageAbs(channels.map(c => c.slipFR));
  const slipRL = getAverageAbs(channels.map(c => c.slipRL));
  const slipRR = getAverageAbs(channels.map(c => c.slipRR));

  const angleFL = getAverageAbs(channels.map(c => c.angleFL));
  const angleFR = getAverageAbs(channels.map(c => c.angleFR));
  const angleRL = getAverageAbs(channels.map(c => c.angleRL));
  const angleRR = getAverageAbs(channels.map(c => c.angleRR));

  const getTempColor = (t) => {
    if (t < 70) return 'rgba(88, 166, 255, 0.15)'; // 冷蓝色
    if (t < 90) return 'rgba(63, 185, 80, 0.15)'; // 最佳绿色
    if (t < 100) return 'rgba(210, 153, 34, 0.15)'; // 偏暖黄色
    return 'rgba(248, 81, 73, 0.2)'; // 过热红色
  };

  const getTempBorder = (t) => {
    if (t < 70) return '1px solid #58a6ff';
    if (t < 90) return '1px solid #3fb950';
    if (t < 100) return '1px solid #d29922';
    return '1px solid #f85149';
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* 2x2 Chassis Layout */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 12 }}>底盘温度载荷热力分布 (2x2)</h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: '120px 120px', gap: 24, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 12, border: '1px solid #21262d' }}>
          {/* FL */}
          <div style={{ background: getTempColor(tempFL), border: getTempBorder(tempFL), padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>前左 (FL)</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', margin: '4px 0' }}>{tempFL} ℃</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>打滑: {slipFL}</div>
          </div>
          
          {/* FR */}
          <div style={{ background: getTempColor(tempFR), border: getTempBorder(tempFR), padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>前右 (FR)</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', margin: '4px 0' }}>{tempFR} ℃</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>打滑: {slipFR}</div>
          </div>

          {/* RL */}
          <div style={{ background: getTempColor(tempRL), border: getTempBorder(tempRL), padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>后左 (RL)</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', margin: '4px 0' }}>{tempRL} ℃</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>打滑: {slipRL}</div>
          </div>

          {/* RR */}
          <div style={{ background: getTempColor(tempRR), border: getTempBorder(tempRR), padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>后右 (RR)</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', margin: '4px 0' }}>{tempRR} ℃</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>打滑: {slipRR}</div>
          </div>
        </div>
      </div>

      {/* Slip and Angle Metrics Panel */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: 16 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 12 }}>轮胎打滑与转向侧滑角分析</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>前轮转向侧偏角 (Avg Steering Slip Angle)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>左前 (FL): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{angleFL} rad</span></span>
                <span>右前 (FR): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{angleFR} rad</span></span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                若此值过大（如平均大于 0.08），说明前轮频繁出现超出抓地力边界的横向摩擦，表现为入弯推头（转向不足）。
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>后轮驱动打滑率 (Avg Rear Drive Slip)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>左后 (RL): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{slipRL}</span></span>
                <span>右后 (RR): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{slipRR}</span></span>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                若此值过大（如平均大于 0.15），说明出弯大油门时驱动轮存在高频打滑，浪费了牵引力并消耗轮胎寿命。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
