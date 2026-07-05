import React, { useMemo, useRef, useEffect, useState } from 'react';

// 刹车防抱死与牵引力控制判定阈值 (基于多代理物理模型)
function getABSTCStatus(wheelRotSpeed, speedKmh, brake, accel, combinedSlip) {
  // ABS: 踩下刹车，且车速大于 20km/h，某轮角速度趋近于 0
  if (brake > 0 && speedKmh > 20 && wheelRotSpeed < 5) {
    return { type: 'abs', color: '#f85149', text: 'ABS 抱死', active: true };
  }
  // TC: 踩下油门，且综合滑动率(失去抓地力) > 1.2
  if (accel > 0 && combinedSlip > 1.2) {
    return { type: 'tc', color: '#f85149', text: 'TCS 打滑', active: true };
  }
  // 危险边缘提示 (可选项)
  if (accel > 0 && combinedSlip > 1.0) {
    return { type: 'tc', color: '#d29922', text: 'TCS 临界', active: false };
  }
  
  return { type: 'none', color: '#3fb950', text: '正常', active: false };
}

// 获取抓地力状态信息
function getGripInfo(slip) {
  const grip = Math.max(0, 100 - slip * 50);
  if (grip > 75) return { val: grip, color: '#3fb950', text: '充足' };
  if (grip > 45) return { val: grip, color: '#d29922', text: '临界' };
  return { val: grip, color: '#f85149', text: '失控' };
}

export function BrakingGripDynamicsPanel({ data }) {
  const telemetryData = data || {};
  const acceleration = telemetryData.acceleration || { x: 0, y: 0, z: 0 };
  const suspension = telemetryData.suspension || { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 };
  const tireSlipRatio = telemetryData.tireSlipRatio || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const tireCombinedSlip = telemetryData.tireCombinedSlip || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const wheelRotationSpeed = telemetryData.wheelRotationSpeed || { frontLeft: 100, frontRight: 100, rearLeft: 100, rearRight: 100 };
  const speedKmh = telemetryData.speedKmh || 0;
  const controls = telemetryData.controls || { brake: 0, accel: 0 };
  const car = telemetryData.car || {};

  // 游戏的原始 UDP 输出以米/秒² (m/s²) 为单位，必须除以 9.80665 转换成 G 力
  const latG = (acceleration.x || 0) / 9.80665; 
  const lonG = (acceleration.z || 0) / 9.80665; 

  // 峰值记录
  const [peakLat, setPeakLat] = useState(0);
  const [peakLon, setPeakLon] = useState(0);

  // 当车辆更换或比赛重置时，清空极值记录
  const carOrdinal = car.ordinal;
  const isRaceOn = telemetryData.isRaceOn;
  useEffect(() => {
    setPeakLat(0);
    setPeakLon(0);
  }, [carOrdinal, isRaceOn]);

  useEffect(() => {
    const absLat = Math.abs(latG);
    const absLon = Math.abs(lonG);
    if (absLat > peakLat) setPeakLat(absLat);
    if (absLon > peakLon) setPeakLon(absLon);
  }, [latG, lonG, peakLat, peakLon]);

  // 根据车辆级别动态推算重力极限线
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
    const brake = controls.brake || 0;
    const accel = controls.accel || 0;
    return {
      FL: getABSTCStatus(wheelRotationSpeed.frontLeft || 0, speedKmh, brake, accel, tireCombinedSlip.frontLeft || 0),
      FR: getABSTCStatus(wheelRotationSpeed.frontRight || 0, speedKmh, brake, accel, tireCombinedSlip.frontRight || 0),
      RL: getABSTCStatus(wheelRotationSpeed.rearLeft || 0, speedKmh, brake, accel, tireCombinedSlip.rearLeft || 0),
      RR: getABSTCStatus(wheelRotationSpeed.rearRight || 0, speedKmh, brake, accel, tireCombinedSlip.rearRight || 0),
    };
  }, [wheelRotationSpeed, speedKmh, controls, tireCombinedSlip]);

  const isABSActive = Object.values(wheelStatuses).some(s => s.type === 'abs' && s.active);
  const isTCSActive = Object.values(wheelStatuses).some(s => s.type === 'tc' && s.active);

  // 决定当前安全利用率颜色
  let safetyColor = '#3fb950'; // 稳定
  let safetyText = '稳定行驶';
  if (utilizationPercent > 95) {
    safetyColor = '#f85149'; // 突破极限
    safetyText = '超越抓地极限';
  } else if (utilizationPercent > 75) {
    safetyColor = '#d29922'; // 黄金物理极限区
    safetyText = '极限边缘 (最佳)';
  }

  // 四轮数据整理
  const tires = useMemo(() => {
    return {
      FL: { label: 'FL', grip: getGripInfo(tireCombinedSlip.frontLeft || 0), status: wheelStatuses.FL },
      FR: { label: 'FR', grip: getGripInfo(tireCombinedSlip.frontRight || 0), status: wheelStatuses.FR },
      RL: { label: 'RL', grip: getGripInfo(tireCombinedSlip.rearLeft || 0), status: wheelStatuses.RL },
      RR: { label: 'RR', grip: getGripInfo(tireCombinedSlip.rearRight || 0), status: wheelStatuses.RR },
    };
  }, [tireCombinedSlip, wheelStatuses]);
  const renderTireNode = (tire) => {
    const isSlipping = tire.status.type !== 'none' && tire.status.active;
    const color = isSlipping ? tire.status.color : tire.grip.color;
    return (
      <div style={{
        width: 56,
        height: 80,
        borderRadius: 6,
        border: `2px solid ${isSlipping ? '#fff' : 'rgba(48, 54, 61, 0.9)'}`,
        background: isSlipping ? color : 'rgba(22, 27, 34, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${isSlipping ? '#fff' : 'rgba(48, 54, 61, 0.9)'}`,
        boxShadow: isSlipping ? `0 0 8px ${color}` : 'none',
        transition: 'all 0.08s linear'
      }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: isSlipping ? '#fff' : '#c9d1d9' }}>{tire.label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: isSlipping ? '#fff' : '#8b949e' }}>{tire.grip.val.toFixed(0)}%</span>
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
      padding: '12px 16px',
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

      {/* 标题 */}
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--accent)',
        letterSpacing: 1,
        marginBottom: 10,
        flexShrink: 0,
        borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
        paddingBottom: 6
      }}>
        底盘动态与抓地力
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0
      }}>
        {/* 左侧：横向过弯力 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>横向过弯力</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 16, color: latG < -0.1 ? '#f85149' : 'var(--text-muted)' }}>{latG < -0.1 ? '⬅' : ' '}</span>
            <span style={{ fontSize: 32, fontWeight: 900, fontFamily: 'monospace', color: '#fff', lineHeight: 1 }}>
              {Math.abs(latG).toFixed(1)}<span style={{ fontSize: 14, color: '#8b949e' }}>G</span>
            </span>
            <span style={{ fontSize: 16, color: latG > 0.1 ? '#58a6ff' : 'var(--text-muted)' }}>{latG > 0.1 ? '➡' : ' '}</span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>峰值: {peakLat.toFixed(2)} G</span>
        </div>

        {/* 中间核心：状态徽章与四轮抓地力 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {/* ABS / TCS 徽章 */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{
              padding: '4px 16px',
              borderRadius: 4,
              background: isABSActive ? '#f85149' : 'rgba(22,27,34,0.8)',
              border: `1px solid ${isABSActive ? '#ff7b72' : '#30363d'}`,
              color: isABSActive ? '#fff' : '#484f58',
              fontWeight: 900,
              fontFamily: 'monospace',
              fontSize: 14,
              boxShadow: isABSActive ? '0 0 10px #f85149' : 'none',
              transition: 'all 0.1s'
            }}>
              ABS
            </div>
            <div style={{
              padding: '4px 16px',
              borderRadius: 4,
              background: isTCSActive ? '#f0883e' : 'rgba(22,27,34,0.8)',
              border: `1px solid ${isTCSActive ? '#f8a060' : '#30363d'}`,
              color: isTCSActive ? '#fff' : '#484f58',
              fontWeight: 900,
              fontFamily: 'monospace',
              fontSize: 14,
              boxShadow: isTCSActive ? '0 0 10px #f0883e' : 'none',
              transition: 'all 0.1s'
            }}>
              TCS
            </div>
          </div>

          {/* 轮胎抓地力 2x2 网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {renderTireNode(tires.FL)}
            {renderTireNode(tires.FR)}
            {renderTireNode(tires.RL)}
            {renderTireNode(tires.RR)}
          </div>
        </div>

        {/* 右侧：纵向油刹力 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>纵向油刹力</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 16, color: lonG > 0.1 ? '#3fb950' : 'var(--text-muted)', lineHeight: 1 }}>{lonG > 0.1 ? '⬆' : ' '}</span>
            <span style={{ fontSize: 32, fontWeight: 900, fontFamily: 'monospace', color: '#fff', lineHeight: 1 }}>
              {Math.abs(lonG).toFixed(1)}<span style={{ fontSize: 14, color: '#8b949e' }}>G</span>
            </span>
            <span style={{ fontSize: 16, color: lonG < -0.1 ? '#f85149' : 'var(--text-muted)', lineHeight: 1 }}>{lonG < -0.1 ? '⬇' : ' '}</span>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>峰值: {peakLon.toFixed(2)} G</span>
        </div>
      </div>

      {/* 警报与高对比度闪烁样式 */}
      <style>{`
        .abs-active-glow {
          box-shadow: 0 0 16px #f85149;
          animation: alarmBlink 0.15s infinite alternate;
        }
        .tc-active-glow {
          box-shadow: 0 0 16px #f0883e;
          animation: alarmBlink 0.25s infinite alternate;
        }
        @keyframes alarmBlink {
          0% { filter: brightness(0.9); }
          100% { filter: brightness(1.4); }
        }
        @keyframes screenWarning {
          0% { border-color: rgba(248, 81, 73, 0.2); box-shadow: inset 0 0 15px rgba(248, 81, 73, 0.2); }
          100% { border-color: rgba(248, 81, 73, 0.8); box-shadow: inset 0 0 30px rgba(248, 81, 73, 0.5); }
        }
      `}</style>
    </div>
  );
}
