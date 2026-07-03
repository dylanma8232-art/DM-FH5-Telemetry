import React, { useMemo, useRef, useEffect } from 'react';

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
  if (val > 0.85 || val < 0.15) return '#f85149'; // 避震触底或离地极限
  if (val > 0.7 || val < 0.3) return '#d29922';  // 重心大幅转移
  return '#3fb950';                              // 处于稳定运作范围
}

export function BrakingGripDynamicsPanel({ data }) {
  const telemetryData = data || {};
  const acceleration = telemetryData.acceleration || { x: 0, y: 0, z: 0 };
  const suspension = telemetryData.suspension || { frontLeft: 0.5, frontRight: 0.5, rearLeft: 0.5, rearRight: 0.5 };
  const tireSlipRatio = telemetryData.tireSlipRatio || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  const tireCombinedSlip = telemetryData.tireCombinedSlip || { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };

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

  // 防抱死与防打滑状态灯
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

  // 重力与G力物理映射
  const maxG = 2.0; 
  const size = 160;
  const center = size / 2;
  const radius = size / 2 - 20;

  const latG = acceleration.x || 0;
  const lonG = acceleration.z || 0; 

  const clampG = (val) => Math.max(-maxG, Math.min(maxG, val));
  const rawX = center + (clampG(latG) / maxG) * radius;
  const rawY = center - (clampG(lonG) / maxG) * radius;

  // 四轮车轴映射（已精简轮速及差速，只显示抓地力与避震行程）
  const flInfo = { label: '前左 (FL)', slip: tireCombinedSlip.frontLeft || 0, ratio: tireSlipRatio.frontLeft || 0, susp: suspension.frontLeft || 0.5, status: wheelStatuses.FL };
  const frInfo = { label: '前右 (FR)', slip: tireCombinedSlip.frontRight || 0, ratio: tireSlipRatio.frontRight || 0, susp: suspension.frontRight || 0.5, status: wheelStatuses.FR };
  const rlInfo = { label: '后左 (RL)', slip: tireCombinedSlip.rearLeft || 0, ratio: tireSlipRatio.rearLeft || 0, susp: suspension.rearLeft || 0.5, status: wheelStatuses.RL };
  const rrInfo = { label: '后右 (RR)', slip: tireCombinedSlip.rearRight || 0, ratio: tireSlipRatio.rearRight || 0, susp: suspension.rearRight || 0.5, status: wheelStatuses.RR };

  const renderWheelCard = (wheel) => {
    const grip = getGripInfo(wheel.slip);
    const suspColor = getSuspColor(wheel.susp);
    const isSlipping = wheel.status.type !== 'none';

    return (
      <div style={{
        background: isSlipping ? 'rgba(248, 81, 73, 0.06)' : 'linear-gradient(135deg, #161b22 0%, #0d1117 100%)',
        border: `1px solid ${isSlipping ? wheel.status.color : 'rgba(48, 54, 61, 0.6)'}`,
        borderRadius: 6,
        padding: '6px 10px',
        width: 170,
        height: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        transition: 'all 0.1s ease',
        boxShadow: wheel.status.heavy ? `0 0 8px ${wheel.status.color}` : 'none'
      }}>
        {/* 车轮标识与实时状态标签 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: isSlipping ? wheel.status.color : '#c9d1d9', fontFamily: 'monospace' }}>
            {wheel.label}
          </span>
          <span style={{
            fontSize: 8, color: '#fff', fontWeight: 800,
            background: isSlipping ? wheel.status.color : 'rgba(255,255,255,0.06)',
            padding: '1px 4px', borderRadius: 3
          }}>
            {isSlipping ? (wheel.status.type === 'abs' ? 'ABS抱死' : 'TCS打滑') : `滑移:${wheel.ratio.toFixed(1)}`}
          </span>
        </div>

        {/* 抓地力 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#8b949e' }}>
            <span>抓地力</span>
            <strong style={{ color: grip.color, fontFamily: 'monospace', fontSize: 9 }}>{grip.val.toFixed(0)}%</strong>
          </div>
          <div style={{ height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${grip.val}%`, height: '100%', background: grip.color, borderRadius: 2 }} />
          </div>
        </div>

        {/* 避震行程 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#8b949e' }}>
            <span>避震压缩</span>
            <strong style={{ color: suspColor, fontFamily: 'monospace', fontSize: 9 }}>{(wheel.susp * 100).toFixed(0)}%</strong>
          </div>
          <div style={{ height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${wheel.susp * 100}%`, height: '100%', background: suspColor, borderRadius: 2 }} />
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
      padding: '10px 14px'
    }}>
      {/* 模块总标题 */}
      <div style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: 'var(--accent)',
        letterSpacing: 1,
        marginBottom: 8,
        flexShrink: 0,
        borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
        paddingBottom: 4
      }}>
        底盘极限与重力监测
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 0
      }}>
        {/* 左半区：重力感应仪与防抱死灯 */}
        <div style={{
          flex: '0 0 190px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(48, 54, 61, 0.3)',
          paddingRight: 16,
          height: '100%',
          boxSizing: 'border-box'
        }}>
          {/* 重力与摩擦圆感应仪 */}
          <div style={{ position: 'relative', width: size, height: size, marginBottom: 4 }}>
            <svg width={size} height={size} style={{ background: '#0d1117', borderRadius: '50%', border: '1px solid #30363d' }}>
              {/* 十字参考轴线 */}
              <line x1={center} y1={18} x2={center} y2={size - 18} stroke="#21262d" strokeWidth="1" />
              <line x1={18} y1={center} x2={size - 18} y2={center} stroke="#21262d" strokeWidth="1" />
              {/* 1.0G / 2.0G 参考圆圈 */}
              <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#21262d" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={center} cy={center} r={radius} fill="none" stroke="#30363d" strokeWidth="1" />

              {/* 四个方向的操作指示文字：解释向右转时重心向左偏移等逻辑 */}
              <text x={center} y={12} fill="#8b949e" fontSize="7.5" fontWeight={600} textAnchor="middle">↑ 前倾 (重刹车)</text>
              <text x={center} y={size - 4} fill="#8b949e" fontSize="7.5" fontWeight={600} textAnchor="middle">↓ 后仰 (大油门)</text>
              <text x={4} y={center + 3} fill="#8b949e" fontSize="7.5" fontWeight={600} textAnchor="start">←左力(右转)</text>
              <text x={size - 4} y={center + 3} fill="#8b949e" fontSize="7.5" fontWeight={600} textAnchor="end">(左转)右力→</text>

              <text x={center + 4} y={center - radius * 0.5 + 3} fill="#484f58" fontSize="7.5" fontFamily="monospace">1.0G</text>
              <text x={center + 4} y={center - radius + 8} fill="#484f58" fontSize="7.5" fontFamily="monospace">2.0G</text>

              {/* 历史重力G力点迹 */}
              {gHistoryRef.current.map((pt, i) => {
                const px = center + (clampG(pt.x) / maxG) * radius;
                const py = center - (clampG(pt.z) / maxG) * radius;
                const opacity = (i + 1) / maxHistory * 0.3;
                return (
                  <circle key={i} cx={px} cy={py} r="2" fill="#58a6ff" opacity={opacity} />
                );
              })}

              {/* 当前实时重力G力红球 */}
              <circle cx={rawX} cy={rawY} r="5.5" fill="#f85149" style={{ transition: 'all 0.05s linear' }} />
            </svg>
          </div>

          <div style={{ display: 'flex', gap: 10, fontSize: 9.5, fontFamily: 'monospace', color: '#c9d1d9', marginBottom: 6 }}>
            <span>横向: <strong style={{ color: Math.abs(latG) > 1.2 ? '#f85149' : '#c9d1d9' }}>{latG.toFixed(2)}G</strong></span>
            <span>纵向: <strong style={{ color: Math.abs(lonG) > 1.2 ? '#f85149' : '#c9d1d9' }}>{lonG.toFixed(2)}G</strong></span>
          </div>

          {/* 抱死/打滑 警报指示灯 */}
          <div style={{ display: 'flex', gap: 6, width: '100%' }}>
            <div style={{
              flex: 1,
              padding: '4px 0',
              borderRadius: 3,
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 800,
              background: isABSActive ? 'rgba(248, 81, 73, 0.2)' : '#161b22',
              border: `1px solid ${isABSActive ? '#f85149' : '#30363d'}`,
              color: isABSActive ? '#f85149' : '#484f58',
              animation: isABSActive ? 'absFlash 0.3s infinite' : 'none'
            }}>
              ABS抱死
            </div>
            <div style={{
              flex: 1,
              padding: '4px 0',
              borderRadius: 3,
              textAlign: 'center',
              fontSize: 9,
              fontWeight: 800,
              background: isTCSActive ? 'rgba(240, 136, 62, 0.2)' : '#161b22',
              border: `1px solid ${isTCSActive ? '#f0883e' : '#30363d'}`,
              color: isTCSActive ? '#f0883e' : '#484f58',
              animation: isTCSActive ? 'tcFlash 0.3s infinite' : 'none'
            }}>
              TCS打滑
            </div>
          </div>

          {/* 新增 G力球文字白话讲解说明 */}
          <div style={{
            marginTop: 8,
            fontSize: 8,
            color: '#8b949e',
            lineHeight: 1.3,
            background: 'rgba(0,0,0,0.2)',
            padding: '4px 6px',
            borderRadius: 4,
            border: '1px dashed #30363d',
            width: '100%',
            textAlign: 'left',
            boxSizing: 'border-box'
          }}>
            💡 <b>重心偏移说明</b>：
            <br />红球位置代表当前车身重心的位移方向。前移表示重刹车负载压在前悬挂，左右位移代表过弯时的离心力偏移。红球越靠边缘，越考验抓地力极限。
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
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            height: '100%',
            boxSizing: 'border-box',
            position: 'relative'
          }}>
            {/* 左侧两轮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              {renderWheelCard(flInfo)}
              {renderWheelCard(rlInfo)}
            </div>

            {/* 中心抽象车辆骨架指示线 */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: 20,
              position: 'relative',
              opacity: 0.5
            }}>
              {/* 前轴线 */}
              <div style={{
                width: 20,
                height: 2,
                background: 'linear-gradient(to right, rgba(88,166,255,0.4), rgba(88,166,255,0.05), rgba(88,166,255,0.4))',
                position: 'absolute',
                top: '36px'
              }} />
              {/* 主传动轴线 */}
              <div style={{
                width: 2,
                height: 100,
                background: 'linear-gradient(to bottom, rgba(88,166,255,0.05) 0%, rgba(88,166,255,0.4) 50%, rgba(88,166,255,0.05) 100%)',
                position: 'absolute',
                top: '36px'
              }} />
              {/* 后轴线 */}
              <div style={{
                width: 20,
                height: 2,
                background: 'linear-gradient(to right, rgba(88,166,255,0.4), rgba(88,166,255,0.05), rgba(88,166,255,0.4))',
                position: 'absolute',
                bottom: '36px'
              }} />
            </div>

            {/* 右侧两轮 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
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
