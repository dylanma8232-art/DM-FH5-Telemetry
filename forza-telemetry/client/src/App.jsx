import { useState, useEffect, Suspense, lazy } from 'react';
import { useSocket } from './hooks/useSocket';
import { useKeyboard } from './hooks/useKeyboard';
import { Header } from './components/Header';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { ToastContainer } from './components/shared/Toast';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

import { DashboardPage } from './components/pages/DashboardPage';
import { toast } from './components/shared/Toast';

const TrackManagerPage = lazy(() => import('./components/pages/TrackManagerPage').then(m => ({ default: m.TrackManagerPage })));
const VehicleManagerPage = lazy(() => import('./components/pages/VehicleManagerPage').then(m => ({ default: m.VehicleManagerPage })));
const SessionHistoryPage = lazy(() => import('./components/pages/SessionHistoryPage').then(m => ({ default: m.SessionHistoryPage })));
const TuneManagerPage = lazy(() => import('./components/pages/TuneManagerPage').then(m => ({ default: m.TuneManagerPage })));

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 300,
      color: 'var(--text-secondary)',
      fontSize: 12
    }}>
      加载中...
    </div>
  );
}

export default function App() {
  const { data, throttledData, connected, packetCount, packetsPerSecond, socket } = useSocket();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navIntent, setNavIntent] = useState(null);
  
  const displayData = throttledData || data;

  const tabs = [
    { id: 'dashboard', label: '仪表盘' },
    { id: 'tracks', label: '赛道管理' },
    { id: 'sessions', label: '比赛中心' },
    { id: 'vehicles', label: '车辆管理' },
    { id: 'tunes', label: '调校管理' }
  ];

  const navigateTo = (tabId, intent = null) => {
    // 赛道成绩已融合进比赛中心，兼容旧入口和赛道管理页跳转。
    if (tabId === 'leaderboard') {
      tabId = 'sessions';
      intent = { ...(intent || {}), _subTab: 'leaderboard' };
    }
    setActiveTab(tabId);
    setNavIntent(intent);
  };

  useKeyboard({
    '1': () => setActiveTab('dashboard'),
    '2': () => setActiveTab('tracks'),
    '3': () => setActiveTab('sessions'),
    '4': () => setActiveTab('vehicles'),
    '5': () => setActiveTab('tunes'),
    'ctrl+e': () => setShowSettings(true),
  });

  // 监听 vehicleDetected 事件，弹出 toast 通知
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      const name = data?.name || `Car #${data?.ordinal || '?'}`;
      toast(`检测到新车辆: ${name}`, 'success', 4000);
    };
    socket.on('vehicleDetected', handler);
    return () => { socket.off('vehicleDetected', handler); };
  }, [socket]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      overflow: 'hidden'
    }}>
      <Header
        connected={connected}
        packetCount={packetCount}
        packetsPerSecond={packetsPerSecond}
        isRaceOn={displayData?.isRaceOn}
        lapNumber={displayData?.lapNumber}
        racePosition={displayData?.racePosition}
        currentRaceTime={displayData?.currentRaceTime}
        onSettingsClick={() => setShowSettings(true)}
        socket={socket}
      />

      <div style={{
        display: 'flex',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        flexShrink: 0
      }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setNavIntent(null); }}
            style={{
              padding: '10px 18px',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </div>
        ))}
      </div>

      {!data && activeTab === 'dashboard' && (
        <div style={{
          padding: '8px 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          flexShrink: 0
        }}>
          <span style={{ color: 'var(--warning)' }}>
            {connected ? '已连接服务器，等待遥测数据...' : '未连接服务器'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            UDP端口: 9996 | 请确认游戏中已开启 Data Out
          </span>
        </div>
      )}

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: activeTab === 'dashboard' ? 'hidden' : 'auto'
      }}>
        <ErrorBoundary key={activeTab} name={tabs.find(t => t.id === activeTab)?.label || activeTab}>
          <Suspense fallback={<PageLoader />}>
            {activeTab === 'dashboard' && (
              <DashboardPage data={displayData} socket={socket} connected={connected} packetCount={packetCount} />
            )}
            {activeTab === 'tracks' && <TrackManagerPage onNavigate={navigateTo} />}
            {activeTab === 'sessions' && <SessionHistoryPage onNavigate={navigateTo} navIntent={navIntent} />}
            {activeTab === 'vehicles' && <VehicleManagerPage onNavigate={navigateTo} navIntent={navIntent} socket={socket} />}
            {activeTab === 'tunes' && <TuneManagerPage onNavigate={navigateTo} navIntent={navIntent} />}
          </Suspense>
        </ErrorBoundary>
      </div>

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
      <ToastContainer />
    </div>
  );
}
