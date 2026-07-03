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

  useEffect(() => {
    const absLat = Math.abs(latG);
    const absLon = Math.abs(lonG);
    if (absLat > peakLat) setPeakLat(absLat);
    if (absLon > peakLon) setPeakLon(absLon);
  }, [latG, lonG]);

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
    return {
      FL: getABSTCStatus(tireSlipRatio.frontLeft || 0),
      FR: getABSTCStatus(tireSlipRatio.frontRight || 0),
      RL: getABSTCStatus(tireSlipRatio.rearLeft || 0),
      RR: getABSTCStatus(tireSlipRatio.rearRight || 0),
    };
  }, [tireSlipRatio]);

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

  // 渲染简易轮胎单元
  const renderTireNode = (tire) => {
    const isSlipping = tire.status.type !== 'none' && tire.status.active;
    const color = isSlipping ? tire.status.color : tire.grip.color;
    return (
      <div style={{
        width: 32,
        height: 48,
        borderRadius: 4,
        border: `2px solid ${isSlipping ? '#fff' : 'rgba(48, 54, 61, 0.8)'}`,
        background: isSlipping ? color : 'rgba(22, 27, 34, 0.9)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: isSlipping ? `0 0 10px ${color}` : 'none',
        animation: isSlipping ? 'alarmBlink 0.15s infinite alternate' : 'none',
        transition: 'all 0.08s linear'
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: isSlipping ? '#fff' : '#c9d1d9', fontFamily: 'monospace' }}>
          {tire.label}
        </span>
        <span style={{ fontSize: 8, fontWeight: 700, color: isSlipping ? '#fff' : '#8b949e', marginTop: 2, fontFamily: 'monospace' }}>
          {tire.grip.val.toFixed(0)}
        </span>
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

      {/* ================= 第一层：超大“物理极限利用率”进度横条 (100% 宽度) ================= */}
      <div style={{ width: '100%', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5 }}>
              抓地力物理极限利用率 (TOTAL GRIP LIMIT)
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              color: safetyColor,
              background: `${safetyColor}12`,
              padding: '1px 6px',
              borderRadius: 3,
              border: `1px solid ${safetyColor}25`
            }}>
              {safetyText}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#8b949e' }}>
            估算上限: <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{limitG.toFixed(2)} G</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 超大百分比数值 */}
          <div style={{ fontSize: 44, fontWeight: 900, fontFamily: 'monospace', color: safetyColor, lineHeight: 1, minWidth: 100 }}>
            {utilizationPercent.toFixed(0)}<span style={{ fontSize: 18, fontWeight: 700 }}>%</span>
          </div>
          
          {/* 超粗且带有LED网格的进度条 */}
          <div style={{
            flex: 1,
            height: 24,
            background: '#161b22',
            borderRadius: 4,
            border: '1px solid #30363d',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            gap: 2,
            padding: 2,
            boxSizing: 'border-box'
          }}>
            {/* 75% 黄金线刻度 */}
            <div style={{
              position: 'absolute',
              left: '75%',
              top: 0,
              bottom: 0,
              width: 2,
              background: '#fff',
              opacity: 0.4,
              zIndex: 3
            }} />
            
            {/* 20个LED格组成的进度指示器 */}
            {Array.from({ length: 20 }).map((_, idx) => {
              const valThreshold = (idx + 1) * 5; // 每个格子代表 5%
              const isActive = utilizationPercent >= valThreshold;
              
              let ledBg = '#21262d';
              if (isActive) {
                if (valThreshold > 90) ledBg = '#f85149'; // 红色
                else if (valThreshold > 70) ledBg = '#d29922'; // 黄色
                else ledBg = '#3fb950'; // 绿色
              }

              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: '100%',
                    background: ledBg,
                    borderRadius: 1,
                    transition: 'background 0.05s linear',
                    opacity: isActive ? 1 : 0.2
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= 第二层：三列布局 (横向G力 | 中控报警底盘 | 纵向G力) ================= */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        minHeight: 0
      }}>
        
        {/* 1. 左侧：横向重力中心 (过弯) */}
        <div style={{
          flex: '0 0 35%',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: 6,
          border: '1px solid rgba(48,54,61,0.2)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>横向 G力 (过弯)</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>峰值: {peakLat.toFixed(2)} G</span>
            </div>
            
            {/* 超大横向G值 */}
            <div style={{ fontSize: 44, fontWeight: 900, fontFamily: 'monospace', color: '#fff', marginTop: 6, lineHeight: 1 }}>
              {Math.abs(latG).toFixed(2)} <span style={{ fontSize: 16, fontWeight: 600, color: '#8b949e' }}>G</span>
            </div>
            
            <div style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: latG < -0.1 ? '#58a6ff' : latG > 0.1 ? '#f85149' : 'var(--text-muted)',
              marginTop: 4
            }}>
              {latG < -0.1 ? '← 向右过弯 (载荷压在左侧)' : latG > 0.1 ? '向左过弯 (载荷压在右侧) →' : '直行'}
            </div>
          </div>

          {/* 横向重力天平动态指示器 */}
          <div style={{ width: '100%', marginTop: 10 }}>
            <div style={{ height: 12, background: '#161b22', borderRadius: 6, border: '1px solid #30363d', position: 'relative', overflow: 'hidden' }}>
              {/* 中心零点 */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)', zIndex: 2 }} />
              
              {/* 动态天平滑条 */}
              {latG < 0 ? (
                <div style={{
                  position: 'absolute',
                  right: '50%',
                  left: `${Math.max(0, 50 - (Math.abs(latG) / limitG) * 50)}%`,
                  top: 0,
                  bottom: 0,
                  background: '#58a6ff',
                  borderRadius: '3px 0 0 3px'
                }} />
              ) : (
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  right: `${Math.max(0, 50 - (Math.abs(latG) / limitG) * 50)}%`,
                  top: 0,
                  bottom: 0,
                  background: '#f85149',
                  borderRadius: '0 3px 3px 0'
                }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>2.0G 左</span>
              <span>0.0G 中</span>
              <span>2.0G 右</span>
            </div>
          </div>
        </div>

        {/* 2. 中间：巨型状态指示灯与底盘结合舱 */}
        <div style={{
          flex: '0 0 30%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}>
          {/* 巨型防抱死与防打滑状态块 */}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {/* ABS */}
            <div
              className={isABSActive ? 'abs-active-glow' : ''}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 6,
                textAlign: 'center',
                background: isABSActive ? '#f85149' : '#161b22',
                border: `2px solid ${isABSActive ? '#ff7b72' : '#30363d'}`,
                color: isABSActive ? '#fff' : 'rgba(139,148,158,0.25)',
                transition: 'all 0.05s linear'
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>ABS</div>
              <div style={{ fontSize: 8, fontWeight: 800, marginTop: 2 }}>{isABSActive ? '制动抱死' : '安全'}</div>
            </div>

            {/* TCS */}
            <div
              className={isTCSActive ? 'tc-active-glow' : ''}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 6,
                textAlign: 'center',
                background: isTCSActive ? '#f0883e' : '#161b22',
                border: `2px solid ${isTCSActive ? '#f8a060' : '#30363d'}`,
                color: isTCSActive ? '#fff' : 'rgba(139,148,158,0.25)',
                transition: 'all 0.05s linear'
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>TCS</div>
              <div style={{ fontSize: 8, fontWeight: 800, marginTop: 2 }}>{isTCSActive ? '车轮打滑' : '安全'}</div>
            </div>
          </div>

          {/* 工字型极简物理车模（方程式底盘指示器） */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            height: '110px',
            width: '100%'
          }}>
            {/* 前轴 */}
            <div style={{ display: 'flex', gap: 24, zIndex: 2 }}>
              {renderTireNode(tires.FL)}
              {renderTireNode(tires.FR)}
            </div>

            {/* 纵向车轴骨架线 */}
            <div style={{
              position: 'absolute',
              width: 4,
              height: 70,
              background: 'linear-gradient(to bottom, rgba(88,166,255,0.05) 0%, rgba(88,166,255,0.3) 50%, rgba(88,166,255,0.05) 100%)',
              top: 20,
              zIndex: 1
            }} />
            
            {/* 横轴连接线 */}
            <div style={{
              position: 'absolute',
              width: 50,
              height: 2,
              background: 'rgba(88,166,255,0.2)',
              top: '40px',
              zIndex: 1
            }} />
            <div style={{
              position: 'absolute',
              width: 50,
              height: 2,
              background: 'rgba(88,166,255,0.2)',
              bottom: '40px',
              zIndex: 1
            }} />

            {/* 后轴 */}
            <div style={{ display: 'flex', gap: 24, zIndex: 2, marginTop: 12 }}>
              {renderTireNode(tires.RL)}
              {renderTireNode(tires.RR)}
            </div>
          </div>
        </div>

        {/* 3. 右侧：纵向重力中心 (油刹) */}
        <div style={{
          flex: '0 0 35%',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: 6,
          border: '1px solid rgba(48,54,61,0.2)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>纵向 G力 (油刹)</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>峰值: {peakLon.toFixed(2)} G</span>
            </div>

            {/* 超大纵向G值 */}
            <div style={{ fontSize: 44, fontWeight: 900, fontFamily: 'monospace', color: '#fff', marginTop: 6, lineHeight: 1 }}>
              {Math.abs(lonG).toFixed(2)} <span style={{ fontSize: 16, fontWeight: 600, color: '#8b949e' }}>G</span>
            </div>

            <div style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: lonG > 0.1 ? '#f85149' : lonG < -0.1 ? '#3fb950' : 'var(--text-muted)',
              marginTop: 4
            }}>
              {lonG > 0.1 ? '↑ 重刹车制动 (重心前倾)' : lonG < -0.1 ? '↓ 全力加速给油 (重心后仰)' : '匀速'}
            </div>
          </div>

          {/* 纵向重力天平动态指示器 */}
          <div style={{ width: '100%', marginTop: 10 }}>
            <div style={{ height: 12, background: '#161b22', borderRadius: 6, border: '1px solid #30363d', position: 'relative', overflow: 'hidden' }}>
              {/* 中心零点 */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)', zIndex: 2 }} />
              
              {/* 动态纵向天平滑条 */}
              {lonG < 0 ? (
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  right: `${Math.max(0, 50 - (Math.abs(lonG) / limitG) * 50)}%`,
                  top: 0,
                  bottom: 0,
                  background: '#3fb950', // 绿色代表加速推进
                  borderRadius: '0 3px 3px 0'
                }} />
              ) : (
                <div style={{
                  position: 'absolute',
                  right: '50%',
                  left: `${Math.max(0, 50 - (Math.abs(lonG) / limitG) * 50)}%`,
                  top: 0,
                  bottom: 0,
                  background: '#f85149', // 红色代表减速负载
                  borderRadius: '3px 0 0 3px'
                }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>2.0G 刹车</span>
              <span>0.0G 中</span>
              <span>2.0G 加速</span>
            </div>
          </div>
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
