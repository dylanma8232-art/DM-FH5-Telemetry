import { useRef, useState } from 'react';
import { useTelemetrySubscription } from './useSocket';

export function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * 整帧遥测订阅（面板自渲染用）。
 * 行为与拆分前 DashboardPage 的 `useState({}) + useTelemetrySubscription(setData)`
 * 完全一致：初始空对象，收到包就替换为整帧数据。
 */
export function useTelemetryValue() {
  const [telemetry, setTelemetry] = useState({});
  useTelemetrySubscription(setTelemetry);
  return telemetry;
}

/**
 * 只订阅 selector 选出的切片；切片「真的变了」才提交 state。
 * 用于只依赖少数车辆/状态字段的展示块（这些字段在行驶中不变，可整帧跳过）。
 */
export function useTelemetrySelector(selector, equals = shallowEqual) {
  const [slice, setSlice] = useState(() => selector(null));
  const sliceRef = useRef(slice);
  const selectorRef = useRef(selector);
  const equalsRef = useRef(equals);
  selectorRef.current = selector;
  equalsRef.current = equals;

  useTelemetrySubscription((telemetry) => {
    const next = selectorRef.current(telemetry);
    if (equalsRef.current(sliceRef.current, next)) return;
    sliceRef.current = next;
    setSlice(next);
  });

  return slice;
}
