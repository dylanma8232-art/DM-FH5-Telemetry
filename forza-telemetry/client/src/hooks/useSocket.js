import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const dataRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  const [renderData, setRenderData] = useState(null);
  
  const socketRef = useRef(null);
  const rafRef = useRef(null);
  const packetCounterRef = useRef(0);

  useEffect(() => {
    // 支持从localStorage配置服务器地址（用于手机通过局域网访问）
    let serverUrl = '';
    try {
      const saved = localStorage.getItem('serverUrl');
      if (saved) serverUrl = saved;
    } catch (e) { /* ignore */ }

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('[Socket] Connected to server' + (serverUrl ? ' at ' + serverUrl : ''));
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setPacketsPerSecond(0);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('telemetry', (telemetry) => {
      dataRef.current = telemetry;
      setPacketCount(prev => prev + 1);
      packetCounterRef.current += 1;
      
      if (packetCounterRef.current <= 3) {
        console.log('[Socket] Received telemetry:', { 
          isRaceOn: telemetry.isRaceOn, 
          rpm: telemetry.currentEngineRpm?.toFixed(0),
          carOrdinal: telemetry.car?.ordinal,
          lapNumber: telemetry.lapNumber,
          hasCar: !!telemetry.car,
          performanceIndex: telemetry.car?.performanceIndex
        });
      }
      
      setRenderData(telemetry);
    });

    // 每秒钟计算一次接收到的UDP遥测包数 (帧率)
    const timer = setInterval(() => {
      setPacketsPerSecond(packetCounterRef.current);
      packetCounterRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(timer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('telemetry');
      socket.disconnect();
    };
  }, []);

  return { 
    data: renderData, 
    rawDataRef: dataRef,
    connected, 
    packetCount, 
    packetsPerSecond,
    socket: socketRef.current 
  };
}
