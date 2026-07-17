import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const telemetryListeners = new Set();
let latestTelemetry = null;

// 全局订阅方法
export function subscribeTelemetry(callback) {
  telemetryListeners.add(callback);
  // 如果已有最新数据，订阅时立即推送一次初始数据，防止首帧空白
  if (latestTelemetry) {
    try {
      callback(latestTelemetry);
    } catch (e) { /* ignore */ }
  }
  return () => {
    telemetryListeners.delete(callback);
  };
}

// 供高频局部重绘使用的自定义 Hook
export function useTelemetrySubscription(callback) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = (data) => {
      if (callbackRef.current) callbackRef.current(data);
    };
    return subscribeTelemetry(handler);
  }, []);
}

export function useSocket() {
  const dataRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  
  // 用于 Header 等组件感知的低频遥测状态
  const [lowFreqState, setLowFreqState] = useState({
    isRaceOn: false,
    lapNumber: 0,
    racePosition: 0
  });

  const socketRef = useRef(null);
  const packetCounterRef = useRef(0);
  const lastLowFreqRef = useRef(null);

  useEffect(() => {
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
      latestTelemetry = telemetry;
      packetCounterRef.current += 1;
      
      // 1. 触发高频订阅（仪表盘自渲染）
      telemetryListeners.forEach(listener => {
        try {
          listener(telemetry);
        } catch (e) {
          console.error('[Telemetry PubSub] Listener error:', e);
        }
      });

      // 2. 只有当低频控制性状态改变时，才进行 React state 更新，防止触发全局 App 级别重绘风暴
      const prev = lastLowFreqRef.current;
      const hasChanged = !prev ||
        prev.isRaceOn !== telemetry.isRaceOn ||
        prev.lapNumber !== telemetry.lapNumber ||
        prev.racePosition !== telemetry.racePosition;

      if (hasChanged) {
        const nextState = {
          isRaceOn: telemetry.isRaceOn,
          lapNumber: telemetry.lapNumber,
          racePosition: telemetry.racePosition
        };
        lastLowFreqRef.current = nextState;
        setLowFreqState(nextState);
      }
    });

    const timer = setInterval(() => {
      setPacketsPerSecond(packetCounterRef.current);
      setPacketCount(prev => prev + packetCounterRef.current);
      packetCounterRef.current = 0;
    }, 1000);

    return () => {
      clearInterval(timer);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('telemetry');
      socket.disconnect();
    };
  }, []);

  return { 
    data: latestTelemetry, // 供初次感知或回退读取
    throttledData: latestTelemetry,
    rawDataRef: dataRef,
    connected, 
    packetCount, 
    packetsPerSecond,
    lowFreqState,
    socket: socketRef.current 
  };
}
