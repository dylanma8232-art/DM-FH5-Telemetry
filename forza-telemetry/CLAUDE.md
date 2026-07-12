# FH5 遥测系统 - CodeGraph 知识图谱


> [!IMPORTANT]
> **AI 协作与索引维护指南**：
> - 本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) (v1.2.0+) 进行智能索引和知识图谱管理。
> - 任何 AI Agent 在对项目新增、修改或删除文件后，必须运行 `npm run build:map` 重新构建并更新 [CODEMAP.md](file:///Users/wenchen.ma/Desktop/fh5/CODEMAP.md)，以保证知识图谱的精确度，帮助后续 Agent 快速掌握架构与看懂代码。

---


## 1. 项目概述

**Forza Horizon 5 实时遥测分析系统**，基于 UDP 数据接收、WebSocket 实时传输、Canvas/React 可视化渲染。

核心功能：
- 实时接收 FH5 游戏遥测 UDP 数据（324字节/包，约 30fps）
- 仪表盘实时显示速度、转速、轮胎温度、悬挂、G力、油门刹车等
- 赛道自动识别、中心线提取、弯道检测、路书生成
- **环道检测**：自动检测环形赛道并提取单圈数据（方案F闭合点检测 + 方案D曲率周期性检测）
- 比赛记录与回放、分段计时、圈速对比
- 车辆自动检测与管理
- 调校管理与对比
- 驾驶建议与语音播报（小米 TTS）
- AI 教练分析

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
| 数据存储 | JSON 文件 + Brotli 压缩（文件系统） |
| 语音合成 | 小米 TTS API (mimo-v2.5-tts) |
| AI 教练 | DashScope API |
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
├── scripts/                     # 构建脚本
│   └── generate_codemap.py      # CODEMAP 生成脚本
│
├── server/                      # 后端服务
│   ├── package.json             # 依赖: express, socket.io
│   ├── src/
│   │   ├── index.js             # 主入口: Express + Socket.IO + UDP + 所有API (~5356行)
│   │   ├── telemetry-parser.js  # UDP 二进制数据解析器 (SLED 232B + Dash 79B, ~368行)
│   │   ├── track-builder.js     # 赛道构建: 中心线提取/弯道检测/路书生成/环道检测 (~1074行)
│   │   ├── rebuild-tracks.js    # 数据清洗脚本: 重建赛道/清洗vehicles (~279行)
│   │   ├── data-listener.js     # 独立数据监听工具（轮询API检查数据）
│   │   ├── config/
│   │   │   └── constants.js     # 配置常量
│   │   ├── services/
│   │   │   ├── retention.js     # 会话自动清理服务
│   │   │   └── state-manager.js # 全局状态管理器
│   │   ├── storage/
│   │   │   ├── atomic-writer.js # 原子写入工具
│   │   │   ├── file-db.js       # Brotli 压缩读写封装
│   │   │   └── migration.js     # 数据库迁移工具
│   │   └── utils/
│   │       ├── get-current-api.js    # API 调试工具
│   │       ├── listen-and-classify.js # 数据监听分类工具
│   │       └── rdp.js                # RDP 轨迹简化算法
│   └── data/
│       └── tracks-database.json # 内置赛道数据库
│
├── client/                      # 前端应用
│   ├── package.json             # 依赖: react, recharts, socket.io-client
│   ├── vite.config.js           # Vite 构建配置
│   ├── index.html               # 入口 HTML
│   ├── public/                  # PWA 静态资源 (icons, manifest, sw.js)
│   │   └── generate-icons.cjs   # 图标生成脚本
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
│       │   ├── dashboard/       # 仪表盘子组件
│       │   │   ├── AICoachPanel.jsx          # AI教练面板
│       │   │   ├── AlertAdvicePanel.jsx      # 警报与驾驶反馈中心
│       │   │   ├── BrakingGripDynamicsPanel.jsx # 底盘监测面板
│       │   │   ├── LapComparison.jsx         # 圈速对比
│       │   │   ├── PaceNoteExport.jsx        # 路书导出
│       │   │   ├── PaceNotesPanel.jsx        # 路书面板
│       │   │   ├── PartsConfigurator.jsx     # 部件配置器
│       │   │   ├── RacePerformanceTimingPanel.jsx # 比赛计时面板
│       │   │   ├── ReplayPlayer.jsx          # 回放播放器
│       │   │   ├── SectorAnalysis.jsx        # 分段分析
│       │   │   └── ThrottleBrakeHeatmap.jsx  # 油门刹车热力图
│       │   ├── settings/
│       │   │   └── SettingsPanel.jsx
│       │   └── shared/          # 通用UI组件
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
│       │   └── useKeyboard.js   # 键盘快捷键
│       │
│       ├── utils/               # 工具函数
│       │   ├── formatters.js    # 数据格式化
│       │   └── speechQueue.js   # 语音队列管理
│       │
│       └── data/                # 静态数据
│           ├── parts.js         # 车辆部件列表
│           └── tunePresets.js   # 调校预设
│
├── data/                        # 运行时数据存储
│   ├── tracks-metadata.json     # 赛道元数据索引（轻量）
│   ├── tracks/                  # 赛道详情（Brotli 压缩）
│   │   └── track_*.json.br
│   ├── track_records/           # 赛道记录
│   ├── vehicles.json            # 车辆数据库（自动检测）
│   ├── tunes.json               # 调校数据库
│   └── sessions/                # 比赛记录
│       ├── session_*_summary.json          # 摘要文件
│       ├── session_*_detail_hifi.json.br   # 高精度详情（Brotli压缩）
│       ├── session_*_detail_lowfi.json.br  # 低精度详情（Brotli压缩）
│       └── session_*_ai_coach.md           # AI教练报告
│
└── docs/                        # 开发文档（迭代记录）
    └── *.md                     # 各模块开发迭代记录
```

---

## 4. 核心模块说明

### 4.1 仪表盘

**页面组件**: `client/src/components/pages/DashboardPage.jsx`

子组件（按功能分组）：

| 功能组 | 组件 | 说明 |
|--------|------|------|
| AI教练 | `AICoachPanel.jsx` | AI驾驶教练建议 |
| 警报/建议 | `AlertAdvicePanel.jsx` | 警报与驾驶反馈中心，基于物理参数动态计算阈值 |
| 底盘/轮胎 | `BrakingGripDynamicsPanel.jsx` | 底盘监测：四轮滑移、胎温、行程、差速、G力 |
| 圈速对比 | `LapComparison.jsx` | 多圈速度/油门/刹车曲线对比 |
| 路书 | `PaceNotesPanel.jsx` | 拉力赛路书渲染器，支持语音播报 |
| 路书导出 | `PaceNoteExport.jsx` | 路书导出功能 |
| 部件配置 | `PartsConfigurator.jsx` | 车辆部件配置 |
| 比赛计时 | `RacePerformanceTimingPanel.jsx` | 比赛时间与分段计时器，支持Delta和历史圈 |
| 回放 | `ReplayPlayer.jsx` | 比赛回放播放器 |
| 分段分析 | `SectorAnalysis.jsx` | 分段耗时与一致性分析 |
| 热力图 | `ThrottleBrakeHeatmap.jsx` | 油门刹车输入热力图 |

### 4.2 赛道管理

**页面组件**: `client/src/components/pages/TrackManagerPage.jsx`

功能：
- 赛道列表浏览与搜索
- 赛道详情查看（中心线、弯道、路书）
- 赛道编辑（修改名称、描述）
- 赛道合并（多条轨迹融合为更精确的赛道）
- 赛道质量验证（评分 A-F）
- 从比赛记录导入赛道
- 弯道速度提示编辑
- **赛道地图 3D 渲染**：Canvas 高清晰度 12 米保底路宽绘制，直道蓝色/弯道橙色区分渲染，当前编辑弯道高对比亮黄色高亮，并配合弯心 Apex 徽章、发光同心圆进行精准定位。底层采用原生 `ctx.lineTo` + `stroke` 连续路径绘制消除锯齿边缘，不再使用多边形拼接。
- **路书表单编辑器**：支持实时修改弯道的转向方向、WRC 等级、倾角（banking / off-camber）、起伏（crest / jump）以及自定义语音备注，提供弯角删除与重排序功能。弯道角度识别采用 `≥` (大于等于) 的严谨阈值，并直接映射至**拉力赛级标准的 1-6 号数字路书体系** (如: ≥130° 为 1, ≥90° 为 2, ≥60° 为 3 等)。
- 赛道导出
- **赛道重建**（应用环道检测重新生成）
- **动态前瞻路书**：实现以 2.5 秒反应时间为视界的自适应车速前瞻预警（`PaceNotesPanel.jsx`），高速自动拉长前瞻点数，低速保底，出弯 24 米自动释放。
- **HUD 路书大字渲染**：在仪表盘 compact 模式下合并渲染方向箭头与具体弯度 WRC 文本（如 `↖ 左3`），使提示更加清晰。
- **均匀三分段计时**：对赛道强制注入 3 个物理 Sectors 切点，支持实时分段计时和多维度速度性能指标。

后端核心：`server/src/track-builder.js`
- `buildTrackFromTrajectories()` - 多轨迹聚合为中心线（含环道检测）
- `findClosurePoint()` - **环道检测**：闭合点检测（位置+方向双重验证）
- `detectCurvaturePeriodicity()` - **环道检测**：曲率序列周期性检测
- `detectLoopAndExtractSingleLap()` - **环道检测主函数**：组合方案F+D
- `detectTurnsEnhanced()` - 弯道检测（发夹弯/急弯/中速弯/慢弯/直道微弯）
- `buildRouteBook()` - 路书生成（入弯/弯中/出弯速度、刹车点、降档建议）
- `validateTrackQuality()` - 赛道数据质量评分
- `resampleCenterline()` - 中心线重采样
- `smoothCenterline()` - 中心线平滑（Catmull-Rom + 高斯滤波）
- `computeDTWPath()` - DTW 动态时间规整（含 Yaw 惩罚，解决交叉环道）

数据清洗工具：`server/src/rebuild-tracks.js`
- `npm run rebuild:tracks` - 重建所有赛道数据，清洗 vehicles.json 孤儿引用

### 4.3 比赛中心

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
  - 遥测通道 (`/api/analysis/:id/telemetry-channels`)
  - 高级分析 (`/api/analysis/:id/advanced`)
  - 弯道分析 (`/api/analysis/:id/turns`)
  - AI教练 (`/api/analysis/:id/ai-coach`)
- 数据导出（CSV/JSON）
- 比赛报告生成
- 关联赛道和车辆

### 4.4 车辆管理

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
  "tracks": ["trackId"],  // 注意：现在存储 trackId 而非 trackName
  "bestLap": 0,
  "lastUsed": "ISO时间",
  "autoDetected": true
}
```

### 4.5 车辆工坊/调校管理

**页面组件**: `client/src/components/pages/TuneManagerPage.jsx`

功能：
- 调校创建/编辑/删除
- 调校对比（选择两个调校逐项对比差异）
- 激活调校（与当前Session关联）
- 调校模板（基于预设或现有调校创建）

调校包含的部件类别（`client/src/data/parts.js`）：
- 引动机、传动、进气
- 涡轮、排气、ECU
- 悬挂、防倾杆 (Anti-Roll Bars)
- 差速器、刹车、轮胎
- 重量、离合器
- 轮圈、车身套件、尾翼

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
- 位置(3轴), 速度(m/s), 功率, 扭矩
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
比赛过程中（!trackMode 且 autoRacePositions.length > 50 时，每5秒触发一次）:
  车手当前位置轨迹 ─[下采样 30 点]──┐
                                     ▼
  已知赛道数据库 ────[等间距抽取 100 点]──► 惰性加载至全局 Map 内存缓存
                                                               │
                                                               ▼
                                                       空间 Euclidean 距离比对
                                                       - 25m 阈值内计为 matchedCount
                                                       - 计算匹配率 Match Ratio = matchedCount / 30
                                                       - 计算平均偏离 avgDist, 转换距离得分 distScore = exp(-avgDist/20)
                                                               │
                                                               ▼
                                                       时序单调性校验
                                                       - 检查匹配点在环形中心线上的索引序列 j_i
                                                       - 校验序列在环路中的单向推进度 seqScore
                                                               │
                                                               ▼
                                                       综合置信度计算
                                                       confidence = Match Ratio * distScore * (0.3 + 0.7 * seqScore)
                                                               │
                                                               ▼
  最高置信度最佳匹配 ────► 若 confidence > 0.6 ──────► 后台自动激活 trackMode 并推送 WebSocket 'trackRecognized' 事件
                                                                   - 领航播报自动连接，念出自定义备注
                                                                   - 完赛后数据自动作为第 N 条轨迹合并存盘！
```

### 5.5 环道检测流

```
赛道构建时（buildTrackFromTrajectories 入口）:
  输入轨迹 → detectLoopAndExtractSingleLap(轨迹)
    │
    ├─ 方案F: findClosurePoint()
    │   └─ 检测轨迹回到起点附近（<30m）且方向一致（<45°）
    │
    ├─ 方案D: detectCurvaturePeriodicity()
    │   └─ 曲率序列自相关分析，检测周期性（阈值>0.6）
    │
    └─ 组合判断:
        ├─ 两者一致 → 高置信度切出单圈
        ├─ 只有F → 使用F结果
        ├─ 只有D → 使用D结果
        └─ 都没有 → 返回全部（非环道）
    │
    ▼
  单圈轨迹 → 正常融合流程
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
| PUT | `/api/tracks/:id/turns` | 批量更新/保存赛道弯道路书数据（含自定义语音备注） |
| DELETE | `/api/tracks/:id` | 删除赛道 |
| PUT | `/api/tracks/:id/turns/:index/speedHint` | 编辑弯道速度提示 |
| POST | `/api/tracks/merge` | 合并多条轨迹 |
| POST | `/api/tracks/import-sessions` | 从比赛记录导入赛道 |
| POST | `/api/tracks/:id/rebuild` | 重建赛道数据（应用环道检测） |

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
| GET | `/api/analysis/:sessionId/telemetry-channels` | 遥测通道分析 |
| GET | `/api/analysis/:sessionId/advanced` | 高级分析 |
| GET | `/api/analysis/:sessionId/turns` | 弯道分析 |
| GET | `/api/analysis/:sessionId/ai-coach` | AI教练建议 |
| POST | `/api/analysis/:sessionId/ai-coach` | 生成AI教练报告 |

### 6.8 导出与报告

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/csv/:sessionId` | 导出CSV |
| GET | `/api/export/json/:sessionId` | 导出JSON |
| GET | `/api/export/report/:sessionId` | 导出比赛报告 |

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

### 6.12 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/dashscope-key` | 获取 DashScope API Key |
| POST | `/api/settings/dashscope-key` | 设置 DashScope API Key |

---

## 7. Socket.IO 事件

### 7.1 服务端 → 客户端

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

| 文件 | 行数 | 职责 |
|------|------|------|
| `server/src/index.js` | ~5356 | 主入口: 全部API/Socket.IO/UDP/TTS/录制逻辑 |
| `server/src/telemetry-parser.js` | ~368 | UDP二进制→JSON解析（SLED+Dash） |
| `server/src/track-builder.js` | 门面 | 聚合导出 `track-math`, `track-turns`, `trajectory-cleaner`, `centerline-processor`, `builder-facade` 等赛道算法拆分模块 |
| `server/src/services/physics-analyzer.js` | 门面 | 聚合导出 `scoring`, `telemetry-stats`, `advice-generator` 等物理与遥测分析拆分模块 |
| `server/src/config/constants.js` | - | 配置常量 |
| `server/src/services/retention.js` | - | 会话自动清理 |
| `server/src/services/state-manager.js` | - | 全局状态管理 |
| `server/src/storage/atomic-writer.js` | - | 原子写入 |
| `server/src/storage/file-db.js` | - | Brotli 压缩读写 |
| `server/src/storage/migration.js` | - | 数据迁移 |
| `server/src/utils/rdp.js` | - | RDP 轨迹简化算法 |
| `server/src/utils/asyncHandler.js` | - | 路由全自动异常捕获 |

### 前端核心

| 文件 | 职责 |
|------|------|
| `client/src/App.jsx` | 根组件: 5标签页路由、Socket连接管理 |
| `client/src/hooks/useSocket.js` | Socket.IO连接 + rAF优化渲染 |
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

# 启动前端
npm run client

# 更新代码图谱/知识图谱 (在代码文件发生变动后运行)
npm run build:map

# 重建所有赛道数据（应用环道检测，清洗vehicles.json）
npm run rebuild:tracks
```

---

## 10. 架构关键点

1. **主要逻辑集中**: 核心后端逻辑在 `index.js`（~5356行），已部分模块化（config/services/storage/utils 目录）。
2. **数据存储**: 使用 JSON 文件 + Brotli 压缩存储，无数据库。赛道详情以 `.json.br` 格式存储，Session 分为摘要和详情（Brotli压缩）。
3. **前端 SPA**: React 单页应用，通过标签页切换5个主要视图，支持 PWA 离线访问。仪表盘组件已大幅精简（从~43个减至11个）。
4. **实时通信**: Socket.IO 双向通信，遥测数据以约30fps广播，节流间隔33ms。
5. **赛道识别**: 使用多维度相似度算法（Hausdorff + Fréchet + 曲率 + 方向 + 边界 + 长度），支持顺时针/逆时针双向匹配。
6. **环道检测**: 在赛道构建入口自动检测环形赛道（闭合点检测 + 曲率周期性检测），提取单圈数据避免弯道重复记录。
7. **TTS 语音播报**: 集成小米 TTS API，播报弯道导航信息（刹车/入弯/弯心/出弯），带缓存机制。
8. **自动录制**: 状态机驱动（IDLE → RECORDING → POST_RACE → IDLE），自动检测比赛开始/结束，识别赛道并生成数据。
9. **AI 教练**: 集成 DashScope API，基于比赛数据生成驾驶分析报告。

---

## 11. 已知问题与修复记录

### 11.1 routerContext 上下文注册规范

所有路由模块（`routes/` 目录）均通过 `const { ... } = context` 解构获取工具函数。  
**必须确保** 每个路由模块解构所需的函数/对象都已在 `server/src/index.js` 的 `routerContext` 对象上注册。

已注册的关键项（含 2026-07-11 补充）：
- `simplifyRDP`（从 `utils/rdp.js` 导入）——**之前遗漏，导致赛道合并接口 500 错误**

> [!WARNING]
> `routes/tracks.js` 解构使用了 `simplifyRDP`，但 routerContext 一直未注册，
> 导致 `POST /api/tracks/merge` 每次都抛 TypeError 500。
> 前端因未检查 `res.ok` 而静默显示"合并成功"，赛道实际未删除。
> **已于 2026-07-11 修复：在 index.js 中 import 并注册 simplifyRDP。**

---

### 11.2 赛道模式状态管理陷阱

**核心状态：** `trackMode`（`index.js` 中，通过 `getTrackMode()`/`setTrackMode()` 访问）

#### 正确生命周期

```
点击"开始比赛" → POST /api/trackMode/start → setTrackMode({ trackId, trackName })
       ↓
比赛进行中 → handleAutoRecord 实时读 getTrackMode() 用于路书播报
       ↓
比赛结束 → stopAutoRecording() 执行：
   1. const capturedMode = getTrackMode()          ← 先捕获
   2. setTrackMode(null)                            ← 再清除
   3. saveAutoRecordedDataWithWorker(..., capturedMode) ← 传捕获值
       ↓
Worker 异步保存完成 → worker.terminate()
   ⚠️ Worker 回调里【绝对不能】再次 setTrackMode(null)！
```

#### Bug A：Worker 回调无条件清除 trackMode（2026-07-11 修复）

`record.js` 的 `worker.on('message')` 回调里曾有 `setTrackMode(null)`，导致：
1. 上一局 Worker 还在异步处理（可能数十秒）
2. 用户点"开始比赛" → `setTrackMode({ trackId })`
3. 上一局 Worker 完成 → `setTrackMode(null)` → **杀死当前局 trackMode！**
4. 当前局结束 → `stopAutoRecording` 捕获 `null` → 创建新赛道而非归档

**修复：** 删除 Worker 回调里的所有 `setTrackMode(null)` 调用。

#### Bug B：Worker 判断依赖过时 tracks 快照（2026-07-11 修复）

Worker 通过 `workerData` 接收的 `tracks` 是**结构化克隆的深拷贝**，可能不含刚创建的赛道。
旧逻辑 `tracks[trackMode.trackId]` 为假时直接降级创建新赛道。

**修复：** 改为优先查文件系统（`existsSync(.json.br)`），不依赖内存快照：
```javascript
const trackFilePath = path.join(DATA_DIR, 'tracks', `${trackId}.json.br`);
let trackDetail = existsSync(trackFilePath) ? readTrackDetail(DATA_DIR, trackId) : null;
if (!trackDetail && tracks[trackId]) trackDetail = { ...tracks[trackId] };
```

---

### 11.3 前端 fetch 错误处理规范

> [!IMPORTANT]
> 所有 fetch 调用**必须**检查 `res.ok`，否则后端 4xx/5xx 会被静默忽略，
> 用户看到"成功"提示但操作实际失败。

```javascript
// ✅ 正确
const res = await fetch('/api/tracks/merge', { method: 'POST', ... });
const data = await res.json();
if (!res.ok) { toast('失败: ' + (data.error || '服务器错误'), 'error'); return; }
toast('成功', 'success');

// ❌ 错误（前端假成功）
await fetch('/api/tracks/merge', { ... });
toast('合并成功', 'success');
```

---

### 11.4 比赛摘要圈速写入规范

`save-worker.js` 计算并写入 `_summary.json` 中的圈速信息，依赖 `hifiData` JSONL 遥测流。

| 字段 | 来源 |
|------|------|
| `laps.best` | hifiData 中最后一个 `bestLap > 0` 的帧 |
| `laps.last` | hifiData 中最后一个 `lastLap > 0` 的帧 |
| `laps.count` | hifiData 中最大 `lapNumber` |
| `summary.duration` | 优先 `sessionDataMeta.duration`，其次首尾帧时间差 |

> [!NOTE]
> 2026-07-11 前 save-worker.js 改造时漏掉了圈速计算逻辑，
> 一批历史比赛记录缺失 `laps` 字段，已用修复脚本补救。
