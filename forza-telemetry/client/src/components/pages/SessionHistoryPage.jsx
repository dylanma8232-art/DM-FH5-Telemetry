import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';
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
  const allSubTabs = ['overview', 'style', 'tires', 'sectors', 'shifts', 'braking', 'accel', 'comparison', 'replay', 'heatmap'];

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
                    style={{ fontWeight: 600, fontSize: 11, cursor: 'pointer', color: '#58a6ff' }}
                    onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate('tracks', { selectTrackId: session.trackId }); }}
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
                  <button onClick={(e) => { e.stopPropagation(); exportCSV(session.id); }} style={btnSmallStyle}>CSV</button>
                  {/* Round 6: 增强版CSV */}
                  <button onClick={(e) => { e.stopPropagation(); exportEnhancedCSV(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.3)' }}>增强CSV</button>
                  {/* Round 6: PDF报告 */}
                  <button onClick={(e) => { e.stopPropagation(); exportPDFReport(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(188,140,255,0.1)', color: '#bc8cff', borderColor: 'rgba(188,140,255,0.3)' }}>PDF报告</button>
                  <button onClick={(e) => { e.stopPropagation(); exportReport(session.id); }} style={btnSmallStyle}>报告</button>
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
                { id: 'overview', label: '总览' },
                { id: 'style', label: '风格' },
                { id: 'tires', label: '轮胎', loadType: 'tires' },
                { id: 'sectors', label: '分段' },
                { id: 'shifts', label: '换挡', loadType: 'shifts' },
                { id: 'braking', label: '制动', loadType: 'braking' },
                { id: 'accel', label: '加速', loadType: 'accel' },
                { id: 'comparison', label: '对比' },
                { id: 'replay', label: '回放' },
                { id: 'heatmap', label: '热力图' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveChart(tab.id);
                    if (tab.loadType) {
                      loadDetailData(tab.loadType);
                    }
                    // Round 2: 回放/热力图需要完整session detail，延迟加载
                    if ((tab.id === 'replay' || tab.id === 'heatmap') && selectedSession && !detailLoaded) {
                      loadSessionDetail(selectedSession);
                    }
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
                {/* 驾驶综合评分（V5） */}
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
                    {/* Round 1: 增强维度卡片 - 显示子指标 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                      {Object.entries(analysis.驾驶评分.维度 || {}).map(([name, dim]) => {
                        const ratio = dim.分数 / dim.满分;
                        const color = ratio >= 0.8 ? 'var(--success)' : ratio >= 0.6 ? 'var(--warning)' : 'var(--danger)';
                        // 子指标映射
                        const subMetrics = {
                          '圈速': dim.最佳圈 != null ? [
                            { label: '最佳圈', value: dim.最佳圈 > 0 ? formatTime(dim.最佳圈) : '-', color: 'var(--warning)' },
                            { label: '平均圈', value: dim.平均圈 > 0 ? formatTime(dim.平均圈) : '-', color: 'var(--text-secondary)' },
                          ] : [],
                          '刹车': dim.重刹占比 != null ? [
                            { label: '重刹占比', value: dim.重刹占比 + '%', color: 'var(--text-secondary)' },
                          ] : [],
                          '油门': dim.弯中给油比 != null ? [
                            { label: '弯中给油', value: dim.弯中给油比 + '%', color: 'var(--text-secondary)' },
                          ] : [],
                          '走线': dim.良好比例 != null ? [
                            { label: '良好比例', value: dim.良好比例 + '%', color: 'var(--text-secondary)' },
                          ] : [],
                          '一致性': dim.圈数 != null ? [
                            { label: '统计圈数', value: dim.圈数 + '圈', color: 'var(--text-secondary)' },
                          ] : [],
                        };
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
                            {/* 子指标 */}
                            {(subMetrics[name] || []).length > 0 && (
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {subMetrics[name].map((m, i) => (
                                  <div key={i} style={{ fontSize: 9, display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{m.label}</span>
                                    <span style={{ color: m.color, fontFamily: 'monospace', fontWeight: 600 }}>{m.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 最需改进醒目提示框 - Round 1: 从5维度中找得分最低的3个 */}
                    {worst3.length > 0 ? (
                        <div style={{
                          background: 'rgba(248, 81, 73, 0.1)',
                          borderRadius: 8,
                          padding: 14,
                          border: '2px solid var(--danger)',
                          marginBottom: 12
                        }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--danger)', marginBottom: 10, letterSpacing: 1 }}>
                            最需改进 (Top 3)
                          </div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {worst3.map(item => {
                              const pct = Math.round(item.ratio * 100);
                              const barColor = item.ratio >= 0.8 ? 'var(--success)' : item.ratio >= 0.6 ? 'var(--warning)' : 'var(--danger)';
                              return (
                                <div key={item.name} style={{ flex: 1, minWidth: 140, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 10 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{item.name}</div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                                    <span style={{ fontSize: 24, fontWeight: 900, color: barColor, fontFamily: 'monospace' }}>{item.分数}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {item.满分} ({pct}%)</span>
                                  </div>
                                  <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                      : null}

                    {/* 调校-遥测智能诊断 */}
                    {diagnosis && (
                      <div style={{
                        ...sectionStyle,
                        ...getDiagnosisStyle(diagnosis),
                        marginBottom: 16
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <h3 style={{ ...sectionTitleStyle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                            调校诊断
                            {diagnosis.tuneName && (
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>
                                ({diagnosis.tuneName})
                              </span>
                            )}
                          </h3>
                          {diagnosis.tuneId && diagnosis.diagnoses?.length > 0 && (
                            <div style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: 'var(--danger)', color: '#fff'
                            }}>
                              {diagnosis.diagnoses.length} 项问题
                            </div>
                          )}
                          {diagnosis.tuneId && (!diagnosis.diagnoses || diagnosis.diagnoses.length === 0) && (
                            <div style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: 'var(--success)', color: '#000'
                            }}>
                              正常
                            </div>
                          )}
                        </div>

                        {!diagnosis.tuneId && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                            未关联调校方案，无法诊断
                          </div>
                        )}

                        {diagnosis.tuneId && (!diagnosis.diagnoses || diagnosis.diagnoses.length === 0) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '8px 0' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
                            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>调校状态良好</span>
                          </div>
                        )}

                        {diagnosis.tuneId && diagnosis.diagnoses?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {diagnosis.diagnoses.map((item, idx) => {
                              const severityColor = item.严重程度 === 'high' ? 'var(--danger)' : item.严重程度 === 'medium' ? 'var(--warning)' : 'var(--accent)';
                              const severityBg = item.严重程度 === 'high' ? 'rgba(248, 81, 73, 0.08)' : item.严重程度 === 'medium' ? 'rgba(210, 153, 34, 0.08)' : 'rgba(88, 166, 255, 0.08)';
                              const categoryColorMap = {
                                '轮胎': '#f85149',
                                '悬挂': '#d29922',
                                '传动': '#58a6ff',
                                '空气动力学': '#bc8cff'
                              };
                              const categoryColor = categoryColorMap[item.类别] || 'var(--text-secondary)';

                              return (
                                <div key={idx} style={{
                                  background: severityBg,
                                  border: `1px solid ${severityColor}`,
                                  borderRadius: 6,
                                  padding: 12
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                      background: categoryColor + '22',
                                      color: categoryColor,
                                      border: `1px solid ${categoryColor}44`
                                    }}>
                                      {item.类别}
                                    </span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                      background: severityColor + '22',
                                      color: severityColor,
                                      border: `1px solid ${severityColor}44`
                                    }}>
                                      {item.严重程度 === 'high' ? '严重' : item.严重程度 === 'medium' ? '中等' : '轻微'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                    {item.问题}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                                    数据: {item.数据}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--accent)', lineHeight: 1.5 }}>
                                    建议: {item.建议}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {analysis.驾驶评分.建议 && analysis.驾驶评分.建议.length > 0 && (
                      <div style={{
                        background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 10,
                        borderLeft: '3px solid var(--accent)'
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>改进建议</div>
                        {analysis.驾驶评分.建议.map((tip, idx) => (
                          <div key={idx} style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.5 }}>
                            • {tip}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Round 2: 圈速趋势图 */}
                {lapTrendData && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>圈速趋势</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={lapTrendData.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="lap" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                        <Tooltip
                          formatter={(val) => [val.toFixed(3) + 's', '圈速']}
                          contentStyle={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 11
                          }}
                        />
                        <ReferenceLine
                          y={lapTrendData.bestTime}
                          stroke="var(--success)"
                          strokeDasharray="6 4"
                          strokeWidth={1.5}
                          label={{ value: '最佳 ' + lapTrendData.bestTime.toFixed(3) + 's', fontSize: 9, fill: 'var(--success)', position: 'right' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="time"
                          stroke="var(--accent)"
                          strokeWidth={2}
                          dot={(props) => {
                            const { cx, cy, payload, index } = props;
                            const isBest = payload.time === lapTrendData.bestTime;
                            const isWorst = payload.time === Math.max(...lapTrendData.data.map(d => d.time));
                            if (isBest) return <circle key={index} cx={cx} cy={cy} r={5} fill="var(--warning)" stroke="#fff" strokeWidth={1} />;
                            if (isWorst) return <circle key={index} cx={cx} cy={cy} r={5} fill="var(--danger)" stroke="#fff" strokeWidth={1} />;
                            return <circle key={index} cx={cx} cy={cy} r={3} fill="var(--accent)" />;
                          }}
                          activeDot={{ r: 5 }}
                          name="圈速"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    {/* Round 2: 关键事件标注 */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block' }} /> 最快圈
                      </span>
                      <span style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} /> 最慢圈
                      </span>
                      <span style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 12, height: 3, background: 'var(--success)', display: 'inline-block', borderRadius: 1 }} /> 最佳参考线
                      </span>
                    </div>
                  </div>
                )}

                {/* Round 2: 档位使用分布 */}
                {shiftAnalysis?.档位使用 && Object.keys(shiftAnalysis.档位使用).length > 0 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>档位使用分布</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(shiftAnalysis.档位使用)
                        .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
                        .map(([gear, pct]) => (
                        <div key={gear} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, width: 30, textAlign: 'right', color: 'var(--accent)', fontFamily: 'monospace' }}>
                            {gear}
                          </div>
                          <div style={{
                            flex: 1, height: 20, background: 'var(--bg-primary)',
                            borderRadius: 4, overflow: 'hidden', position: 'relative'
                          }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0,
                              width: pct + '%',
                              background: parseFloat(pct) > 20 ? 'var(--accent)' : 'var(--success)',
                              borderRadius: 4,
                              transition: 'width 0.3s ease'
                            }} />
                            <div style={{
                              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                              fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                              color: 'var(--text-primary)'
                            }}>
                              {pct}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Round 2: 改进优先级面板 */}
                {worst3.length > 0 && (
                  <div style={{
                    ...sectionStyle,
                    border: '1px solid var(--warning)',
                    background: 'rgba(210, 153, 34, 0.05)'
                  }}>
                    <h3 style={{ ...sectionTitleStyle, borderBottomColor: 'var(--warning)', color: 'var(--warning)' }}>改进优先级</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {worst3.map((item, idx) => {
                        const priorityLabel = idx === 0 ? '最需改进' : idx === 1 ? '次要改进' : '建议关注';
                        const priorityColor = idx === 0 ? 'var(--danger)' : idx === 1 ? 'var(--warning)' : 'var(--accent)';
                        return (
                          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                            <div style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: priorityColor + '22', color: priorityColor,
                              border: '1px solid ' + priorityColor + '44', minWidth: 70, textAlign: 'center'
                            }}>
                              {priorityLabel}
                            </div>
                            <div style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{item.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: priorityColor }}>{item.分数}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/ {item.满分}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({Math.round(item.ratio * 100)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>成绩统计</h3>
                  {(sessionDetail?.tuneId || analysis?.tuneName) && (
                    <div
                    style={{
                      fontSize: 11,
                      padding: '6px 10px',
                      background: 'rgba(0,120,255,0.08)',
                      borderRadius: 6,
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      marginBottom: 12,
                      fontWeight: 600,
                      display: 'inline-block',
                      cursor: 'pointer'
                    }}
                    onClick={() => onNavigate && onNavigate('tunes', { tuneId: sessionDetail?.tuneId })}
                  >
                    使用调校: {analysis?.tuneName || tunes[sessionDetail?.tuneId]?.name || '未知调校'} ↗
                  </div>
                  )}
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最快圈速</div>
                      <div style={{ ...statValueStyle, color: 'var(--warning)' }}>
                        {formatTime(analysis.成绩?.最快圈速)}
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>上一圈速</div>
                      <div style={statValueStyle}>{formatTime(analysis.成绩?.上一圈速)}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>圈数</div>
                      <div style={statValueStyle}>{analysis.成绩?.圈数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最高速度</div>
                      <div style={statValueStyle}>{analysis.详细统计?.最高速度 || 0} km/h</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均速度</div>
                      <div style={statValueStyle}>{analysis.详细统计?.平均速度 || 0} km/h</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最大马力</div>
                      <div style={statValueStyle}>{analysis.详细统计?.最大马力 || 0} HP</div>
                    </div>
                  </div>
                </div>

                {/* 调校参数详情 */}
                {(sessionDetail?.tuneId || analysis?.tuneId) && tunes[(sessionDetail?.tuneId || analysis?.tuneId)] && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>调校参数</h3>
                    {(() => {
                      const tune = tunes[sessionDetail?.tuneId || analysis?.tuneId];
                      return (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>
                            {tune.name}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {/* 轮胎 */}
                            {tune.tires && (
                              <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>轮胎</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前胎压:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.tires.frontPressure}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后胎压:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.tires.rearPressure}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前外倾:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.tires.frontCamber}°</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后外倾:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.tires.rearCamber}°</span></div>
                                </div>
                              </div>
                            )}
                            {/* 悬挂 */}
                            {tune.suspension && (
                              <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>悬挂</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前弹簧:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.frontSpring}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后弹簧:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.rearSpring}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前阻尼:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.frontDamping}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后阻尼:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.rearDamping}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前防倾:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.frontARB}</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后防倾:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.suspension.rearARB}</span></div>
                                </div>
                              </div>
                            )}
                            {/* 传动 */}
                            {tune.drivetrain && (
                              <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>传动</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                                  <div><span style={{ color: 'var(--text-muted)' }}>差速加速:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.drivetrain.diffAccel}%</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>差速减速:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.drivetrain.diffDecel}%</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>中央差速:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.drivetrain.diffCenter}%</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>终传比:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.drivetrain.finalDrive}</span></div>
                                </div>
                              </div>
                            )}
                            {/* 空气动力学 */}
                            {tune.aero && (
                              <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: 10, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>空气动力学</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                                  <div><span style={{ color: 'var(--text-muted)' }}>前下压力:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.aero.frontDownforce}kg</span></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>后下压力:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{tune.aero.rearDownforce}kg</span></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 制动 & 加速效率摘要 */}
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>制动 & 加速效率</h3>
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>制动事件数</div>
                      <div style={statValueStyle}>{analysis.制动分析?.制动事件数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>制动效率</div>
                      <div style={{
                        ...statValueStyle,
                        color: (analysis.制动分析?.制动效率 || 0) >= 70 ? 'var(--success)' :
                               (analysis.制动分析?.制动效率 || 0) >= 50 ? 'var(--warning)' : 'var(--danger)'
                      }}>
                        {analysis.制动分析?.制动效率 || 0}%
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最大制动力</div>
                      <div style={{ ...statValueStyle, color: 'var(--accent)' }}>
                        {analysis.制动分析?.最大制动G || 0}G
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>加速事件数</div>
                      <div style={statValueStyle}>{analysis.加速分析?.加速事件数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>牵引力利用率</div>
                      <div style={{
                        ...statValueStyle,
                        color: (analysis.加速分析?.牵引力利用率 || 0) >= 70 ? 'var(--success)' :
                               (analysis.加速分析?.牵引力利用率 || 0) >= 50 ? 'var(--warning)' : 'var(--danger)'
                      }}>
                        {analysis.加速分析?.牵引力利用率 || 0}%
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>换挡次数</div>
                      <div style={statValueStyle}>{analysis.换挡分析?.换挡事件数 || 0}</div>
                    </div>
                  </div>
                </div>

                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>走线分析</h3>
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>评分</div>
                      <div style={{ ...statValueStyle, color: analysis.走线分析?.评分 >= 70 ? 'var(--success)' : 'var(--warning)' }}>
                        {analysis.走线分析?.评分 || 0}%
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>良好</div>
                      <div style={statValueStyle}>{analysis.走线分析?.良好比例 || 0}%</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>偏差</div>
                      <div style={{ ...statValueStyle, color: 'var(--warning)' }}>{analysis.走线分析?.偏差比例 || 0}%</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>严重偏离</div>
                      <div style={{ ...statValueStyle, color: 'var(--danger)' }}>{analysis.走线分析?.严重偏离 || 0}%</div>
                    </div>
                  </div>
                  {/* Round 8: 走线分析增强提示 */}
                  {(analysis.走线分析?.偏差比例 > 15 || analysis.走线分析?.严重偏离 > 5) && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.25)', borderRadius: 6, fontSize: 11, lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, color: '#d29922', marginBottom: 4 }}>走线改进建议</div>
                      {analysis.走线分析?.偏差比例 > 15 && <div style={{ color: 'var(--text-secondary)' }}>- 偏差比例较高({analysis.走线分析.偏差比例}%)，尝试在弯心保持更贴近理想走线</div>}
                      {analysis.走线分析?.严重偏离 > 5 && <div style={{ color: 'var(--text-secondary)' }}>- 严重偏离({analysis.走线分析.严重偏离}%)，注意刹车点选择，避免入弯速度过高导致冲出赛道</div>}
                      {analysis.走线分析?.评分 < 60 && <div style={{ color: 'var(--danger)' }}>- 综合走线评分偏低，建议回顾回放中的走线轨迹，重点练习弯道入口和出口</div>}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeChart === 'tires' && tireAnalysis && (
              <div>
                {/* 轮胎关键指标 */}
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>轮胎分析</h3>
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均温度</div>
                      <div style={statValueStyle}>{tireAnalysis.温度分布?.平均温度 || 0}°F</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最高温差</div>
                      <div style={{
                        ...statValueStyle,
                        color: (tireAnalysis.温度分布?.最高温差 || 0) > 15 ? 'var(--danger)' :
                               (tireAnalysis.温度分布?.最高温差 || 0) > 8 ? 'var(--warning)' : 'var(--success)'
                      }}>
                        {tireAnalysis.温度分布?.最高温差 || 0}°F
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>打滑时间</div>
                      <div style={{
                        ...statValueStyle,
                        color: (tireAnalysis.打滑统计?.打滑时间比例 || 0) > 20 ? 'var(--danger)' :
                               (tireAnalysis.打滑统计?.打滑时间比例 || 0) > 10 ? 'var(--warning)' : 'var(--success)'
                      }}>
                        {tireAnalysis.打滑统计?.打滑时间比例 || 0}%
                      </div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最大打滑</div>
                      <div style={{ ...statValueStyle, color: 'var(--danger)' }}>
                        {tireAnalysis.打滑统计?.最大打滑 || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 温度 + 打滑图表 */}
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>温度分布 & 打滑值</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>温度分布 (°F)</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={tireData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="temp" fill="var(--accent)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>打滑值</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={tireData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="slip" fill="var(--warning)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* 各轮侧偏角分析 */}
                {tireAnalysis.侧偏角分析 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>侧偏角分析（°）</h3>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                      {Object.entries(tireAnalysis.侧偏角分析).map(([wheel, val]) => (
                        <div key={wheel} style={{
                          background: 'var(--bg-primary)',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)'
                        }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{wheel}: </span>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: parseFloat(val) > 5 ? 'var(--warning)' : 'var(--success)' }}>
                            {val}°
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeChart === 'style' && (
              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>驾驶风格</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={styleData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="value" fill="var(--success)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, lineHeight: 2 }}>
                      <div>油门控制: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{analysis.驾驶风格?.油门控制 || 0}%</span></div>
                      <div>刹车控制: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{analysis.驾驶风格?.刹车控制 || 0}%</span></div>
                      <div>转向平顺性: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{analysis.驾驶风格?.转向平顺性 || 0}%</span></div>
                      <div>最大纵向G: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{analysis.驾驶风格?.G力分布?.最大纵向 || 0}G</span></div>
                      <div>最大横向G: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{analysis.驾驶风格?.G力分布?.最大横向 || 0}G</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'sectors' && sectorData.length > 0 && (
              <div style={sectionStyle}>
                <h3 style={sectionTitleStyle}>赛道分段</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={sectorData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="speed" name="平均速度" fill="var(--accent)" />
                    <Bar dataKey="maxSpeed" name="最高速度" fill="var(--warning)" />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={thStyle}>段落</th>
                        <th style={thStyle}>平均速度</th>
                        <th style={thStyle}>最高速度</th>
                        <th style={thStyle}>走线评分</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectorData.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={tdStyle}>{s.name}</td>
                          <td style={tdStyle}>{s.speed} km/h</td>
                          <td style={tdStyle}>{s.maxSpeed} km/h</td>
                          <td style={{ ...tdStyle, color: s.score >= 70 ? 'var(--success)' : 'var(--warning)' }}>{s.score}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeChart === 'shifts' && shiftAnalysis && (
              <div>
                {/* 换挡分析总览 */}
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>换挡分析</h3>
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>换挡总数</div>
                      <div style={{ ...statValueStyle, color: 'var(--accent)' }}>{shiftAnalysis.换挡总数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均换挡转速</div>
                      <div style={{ ...statValueStyle, color: 'var(--warning)' }}>{shiftAnalysis.平均换挡转速 || 0} RPM</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>转速利用率</div>
                      <div style={{
                        ...statValueStyle,
                        color: (shiftAnalysis.平均转速利用率 || 0) >= 60 ? 'var(--success)' :
                               (shiftAnalysis.平均转速利用率 || 0) >= 40 ? 'var(--warning)' : 'var(--danger)'
                      }}>
                        {shiftAnalysis.平均转速利用率 || 0}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* 档位使用分布 */}
                {shiftAnalysis.档位使用 && Object.keys(shiftAnalysis.档位使用).length > 0 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>档位使用分布</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(shiftAnalysis.档位使用).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([gear, pct]) => (
                        <div key={gear} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, width: 30, textAlign: 'right', color: 'var(--accent)', fontFamily: 'monospace' }}>
                            {gear}
                          </div>
                          <div style={{
                            flex: 1, height: 20, background: 'var(--bg-primary)',
                            borderRadius: 4, overflow: 'hidden', position: 'relative'
                          }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, bottom: 0,
                              width: pct + '%',
                              background: `linear-gradient(90deg, var(--accent) 0%, var(--success) 100%)`,
                              borderRadius: 4,
                              transition: 'width 0.3s ease'
                            }} />
                            <div style={{
                              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                              fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                              color: 'var(--text-primary)'
                            }}>
                              {pct}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 最近换挡事件 */}
                {shiftAnalysis.换挡事件 && shiftAnalysis.换挡事件.length > 0 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>换挡记录 (最近30次)</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={thStyle}>操作</th>
                          <th style={thStyle}>转速</th>
                          <th style={thStyle}>转速%</th>
                          <th style={thStyle}>速度</th>
                          <th style={thStyle}>评价</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftAnalysis.换挡事件.map((evt, i) => {
                          const rpmPct = evt.转速百分比 || 0;
                          const isUp = evt.到档位 > evt.从档位;
                          const evaluation = rpmPct >= 80 && rpmPct <= 98 ? '良好' :
                                            rpmPct >= 60 ? '偏早' : rpmPct > 98 ? '偏晚' : '过早';
                          const evalColor = evaluation === '良好' ? 'var(--success)' :
                                            evaluation === '偏早' || evaluation === '过早' ? 'var(--warning)' : 'var(--danger)';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ ...tdStyle, fontWeight: 700, color: isUp ? 'var(--success)' : 'var(--warning)' }}>
                                {evt.从档位}→{evt.到档位}
                              </td>
                              <td style={tdStyle}>{evt.换挡转速} RPM</td>
                              <td style={{ ...tdStyle, color: evalColor, fontWeight: 600 }}>{rpmPct}%</td>
                              <td style={tdStyle}>{evt.速度} km/h</td>
                              <td style={{ ...tdStyle, color: evalColor, fontWeight: 700 }}>{evaluation}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeChart === 'braking' && brakeAnalysis && (
              <div>
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>制动分析</h3>
                  {/* Round 8: 制动分析增强 - 晚刹车/早刹车检测 */}
                  {brakeAnalysis.刹车事件 && brakeAnalysis.刹车事件.length > 0 && (() => {
                    const lateBrake = brakeAnalysis.刹车事件.filter(e => (e.起始速度 || 0) > 200 && (e.速度损失 || 0) > 100);
                    const earlyBrake = brakeAnalysis.刹车事件.filter(e => (e.起始速度 || 0) < 100 && (e.速度损失 || 0) < 30);
                    return (lateBrake.length > 0 || earlyBrake.length > 0) ? (
                      <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>制动模式检测</div>
                        {lateBrake.length > 2 && <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>- 检测到 {lateBrake.length} 次高速重刹(速度损失&gt;100km/h)，可能存在刹车点过晚的问题</div>}
                        {earlyBrake.length > 3 && <div style={{ color: 'var(--text-secondary)' }}>- 检测到 {earlyBrake.length} 次低速轻刹(速度损失&lt;30km/h)，可能存在刹车过早的问题</div>}
                      </div>
                    ) : null;
                  })()}
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>刹车事件数</div>
                      <div style={{ ...statValueStyle, color: 'var(--accent)' }}>{brakeAnalysis.刹车事件总数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均刹车力度</div>
                      <div style={{ ...statValueStyle, color: 'var(--warning)' }}>{brakeAnalysis.平均刹车力度 || 0}%</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均刹车G力</div>
                      <div style={{ ...statValueStyle, color: 'var(--accent)' }}>{brakeAnalysis.平均刹车G力 || 0}G</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>制动效率</div>
                      <div style={{
                        ...statValueStyle,
                        color: (brakeAnalysis.刹车效率 || 0) >= 70 ? 'var(--success)' :
                               (brakeAnalysis.刹车效率 || 0) >= 50 ? 'var(--warning)' : 'var(--danger)'
                      }}>
                        {brakeAnalysis.刹车效率 || 0}%
                      </div>
                    </div>
                  </div>
                </div>

                {brakeAnalysis.刹车事件 && brakeAnalysis.刹车事件.length > 0 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>刹车事件记录</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={thStyle}>起始速度</th>
                          <th style={thStyle}>结束速度</th>
                          <th style={thStyle}>速度损失</th>
                          <th style={thStyle}>持续时间(ms)</th>
                          <th style={thStyle}>强度评价</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brakeAnalysis.刹车事件.map((evt, i) => {
                          const loss = evt.速度损失 || 0;
                          const duration = evt.持续时间 || 0;
                          const intensity = loss > 100 ? '重刹' : loss > 50 ? '中度' : '轻刹';
                          const intensityColor = loss > 100 ? 'var(--danger)' : loss > 50 ? 'var(--warning)' : 'var(--success)';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{evt.起始速度} km/h</td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{evt.结束速度} km/h</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: intensityColor }}>{loss} km/h</td>
                              <td style={tdStyle}>{duration} ms</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: intensityColor }}>{intensity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeChart === 'accel' && accelAnalysis && (
              <div>
                <div style={sectionStyle}>
                  <h3 style={sectionTitleStyle}>加速分析</h3>
                  {/* Round 8: 加速分析增强 - 出弯加速效率检测 */}
                  {accelAnalysis.加速事件 && accelAnalysis.加速事件.length > 0 && (() => {
                    const slowExit = accelAnalysis.加速事件.filter(e => {
                      const gain = (e.结束速度 || 0) - (e.起始速度 || 0);
                      const duration = (e.持续时间 || 0) / 1000;
                      return gain > 0 && duration > 0 && (gain / duration) < 40;
                    });
                    return slowExit.length > 3 ? (
                      <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(210,153,34,0.06)', border: '1px solid rgba(210,153,34,0.2)', borderRadius: 6, fontSize: 11 }}>
                        <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: 6 }}>出弯加速效率</div>
                        <div style={{ color: 'var(--text-secondary)' }}>- 检测到 {slowExit.length} 次低速加速事件(加速率 &lt; 40km/h/s)，可能出弯给油不足或档位选择不当</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>- 建议提前降档至合适的弯中档位，确保出弯时能在最佳转速区间加速</div>
                      </div>
                    ) : null;
                  })()}
                  <div style={statsGridStyle}>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>加速事件数</div>
                      <div style={{ ...statValueStyle, color: 'var(--accent)' }}>{accelAnalysis.加速事件总数 || 0}</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>平均加速G力</div>
                      <div style={{ ...statValueStyle, color: 'var(--success)' }}>{accelAnalysis.平均加速G力 || 0}G</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>最大加速G力</div>
                      <div style={{ ...statValueStyle, color: 'var(--warning)' }}>{accelAnalysis.最大加速G力 || 0}G</div>
                    </div>
                    <div style={statItemStyle}>
                      <div style={statLabelStyle}>牵引力利用率</div>
                      <div style={{
                        ...statValueStyle,
                        color: (accelAnalysis.牵引力利用率 || 0) >= 70 ? 'var(--success)' :
                               (accelAnalysis.牵引力利用率 || 0) >= 50 ? 'var(--warning)' : 'var(--danger)'
                      }}>
                        {accelAnalysis.牵引力利用率 || 0}%
                      </div>
                    </div>
                  </div>
                </div>

                {accelAnalysis.加速事件 && accelAnalysis.加速事件.length > 0 && (
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>加速事件记录</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={thStyle}>起始速度</th>
                          <th style={thStyle}>结束速度</th>
                          <th style={thStyle}>速度增长</th>
                          <th style={thStyle}>持续时间(ms)</th>
                          <th style={thStyle}>类型</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accelAnalysis.加速事件.map((evt, i) => {
                          const gain = (evt.结束速度 || 0) - (evt.起始速度 || 0);
                          const duration = evt.持续时间 || 0;
                          const type = gain > 80 ? '全油门' : gain > 40 ? '部分油门' : '缓加速';
                          const typeColor = gain > 80 ? 'var(--success)' : gain > 40 ? 'var(--accent)' : 'var(--text-secondary)';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{evt.起始速度} km/h</td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{evt.结束速度} km/h</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: typeColor }}>+{gain} km/h</td>
                              <td style={tdStyle}>{duration} ms</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: typeColor }}>{type}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeChart === 'comparison' && (
              <div>
                {/* Round 7: 比赛对比功能 */}
                <div style={sectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>比赛对比</h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={clearCompare} style={btnSmallStyle}>清除选择</button>
                      <button
                        onClick={() => {
                          // 进入对比选择模式：左侧列表点击会触发对比选择
                          toast('请在左侧列表中依次点击两个Session进行对比', 'info');
                        }}
                        style={{ ...btnSmallStyle, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.3)' }}
                      >
                        {compareSessionA ? (compareSessionB ? '重新选择' : '选择第二个Session') : '开始对比'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 11 }}>
                    <div style={{ flex: 1, padding: 8, background: compareSessionA ? 'rgba(88,166,255,0.08)' : 'var(--bg-primary)', borderRadius: 6, border: `1px solid ${compareSessionA ? 'rgba(88,166,255,0.3)' : 'var(--border)'}` }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 9 }}>Session A</div>
                      <div style={{ fontWeight: 700, color: compareSessionA ? '#58a6ff' : 'var(--text-muted)' }}>
                        {compareSessionA ? sessions.find(s => s.id === compareSessionA)?.trackName || '已选' : '未选择'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, color: 'var(--text-muted)' }}>VS</div>
                    <div style={{ flex: 1, padding: 8, background: compareSessionB ? 'rgba(210,153,34,0.08)' : 'var(--bg-primary)', borderRadius: 6, border: `1px solid ${compareSessionB ? 'rgba(210,153,34,0.3)' : 'var(--border)'}` }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 9 }}>Session B</div>
                      <div style={{ fontWeight: 700, color: compareSessionB ? '#d29922' : 'var(--text-muted)' }}>
                        {compareSessionB ? sessions.find(s => s.id === compareSessionB)?.trackName || '已选' : '未选择'}
                      </div>
                    </div>
                  </div>
                </div>

                {compareLoading && <LoadingSpinner />}

                {!compareLoading && compareAnalysisA && compareAnalysisB && (() => {
                  const sA = compareAnalysisA;
                  const sB = compareAnalysisB;
                  const diffs = [
                    getCompareDiff(sA.成绩?.最快圈速, sB.成绩?.最快圈速, '最快圈速', 's', true),
                    getCompareDiff(sA.详细统计?.最高速度, sB.详细统计?.最高速度, '最高速度', ' km/h'),
                    getCompareDiff(sA.详细统计?.平均速度, sB.详细统计?.平均速度, '平均速度', ' km/h'),
                    getCompareDiff(sA.制动分析?.制动效率, sB.制动分析?.制动效率, '制动效率', '%'),
                    getCompareDiff(sA.驾驶风格?.油门控制, sB.驾驶风格?.油门控制, '油门控制', '%'),
                    getCompareDiff(sA.走线分析?.评分, sB.走线分析?.评分, '走线评分', '%'),
                    getCompareDiff(sA.加速分析?.牵引力利用率, sB.加速分析?.牵引力利用率, '牵引力利用率', '%'),
                    getCompareDiff(sA.驾驶评分?.总分, sB.驾驶评分?.总分, '综合评分', ' 分'),
                  ];
                  const sessionAData = sessions.find(s => s.id === compareSessionA);
                  const sessionBData = sessions.find(s => s.id === compareSessionB);
                  return (
                    <div style={sectionStyle}>
                      <h3 style={sectionTitleStyle}>对比结果</h3>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12, fontSize: 10, color: 'var(--text-secondary)' }}>
                        <span style={{ color: '#58a6ff', fontWeight: 700 }}>A: {sessionAData?.trackName} ({formatDate(sessionAData?.savedAt)})</span>
                        <span style={{ color: 'var(--text-muted)' }}>vs</span>
                        <span style={{ color: '#d29922', fontWeight: 700 }}>B: {sessionBData?.trackName} ({formatDate(sessionBData?.savedAt)})</span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border)' }}>
                            <th style={{ ...thStyle, fontWeight: 700 }}>对比维度</th>
                            <th style={{ ...thStyle, fontWeight: 700, color: '#58a6ff' }}>Session A</th>
                            <th style={{ ...thStyle, fontWeight: 700, color: '#d29922' }}>Session B</th>
                            <th style={{ ...thStyle, fontWeight: 700 }}>差异</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.map((d, i) => (
                            <tr key={i} style={{
                              borderBottom: '1px solid var(--border-light)',
                              background: d.diff !== null ? d.color + '08' : 'transparent'
                            }}>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{d.label}</td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'right' }}>
                                {d.valA !== null ? (d.label.includes('圈速') ? formatTime(d.valA) : d.valA) : '-'}
                                {d.label.includes('%') || d.label.includes('分') ? '%' : ''}
                              </td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'right' }}>
                                {d.valB !== null ? (d.label.includes('圈速') ? formatTime(d.valB) : d.valB) : '-'}
                                {d.label.includes('%') || d.label.includes('分') ? '%' : ''}
                              </td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: d.color }}>
                                {d.displayDiff || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                <LapComparison sessionId={selectedSession} />
                {lapTrendData && (
                  <div style={{ ...sectionStyle, marginTop: 16 }}>
                    <h3 style={sectionTitleStyle}>圈速趋势</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={lapTrendData.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="lap" tick={{ fontSize: 9 }} />
                        <YAxis tick={{ fontSize: 9 }} domain={['auto', 'auto']} />
                        <Tooltip
                          formatter={(val) => [val.toFixed(3) + 's', '圈速']}
                          contentStyle={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontSize: 11
                          }}
                        />
                        <ReferenceLine
                          y={lapTrendData.bestTime}
                          stroke="var(--success)"
                          strokeDasharray="6 4"
                          strokeWidth={1.5}
                          label={{ value: '最佳 ' + lapTrendData.bestTime.toFixed(3) + 's', fontSize: 9, fill: 'var(--success)', position: 'right' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="time"
                          stroke="var(--accent)"
                          strokeWidth={2}
                          dot={{ r: 3, fill: 'var(--accent)' }}
                          activeDot={{ r: 5 }}
                          name="圈速"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
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

            {activeChart === 'heatmap' && sessionDetail && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>油门/刹车热力图</h3>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    分析各路段的油门与刹车使用分布
                  </div>
                </div>
                <ThrottleBrakeHeatmap history={sessionDetail.data || []} />
              </div>
            )}

            {activeChart === 'heatmap' && !sessionDetail && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                请先从左侧选择一个比赛记录以查看热力图
              </div>
            )}

            {activeChart === 'sectors' && selectedSession && (
              <SectorAnalysis sessionId={selectedSession} />
            )}

            {activeChart === 'sectors' && !selectedSession && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                请先从左侧选择一个比赛记录以查看分段分析
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