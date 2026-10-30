import { useTelemetrySelector } from '../../hooks/useTelemetrySelector';

// 样式/常量与拆分前 DashboardPage 内的内联值逐字一致
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

const carClasses = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
const drivetrainLabels = ['FWD', 'RWD', 'AWD'];
const classColors = {
  'D': '#8b949e', 'C': '#3fb950', 'B': '#58a6ff',
  'A': '#d29922', 'S1': '#f0883e', 'S2': '#f85149', 'X': '#bc8cff'
};

// 只取车辆标识字段：行驶中这些字段不变，因此该卡片不会随 30Hz 遥测重渲染
const selectCar = (telemetry) => {
  const car = telemetry?.car || {};
  return {
    ordinal: car.ordinal,
    class: car.class,
    performanceIndex: car.performanceIndex,
    drivetrainType: car.drivetrainType,
  };
};

export function DashboardVehicleCard({ vehiclesList }) {
  const { ordinal, class: carClassRaw, performanceIndex, drivetrainType } = useTelemetrySelector(selectCar);

  // 车辆基本属性解析（表达式与拆分前完全一致）
  const vehicleInfo = ordinal !== undefined && ordinal !== null ? vehiclesList[String(ordinal)] : null;
  const carClassLabel = carClassRaw !== undefined && carClassRaw !== null ? (carClasses[carClassRaw] ?? '-') : '-';
  const pi = performanceIndex !== undefined && performanceIndex !== null ? performanceIndex : '-';
  const drivetrainLabel = drivetrainType !== undefined && drivetrainType !== null ? (drivetrainLabels[drivetrainType] ?? '-') : '-';

  const hasCarData = ordinal !== undefined && ordinal !== null;
  const carName = vehicleInfo?.name && !vehicleInfo.name.startsWith('Car #')
    ? vehicleInfo.name
    : (hasCarData ? `#${ordinal}` : '待机');

  const classColor = classColors[carClassLabel] || '#8b949e';

  return (
  <div style={{ ...cardBaseStyle, flex: '0 0 118px', padding: '10px 12px' }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: '#58a6ff', letterSpacing: 0.5, marginBottom: 6 }}>
      当前车辆
    </div>
    <div style={{
      fontSize: 14, fontWeight: 700, color: '#e6edf3', lineHeight: 1.3,
      minHeight: 36, overflow: 'hidden', display: '-webkit-box',
      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
    }}>
      {carName}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', gap: 6 }}>
      <span style={{ fontSize: 9, color: '#8b949e', fontFamily: 'monospace' }}>编号 #{ordinal ?? '-'}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ ...badgeBase, color: classColor, background: `${classColor}18`, border: `1px solid ${classColor}40` }}>{carClassLabel}</span>
        <span style={{ ...badgeBase, color: '#c9d1d9', background: '#0d1117', border: '1px solid #30363d' }}>PI {pi}</span>
        <span style={{ ...badgeBase, color: '#58a6ff', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)' }}>{drivetrainLabel}</span>
      </div>
    </div>
  </div>
  );
}
