import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ScatterChart, Scatter } from 'recharts';
import { LapComparison } from '../dashboard/LapComparison';
import { ThrottleBrakeHeatmap } from '../dashboard/ThrottleBrakeHeatmap';
import { ReplayPlayer } from '../dashboard/ReplayPlayer';
import { SectorAnalysis } from '../dashboard/SectorAnalysis';
import { AICoachPanel } from '../dashboard/AICoachPanel';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { toast } from '../shared/Toast';

export function SessionHistoryPage({ onNavigate, navIntent }) {

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
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
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
    // 从其他模块跳转到圈速榜
    if (navIntent._subTab === 'leaderboard') {
      setTrackFilter('');
      setSelectedSession(null);
      if (navIntent.trackId && sessions.length > 0) {
        const matched = sessions.find(s => s.trackId === navIntent.trackId);
        if (matched) setTrackFilter(matched.trackName);
      }
    } else if (navIntent.trackId && !navIntent.trackName) {
      setSelectedSession(null);
      if (sessions.length > 0) {
        const matched = sessions.find(s => s.trackId === navIntent.trackId);
        if (matched) setTrackFilter(matched.trackName);
      }
    } else if (navIntent.trackName) {
      setTrackFilter(navIntent.trackName);
    }
    if (navIntent.tuneId) {
      setSessionSearchQuery(tunes[navIntent.tuneId]?.name || '');
    }
  }, [navIntent, tunes, sessions]);

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
        p.gLat != null ? p.gLat.toFixed(3) : '',
        p.gLong != null ? p.gLong.toFixed(3) : '',
        p.gVert != null ? p.gVert.toFixed(3) : '',
        p.lapNumber || p.lap || 0,
        p.isDrifting ? 1 : 0,
        p.isAbsActive ? 1 : 0,
        p.isTcActive ? 1 : 0,
        p.gLat != null ? p.gLat.toFixed(3) : '',
        p.gVert != null ? p.gVert.toFixed(3) : '',
        p.gLong != null ? p.gLong.toFixed(3) : ''
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

  // 计算当前 Session 在赛道历史学习曲线上的位置
  const sessionLearningData = useMemo(() => {
    if (!analysis?.trackId) return null;
    const trackSessions = [...sessions].filter(s => s.trackId === analysis.trackId).reverse();
    const data = trackSessions
      .filter(s => s.laps?.best > 0)
      .map((s, idx) => ({
        index: idx + 1,
        bestLap: s.laps.best,
        sessionId: s.id,
        isCurrent: s.id === selectedSession
      }));
    if (data.length === 0) return null;
    const best = Math.min(...data.map(d => d.bestLap));
    const current = data.find(d => d.sessionId === selectedSession)?.bestLap || 0;
    return { data, best, current };
  }, [sessions, analysis?.trackId, selectedSession]);

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
        ) : selectedSession && analysis ? (
          <div>
            {/* 面包屑导航 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setSelectedSession(null); setTrackFilter(''); }}>
                赛道成就墙
              </span>
              <span>&gt;</span>
              {trackFilter ? (
                <>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setSelectedSession(null)}>
                    {trackFilter} 轨迹概览
                  </span>
                  <span>&gt;</span>
                </>
              ) : null}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                单场遥测分析 ({selectedSession.substring(0, 8)})
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { id: 'overview', label: '总览 (诊断与弯角)' },
                { id: 'dynamics', label: '驾驶动力学 (摩擦圆)' },
                { id: 'tires', label: '轮荷载荷 (底盘)' },
                { id: 'shifts', label: '换挡扭矩 (路线图)' },
                { id: 'pedals', label: '踏板动力学 (滑行区)' },
                { id: 'overlay', label: '对标工作台 (多通道)' },
                { id: 'replay', label: '影子车回放 (HUD)' },
                { id: 'aiCoach', label: 'AI 驾驶教练 (智能诊断)' }
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

                {/* 赛道学习曲线位置 */}
                {sessionLearningData && sessionLearningData.data.length > 1 && (
                  <div style={{
                    ...sectionStyle,
                    marginBottom: 16
                  }}>
                    <h3 style={sectionTitleStyle}>本场在赛道成长轨迹中的位置</h3>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                      曲线向下代表圈速提升（越快越好）。橙色圆点=本场成绩。曲线持续下降说明你在进步；若出现平台期则可能遇到驾驶瓶颈，建议对比前后场的弯道数据找原因。
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'center' }}>
                      <div style={{ height: 100 }}>
                        <ResponsiveContainer width="100%" height={100}>
                          <LineChart data={sessionLearningData.data} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="index" tickFormatter={v => `第${v}次`} tick={{ fontSize: 8, fill: '#8b949e' }} />
                            <YAxis domain={['auto', 'auto']} tickFormatter={v => formatTime(v)} tick={{ fontSize: 8, fill: '#8b949e' }} width={55} reversed />
                            <Line
                              type="monotone" dataKey="bestLap"
                              stroke="#58a6ff" strokeWidth={1.5}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                if (payload.isCurrent) {
                                  return <circle cx={cx} cy={cy} r={6} fill="#ff9500" stroke="#fff" strokeWidth={2} />;
                                }
                                return <circle cx={cx} cy={cy} r={3} fill="#58a6ff" stroke="none" />;
                              }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>历史最好成绩：</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace', marginBottom: 6 }}>
                          {formatTime(sessionLearningData.best)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>本场成绩差距：</div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {sessionLearningData.current <= sessionLearningData.best ? (
                            <span style={{ color: '#d29922' }}>🎉 本场创下新纪录(PB)！</span>
                          ) : (
                            <span style={{ color: '#ff9500' }}>慢了 {(sessionLearningData.current - sessionLearningData.best).toFixed(3)} 秒</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 赛道地图与弯道性能诊断看板（双栏布局） */}
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, marginBottom: 16 }}>
                  {/* 左栏：Canvas 痛点与联动赛道图 */}
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>赛道诊断热力图</h3>
                    {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, fontStyle: 'italic' }}>
                        暂无弯道数据——请先在赛道管理中对该赛道完成建图。
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                        红色虚线=失分最多的3个弯道，黄色=当前选中弯道。点击右侧表格行可联动高亮。优先处理红色弯道。
                      </div>
                    )}
                    
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      width={320}
                      height={280}
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

                  {/* 右栏：赛道所有弯道性能看板 */}
                  <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={sectionTitleStyle}>弯道性能参数表</h3>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                      点击任意行可在左侧地图高亮该弯道。重点关注弯心速度（越高越好）和横向G（过低说明走线保守，不敢靠近极限）。
                    </div>
                    {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                        暂无弯道分析数据
                      </div>
                    ) : (
                      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 330 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', position: 'sticky', top: 0, background: '#161b22', zIndex: 1 }}>
                              <th style={{ padding: '8px 6px' }}>弯道</th>
                              <th style={{ padding: '8px 6px' }}>类型</th>
                              <th style={{ padding: '8px 6px' }}>入弯速度</th>
                              <th style={{ padding: '8px 6px' }}>弯心速度</th>
                              <th style={{ padding: '8px 6px' }}>出弯速度</th>
                              <th style={{ padding: '8px 6px' }}>档位</th>
                              <th style={{ padding: '8px 6px' }}>横向G</th>
                              <th style={{ padding: '8px 6px' }}>制动G</th>
                            </tr>
                          </thead>
                          <tbody>
                            {turnsData.turns.map((t, idx) => {
                              const apexSpeed = t.current?.apexSpeed ?? 0;
                              const peakLatG = t.current?.peakLatG ?? 0;
                              const longBrakeG = t.current?.longBrakeG ?? 0;
                              const gColor = peakLatG > 2.5 ? '#3fb950' : peakLatG > 1.5 ? '#d29922' : 'var(--text-secondary)';
                              const isSelected = activeTurnIdx === idx;
                              return (
                                <tr
                                  key={t.index ?? idx}
                                  onClick={() => setActiveTurnIdx(idx)}
                                  style={{
                                    borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
                                    background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                >
                                  <td style={{ padding: '8px 6px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'inherit' }}>{t.name}</td>
                                  <td style={{ padding: '8px 6px' }}>{t.direction === 'left' ? '左' : '右'}</td>
                                  <td style={{ padding: '8px 6px' }}>{t.current?.entrySpeed || 0}</td>
                                  <td style={{ padding: '8px 6px', fontWeight: 700, color: 'var(--accent)' }}>{apexSpeed}</td>
                                  <td style={{ padding: '8px 6px' }}>{t.current?.exitSpeed || 0}</td>
                                  <td style={{ padding: '8px 6px' }}>{t.current?.gear ?? '-'}</td>
                                  <td style={{ padding: '8px 6px', color: gColor }}>{peakLatG.toFixed(1)}</td>
                                  <td style={{ padding: '8px 6px' }}>{longBrakeG.toFixed(1)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* 弯道车速进化分析 (与看板表格及地图联动) */}
                {turnsData && turnsData.turns && turnsData.turns.length > 0 && (
                  <CornerEvolutionPanel turns={turnsData.turns} activeTurnIdx={activeTurnIdx} />
                )}
              </>
            )}

            {activeChart === 'dynamics' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>G-G 摩擦力圆</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    注：重合点越密集说明该极限状态保持越久；呈十字形分布通常意味着欠缺循迹刹车。
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
                  <div style={{ ...sectionStyle, height: 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis type="number" dataKey="gLat" name="横向G" domain={[-1.8, 1.8]} stroke="#8b949e" style={{ fontSize: 9 }} />
                        <YAxis type="number" dataKey="gLong" name="纵向G" domain={[-1.8, 1.8]} stroke="#8b949e" style={{ fontSize: 9 }} />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10 }}
                        />
                        <Scatter name="遥测G值" data={channelsData.channels || []} fill="rgba(88, 166, 255, 0.45)" shape="circle" />
                        <ReferenceLine x={0} stroke="#484f58" />
                        <ReferenceLine y={0} stroke="#484f58" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 6px', fontSize: 12 }}>极限诊断分析</h4>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                      这些是本圈内的峰值G力。横向G反映过弯极限压榨程度，制动G反映刹车力度。数值越高说明你在更充分地使用轮胎抓地力极限。
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11 }}>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>最大横向力：</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                          {Math.max(...(channelsData.channels || []).map(c => Math.abs(c.gLat || 0))).toFixed(2)} G
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>最大纵向制动：</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#f85149', fontFamily: 'monospace' }}>
                          {Math.max(...(channelsData.channels || []).map(c => c.gLong < 0 ? Math.abs(c.gLong) : 0)).toFixed(2)} G
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'tires' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>轮胎载荷与温度</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    四轮温度分布：内/中/外三区温度应接近均匀。外侧偏高说明走线过激或外倾角不足；内侧偏高说明内倾角过多。悬挂行程反映过弯侧倾强度，前轴压缩=入弯前移，后轴可用于识别甩尾风险。
                  </div>
                </div>
                <TiresChassisPanel channels={channelsData.channels || []} />
              </div>
            )}

            {activeChart === 'shifts' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>换挡分布与扭矩曲线</h3>
                </div>

                {/* 第一行：换挡点空间分布（全宽） */}
                <div style={{ ...sectionStyle, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>换挡点空间分布</h4>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                    绿色=升档，红色=降档。密集在直道末尾是正常的；如果红点大量出现在弯道区域，关注入弯换挡时机。
                  </div>
                  <InteractiveTrackMap
                    trackId={analysis.trackId}
                    width={700}
                    height={340}
                    highlightedPoints={
                      (() => {
                        const pts = [];
                        const points = channelsData.channels || [];
                        let lastDist = -999;
                        for (let i = 1; i < points.length; i++) {
                          const prev = points[i - 1];
                          const curr = points[i];
                          if (curr.gear !== prev.gear && curr.gear > 0 && prev.gear > 0) {
                            const dist = curr.distance || 0;
                            if (dist - lastDist < 50) continue; 
                            lastDist = dist;
                            pts.push({
                              x: curr.x,
                              z: curr.z,
                              label: `${prev.gear}→${curr.gear}`,
                              color: curr.gear > prev.gear ? '#3fb950' : '#f85149'
                            });
                          }
                        }
                        return pts;
                      })()
                    }
                  />
                </div>

                {/* 第二行：转速与扭矩曲线（全宽） */}
                <div style={sectionStyle}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>转速与扭矩曲线</h4>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                    蓝色=转速，橙色=扭矩。升档后转速骤降幅度越小，说明升档时机越准确。
                  </div>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={channelsData.channels || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" style={{ fontSize: 9 }} />
                        <YAxis yAxisId="left" orientation="left" domain={['auto', 'auto']} stroke="#58a6ff" label={{ value: 'RPM', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#58a6ff' } }} />
                        <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} stroke="#ff7b72" label={{ value: 'Nm', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#ff7b72' } }} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                          itemStyle={{ fontSize: 10 }}
                          formatter={(value, name) => [value, name === 'rpm' ? '转速 (RPM)' : '扭矩 (Nm)']}
                        />
                        <Line yAxisId="left" type="monotone" dataKey="rpm" stroke="#58a6ff" strokeWidth={1.5} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="torque" stroke="#ff7b72" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'pedals' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>踏板动力学与滑行分析</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                    绿色=油门，红色=刹车，X轴为行进距离。理想状态：刹车区间结束后油门立即衔接（无空档滑行）；入弯时刹车应有逐渐松开的渐变段（循迹刹车），而非突然松开。油门与刹车短暂重叠是正常的跟趾换挡或稳定技巧。
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
                  <div style={{ ...sectionStyle, height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={channelsData.channels || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" style={{ fontSize: 9 }} />
                        <YAxis stroke="#8b949e" domain={[0, 100]} style={{ fontSize: 9 }} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value, name) => [value.toFixed(1) + '%', name === 'throttle' ? '油门' : '刹车']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="throttle" stroke="#3fb950" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="brake" stroke="#f85149" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={sectionStyle}>
                    {(() => {
                      const list = channelsData.channels || [];
                      let coastingCount = 0;
                      list.forEach(c => { if ((c.throttle || 0) < 5 && (c.brake || 0) < 5 && (c.speed || 0) > 20) coastingCount++; });
                      const ratio = list.length > 0 ? Math.round((coastingCount / list.length) * 100) : 0;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11 }}>
                          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
                             <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>本圈滑行占比：</div>
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
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>多通道对标工作台</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    所有通道以行进距离为X轴对齐，鼠标悬停时所有图表同步联动。对比方式：找车速波谷（制动点），对照下方踏板图看刹车是否干净；再看方向盘转角图，判断弯中是否有多余修正。档位图可识别降档位置是否过晚。
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ ...sectionStyle, height: 160, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>车速曲线</span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>最高: {Math.max(...channelsData.channels.map(c => c.speed))} km/h</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={['auto', 'auto']} unit="km/h" />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value) => [value.toFixed(1) + ' km/h', '车速']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="speed" stroke="#58a6ff" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>踏板深度</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[0, 100]} unit="%" />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value, name) => [value.toFixed(1) + '%', name === 'throttle' ? '油门' : '刹车']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="throttle" stroke="#3fb950" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="brake" stroke="#f85149" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>方向盘转角</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[-127, 127]} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value) => [value, '方向盘转角']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="steer" stroke="#d29922" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>档位</span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" style={{ fontSize: 8 }} unit="m" />
                        <YAxis stroke="#8b949e" style={{ fontSize: 8 }} domain={[0, 8]} tickCount={9} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value) => [value + ' 档', '档位']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
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

            {activeChart === 'aiCoach' && (
              <AICoachPanel sessionId={selectedSession} />
            )}
          </div>
        ) : trackFilter ? (
          // 状态 2: 赛道成长轨迹看板
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 导航面包屑 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setTrackFilter(''); }}>
                  赛道成就墙
                </span>
                <span>&gt;</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {trackFilter} 轨迹概览
                </span>
              </div>
              <button onClick={() => setTrackFilter('')} style={{
                ...btnSmallStyle, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)'
              }}>
                返回成就墙
              </button>
            </div>

            {/* 看板主体 */}
            {(() => {
              const matchedSession = sessions.find(s => s.trackName === trackFilter);
              const trackId = matchedSession?.trackId;

              // 过滤出该赛道的所有比赛记录
              const matchedEntries = lbEntries.filter(e => e.trackName === trackFilter);
              const trackSessions = [...myFilteredSessions].reverse(); // 从老到新
              const learningData = trackSessions
                .filter(s => s.laps?.best > 0)
                .map((s, idx) => ({
                  index: idx + 1,
                  bestLap: s.laps.best,
                  date: s.savedAt ? new Date(s.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '',
                  car: s.vehicle?.name || `车辆 #${s.vehicle?.ordinal}`,
                  sessionId: s.id
                }));

              const minLap = learningData.length > 0 ? Math.min(...learningData.map(d => d.bestLap)) : 0;
              const maxLap = learningData.length > 0 ? Math.max(...learningData.map(d => d.bestLap)) : 0;
              const yDomain = learningData.length > 0 ? [Math.max(0, minLap - 2), maxLap + 2] : [0, 100];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 首部概览与缩略图 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {trackId ? <TrackThumbnail trackId={trackId} /> : <div style={{ width: 120, height: 80, background: 'rgba(255,255,255,0.02)' }} />}
                    <div>
                      <h2 style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 700 }}>{trackFilter}</h2>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>历史最快圈速</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                            {minLap > 0 ? lbFormatTime(minLap) : '-'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>总出赛次数</div>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                            {trackSessions.length} 次
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>总跑圈数</div>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                            {trackSessions.reduce((sum, s) => sum + (s.laps?.count || 0), 0)} 圈
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 学习曲线折线图 */}
                  {learningData.length > 1 ? (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>学习曲线 · 赛道圈速演进</div>
                      <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={learningData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="index" tickFormatter={v => `第${v}次`} tick={{ fontSize: 9, fill: '#8b949e' }} />
                            <YAxis domain={yDomain} tickFormatter={v => lbFormatTime(v)} tick={{ fontSize: 9, fill: '#8b949e' }} width={55} reversed />
                            <Tooltip
                              formatter={(v, name, props) => [
                                `${lbFormatTime(v)} (${props.payload.car})`,
                                '圈速'
                              ]}
                              labelFormatter={(label, payload) => {
                                const item = payload?.[0]?.payload;
                                return `第 ${label} 次出赛 · ${item?.date || ''}`;
                              }}
                              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 11 }}
                            />
                            <ReferenceLine y={minLap} stroke="#d29922" strokeDasharray="4 2" label={{ value: '最快', fill: '#d29922', fontSize: 9, position: 'right' }} />
                            <Line
                              type="monotone" dataKey="bestLap"
                              stroke="#3fb950" strokeWidth={2}
                              dot={{ r: 4, fill: '#3fb950', stroke: '#0d1117', strokeWidth: 1 }}
                              activeDot={{ r: 6 }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30, background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
                      需要至少 2 次比赛记录来绘制学习曲线趋势图
                    </div>
                  )}

                  {/* 出赛车辆排行列表 */}
                  {matchedEntries.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>该赛道出赛车辆与PB</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {matchedEntries.map(e => (
                          <div key={e.vehicleOrdinal} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)'
                          }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{e.vehicleName || `Car #${e.vehicleOrdinal}`}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                                #{e.vehicleOrdinal} · {getVehicleClass(e.vehicleClass)} {e.vehiclePI} PI
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                                {lbFormatTime(e.bestLap)}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>
                                {e.sessionCount}次出赛 · {e.totalLaps}圈
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          // 状态 1: 我的赛道成就墙 (首屏)
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>我的赛道成就墙</h2>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  共跑过 {lbEntries.length} 个赛道-车辆组合，点击卡片聚焦该赛道
                </div>
              </div>
              <button onClick={loadLeaderboard} style={{
                padding: '6px 12px', background: 'rgba(88,166,255,0.12)',
                border: '1px solid rgba(88,166,255,0.3)', borderRadius: 6,
                color: '#58a6ff', cursor: 'pointer', fontSize: 11
              }}>
                刷新成就
              </button>
            </div>

            {/* 卡片网格 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {(() => {
                const filteredAchievements = lbEntries.filter(entry => {
                  return !sessionSearchQuery.trim() || entry.trackName.toLowerCase().includes(sessionSearchQuery.toLowerCase());
                });

                if (filteredAchievements.length === 0) {
                  return <div style={{ gridColumn: '1/-1' }}><EmptyState icon="🏆" title="暂无成就卡片" description="在不同赛道跑圈并保存记录后将自动生成成就卡片" /></div>;
                }

                return filteredAchievements.map(entry => {
                  const improvementSec = entry.firstLap > 0 && entry.bestLap > 0 ? entry.firstLap - entry.bestLap : 0;
                  const badges = [];
                  if (entry.recentBreakthrough) badges.push({ icon: '🔥', label: '突破', color: '#ff9500' });
                  if (entry.daysSinceLastSession > 30) badges.push({ icon: '❄️', label: '冷落', color: '#58a6ff' });

                  return (
                    <div
                      key={entry.trackId + '_' + entry.vehicleOrdinal}
                      onClick={() => {
                        setTrackFilter(entry.trackName);
                      }}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div>
                        {/* 赛道名称与标签 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 170 }}>
                            {entry.trackName}
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {badges.map(b => (
                              <span key={b.label} style={{
                                fontSize: 8, padding: '1px 4px',
                                background: `${b.color}22`, border: `1px solid ${b.color}55`,
                                borderRadius: 8, color: b.color
                              }}>
                                {b.icon} {b.label}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* 车辆信息 */}
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          {entry.vehicleName || `Car #${entry.vehicleOrdinal}`} ({getVehicleClass(entry.vehicleClass)} {entry.vehiclePI} PI)
                        </div>

                        {/* 最佳圈速与微缩趋势线 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#3fb950', fontFamily: 'monospace' }}>
                              {lbFormatTime(entry.bestLap)}
                            </div>
                            {improvementSec > 0 && (
                              <div style={{ fontSize: 9, color: '#3fb950', marginTop: 2, fontWeight: 600 }}>
                                ▼ {improvementSec.toFixed(2)}s (超越首圈)
                              </div>
                            )}
                          </div>
                          {entry.recentBestLaps && entry.recentBestLaps.length > 1 && (
                            <div style={{ width: 80, height: 24 }}>
                              <ResponsiveContainer width="100%" height={24}>
                                <LineChart data={entry.recentBestLaps}>
                                  <Line
                                    type="monotone" dataKey="bestLap"
                                    stroke="#3fb950" strokeWidth={1}
                                    dot={false} isAnimationActive={false}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 底栏数据统计 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                        <span>出赛 {entry.sessionCount} 次</span>
                        <span>总跑 {entry.totalLaps} 圈</span>
                      </div>
                    </div>
                  );
                });
              })()}
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
        const res = await fetch(`/api/tracks/${trackId}`);
        if (!res.ok) return;
        const data = await res.json();
        // 与赛道管理保持一致：优先 points → centerline → trajectories[0] → positions
        const resolved = (data.points && data.points.length > 2) ? data.points
          : (data.centerline && data.centerline.length > 2) ? data.centerline
          : (data.trajectories && data.trajectories.length > 0 && data.trajectories[0].length > 2) ? data.trajectories[0]
          : (data.positions || []);
        setPositions(resolved);
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
    
    // 1. 绘制真实赛道边界与底线 (如果存在 width 数据)
    if (positions[0] && positions[0].widthLeft !== undefined) {
      ctx.fillStyle = '#30363d'; // 柏油路面深色
      ctx.beginPath();
      for (let i = 0; i < positions.length; i++) {
        const pt = positions[i];
        const yaw = pt.yaw || 0;
        const wl = pt.widthLeft || 2;
        const nx = -Math.cos(yaw);
        const nz = Math.sin(yaw);
        if (i === 0) ctx.moveTo(toX(pt.x + nx * wl), toY(pt.z + nz * wl));
        else ctx.lineTo(toX(pt.x + nx * wl), toY(pt.z + nz * wl));
      }
      for (let i = positions.length - 1; i >= 0; i--) {
        const pt = positions[i];
        const yaw = pt.yaw || 0;
        const wr = pt.widthRight || 2;
        const nx = Math.cos(yaw);
        const nz = -Math.sin(yaw);
        ctx.lineTo(toX(pt.x + nx * wr), toY(pt.z + nz * wr));
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 回退逻辑：仅画粗线
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
    }
    
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
      const color = pt.color || '#f85149';
      const isActive = pt.isActive;
      const isTopLoss = pt.isTopLoss;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      if (isActive || isTopLoss) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(tx, ty, isActive ? 24 : 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tx, ty, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = isActive ? 'bold 11px monospace' : '9px monospace';
      ctx.fillText(pt.label || '', tx + (isActive ? 10 : 8), ty - (isActive ? 10 : 8));
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
function CornerEvolutionPanel({ turns, activeTurnIdx }) {
  const turn = turns[activeTurnIdx];
  
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
    <div style={{ padding: 12, background: 'rgba(22, 27, 34, 0.4)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)' }}>
          {turn.name} 弯道历史速度变化趋势 (弯道类型: {turn.turnCategory || turn.type} | 推荐速度: {turn.recommendedSpeed} km/h)
        </h4>
        <div style={{ display: 'flex', gap: 12, fontSize: 9 }}>
          <span style={{ color: '#58a6ff' }}>● 入弯速度</span>
          <span style={{ color: '#3fb950' }}>● 弯心速度</span>
          <span style={{ color: '#d29922' }}>● 出弯速度</span>
          <span style={{ color: '#8b949e' }}>-- 推荐速度</span>
        </div>
      </div>

      {chartData.length >= 2 ? (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" stroke="#8b949e" style={{ fontSize: 9 }} />
              <YAxis stroke="#8b949e" unit="km/h" style={{ fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
                itemStyle={{ fontSize: 10 }}
              />
              <Line type="monotone" dataKey="入弯速度" stroke="#58a6ff" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="弯心速度" stroke="#3fb950" strokeWidth={2.5} dot={{ r: 5 }} />
              <Line type="monotone" dataKey="出弯速度" stroke="#d29922" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="推荐速度" stroke="#8b949e" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 11, background: '#0d1117', border: '1px solid #21262d', borderRadius: 6 }}>
          暂无足够历史对标场次数据（需要在同赛道有至少 2 次同款车记录）以绘制演进趋势。
        </div>
      )}
    </div>
  );
}

// 轮胎底盘载荷面板组件 (2x2 布局与侧偏/滑移分析)
function TiresChassisPanel({ channels }) {
  const getAverage = (arr) => arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const getAverageAbs = (arr) => arr.length === 0 ? 0 : (arr.reduce((a, b) => a + Math.abs(b), 0) / arr.length).toFixed(3);
  
  const formatTemp = (f) => f === 0 ? 0 : Math.round((f - 32) * 5 / 9);
  const tempFL = formatTemp(getAverage(channels.map(c => c.tempFL)));
  const tempFR = formatTemp(getAverage(channels.map(c => c.tempFR)));
  const tempRL = formatTemp(getAverage(channels.map(c => c.tempRL)));
  const tempRR = formatTemp(getAverage(channels.map(c => c.tempRR)));
  
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
