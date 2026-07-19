import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { toast } from '../shared/Toast';
import { InlineConfirm } from '../shared/InlineConfirm';

const CLASS_LABELS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
const MANUFACTURER_ALIASES = {
  'Alfa Romeo': '阿尔法罗密欧', Aston: '阿斯顿马丁', Audi: '奥迪', Bentley: '宾利', BMW: '宝马',
  Chevrolet: '雪佛兰', Dodge: '道奇', Ferrari: '法拉利', Ford: '福特', Honda: '本田',
  Hyundai: '现代', Jaguar: '捷豹', Koenigsegg: '科尼赛克', Lamborghini: '兰博基尼', Lexus: '雷克萨斯',
  Maserati: '玛莎拉蒂', Mazda: '马自达', McLaren: '迈凯伦', Mercedes: '梅赛德斯', Mitsubishi: '三菱',
  Nissan: '日产', Porsche: '保时捷', Subaru: '斯巴鲁', Toyota: '丰田', Volkswagen: '大众', Volvo: '沃尔沃'
};

function getManufacturer(name) {
  const withoutYear = String(name || '').replace(/^\d{4}\s+/, '').trim();
  if (withoutYear.startsWith('Alfa Romeo ')) return 'Alfa Romeo';
  if (withoutYear.startsWith('Mercedes-Benz ')) return 'Mercedes-Benz';
  return withoutYear.split(/\s+/)[0] || '其他';
}

function getManufacturerSearchText(manufacturer) {
  return `${manufacturer} ${MANUFACTURER_ALIASES[manufacturer] || ''}`.toLowerCase();
}

function getTunePi(tune) {
  if (tune.totalPi !== null && tune.totalPi !== '' && Number.isFinite(Number(tune.totalPi))) return Number(tune.totalPi);
  if (tune.piUpperEstimate !== null && tune.piUpperEstimate !== '' && Number.isFinite(Number(tune.piUpperEstimate))) return Number(tune.piUpperEstimate);
  return null;
}

export function VehicleManagerPage({ onNavigate, navIntent, socket }) {
  const [vehicles, setVehicles] = useState({});
  const [catalog, setCatalog] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [tunesList, setTunesList] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState({
    ordinal: '',
    name: '',
    class: 3,
    pi: '',
    drivetrain: 'AWD'
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('raceCount');
  const [vehicleTab, setVehicleTab] = useState('received');
  const [expandedManufacturers, setExpandedManufacturers] = useState({});
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [expandedCard, setExpandedCard] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const loadTunes = async () => {
    try {
      const data = await api.tunes.list();
      setTunesList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('加载调校方案失败', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadVehicles(), loadCatalog(), loadSessions(), loadTunes()]);
    setLoading(false);
  };

  const loadVehicles = async () => {
    try {
      const data = await api.vehicles.list();
      setVehicles(data || {});
    } catch (e) {
      toast('加载车辆失败', 'error');
    }
  };

  const loadCatalog = async () => {
    try {
      const data = await api.vehicles.getCatalog();
      setCatalog(Array.isArray(data) ? data : []);
    } catch (e) {
      toast('加载游戏车辆目录失败', 'error');
    }
  };

  const loadSessions = async () => {
    try {
      const data = await api.sessions.list();
      setSessions(data || []);
    } catch (e) {
      toast('加载比赛失败', 'error');
    }
  };

  const saveVehicle = async () => {
    if (!formData.ordinal || !formData.name) {
      toast('请输入车辆ID和名称', 'error');
      return;
    }
    try {
      await api.vehicles.save(formData.ordinal, {
        ordinal: parseInt(formData.ordinal),
        name: formData.name,
        class: parseInt(formData.class),
        originalPi: parseInt(formData.pi) || null,
        drivetrain: formData.drivetrain
      });
      loadVehicles();
      setShowAddModal(false);
      setEditingVehicle(null);
      setFormData({ ordinal: '', name: '', class: 3, pi: '', drivetrain: 'AWD' });
      toast(editingVehicle ? '车辆已更新' : '车辆已添加', 'success');
    } catch (e) {
      toast(e.message || '保存失败', 'error');
    }
  };

  const deleteVehicle = async (id) => {
    try {
      await api.vehicles.delete(id);
      loadVehicles();
      setDeleteConfirmId(null);
      toast('车辆已删除', 'success');
    } catch (e) {
      toast(e.message || '删除失败', 'error');
    }
  };

  const toggleFavorite = async (card) => {
    const current = vehicles[card.ord] || {};
    try {
      await api.vehicles.save(card.ord, {
        ...current,
        ordinal: Number(card.ord),
        name: current.name || card.name,
        favorite: !card.favorite
      });
      await loadVehicles();
    } catch (e) {
      toast(e.message || '收藏状态保存失败', 'error');
    }
  };

  const startEdit = (id) => {
    const v = vehicles[id];
    if (!v) return;
    const officialBasePi = catalog.find(item => String(item.ordinal) === String(id))?.basePi;
    setFormData({
      ordinal: id,
      name: v.name || '',
      class: v.class || 3,
      pi: Number.isFinite(Number(officialBasePi)) && Number(officialBasePi) > 0
        ? Number(officialBasePi)
        : (Number(v.originalPi) > 0 ? Number(v.originalPi) : ''),
      drivetrain: v.drivetrain || 'AWD'
    });
    setEditingVehicle(id);
    setShowAddModal(true);
  };

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
    Object.values(stats).forEach(st => {
      if (st.totalLapCount > 0 && st.bestLap > 0) {
        const recentWithLaps = st.recentSessions.filter(s => s.laps && s.laps.best > 0);
        if (recentWithLaps.length > 0) {
          const sum = recentWithLaps.reduce((acc, s) => acc + s.laps.best, 0);
          st.avgLap = sum / recentWithLaps.length;
        }
      }
      st.recentSessions.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      st.recentSessions = st.recentSessions.slice(0, 5);
    });
    return stats;
  }, [sessions]);

  const vehicleCards = useMemo(() => {
    const catalogByOrdinal = new Map(catalog.map(item => [String(item.ordinal), item]));
    const allOrdinals = new Set([...catalogByOrdinal.keys(), ...Object.keys(vehicles), ...Object.keys(statsByOrdinal)]);
    const cards = Array.from(allOrdinals).map(ord => {
      const v = vehicles[ord];
      const catalogVehicle = catalogByOrdinal.get(String(ord));
      const savedName = v?.name && !v.name.startsWith('Car #') ? v.name : null;
      const stat = statsByOrdinal[ord] || { count: 0, bestLap: 0, avgLap: 0, lastUsed: 0, trackCount: 0, trackList: [], tracks: new Set(), recentSessions: [] };
      const officialBasePi = Number(catalogVehicle?.basePi) > 0
        ? Number(catalogVehicle.basePi)
        : (Number(v?.originalPi) > 0 ? Number(v.originalPi) : null);
      const cardTunes = tunesList
        .filter(tune => String(tune.vehicleId || tune.carOrdinal) === String(ord))
        .map(tune => ({ ...tune, calculatedPi: getTunePi(tune) }))
        .sort((a, b) => (b.calculatedPi ?? -1) - (a.calculatedPi ?? -1));
      const knownTunePis = cardTunes.map(tune => tune.calculatedPi).filter(Number.isFinite);
      return {
        ord,
        name: savedName || catalogVehicle?.name || v?.name || 'Car #' + ord,
        manufacturer: catalogVehicle?.manufacturer || getManufacturer(savedName || v?.name),
        class: v ? v.class : null,
        pi: Number.isFinite(officialBasePi) && officialBasePi > 0 ? officialBasePi : null,
        drivetrain: v ? v.drivetrain : null,
        isAuto: !v,
        isReceived: Boolean(v?.autoDetected || stat.count > 0),
        favorite: Boolean(v?.favorite),
        tunes: cardTunes,
        tunePiSummary: knownTunePis.length ? `${Math.min(...knownTunePis)}-${Math.max(...knownTunePis)}` : (cardTunes.length ? 'PI 未知' : '暂无'),
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

    // 目录和运行时车辆可能给不同编号返回相同名称，尤其是手动保存过
    // 同名车辆时。车辆库展示按“车厂 + 规范化名称”去重，优先保留已接收、
    // 已收藏、比赛次数更多的记录，避免搜索结果出现重复车辆名称。
    const uniqueCards = new Map();
    const priority = card => (card.isReceived ? 1000000 : 0) + (card.favorite ? 10000 : 0) + card.stat.count;
    for (const card of cards) {
      const normalizedName = String(card.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const key = `${String(card.manufacturer || '其他').trim().toLowerCase()}|${normalizedName}`;
      const current = uniqueCards.get(key);
      if (!current || priority(card) > priority(current)) uniqueCards.set(key, card);
    }
    return Array.from(uniqueCards.values());
  }, [catalog, vehicles, statsByOrdinal, tunesList]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tabCards = vehicleCards.filter(card => {
      if (vehicleTab === 'received') return card.isReceived;
      if (vehicleTab === 'unreceived') return !card.isReceived;
      return card.favorite;
    });
    if (!q) return tabCards;
    return tabCards.filter(card =>
      card.name.toLowerCase().includes(q) ||
      String(card.ord).includes(q) ||
      getManufacturerSearchText(card.manufacturer).includes(q)
    );
  }, [vehicleCards, searchQuery, vehicleTab]);

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

  const groupedCards = useMemo(() => {
    const groups = new Map();
    sortedCards.forEach(card => {
      const manufacturer = card.manufacturer || '其他';
      if (!groups.has(manufacturer)) groups.set(manufacturer, []);
      groups.get(manufacturer).push(card);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
  }, [sortedCards]);

  const setAllManufacturersExpanded = (expanded) => {
    setExpandedManufacturers(Object.fromEntries(groupedCards.map(([manufacturer]) => [manufacturer, expanded])));
  };

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

  const compareData = useMemo(() => {
    if (compareSelected.length !== 2) return null;
    const [ordA, ordB] = compareSelected;
    const cardA = vehicleCards.find(c => c.ord === ordA);
    const cardB = vehicleCards.find(c => c.ord === ordB);
    if (!cardA || !cardB) return null;

    const tracksA = new Set(cardA.stat.trackList);
    const tracksB = new Set(cardB.stat.trackList);
    const commonTracks = [...tracksA].filter(t => tracksB.has(t));

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
    <div className="vehicle-page">
      <header className="vehicle-header">
        <div className="vehicle-heading">
          <div>
            <p className="vehicle-eyebrow">车库</p>
            <h2>车辆管理</h2>
          </div>
          <div className="vehicle-summary" aria-label="车辆库统计">
            <div><strong>{vehicleCards.filter(card => card.isReceived).length}</strong><span>已接收</span></div>
            <div><strong>{catalog.length}</strong><span>游戏车辆</span></div>
            <div><strong>{tunesList.length}</strong><span>改装方案</span></div>
          </div>
        </div>
        <div className="vehicle-header-actions">
          <button
            onClick={toggleCompareMode}
            className={`btn-action-sm ${compareMode ? 'active' : ''}`}
          >
            {compareMode ? '退出对比' : '对比'}
          </button>
          <button
            onClick={() => {
              setFormData({ ordinal: '', name: '', class: 3, pi: '', drivetrain: 'AWD' });
              setEditingVehicle(null);
              setShowAddModal(true);
            }}
            className="btn-action-primary btn-action-header"
          >
            + 添加
          </button>
        </div>
      </header>

      <div className="vehicle-filter-tabs">
        {[
          { id: 'received', label: '已接收', count: vehicleCards.filter(card => card.isReceived).length },
          { id: 'unreceived', label: '未接收', count: vehicleCards.filter(card => !card.isReceived).length },
          { id: 'favorites', label: '收藏', count: vehicleCards.filter(card => card.favorite).length }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setVehicleTab(tab.id); setExpandedCard(null); }}
            style={{
              padding: '8px 12px', background: vehicleTab === tab.id ? 'rgba(88, 166, 255, 0.1)' : 'transparent', border: 'none',
              borderBottom: vehicleTab === tab.id ? '2px solid #58a6ff' : '2px solid transparent',
              color: vehicleTab === tab.id ? '#58a6ff' : '#8b949e', cursor: 'pointer', fontSize: 11,
              fontWeight: vehicleTab === tab.id ? 700 : 400
            }}
          >
            {tab.label} <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="vehicle-toolbar">
        <div style={{ flex: 1, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#484f58' }}>
            &#128269;
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索车辆、车厂或编号..."
            style={{
              width: '100%', padding: '8px 10px 8px 28px',
              background: '#0d1117', border: '1px solid #30363d',
              borderRadius: 5, color: '#c9d1d9', fontSize: 12, outline: 'none'
            }}
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '8px 10px', background: '#0d1117',
            border: '1px solid #30363d', borderRadius: 5,
            color: '#c9d1d9', fontSize: 11, cursor: 'pointer'
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>排序: {opt.label}</option>
          ))}
        </select>
      </div>

      <div className="vehicle-directory-meta">
        <span style={{ fontSize: 10, color: '#8b949e' }}>
          {searchQuery.trim() ? `找到 ${sortedCards.length} 辆车，分属 ${groupedCards.length} 个车厂` : `共 ${groupedCards.length} 个车厂`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setAllManufacturersExpanded(true)} className="btn-action-sm" style={{ padding: '2px 7px', fontSize: 9 }}>展开全部</button>
          <button onClick={() => setAllManufacturersExpanded(false)} className="btn-action-sm" style={{ padding: '2px 7px', fontSize: 9 }}>收起全部</button>
        </div>
      </div>

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
            <button onClick={() => setCompareSelected([])} className="btn-action-sm" style={{ fontSize: 9, padding: '2px 8px' }}>
              清除选择
            </button>
          )}
        </div>
      )}

      {compareMode && compareData && (
        <div style={{
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: 8, padding: 14, marginBottom: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>车辆对比</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#8b949e', fontSize: 9 }}>指标</div>
            <div style={{ fontWeight: 700, color: '#58a6ff', textAlign: 'center' }}>{compareData.cardA.name}</div>
            <div style={{ fontWeight: 700, color: '#d29922', textAlign: 'center' }}>{compareData.cardB.name}</div>

            <div style={{ color: '#8b949e' }}>官方原厂 PI</div>
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

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          加载中...
        </div>
      ) : sortedCards.length === 0 ? (
        <div className="empty-placeholder">
          {vehicleTab === 'favorites' ? '还没有收藏的车辆' : '没有符合条件的车辆'}
        </div>
      ) : (
        <div className="manufacturer-directory">
          {groupedCards.map(([manufacturer, cards]) => {
            const isExpanded = expandedManufacturers[manufacturer] ?? Boolean(searchQuery.trim());
            return (
              <section key={manufacturer} className="manufacturer-section">
                <button
                  onClick={() => setExpandedManufacturers(prev => ({ ...prev, [manufacturer]: !prev[manufacturer] }))}
                  aria-expanded={isExpanded}
                  className="manufacturer-section-btn"
                  style={{
                    background: isExpanded ? '#1a222d' : '#161b22'
                  }}
                >
                  <span style={{ width: 14, color: '#58a6ff', fontSize: 14 }}>{isExpanded ? '⌄' : '›'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{manufacturer}</span>
                  {MANUFACTURER_ALIASES[manufacturer] && <span style={{ color: '#8b949e', fontSize: 10 }}>{MANUFACTURER_ALIASES[manufacturer]}</span>}
                  <span style={{ marginLeft: 'auto', padding: '2px 7px', color: '#a9c7e8', background: 'rgba(88, 166, 255, 0.12)', borderRadius: 10, fontFamily: 'monospace', fontSize: 10 }}>{cards.length} 辆</span>
                </button>
                {isExpanded && (
                  <div className="vehicle-card-grid">
                    {cards.map(card => (
                      <div key={card.ord} style={{
                        background: '#161b22',
                        border: compareMode
                          ? `2px solid ${compareSelected.includes(card.ord) ? '#58a6ff' : (compareSelected.length < 2 ? 'rgba(88, 166, 255, 0.2)' : '#21262d')}`
                          : (card.isAuto ? '1px dashed #21262d' : '1px solid #21262d'),
                        cursor: compareMode ? 'pointer' : 'default'
                      }}
                      className="vehicle-card"
                      onClick={compareMode ? () => toggleSelectForCompare(card.ord) : undefined}
                      >
                        {compareMode && compareSelected.includes(card.ord) && (
                          <div className="compare-badge">
                            {compareSelected.indexOf(card.ord) + 1}
                          </div>
                        )}

                        {card.isAuto && (
                          <div
                            onClick={(e) => { e.stopPropagation(); startEdit(card.ord); }}
                            className="unconfigured-badge"
                          >
                            未配置
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div
                            style={{ flex: 1, minWidth: 0, paddingRight: card.isAuto ? 40 : 0, cursor: 'pointer' }}
                            onClick={(e) => { if (!compareMode) { e.stopPropagation(); setExpandedCard(expandedCard === card.ord ? null : card.ord); } }}
                            title="查看改装方案"
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

                        <div className="vehicle-build-summary">
                          <div><span>官方原厂 PI</span><strong>{card.pi || '-'}</strong></div>
                          <div><span>驱动</span><strong>{card.drivetrain || '-'}</strong></div>
                          <div>
                            <span>改装方案</span>
                            <strong>{card.tunePiSummary}</strong>
                          </div>
                        </div>

                        {card.tunes.length > 0 && (
                          <div className="vehicle-tune-preview">
                            {card.tunes.slice(0, 2).map(tune => (
                              <span key={tune.id}><b>{tune.calculatedPi ?? 'PI 未知'}</b> {tune.name || '未命名方案'}</span>
                            ))}
                            {card.tunes.length > 2 && <span>另有 {card.tunes.length - 2} 套</span>}
                          </div>
                        )}

                        {expandedCard === card.ord && (
                          <div className="vehicle-tune-list">
                            <div className="vehicle-tune-list-title">改装调校方案 <span>{card.tunes.length} 套</span></div>
                            {card.tunes.length === 0 ? (
                              <div className="vehicle-tune-empty">还没有改装方案，可从下方进入工坊新建。</div>
                            ) : card.tunes.map(tune => (
                              <div key={tune.id} className="vehicle-tune-row">
                                <div>
                                  <strong>{tune.name || '未命名方案'}</strong>
                                  <span>{(tune.tags || []).join(' · ') || '未添加标签'}</span>
                                </div>
                                <div className="vehicle-tune-pi">PI {tune.calculatedPi ?? '未知'}</div>
                                <button onClick={(e) => { e.stopPropagation(); onNavigate('tunes', { tuneId: tune.id, action: 'edit' }); }} className="btn-action-sm" style={{ padding: '3px 7px', fontSize: 9 }}>编辑</button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: '#484f58', borderTop: '1px solid #21262d', paddingTop: 4 }}>
                          <span>车辆编号 #{card.ord}</span>
                          {!compareMode && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFavorite(card); }}
                                className="btn-action-sm"
                                style={{
                                  width: 25, padding: '2px 0',
                                  color: card.favorite ? '#d29922' : '#8b949e',
                                  borderColor: card.favorite ? 'rgba(210, 153, 34, 0.55)' : '#30363d'
                                }}
                                title={card.favorite ? '取消收藏' : '收藏车辆'}
                                aria-label={card.favorite ? '取消收藏' : '收藏车辆'}
                              >
                                {card.favorite ? '★' : '☆'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigate('tunes', { vehicleId: card.ord, action: 'create' });
                                }}
                                className="btn-action-sm btn-action-workshop"
                                title="为此车辆新建改装与调校方案"
                              >
                                🔧 工坊
                              </button>
                              {!card.isAuto && (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); startEdit(card.ord); }} className="btn-action-sm" style={{ padding: '2px 6px' }}>&#9998;</button>
                                  <div style={{ position: 'relative' }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(deleteConfirmId === card.ord ? null : card.ord); }}
                                      className="btn-action-danger-sm"
                                      style={{ padding: '2px 6px' }}
                                    >&#10005;</button>
                                    {deleteConfirmId === card.ord && (
                                      <InlineConfirm
                                        message="确定删除此车辆？"
                                        onConfirm={() => deleteVehicle(card.ord)}
                                        onCancel={() => setDeleteConfirmId(null)}
                                      />
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>{editingVehicle ? '编辑车辆' : '添加车辆'}</h2>
              <button onClick={() => { setShowAddModal(false); setEditingVehicle(null); }} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18 }}>&times;</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="label-ctrl">车辆ID</label>
              <input
                value={formData.ordinal}
                onChange={e => setFormData({...formData, ordinal: e.target.value})}
                placeholder="输入车辆ID（数字）"
                className="input-ctrl"
                disabled={!!editingVehicle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="label-ctrl">车辆名称</label>
              <input
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="例如: Porsche 911 GT3 RS"
                className="input-ctrl"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label className="label-ctrl">等级</label>
                <select
                  value={formData.class}
                  onChange={e => setFormData({...formData, class: e.target.value})}
                  className="input-ctrl"
                >
                  {CLASS_LABELS.map((cls, i) => (
                    <option key={i} value={i}>{cls}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-ctrl">官方原厂 PI</label>
                <input
                  value={formData.pi}
                  onChange={e => setFormData({...formData, pi: e.target.value})}
                  placeholder="100-999"
                  className="input-ctrl"
                  disabled={Number(catalog.find(item => String(item.ordinal) === String(formData.ordinal))?.basePi) > 0}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="label-ctrl">驱动类型</label>
              <select
                value={formData.drivetrain}
                onChange={e => setFormData({...formData, drivetrain: e.target.value})}
                className="input-ctrl"
              >
                <option value="FWD">前驱</option>
                <option value="RWD">后驱</option>
                <option value="AWD">四驱</option>
              </select>
            </div>

            <button onClick={saveVehicle} className="btn-action-primary">
              {editingVehicle ? '保存修改' : '添加车辆'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .vehicle-page {
          min-height: 100%; padding: 16px; background: #0d1117; color: #c9d1d9;
        }
        .vehicle-header {
          display: flex; justify-content: space-between; align-items: center; gap: 16px;
          padding: 14px 16px; margin-bottom: 12px; background: #161b22;
          border: 1px solid #30363d; border-radius: 7px;
        }
        .vehicle-heading { display: flex; align-items: center; gap: 28px; min-width: 0; }
        .vehicle-heading h2 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: 0; }
        .vehicle-eyebrow { margin: 0 0 3px; color: #58a6ff; font-size: 10px; font-weight: 700; }
        .vehicle-summary { display: flex; border-left: 1px solid #30363d; }
        .vehicle-summary div { display: flex; flex-direction: column; min-width: 66px; padding: 0 14px; border-right: 1px solid #30363d; }
        .vehicle-summary strong { color: #e6edf3; font: 700 16px monospace; }
        .vehicle-summary span { margin-top: 3px; color: #8b949e; font-size: 9px; }
        .vehicle-header-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .vehicle-filter-tabs { display: flex; gap: 4px; margin-bottom: 12px; padding: 0 2px; border-bottom: 1px solid #30363d; }
        .vehicle-toolbar { display: flex; gap: 8px; margin-bottom: 7px; align-items: center; }
        .vehicle-directory-meta { display: flex; justify-content: space-between; align-items: center; margin: 0 2px 12px; min-height: 24px; }
        .manufacturer-directory { display: flex; flex-direction: column; gap: 8px; }
        .manufacturer-section > button:hover { border-color: #58a6ff !important; background: #1a222d !important; }
        .vehicle-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px; padding: 6px 2px 4px; }
        .vehicle-card { position: relative; border-radius: 6px; padding: 10px; transition: border-color 0.2s, background 0.2s; }
        .vehicle-card:hover { background: #1b222c !important; border-color: #3b5168 !important; }
        .vehicle-build-summary { display: grid; grid-template-columns: 0.85fr 0.75fr 1.4fr; gap: 1px; margin: 10px 0 7px; border: 1px solid #21262d; border-radius: 5px; overflow: hidden; background: #21262d; }
        .vehicle-build-summary > div { min-width: 0; padding: 7px 8px; background: #0d1117; }
        .vehicle-build-summary span { display: block; margin-bottom: 3px; color: #8b949e; font-size: 8px; }
        .vehicle-build-summary strong { display: block; overflow: hidden; color: #e6edf3; font: 700 12px monospace; text-overflow: ellipsis; white-space: nowrap; }
        .vehicle-build-summary > div:first-child strong { color: #79c0ff; }
        .vehicle-build-summary > div:last-child strong { color: #3fb950; }
        .vehicle-tune-preview { display: flex; flex-wrap: wrap; gap: 4px; min-height: 23px; margin-bottom: 7px; }
        .vehicle-tune-preview span { max-width: 100%; overflow: hidden; padding: 3px 5px; border: 1px solid #253649; border-radius: 3px; color: #a9c7e8; background: rgba(88, 166, 255, 0.07); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
        .vehicle-tune-preview b { color: #79c0ff; font-family: monospace; }
        .vehicle-tune-list { margin: 8px 0; padding: 8px; border: 1px solid #30363d; border-radius: 5px; background: #0d1117; }
        .vehicle-tune-list-title { display: flex; justify-content: space-between; margin-bottom: 6px; color: #c9d1d9; font-size: 10px; font-weight: 700; }
        .vehicle-tune-list-title span { color: #8b949e; font-family: monospace; font-weight: 400; }
        .vehicle-tune-empty { padding: 6px 0; color: #8b949e; font-size: 9px; text-align: center; }
        .vehicle-tune-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid #21262d; }
        .vehicle-tune-row strong, .vehicle-tune-row span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vehicle-tune-row strong { color: #e6edf3; font-size: 10px; }
        .vehicle-tune-row span { margin-top: 2px; color: #8b949e; font-size: 8px; }
        .vehicle-tune-pi { color: #3fb950; font: 700 10px monospace; white-space: nowrap; }

        .btn-action-primary {
          padding: 8px 16px; background: #238636; color: #fff;
          border: none; border-radius: 6px; cursor: pointer; fontSize: 12px; fontWeight: 600;
          display: inline-block; text-align: center;
        }
        .btn-action-primary:hover { background: #2ea043; }
        .btn-action-primary:disabled { background: #21262d; color: #8b949e; cursor: not-allowed; }
        .btn-action-header { padding: 6px 12px; fontSize: 11px; }

        .btn-action-sm {
          padding: 4px 10px; background: #21262d; color: #c9d1d9;
          border: 1px solid #30363d; border-radius: 4px; cursor: pointer; fontSize: 10px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .btn-action-sm:hover { border-color: #8b949e; color: #fff; }
        .btn-action-sm.active { background: #58a6ff !important; color: #fff !important; border-color: #58a6ff !important; }

        .btn-action-danger-sm {
          padding: 4px 10px; background: #da3633; color: #fff;
          border: none; border-radius: 4px; cursor: pointer; fontSize: 10px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .btn-action-danger-sm:hover { background: #f85149; }

        .btn-action-workshop {
          font-size: 9px; padding: 2px 6px; background: rgba(56, 139, 253, 0.1);
          borderColor: rgba(56, 139, 253, 0.3); color: #58a6ff;
        }
        .btn-action-workshop:hover { background: rgba(56, 139, 253, 0.2); }

        .input-ctrl {
          width: 100%; padding: 8px; background: #0d1117; box-sizing: border-box;
          border: 1px solid #30363d; borderRadius: 6px; color: #c9d1d9; fontSize: 11px;
          outline: none;
        }
        .input-ctrl:focus { border-color: #58a6ff; }
        .input-ctrl:disabled { background: #161b22; color: #8b949e; cursor: not-allowed; }

        .label-ctrl {
          display: block; fontSize: 10px; color: #8b949e;
          marginBottom: 4px; textTransform: uppercase; letterSpacing: 1px;
          font-weight: 600;
        }

        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: 'rgba(0,0,0,0.8)'; zIndex: 1000;
          display: flex; justifyContent: center; alignItems: center;
          backdrop-filter: blur(5px);
        }

        .modal-content {
          background: #161b22; borderRadius: 10px; padding: 20px;
          maxWidth: 500px; width: 90%; border: 1px solid #30363d;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }

        .manufacturer-section-btn {
          display: flex; width: 100%; align-items: center; gap: 10px; padding: 11px 12px;
          border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9;
          cursor: pointer; text-align: left; transition: border-color 0.2s, background-color 0.2s;
          outline: none;
        }

        .loading-container {
          display: flex; justify-content: center; alignItems: center; height: 60vh; color: #484f58; fontSize: 12px;
        }
        .loading-spinner {
          width: 24px; height: 24px; border: 2px solid #21262d;
          border-top-color: '#58a6ff'; borderRadius: 50%;
          animation: spin 0.8s linear infinite; marginRight: 8px;
        }

        .empty-placeholder {
          padding: 48px 16px; text-align: center; color: '#8b949e'; fontSize: 12px;
        }

        .compare-badge {
          position: absolute; top: 4px; left: 4px;
          width: 16px; height: 16px; borderRadius: 50%;
          background: #58a6ff; color: #fff;
          display: flex; alignItems: center; justifyContent: center;
          fontSize: 10px; fontWeight: 700; zIndex: 2;
        }

        .unconfigured-badge {
          position: absolute; top: 4px; right: 4px;
          fontSize: 8px; padding: 1px 6px; borderRadius: 2px;
          background: #d29922; color: #000; fontWeight: 600;
          cursor: pointer;
        }

        @media (max-width: 700px) {
          .vehicle-page { padding: 10px; }
          .vehicle-header, .vehicle-heading { align-items: flex-start; flex-direction: column; }
          .vehicle-header { padding: 12px; }
          .vehicle-heading { gap: 12px; }
          .vehicle-summary { width: 100%; border-top: 1px solid #30363d; border-left: 0; padding-top: 10px; }
          .vehicle-summary div { flex: 1; min-width: 0; padding: 0 10px; }
          .vehicle-toolbar { align-items: stretch; flex-wrap: wrap; }
          .vehicle-toolbar > div { min-width: 100%; }
          .vehicle-directory-meta { align-items: flex-start; gap: 8px; flex-direction: column; }
          .vehicle-build-summary { grid-template-columns: 1fr 1fr 1.2fr; }
        }
      `}</style>
    </div>
  );
}
