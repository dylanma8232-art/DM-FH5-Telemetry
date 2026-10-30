# 仪表盘 Round 6-10 迭代方案（收尾阶段）

## Round 6: LapPrediction + DrivingAdvice 合并面板优化

### R6-1: 改为 Tab 切换模式 [P1]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: R1 中将 LapPrediction 和 DrivingAdvice 合并到 Row 4 col 8-11 的同一个面板中，两个组件上下堆叠。在 180px 高度限制下，两个面板内容互相挤压，可读性差。

**修复**:
- 新增通用 `TabbedPanel` 组件，支持 `defaultTab`、`items`（Tab 配置数组）、`children`（render props 提供 `activeTab`）
- 可选 `gridColumn`/`gridRow` props，使 TabbedPanel 可直接放置在 CSS Grid 中
- Tab UI: 小型按钮式 Tab，激活态有蓝色底边 + 背景高亮，未激活态为灰色文字
- 两个 Tab: "圈速预测"（icon: P）/ "驾驶建议"（icon: A）

```jsx
<TabbedPanel gridColumn="8 / 11" gridRow="4 / 5" defaultTab="prediction" items={[
  { key: 'prediction', label: '圈速预测', icon: 'P' },
  { key: 'advice', label: '驾驶建议', icon: 'A' },
]}>
  {({ activeTab }) => activeTab === 'prediction' ? (
    <LapPrediction ... />
  ) : (
    <DrivingAdvice ... />
  )}
</TabbedPanel>
```

**效果**: 每个面板独占完整高度，不再互相遮挡，Tab 切换简洁流畅。

---

## Round 7: DataExport + TrackRecognition 合并面板优化

### R7-1: DataExport 紧凑模式 [P1]

**文件**: `client/src/components/dashboard/DataExportPanel.jsx`

**修复**:
- 新增 `compact` prop（默认 false）
- 紧凑模式：仅显示标题+ CSV/JSON 两个按钮 + 数据条数 + 导出状态
- 移除 compact 模式下的 `alert()` 提示（改为静默忽略无数据情况）
- 按钮样式简化：去除动画、hover 效果，使用纯色背景

### R7-2: TrackRecognition 紧凑替代组件 [P1]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: 原 TrackRecognition 组件功能丰富（确认/拒绝/替代赛道/手动选择），但在仪表盘 col 11-13 的小面板中展开过多，且从 DashboardPage 的 lazy import 中被移除。

**修复**:
- 新增 `TrackRecognitionCompact` 内联组件（直接在 DashboardPage 文件中定义，无需单独文件）
- 仅监听 `trackRecognizing` 和 `trackRecognitionConfirmed` 两个 socket 事件
- 三种状态:
  - `idle`: 显示 "TRACK / 等待赛道识别..."（灰色小文字）
  - `recognizing`: 显示 "⟳ 赛道名"（黄色）
  - `confirmed`: 显示 "✓ 赛道名"（绿色）
- 无结果时不再返回 null，而是显示占位提示文字

### R7-3: 上下分栏布局 [P2]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**修复**: DataExport + TrackRecognitionCompact 上下排列在 col 11-13 中，各占 50% 高度：
- 上半: DataExport compact（flex: 1, 垂直居中）
- 分隔线: 1px solid #21262d
- 下半: TrackRecognitionCompact（flex: 1, padding-top）

---

## Round 8: 路书面板优化

### R8-1: 紧凑模式布局微调 [P2]

**文件**: `client/src/components/dashboard/PaceNotesPanel.jsx`

**修复**:
- 主内容区 gap: 10px -> 8px（减少方向箭头与详细信息之间的间距）
- 强度指示器:
  - 条宽度: 4px -> 3px
  - 条高度基准: 6px -> 4px（每级递增仍为 3px）
  - 间距: 3px -> 2px
  - "强度" 字号: 8px -> 7px
- 刹车距离显示:
  - BRAKE 字号: 9px -> 8px，增加 fontWeight: 700
  - 距离字号: 11px -> 10px
  - gap: 4px -> 3px

**效果**: 整体更紧凑，适合仪表盘小面板中快速扫视。

### R8-2: 无数据状态确认 [P3]

**结果**: PaceNotesPanel 在无 trackData 时显示 "NOTE / 需要赛道数据才能生成路书"，在仪表盘中由于 trackData 检查在外层，不会出现此状态。紧凑模式下通过所有弯道后显示 "已通过所有弯道"，无弯道数据显示 "无弯道数据"。

---

## Round 9: 最终布局验收

### R9-1: 1080p 一页完整显示 [P1]

**验证结果**:
- 网格: 12列 x 4行，gridTemplateRows: `140px 180px 240px 180px`
- 总行高: 740px
- 网格间距: 3px（3 个垂直间隔 = 9px）
- 外边距: 6px 上下 = 12px
- 总高度: 740 + 9 + 12 = 761px
- 可用高度: `100vh - 60px` = 1080p 下 1020px
- **余量: 259px（34%）** -- 无滚动，无溢出

### R9-2: 面板间距一致性 [P1]

**验证结果**: 所有面板使用统一的 `cardBase + cardPadding` 样式：
- `cardBase`: `background: var(--bg-secondary)`, `border: 1px solid var(--border)`, `borderRadius: 6px`
- `cardPadding`: `padding: 4px 6px`
- 网格间距: 统一 `3px`
- 外层间距: 统一 `6px`

### R9-3: 深色主题可读性 [P1]

**验证结果**:
- 主文字: `#c9d1d9`（高对比度）
- 次文字: `#8b949e`（中等对比度）
- 三级文字: `#484f58`（装饰性信息）
- 强调色: `#3fb950`（绿）, `#58a6ff`（蓝）, `#d29922`（黄）, `#f85149`（红）-- 均在深色背景上清晰可辨
- 背景: `#0d1117` / `#161b22` -- 一致的 GitHub Dark 色系

---

## Round 10: 代码清理

### R10-1: 移除 console.error/warning [P1]

**修改文件**: `client/src/components/dashboard/TrackRecognition.jsx`

**修复**: 将 4 处 `console.error(...)` 替换为空 catch 块（`catch { // ignore }`），涉及：
- `loadAllTracks()` - 加载赛道列表失败
- `handleConfirm()` - 确认赛道失败
- `handleReject()` - 反馈失败
- `handleManualSelect()` - 手动选择失败

**注意**: TrackRecognition.jsx 已不再被仪表盘直接导入（R7 中替换为 TrackRecognitionCompact），但该文件仍存在于代码库中供其他页面使用。

### R10-2: 确认无未使用 import [P1]

**验证结果**:
- `DashboardPage.jsx`: `useState, useEffect, useRef, useMemo, Suspense, lazy` 全部使用；`formatGear` 在速度面板使用
- `TrackRecognitionCompact`: `useState, useEffect` 均使用（定义在 DashboardPage 文件中）
- `TabbedPanel`: `useState` 使用（定义在 DashboardPage 文件中）
- `DataExportPanel.jsx compact模式`: 无新增 import，复用已有 `useState`

### R10-3: 删除死代码文件 [P1]

**删除文件**:
- `client/src/components/dashboard/GForcePanelV3.jsx` -- R3-3 中标记为残留死代码，全项目 0 引用
- `client/src/components/dashboard/GForceDistribution.jsx` -- 全项目 0 引用，从未被任何页面导入

### R10-4: 其余 console 调用评估 [P3]

- `ErrorBoundary.jsx` 中的 `console.error('组件渲染错误:', error, info)` -- 保留，这是错误边界的标准日志记录行为
- `SectorAnalysis.jsx` 中的 `console.error('Sector analysis error:', e)` -- 保留，该组件在 SessionHistoryPage 中使用，不在仪表盘路径上

---

## 构建验证

五轮修改后均通过 `npm run build`，无错误:
- Round 6 构建通过 (1.59s)
- Round 7 构建通过 (1.41s)
- Round 8 构建通过 (1.41s)
- Round 9 验收通过（仅代码审查，无修改）
- Round 10 构建通过 (1.42s)

---

## 修改文件汇总

| 文件 | 修改轮次 | 修改内容 |
|------|----------|----------|
| `DashboardPage.jsx` | R6, R7, R9, R10 | 新增 TabbedPanel 组件 + TrackRecognitionCompact 组件 + LapPrediction/DrivingAdvice 改为 Tab 模式 + DataExport/TrackRecognition 改为上下分栏 + 布局验收 |
| `DataExportPanel.jsx` | R7 | 新增 compact 模式 + 移除 alert() |
| `PaceNotesPanel.jsx` | R8 | 紧凑模式布局微调（间距、字号、强度条） |
| `TrackRecognition.jsx` | R10 | 4 处 console.error 改为空 catch |
| `GForcePanelV3.jsx` | R10 | 删除（死代码） |
| `GForceDistribution.jsx` | R10 | 删除（死代码） |
