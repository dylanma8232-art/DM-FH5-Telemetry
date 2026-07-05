import { useState, useEffect, useRef } from 'react';
import { speechManager } from '../../utils/speechQueue';

/**
 * 统一警报与驾驶建议面板
 * 合并了原 WarningPanel 和 RealTimeAdvicePanel 的所有检测逻辑
 * 采用基于车速的动态物理阈值模型，极大地减少低速/起步误报，提升高速敏感度
 */
export function AlertAdvicePanel({ data }) {
  const [alerts, setAlerts] = useState([]);
  const prevYawRef = useRef(0);
  const yawHistoryRef = useRef([]);
  const speedHistoryRef = useRef([]);
  const prevGearRef = useRef(0); // 用于检测降档到1档

  useEffect(() => {
    if (!data) {
      setAlerts([]);
      return;
    }

    const items = [];

    const {
      speedKmh = 0,
      acceleration = {},
      controls = {},
      tireCombinedSlip = {},
      tireSlipRatio = {},
      suspension = {},
      fuel = 0,
      boost = 0,
      currentEngineRpm = 0,
      engineMaxRpm = 8000,
      onRumbleStrip = {},
      puddleDepth = {},
      yaw = 0,
      isRaceOn = false,
    } = data;

    // ── 平滑辅助 ──────────────────────────────────────────────────────────
    const smooth = (bufRef, val, n = 8) => {
      bufRef.current.push(val);
      if (bufRef.current.length > n) bufRef.current.shift();
      return bufRef.current.reduce((a, b) => a + b, 0) / bufRef.current.length;
    };

    const smoothSpeed = smooth(speedHistoryRef, speedKmh);
    const gear = controls.gear || 0;
    const prevGear = prevGearRef.current;
    prevGearRef.current = gear;

    // 转换为 G 力 (原单位为 m/s²)
    const gX = Math.abs(acceleration.x || 0) / 9.80665;
    const gZ = Math.abs(acceleration.z || 0) / 9.80665;
    const gMag = Math.sqrt(gX * gX + gZ * gZ);

    // ── 0.5. 比赛中高速降至 1 档提示 (高优先级插播) ────────────────────────────────
    if (isRaceOn && gear === 1 && prevGear > 2 && smoothSpeed > 50) {
      items.push({ 
        priority: 0.5, 
        type: 'danger', 
        icon: '⚙', 
        text: '警告：已切至1档', 
        detail: '注意防范误切倒车档！' 
      });
    }

    // ── 1. 制动锁死 (ABS 抱死) ──────────────────
    if ((controls.brake || 0) > 0 && smoothSpeed > 20) {
      const wheelRotationSpeed = data.wheelRotationSpeed || {};
      const minWheelSpeed = Math.min(
        wheelRotationSpeed.frontLeft ?? 100, wheelRotationSpeed.frontRight ?? 100,
        wheelRotationSpeed.rearLeft  ?? 100, wheelRotationSpeed.rearRight  ?? 100
      );
      if (minWheelSpeed < 5) {
        items.push({ priority: 1, type: 'danger', icon: '🔒', text: '刹车抱死！', detail: '车轮已完全锁死，松开刹车恢复转向！' });
      }
    }

    // ── 2. 轮胎完全失去抓地力 (TCS 打滑) ──────────────────────────────
    // 只要有任何一个轮胎的物理摩擦力（综合滑移）大于 1.2，即代表该轮胎失去摩擦力开始空转/打滑
    const maxSlip = Math.max(
      tireCombinedSlip.frontLeft || 0,
      tireCombinedSlip.frontRight || 0,
      tireCombinedSlip.rearLeft || 0,
      tireCombinedSlip.rearRight || 0
    );
    
    if (maxSlip > 1.2 && (controls.accel || 0) > 0) {
      items.push({ priority: 2, type: 'danger', icon: '🔥', text: '失去摩擦力！', detail: '轮胎打滑严重，请收油！' });
    }

    // ── 3. 高 G 力过载 (重心转移过大) ─────────────────────
    if (gMag > 1.85 && smoothSpeed > 20) {
      const dir = gX > gZ ? '横向' : '纵向';
      items.push({ priority: 3, type: 'warning', icon: '📊', text: `重力载荷过载: ${gMag.toFixed(2)}G`, detail: `${dir}载荷转移过大` });
    }

    // ── 排序：priority 越小越靠前 ─────────────────────────────────────────
    items.sort((a, b) => a.priority - b.priority);

    setAlerts(items.slice(0, 5));
  }, [data]);

  // ── TTS 播报（优先级高的情况才播） ───────────────────────────────────────
  const topAlertText = alerts[0]?.text;
  const topAlertDetail = alerts[0]?.detail;
  const topAlertType = alerts[0]?.type;

  useEffect(() => {
    if (!topAlertText) return;
    if (topAlertType === 'success' || topAlertType === 'info') return;

    // 比赛中降到1档的语音需要提示
    const isFirstGearWarning = topAlertText === '当前已是1档';
    
    // 如果是1档警告，用更温和或者警示性的播报
    const ttsPriority = topAlertType === 'danger' ? 3 : 2; 
    const speakText = isFirstGearWarning ? '当前已是一档，不要降档了' : `${topAlertText}。${topAlertDetail}`;

    speechManager.speak(speakText, ttsPriority);
  }, [topAlertText, topAlertDetail, topAlertType]);

  // ── 样式映射 ──────────────────────────────────────────────────────────
  const typeStyle = (type) => {
    switch (type) {
      case 'danger':  return { bg: 'rgba(248,81,73,0.12)',  border: '#f85149', textColor: '#ff7b72' };
      case 'warning': return { bg: 'rgba(210,153,34,0.12)', border: '#d29922', textColor: '#e3b341' };
      case 'info':    return { bg: 'rgba(88,166,255,0.08)', border: '#388bfd', textColor: '#79c0ff' };
      default:        return { bg: 'rgba(63,185,80,0.08)',  border: '#238636', textColor: '#56d364' };
    }
  };

  const noAlerts = alerts.length === 0;

  return (
    <div style={{
      background: '#161b22',
      borderRadius: 8,
      border: '1px solid #21262d',
      padding: '8px 12px',
      height: '100%',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: noAlerts ? '#3fb950' : '#f0883e', letterSpacing: 0.5 }}>
          {noAlerts ? '● 状态正常' : `预警与建议`}
        </span>
        <span style={{ fontSize: 9, color: '#484f58' }}>
          {noAlerts ? '系统监控中' : `${alerts.length} 条`}
        </span>
      </div>

      {/* 警报列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {noAlerts ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#484f58', fontSize: 10, fontStyle: 'italic' }}>
            各项参数正常
          </div>
        ) : (
          alerts.map((item, i) => {
            const s = typeStyle(item.type);
            const isDanger = item.type === 'danger';
            return (
              <div
                key={i}
                style={{
                  background: s.bg,
                  borderLeft: `3px solid ${s.border}`,
                  borderRadius: '0 4px 4px 0',
                  padding: '5px 8px',
                  animation: isDanger ? 'alertPulse 0.8s infinite' : 'none',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 12 }}>{item.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.textColor }}>{item.text}</span>
                </div>
                <div style={{ fontSize: 9, color: '#8b949e', marginTop: 1, marginLeft: 17 }}>{item.detail}</div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes alertPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
