import { useState, useEffect, useRef } from 'react';

/**
 * 节流频繁变化的值，用于降低 React 复杂大图表或大视图的重渲染频率
 * @param {any} rawValue 原始频繁变化的数据
 * @param {number} delay 节流触发阈值 (ms)
 */
export function useThrottledRender(rawValue, delay = 150) {
  const [throttledValue, setThrottledValue] = useState(rawValue);
  const lastUpdated = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const now = Date.now();
    const remain = delay - (now - lastUpdated.current);

    if (remain <= 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setThrottledValue(rawValue);
      lastUpdated.current = now;
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(rawValue);
        lastUpdated.current = Date.now();
      }, remain);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [rawValue, delay]);

  return throttledValue;
}
