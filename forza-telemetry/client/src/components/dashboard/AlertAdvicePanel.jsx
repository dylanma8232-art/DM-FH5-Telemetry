import { useState, useEffect, useRef } from 'react';

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

    const steerAbs = Math.abs(controls.steer || 0); // 0 到 127/255 表示转向
    const yawChange = Math.abs(yaw - prevYawRef.current) % Math.PI;
    prevYawRef.current = yaw;
    const smoothYaw = smooth(yawHistoryRef, yawChange);
    const smoothSpeed = smooth(speedHistoryRef, speedKmh);

    const gear = controls.gear || 0;
    const prevGear = prevGearRef.current;
    prevGearRef.current = gear;

    const gX = Math.abs(acceleration.x || 0);
    const gZ = Math.abs(acceleration.z || 0);
    const gMag = Math.sqrt(gX * gX + gZ * gZ);

    // ⚡⚡⚡ 动态物理阈值核心算法 ⚡⚡⚡
    // 1. 随着速度升高，轮胎能容忍的打滑区间急剧缩小，实现“低速放宽防烧胎误报，高速收紧防失控”
    const dynamicSlipWarning = Math.max(0.35, 0.95 - smoothSpeed * 0.0035);
    const dynamicSlipDanger = Math.max(0.65, 1.45 - smoothSpeed * 0.005);

    // 2. 随着速度升高，制动锁死抱死率（负滑移）的容忍极限收紧
    const dynamicLockWarning = Math.min(-0.15, -0.32 + smoothSpeed * 0.0008);
    const dynamicLockDanger = Math.min(-0.3, -0.58 + smoothSpeed * 0.0012);

    // 3. 转向不足（推头）阈值随速度升高急剧减小（高速时只需打一点方向就会产生推头）
    // controls.steer 范围通常是 -127 到 +127，取绝对值 steerAbs 为 0~127
    const dynamicSteerUndersteer = Math.max(15, 85 - smoothSpeed * 0.35);

    // ── 0.5. 比赛中降至 1 档提示 (高优先级插播) ────────────────────────────────
    if (isRaceOn && gear === 1 && prevGear > 1) {
      items.push({ 
        priority: 0.5, 
        type: 'warning', 
        icon: '⚙', 
        text: '当前已是1档', 
        detail: '请勿继续降档！' 
      });
    }

    // ── 1. 最高优先级：双踏板（起步控制除外，速度>10时判定）─────────────────
    if (smoothSpeed > 10 && (controls.brake || 0) > 200 && (controls.accel || 0) > 100) {
      items.push({ priority: 1, type: 'danger', icon: '🚫', text: '同时踩油门刹车', detail: '立即松开其中一项' });
    }

    // ── 2. 转向过度（甩尾失控，车速>25且前进档时判定）─────────────────────────────
    if (smoothYaw > 0.048 && steerAbs < 25 && smoothSpeed > 25 && gear > 0) {
      items.push({ priority: 2, type: 'danger', icon: '↺', text: '转向过度 甩尾！', detail: `偏航变化: ${smoothYaw.toFixed(3)}` });
    }

    // ── 3. 严重打滑（采用动态速度滑动阈值）──────────────────────────────
    const avgSlip = ((tireCombinedSlip.frontLeft || 0) + (tireCombinedSlip.frontRight || 0) +
                     (tireCombinedSlip.rearLeft  || 0) + (tireCombinedSlip.rearRight  || 0)) / 4;
    
    if (avgSlip > dynamicSlipDanger) {
      items.push({ priority: 3, type: 'danger', icon: '🔥', text: '严重打滑', detail: '立即松油，车辆失控风险' });
    } else if (avgSlip > dynamicSlipWarning && smoothSpeed > 10) {
      items.push({ priority: 4, type: 'warning', icon: '💨', text: '轮胎打滑', detail: `打滑率 ${avgSlip.toFixed(2)}，降低油门` });
    }

    // ── 4. 制动锁死（采用动态负滑移阈值，有刹车动作时检测）──────────────────
    if ((controls.brake || 0) > 40) {
      const minSlipRatio = Math.min(
        tireSlipRatio.frontLeft ?? 0, tireSlipRatio.frontRight ?? 0,
        tireSlipRatio.rearLeft  ?? 0, tireSlipRatio.rearRight  ?? 0
      );
      if (minSlipRatio < dynamicLockDanger) {
        items.push({ priority: 3.1, type: 'danger', icon: '🔒', text: '制动锁死！', detail: '请松开刹车以恢复抓地力' });
      } else if (minSlipRatio < dynamicLockWarning && smoothSpeed > 15) {
        items.push({ priority: 5, type: 'warning', icon: '⚠', text: '制动锁死风险', detail: '轻微抱死，注意控制力度' });
      }
    }

    // ── 5. 转向不足（采用动态转向角阈值）────────────────────────────────
    if (steerAbs > dynamicSteerUndersteer && smoothYaw < 0.012 && smoothSpeed > 35 && gear > 0) {
      items.push({ priority: 6, type: 'warning', icon: '→', text: '转向不足 推头', detail: `车速: ${smoothSpeed.toFixed(0)} 公里/小时` });
    }

    // ── 6. 高 G 力（重心转移过大，忽略起步撞击，速度>20判定）─────────────────────
    if (gMag > 1.85 && smoothSpeed > 20) {
      const dir = gX > gZ ? '横向' : '纵向';
      items.push({ priority: 7, type: 'warning', icon: '📊', text: `重力载荷过载: ${gMag.toFixed(2)}G`, detail: `${dir}载荷转移过大` });
    }

    // ── 7. 避震极限压缩/拉伸（速度>25时检测，忽略原地载入与颠簸起伏）─────────────────
    if (smoothSpeed > 25) {
      const suspVals = [suspension.frontLeft, suspension.frontRight, suspension.rearLeft, suspension.rearRight]
        .filter(v => v !== undefined);
      if (suspVals.length > 0) {
        const minS = Math.min(...suspVals);
        const maxS = Math.max(...suspVals);
        if (minS < 0.15) {
          items.push({ priority: 8, type: 'warning', icon: '⬇', text: '悬挂过度压缩', detail: `避震压实 (${(minS * 100).toFixed(0)}%)，底盘易拖底` });
        }
        if (maxS > 0.85) {
          items.push({ priority: 8.1, type: 'warning', icon: '⬆', text: '车轮即将悬空', detail: `避震拉满 (${(maxS * 100).toFixed(0)}%)，失去抓地力` });
        }
      }
    }

    // ── 8. 引擎红区（起步与空档除外，车速>10判定）────────────────────────────────
    if (smoothSpeed > 10 && gear > 0) {
      const rpmPct = engineMaxRpm > 0 ? currentEngineRpm / engineMaxRpm : 0;
      if (rpmPct > 0.96) {
        items.push({ priority: 9, type: 'warning', icon: '🔴', text: '引擎红区', detail: `${(rpmPct * 100).toFixed(0)}% — 建议升档` });
      }
    }

    // ── 9. 出界 / 湿滑（有速度时才提示）─────────────────────────────────────────
    const onRumble = onRumbleStrip.frontLeft || onRumbleStrip.frontRight ||
                     onRumbleStrip.rearLeft  || onRumbleStrip.rearRight;
    if (onRumble && smoothSpeed > 10) {
      items.push({ priority: 10, type: 'info', icon: '■', text: '出界 路肩', detail: '已压上路肩/减速带' });
    }

    const maxPuddle = Math.max(
      puddleDepth.frontLeft || 0, puddleDepth.frontRight || 0,
      puddleDepth.rearLeft  || 0, puddleDepth.rearRight  || 0
    );
    if (maxPuddle > 0.5 && smoothSpeed > 10) {
      items.push({ priority: 10.1, type: 'warning', icon: '☔', text: '湿滑路面', detail: `积水深度: ${maxPuddle.toFixed(2)}` });
    }

    // ── 10. 燃油量低（限比赛中提醒）─────────────────────────────────────────────
    if (isRaceOn && fuel > 0 && fuel < 0.2) {
      items.push({ priority: 11, type: 'info', icon: '⛽', text: '燃油量低', detail: `剩余 ${(fuel * 100).toFixed(0)}%` });
    }
    if (boost > 2.0 && smoothSpeed > 10) {
      items.push({ priority: 12, type: 'warning', icon: '💨', text: '涡轮增压过高', detail: `${boost.toFixed(2)} bar` });
    }

    // ── 排序：priority 越小越靠前 ─────────────────────────────────────────
    items.sort((a, b) => a.priority - b.priority);

    setAlerts(items.slice(0, 5));
  }, [data]);

  // ── TTS 播报（优先级高的情况才播） ───────────────────────────────────────
  useEffect(() => {
    if (alerts.length === 0) return;
    const top = alerts[0];
    if (top.type === 'success' || top.type === 'info') return;

    // 比赛中降到1档的语音需要提示
    const isFirstGearWarning = top.text === '当前已是1档';
    
    // 如果是1档警告，用更温和或者警示性的播报
    const ttsPriority = top.type === 'danger' ? 3 : 2; 
    const speakText = isFirstGearWarning ? '当前已是一档，不要降档了' : `${top.text}。${top.detail}`;

    import('../../utils/speechQueue').then(m => {
      m.speechManager.speak(speakText, ttsPriority);
    });
  }, [alerts]);

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
