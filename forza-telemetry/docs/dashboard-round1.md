# 仪表盘 Round 1 迭代方案

## 一、已修复 Bug 清单

### Bug 1: TrackRecognition socket.off() 误删事件 [P0]

**文件**: `client/src/components/dashboard/TrackRecognition.jsx`

**问题**: useEffect cleanup 中 `socket.off('trackRecognized')` 不带函数引用，会移除同事件名的所有监听器，导致 DashboardPage 和 Header 中同名事件的监听器也被误删。

**修复**: 将三个匿名箭头函数提取为命名 const（`onTrackRecognized`、`onTrackRecognitionConfirmed`、`onAutoRecordStatus`），在 `socket.on()` 和 `socket.off()` 中使用相同引用，确保只移除当前组件自身的监听器。

---

### Bug 2: 删除 G 力圈 + 新增车辆信息面板 [P0]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: GForcePanelV3（G 力圈）对普通用户无实际意义，用户看不懂。

**修复**:
- 移除 GForcePanelV3 的 lazy import 和使用
- 在原位置（Row 1 col 1-3，跨 2 行）替换为车辆信息面板
- 面板内容：车辆名称、等级标签（D/C/B/A/S1/S2/X，带颜色）、PI 值、驱动类型（FWD/RWD/AWD）
- 数据来源：`telemetry.car.ordinal` + `GET /api/vehicles` 匹配车辆名称
- 新增 `vehiclesList` state，组件挂载时加载车辆列表

---

### Bug 3: Row4 面板合并（5 个窄面板 -> 3 个宽面板）[P0]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: Row4 原有 5 个窄面板（DataExport col8-9, TrackRecognition col9-10, LapPrediction col10-11, DrivingAdvice col11-13），每个面板宽度仅 1-2 列，内容拥挤可读性差。

**修复**: 合并为 3 个宽面板：
| 面板 | 列范围 | 内容 |
|------|--------|------|
| DataTrendPanel | col 1-8 | 保持不变 |
| 合并面板 | col 8-11 | LapPrediction + 分隔线 + DrivingAdvice |
| 工具面板 | col 11-13 | DataExportPanel + TrackRecognition |

---

### Bug 4: 待机面板时隐藏 Row4 非必要面板 [P0]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: 未识别赛道时，Row4 的预测/建议/导出/识别面板无实际数据，但仍然占据空间。

**修复**: 当 `!trackData` 时，Row4 仅渲染 DataTrendPanel（col 1-8），其余两个合并面板通过 `{trackData && (...)}` 条件渲染隐藏。DataTrendPanel 可显示实时遥测数据（速度/加速度/轮胎滑动趋势），因此始终保留。

---

## 二、构建验证

`npm run build` 通过，无错误。GForcePanelV3 chunk 已从 dist 输出中移除。

---

## 三、Round 2 待优化项清单

### R2-1: 车辆信息面板扩展 -- 车辆图片/品牌标识

**现状**: 当前车辆面板仅显示文本信息（名称/等级/PI/驱动），视觉表现力较弱。

**方案**:
- 在 `/api/vehicles` 数据中增加 `make`（品牌）和 `model`（车型）字段（需配合 FH5 车辆数据库映射 ordinal 到品牌/车型）
- 面板布局改为上图片下信息，或左图标右信息
- 可引入 FH5 车辆图片 CDN 或本地缓存机制
- 备选方案：先用品牌首字母作为大图标（如 Ferrari -> F, Porsche -> P），降低实现成本

**优先级**: P2（视觉增强，非功能性问题）

---

### R2-2: Row2 空间优化 -- 车辆信息面板可利用 Row1 空余空间

**现状**: Row1 col 1-3 车辆信息面板跨两行（Row1+Row2），但面板内容较少，存在大量留白。Row2 的 WheelCompositePanel 从 col 4 开始，col 1-3 的下半部分被车辆面板占用。

**方案**:
- 方案 A：车辆面板仅占 Row1（不跨行），Row2 col 1-3 释放给其他用途（如快捷操作面板或迷你赛道图）
- 方案 B：车辆面板保持跨行，但增加更多内容（R2-1 的车辆图片 + 轮胎温度概览 + 最佳圈速等），充分利用垂直空间
- 方案 C：Row2 col 1-3 显示"当前比赛摘要"（赛道名/圈数/已用时间）

**优先级**: P1（空间利用率）

---

### R2-3: DataTrendPanel 待机状态优化

**现状**: 待机时 DataTrendPanel 始终显示，但无数据时可能显示空白或无意义的零值图表。

**方案**:
- 无数据时在 DataTrendPanel 区域显示"等待数据..."占位状态
- 或者待机时整个 Row4 也隐藏，让 Row3 的待机面板扩展到 Row4（更大的欢迎区域）

**优先级**: P2（视觉细节）

---

### R2-4: 合并面板内滚动优化

**现状**: Row4 合并面板（LapPrediction+DrivingAdvice, DataExport+TrackRecognition）在 180px 高度内放置两个子组件，可能出现内容溢出。

**方案**:
- 为合并面板添加内部滚动（已有 `overflow: auto`）
- 更优方案：子组件切换为 Tab 切换模式，一次只显示一个子组件，通过 Tab 标签切换
- Tab 标签方案可参考：[预测] [建议] | [导出] [识别]

**优先级**: P1（可用性）

---

### R2-5: 赛道识别面板从 Row4 提升为全局浮动

**现状**: TrackRecognition 嵌在 Row4 的合并面板中，赛道识别是一个低频但重要的操作，放在底部不易被注意到。

**方案**:
- 赛道识别保留 Row4 中的入口，但增加全局浮动提示（类似 Connection Status Indicator）
- 当收到 `trackRecognized` 事件时，在页面右上角弹出识别结果确认浮窗
- 确认/拒绝操作在浮窗中完成，无需找到 Row4 面板

**优先级**: P2（用户体验）

---

### R2-6: 车辆名称映射完善

**现状**: vehicles.json 中的车辆名称为自动检测格式（"Car #3051"），未映射为 FH5 真实车型名。

**方案**:
- 引入 FH5 车辆数据库（ordinal -> 名称映射表），约 600+ 辆车
- 在服务端 car auto-detect 逻辑中自动填充真实车名
- 前端显示优先级：真实车名 > vehicles.json 中的 name > "Car #XXX"

**优先级**: P1（信息准确性）
