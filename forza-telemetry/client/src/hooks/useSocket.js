import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const dataRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  const [renderData, setRenderData] = useState(null);
  const [throttledData, setThrottledData] = useState(null);
  
  const socketRef = useRef(null);
  const packetCounterRef = useRef(0);
  const lastThrottleTimeRef = useRef(0);

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
      packetCounterRef.current += 1;
      
      // Prevent React global render storms: only update state at ~30 FPS (33ms)
      const now = Date.now();
      if (now - lastThrottleTimeRef.current >= 33) {
        setRenderData(telemetry);
        setThrottledData(telemetry); // Keep both for backwards compatibility
        lastThrottleTimeRef.current = now;
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
    data: renderData, 
    throttledData,
    rawDataRef: dataRef,
    connected, 
    packetCount, 
    packetsPerSecond,
    socket: socketRef.current 
  };
}
