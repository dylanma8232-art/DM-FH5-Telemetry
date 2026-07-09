import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ScatterChart, Scatter, Cell } from 'recharts';
import { ReplayPlayer } from '../dashboard/ReplayPlayer';
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
  const [diagnosis, setDiagnosis] = useState(null);
  const [channelsData, setChannelsData] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [advancedData, setAdvancedData] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [turnsData, setTurnsData] = useState(null);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
  const [trackTurnsData, setTrackTurnsData] = useState(null);
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
  const [lbLoaded, setLbLoaded] = useState(false);
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



  // Round 9: Session列表分页
  const [sessionPage, setSessionPage] = useState(1);
  const SESSION_PAGE_SIZE = 20;



  // 赛道标签筛选器
  const uniqueTracks = useMemo(() => {
    return [...new Set(sessions.map(s => s.trackName || '未知赛道'))].filter(Boolean)
  }, [sessions])

  // 按赛道分组的成就墙数据
  const groupedAchievements = useMemo(() => {
    const map = new Map();
    for (const entry of lbEntries) {
      const trackId = entry.trackId || 'unknown';
      if (!map.has(trackId)) {
        map.set(trackId, {
          trackId,
          trackName: entry.trackName || '未知赛道',
          bestLap: entry.bestLap || 0,
          firstLap: entry.firstLap || 0,
          totalLaps: 0,
          sessionCount: 0,
          recentBreakthrough: false,
          daysSinceLastSession: Infinity,
          vehicles: [],
          lastSessionAt: null,
          recentBestLaps: []
        });
      }
      const item = map.get(trackId);
      
      // 记录车辆最佳圈速信息
      item.vehicles.push({
        vehicleOrdinal: entry.vehicleOrdinal,
        vehicleName: entry.vehicleName,
        vehicleClass: entry.vehicleClass,
        vehiclePI: entry.vehiclePI,
        bestLap: entry.bestLap,
        sessionCount: entry.sessionCount,
        totalLaps: entry.totalLaps
      });

      // 累加场次和跑圈数
      item.totalLaps += entry.totalLaps || 0;
      item.sessionCount += entry.sessionCount || 0;

      // 寻找绝对最快圈速及车辆
      if (entry.bestLap > 0 && (item.bestLap === 0 || entry.bestLap < item.bestLap)) {
        item.bestLap = entry.bestLap;
        item.vehicleOrdinal = entry.vehicleOrdinal;
        item.vehicleName = entry.vehicleName;
        item.vehicleClass = entry.vehicleClass;
        item.vehiclePI = entry.vehiclePI;
      }
      
      if (entry.recentBreakthrough) {
        item.recentBreakthrough = true;
      }
      
      if (entry.daysSinceLastSession < item.daysSinceLastSession) {
        item.daysSinceLastSession = entry.daysSinceLastSession;
      }
      
      if (!item.lastSessionAt || (entry.lastSessionAt && new Date(entry.lastSessionAt) > new Date(item.lastSessionAt))) {
        item.lastSessionAt = entry.lastSessionAt;
      }
    }

    const list = [];
    map.forEach(item => {
      // 按照车辆最佳圈速升序排序
      item.vehicles.sort((a, b) => {
        if (a.bestLap === 0) return 1;
        if (b.bestLap === 0) return -1;
        return a.bestLap - b.bestLap;
      });

      // 获取最老的一次有效圈速记录作为基准首圈，用于计算提升幅度
      const validFirstLaps = lbEntries.filter(e => e.trackId === item.trackId && e.firstLap > 0).map(e => e.firstLap);
      const overallFirstLap = validFirstLaps.length > 0 ? Math.min(...validFirstLaps) : 0;
      item.firstLap = overallFirstLap;

      // 提取该赛道最后5场比赛的最佳圈速，用于迷你趋势折线图
      const trackSessions = [...sessions]
        .filter(s => s.trackId === item.trackId)
        .reverse();
      item.recentBestLaps = trackSessions
        .filter(s => s.laps?.best > 0)
        .slice(-5)
        .map((s, i) => ({ index: i + 1, bestLap: s.laps.best }));

      list.push(item);
    });

    // 最近出赛的排在前面
    list.sort((a, b) => new Date(b.lastSessionAt) - new Date(a.lastSessionAt));
    return list;
  }, [lbEntries, sessions]);

  // G-G 摩擦力圆：降采样 + 缓存峰值
  const ggData = useMemo(() => {
    const channels = channelsData?.channels || [];
    if (channels.length === 0) return { sampled: [], maxLat: 0, maxBrake: 0 };

    // 降采样：基础每4帧取1帧，额外保留高G值点
    const threshold = 0.8;
    const sampled = [];
    for (let i = 0; i < channels.length; i += 4) {
      const c = channels[i];
      const lat = Math.abs(c.gLat || 0);
      const lng = Math.abs(c.gLong || 0);
      sampled.push(c);
      // 如果接近极限，前后各补2帧保留细节
      if (lat > threshold || lng > threshold) {
        for (let j = Math.max(0, i - 2); j < Math.min(channels.length, i + 3); j++) {
          if (j !== i) sampled.push(channels[j]);
        }
      }
    }

    // 计算峰值
    let maxLat = 0, maxBrake = 0;
    for (const c of channels) {
      const lat = Math.abs(c.gLat || 0);
      const brake = c.gLong < 0 ? Math.abs(c.gLong) : 0;
      if (lat > maxLat) maxLat = lat;
      if (brake > maxBrake) maxBrake = brake;
    }

    return { sampled, maxLat, maxBrake };
  }, [channelsData])

  // 分段用时数据缓存
  const sectorTimingData = useMemo(() => {
    if (!advancedData || !advancedData.lapSectorDetails || advancedData.lapSectorDetails.length === 0) return null;
    const isMultiLap = advancedData.lapCount > 1;
    const allLosses = advancedData.lapSectorDetails.flatMap(lap => lap.sectors.map(s => s.loss));
    const allTimes = advancedData.lapSectorDetails.flatMap(lap => lap.sectors.map(s => s.time));
    const maxTime = Math.max(...allTimes);
    const maxLoss = Math.max(...allLosses.map(l => Math.max(0, l)), 0.01);
    return { isMultiLap, maxTime, maxLoss };
  }, [advancedData])

  const myFilteredSessions = sessions.filter(s => {
    const matchSearch = !sessionSearchQuery.trim() || (s.trackName || '未知赛道').toLowerCase().includes(sessionSearchQuery.trim().toLowerCase())
    const matchTrack = !trackFilter || (s.trackName || '未知赛道') === trackFilter
    return matchSearch && matchTrack
  });

  useEffect(() => {
    loadSessions();
    loadTunes();
    loadLeaderboard();
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
        const allSubTabs = ['overview', 'dynamics', 'workbench', 'replay'];
        const curIdx = allSubTabs.indexOf(activeChart);
        if (e.key === 'ArrowUp' && curIdx > 0) {
          setActiveChart(allSubTabs[curIdx - 1]);
        } else if (e.key === 'ArrowDown' && curIdx < allSubTabs.length - 1) {
          setActiveChart(allSubTabs[curIdx + 1]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [myFilteredSessions, selectedSession, activeChart, detailLoaded]);

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
        setChannelsData(null);
        setAdvancedData(null);
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
      // 优先使用直接传递的trackName
      if (navIntent.trackName) {
        setTrackFilter(navIntent.trackName);
      } else if (navIntent.trackId && sessions.length > 0) {
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
      setChannelsData(null);
      setAdvancedData(null);
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

  const loadAdvancedAnalysis = async () => {
    if (!selectedSession) return;
    if (advancedData && advancedData.sessionId === selectedSession) return;
    setAdvancedLoading(true);
    try {
      const res = await fetch(`/api/analysis/${selectedSession}/advanced?sectors=10`);
      if (!res.ok) throw new Error('Failed to fetch advanced');
      const data = await res.json();
      data.sessionId = selectedSession;
      setAdvancedData(data);
    } catch (e) {
      console.error('加载高级分析失败', e);
    } finally {
      setAdvancedLoading(false);
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
      loadTelemetryChannels();
      loadAdvancedAnalysis();
    } else if (['dynamics', 'workbench'].includes(activeChart)) {
      loadTelemetryChannels();
      loadAdvancedAnalysis();
    } else if (activeChart === 'replay') {
      loadSessionDetail(selectedSession);
    }
  }, [activeChart, selectedSession]);

  // 赛道详情页：加载趋势数据（分段演进）
  useEffect(() => {
    if (!trackFilter || selectedSession) return;
    // 找到该赛道的 trackId 和出赛最多的车辆
    const matched = sessions.find(s => s.trackName === trackFilter);
    if (!matched?.trackId) return;
    const trackSessions = sessions.filter(s => s.trackName === trackFilter);
    // 统计每辆车的出赛次数，选最多的
    const vehicleCounts = {};
    trackSessions.forEach(s => {
      const vKey = s.vehicle?.ordinal || 'unknown';
      vehicleCounts[vKey] = (vehicleCounts[vKey] || 0) + 1;
    });
    const primaryVehicle = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (primaryVehicle && primaryVehicle !== 'unknown') {
      loadLbTrend(matched.trackId, primaryVehicle);
    }
    // 加载最近一场session的弯道数据用于弯道演进对比
    const latestSession = [...trackSessions].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))[0];
    if (latestSession?.id) {
      fetch(`/api/analysis/${latestSession.id}/turns`)
        .then(r => r.ok ? r.json() : null)
        .then(data => setTrackTurnsData(data))
        .catch(() => setTrackTurnsData(null));
    } else {
      setTrackTurnsData(null);
    }
  }, [trackFilter, selectedSession, sessions]);

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
                    调校: {typeof tunes[session.tuneId] === 'string' ? tunes[session.tuneId] : (tunes[session.tuneId]?.name || '未知')}
                  </div>
                )}
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {/* Round 6: PDF报告 */}
                  <button onClick={(e) => { e.stopPropagation(); exportPDFReport(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(188,140,255,0.1)', color: '#bc8cff', borderColor: 'rgba(188,140,255,0.3)' }}>PDF报告</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(218,54,51,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>删除</button>

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
              <span style={{ fontSize: 11, color: '#8b949e' }}>
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
                { id: 'overview', label: '总览' },
                { id: 'dynamics', label: '动力学' },
                { id: 'workbench', label: '驾驶分析' },
                { id: 'replay', label: '回放 & 教练' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveChart(tab.id);
                    if ((tab.id === 'dynamics' || tab.id === 'workbench') && selectedSession) {
                      loadTelemetryChannels();
                      loadAdvancedAnalysis();
                    }
                    if ((tab.id === 'replay') && selectedSession && !detailLoaded) {
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {Object.entries(analysis.驾驶评分.维度 || {}).map(([name, dim]) => {
                        const ratio = dim.分数 / dim.满分;
                        const color = ratio >= 0.8 ? 'var(--success)' : ratio >= 0.6 ? 'var(--warning)' : 'var(--danger)';
                        return (
                          <div key={name} style={{
                            background: 'var(--bg-primary)', borderRadius: 6, padding: 10,
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>{name}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'monospace' }}>{dim.分数}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {dim.满分}</span>
                            </div>
                            <div style={{ height: 3, background: '#21262d', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${ratio * 100}%`, background: color, transition: 'width 0.3s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 驾驶评分建议 */}
                {analysis.驾驶评分?.建议 && analysis.驾驶评分.建议.length > 0 && (
                  <div style={{ ...sectionStyle, marginBottom: 16 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0 }}>改进建议</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {analysis.驾驶评分.建议.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px', borderRadius: 6,
                          background: idx === 0 ? 'rgba(248,81,73,0.06)' : idx === 1 ? 'rgba(210,153,34,0.06)' : 'rgba(88,166,255,0.06)',
                          border: `1px solid ${idx === 0 ? 'rgba(248,81,73,0.2)' : idx === 1 ? 'rgba(210,153,34,0.2)' : 'rgba(88,166,255,0.2)'}`
                        }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, flexShrink: 0, marginTop: 1,
                            background: idx === 0 ? '#f85149' : idx === 1 ? '#d29922' : '#58a6ff',
                            color: '#fff'
                          }}>
                            {idx === 0 ? '优先' : idx === 1 ? '其次' : '建议'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关键指标卡片行 */}
                {(() => {
                  const adv = advancedData;
                  const hasAdv = adv && adv.sessionId === selectedSession;

                  const bestLapTime = analysis?.成绩?.最快圈速 || analysis?.bestLap || 0;
                  const totalDuration = analysis?.成绩?.总时长 || analysis?.总时长 || 0;
                  const formatDuration = (ms) => {
                    if (!ms || ms <= 0) return '--';
                    const sec = Math.floor(ms / 1000);
                    const min = Math.floor(sec / 60);
                    const s = sec % 60;
                    return min > 0 ? `${min}分${s}秒` : `${s}秒`;
                  };

                  const metrics = [
                    { label: '最快圈速', value: bestLapTime > 0 ? formatTime(bestLapTime) : '--', color: '#3fb950' },
                    { label: '总时长', value: formatDuration(totalDuration), color: '#8b949e' },
                    { label: '一致性(σ)', value: hasAdv && adv.consistency?.lapTimeStd != null ? adv.consistency.lapTimeStd.toFixed(3) + 's' : '--', color: '#d29922' },
                    { label: 'Trail Braking', value: hasAdv && adv.trailBraking?.ratio != null ? (adv.trailBraking.ratio * 100).toFixed(1) + '%' : '--', color: '#a371f7' },
                  ];

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                      {metrics.map(m => (
                        <div key={m.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                          <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>{m.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: 'monospace' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 分段分析：多圈显示每圈损失时间，单圈显示分段用时 */}
                {sectorTimingData && advancedData && advancedData.sessionId === selectedSession && (() => {
                  const { isMultiLap } = sectorTimingData;
                  const laps = advancedData.lapSectorDetails;
                  if (!laps || laps.length === 0) return null;
                  
                  // 获取分段数量
                  const sectorCount = laps[0]?.sectors?.length || 0;
                  
                  return (
                    <div style={sectionStyle}>
                      <h3 style={sectionTitleStyle}>
                        {isMultiLap ? '分段损失时间' : '分段用时'}
                      </h3>
                      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, lineHeight: 1.5 }}>
                        {isMultiLap
                          ? '每圈各赛段相比理论最佳的损失时间。'
                          : '当前比赛不同分段的用时。'}
                      </div>
                      
                      {/* 单圈模式：横向表格 */}
                      {!isMultiLap && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#8b949e', fontWeight: 700 }}>分段</th>
                                {laps[0]?.sectors.map(s => {
                                  const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                  const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                  return (
                                    <th key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', color: isBest ? '#3fb950' : isWorst ? '#f85149' : '#8b949e', fontWeight: 700 }}>S{s.sector}</th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #21262d' }}>
                                <td style={{ padding: '8px 12px', color: '#8b949e', fontWeight: 500 }}>用时</td>
                                {laps[0]?.sectors.map(s => {
                                  const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                  const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                  const timeColor = isBest ? '#3fb950' : isWorst ? '#f85149' : '#e6edf3';
                                  return (
                                    <td key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: timeColor, fontWeight: 700 }}>
                                      {s.time.toFixed(2)}s
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      
                      {/* 多圈模式：紧凑表格，每圈一行，限制最大高度 */}
                      {isMultiLap && (
                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                              <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                <th style={{ padding: '8px 8px', textAlign: 'left', color: '#8b949e', fontWeight: 700, position: 'sticky', left: 0, background: '#161b22', zIndex: 3 }}>圈</th>
                                <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>总用时</th>
                                {Array.from({ length: sectorCount }, (_, i) => (
                                  <th key={i} style={{ padding: '8px 6px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>S{i + 1}</th>
                                ))}
                                <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>损失</th>
                              </tr>
                            </thead>
                            <tbody>
                              {laps.map((lap, lapIdx) => {
                                const totalLoss = lap.sectors.reduce((sum, s) => sum + s.loss, 0);
                                return (
                                  <tr key={lap.lap} style={{ borderBottom: '1px solid #21262d', background: lapIdx % 2 === 0 ? 'transparent' : 'rgba(22, 27, 34, 0.5)' }}>
                                    <td style={{ padding: '6px 8px', color: '#e6edf3', fontWeight: 600, position: 'sticky', left: 0, background: lapIdx % 2 === 0 ? '#0d1117' : '#161b22', zIndex: 1 }}>第{lap.lap}圈</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#e6edf3', fontWeight: 600 }}>{lap.totalTime.toFixed(2)}s</td>
                                    {lap.sectors.map(s => {
                                      const isBest = s.loss === 0;
                                      const isWorst = s.loss === Math.max(...lap.sectors.map(x => x.loss));
                                      const lossColor = isBest ? '#3fb950' : isWorst ? '#f85149' : s.loss > 50 ? '#d29922' : '#8b949e';
                                      return (
                                        <td key={s.sector} style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: lossColor, fontWeight: isBest || isWorst ? 700 : 400 }}>
                                          {s.loss > 0 ? '+' : ''}{(s.loss / 1000).toFixed(2)}s
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: totalLoss > 0 ? '#f85149' : '#3fb950', fontWeight: 700 }}>
                                      {totalLoss > 0 ? '+' : ''}{(totalLoss / 1000).toFixed(2)}s
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}



                {/* 赛道地图与弯道性能诊断看板（双栏布局） */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={sectionStyle}>
                    <h3 style={sectionTitleStyle}>赛道诊断热力图</h3>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>红色虚线=失分最多的弯道，黄色=当前选中弯道。点击右侧表格行可联动高亮，优先改进红色弯道。</div>
                    {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                      <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontStyle: 'italic' }}>
                        暂无弯道数据——请先在赛道管理中对该赛道完成建图。
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>
                        红色虚线=失分最多的3个弯道，黄色=当前选中弯道。点击右侧表格行可联动高亮。优先处理红色弯道。
                      </div>
                    )}
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      fallbackPositions={sessionDetail?.positions || []}
                      width={480}
                      height={320}
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

                  <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={sectionTitleStyle}>弯道性能参数表</h3>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>点击任意行可在左侧地图高亮该弯道。弯心速度越高越好，横向G过低说明走线保守。</div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>
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
              </>
            )}

            {activeChart === 'dynamics' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>动力学分析</h3>
                </div>

                {/* 面板1: G-G 摩擦圆 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>G-G 摩擦力圆</h4>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>横向G力反映过弯极限，纵向G力反映加速/制动极限。点越靠近边缘说明轮胎抓地力利用越充分。</div>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>
                      密集区=极限状态保持久；十字形分布=欠缺循迹刹车
                    </div>
                    <div style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis type="number" dataKey="gLat" name="横向G" domain={[-1.8, 1.8]} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v) => v.toFixed(1)} tickCount={7} />
                          <YAxis type="number" dataKey="gLong" name="纵向G" domain={[-1.8, 1.8]} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v) => v.toFixed(1)} tickCount={7} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} formatter={(value, name) => [value.toFixed(2) + ' G', name === 'gLat' ? '横向G' : '纵向G']} />
                          <Scatter name="遥测G值" data={ggData.sampled} fill="rgba(88, 166, 255, 0.45)" shape="circle" />
                          <ReferenceLine x={0} stroke="#484f58" />
                          <ReferenceLine y={0} stroke="#484f58" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, flex: 1 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>最大横向力</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>{ggData.maxLat.toFixed(2)} G</div>
                      </div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, flex: 1 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>最大纵向制动</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f85149', fontFamily: 'monospace' }}>{ggData.maxBrake.toFixed(2)} G</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 面板2: US/OS 指数曲线 */}
                <div style={{ ...sectionStyle, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>转向不足/过度分析</h4>
                  <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>正值=车头向外推（转向不足），负值=车尾向外甩（转向过度）。绝对值越大偏离中性越远，用于调校悬挂和差速器。</div>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={advancedData?.usOsIndex || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '距离(m)', position: 'insideBottomRight', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: 'US/OS指数', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} />
                        <ReferenceLine y={0} stroke="#484f58" />
                        <Line dataKey="value" stroke="#58a6ff" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 面板3: 轮胎滑移效率图 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>轮胎滑移效率图</h4>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>
                      X=纵向滑移率，Y=侧偏角。点集中=轮胎工作稳定，分散=不稳定。越靠近原点说明轮胎越接近纯滚动（最高效）
                    </div>
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis type="number" dataKey="slipAvg" domain={['auto', 'auto']} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '纵向滑移率', position: 'insideBottomRight', style: { fontSize: 10, fill: '#8b949e' } }} />
                          <YAxis type="number" dataKey="angleAvg" domain={['auto', 'auto']} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '侧偏角(rad)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#8b949e' } }} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} formatter={(v,n) => [v.toFixed(3), n === 'slipAvg' ? '滑移率' : '侧偏角']} />
                          <Scatter name="滑移" data={(channelsData.channels || []).filter((_, i) => i % 4 === 0).map(c => ({
                            slipAvg: (Math.abs(c.slipFL||0) + Math.abs(c.slipFR||0) + Math.abs(c.slipRL||0) + Math.abs(c.slipRR||0)) / 4,
                            angleAvg: (Math.abs(c.angleFL||0) + Math.abs(c.angleFR||0) + Math.abs(c.angleRL||0) + Math.abs(c.angleRR||0)) / 4
                          })).filter(d => d.slipAvg > 0.005 || d.angleAvg > 0.01)} fill="#3fb950" r={3} />
                          <ReferenceLine x={0} stroke="#484f58" />
                          <ReferenceLine y={0} stroke="#484f58" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeChart === 'workbench' && channelsData && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>驾驶分析</h3>
                  <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4, lineHeight: 1.5 }}>
                    鼠标悬停任意图表可同步查看所有通道在同一位置的数据。从上到下对照：车速波谷→刹车深度→方向盘角度→档位变化。
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Trail Braking */}
                  {advancedData?.trailBraking && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>Trail Braking</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: advancedData.trailBraking.ratio > 0.3 ? '#3fb950' : '#d29922', fontFamily: 'monospace' }}>
                          {(advancedData.trailBraking.ratio * 100).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>{advancedData.trailBraking.count}/{advancedData.trailBraking.total} 帧</div>
                      </div>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>最高车速</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#58a6ff', fontFamily: 'monospace' }}>
                          {Math.max(...channelsData.channels.map(c => c.speed))}
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>km/h</div>
                      </div>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>最高转速</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#d29922', fontFamily: 'monospace' }}>
                          {Math.max(...channelsData.channels.map(c => c.rpm || 0)).toFixed(0)}
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>RPM</div>
                      </div>
                    </div>
                  )}
                  <div style={{ ...sectionStyle, height: 160, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>车速曲线</span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>最高: {Math.max(...channelsData.channels.map(c => c.speed))} km/h</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>波谷=制动点，波峰=直道极速。找波谷位置判断刹车时机是否合理</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={['auto', 'auto']} unit="km/h" />
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
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>绿=油门 红=刹车。刹车松开后油门应立即衔接，中间空隙越短越好</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={[0, 100]} unit="%" />
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
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>正值=右转 负值=左转。弯中曲线应平滑，频繁抖动说明修正过多</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={[-127, 127]} />
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
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>阶梯变化=换挡点。降档过早会丢转速，过晚会错过最佳加速区间</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '距离(m)', position: 'insideBottomRight', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={[0, 8]} tickCount={9} label={{ value: '档位', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value) => [value + ' 档', '档位']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="step" dataKey="gear" stroke="#bc8cff" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 分段分析：多圈显示每圈损失时间，单圈显示分段用时 */}
                  {sectorTimingData && advancedData && advancedData.sessionId === selectedSession && (() => {
                    const { isMultiLap } = sectorTimingData;
                    const laps = advancedData.lapSectorDetails;
                    if (!laps || laps.length === 0) return null;
                    
                    const sectorCount = laps[0]?.sectors?.length || 0;
                    
                    return (
                      <div style={{ ...sectionStyle, marginTop: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 12 }}>
                          {isMultiLap ? '分段损失时间' : '分段用时'}
                        </h4>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>
                          {isMultiLap
                            ? '每圈各赛段相比理论最佳的损失时间。'
                            : '当前比赛不同分段的用时。'}
                        </div>
                        
                        {/* 单圈模式：横向表格 */}
                        {!isMultiLap && (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                              <thead>
                                <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#8b949e', fontWeight: 700 }}>分段</th>
                                  {laps[0]?.sectors.map(s => {
                                    const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                    const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                    return (
                                      <th key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', color: isBest ? '#3fb950' : isWorst ? '#f85149' : '#8b949e', fontWeight: 700 }}>S{s.sector}</th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderBottom: '1px solid #21262d' }}>
                                  <td style={{ padding: '8px 12px', color: '#8b949e', fontWeight: 500 }}>用时</td>
                                  {laps[0]?.sectors.map(s => {
                                    const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                    const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                    const timeColor = isBest ? '#3fb950' : isWorst ? '#f85149' : '#e6edf3';
                                    return (
                                      <td key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: timeColor, fontWeight: 700 }}>
                                        {s.time.toFixed(2)}s
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {/* 多圈模式：紧凑表格 */}
                        {isMultiLap && (
                          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                                <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                  <th style={{ padding: '8px 8px', textAlign: 'left', color: '#8b949e', fontWeight: 700, position: 'sticky', left: 0, background: '#161b22', zIndex: 3 }}>圈</th>
                                  <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>总用时</th>
                                  {Array.from({ length: sectorCount }, (_, i) => (
                                    <th key={i} style={{ padding: '8px 6px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>S{i + 1}</th>
                                  ))}
                                  <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>损失</th>
                                </tr>
                              </thead>
                              <tbody>
                                {laps.map((lap, lapIdx) => {
                                  const totalLoss = lap.sectors.reduce((sum, s) => sum + s.loss, 0);
                                  return (
                                    <tr key={lap.lap} style={{ borderBottom: '1px solid #21262d', background: lapIdx % 2 === 0 ? 'transparent' : 'rgba(22, 27, 34, 0.5)' }}>
                                      <td style={{ padding: '6px 8px', color: '#e6edf3', fontWeight: 600, position: 'sticky', left: 0, background: lapIdx % 2 === 0 ? '#0d1117' : '#161b22', zIndex: 1 }}>第{lap.lap}圈</td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#e6edf3', fontWeight: 600 }}>{lap.totalTime.toFixed(2)}s</td>
                                      {lap.sectors.map(s => {
                                        const isBest = s.loss === 0;
                                        const isWorst = s.loss === Math.max(...lap.sectors.map(x => x.loss));
                                        const lossColor = isBest ? '#3fb950' : isWorst ? '#f85149' : s.loss > 50 ? '#d29922' : '#8b949e';
                                        return (
                                          <td key={s.sector} style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: lossColor, fontWeight: isBest || isWorst ? 700 : 400 }}>
{s.loss > 0 ? '+' : ''}{s.loss.toFixed(2)}s
                                          </td>
                                        );
                                      })}
                                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: totalLoss > 0 ? '#f85149' : '#3fb950', fontWeight: 700 }}>
{totalLoss > 0 ? '+' : ''}{totalLoss.toFixed(2)}s
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              </div>
            )}

            {activeChart === 'replay' && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ ...sectionTitleStyle, margin: 0 }}>回放 & AI教练</h3>
                </div>
                
                {/* 影子车回放 */}
                <div style={sectionStyle}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 12 }}>影子车回放</h4>
                  <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, lineHeight: 1.5 }}>在赛道俯视图上回放你的行驶轨迹，观察走线是否合理。</div>
                  {sessionDetail ? (
                    <ReplayPlayer positions={sessionDetail.positions || []} data={sessionDetail.data || []} />
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30, color: '#8b949e', fontSize: 11 }}>
                      {detailLoaded ? '无回放数据' : '加载中...'}
                    </div>
                  )}
                </div>
                
                {/* AI驾驶教练 */}
                <div style={{ ...sectionStyle, marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 12 }}>AI 驾驶教练</h4>
                  <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, lineHeight: 1.5 }}>基于遥测数据的智能分析，给出具体的驾驶改进建议。</div>
                  <AICoachPanel sessionId={selectedSession} />
                </div>
              </div>
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
                            {trackSessions.reduce((sum, s) => sum + (s.laps?.count || (s.laps?.best > 0 ? 1 : 0)), 0)} 圈
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
                            <XAxis dataKey="index" tickFormatter={v => `第${v}次`} tick={{ fontSize: 10, fill: '#8b949e' }} />
                            <YAxis domain={yDomain} tickFormatter={v => lbFormatTime(v)} tick={{ fontSize: 10, fill: '#8b949e' }} width={55} reversed />
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

                  {/* 分段演进对比表 */}
                  {lbTrendData && lbTrendData.sessions && lbTrendData.sessions.length > 1 && lbTrendData.sessions[0].sectors && lbTrendData.sessions[0].sectors.length > 0 && (() => {
                    const trendSessions = lbTrendData.sessions.filter(s => s.sectors && s.sectors.length > 0);
                    if (trendSessions.length < 2) return null;
                    const sectorCount = trendSessions[0].sectors.length;
                    const optimalLap = lbTrendData.optimalLap || 0;

                    // 计算每个分段的最佳值
                    const sectorBests = [];
                    for (let i = 0; i < sectorCount; i++) {
                      const times = trendSessions.map(s => s.sectors[i]).filter(t => t > 0);
                      sectorBests.push(times.length > 0 ? Math.min(...times) : 0);
                    }

                    return (
                      <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>
                            分段演进对比
                            <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 400, marginLeft: 8 }}>
                              {lbTrendData.vehicleOrdinal ? `车辆 #${lbTrendData.vehicleOrdinal}` : ''}
                            </span>
                          </div>
                          {optimalLap > 0 && (
                            <div style={{ fontSize: 11, color: '#8b949e' }}>
                              理论最优圈: <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 700 }}>{lbFormatTime(optimalLap)}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8 }}>每行=一次出赛，每列=一个分段。绿色=该分段最佳。对比各分段找进步空间。</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>场次</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>日期</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>调校</th>
                                {Array.from({ length: sectorCount }, (_, i) => (
                                  <th key={i} style={{ padding: '6px 8px' }}>S{i + 1}</th>
                                ))}
                                <th style={{ padding: '6px 8px' }}>总圈速</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trendSessions.map((s, sIdx) => {
                                const sectorBest = Math.max(...s.sectors.map((t, i) => t === sectorBests[i] ? 1 : 0));
                                return (
                                  <tr key={s.sessionId} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)' }}>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>第{s.sessionIndex || sIdx + 1}次</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', color: '#8b949e' }}>
                                      {s.savedAt ? new Date(s.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '-'}
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', color: s.tuneName ? '#58a6ff' : '#484f58', fontSize: 9 }}>
                                      {s.tuneName || '-'}
                                    </td>
                                    {s.sectors.map((t, i) => {
                                      const isBest = t === sectorBests[i] && t > 0;
                                      // 与上一场对比
                                      const prevS = trendSessions[sIdx - 1];
                                      const prevT = prevS?.sectors?.[i] || 0;
                                      const diff = prevT > 0 ? t - prevT : 0;
                                      const diffColor = diff < -0.1 ? '#3fb950' : diff > 0.1 ? '#f85149' : '#8b949e';
                                      return (
                                        <td key={i} style={{
                                          padding: '6px 8px',
                                          fontFamily: 'monospace', fontWeight: isBest ? 700 : 400,
                                          color: isBest ? '#3fb950' : 'var(--text-primary)'
                                        }}>
                                          {t > 0 ? t.toFixed(2) : '-'}
                                          {diff !== 0 && (
                                            <span style={{ fontSize: 8, color: diffColor, marginLeft: 2 }}>
                                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: s.bestLap === lbTrendData.bestLap ? '#3fb950' : 'var(--text-primary)' }}>
                                      {s.bestLap > 0 ? lbFormatTime(s.bestLap) : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* 最优行 */}
                              {sectorBests.some(t => t > 0) && (
                                <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(63,185,80,0.05)' }}>
                                   <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#3fb950' }}>最优</td>
                                   <td style={{ padding: '6px 8px', textAlign: 'left', color: '#8b949e' }}>各段最佳</td>
                                   <td style={{ padding: '6px 8px' }}></td>
                                  {sectorBests.map((t, i) => (
                                    <td key={i} style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                      {t > 0 ? t.toFixed(2) : '-'}
                                    </td>
                                  ))}
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                    {optimalLap > 0 ? lbFormatTime(optimalLap) : '-'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 弯道演进对比表 */}
                  {trackTurnsData && trackTurnsData.turns && trackTurnsData.turns.length > 0 && (() => {
                    const turns = trackTurnsData.turns;
                    // 只显示有历史数据的弯道
                    const turnsWithHistory = turns.filter(t => t.history && t.history.length > 1);
                    if (turnsWithHistory.length === 0) return null;

                    return (
                      <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>弯道演进对比</div>
                        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8 }}>每个弯道在不同场次的弯心速度变化。绿色=历史最佳，红色=退步。</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>弯道</th>
                                <th style={{ padding: '6px 8px' }}>类型</th>
                                {turnsWithHistory[0].history.slice(-5).map((h, i) => (
                                  <th key={i} style={{ padding: '6px 8px' }}>
                                    {h.savedAt ? new Date(h.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : `#${i + 1}`}
                                  </th>
                                ))}
                                <th style={{ padding: '6px 8px' }}>最佳</th>
                              </tr>
                            </thead>
                            <tbody>
                              {turnsWithHistory.map((turn, tIdx) => {
                                const recentHistory = turn.history.slice(-5);
                                const apexSpeeds = recentHistory.map(h => h.apexSpeed || 0).filter(v => v > 0);
                                const bestApex = apexSpeeds.length > 0 ? Math.max(...apexSpeeds) : 0;
                                return (
                                  <tr key={turn.index || tIdx} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)' }}>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>{turn.name}</td>
                                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>{turn.direction === 'left' ? '左' : '右'}</td>
                                    {recentHistory.map((h, i) => {
                                      const speed = h.apexSpeed || 0;
                                      const isBest = speed === bestApex && speed > 0;
                                      // 与上一场对比
                                      const prevSpeed = i > 0 ? (recentHistory[i - 1].apexSpeed || 0) : 0;
                                      const diff = prevSpeed > 0 ? speed - prevSpeed : 0;
                                      const diffColor = diff > 1 ? '#3fb950' : diff < -1 ? '#f85149' : '#8b949e';
                                      return (
                                        <td key={i} style={{
                                          padding: '6px 8px', fontFamily: 'monospace',
                                          fontWeight: isBest ? 700 : 400,
                                          color: isBest ? '#3fb950' : 'var(--text-primary)'
                                        }}>
                                          {speed > 0 ? speed : '-'}
                                          {diff !== 0 && (
                                            <span style={{ fontSize: 8, color: diffColor, marginLeft: 2 }}>
                                              {diff > 0 ? '+' : ''}{diff.toFixed(0)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                      {bestApex > 0 ? bestApex : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

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
                              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
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

                  {/* 历次比赛记录列表 */}
                  {trackSessions.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>该赛道历史比赛记录</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '8px 6px' }}>出赛日期</th>
                              <th style={{ padding: '8px 6px' }}>出赛车辆</th>
                              <th style={{ padding: '8px 6px' }}>最快圈速</th>
                              <th style={{ padding: '8px 6px' }}>总跑圈数</th>
                              <th style={{ padding: '8px 6px', textAlign: 'right' }}>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trackSessions.map(session => (
                              <tr key={session.id} style={{ borderBottom: '1px solid rgba(48, 54, 61, 0.3)' }}>
                                <td style={{ padding: '8px 6px' }}>{formatDate(session.savedAt)}</td>
                                <td style={{ padding: '8px 6px' }}>{session.vehicle?.name || `Car #${session.vehicle?.ordinal}`}</td>
                                <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>
                                  {session.laps?.best > 0 ? formatTime(session.laps.best) : '-'}
                                </td>
                                <td style={{ padding: '8px 6px' }}>{session.laps?.count || (session.laps?.best > 0 ? 1 : 0)}圈</td>
                                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => loadAnalysis(session.id)}
                                    style={{
                                      ...btnSmallStyle,
                                      background: 'rgba(88, 166, 255, 0.1)',
                                      color: '#58a6ff',
                                      borderColor: 'rgba(88, 166, 255, 0.3)',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    查看详情
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                  共跑过 {groupedAchievements.length} 个赛道，点击卡片聚焦该赛道
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
                const filteredAchievements = groupedAchievements.filter(entry => {
                  return !sessionSearchQuery.trim() || entry.trackName.toLowerCase().includes(sessionSearchQuery.toLowerCase());
                });

                if (filteredAchievements.length === 0) {
                  return <div style={{ gridColumn: '1/-1' }}><EmptyState icon="🏆" title="暂无成就卡片" description="在不同赛道跑圈并保存记录后将自动生成成就卡片" /></div>;
                }

                return filteredAchievements.map(entry => {
                  const badges = [];
                  if (entry.recentBreakthrough) badges.push({ icon: '🔥', label: '突破', color: '#ff9500' });
                  if (entry.daysSinceLastSession > 30) badges.push({ icon: '❄️', label: '冷落', color: '#58a6ff' });

                  const vehicleText = entry.bestLap > 0
                    ? `最快车辆: ${entry.vehicleName || `Car #${entry.vehicleOrdinal}`} (${getVehicleClass(entry.vehicleClass)} ${entry.vehiclePI} PI)`
                    : '暂无有效纪录';

                  return (
                    <div
                      key={entry.trackId}
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
                          {vehicleText}
                        </div>

                        {/* 最佳圈速与微缩趋势线 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#3fb950', fontFamily: 'monospace' }}>
                              {entry.bestLap > 0 ? lbFormatTime(entry.bestLap) : '-'}
                            </div>
                            {entry.improvementSec > 0 && (
                              <div style={{ fontSize: 9, color: '#3fb950', marginTop: 2, fontWeight: 600 }}>
                                ▼ {entry.improvementSec.toFixed(2)}s (超越首圈)
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
  padding: '4px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500
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

// 交互式 Canvas 赛道图组件
function InteractiveTrackMap({ trackId, fallbackPositions = [], highlightedPoints = [], cursorPoint = null, width = 300, height = 300, showCoasting = false, coastingPoints = [] }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState([]);
  
  useEffect(() => {
    const fetchPositions = async () => {
      if (!trackId) return;
      try {
        const res = await fetch(`/api/tracks/${trackId}`);
        if (!res.ok) return;
        const data = await res.json();
        // 与赛道管理完全一致：centerline → points → trajectories[0]
        const resolved = (data.centerline && data.centerline.length > 2) ? data.centerline
          : (data.points && data.points.length > 2) ? data.points
          : (data.trajectories && data.trajectories.length > 0 && data.trajectories[0].length > 2) ? data.trajectories[0]
          : [];
        setPositions(resolved);
      } catch (e) {
        console.error('Failed to load track map coordinates', e);
      }
    };
    fetchPositions();
  }, [trackId]);

  // 选择最终要绘制的点集：优先赛道中心线，若中心线点数不足则用实际行驶轨迹兜底
  const drawPositions = positions.length >= 2 ? positions : fallbackPositions;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawPositions.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    drawPositions.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    });
    
    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    // 与赛道管理一致：pad=40
    const pad = 40;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * sc) / 2;
    const oz = (h - (maxZ - minZ) * sc) / 2;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // 降采样（与赛道管理一致：>1000点时降采样到500）
    let pts = drawPositions;
    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 500);
      const sampled = [pts[0]];
      for (let i = step; i < pts.length - 1; i += step) sampled.push(pts[i]);
      sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }
    
    // 1. 绘制真实赛道边界多边形 (如果存在 width 数据) — 与赛道管理一致
    if (pts[0].widthLeft !== undefined) {
      ctx.fillStyle = 'rgba(136, 148, 160, 0.4)'; // 与赛道管理一致的柏油路面灰色
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const yaw = pt.yaw || 0;
        const wl = pt.widthLeft || 2;
        const nx = -Math.cos(yaw);
        const nz = Math.sin(yaw);
        const px = (pt.x + nx * wl - minX) * sc + ox;
        const pz = h - oz - (pt.z + nz * wl - minZ) * sc;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i];
        const yaw = pt.yaw || 0;
        const wr = pt.widthRight || 2;
        const nx = Math.cos(yaw);
        const nz = -Math.sin(yaw);
        const px = (pt.x + nx * wr - minX) * sc + ox;
        const pz = h - oz - (pt.z + nz * wr - minZ) * sc;
        ctx.lineTo(px, pz);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 回退：画粗线底色
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
    }
    
    // 2. 绘制高亮蓝色走线 — 与赛道管理一致
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

    // 3. 绘制滑行高亮（Coasting）
    if (showCoasting && coastingPoints && coastingPoints.length > 0) {
      ctx.fillStyle = 'rgba(188, 140, 255, 0.4)';
      coastingPoints.forEach(p => {
        const px = (p.x - minX) * sc + ox;
        const pz = h - oz - (p.z - minZ) * sc;
        ctx.beginPath();
        ctx.arc(px, pz, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    // 4. 绘制弯道高亮与标签
    highlightedPoints.forEach((pt) => {
      if (!pt.x || !pt.z) return;
      const tx = (pt.x - minX) * sc + ox;
      const ty = h - oz - (pt.z - minZ) * sc;
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
      const cx = (cursorPoint.x - minX) * sc + ox;
      const cy = h - oz - (cursorPoint.z - minZ) * sc;
      
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
  }, [drawPositions, highlightedPoints, cursorPoint, showCoasting, coastingPoints]);
  
  return (
    <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}


