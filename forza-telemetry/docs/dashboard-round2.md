# 仪表盘 Round 2 迭代方案

## 一、已修复/优化项

### R2-1: 车辆名称映射优化 [P1]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**: 车辆信息面板始终显示 "Car #XXX"，因为 vehicles.json 中大部分车辆未映射真实车名，仅存储自动检测格式。遥测数据中已有 carClass、performanceIndex、drivetrainType 等字段但未被充分利用。

**修复**:
- 修改车辆名称解析逻辑，增加智能判断：
  - 如果 vehicles.json 中的名称**不以 "Car #" 开头**（即有真实映射名），则使用自定义名称
  - 否则回退到 `Car #{ordinal}` 格式
  - Class / PI / Drivetrain 标签**始终从遥测数据读取**，不依赖 vehicles.json
- 移除了未使用的 VehicleAnalysisPanel lazy import

**遥测可用字段**（来自 telemetry-parser.js）:
```
car.ordinal (s32)        - 车辆唯一标识
car.class (s32)          - 车辆等级: 0=D, 1=C, 2=B, 3=A, 4=S1, 5=S2, 6=X
car.performanceIndex (s32) - 性能指数
car.drivetrainType (s32) - 驱动类型: 0=FWD, 1=RWD, 2=AWD
car.numCylinders (s32)    - 气缸数
```

---

### R2-2: Row2 面板布局优化 [P1]

**文件**: `client/src/components/pages/DashboardPage.jsx`

**问题**:
- VehicleAnalysisPanel 在 Row2 col 10-13 显示车辆健康度分析（抓地力/悬挂/车身姿态），但车辆基础信息已在 Row1 车辆面板展示，内容重复且占用宝贵空间
- WheelCompositePanel 在 col 4-8 偏窄，轮胎详情展示空间不足

**修复**:
- 移除 Row2 的 VehicleAnalysisPanel
- 新增 `DrivingScoreMini` 组件（紧凑型驾驶评分面板，内联在 DashboardPage 中）:
  - SVG 环形评分指示器 + 油门/刹车/转向三条迷你进度条
  - 基于 controls (accel/brake/steer) 历史数据计算平滑度评分
  - 占 col 11-13，与 Row1 警告面板对齐
- 重新分配 Row2 空间:

| 面板 | 旧列范围 | 新列范围 | 变化 |
|------|----------|----------|------|
| WheelCompositePanel | 4-8 | 4-9 | +1列 |
| SurfaceIndicator | 8-10 | 9-11 | 不变 |
| DrivingScoreMini | - | 11-13 | 新增(替代VehicleAnalysisPanel) |

**DrivingScoreMini 评分算法**:
- 油门(35%): 加速度输入平滑度 + 突变惩罚
- 刹车(35%): 刹车力度平滑度 + 急刹惩罚
- 转向(30%): 转向输入平滑度
- 滑动窗口: 120帧历史数据

---

### R2-3: DataTrendPanel 待机态 [P2]

**文件**: `client/src/components/dashboard/DataTrendPanel.jsx`

**问题**: 无遥测数据时，DataTrendPanel 显示空图表（全零数据线），用户体验不佳。

**修复**:
- 增加 `hasData` 判断：当历史数据 < 3 条且当前速度为 0 时视为待机状态
- 待机态显示：
  - 波形 SVG 图标（蓝色圆形容器）
  - "等待遥测数据..." 主文字
  - "开始驾驶后将显示实时趋势" 辅助文字
  - 居中布局，与面板整体暗色主题一致
- 有数据后自动切换到正常图表视图

---

## 二、构建验证

`npm run build` 通过，无错误。

变化：
- VehicleAnalysisPanel chunk 从 dist 中移除（不再被仪表盘引用）
- DrivingScoreMini 逻辑内联在 DashboardPage 主 chunk 中（体积很小，无需拆分）

---

## 三、Round 3 待优化项清单

### R3-1: 车辆名称数据库完善 [P1]

**现状**: vehicles.json 中大部分 ordinal 未映射真实车名，仍显示 "Car #XXX"。

**方案**:
- 引入 FH5 完整车辆数据库（ordinal -> 品牌名 + 车型名），约 600+ 辆车
- 在服务端 car auto-detect 逻辑中自动填充真实车名
- 前端显示优先级：真实车名 > vehicles.json name > "Car #XXX"

---

### R3-2: Row4 合并面板 Tab 切换 [P1]

**现状**: Row4 的合并面板（LapPrediction+DrivingAdvice, DataExport+TrackRecognition）在 180px 高度内放置两个子组件，可能出现内容溢出。

**方案**:
- 为合并面板添加 Tab 切换模式，一次只显示一个子组件
- Tab 标签: [预测] [建议] | [导出] [识别]
- 减少滚动需求，提升可读性

---

### R3-3: 赛道识别浮动提示 [P2]

**现状**: TrackRecognition 嵌在 Row4 合并面板底部，赛道识别是低频但重要操作，容易被忽略。

**方案**:
- 收到 `trackRecognized` 事件时在页面右上角弹出浮窗（类似 Connection Status）
- 浮窗显示识别结果，提供确认/拒绝操作
- 无需找到 Row4 面板即可完成确认

---

### R3-4: 驾驶评分历史持久化 [P2]

**现状**: DrivingScoreMini 评分数据仅在组件 ref 中保存，页面刷新后丢失。

**方案**:
- 将驾驶评分历史记录通过 session 存储或 API 持久化
- 支持查看历史最佳评分和评分趋势
- 可在 DrivingScoreMini 中显示"本次最佳"标记

---

### R3-5: 响应式布局适配 [P2]

**现状**: 仪表盘固定 12x4 grid，仅针对 1920x1080 优化。在小屏幕或不同宽高比下布局可能溢出。

**方案**:
- 添加断点检测（1366x768, 1280x720 等常见分辨率）
- 小屏幕时切换为简化布局（如 2 行、更少的列）
- 或提供"紧凑模式"开关

---

### R3-6: VehicleAnalysisPanel 内容整合 [P3]

**现状**: VehicleAnalysisPanel 已从 Row2 移除，但其车辆健康度分析功能（车身姿态/抓地力/悬挂健康度）对进阶用户仍有价值。

**方案**:
- 将 VehicleAnalysisPanel 核心数据整合到 DrivingScoreMini 中（如抓地力百分比）
- 或在 Row4 的 DataExport 合并面板中添加"车辆健康度摘要"标签页
- 保持代码可复用，仅调整展示位置
