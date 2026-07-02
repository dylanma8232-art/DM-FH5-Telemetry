import React, { useMemo, useRef, useEffect } from 'react';

// 轮胎半径（Forza 平均值，单位 m）
const TIRE_RADIUS = 0.35;

// 刹车防抱死与牵引力控制判定阈值
function getABSTCStatus(ratio) {
  if (ratio < -0.3) return { type: 'abs', color: '#f85149', heavy: true };
  if (ratio < -0.15) return { type: 'abs', color: '#d29922', heavy: false };
  if (ratio > 0.3) return { type: 'tc', color: '#f85149', heavy: true };
  if (ratio > 0.15) return { type: 'tc', color: '#d29922', heavy: false };
  return { type: 'none', color: '#3fb950', heavy: false };
}

// 获取抓地力状态信息
function getGripInfo(slip) {
  const grip = Math.max(0, 100 - slip * 50);
  if (grip > 75) return { val: grip, color: '#3fb950', text: '充足' };
  if (grip > 45) return { val: grip, color: '#d29922', text: '滑移' };
  return { val: grip, color: '#f85149', text: '失控' };
}

// 避震行程颜色
function getSuspColor(val) {
  if (val > 0.85 || val < 0.15) return '#f85149'; // 避震底极限
  if (val > 0.7 || val < 0.3) return '#d29922';  // 重量大幅度转移
  return '#3fb950';                              // 稳定范围
}

export function BrakingGripDynamicsPanel({ data }) {
  const telemetryData = data || {};
  const acceleration = telemetryData.acceleration || { x: 0, y: 0, z: 0 };
  const suspension = telemetryData.suspension || { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 };
  const tireSlipRatio = telemetryData.tireSlipRatio || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const tireCombinedSlip = telemetryData.tireCombinedSlip || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const wheelRotationSpeed = telemetryData.wheelRotationSpeed || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const vehicleSpeedKmh = telemetryData.speedKmh || 0;

  // 每轮线速度 km/h
  const wheelSpeedKmh = {
    frontLeft:  Math.abs(wheelRotationSpeed.frontLeft  || 0) * TIRE_RADIUS * 3.6,
    frontRight: Math.abs(wheelRotationSpeed.frontRight || 0) * TIRE_RADIUS * 3.6,
    rearLeft:   Math.abs(wheelRotationSpeed.rearLeft   || 0) * TIRE_RADIUS * 3.6,
    rearRight:  Math.abs(wheelRotationSpeed.rearRight  || 0) * TIRE_RADIUS * 3.6,
  };

  // 记录最近的历史 G-Force 点用于画摩擦圆轨迹
  const gHistoryRef = useRef([]);
  const maxHistory = 25;

  useEffect(() => {
    if (data) {
      gHistoryRef.current.push({ x: acceleration.x, z: acceleration.z });
      if (gHistoryRef.current.length > maxHistory) {
        gHistoryRef.current.shift();
      }
    }
  }, [acceleration.x, acceleration.z, data]);

  // ABS & TCS 动态状态灯
  const wheelStatuses = useMemo(() => {
    return {
      FL: getABSTCStatus(tireSlipRatio.frontLeft || 0),
      FR: getABSTCStatus(tireSlipRatio.frontRight || 0),
      RL: getABSTCStatus(tireSlipRatio.rearLeft || 0),
      RR: getABSTCStatus(tireSlipRatio.rearRight || 0),
    };
  }, [tireSlipRatio]);

  const isABSActive = Object.values(wheelStatuses).some(s => s.type === 'abs');
  const isTCSActive = Object.values(wheelStatuses).some(s => s.type === 'tc');

  // G-Force 物理映射
  const maxG = 2.0; 
  const size = 150;
  const center = size / 2;
  const radius = size / 2 - 8;

  const latG = acceleration.x || 0;
  const lonG = acceleration.z || 0; 

  const clampG = (val) => Math.max(-maxG, Math.min(maxG, val));
  const rawX = center + (clampG(latG) / maxG) * radius;
  const rawY = center - (clampG(lonG) / maxG) * radius;

  // 车轮映射
  const flInfo = { label: '前左', slip: tireCombinedSlip.frontLeft || 0, ratio: tireSlipRatio.frontLeft || 0, susp: suspension.frontLeft || 0.5, status: wheelStatuses.FL, wSpd: wheelSpeedKmh.frontLeft };
  const frInfo = { label: '前右', slip: tireCombinedSlip.frontRight || 0, ratio: tireSlipRatio.frontRight || 0, susp: suspension.frontRight || 0.5, status: wheelStatuses.FR, wSpd: wheelSpeedKmh.frontRight };
  const rlInfo = { label: '后左', slip: tireCombinedSlip.rearLeft || 0, ratio: tireSlipRatio.rearLeft || 0, susp: suspension.rearLeft || 0.5, status: wheelStatuses.RL, wSpd: wheelSpeedKmh.rearLeft };
  const rrInfo = { label: '后右', slip: tireCombinedSlip.rearRight || 0, ratio: tireSlipRatio.rearRight || 0, susp: suspension.rearRight || 0.5, status: wheelStatuses.RR, wSpd: wheelSpeedKmh.rearRight };

  const renderWheelCard = (wheel) => {
    const grip = getGripInfo(wheel.slip);
    const suspColor = getSuspColor(wheel.susp);
    const isSlipping = wheel.status.type !== 'none';

    // 轮速差
    const delta = wheel.wSpd - vehicleSpeedKmh;
    const deltaColor = Math.abs(delta) < 3 ? '#3fb950' : Math.abs(delta) < 10 ? '#d29922' : '#f85149';
    const deltaSign = delta > 0 ? '+' : '';

    return (
      <div style={{
        background: isSlipping ? 'rgba(248, 81, 73, 0.08)' : 'linear-gradient(135deg, #161b22 0%, #0d1117 100%)',
        border: `1px solid ${isSlipping ? wheel.status.color : 'rgba(48, 54, 61, 0.8)'}`,
        borderRadius: 8,
        padding: '10px 14px',
        width: 220,
        height: 135,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        transition: 'all 0.1s ease',
        boxShadow: wheel.status.heavy ? `0 0 10px ${wheel.status.color}` : 'none'
      }}>
        {/* 车轮与打滑标识 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: isSlipping ? wheel.status.color : '#c9d1d9', fontFamily: 'monospace' }}>
            {wheel.label}
          </span>
          <span style={{
            fontSize: 10, color: '#fff', fontWeight: 800,
            background: isSlipping ? wheel.status.color : 'rgba(255,255,255,0.08)',
            padding: '2px 6px', borderRadius: 4
          }}>
            {isSlipping ? (wheel.status.type === 'abs' ? '抱死' : '打滑') : `滑移率: ${wheel.ratio.toFixed(2)}`}
          </span>
        </div>

        {/* 轮速与差值 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10.5, color: '#8b949e', fontWeight: 600 }}>轮速</span>
          <span style={{ fontFamily: 'monospace' }}>
            <strong style={{ color: '#c9d1d9', fontSize: 15 }}>{wheel.wSpd.toFixed(1)}</strong>
            <span style={{ color: '#484f58', fontSize: 9 }}> 公里/小时 </span>
            <strong style={{ color: deltaColor, fontSize: 12 }}>{deltaSign}{delta.toFixed(1)}</strong>
          </span>
        </div>

        {/* 抓地力 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#8b949e' }}>
            <span>抓地力</span>
            <strong style={{ color: grip.color, fontFamily: 'monospace', fontSize: 11.5 }}>{grip.val.toFixed(0)}%</strong>
          </div>
          <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${grip.val}%`, height: '100%', background: grip.color, borderRadius: 3 }} />
          </div>
        </div>

        {/* 避震行程 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#8b949e' }}>
            <span>避震行程</span>
            <strong style={{ color: suspColor, fontFamily: 'monospace', fontSize: 11.5 }}>{(wheel.susp * 100).toFixed(0)}%</strong>
          </div>
          <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${wheel.susp * 100}%`, height: '100%', background: suspColor, borderRadius: 3 }} />
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
      padding: '12px 16px'
    }}>
      {/* 统一楼层总标题 */}
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
        底盘极限与重力监测
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0
      }}>
        {/* 左半区：重力感应仪与防抱死灯 */}
        <div style={{
          flex: '0 0 170px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(48, 54, 61, 0.4)',
          paddingRight: 24,
          height: '100%'
        }}>
          {/* SVG Friction Circle */}
          <div style={{ position: 'relative', width: size, height: size, marginBottom: 8 }}>
            <svg width={size} height={size} style={{ background: '#0d1117', borderRadius: '50%', border: '1px solid #30363d' }}>
              <line x1={center} y1={5} x2={center} y2={size - 5} stroke="#21262d" strokeWidth="1" />
              <line x1={5} y1={center} x2={size - 5} y2={center} stroke="#21262d" strokeWidth="1" />
              <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#21262d" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={center} cy={center} r={radius} fill="none" stroke="#30363d" strokeWidth="1" />

              <text x={center + 4} y={center - radius * 0.5 + 3} fill="#484f58" fontSize="8" fontFamily="monospace">1.0G</text>
              <text x={center + 4} y={center - radius + 10} fill="#484f58" fontSize="8" fontFamily="monospace">2.0G</text>

              {gHistoryRef.current.map((pt, i) => {
                const px = center + (clampG(pt.x) / maxG) * radius;
                const py = center - (clampG(pt.z) / maxG) * radius;
                const opacity = (i + 1) / maxHistory * 0.4;
                return (
                  <circle key={i} cx={px} cy={py} r="2.5" fill="#58a6ff" opacity={opacity} />
                );
              })}

              <circle cx={rawX} cy={rawY} r="6" fill="#f85149" style={{ transition: 'all 0.05s linear' }} />
            </svg>
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: 'monospace', color: '#c9d1d9', marginBottom: 8 }}>
            <span>横向: <strong>{latG.toFixed(2)}G</strong></span>
            <span>纵向: <strong>{lonG.toFixed(2)}G</strong></span>
          </div>

          {/* 抱死/打滑 警报状态灯 */}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <div style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 4,
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 800,
              background: isABSActive ? 'rgba(248, 81, 73, 0.2)' : '#161b22',
              border: `1px solid ${isABSActive ? '#f85149' : '#30363d'}`,
              color: isABSActive ? '#f85149' : '#484f58',
              animation: isABSActive ? 'absFlash 0.3s infinite' : 'none'
            }}>
              防抱死
            </div>
            <div style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 4,
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 800,
              background: isTCSActive ? 'rgba(240, 136, 62, 0.2)' : '#161b22',
              border: `1px solid ${isTCSActive ? '#f0883e' : '#30363d'}`,
              color: isTCSActive ? '#f0883e' : '#484f58',
              animation: isTCSActive ? 'tcFlash 0.3s infinite' : 'none'
            }}>
              防打滑
            </div>
          </div>
        </div>

        {/* 右半区：四轮底盘十字分布监控图 */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          justifyContent: 'center',
          minWidth: 0
        }}>
          {/* 车辆十字结构化排版 - 优化间距并增加中心车辆轴指示线 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            height: 280,
            boxSizing: 'border-box',
            position: 'relative'
          }}>
            {/* 左侧两轮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
              {renderWheelCard(flInfo)}
              {renderWheelCard(rlInfo)}
            </div>

            {/* 中心抽象车辆骨架轴线指示器 */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: 32,
              position: 'relative'
            }}>
              {/* 前轴线 */}
              <div style={{
                width: 32,
                height: 2,
                background: 'linear-gradient(to right, rgba(88,166,255,0.4), rgba(88,166,255,0.1), rgba(88,166,255,0.4))',
                position: 'absolute',
                top: '64px'
              }} />
              {/* 主传动轴线 */}
              <div style={{
                width: 2,
                height: 152,
                background: 'linear-gradient(to bottom, rgba(88,166,255,0.1) 0%, rgba(88,166,255,0.4) 50%, rgba(88,166,255,0.1) 100%)',
                position: 'absolute',
                top: '64px'
              }} />
              {/* 后轴线 */}
              <div style={{
                width: 32,
                height: 2,
                background: 'linear-gradient(to right, rgba(88,166,255,0.4), rgba(88,166,255,0.1), rgba(88,166,255,0.4))',
                position: 'absolute',
                bottom: '64px'
              }} />
            </div>

            {/* 右侧两轮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
              {renderWheelCard(frInfo)}
              {renderWheelCard(rrInfo)}
            </div>
          </div>
        </div>
      </div>

      {/* 全局动画 */}
      <style>{`
        @keyframes absFlash {
          0%, 100% { background: rgba(248, 81, 73, 0.2); }
          50% { background: rgba(248, 81, 73, 0.4); }
        }
        @keyframes tcFlash {
          0%, 100% { background: rgba(240, 136, 62, 0.2); }
          50% { background: rgba(240, 136, 62, 0.4); }
        }
      `}</style>
    </div>
  );
}
