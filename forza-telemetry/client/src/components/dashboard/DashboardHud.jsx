import { useTelemetryValue } from '../../hooks/useTelemetrySelector';

// 基础卡片样式：与拆分前 DashboardPage 内的内联对象逐字一致，抽到模块级避免每帧重建
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

export function DashboardHud() {
  const telemetryData = useTelemetryValue();
  const controls = telemetryData.controls || {};

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
  const handBrakePct = controls.handBrake ? (controls.handBrake / 255) * 100 : 0;
  const steerPct = controls.steer ? Math.max(-100, Math.min(100, (controls.steer / 127) * 100)) : 0;

  return (
    <>
  {/* Row 2: 驾驶 HUD（车速与档位为主视觉） */}
  <div style={{ ...cardBaseStyle, flex: '0 0 176px', justifyContent: 'center', padding: '12px 16px', minHeight: 0 }}>
    {/* 档位 + 时速 */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 76, fontWeight: 900, fontFamily: 'monospace', color: gearColor, lineHeight: 0.9 }}>
          {gearDisplay}
        </span>
        <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, alignSelf: 'flex-end', marginBottom: 7 }}>档位</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: '#c9d1d9', fontFamily: 'monospace', lineHeight: 0.9 }}>
          {telemetryData.speedKmh ? Math.round(telemetryData.speedKmh) : 0}
        </div>
        <div style={{ marginTop: 5, fontSize: 9, color: '#8b949e', fontWeight: 600 }}>公里/小时</div>
      </div>
    </div>

  </div>

  {/* Row 3: 驾驶输入 */}
  <div style={{ ...cardBaseStyle, flex: '1 1 auto', gap: 10, padding: '10px 12px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: '#8b949e' }}>驾驶输入</span>
      <span style={{ fontSize: 10, color: rpmColor, fontFamily: 'monospace', fontWeight: 700 }}>{Math.round(engineRpm)} 转/分</span>
    </div>
    <div style={{ width: '100%' }}>
      <div style={{ height: 7, background: '#21262d', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '10%', background: 'rgba(248,81,73,0.2)' }} />
        <div style={{ width: '100%', height: '100%', background: rpmColor, borderRadius: 4, transform: `scaleX(${rpmPercent / 100})`, transformOrigin: 'left', willChange: 'transform', transition: 'transform 0.08s linear' }} />
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e' }}>
          <span>油门</span>
          <strong style={{ color: '#3fb950', fontFamily: 'monospace' }}>{throttlePct.toFixed(0)}%</strong>
        </div>
        <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', background: '#3fb950', borderRadius: 2.5, transform: `scaleX(${throttlePct / 100})`, transformOrigin: 'left', willChange: 'transform' }} />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e' }}>
          <span>刹车</span>
          <strong style={{ color: '#f85149', fontFamily: 'monospace' }}>{brakePct.toFixed(0)}%</strong>
        </div>
        <div style={{ height: 5, background: '#21262d', borderRadius: 2.5, overflow: 'hidden' }}>
          <div style={{ width: '100%', height: '100%', background: '#f85149', borderRadius: 2.5, transform: `scaleX(${brakePct / 100})`, transformOrigin: 'left', willChange: 'transform' }} />
        </div>
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e', marginBottom: 3 }}><span>方向</span><strong style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{steerPct.toFixed(0)}%</strong></div>
        <div style={{ height: 5, background: '#21262d', borderRadius: 3, position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#484f58' }} /><div style={{ position: 'absolute', top: 0, bottom: 0, left: steerPct < 0 ? `${50 + steerPct / 2}%` : '50%', width: `${Math.abs(steerPct) / 2}%`, background: '#58a6ff' }} /></div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#8b949e', marginBottom: 3 }}><span>手刹</span><strong style={{ color: handBrakePct > 0 ? '#d29922' : '#8b949e', fontFamily: 'monospace' }}>{handBrakePct.toFixed(0)}%</strong></div>
        <div style={{ height: 5, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: '100%', height: '100%', background: '#d29922', transform: `scaleX(${handBrakePct / 100})`, transformOrigin: 'left', willChange: 'transform' }} /></div>
      </div>
    </div>
  </div>
    </>
  );
}
