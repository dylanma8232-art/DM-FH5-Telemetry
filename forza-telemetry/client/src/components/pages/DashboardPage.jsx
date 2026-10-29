import { Suspense, lazy } from 'react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { DashboardHud } from '../dashboard/DashboardHud';
import { DashboardVehicleCard } from '../dashboard/DashboardVehicleCard';

// Lazy load dashboard components
const BrakingGripDynamicsPanel = lazy(() => import('../dashboard/BrakingGripDynamicsPanel').then(m => ({ default: m.BrakingGripDynamicsPanel })));
const RacePerformanceTimingPanel = lazy(() => import('../dashboard/RacePerformanceTimingPanel').then(m => ({ default: m.RacePerformanceTimingPanel })));
const PaceNotesPanel = lazy(() => import('../dashboard/PaceNotesPanel').then(m => ({ default: m.PaceNotesPanel })));
const AlertAdvicePanel = lazy(() => import('../dashboard/AlertAdvicePanel').then(m => ({ default: m.AlertAdvicePanel })));

// 基础卡片样式（与拆分前逐字一致）
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

/**
 * 仪表盘外壳。
 *
 * P7：本组件不再持有整帧遥测 state，因此不会随 30Hz 遥测重渲染；
 * 每个需要实时数据的子块自己订阅（HUD / 车辆卡 / 三个面板），
 * 布局容器、ErrorBoundary、Suspense 只在挂载/切页时渲染一次。
 */
export function DashboardPage({ socket, connected, packetCount }) {
  const { trackData, setTrackData, vehiclesList } = useDashboardData(socket);

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

        {/* ========== COLUMN 1 (左侧): 预警播报 / 主驾驶HUD / 驾驶输入 ========== */}
        <div style={{
          flex: '0 0 340px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0
        }}>
          {/* Row 1: 预警播报 (缩得更小) */}
          <div style={{ flex: '0 0 80px', minHeight: 0 }}>
            <ErrorBoundary name="预警播报">
              <AlertAdvicePanel />
            </ErrorBoundary>
          </div>

          <DashboardHud />
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
                compact={true}
                onExit={() => setTrackData(null)}
              />
            </ErrorBoundary>
          </div>

          {/* Row 2: 底盘动态与抓地力 */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ErrorBoundary name="底盘动态与抓地力">
              <BrakingGripDynamicsPanel />
            </ErrorBoundary>
          </div>
        </div>

        {/* ========== COLUMN 3 (右侧): 车辆信息 / 圈速 & 计时 ========== */}
        <div style={{
          flex: '0 0 320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: 0
        }}>
          <DashboardVehicleCard vehiclesList={vehiclesList} />
          <div style={{ flex: 1, minHeight: 0 }}>
            <ErrorBoundary name="圈速与计时">
              <RacePerformanceTimingPanel trackData={trackData} />
            </ErrorBoundary>
          </div>
        </div>

      </div>
    </Suspense>
  );
}
