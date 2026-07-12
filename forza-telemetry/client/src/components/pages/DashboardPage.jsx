import { Suspense, lazy } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { ErrorBoundary } from '../shared/ErrorBoundary';

// Lazy load dashboard components
const BrakingGripDynamicsPanel = lazy(() => import('../dashboard/BrakingGripDynamicsPanel').then(m => ({ default: m.BrakingGripDynamicsPanel })));
const RacePerformanceTimingPanel = lazy(() => import('../dashboard/RacePerformanceTimingPanel').then(m => ({ default: m.RacePerformanceTimingPanel })));
const PaceNotesPanel = lazy(() => import('../dashboard/PaceNotesPanel').then(m => ({ default: m.PaceNotesPanel })));
const AlertAdvicePanel = lazy(() => import('../dashboard/AlertAdvicePanel').then(m => ({ default: m.AlertAdvicePanel })));

export function DashboardPage({ data, socket, connected, packetCount }) {
  const telemetryData = data || {};
  const controls = telemetryData.controls || {};

  const { trackData, setTrackData, vehiclesList } = useDashboardData(socket);

  // 车辆基本属性解析
  const car = telemetryData.car || {};
  const ordinal = car.ordinal;
  const vehicleInfo = ordinal !== undefined && ordinal !== null ? vehiclesList[String(ordinal)] : null;

  const carClasses = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  const carClassLabel = car.class !== undefined && car.class !== null ? (carClasses[car.class] ?? '-') : '-';
  const pi = car.performanceIndex !== undefined && car.performanceIndex !== null ? car.performanceIndex : '-';
  const drivetrainLabels = ['FWD', 'RWD', 'AWD'];
  const drivetrainLabel = car.drivetrainType !== undefined && car.drivetrainType !== null ? (drivetrainLabels[car.drivetrainType] ?? '-') : '-';

  const hasCarData = ordinal !== undefined && ordinal !== null;
  const carName = vehicleInfo?.name && !vehicleInfo.name.startsWith('Car #')
    ? vehicleInfo.name
    : (hasCarData ? `#${ordinal}` : '待机');

  const classColors = {
    'D': '#8b949e', 'C': '#3fb950', 'B': '#58a6ff',
    'A': '#d29922', 'S1': '#f0883e', 'S2': '#f85149', 'X': '#bc8cff'
  };
  const classColor = classColors[carClassLabel] || '#8b949e';

  // 基础卡片样式
  const cardBaseStyle = {
    background: 'var(--bg-secondary, #161b22)',
    borderRadius: 8,
    border: '1px solid var(--border, #21262d)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    padding: '8px 12px',
    minHeight: 0
  };

  const badgeBase = {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 4,
  };

  // 档位 / 转速
  const gear = controls.gear || 0;
  const formatGear = (g) => {
    if (g === 0) return 'R';
    if (g === 11 || g === 255) return 'N';
    return String(g);
  };
  const gearDisplay = formatGear(gear);
  const engineRpm = telemetryData.currentEngineRpm || 0;
  const maxRpm = telemetryData.engineMaxRpm || 8000;
  const rpmPercent = maxRpm > 0 ? Math.min((engineRpm / maxRpm) * 100, 100) : 0;

  let rpmColor = '#3fb950';
  if (rpmPercent > 90) rpmColor = '#f85149';
  else if (rpmPercent > 70) rpmColor = '#d29922';

  let gearColor = 'var(--text-primary, #c9d1d9)';
  if (gear === 0) gearColor = '#d29922';
  if (gear === 11 || gear === 255 || gear < 0) gearColor = '#f85149';

  // 输入控制条
  const throttlePct = controls.accel ? (controls.accel / 255) * 100 : 0;
  const brakePct = controls.brake ? (controls.brake / 255) * 100 : 0;

  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: '#8b949e' }}>加载中...</div>}>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: '8px',
        padding: '8px',
        background: 'var(--bg-primary, #0d1117)',
        minHeight: '220px',
        boxSizing: 'border-box'
      }}>

        {/* ========== COLUMN 1 (左侧): 预警播报 / 车辆信息 / 驾驶HUD ========== */}
        <div style={{
          flex: '0 0 300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0
        }}>
          {/* Row 1: 预警播报 (缩得更小) */}
          <div style={{ flex: '0 0 80px', minHeight: 0 }}>
            <ErrorBoundary name="预警播报">
              <AlertAdvicePanel data={telemetryData} />
            </ErrorBoundary>
          </div>

          {/* Row 2: 车辆信息 — 紧凑版，只显示名称 / ID / PI / 级别 / 驱动 */}
          <div style={{ ...cardBaseStyle, flex: '0 0 auto', padding: '8px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#484f58', letterSpacing: 0.5, marginBottom: 5 }}>
              车辆信息
            </div>

            {/* 车辆名称 */}
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#c9d1d9',
              marginBottom: 6,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              lineHeight: 1.2
            }}>
              {carName}
              {ordinal && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#8b949e',
                  marginLeft: 6,
                  fontFamily: 'monospace',
                  opacity: 0.8
                }}>
                  #{ordinal}
                </span>
              )}
            </div>

            {/* 三枚徽章：级别 / PI / 驱动 */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ ...badgeBase, color: classColor, background: `${classColor}18`, border: `1px solid ${classColor}40` }}>
                {carClassLabel}
              </span>
              <span style={{ ...badgeBase, color: '#c9d1d9', background: '#0d1117', border: '1px solid #30363d' }}>
                PI {pi}
              </span>
              <span style={{ ...badgeBase, color: '#58a6ff', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)' }}>
                {drivetrainLabel}
              </span>
            </div>
          </div>

          {/* Row 3: 驾驶 HUD（档位焦点） */}
          <div style={{ ...cardBaseStyle, flex: '1 1 auto', justifyContent: 'space-between', padding: '6px 12px', minHeight: 0 }}>
            {/* 档位 + 时速 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 48, fontWeight: 900, fontFamily: 'monospace', color: gearColor, lineHeight: 1 }}>
                  {gearDisplay}
                </span>
                <span style={{ fontSize: 9, color: '#8b949e', fontWeight: 600, alignSelf: 'flex-end', marginBottom: 4 }}>档</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#c9d1d9', fontFamily: 'monospace', lineHeight: 1 }}>
                  {telemetryData.speedKmh ? Math.round(telemetryData.speedKmh) : 0}
                </div>
                <div style={{ fontSize: 8, color: '#8b949e', fontWeight: 600 }}>公里/小时</div>
              </div>
            </div>

            {/* 转速条 */}
            <div style={{ width: '100%' }}>
              <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10%', background: 'rgba(248,81,73,0.2)' }} />
                <div style={{ width: `${rpmPercent}%`, height: '100%', background: rpmColor, borderRadius: 3, transition: 'width 0.08s linear' }} />
              </div>
            </div>

            {/* 油门 / 刹车条 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e' }}>
                  <span>油门</span>
                  <strong style={{ color: '#3fb950', fontFamily: 'monospace' }}>{throttlePct.toFixed(0)}%</strong>
                </div>
                <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
                  <div style={{ width: `${throttlePct}%`, height: '100%', background: '#3fb950', borderRadius: 2.5 }} />
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e' }}>
                  <span>刹车</span>
                  <strong style={{ color: '#f85149', fontFamily: 'monospace' }}>{brakePct.toFixed(0)}%</strong>
                </div>
                <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
                  <div style={{ width: `${brakePct}%`, height: '100%', background: '#f85149', borderRadius: 2.5 }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== COLUMN 2 (中间): 路书 + 底盘动态 ========== */}
        <div style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0
        }}>
          {/* Row 1: 路书 (放在中间，看板放大) */}
          <div style={{ ...cardBaseStyle, flex: '0 0 150px', padding: '10px 12px', minHeight: 0 }}>
            <ErrorBoundary name="路书看板">
              <PaceNotesPanel
                trackData={trackData}
                position={telemetryData.position}
                currentSpeed={telemetryData.speedKmh}
                isRaceOn={telemetryData.isRaceOn}
                racePosition={telemetryData.racePosition}
                compact={true}
                onExit={() => setTrackData(null)}
              />
            </ErrorBoundary>
          </div>

          {/* Row 2: 底盘动态与抓地力 */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ErrorBoundary name="底盘动态与抓地力">
              <BrakingGripDynamicsPanel data={telemetryData} />
            </ErrorBoundary>
          </div>
        </div>

        {/* ========== COLUMN 3 (右侧): 圈速 & 计时 ========== */}
        <div style={{
          flex: '0 0 320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0
        }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ErrorBoundary name="圈速与计时">
              <RacePerformanceTimingPanel data={telemetryData} trackData={trackData} isRaceOn={telemetryData.isRaceOn} />
            </ErrorBoundary>
          </div>
        </div>

      </div>
    </Suspense>
  );
}
