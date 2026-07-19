import { useState, useEffect } from 'react';
import { toast } from './shared/Toast';
import { api } from '../services/api';

let globalAudioCtx = null;

function playTone(frequency, duration, type = 'sine', volume = 0.4) {
  try {
    if (!globalAudioCtx) {
      globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = globalAudioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('[Audio] 播放音频失败:', e);
  }
}

export function Header({ connected, packetCount, packetsPerSecond, isRaceOn, lapNumber, racePosition, currentRaceTime, onSettingsClick, socket }) {
  const [autoRecordStatus, setAutoRecordStatus] = useState('IDLE');
  const [manualRecording, setManualRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordStartTime, setRecordStartTime] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [serverStatus, setServerStatus] = useState({ udpPort: 9996, ips: [] });

  // 挂载时获取服务器状态
  useEffect(() => {
    api.system.getStatus()
      .then(data => {
        if (data.udpPort) {
          setServerStatus({ udpPort: data.udpPort, ips: data.ips || [] });
        }
        if (data.isManualRecording !== undefined) {
          setManualRecording(data.isManualRecording);
          if (data.isManualRecording) {
            setRecordStartTime(Date.now()); // 简单估算时间
          }
        }
        if (data.autoRecordState) {
          setAutoRecordStatus(data.autoRecordState);
        }
      })
      .catch(err => console.error('[Header] 获取状态失败:', err));
  }, []);

  // 用户交互预热 AudioContext，解决浏览器安全限制导致的静音问题
  useEffect(() => {
    const initAudio = () => {
      if (!globalAudioCtx) {
        globalAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume();
      }
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('autoRecordStatus', (data) => {
      setAutoRecordStatus(data.state);
      if (data.state === 'RECORDING') {
        setRecordStartTime(Date.now());
        // 播放开始录制的“滴”提示音 (988Hz 亮 sine 音)
        playTone(987.77, 0.15, 'sine', 0.4);
      } else if (data.state === 'COMPLETED') {
        toast(`自动录制已保存: ${data.trackName || '未知赛道'}`, 'success', 5000);
        setLastSaved({ trackName: data.trackName, sessionId: data.sessionId, time: Date.now() });
        setRecordStartTime(null);
        setRecordDuration(0);
        // 播放保存成功的“嘟”提示音 (523Hz 暖 triangle 音)
        playTone(523.25, 0.35, 'triangle', 0.5);
      } else {
        setRecordStartTime(null);
        setRecordDuration(0);
      }
    });

    socket.on('recordStats', (data) => {
      if (data.duration) {
        setRecordDuration(Math.floor(data.duration / 1000));
      }
    });

    return () => {
      socket.off('autoRecordStatus');
      socket.off('recordStats');
    };
  }, [socket]);

  useEffect(() => {
    if (!recordStartTime) return;
    const timer = setInterval(() => {
      setRecordDuration(Math.floor((Date.now() - recordStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [recordStartTime]);

  // 解析当前最佳网络IP
  const activeIp = serverStatus.ips.find(ip => 
    ip.name.startsWith('en') || ip.name.startsWith('eth') || ip.name.startsWith('wlan')
  )?.address || (serverStatus.ips.length > 0 ? serverStatus.ips[0].address : '127.0.0.1');

  // 比赛状态判定 - racePosition > 0 是区分比赛和漫游的可靠字段
  const isFreeRoam = isRaceOn && racePosition === 0;
  const isInRace = isRaceOn && racePosition > 0;
  
  const raceStateText = isInRace ? '比赛中' : isRaceOn ? '漫游中' : '待机';
  const raceStateColor = isInRace ? '#3fb950' : isRaceOn ? '#58a6ff' : '#8b949e';

  // 录制状态判定
  let recordStateText = '未录制';
  let recordColor = '#8b949e';
  let recordBlink = false;

  if (manualRecording) {
    recordStateText = '手动录制';
    recordColor = '#f85149';
    recordBlink = true;
  } else if (autoRecordStatus === 'RECORDING') {
    recordStateText = '自动录制';
    recordColor = '#f0883e';
    recordBlink = true;
  } else if (autoRecordStatus === 'POST_RACE') {
    recordStateText = '录制结束';
    recordColor = '#d29922';
  } else if (autoRecordStatus === 'COMPLETED') {
    recordStateText = '已经保存';
    recordColor = '#3fb950';
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
  };

  const handleManualRecordToggle = async () => {
    if (manualRecording) {
      await api.record.stopResponse();
      try {
        const res = await api.record.saveResponse({ trackName: '手动录制_' + new Date().toLocaleString() });
        if (res.ok) {
          const data = await res.json();
          toast('手动录制已保存', 'success', 3000);
        }
      } catch (e) {
        console.error('[手动录制] 保存失败:', e);
      }
      setManualRecording(false);
      setRecordStartTime(null);
      setRecordDuration(0);
    } else {
      await api.record.startResponse();
      setManualRecording(true);
      setRecordStartTime(Date.now());
      toast('手动录制已开始', 'info', 2000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 18px',
      background: '#161b22',
      borderBottom: '1px solid #21262d',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 左侧：标题与网络地址 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 800,
          color: '#58a6ff',
          letterSpacing: '0.5px'
        }}>
          FH5 遥测仪表盘
        </div>
        <div style={{
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: '#8b949e',
          background: '#0d1117',
          padding: '3px 10px',
          borderRadius: 4,
          border: '1px solid #30363d'
        }}>
          <span>网页端: <strong style={{ color: '#c9d1d9', fontFamily: 'monospace' }}>http://{activeIp}:{window.location.port || '9188'}</strong></span>
          <span style={{ color: '#30363d' }}>|</span>
          <span>遥测端口: <strong style={{ color: '#c9d1d9', fontFamily: 'monospace' }}>UDP {serverStatus.udpPort}</strong></span>
        </div>
      </div>

      {/* 右侧：状态指示与控制 */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, alignItems: 'center' }}>
        {/* 服务端连接状态 */}
        <span style={{
          color: connected ? '#3fb950' : '#f85149',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: connected ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${connected ? 'rgba(63,185,80,0.2)' : 'rgba(248,81,73,0.2)'}`
        }}>
          <span style={{ fontSize: 8 }}>●</span>
          服务连接: {connected ? '已连通' : '未连通'}
        </span>

        {/* 游戏UDP遥测接收状态 */}
        <span style={{
          color: packetsPerSecond > 0 ? '#3fb950' : '#d29922',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: packetsPerSecond > 0 ? 'rgba(63,185,80,0.08)' : 'rgba(210,153,34,0.08)',
          padding: '3px 8px',
          borderRadius: 4,
          border: `1px solid ${packetsPerSecond > 0 ? 'rgba(63,185,80,0.2)' : 'rgba(210,153,34,0.2)'}`
        }}>
          <span style={{ fontSize: 8, animation: packetsPerSecond > 0 ? 'pulseGlow 1s infinite' : 'none' }}>●</span>
          遥测接收: {packetsPerSecond > 0 ? `${packetsPerSecond} 帧/秒` : '等待中'}
        </span>

        <style>{`
          @keyframes pulseGlow {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
        `}</style>

        {/* 比赛状态 */}
        <span style={{
          color: raceStateColor,
          fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 4,
          background: `${raceStateColor}12`,
          border: `1px solid ${raceStateColor}25`
        }}>
          比赛状态: {raceStateText}
        </span>

        {/* 录制状态 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          background: `${recordColor}10`,
          borderRadius: 4,
          border: `1px solid ${recordColor}30`,
          animation: recordBlink ? 'recordPulse 1.2s infinite' : 'none'
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: recordColor,
            boxShadow: recordBlink ? `0 0 6px ${recordColor}` : 'none'
          }} />
          <span style={{ fontSize: 11, color: recordColor, fontWeight: 700 }}>
            录制状态: {recordStateText}
          </span>
          {recordStartTime && (manualRecording || autoRecordStatus === 'RECORDING') && (
            <span style={{ fontSize: 10, color: '#c9d1d9', fontFamily: 'monospace', marginLeft: 4 }}>
              {formatTime(recordDuration)}
            </span>
          )}
        </div>

        {/* 手动录制按钮 */}
        <button
          onClick={handleManualRecordToggle}
          style={{
            background: manualRecording ? '#f85149' : '#21262d',
            border: '1px solid #30363d',
            color: manualRecording ? '#fff' : '#c9d1d9',
            padding: '4px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'all 0.2s',
            boxShadow: manualRecording ? '0 0 8px rgba(248,81,73,0.3)' : 'none'
          }}
        >
          <span>{manualRecording ? '⏹' : '⏺'}</span>
          {manualRecording ? '停止录制' : '手动录制'}
        </button>

        {/* 设置 */}
        <button
          onClick={onSettingsClick}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            transition: 'all 0.2s'
          }}
        >
          ⚙ Settings
        </button>
      </div>

      {/* 闪烁动画定义 */}
      <style>{`
        @keyframes recordPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
