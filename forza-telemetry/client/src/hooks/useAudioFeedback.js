import { useRef, useCallback } from 'react';

export function useAudioFeedback() {
  const audioContextRef = useRef(null);
  const lastPlayTimeRef = useRef({});

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback((frequency, duration, type = 'sine', volume = 0.3) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('音频播放失败:', e);
    }
  }, [getAudioContext]);

  const playWarning = useCallback((type, severity) => {
    const now = Date.now();
    const lastPlay = lastPlayTimeRef.current[type] || 0;
    const cooldown = severity === 'danger' ? 500 : 1000;
    
    if (now - lastPlay < cooldown) return;
    lastPlayTimeRef.current[type] = now;

    switch (severity) {
      case 'danger':
        playTone(800, 0.15, 'square', 0.2);
        setTimeout(() => playTone(600, 0.15, 'square', 0.2), 100);
        break;
      case 'warning':
        playTone(500, 0.2, 'sine', 0.15);
        break;
      case 'info':
        playTone(400, 0.1, 'sine', 0.1);
        break;
      default:
        break;
    }
  }, [playTone]);

  const playShiftBeep = useCallback(() => {
    playTone(1000, 0.05, 'sine', 0.15);
  }, [playTone]);

  return { playWarning, playShiftBeep };
}