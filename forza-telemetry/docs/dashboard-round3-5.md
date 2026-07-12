# 仪表盘 Round 3-5 迭代方案

## Round 3: 性能优化

### R3-1: TrackProgressPanel 近邻搜索优化 [P1]

**文件**: `client/src/components/dashboard/TrackProgressPanel.jsx`

**问题**: 每帧对 centerline 所有点（可能数百个）做 O(n) 遍历找最近点，造成不必要的计算开销。

**修复**:
- 引入 `lastNearestRef` (useRef) 保存上一帧找到的最近点 index
- 搜索范围从全量遍历改为 `lastIndex +/- SEARCH_RADIUS(10)` 共 21 个点
- 利用车辆在赛道上位置连续变化的特性，相邻帧之间最近点通常非常接近
- 复杂度从 O(n) 降为 O(1)（常数 21 次比较）

**关键代码**:
```jsx
const SEARCH_RADIUS = 10;
const lastNearestRef = useRef(0);

// 搜索范围
const start = Math.max(0, lastIdx - SEARCH_RADIUS);
const end = Math.min(points.length - 1, lastIdx + SEARCH_RADIUS);
for (let i = start; i <= end; i++) { /* ... */ }
lastNearestRef.current = nearestIndex;
```

---

### R3-2: SectorTimer 状态合并为 useReducer [P1]

**文件**: `client/src/components/dashboard/SectorTimer.jsx`

**问题**: 使用 6 个独立的 useState（sectors, currentSector, sectorTimes, bestSectorTimes, lapSectorTimes, weakSector, lapComplete），在同一个事件循环中多次触发离散更新，可能导致不必要的重渲染。

**修复**:
- 合并为单一 `useReducer`，定义 `sectorReducer` 和 7 个 action type:
  - `SET_SECTORS`: 初始化分段数据，重置所有相关状态
  - `SET_CURRENT_SECTOR`: 更新当前分段
  - `UPDATE_SECTOR_TIME`: 更新某段的时间
  - `SET_LAP_SECTOR_TIMES`: 完成一圈后记录分段时间
  - `UPDATE_BEST_SECTOR_TIMES`: 更新最佳分段时间
  - `SET_WEAK_SECTOR`: 设置弱段标记
  - `RESET_LAP`: 圈重置
- 所有状态变更通过 `dispatch` 统一管理，React 可合并同一事件中的多次 dispatch 为单次渲染
- 保持了与原逻辑完全一致的行为

**import 变化**: `useState` -> `useReducer`（移除 useState import）

---

### R3-3: GForcePanel 残留引用确认 [P2]

**结果**: GForcePanel 已从 DashboardPage 中完全移除。通过全局搜索确认:
- `import.*GForcePanel` - 0 匹配
- `from.*GForcePanel` - 0 匹配
- 仅残留 `GForcePanelV3.jsx` 文件（未使用），可后续清理

---

## Round 4: 交互优化

### R4-1: WarningPanel 声音设置连接到 State [P1]

**文件**: `client/src/components/dashboard/WarningPanel.jsx`

**问题**: 声音提示 checkbox 的 onChange 处理器为空（仅有注释 `// This would need to update settings`），用户无法通过面板控制声音开关。

**修复**:
- 从 `useSettings()` 中额外解构 `updatePreferences`
- onChange 中调用 `updatePreferences('warningSound', !settings.preferences.warningSound)`
- 修改立即持久化到 localStorage（SettingsProvider 已内置）

```jsx
const { settings, updatePreferences } = useSettings();
// ...
onChange={() => {
  updatePreferences('warningSound', !settings.preferences.warningSound);
}}
```

---

### R4-2: PaceNotesPanel 导出功能拆分 [P2]

**文件**: `client/src/components/dashboard/PaceNotesPanel.jsx` (精简), 新增 `client/src/components/dashboard/PaceNoteExport.jsx`

**问题**: PaceNotesPanel 共 1250 行，其中导出功能（exportAsText + exportAsImage）占约 130 行，逻辑独立但嵌入主组件中增加阅读负担。

**修复**:
- 新建 `PaceNoteExport.jsx` 子组件，包含:
  - 文本导出（.txt）逻辑
  - 图片导出（.png Canvas 渲染）逻辑
  - 导出按钮 UI
- PaceNotesPanel 仅传入 `{ paceNotes, trackData, turnNotes }` props
- PaceNotesPanel 减少约 130 行代码
- PaceNotesPanel 的 `useCallback` import 已随之移除

---

### R4-3: 待机面板脉冲动画效果 [P2]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: 无赛道数据时的待机面板（Row3 "准备就绪"）静态显示，缺乏动态感，用户不确定系统是否在工作。

**修复**:
- 添加两个 CSS keyframes 动画:
  - `standbyPulse`: 闪电图标容器的缩放+发光脉冲（2.5s 循环）
  - `standbyDotPulse`: UDP 端口信息旁边的绿色状态点呼吸灯（2s 循环）
- 闪电图标增加 `animation: standbyPulse 2.5s ease-in-out infinite`
- UDP 信息块从 `inline-block` 改为 `inline-flex`，加入脉冲绿点

---

## Round 5: 收尾打磨

### R5-1: 提取重复 inline style 常量 [P2]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**修复**: 提取 `badgeBase` 样式常量，用于车辆信息面板中的 Class/PI/Drivetrain 标签:
```jsx
const badgeBase = {
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 4,
};
```
三个标签 badge 通过 spread `...badgeBase` 复用基础样式，仅覆盖各自差异化的 color/background/border。

---

### R5-2: 删除死代码 [P1]

**修改文件及内容**:

1. **DashboardPage.jsx**: 移除未使用的 `drivingMode = false` prop
2. **App.jsx**: 移除 `drivingMode={false}` 传值
3. **PaceNotesPanel.jsx**: 移除不再需要的 `useCallback` import（导出功能已拆分）
4. **SectorTimer.jsx**: 移除 `useState` import，替换为 `useReducer`

---

### R5-3: Canvas 组件错误保护 [P1]

**文件**:
- `client/src/components/dashboard/TrackProgressPanel.jsx`
- `client/src/components/dashboard/DataTrendPanel.jsx`

**修复**: 对 `canvas.getContext('2d')` 调用添加 try-catch 保护:
```jsx
let ctx;
try {
  ctx = canvas.getContext('2d');
  if (!ctx) return;
} catch {
  return;
}
```
防止在极端情况下（如 WebGL 上下文占用、canvas 被回收等）因 context 获取失败导致的运行时异常。

注: SpeedGauge 使用纯 SVG 而非 Canvas，无需处理。

---

## 构建验证

三轮修改后均通过 `npm run build`，无错误:
- Round 3 构建通过 (1.42s)
- Round 4 构建通过 (1.47s)
- Round 5 构建通过 (1.46s)

---

## 修改文件汇总

| 文件 | 修改轮次 | 修改内容 |
|------|----------|----------|
| `TrackProgressPanel.jsx` | R3, R5 | 近邻搜索优化 + Canvas 错误保护 |
| `SectorTimer.jsx` | R3 | useState 合并为 useReducer |
| `WarningPanel.jsx` | R4 | 声音设置 onChange 连接到 state |
| `PaceNotesPanel.jsx` | R4, R5 | 拆出导出子组件 + 移除 useCallback |
| `PaceNoteExport.jsx` | R4 | 新建 - 路书导出子组件 |
| `DashboardPage.jsx` | R4, R5 | 待机脉冲动画 + badgeBase 常量 + 移除 drivingMode |
| `App.jsx` | R5 | 移除 drivingMode prop 传递 |
| `DataTrendPanel.jsx` | R5 | Canvas 错误保护 |
