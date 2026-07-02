# FH5 遥测系统 - CodeGraph 知识图谱

> 本文件是项目的 AI Agent 知识图谱，提供完整的项目结构、模块关系和数据流信息。

---

## 1. 项目概述

**Forza Horizon 5 实时遥测分析系统**，基于 UDP 数据接收、WebSocket 实时传输、Canvas/React 可视化渲染。

核心功能：
- 实时接收 FH5 游戏遥测 UDP 数据（324字节/包，约 30fps）
- 仪表盘实时显示速度、转速、轮胎温度、悬挂、G力、油门刹车等
- 赛道自动识别、中心线提取、弯道检测、路书生成
- 比赛记录与回放、分段计时、圈速对比
- 车辆自动检测与管理
- 调校（Tune）管理与对比
- 驾驶建议与语音播报（小米 TTS）

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite 5 |
| 状态/通信 | Socket.IO Client 4.x |
| 图表库 | Recharts 3.x |
| 后端框架 | Node.js (ES Modules) + Express 4.x |
| 实时通信 | Socket.IO Server 4.x |
| 数据接收 | Node.js dgram (UDP) |
| 数据存储 | JSON 文件（文件系统） |
| 语音合成 | 小米 TTS API (mimo-v2.5-tts) |
| PWA | Service Worker + manifest.json |

---

## 3. 目录结构

```
forza-telemetry/
├── CLAUDE.md                    # 本文件 - AI知识图谱
├── .codegraph/                  # CodeGraph 配置目录
├── README.md                    # 项目说明
├── package.json                 # 根 monorepo 脚本
├── monitor.sh                   # 服务器监控脚本
│
├── server/                      # 后端服务
│   ├── package.json             # 依赖: express, socket.io
│   ├── src/
│   │   ├── index.js             # 主入口: Express + Socket.IO + UDP + 所有API
│   │   ├── telemetry-parser.js # UDP 二进制数据解析器 (SLED 232B + Dash 79B)
│   │   ├── track-builder.js    # 赛道构建: 中心线提取/弯道检测/路书生成
│   │   ├── data-listener.js    # 独立数据监听工具（轮询API检查数据）
│   │   └── test-sender.js      # 测试UDP数据发送器
│   └── data/
│       └── tracks-database.json # 内置赛道数据库
│
├── client/                      # 前端应用
│   ├── package.json             # 依赖: react, recharts, socket.io-client
│   ├── vite.config.js           # Vite 构建配置
│   ├── index.html               # 入口 HTML
│   ├── public/                  # PWA 静态资源 (icons, manifest, sw.js)
│   ├── dist/                    # 构建输出（服务器直接托管此目录）
│   └── src/
│       ├── main.jsx             # React 入口
│       ├── App.jsx              # 根组件: 路由/标签页/Socket连接
│       ├── themes.js            # 主题变量定义
│       │
│       ├── components/
│       │   ├── Header.jsx       # 顶部状态栏
│       │   ├── pages/           # 五大页面
│       │   │   ├── DashboardPage.jsx
│       │   │   ├── TrackManagerPage.jsx
│       │   │   ├── SessionHistoryPage.jsx
│       │   │   ├── VehicleManagerPage.jsx
│       │   │   └── TuneManagerPage.jsx
│       │   ├── dashboard/       # 仪表盘子组件 (~45个)
│       │   ├── settings/
│       │   │   └── SettingsPanel.jsx
│       │   └── shared/          # 通用UI组件
│       │       ├── Bar.jsx
│       │       ├── Button.jsx
│       │       ├── Card.jsx
│       │       ├── EmptyState.jsx
│       │       ├── ErrorBoundary.jsx
│       │       ├── LoadingSpinner.jsx
│       │       └── Toast.jsx
│       │
│       ├── contexts/            # React Context
│       │   ├── SettingsContext.jsx
│       │   └── ThemeContext.jsx
│       │
│       ├── hooks/               # 自定义 Hooks
│       │   ├── useSocket.js     # Socket.IO 连接管理
│       │   ├── useApi.js        # HTTP 请求封装
│       │   ├── useKeyboard.js   # 键盘快捷键
│       │   ├── useDebounce.js   # 防抖
│       │   ├── useGForceHistory.js   # G力历史
│       │   ├── useHistoryBuffer.js   # 数据历史缓冲
│       │   ├── useAudioFeedback.js  # 音频反馈
│       │   └── usePaceNoteVoice.js   # 路书语音播报
│       │
│       ├── utils/               # 工具函数
│       │   ├── formatters.js   # 数据格式化
│       │   ├── validators.js   # 数据验证
│       │   ├── warnings.js     # 警告规则引擎
│       │   ├── warningConfig.js # 警告配置
│       │   └── warningHistory.js # 警告历史
│       │
│       └── data/                # 静态数据
│           ├── parts.js         # 车辆部件列表
│           └── tunePresets.js   # 调校预设
│
├── data/                        # 运行时数据存储
│   ├── tracks.json              # 赛道数据库（用户录制）
│   ├── vehicles.json            # 车辆数据库（自动检测）
│   ├── tunes.json               # 调校数据库
│   └── sessions/                # 比赛记录
│       └── session_*.json       # 单次比赛数据
│
└── docs/                        # 开发文档（迭代记录）
    └── *.md                     # 各模块开发迭代记录
```

---

## 4. 核心模块说明

### 4.1 仪表盘 (Dashboard)

**页面组件**: `client/src/components/pages/DashboardPage.jsx`

子组件（按功能分组）：

| 功能组 | 组件 | 说明 |
|--------|------|------|
| 速度/动力 | `SpeedGauge.jsx` | 速度表盘 |
| | `SpeedGearPanel.jsx` | 速度+档位 |
| | `VehiclePanel.jsx` | 车辆基本信息 |
| | `VehicleAnalysisPanel.jsx` | 车辆性能分析 |
| 轮胎/悬挂 | `TirePanel.jsx` | 轮胎温度/磨损 |
| | `TireThermalAnalysis.jsx` | 轮胎热力学分析 |
| | `WheelCompositePanel.jsx` | 四轮综合数据 |
| | `SuspensionChart.jsx` | 悬挂行程图表 |
| | `SuspensionIndicator.jsx` | 悬挂状态指示 |
| 刹车/牵引 | `ThrottleBrakeChart.jsx` | 油门刹车输入 |
| | `ThrottleBrakeHeatmap.jsx` | 热力图 |
| | `ABSTCIndicator.jsx` | ABS/TC状态 |
| | `TractionIndicator.jsx` | 牵引力指示 |
| | `BrakeAnalysis.jsx` | 刹车分析 |
| 路面/操控 | `SurfaceIndicator.jsx` | 路面类型 |
| | `RoadSurfaceAnalysis.jsx` | 路面综合分析 |
| | `ControlsPanel.jsx` | 方向盘/踏板输入 |
| 圈速/计时 | `LapPanel.jsx` | 圈速面板 |
| | `LapPrediction.jsx` | 圈速预测 |
| | `LapComparison.jsx` | 圈速对比 |
| | `LapHistoryChart.jsx` | 圈速历史 |
| | `LapDelta.jsx` | Delta时间差 |
| | `LapTrendChart.jsx` | 趋势图 |
| | `SectorTimer.jsx` | 分段计时 |
| | `SectorAnalysis.jsx` | 分段分析 |
| 赛道/导航 | `TrackOverlay.jsx` | 赛道俯视叠加 |
| | `TrackProgressPanel.jsx` | 赛道进度 |
| | `TrackRecognition.jsx` | 赛道识别UI |
| | `PaceNotesPanel.jsx` | 路书面板 |
| | `PaceNoteExport.jsx` | 路书导出 |
| 数据/分析 | `DataTrendPanel.jsx` | 数据趋势 |
| | `DataExportPanel.jsx` | 数据导出 |
| | `FullDataPanel.jsx` | 完整数据面板 |
| | `DrivingScore.jsx` | 驾驶评分 |
| | `DrivingAdvice.jsx` | 驾驶建议 |
| | `RealTimeAdvicePanel.jsx` | 实时建议 |
| | `GhostComparison.jsx` | 幽灵对比 |
| 警告/录制 | `WarningPanel.jsx` | 警告面板 |
| | `TurnWarningHUD.jsx` | 弯道HUD警告 |
| | `RecordingStatusPanel.jsx` | 录制状态 |
| | `ReplayPlayer.jsx` | 回放播放器 |
| 其他 | `PersonalBest.jsx` | 个人最佳 |
| | `DriverDisplays.jsx` | 驾驶员显示 |
| | `MobileDashboard.jsx` | 移动端适配 |

### 4.2 赛道管理 (Track Manager)

**页面组件**: `client/src/components/pages/TrackManagerPage.jsx`

功能：
- 赛道列表浏览与搜索
- 赛道详情查看（中心线、弯道、路书）
- 赛道编辑（修改名称、描述）
- 赛道合并（多条轨迹融合为更精确的赛道）
- 赛道质量验证（评分 A-F）
- 从比赛记录导入赛道
- 弯道速度提示编辑
- 赛道导出

后端核心：`server/src/track-builder.js`
- `buildTrackFromTrajectories()` - 多轨迹聚合为中心线
- `detectTurnsEnhanced()` - 弯道检测（发夹弯/急弯/中速弯/慢弯/直道微弯）
- `buildRouteBook()` - 路书生成（入弯/弯中/出弯速度、刹车点、降档建议）
- `generateSectors()` - 分段计时生成
- `recognizeTrack()` - 赛道自动识别（多维度特征匹配）
- `validateTrackQuality()` - 赛道数据质量评分

### 4.3 比赛中心 (Session History)

**页面组件**: `client/src/components/pages/SessionHistoryPage.jsx`

功能：
- 比赛记录列表
- 圈速榜/排行榜
- 单场比赛深度分析：
  - 轮胎分析 (`/api/analysis/:id/tires`)
  - 刹车分析 (`/api/analysis/:id/braking`)
  - 加速分析 (`/api/analysis/:id/accel`)
  - 换挡分析 (`/api/analysis/:id/shifts`)
  - 分段分析 (`/api/analysis/:id/sectors`)
  - 驾驶建议 (`/api/analysis/:id/advice`)
  - 诊断报告 (`/api/analysis/:id/diagnosis`)
- 数据导出（CSV/JSON）
- 比赛报告生成
- 关联赛道和车辆

### 4.4 车辆管理 (Vehicle Manager)

**页面组件**: `client/src/components/pages/VehicleManagerPage.jsx`

功能：
- 车辆自动检测（通过 carOrdinal）
- 车辆列表（名称、等级PI、驱动类型、首次使用时间）
- 车辆详情（关联赛道、最佳圈速、比赛次数）
- 手动编辑车辆信息
- 删除车辆记录

车辆数据结构：
```json
{
  "ordinal": "3051",
  "name": "Car #3051",
  "class": 4,          // S1=4, S2=5
  "pi": 900,           // 性能指数
  "drivetrain": "AWD", // FWD/RWD/AWD
  "firstSeen": "ISO时间",
  "raceCount": 1,
  "tracks": ["赛道ID"],
  "bestLap": 0,
  "lastUsed": "ISO时间",
  "autoDetected": true
}
```

### 4.5 车辆工坊/调校管理 (Tune Manager)

**页面组件**: `client/src/components/pages/TuneManagerPage.jsx`

功能：
- 调校创建/编辑/删除
- 调校对比（选择两个调校逐项对比差异）
- 激活调校（与当前Session关联）
- 调校模板（基于预设或现有调校创建）

调校包含的部件类别（`client/src/data/parts.js`）：
- 引动机 (Engine)、传动 (Transmission)、进气 (Intake)
- 涡轮 (Turbo)、排气 (Exhaust)、ECU
- 悬挂 (Suspension)、防倾杆 (Anti-Roll Bars)
- 差速器 (Differential)、刹车 (Brakes)、轮胎 (Tires)
- 重量 (Weight Reduction)、离合器 (Clutch)
- 轮圈 (Wheels)、车身套件 (Body Kit)、尾翼 (Aero)

---

## 5. 数据流

### 5.1 实时遥测数据流

```
FH5 游戏
  │ (UDP 324字节/包, ~30fps, 端口 9996)
  ▼
server/src/index.js (dgram UDP Server)
  │ parseTelemetryPacket() → JSON
  │ 节流至 33ms间隔
  ▼
Socket.IO broadcast → 'telemetry' 事件
  │
  ▼
client/src/hooks/useSocket.js
  │ rAF 批量更新渲染
  ▼
DashboardPage → 各子组件渲染
```

### 5.2 UDP 数据包格式

**SLED 区域** (0-231, 232字节)：基本车辆动力学
- isRaceOn, timestampMS, 引擎转速(3项), 加速度(3轴), 速度(3轴)
- 角速度(3轴), 姿态(yaw/pitch/roll)
- 悬挂行程(4轮), 轮胎滑移率(4轮), 车轮转速(4轮)
- 路缘石/水坑/路面震动(4轮), 轮胎滑移角(4轮), 综合滑移(4轮)
- 悬挂行程米数(4轮), 车辆信息(ordinal/class/PI/drivetrain/cylinders)

**FH6 间隙** (232-243, 12字节)：无数据

**Dash 扩展** (244-322, 79字节)：比赛/驾驶数据
- 位置(3轴), 速度(m/s), 功率(W), 扭矩(Nm)
- 轮胎温度(4轮), 涡轮增压, 燃油(0-1)
- 行驶距离, 最快圈/上一圈/当前圈/总比赛时间
- 圈数, 名次, 控制输入(油门/刹车/离合/手刹/档位/转向)
- 驾驶线, AI刹车差

### 5.3 比赛录制流

```
自动录制流程:
  UDP数据到达 → isRaceOn=true → 自动开始录制(IDLE→RECORDING)
  │                                    │
  │  每包记录: position, speed, brake   │
  │  gear, rpm, lap, bestLap, etc.     │
  ▼                                    │
  isRaceOn=false ──────────────────→ POST_RACE 状态
                                    │ 识别赛道 → 生成赛道数据
                                    │ 保存Session到 data/sessions/
                                    └→ IDLE

手动录制流程:
  POST /api/record/start → 开始手动录制
  POST /api/record/stop  → 停止录制
  POST /api/record/save  → 保存到Session（可指定名称/赛道/车辆）
```

### 5.4 赛道识别流

```
比赛过程中，每5秒识别一次:
  当前轨迹 → recognizeTrack(轨迹, 赛道数据库)
    │
    ├─ Hausdorff距离 (20%)
    ├─ 曲率分布 (15%)
    ├─ 边界框 (10%)
    ├─ 长度 (10%)
    ├─ Frechet距离 (30%)
    └─ 方向分布 (15%)
    │
    ▼
  综合评分 > 0.4 → 发出 'trackRecognized' 事件
    │
    ▼
  前端显示识别结果 → 用户确认/选择
    │
    ▼
  POST /api/trackRecognition/confirm  → 关联赛道
  POST /api/trackRecognition/select   → 选择其他赛道
```

---

## 6. API 端点清单

### 6.1 系统状态

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 服务器状态（UDP端口/IP/包数/是否接收中） |
| GET | `/api/current` | 当前实时遥测数据 |

### 6.2 车辆管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vehicles` | 获取所有车辆 |
| POST | `/api/vehicles/:id` | 更新车辆信息 |
| DELETE | `/api/vehicles/:id` | 删除车辆 |

### 6.3 赛道管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tracks` | 获取所有赛道 |
| GET | `/api/tracks/:id` | 获取赛道详情 |
| GET | `/api/tracks/:id/navigation` | 获取赛道导航数据 |
| GET | `/api/tracks/:id/validate` | 验证赛道数据质量 |
| POST | `/api/tracks` | 创建新赛道 |
| PUT | `/api/tracks/:id` | 更新赛道信息 |
| DELETE | `/api/tracks/:id` | 删除赛道 |
| PUT | `/api/tracks/:id/turns/:index/speedHint` | 编辑弯道速度提示 |
| POST | `/api/tracks/merge` | 合并多条轨迹 |
| POST | `/api/tracks/import-sessions` | 从比赛记录导入赛道 |

### 6.4 调校管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tunes` | 获取所有调校 |
| GET | `/api/tunes/:tuneId` | 获取调校详情 |
| POST | `/api/tunes` | 创建调校 |
| PUT | `/api/tunes/:tuneId` | 更新调校 |
| DELETE | `/api/tunes/:tuneId` | 删除调校 |
| POST | `/api/tunes/active` | 激活调校 |
| GET | `/api/tunes/active` | 获取当前激活的调校 |
| GET | `/api/tunes/compare` | 对比两个调校 |

### 6.5 比赛记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 获取所有比赛记录 |
| GET | `/api/sessions/:id` | 获取比赛详情 |
| GET | `/api/sessions/:id/telemetry` | 获取比赛遥测数据 |
| DELETE | `/api/sessions/:id` | 删除比赛记录 |
| PUT | `/api/sessions/:id/track` | 关联赛道 |
| PUT | `/api/sessions/batch/track` | 批量关联赛道 |

### 6.6 录制控制

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/record/start` | 开始手动录制 |
| POST | `/api/record/stop` | 停止录制 |
| POST | `/api/record/save` | 保存录制为Session |
| GET | `/api/record/positions` | 获取录制位置数据 |

### 6.7 数据分析

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/analysis/:sessionId` | 综合分析 |
| GET | `/api/analysis/:sessionId/tires` | 轮胎分析 |
| GET | `/api/analysis/:sessionId/braking` | 刹车分析 |
| GET | `/api/analysis/:sessionId/accel` | 加速分析 |
| GET | `/api/analysis/:sessionId/shifts` | 换挡分析 |
| GET | `/api/analysis/:sessionId/sectors` | 分段分析 |
| GET | `/api/analysis/:sessionId/advice` | 驾驶建议 |
| GET | `/api/analysis/:sessionId/diagnosis` | 诊断报告 |

### 6.8 导出与报告

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/csv/:sessionId` | 导出CSV |
| GET | `/api/export/json/:sessionId` | 导出JSON |
| GET | `/api/export/report/:sessionId` | 导出比赛报告 |
| GET | `/api/test/report/:sessionId` | 测试报告 |

### 6.9 赛道模式与识别

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/trackMode/start` | 启动赛道模式 |
| POST | `/api/trackMode/stop` | 停止赛道模式 |
| GET | `/api/trackMode/status` | 赛道模式状态 |
| GET | `/api/trackRecognition/current` | 当前识别结果 |
| POST | `/api/trackRecognition/confirm` | 确认识别结果 |
| POST | `/api/trackRecognition/select` | 手动选择赛道 |
| GET | `/api/autoRecord/status` | 自动录制状态 |
| POST | `/api/test/announce` | 测试语音播报 |

### 6.10 排行榜

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/leaderboard` | 圈速排行榜 |
| GET | `/api/leaderboard/trend` | 圈速趋势 |

### 6.11 备份

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/backup/export` | 导出全部数据 |
| POST | `/api/backup/restore` | 恢复数据 |

---

## 7. Socket.IO 事件

### 7.1 服务端 → 客户端 (Broadcast)

| 事件名 | 数据 | 说明 |
|--------|------|------|
| `telemetry` | 实时遥测JSON | 30fps 遥测数据流 |
| `vehicleDetected` | 车辆信息 | 检测到新车辆 |
| `recordStats` | 录制统计 | 录制进度/包数 |
| `trackRecognized` | 识别结果 | 赛道自动识别完成 |
| `turnAnnounce` | 弯道播报数据 | 弯道导航播报（含TTS音频URL） |
| `autoRecordStatus` | 状态对象 | 自动录制状态变更 |
| `trackUpdated` | trackId + name | 赛道数据更新通知 |
| `trackRecognitionConfirmed` | 赛道信息 | 赛道确认完成 |
| `trackRecognitionFeedback` | trackId + correct | 识别反馈 |
| `trackModeChanged` | 模式信息 | 赛道模式变更 |

---

## 8. 关键文件索引

### 后端核心

| 文件 | 行数(估) | 职责 |
|------|----------|------|
| `server/src/index.js` | ~3700 | 主入口: 全部API/Socket.IO/UDP/TTS/录制逻辑 |
| `server/src/telemetry-parser.js` | ~350 | UDP二进制→JSON解析（SLED+Dash） |
| `server/src/track-builder.js` | ~1610 | 赛道算法: 中心线/弯道/路书/识别/验证 |

### 前端核心

| 文件 | 职责 |
|------|------|
| `client/src/App.jsx` | 根组件: 5标签页路由、Socket连接管理 |
| `client/src/hooks/useSocket.js` | Socket.IO连接 + rAF优化渲染 |
| `client/src/hooks/useApi.js` | HTTP请求封装(GET/POST/PUT/DELETE) |
| `client/src/components/pages/DashboardPage.jsx` | 仪表盘主页面 |
| `client/src/components/pages/TrackManagerPage.jsx` | 赛道管理 |
| `client/src/components/pages/SessionHistoryPage.jsx` | 比赛中心+排行榜 |
| `client/src/components/pages/VehicleManagerPage.jsx` | 车辆管理 |
| `client/src/components/pages/TuneManagerPage.jsx` | 调校管理 |

---

## 9. 开发命令

```bash
# 安装所有依赖
npm run install:all

# 启动后端 (端口 9188, UDP 9996)
npm run server

# 启动前端 (Vite dev server)
npm run client

# 发送测试UDP数据
npm run test
```

---

## 10. 架构关键点

1. **单服务器架构**: 所有后端逻辑集中在一个 `index.js` 文件中，约3700行，包含所有API、Socket.IO事件、UDP处理、TTS、录制逻辑。
2. **数据存储**: 使用 JSON 文件存储，无数据库。数据量小、读写不频繁，适合当前规模。
3. **前端 SPA**: React 单页应用，通过标签页切换5个主要视图，支持 PWA 离线访问。
4. **实时通信**: Socket.IO 双向通信，遥测数据以约30fps广播，节流间隔33ms。
5. **赛道识别**: 使用多维度相似度算法（Hausdorff + Fréchet + 曲率 + 方向 + 边界 + 长度），支持顺时针/逆时针双向匹配。
6. **TTS 语音播报**: 集成小米 TTS API，播报弯道导航信息（刹车/入弯/弯心/出弯），带缓存机制。
7. **自动录制**: 状态机驱动（IDLE → RECORDING → POST_RACE → IDLE），自动检测比赛开始/结束，识别赛道并生成数据。
