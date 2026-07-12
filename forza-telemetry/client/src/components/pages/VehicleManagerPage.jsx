import React, { useState, useEffect, useMemo } from 'react';

const CLASS_LABELS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];

// ============================================================
// Toast 通知组件
// ============================================================
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'rgba(35, 134, 54, 0.95)'
    : type === 'error' ? 'rgba(218, 54, 51, 0.95)'
    : 'rgba(56, 139, 253, 0.95)';

  return (
    <div style={{
      position: 'fixed', top: 70, right: 20, zIndex: 9999,
      background: bgColor, color: '#fff',
      padding: '8px 16px', borderRadius: 6,
      fontSize: 12, fontWeight: 600,
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      animation: 'toastSlideIn 0.3s ease-out'
    }}>
      {message}
      <span onClick={onClose} style={{ marginLeft: 10, cursor: 'pointer', opacity: 0.7 }}>&times;</span>
    </div>
  );
}

// ============================================================
// 内联确认组件
// ============================================================
function InlineConfirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0,
      background: '#1c2128', border: '1px solid #da3633',
      borderRadius: 4, padding: '6px 8px', zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      minWidth: 120
    }}>
      <div style={{ fontSize: 10, color: '#f85149', fontWeight: 600 }}>{message}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={onConfirm} style={{
          flex: 1, padding: '3px 8px', fontSize: 9,
          background: '#da3633', color: '#fff', border: 'none',
          borderRadius: 3, cursor: 'pointer', fontWeight: 600
        }}>确定</button>
        <button onClick={onCancel} style={{
          flex: 1, padding: '3px 8px', fontSize: 9,
          background: '#30363d', color: '#c9d1d9',
          border: '1px solid #484f58', borderRadius: 3, cursor: 'pointer'
        }}>取消</button>
      </div>
    </div>
  );
}

export function VehicleManagerPage({ onNavigate, socket }) {
  const [vehicles, setVehicles] = useState({});
  const [sessions, setSessions] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    ordinal: '',
    name: '',
    class: 3,
    pi: '',
    drivetrain: 'AWD'
  });

  // Round 6: 搜索和排序
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('raceCount');
  const [toast, setToast] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Round 7: 展开的车辆卡片
  const [expandedCard, setExpandedCard] = useState(null);
  const [loading, setLoading] = useState(true);

  // Round 3: 车辆对比模式
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState([]);

  const SORT_OPTIONS = [
    { value: 'raceCount', label: '比赛次数' },
    { value: 'name', label: '名称' },
    { value: 'pi', label: 'PI' },
    { value: 'lastUsed', label: '最近使用' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = () => { loadVehicles(); };
    socket.on('vehicleDetected', handler);
    return () => { socket.off('vehicleDetected', handler); };
  }, [socket]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadVehicles(), loadSessions()]);
    setLoading(false);
  };

  const loadVehicles = async () => {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      setVehicles(data);
    } catch (e) {
      showToast('加载车辆失败', 'error');
    }
  };

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      showToast('加载比赛失败', 'error');
    }
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const saveVehicle = async () => {
    if (!formData.ordinal || !formData.name) {
      showToast('请输入车辆ID和名称', 'error');
      return;
    }
    try {
      await fetch('/api/vehicles/' + formData.ordinal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordinal: parseInt(formData.ordinal),
          name: formData.name,
          class: parseInt(formData.class),
          pi: parseInt(formData.pi) || 0,
          drivetrain: formData.drivetrain
        })
      });
      loadVehicles();
      setShowAddModal(false);
      setEditingVehicle(null);
      setFormData({ ordinal: '', name: '', class: 3, pi: '', drivetrain: 'AWD' });
      showToast(editingVehicle ? '车辆已更新' : '车辆已添加', 'success');
    } catch (e) {
      showToast('保存失败', 'error');
    }
  };

  const deleteVehicle = async (id) => {
    try {
      await fetch('/api/vehicles/' + id, { method: 'DELETE' });
      loadVehicles();
      setDeleteConfirmId(null);
      showToast('车辆已删除', 'success');
    } catch (e) {
      showToast('删除失败', 'error');
    }
  };

  const startEdit = (id) => {
    const v = vehicles[id];
    if (!v) return;
    setFormData({
      ordinal: id,
      name: v.name || '',
      class: v.class || 3,
      pi: v.pi || '',
      drivetrain: v.drivetrain || 'AWD'
    });
    setEditingVehicle(id);
    setShowAddModal(true);
  };

  // Round 3: 按 ordinal 聚合 session 统计（增加 avgLap 和 trackList）
  const statsByOrdinal = useMemo(() => {
    const stats = {};
    sessions.forEach(s => {
      if (!s.vehicle || !s.vehicle.ordinal) return;
      const ord = String(s.vehicle.ordinal);
      if (!stats[ord]) {
        stats[ord] = { count: 0, bestLap: 0, avgLap: 0, lastUsed: 0, tracks: new Set(), trackList: [], recentSessions: [], totalLapTime: 0, totalLapCount: 0 };
      }
      const st = stats[ord];
      st.count++;
      if (s.laps && s.laps.best > 0 && (st.bestLap === 0 || s.laps.best < st.bestLap)) {
        st.bestLap = s.laps.best;
      }
      // Round 3: 统计平均圈速
      if (s.laps && s.laps.total && s.laps.total > 0) {
        st.totalLapCount += s.laps.total;
      }
      const t = new Date(s.savedAt || 0).getTime();
      if (t > st.lastUsed) st.lastUsed = t;
      if (s.trackName) {
        st.tracks.add(s.trackName);
        if (!st.trackList.includes(s.trackName)) {
          st.trackList.push(s.trackName);
        }
      }
      st.recentSessions.push(s);
    });
    // Round 3: 计算平均圈速
    Object.values(stats).forEach(st => {
      if (st.totalLapCount > 0 && st.bestLap > 0) {
        // 使用最近5场比赛的加权平均作为近似
        const recentWithLaps = st.recentSessions.filter(s => s.laps && s.laps.best > 0);
        if (recentWithLaps.length > 0) {
          const sum = recentWithLaps.reduce((acc, s) => acc + s.laps.best, 0);
          st.avgLap = sum / recentWithLaps.length;
        }
      }
      // 按 savedAt 排序获取最近 5 场
      st.recentSessions.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      st.recentSessions = st.recentSessions.slice(0, 5);
    });
    return stats;
  }, [sessions]);

  const vehicleCards = useMemo(() => {
    const allOrdinals = new Set([...Object.keys(vehicles), ...Object.keys(statsByOrdinal)]);
    return Array.from(allOrdinals).map(ord => {
      const v = vehicles[ord];
      const stat = statsByOrdinal[ord] || { count: 0, bestLap: 0, avgLap: 0, lastUsed: 0, trackCount: 0, trackList: [], tracks: new Set(), recentSessions: [] };
      return {
        ord,
        name: v ? v.name : 'Car #' + ord,
        class: v ? v.class : null,
        pi: v ? v.pi : null,
        drivetrain: v ? v.drivetrain : null,
        isAuto: !v,
        stat: {
          count: stat.count,
          bestLap: stat.bestLap,
          avgLap: stat.avgLap || 0,
          lastUsed: stat.lastUsed,
          trackCount: stat.tracks.size,
          trackList: stat.trackList || [],
          recentSessions: stat.recentSessions || []
        }
      };
    });
  }, [vehicles, statsByOrdinal]);

  // Round 6: 搜索过滤
  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vehicleCards;
    return vehicleCards.filter(card =>
      card.name.toLowerCase().includes(q) ||
      String(card.ord).includes(q)
    );
  }, [vehicleCards, searchQuery]);

  // Round 6: 排序
  const sortedCards = useMemo(() => {
    const sorted = [...filteredCards];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, 'zh-CN');
        case 'pi':
          return (b.pi || 0) - (a.pi || 0);
        case 'lastUsed':
          return (b.stat.lastUsed || 0) - (a.stat.lastUsed || 0);
        case 'raceCount':
        default:
          return b.stat.count - a.stat.count;
      }
    });
    return sorted;
  }, [filteredCards, sortBy]);

  // Round 3: 车辆对比相关
  const toggleCompareMode = () => {
    setCompareMode(prev => !prev);
    setCompareSelected([]);
  };

  const toggleSelectForCompare = (ord) => {
    setCompareSelected(prev => {
      if (prev.includes(ord)) {
        return prev.filter(id => id !== ord);
      }
      if (prev.length >= 2) {
        return [prev[1], ord];
      }
      return [...prev, ord];
    });
  };

  // Round 3: 获取对比数据
  const compareData = useMemo(() => {
    if (compareSelected.length !== 2) return null;
    const [ordA, ordB] = compareSelected;
    const cardA = vehicleCards.find(c => c.ord === ordA);
    const cardB = vehicleCards.find(c => c.ord === ordB);
    if (!cardA || !cardB) return null;

    // 找到两辆车都跑过的赛道
    const tracksA = new Set(cardA.stat.trackList);
    const tracksB = new Set(cardB.stat.trackList);
    const commonTracks = [...tracksA].filter(t => tracksB.has(t));

    // 统计各自在共同赛道的表现
    const trackPerformance = {};
    commonTracks.forEach(track => {
      const sessionsA = sessions.filter(s => s.vehicle?.ordinal === parseInt(ordA) && s.trackName === track && s.laps?.best > 0);
      const sessionsB = sessions.filter(s => s.vehicle?.ordinal === parseInt(ordB) && s.trackName === track && s.laps?.best > 0);
      const bestA = sessionsA.length > 0 ? Math.min(...sessionsA.map(s => s.laps.best)) : 0;
      const bestB = sessionsB.length > 0 ? Math.min(...sessionsB.map(s => s.laps.best)) : 0;
      trackPerformance[track] = { bestA, bestB };
    });

    return {
      cardA,
      cardB,
      commonTracks,
      trackPerformance,
      allTracksA: cardA.stat.trackList,
      allTracksB: cardB.stat.trackList
    };
  }, [compareSelected, vehicleCards, sessions]);

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toFixed(3).padStart(6, '0');
  };

  const formatRelative = (ts) => {
    if (!ts) return '从未使用';
    const diff = Date.now() - ts;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return days + ' 天前';
    if (days < 30) return Math.floor(days / 7) + ' 周前';
    return Math.floor(days / 30) + ' 月前';
  };

  return (
    <div style={{ padding: 8, height: 'calc(100vh - 60px)', overflow: 'auto', background: '#0d1117' }}>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 6px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>车辆管理</h2>
          <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>
            {vehicleCards.length} 辆车 / {sessions.length} 场比赛
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Round 3: 车辆对比按钮 */}
          <button
            onClick={toggleCompareMode}
            style={compareMode
              ? { ...btnSmallStyle, background: '#58a6ff', color: '#fff', borderColor: '#58a6ff' }
              : btnSmallStyle
            }
          >
            {compareMode ? '退出对比' : '对比'}
          </button>
          <button
            onClick={() => {
              setFormData({ ordinal: '', name: '', class: 3, pi: '', drivetrain: 'AWD' });
              setEditingVehicle(null);
              setShowAddModal(true);
            }}
            style={{ ...btnPrimaryStyle, padding: '4px 12px', fontSize: 11 }}
          >
            + 添加
          </button>
        </div>
      </div>

      {/* Round 6: 搜索和排序 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, padding: '0 6px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#484f58' }}>
            &#128269;
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索车辆名称 / ID..."
            style={{
              width: '100%', padding: '5px 8px 5px 24px',
              background: '#161b22', border: '1px solid #21262d',
              borderRadius: 4, color: '#c9d1d9', fontSize: 11, outline: 'none'
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '5px 8px', background: '#161b22',
            border: '1px solid #21262d', borderRadius: 4,
            color: '#c9d1d9', fontSize: 10, cursor: 'pointer'
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>排序: {opt.label}</option>
          ))}
        </select>
      </div>

      {/* Round 3: 对比模式提示栏 */}
      {compareMode && (
        <div style={{
          background: compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.15)' : 'rgba(210, 153, 34, 0.12)',
          border: `1px solid ${compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.4)' : 'rgba(210, 153, 34, 0.35)'}`,
          borderRadius: 6, padding: '0 6px', marginBottom: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: 11, color: '#c9d1d9', padding: '8px 0' }}>
            <span style={{ color: '#8b949e' }}>已选择: </span>
            <span style={{ fontWeight: 700, color: compareSelected.length === 2 ? '#3fb950' : '#d29922' }}>
              {compareSelected.length}/2
            </span>
            {compareSelected.length === 2 && (
              <span style={{ color: '#3fb950', marginLeft: 8 }}>点击卡片选择车辆进行对比</span>
            )}
          </div>
          {compareSelected.length > 0 && (
            <button onClick={() => setCompareSelected([])} style={{ ...btnSmallStyle, fontSize: 9, padding: '2px 8px' }}>
              清除选择
            </button>
          )}
        </div>
      )}

      {/* Round 3: 车辆对比结果面板 */}
      {compareMode && compareData && (
        <div style={{
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: 8, padding: 14, marginBottom: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>车辆对比</h3>
          </div>

          {/* 基础信息对比 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#8b949e', fontSize: 9 }}>指标</div>
            <div style={{ fontWeight: 700, color: '#58a6ff', textAlign: 'center' }}>{compareData.cardA.name}</div>
            <div style={{ fontWeight: 700, color: '#d29922', textAlign: 'center' }}>{compareData.cardB.name}</div>

            <div style={{ color: '#8b949e' }}>PI</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{compareData.cardA.pi || '-'}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>{compareData.cardB.pi || '-'}</div>

            <div style={{ color: '#8b949e' }}>驱动</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardA.drivetrain || '-'}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardB.drivetrain || '-'}</div>

            <div style={{ color: '#8b949e' }}>等级</div>
            <div style={{ textAlign: 'center' }}>{compareData.cardA.class !== null ? CLASS_LABELS[compareData.cardA.class] : '-'}</div>
            <div style={{ textAlign: 'center' }}>{compareData.cardB.class !== null ? CLASS_LABELS[compareData.cardB.class] : '-'}</div>

            <div style={{ color: '#8b949e' }}>比赛次数</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardA.stat.count}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardB.stat.count}</div>

            <div style={{ color: '#8b949e' }}>最佳圈速</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>{formatTime(compareData.cardA.stat.bestLap)}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>{formatTime(compareData.cardB.stat.bestLap)}</div>

            <div style={{ color: '#8b949e' }}>平均圈速</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{formatTime(compareData.cardA.stat.avgLap)}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{formatTime(compareData.cardB.stat.avgLap)}</div>

            <div style={{ color: '#8b949e' }}>赛道数</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardA.stat.trackCount}</div>
            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>{compareData.cardB.stat.trackCount}</div>
          </div>

          {/* 共同赛道圈速对比 */}
          {compareData.commonTracks.length > 0 && (
            <div style={{ borderTop: '1px solid #21262d', paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', marginBottom: 6 }}>
                共同赛道圈速对比
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 4, fontSize: 9 }}>
                <div style={{ fontWeight: 600, color: '#8b949e' }}>赛道</div>
                <div style={{ fontWeight: 600, color: '#58a6ff', textAlign: 'center' }}>{compareData.cardA.name}</div>
                <div style={{ fontWeight: 600, color: '#d29922', textAlign: 'center' }}>{compareData.cardB.name}</div>
                {compareData.commonTracks.map(track => {
                  const tp = compareData.trackPerformance[track];
                  const aWin = tp.bestA > 0 && tp.bestB > 0 && tp.bestA < tp.bestB;
                  const bWin = tp.bestA > 0 && tp.bestB > 0 && tp.bestB < tp.bestA;
                  return (
                    <React.Fragment key={track}>
                      <div style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track}</div>
                      <div style={{
                        textAlign: 'center', fontFamily: 'monospace',
                        color: aWin ? '#3fb950' : (tp.bestA > 0 ? '#c9d1d9' : '#484f58'),
                        fontWeight: aWin ? 700 : 400,
                        background: aWin ? 'rgba(63, 185, 80, 0.1)' : 'transparent',
                        borderRadius: 3
                      }}>{tp.bestA > 0 ? formatTime(tp.bestA) : '-'}</div>
                      <div style={{
                        textAlign: 'center', fontFamily: 'monospace',
                        color: bWin ? '#3fb950' : (tp.bestB > 0 ? '#c9d1d9' : '#484f58'),
                        fontWeight: bWin ? 700 : 400,
                        background: bWin ? 'rgba(63, 185, 80, 0.1)' : 'transparent',
                        borderRadius: 3
                      }}>{tp.bestB > 0 ? formatTime(tp.bestB) : '-'}</div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* 各自独占赛道 */}
          {(compareData.allTracksA.length > 0 || compareData.allTracksB.length > 0) && (
            <div style={{ borderTop: '1px solid #21262d', paddingTop: 10, marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {compareData.allTracksA.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#58a6ff', marginBottom: 4 }}>
                    {compareData.cardA.name} 独占赛道
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {compareData.allTracksA.filter(t => !compareData.commonTracks.includes(t)).map(t => (
                      <span key={t} style={{ fontSize: 8, padding: '1px 5px', background: 'rgba(88, 166, 255, 0.1)', color: '#58a6ff', borderRadius: 3 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {compareData.allTracksB.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: '#d29922', marginBottom: 4 }}>
                    {compareData.cardB.name} 独占赛道
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {compareData.allTracksB.filter(t => !compareData.commonTracks.includes(t)).map(t => (
                      <span key={t} style={{ fontSize: 8, padding: '1px 5px', background: 'rgba(210, 153, 34, 0.1)', color: '#d29922', borderRadius: 3 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Round 7: 加载状态 */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#484f58', fontSize: 12 }}>
          <div style={{
            width: 24, height: 24, border: '2px solid #21262d',
            borderTopColor: '#58a6ff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', marginRight: 8
          }} />
          加载中...
        </div>
      ) : sortedCards.length === 0 ? (
        <EmptyState icon="&#x1F697;" title="暂无车辆数据" description="开始比赛后会自动识别车辆，或点击添加车辆手动创建。" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
          {sortedCards.map(card => (
            <div key={card.ord} style={{
              background: '#161b22',
              border: compareMode
                ? `2px solid ${compareSelected.includes(card.ord) ? '#58a6ff' : (compareSelected.length < 2 ? 'rgba(88, 166, 255, 0.2)' : '#21262d')}`
                : (card.isAuto ? '1px dashed #21262d' : '1px solid #21262d'),
              borderRadius: 6, padding: 8, transition: 'all 0.2s', position: 'relative',
              cursor: compareMode ? 'pointer' : 'default'
            }}
            onClick={compareMode ? () => toggleSelectForCompare(card.ord) : undefined}
            >
              {/* Round 3: 对比模式选中指示 */}
              {compareMode && compareSelected.includes(card.ord) && (
                <div style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#58a6ff', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, zIndex: 2
                }}>
                  {compareSelected.indexOf(card.ord) + 1}
                </div>
              )}

              {/* Round 7: 未配置标签可点击打开编辑 */}
              {card.isAuto && (
                <div
                  onClick={(e) => { e.stopPropagation(); startEdit(card.ord); }}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    fontSize: 8, padding: '1px 6px', borderRadius: 2,
                    background: '#d29922', color: '#000', fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  未配置
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div
                  style={{ flex: 1, minWidth: 0, paddingRight: card.isAuto ? 40 : 0, cursor: 'pointer' }}
                  onClick={(e) => { if (!compareMode) { e.stopPropagation(); setExpandedCard(expandedCard === card.ord ? null : card.ord); } }}
                  title="点击展开最近比赛"
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.name}
                  </div>
                </div>
                {card.class !== null && (
                  <div style={{
                    fontSize: 13, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
                    background: card.class >= 4 ? '#d29922' : '#0d1117',
                    color: card.class >= 4 ? '#000' : '#c9d1d9',
                    fontFamily: 'monospace'
                  }}>
                    {CLASS_LABELS[card.class] || '?'}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10, marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 8, color: '#484f58' }}>PI</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#58a6ff', fontFamily: 'monospace' }}>{card.pi || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: '#484f58' }}>驱动</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9', fontFamily: 'monospace' }}>{card.drivetrain || '-'}</div>
                </div>
              </div>

              {/* Round 3: 统计信息 - 增加平均圈速 */}
              <div style={{ background: '#0d1117', borderRadius: 4, padding: 6, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 4 }}>
                <Stat label="比赛" value={card.stat.count} />
                <Stat label="赛道" value={card.stat.trackCount} />
                <Stat label="最佳" value={formatTime(card.stat.bestLap)} small />
                <Stat label="均速" value={formatTime(card.stat.avgLap)} small />
              </div>

              {/* Round 3: 赛道适配标签 */}
              {card.stat.trackList.length > 0 && (
                <div style={{ marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {card.stat.trackList.slice(0, 4).map((track, idx) => (
                    <span key={idx} style={{
                      fontSize: 7, padding: '1px 4px', borderRadius: 2,
                      background: '#0d1117', color: '#8b949e',
                      border: '1px solid #21262d'
                    }}>
                      {track.length > 8 ? track.slice(0, 8) + '...' : track}
                    </span>
                  ))}
                  {card.stat.trackList.length > 4 && (
                    <span style={{ fontSize: 7, color: '#484f58', padding: '1px 2px' }}>
                      +{card.stat.trackList.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Round 7: 展开显示最近5场session */}
              {expandedCard === card.ord && card.stat.recentSessions.length > 0 && (
                <div style={{ background: '#0d1117', borderRadius: 4, padding: 6, marginBottom: 4, fontSize: 9 }}>
                  <div style={{ color: '#484f58', fontWeight: 600, marginBottom: 4, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    最近比赛 ({card.stat.recentSessions.length})
                  </div>
                  {card.stat.recentSessions.map((s, idx) => (
                    <div key={idx} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '2px 0',
                      borderBottom: idx < card.stat.recentSessions.length - 1 ? '1px solid #161b22' : 'none'
                    }}>
                      <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                        {s.trackName || '未知赛道'}
                      </span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: 8, flexShrink: 0, marginLeft: 4 }}>
                        {formatTime(s.laps && s.laps.best ? s.laps.best : 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#484f58', borderTop: '1px solid #21262d', paddingTop: 4 }}>
                <span>{formatRelative(card.stat.lastUsed)}</span>
                {!card.isAuto && !compareMode && (
                  <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(card.ord); }} style={{ ...btnSmallStyle, fontSize: 9, padding: '2px 6px' }}>&#9998;</button>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(deleteConfirmId === card.ord ? null : card.ord); }}
                        style={{ ...btnDangerSmallStyle, fontSize: 9, padding: '2px 6px' }}
                      >&#10005;</button>
                      {deleteConfirmId === card.ord && (
                        <InlineConfirm
                          message="确定删除此车辆？"
                          onConfirm={() => deleteVehicle(card.ord)}
                          onCancel={() => setDeleteConfirmId(null)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑车辆弹窗 */}
      {showAddModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>{editingVehicle ? '编辑车辆' : '添加车辆'}</h2>
              <button onClick={() => { setShowAddModal(false); setEditingVehicle(null); }} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18 }}>&times;</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>车辆ID</label>
              <input
                value={formData.ordinal}
                onChange={e => setFormData({...formData, ordinal: e.target.value})}
                placeholder="输入车辆ID（数字）"
                style={inputStyle}
                disabled={!!editingVehicle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>车辆名称</label>
              <input
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="例如: Porsche 911 GT3 RS"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>等级</label>
                <select
                  value={formData.class}
                  onChange={e => setFormData({...formData, class: e.target.value})}
                  style={inputStyle}
                >
                  {CLASS_LABELS.map((cls, i) => (
                    <option key={i} value={i}>{cls}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>性能指数 PI</label>
                <input
                  value={formData.pi}
                  onChange={e => setFormData({...formData, pi: e.target.value})}
                  placeholder="100-999"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>驱动类型</label>
              <select
                value={formData.drivetrain}
                onChange={e => setFormData({...formData, drivetrain: e.target.value})}
                style={inputStyle}
              >
                <option value="FWD">前驱</option>
                <option value="RWD">后驱</option>
                <option value="AWD">四驱</option>
              </select>
            </div>

            <button onClick={saveVehicle} style={btnPrimaryStyle}>
              {editingVehicle ? '保存修改' : '添加车辆'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

function Stat({ label, value, small = false }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#8b949e', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: small ? 11 : 14, fontWeight: 700, fontFamily: 'monospace', color: '#c9d1d9' }}>{value}</div>
    </div>
  );
}

const btnPrimaryStyle = {
  padding: '8px 16px', background: '#238636', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
};

const btnSmallStyle = {
  padding: '4px 10px', background: '#21262d', color: '#c9d1d9',
  border: '1px solid #30363d', borderRadius: 4, cursor: 'pointer', fontSize: 10
};

const btnDangerSmallStyle = {
  padding: '4px 10px', background: '#da3633', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10
};

const inputStyle = {
  width: '100%', padding: 8, background: '#0d1117',
  border: '1px solid #30363d', borderRadius: 6, color: '#c9d1d9', fontSize: 11
};

const labelStyle = {
  display: 'block', fontSize: 10, color: '#8b949e',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.8)', zIndex: 1000,
  display: 'flex', justifyContent: 'center', alignItems: 'center'
};

const modalContentStyle = {
  background: '#161b22', borderRadius: 10, padding: 20,
  maxWidth: 500, width: '90%', border: '1px solid #30363d'
};
