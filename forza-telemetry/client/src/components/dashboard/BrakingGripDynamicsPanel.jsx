import React, { useMemo, useRef, useEffect, useState } from 'react';

// 刹车防抱死与牵引力控制判定阈值
function getABSTCStatus(ratio) {
  if (ratio < -0.3) return { type: 'abs', color: '#f85149', text: 'ABS 抱死' };
  if (ratio < -0.15) return { type: 'abs', color: '#d29922', text: 'ABS 临界' };
  if (ratio > 0.3) return { type: 'tc', color: '#f85149', text: 'TCS 打滑' };
  if (ratio > 0.15) return { type: 'tc', color: '#d29922', text: 'TCS 滑移' };
  return { type: 'none', color: '#3fb950', text: '正常' };
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

  const latG = acceleration.x || 0; // 横向 G力 (左转为负，右转为正)
  const lonG = acceleration.z || 0; // 纵向 G力 (刹车为正/减速，加速为负)

  // 记录本场/当前运行中的最大峰值 G力
  const [peakLat, setPeakLat] = useState(0);
  const [peakLon, setPeakLon] = useState(0);

  useEffect(() => {
    const absLat = Math.abs(latG);
    const absLon = Math.abs(lonG);
    if (absLat > peakLat) setPeakLat(absLat);
    if (absLon > peakLon) setPeakLon(absLon);
  }, [latG, lonG]);

  // 根据游戏里车辆的性能级别 (Class) 动态估计抓地力极限 G 值
  // D级约 0.9G，S2/X级可达 2.2G+
  const limitG = useMemo(() => {
    const cls = car.class;
    if (cls === 0) return 0.95; // D
    if (cls === 1) return 1.15; // C
    if (cls === 2) return 1.35; // B
    if (cls === 3) return 1.55; // A
    if (cls === 4) return 1.85; // S1
    if (cls === 5) return 2.15; // S2
    if (cls === 6) return 2.45; // X
    return 1.60; // 默认中等跑车极限
  }, [car.class]);

  // 计算当前合力 G 值与极限利用率
  const currentTotalG = Math.sqrt(latG * latG + lonG * lonG);
  const utilizationPercent = Math.min((currentTotalG / limitG) * 100, 100);

  // ABS & TCS 状态
  const wheelStatuses = useMemo(() => {
    return {
      FL: getABSTCStatus(tireSlipRatio.frontLeft || 0),
      FR: getABSTCStatus(tireSlipRatio.frontRight || 0),
      RL: getABSTCStatus(tireSlipRatio.rearLeft || 0),
      RR: getABSTCStatus(tireSlipRatio.rearRight || 0),
    };
  }, [tireSlipRatio]);

  // 决定当前整体安全极限线颜色
  let safetyColor = '#3fb950'; // 稳定 (绿色)
  let safetyText = '稳定 (Stable)';
  if (utilizationPercent > 95) {
    safetyColor = '#f85149'; // 突破极限失控 (红色)
    safetyText = '滑移失控 (Sliding)';
  } else if (utilizationPercent > 75) {
    safetyColor = '#d29922'; // 边缘游走最佳状态 (黄色)
    safetyText = '极限游走 (Optimal)';
  }

  // 轮载与状态信息
  const flInfo = { label: '前左 (FL)', slip: tireCombinedSlip.frontLeft || 0, ratio: tireSlipRatio.frontLeft || 0, susp: suspension.frontLeft || 0.5, status: wheelStatuses.FL };
  const frInfo = { label: '前右 (FR)', slip: tireCombinedSlip.frontRight || 0, ratio: tireSlipRatio.frontRight || 0, susp: suspension.frontRight || 0.5, status: wheelStatuses.FR };
  const rlInfo = { label: '后左 (RL)', slip: tireCombinedSlip.rearLeft || 0, ratio: tireSlipRatio.rearLeft || 0, susp: suspension.rearLeft || 0.5, status: wheelStatuses.RL };
  const rrInfo = { label: '后右 (RR)', slip: tireCombinedSlip.rearRight || 0, ratio: tireSlipRatio.rearRight || 0, susp: suspension.rearRight || 0.5, status: wheelStatuses.RR };

  const renderWheelRow = (wheel) => {
    const grip = getGripInfo(wheel.slip);
    const suspColor = getSuspColor(wheel.susp);
    const isAlert = wheel.status.type !== 'none';

    return (
      <tr key={wheel.label} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)' }}>
        {/* 车轮代号 */}
        <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 900, color: isAlert ? wheel.status.color : '#c9d1d9', fontFamily: 'monospace' }}>
          {wheel.label}
        </td>
        
        {/* 滑移警报灯 */}
        <td style={{ padding: '6px 8px' }}>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: 3,
            background: isAlert ? wheel.status.color : 'rgba(255,255,255,0.05)',
            color: isAlert ? '#fff' : 'var(--text-muted)'
          }}>
            {isAlert ? wheel.status.text : '正常'}
          </span>
        </td>

        {/* 抓地力进度条 */}
        <td style={{ padding: '6px 8px', width: '40%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${grip.val}%`, height: '100%', background: grip.color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', width: 28, textAlign: 'right', fontWeight: 600, color: grip.color }}>
              {grip.val.toFixed(0)}%
            </span>
          </div>
        </td>

        {/* 避震器压缩率 */}
        <td style={{ padding: '6px 8px', width: '30%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${wheel.susp * 100}%`, height: '100%', background: suspColor, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', width: 28, textAlign: 'right', fontWeight: 600, color: suspColor }}>
              {(wheel.susp * 100).toFixed(0)}%
            </span>
          </div>
        </td>
      </tr>
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
      {/* 楼层总标题 */}
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
        底盘极限与重力监测（全新数据放大版）
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        minHeight: 0
      }}>
        {/* ================= 左半区：重力数值放大显示（取代G力球） ================= */}
        <div style={{
          flex: '0 0 45%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRight: '1px solid rgba(48, 54, 61, 0.3)',
          paddingRight: 16,
          boxSizing: 'border-box'
        }}>
          {/* G力数字看板区域 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 横向G力 (过弯) */}
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>横向惯性 (过弯侧向力)</span>
                <span style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>峰值: {peakLat.toFixed(2)} G</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', color: Math.abs(latG) > 1.2 ? '#f0883e' : '#fff' }}>
                  {Math.abs(latG).toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600, color: '#8b949e' }}>G</span>
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: latG < -0.1 ? '#58a6ff' : latG > 0.1 ? '#f85149' : 'var(--text-muted)'
                }}>
                  {latG < -0.1 ? '← 向右过弯 (左受力)' : latG > 0.1 ? '向左过弯 (右受力) →' : '直行'}
                </span>
              </div>
            </div>

            {/* 纵向G力 (起步/刹车) */}
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(48,54,61,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>纵向惯性 (起步与制动)</span>
                <span style={{ fontSize: 8.5, color: 'var(--text-muted)' }}>峰值: {peakLon.toFixed(2)} G</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, fontFamily: 'monospace', color: Math.abs(lonG) > 1.2 ? '#f85149' : '#fff' }}>
                  {Math.abs(lonG).toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600, color: '#8b949e' }}>G</span>
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: lonG > 0.1 ? '#f85149' : lonG < -0.1 ? '#3fb950' : 'var(--text-muted)'
                }}>
                  {lonG > 0.1 ? '↑ 刹车制动 (前倾)' : lonG < -0.1 ? '↓ 全力加速 (后仰)' : '匀速'}
                </span>
              </div>
            </div>
          </div>

          {/* 安全极限指示器 (安全线) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10 }}>
              <span style={{ color: 'var(--text-secondary)' }}>抓地力物理极限利用率</span>
              <strong style={{ color: safetyColor, fontFamily: 'monospace' }}>
                {utilizationPercent.toFixed(0)}%
              </strong>
            </div>
            
            {/* 进度条形式的安全线 */}
            <div style={{ height: 8, background: '#21262d', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              {/* 75% 警戒安全线刻度 */}
              <div style={{
                position: 'absolute',
                left: '75%',
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.3)',
                zIndex: 2
              }} />
              <div style={{
                width: `${utilizationPercent}%`,
                height: '100%',
                background: safetyColor,
                borderRadius: 4,
                transition: 'width 0.05s linear'
              }} />
            </div>

            {/* 白话文字提醒 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>安全临界 (75% 刻度线)</span>
              <span style={{ color: safetyColor, fontWeight: 800, animation: utilizationPercent > 95 ? 'absFlash 0.3s infinite' : 'none' }}>
                当前状态: {safetyText}
              </span>
            </div>
          </div>
        </div>

        {/* ================= 右半区：车轮状态表格监控（取代大卡片布局） ================= */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 8,
          boxSizing: 'border-box'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', fontSize: 9.5, color: 'var(--text-secondary)' }}>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>车轮</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>状态</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>当前抓地力</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>避震器压缩</th>
              </tr>
            </thead>
            <tbody>
              {[flInfo, frInfo, rlInfo, rrInfo].map(renderWheelRow)}
            </tbody>
          </table>
        </div>
      </div>

      {/* 闪烁警报 */}
      <style>{`
        @keyframes absFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
