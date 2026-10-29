import { useMemo, useEffect, useState } from 'react';
import { useTelemetryValue } from '../../hooks/useTelemetrySelector';

// 轮胎抱死检测：踩刹车 + 车速>20km/h + 轮速剧降到0
function getWheelLockupStatus(wheelRotSpeed, speedKmh, brake) {
  if (brake > 0 && speedKmh > 20 && wheelRotSpeed < 5) {
    return { active: true };
  }
  return { active: false };
}

export function BrakingGripDynamicsPanel({ data }) {
  // P7：未显式传入时自订阅整帧遥测（等价于拆分前由 DashboardPage 逐帧传参）
  const liveTelemetry = useTelemetryValue();
  const telemetryData = data || liveTelemetry;
  const acceleration = telemetryData.acceleration || { x: 0, y: 0, z: 0 };
  const wheelRotationSpeed = telemetryData.wheelRotationSpeed || { frontLeft: 100, frontRight: 100, rearLeft: 100, rearRight: 100 };
  const speedKmh = telemetryData.speedKmh || 0;
  const controls = telemetryData.controls || { brake: 0, accel: 0 };
  const car = telemetryData.car || {};

  const latG = (acceleration.x || 0) / 9.80665;
  const lonG = (acceleration.z || 0) / 9.80665;

  const [peakLat, setPeakLat] = useState(0);
  const [peakLon, setPeakLon] = useState(0);

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

  const limitG = useMemo(() => {
    const cls = car.class;
    if (cls === 0) return 0.95;
    if (cls === 1) return 1.15;
    if (cls === 2) return 1.35;
    if (cls === 3) return 1.55;
    if (cls === 4) return 1.85;
    if (cls === 5) return 2.15;
    if (cls === 6) return 2.45;
    return 1.60;
  }, [car.class]);

  const currentTotalG = Math.sqrt(latG * latG + lonG * lonG);
  const utilizationPercent = Math.min((currentTotalG / limitG) * 100, 100);

  const brake = controls.brake || 0;
  const lockups = useMemo(() => ({
    FL: getWheelLockupStatus(wheelRotationSpeed.frontLeft || 0, speedKmh, brake),
    FR: getWheelLockupStatus(wheelRotationSpeed.frontRight || 0, speedKmh, brake),
    RL: getWheelLockupStatus(wheelRotationSpeed.rearLeft || 0, speedKmh, brake),
    RR: getWheelLockupStatus(wheelRotationSpeed.rearRight || 0, speedKmh, brake),
  }), [wheelRotationSpeed, speedKmh, brake]);

  const isAnyLocked = Object.values(lockups).some(l => l.active);

  let safetyColor = '#3fb950';
  let safetyText = '稳定行驶';
  if (utilizationPercent > 95) {
    safetyColor = '#f85149';
    safetyText = '超越抓地极限';
  } else if (utilizationPercent > 75) {
    safetyColor = '#d29922';
    safetyText = '极限边缘 (最佳)';
  }

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

      {isAnyLocked && (
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

        {/* 中间：抱死提示灯 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{
            padding: '6px 20px',
            borderRadius: 4,
            background: isAnyLocked ? '#f85149' : 'rgba(22,27,34,0.8)',
            border: `1px solid ${isAnyLocked ? '#ff7b72' : '#30363d'}`,
            color: isAnyLocked ? '#fff' : '#484f58',
            fontWeight: 900,
            fontFamily: 'monospace',
            fontSize: 14,
            boxShadow: isAnyLocked ? '0 0 12px #f85149' : 'none',
            transition: 'all 0.1s'
          }}>
            {isAnyLocked ? '⚠ 轮胎抱死' : '轮胎正常'}
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

      <style>{`
        @keyframes screenWarning {
          0% { border-color: rgba(248, 81, 73, 0.2); box-shadow: inset 0 0 15px rgba(248, 81, 73, 0.2); }
          100% { border-color: rgba(248, 81, 73, 0.8); box-shadow: inset 0 0 30px rgba(248, 81, 73, 0.5); }
        }
      `}</style>
    </div>
  );
}
