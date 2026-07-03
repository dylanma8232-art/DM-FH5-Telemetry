import React, { useMemo, useRef, useEffect, useState } from 'react';

// 刹车防抱死与牵引力控制判定阈值
function getABSTCStatus(ratio) {
  if (ratio < -0.3) return { type: 'abs', color: '#f85149', text: 'ABS 抱死', active: true };
  if (ratio < -0.15) return { type: 'abs', color: '#d29922', text: 'ABS 临界', active: false };
  if (ratio > 0.3) return { type: 'tc', color: '#f85149', text: 'TCS 打滑', active: true };
  if (ratio > 0.15) return { type: 'tc', color: '#d29922', text: 'TCS 滑移', active: false };
  return { type: 'none', color: '#3fb950', text: '正常', active: false };
}

// 获取抓地力状态信息
function getGripInfo(slip) {
  const grip = Math.max(0, 100 - slip * 50);
  if (grip > 75) return { val: grip, color: '#3fb950', text: '充足' };
  if (grip > 45) return { val: grip, color: '#d29922', text: '临界' };
  return { val: grip, color: '#f85149', text: '失控' };
}

// 避震行程颜色
function getSuspColor(val) {
  if (val > 0.85 || val < 0.15) return '#f85149'; // 避震底极限或离地
  if (val > 0.7 || val < 0.3) return '#d29922';  // 重量大幅度转移
  return '#3fb950';                              // 稳定范围
}

export function BrakingGripDynamicsPanel({ data }) {
  const telemetryData = data || {};
  const acceleration = telemetryData.acceleration || { x: 0, y: 0, z: 0 };
  const suspension = telemetryData.suspension || { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 };
  const tireSlipRatio = telemetryData.tireSlipRatio || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const tireCombinedSlip = telemetryData.tireCombinedSlip || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const car = telemetryData.car || {};

  const latG = acceleration.x || 0; 
  const lonG = acceleration.z || 0; 

  // 峰值记录
  const [peakLat, setPeakLat] = useState(0);
  const [peakLon, setPeakLon] = useState(0);

  // 声音报警静音状态 (持久化存储)
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem('hud_audio_muted') === 'true';
    } catch {
      return false;
    }
  });

  // 音频发生器引用
  const audioCtxRef = useRef(null);
  const oscRef = useRef(null);
  const gainNodeRef = useRef(null);

  useEffect(() => {
    const absLat = Math.abs(latG);
    const absLon = Math.abs(lonG);
    if (absLat > peakLat) setPeakLat(absLat);
    if (absLon > peakLon) setPeakLon(absLon);
  }, [latG, lonG]);

  // 根据车辆性能等级动态推算G力极限线
  const limitG = useMemo(() => {
    const cls = car.class;
    if (cls === 0) return 0.95; // D
    if (cls === 1) return 1.15; // C
    if (cls === 2) return 1.35; // B
    if (cls === 3) return 1.55; // A
    if (cls === 4) return 1.85; // S1
    if (cls === 5) return 2.15; // S2
    if (cls === 6) return 2.45; // X
    return 1.60; // 默认
  }, [car.class]);

  // 计算极限利用率
  const currentTotalG = Math.sqrt(latG * latG + lonG * lonG);
  const utilizationPercent = Math.min((currentTotalG / limitG) * 100, 100);

  // 防抱死与防打滑状态解析
  const wheelStatuses = useMemo(() => {
    return {
      FL: getABSTCStatus(tireSlipRatio.frontLeft || 0),
      FR: getABSTCStatus(tireSlipRatio.frontRight || 0),
      RL: getABSTCStatus(tireSlipRatio.rearLeft || 0),
      RR: getABSTCStatus(tireSlipRatio.rearRight || 0),
    };
  }, [tireSlipRatio]);

  const isABSActive = Object.values(wheelStatuses).some(s => s.type === 'abs' && s.active);
  const isTCSActive = Object.values(wheelStatuses).some(s => s.type === 'tc' && s.active);

  // ── 实时音频警报 ───────────────────────────────────
  const startBeep = (freq, isAbs) => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      if (oscRef.current) {
        oscRef.current.frequency.setValueAtTime(freq, ctx.currentTime);
        return;
      }

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      if (isAbs) {
        osc.type = 'sawtooth'; // 锯齿波，刺耳，代表刹车抱死
      } else {
        osc.type = 'triangle'; // 三角波，警示，代表加速打滑
      }

      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.04, ctx.currentTime); // 极低音量防止吵耳

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();

      oscRef.current = osc;
      gainNodeRef.current = gainNode;
    } catch {}
  };

  const stopBeep = () => {
    if (oscRef.current) {
      try {
        oscRef.current.stop();
        oscRef.current.disconnect();
      } catch {}
      oscRef.current = null;
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {}
      gainNodeRef.current = null;
    }
  };

  useEffect(() => {
    if (isABSActive) {
      startBeep(980, true); // 980Hz ABS 尖锐警报
    } else if (isTCSActive) {
      startBeep(490, false); // 490Hz TCS 打滑警报
    } else {
      stopBeep();
    }
    return () => stopBeep();
  }, [isABSActive, isTCSActive, isMuted]);

  // 切换静音
  const toggleMute = () => {
    const nextVal = !isMuted;
    setIsMuted(nextVal);
    try {
      localStorage.setItem('hud_audio_muted', String(nextVal));
    } catch {}
  };

  // 决定当前安全利用率颜色
  let safetyColor = '#3fb950'; // 稳定
  let safetyText = '稳定行驶';
  if (utilizationPercent > 95) {
    safetyColor = '#f85149'; // 突破极限
    safetyText = '超越极限/打滑';
  } else if (utilizationPercent > 75) {
    safetyColor = '#d29922'; // 黄金物理极限区
    safetyText = '黄金极限边缘';
  }

  // 四轮映射
  const flInfo = { label: '前左 (FL)', key: 'FL', slip: tireCombinedSlip.frontLeft || 0, susp: suspension.frontLeft || 0.5, status: wheelStatuses.FL };
  const frInfo = { label: '前右 (FR)', key: 'FR', slip: tireCombinedSlip.frontRight || 0, susp: suspension.frontRight || 0.5, status: wheelStatuses.FR };
  const rlInfo = { label: '后左 (RL)', key: 'RL', slip: tireCombinedSlip.rearLeft || 0, susp: suspension.rearLeft || 0.5, status: wheelStatuses.RL };
  const rrInfo = { label: '后右 (RR)', key: 'RR', slip: tireCombinedSlip.rearRight || 0, susp: suspension.rearRight || 0.5, status: wheelStatuses.RR };

  // 渲染极简四轮底盘车模
  const renderWheelCard = (wheel) => {
    const grip = getGripInfo(wheel.slip);
    const suspColor = getSuspColor(wheel.susp);
    const isSlipping = wheel.status.type !== 'none' && (wheel.status.active || wheel.status.text.includes('临界'));
    const isHeavy = wheel.status.active;

    let cardBorder = 'rgba(48, 54, 61, 0.8)';
    let cardBg = 'rgba(22, 27, 34, 0.8)';
    let glowClass = '';

    if (isSlipping) {
      cardBorder = wheel.status.color;
      cardBg = isHeavy ? 'rgba(248, 81, 73, 0.15)' : 'rgba(210, 153, 34, 0.1)';
      glowClass = isHeavy ? 'wheel-flash-heavy' : 'wheel-flash-light';
    }

    return (
      <div
        key={wheel.key}
        className={glowClass}
        style={{
          background: cardBg,
          border: `2px solid ${cardBorder}`,
          borderRadius: 6,
          padding: '8px 10px',
          width: 140,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxSizing: 'border-box',
          transition: 'all 0.08s linear'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: isSlipping ? wheel.status.color : '#c9d1d9', fontFamily: 'monospace' }}>
            {wheel.label}
          </span>
          {isSlipping && (
            <span style={{
              fontSize: 8,
              fontWeight: 900,
              background: wheel.status.color,
              color: '#fff',
              padding: '1px 4px',
              borderRadius: 2,
              animation: 'textPulse 0.3s infinite'
            }}>
              {wheel.status.type === 'abs' ? 'ABS' : 'TC'}
            </span>
          )}
        </div>

        {/* 抓地力进度条 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#8b949e', marginBottom: 2 }}>
            <span>抓地力</span>
            <strong style={{ color: grip.color, fontFamily: 'monospace' }}>{grip.val.toFixed(0)}%</strong>
          </div>
          <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
            <div style={{ width: `${grip.val}%`, height: '100%', background: grip.color, borderRadius: 2.5 }} />
          </div>
        </div>

        {/* 避震压缩进度条 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#8b949e', marginBottom: 2 }}>
            <span>避震压缩</span>
            <strong style={{ color: suspColor, fontFamily: 'monospace' }}>{(wheel.susp * 100).toFixed(0)}%</strong>
          </div>
          <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
            <div style={{ width: `${wheel.susp * 100}%`, height: '100%', background: suspColor, borderRadius: 2.5 }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(22, 27, 34, 0.65)',
      border: '1px solid var(--border, #21262d)',
      borderRadius: 8,
      boxSizing: 'border-box',
      padding: '10px 14px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 极速状态下如果过载失控，全屏边缘亮起红色闪烁报警呼吸灯 */}
      {isABSActive && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          border: '4px solid #f85149',
          borderRadius: 8,
          pointerEvents: 'none',
          zIndex: 10,
          animation: 'screenWarning 0.2s infinite'
        }} />
      )}
      {isTCSActive && !isABSActive && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          border: '4px solid #f0883e',
          borderRadius: 8,
          pointerEvents: 'none',
          zIndex: 10,
          animation: 'screenWarning 0.4s infinite'
        }} />
      )}

      {/* 楼层总标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        flexShrink: 0,
        borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
        paddingBottom: 4
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>
          底盘极限与重力监测（全新超大视觉 HUD）
        </div>
        <button
          onClick={toggleMute}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(48,54,61,0.6)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 9.5,
            color: isMuted ? '#8b949e' : '#58a6ff',
            cursor: 'pointer',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          {isMuted ? '🔇 声音报警: 关' : '🔊 声音报警: 开'}
        </button>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        minHeight: 0
      }}>
        {/* ================= 左半区：巨型环形极少量规 + ABS/TC 巨型指示灯 ================= */}
        <div style={{
          flex: '0 0 45%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRight: '1px solid rgba(48, 54, 61, 0.3)',
          paddingRight: 16,
          boxSizing: 'border-box'
        }}>
          
          {/* 巨型仪表盘圆环 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 100, height: 100 }}>
              <svg width="100" height="100" viewBox="0 0 100 100">
                {/* 背景底圈 */}
                <circle cx="50" cy="50" r="42" fill="none" stroke="#21262d" strokeWidth="8" />
                {/* 75% 刻度标记 */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="8"
                  strokeDasharray="2, 195"
                  transform="rotate(180 50 50)"
                />
                {/* 动态指示圆环 */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={safetyColor}
                  strokeWidth="8"
                  strokeDasharray={`${(utilizationPercent / 100) * 263.89} 263.89`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dasharray 0.05s linear, stroke 0.1s linear' }}
                />
              </svg>
              {/* 圆环中间显示超大百分比 */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: 24, fontWeight: 900, fontFamily: 'monospace', color: safetyColor, lineHeight: 1 }}>
                  {utilizationPercent.toFixed(0)}%
                </span>
                <span style={{ fontSize: 7, color: '#8b949e', marginTop: 2, fontWeight: 600 }}>极限使用率</span>
              </div>
            </div>

            {/* 文字大标签配合 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>极限载荷合力</div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: '#fff' }}>
                {currentTotalG.toFixed(2)} <span style={{ fontSize: 10, color: '#8b949e' }}>G</span>
              </div>
              <div style={{ fontSize: 8.5, color: '#8b949e' }}>
                估算上限: {limitG.toFixed(2)} G
              </div>
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                color: safetyColor,
                background: `${safetyColor}15`,
                padding: '2px 6px',
                borderRadius: 4,
                border: `1px solid ${safetyColor}30`,
                marginTop: 2,
                width: 'fit-content'
              }}>
                {safetyText}
              </span>
            </div>
          </div>

          {/* 防抱死与防打滑巨型闪烁双色警报灯 */}
          <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 8 }}>
            {/* 巨型防抱死闪光灯 */}
            <div
              className={isABSActive ? 'abs-active-glow' : ''}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 6,
                textAlign: 'center',
                background: isABSActive ? '#f85149' : '#161b22',
                border: `2px solid ${isABSActive ? '#ff7b72' : '#30363d'}`,
                color: isABSActive ? '#fff' : 'rgba(139,148,158,0.3)',
                boxSizing: 'border-box',
                transition: 'all 0.05s linear'
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 0.5, lineHeight: 1 }}>
                ABS
              </div>
              <div style={{ fontSize: 8, fontWeight: 800, marginTop: 2, textTransform: 'uppercase', opacity: isABSActive ? 1 : 0.4 }}>
                {isABSActive ? '制动锁死报警' : '制动安全'}
              </div>
            </div>

            {/* 巨型防打滑防防滑闪光灯 */}
            <div
              className={isTCSActive ? 'tc-active-glow' : ''}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 6,
                textAlign: 'center',
                background: isTCSActive ? '#f0883e' : '#161b22',
                border: `2px solid ${isTCSActive ? '#f8a060' : '#30363d'}`,
                color: isTCSActive ? '#fff' : 'rgba(139,148,158,0.3)',
                boxSizing: 'border-box',
                transition: 'all 0.05s linear'
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 0.5, lineHeight: 1 }}>
                TCS
              </div>
              <div style={{ fontSize: 8, fontWeight: 800, marginTop: 2, textTransform: 'uppercase', opacity: isTCSActive ? 1 : 0.4 }}>
                {isTCSActive ? '轮胎空转打滑' : '驱动安全'}
              </div>
            </div>
          </div>

        </div>

        {/* ================= 右半区：精细 G 值看板 + 四轮工字底盘分布 ================= */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingLeft: 8,
          boxSizing: 'border-box'
        }}>
          
          {/* 横/纵向 G 力看板 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: 4, border: '1px solid rgba(48,54,61,0.2)' }}>
              <div style={{ fontSize: 8.5, color: '#8b949e', display: 'flex', justifyContent: 'space-between' }}>
                <span>横向力 (过弯)</span>
                <span>峰: {peakLat.toFixed(2)}G</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', color: '#fff', marginTop: 2 }}>
                {Math.abs(latG).toFixed(2)} G
                <span style={{ fontSize: 8, marginLeft: 4, color: latG < -0.1 ? '#58a6ff' : latG > 0.1 ? '#f85149' : '#8b949e' }}>
                  {latG < -0.1 ? '←右弯' : latG > 0.1 ? '左弯→' : ''}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: 4, border: '1px solid rgba(48,54,61,0.2)' }}>
              <div style={{ fontSize: 8.5, color: '#8b949e', display: 'flex', justifyContent: 'space-between' }}>
                <span>纵向力 (油刹)</span>
                <span>峰: {peakLon.toFixed(2)}G</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', color: '#fff', marginTop: 2 }}>
                {Math.abs(lonG).toFixed(2)} G
                <span style={{ fontSize: 8, marginLeft: 4, color: lonG > 0.1 ? '#f85149' : lonG < -0.1 ? '#3fb950' : '#8b949e' }}>
                  {lonG > 0.1 ? '↑刹车' : lonG < -0.1 ? '↓给油' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* 四轮物理分布图 (2x2 工字底盘视图) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            position: 'relative'
          }}>
            {/* 前轴 */}
            <div style={{ display: 'flex', gap: 16 }}>
              {renderWheelCard(flInfo)}
              {renderWheelCard(frInfo)}
            </div>
            
            {/* 极简底盘工字钢轴线 */}
            <div style={{ width: 2, height: 18, background: 'rgba(88,166,255,0.2)' }} />

            {/* 后轴 */}
            <div style={{ display: 'flex', gap: 16 }}>
              {renderWheelCard(rlInfo)}
              {renderWheelCard(rrInfo)}
            </div>
          </div>

        </div>
      </div>

      {/* 动画与高对比度警报闪烁样式 */}
      <style>{`
        .abs-active-glow {
          box-shadow: 0 0 16px #f85149;
          animation: alarmBlink 0.15s infinite alternate;
        }
        .tc-active-glow {
          box-shadow: 0 0 16px #f0883e;
          animation: alarmBlink 0.25s infinite alternate;
        }
        .wheel-flash-heavy {
          animation: borderBlinkHeavy 0.15s infinite alternate;
        }
        .wheel-flash-light {
          animation: borderBlinkLight 0.3s infinite alternate;
        }
        @keyframes alarmBlink {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.3); }
        }
        @keyframes borderBlinkHeavy {
          0% { border-color: rgba(248, 81, 73, 0.4); box-shadow: 0 0 3px rgba(248, 81, 73, 0.2); }
          100% { border-color: #f85149; box-shadow: 0 0 12px #f85149; }
        }
        @keyframes borderBlinkLight {
          0% { border-color: rgba(210, 153, 34, 0.4); }
          100% { border-color: #d29922; box-shadow: 0 0 8px rgba(210, 153, 34, 0.4); }
        }
        @keyframes textPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes screenWarning {
          0% { border-color: rgba(248, 81, 73, 0.2); box-shadow: inset 0 0 20px rgba(248, 81, 73, 0.2); }
          100% { border-color: rgba(248, 81, 73, 0.8); box-shadow: inset 0 0 40px rgba(248, 81, 73, 0.6); }
        }
      `}</style>
    </div>
  );
}
