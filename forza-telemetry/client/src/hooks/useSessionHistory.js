import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from '../components/shared/Toast';
import { api } from '../services/api';

const inputStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11
};

export function useSessionHistory({ onNavigate, navIntent }) {

  // 比赛记录状态
  const [sessions, setSessions] = useState([]);
  const [vehiclesList, setVehiclesList] = useState({});
  const [selectedSession, setSelectedSession] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // Changed from activeChart
  const [diagnosis, setDiagnosis] = useState(null);
  const [sessionTune, setSessionTune] = useState(null);
  const [channelsData, setChannelsData] = useState(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [advancedData, setAdvancedData] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [turnsData, setTurnsData] = useState(null);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
  const [zoomOnSelect, setZoomOnSelect] = useState(false);
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
  const [selectedLbTrackId, setSelectedLbTrackId] = useState(null);
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
        vehicleName: (vehiclesList[entry.vehicleOrdinal]?.name || entry.vehicleName),
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
        item.vehicleName = (vehiclesList[entry.vehicleOrdinal]?.name || entry.vehicleName);
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
    // trackFilter 可能是 trackId 或 trackName，两者都要支持
    const matchTrack = !trackFilter || (s.trackId === trackFilter) || (s.trackName || '未知赛道') === trackFilter
    return matchSearch && matchTrack
  });

  
  useEffect(() => {
    Promise.all([api.vehicles.list(), api.vehicles.getCatalog()])
      .then(([received, catalog]) => {
        const directory = Object.fromEntries((catalog || []).map(vehicle => [String(vehicle.ordinal), vehicle]));
        setVehiclesList({ ...directory, ...(received || {}) });
      })
      .catch(console.error);
  }, []);

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
        const allSubTabs = ['overview', 'professional_review', 'ai_coach'];
        const curIdx = allSubTabs.indexOf(activeTab);
        if (e.key === 'ArrowUp' && curIdx > 0) {
          setActiveTab(allSubTabs[curIdx - 1]);
        } else if (e.key === 'ArrowDown' && curIdx < allSubTabs.length - 1) {
          setActiveTab(allSubTabs[curIdx + 1]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [myFilteredSessions, selectedSession, activeTab, detailLoaded]);

  // Round 5: 批量删除
  const batchDelete = async () => {
    try {
      const ids = Array.from(selectedSessionIds);
      await Promise.all(ids.map(id => api.sessions.delete(id)));
      setSessions(prev => prev.filter(s => !selectedSessionIds.has(s.id)));
      if (selectedSessionIds.has(selectedSession)) {
        setSelectedSession(null);
        setAnalysis(null);
        setSessionDetail(null);
        setDiagnosis(null);
        setActiveTab('overview');
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
      const data = await api.sessions.list();
      setSessions(data);
    } catch (e) {
      toast('加载比赛记录失败', 'error');
    }
  };

  const loadTunes = async () => {
    try {
      const data = await api.tunes.list();
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
      await api.sessions.delete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (selectedSession === id) {
        setSelectedSession(null);
        setAnalysis(null);
        setSessionDetail(null);
        setDiagnosis(null);
        setActiveTab('overview');
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
      const [analysisData, diagnosisData] = await Promise.all([
        api.analysis.getOverview(sessionId),
        api.analysis.getDiagnosis(sessionId)
      ]);
      setAnalysis(analysisData);
      setDiagnosis(diagnosisData);
      setSelectedSession(sessionId);
      
      // 加载关联的调校方案
      if (diagnosisData?.tuneId) {
        try {
          const tuneData = await api.tunes.get(diagnosisData.tuneId);
          setSessionTune(tuneData);
        } catch (err) {
          setSessionTune(null);
        }
      } else {
        setSessionTune(null);
      }

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
      const detailData = await api.sessions.get(sessionId);
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
      const data = await api.analysis.getChannels(selectedSession, 4);
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
      const data = await api.analysis.getAdvanced(selectedSession, 10);
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
      const data = await api.analysis.getTurns(selectedSession);
      setTurnsData(data);
    } catch (e) {
      toast('加载弯道数据失败', 'error');
    } finally {
      setTurnsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSession) return;
    if (activeTab === 'overview') {
      loadTelemetryChannels();
      loadAdvancedAnalysis(); // 总览需要：理论最佳圈、圈速趋势、分段对比
      loadTurnsData();         // 总览需要：本场重点弯道
    } else if (activeTab === 'professional_review') {
      loadTurnsData();
      loadTelemetryChannels();
      loadAdvancedAnalysis();
      loadSessionDetail(selectedSession);
    }
  }, [activeTab, selectedSession]);

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
      api.analysis.getTurns(latestSession.id)
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
      const data = await api.leaderboard.getOverview();
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
      const data = await api.leaderboard.getTrend(trackId, vehicleOrdinal);
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
      const detail = await api.sessions.get(sessionId);
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

  return {
    sessions,
    setSessions,
    vehiclesList,
    setVehiclesList,
    selectedSession,
    setSelectedSession,
    analysis,
    setAnalysis,
    sessionDetail,
    setSessionDetail,
    loading,
    setLoading,
    activeTab,
    setActiveTab,
    diagnosis,
    setDiagnosis,
    channelsData,
    setChannelsData,
    channelsLoading,
    setChannelsLoading,
    advancedData,
    setAdvancedData,
    advancedLoading,
    setAdvancedLoading,
    turnsData,
    setTurnsData,
    turnsLoading,
    setTurnsLoading,
    activeTurnIdx,
    setActiveTurnIdx,
    zoomOnSelect,
    setZoomOnSelect,
    trackTurnsData,
    setTrackTurnsData,
    sessionSearchQuery,
    setSessionSearchQuery,
    trackFilter,
    setTrackFilter,
    tunes,
    setTunes,
    showDeleteConfirm,
    setShowDeleteConfirm,
    lbEntries,
    setLbEntries,
    lbLoading,
    setLbLoading,
    lbExpandedKeys,
    setLbExpandedKeys,
    lbTrendData,
    setLbTrendData,
    selectedLbTrackId,
    setSelectedLbTrackId,
    lbTrendLoading,
    setLbTrendLoading,
    lbLoaded,
    setLbLoaded,
    lbTrendCacheRef,
    lbTrendLoadingSetRef,
    detailLoaded,
    setDetailLoaded,
    loadedTabsRef,
    selectedSessionIds,
    setSelectedSessionIds,
    batchMode,
    setBatchMode,
    sessionPage,
    setSessionPage,
    uniqueTracks,
    groupedAchievements,
    ggData,
    sectorTimingData,
    batchDelete,
    batchExportCSV,
    toggleSessionSelect,
    loadSessions,
    loadTunes,
    deleteSession,
    loadAnalysis,
    loadSessionDetail,
    loadTelemetryChannels,
    loadAdvancedAnalysis,
    loadTurnsData,
    loadLeaderboard,
    loadLbTrend,
    clearLbTrendCache,
    clearAllLbTrendCache,
    toggleLbExpand,
    lbFormatTime,
    getVehicleClass,
    downloadBlob,
    exportCSV,
    exportEnhancedCSV,
    exportPDFReport,
    exportReport,
    formatTime,
    formatDate,
    getDiagnosisStyle,
    paginatedSessions,
    worst3,
    SESSION_PAGE_SIZE,
    myFilteredSessions,
    totalPages,
    sessionTune
  };
}
