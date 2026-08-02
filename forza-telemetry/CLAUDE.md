# FH5 遥测系统 - CodeGraph 知识图谱


> [!IMPORTANT]
> **AI 协作与索引维护指南**：
> - 本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) (v1.5.0+) 进行智能索引和知识图谱管理（推荐使用 v1.5.0+ 体验 Rust 原生内核解析与毫秒级增量同步）。
> - 任何 AI Agent 在对项目新增、修改或删除文件后，必须运行 `npm run build:map` 重新构建并更新 [CODEMAP.md](file:///Users/wenchen.ma/Desktop/fh5/CODEMAP.md)，以保证知识图谱的精确度，帮助后续 Agent 快速掌握架构与看懂代码。

---


## 1. 项目概述

开发边界与提交前验证要求见 [架构与开发规范](docs/ARCHITECTURE_BOUNDARIES.md)。

**Forza Horizon 5 实时遥测分析系统**，基于 UDP 数据接收、WebSocket 实时传输、Canvas/React 可视化渲染。

核心功能：
- 实时接收 FH5 游戏遥测 UDP 数据（324字节/包，约 30fps）
- 仪表盘实时显示速度、转速、轮胎温度、悬挂、G力、油门刹车等
- 赛道自动识别、中心线提取、弯道检测、路书生成
- **环道检测**：自动检测环形赛道并提取单圈数据（方案F闭合点检测 + 方案D曲率周期性检测）
- 比赛记录与回放、分段计时、圈速对比
- AI 智能诊断工坊
- 车辆自动检测与管理
- 调校管理与对比
- **独立 AI 遥测与驾驶物理诊断工坊**：支持独立选配调校方案、常见驾驶手感难题与圈速遥测 Session，进行物理求解与一键修正应用
- **精细物理构型与锁止矩阵**：解耦轮胎胎压 (原厂可调) 与轮胎定位 (悬挂对齐)，支持防倾杆与空力包围的 4 模式 (前后均可调/仅前/仅后/不可调) 锁止及 `需升级` 极简提示
- **单车专属引擎置换映射**：数据库绑定单车 2~5 款专属候选引擎（含马力、缸型与来源车型），完全防止跨车系非法混装
- 驾驶建议与语音播报（小米 TTS）
- AI 智能诊断分析

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
| AI 智能诊断 | DashScope API |
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
│   │       ├── lttb.js                # 最大三角形三桶降采样算法
│   │       └── rdp.js                # RDP 轨迹简化算法
│   ├── test/                        # 服务端单元测试
│   │   └── upgrade-catalog.test.js  # 配件升级目录与解算逻辑测试
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
│   ├── sessions/                # 比赛记录
│       ├── session_*_summary.json          # 摘要文件
│       ├── session_*_detail_hifi.json.br   # 高精度详情（Brotli压缩）
│       ├── session_*_detail_lowfi.json.br  # 低精度详情（Brotli压缩）
│   └── diagnoses/               # AI 智能诊断缓存
│       └── session_*.json
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

**完整方法论**: [赛道与路书方法论](docs/TRACK_AND_ROUTEBOOK_WORKFLOW.md)。后续涉及赛道几何、候选地图、路书或语音播报的修改，必须先遵循该文档的不可改变原则。

**页面组件**: `client/src/components/pages/TrackManagerPage.jsx`

功能：
- 赛道列表浏览与搜索
- 赛道详情查看（中心线、弯道、路书）
- 赛道编辑（修改名称、描述）
- 赛道合并（多条轨迹融合为候选几何；只有明确采用候选或重建后才替换活跃地图）
- 赛道质量验证（评分 A-F）
- 从比赛记录导入赛道
- 弯道速度提示编辑
- **赛道地图 3D 渲染**：Canvas 高清晰度 12 米保底路宽绘制，直道蓝色/弯道橙色区分渲染，当前编辑弯道高对比亮黄色高亮，并配合弯心 Apex 徽章、发光同心圆进行精准定位。底层采用原生 `ctx.lineTo` + `stroke` 连续路径绘制消除锯齿边缘，不再使用多边形拼接。
- **路书表单编辑器**：支持实时修改弯道的转向方向、WRC 等级、倾角（banking / off-camber）、起伏（crest / jump）以及自定义语音备注，提供弯角删除与重排序功能。弯道角度识别采用 `≥` (大于等于) 的严谨阈值，并直接映射至**拉力赛级标准的 1-6 号数字路书体系** (如: ≥130° 为 1, ≥90° 为 2, ≥60° 为 3 等)。
- 赛道导出
- **赛道重建**（应用环道检测、等弧长重采样、RDP 宏观分弯与分段拟合；连续曲率只能作为辅助分析，不得取代 RDP）
- **参考几何与走线分离**：活跃地图、弯道和路书绑定固定的参考几何版本；每次比赛生成可视候选几何，候选以紫色虚线叠加对比，只有用户采用候选后才改写正式地图和自动路书。路书同时保存弧长锚点，避免重采样后的数组索引漂移。
- **动态前瞻路书**：实现以 2.5 秒反应时间为视界的自适应车速前瞻预警（`PaceNotesPanel.jsx`），高速自动拉长前瞻点数，低速保底，出弯 24 米自动释放。
- **HUD 路书大字渲染**：在仪表盘 compact 模式下合并渲染方向箭头与具体弯度 WRC 文本（如 `↖ 左3`），使提示更加清晰。
- **均匀三分段计时**：对赛道强制注入 3 个物理 Sectors 切点，支持实时分段计时和多维度速度性能指标。

后端核心：`server/src/track-builder.js`
- `buildTrackFromTrajectories()` - 多轨迹聚合为候选中心线（含环道检测、等弧长重采样、RDP 弯道分段与局部拟合）
- `findClosurePoint()` - **环道检测**：闭合点检测（位置+方向双重验证）
- `detectCurvaturePeriodicity()` - **环道检测**：曲率序列周期性检测
- `detectLoopAndExtractSingleLap()` - **环道检测主函数**：组合方案F+D
- `detectTurnsEnhanced()` - 弯道检测（发夹弯/急弯/中速弯/慢弯/直道微弯）
- `buildRouteBook()` - 路书生成（入弯/弯中/出弯速度、刹车点、降档建议）
- `validateTrackQuality()` - 赛道数据质量评分
- `resampleCenterline()` - 中心线重采样
- `smoothCenterline()` - 中心线平滑（Catmull-Rom + 高斯滤波）
- `computeDTWPath()` - DTW 动态时间规整（含 Yaw 惩罚，解决交叉环道）

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
  - AI 智能诊断 (`/api/analysis/:id/ai-diagnosis`)
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
                                                                   - 完赛后数据作为第 N 条轨迹存盘，并生成候选几何；活跃地图和路书保持不变。
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
| POST | `/api/tracks/:id/adopt-candidate` | 采用最新候选地图并更新正式地图与自动路书 |

### 6.4 调校管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tunes` | 获取所有调校 |
| GET | `/api/tunes/:tuneId` | 获取调校详情 |
| POST | `/api/tunes` | 创建调校 |
| PUT | `/api/tunes/:tuneId` | 更新调校 |
| DELETE | `/api/tunes/:tuneId` | 删除调校 |
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
| GET | `/api/analysis/:sessionId/ai-diagnosis` | 读取 AI 智能诊断 |
| POST | `/api/analysis/:sessionId/ai-diagnosis` | 生成 AI 智能诊断 |

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

# 构建前端（后端从 client/dist 托管）
npm run build:client

# 更新代码图谱/知识图谱 (在代码文件发生变动后运行)
npm run build:map
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

---

### 11.5 环路弯道跨数组边界计算与锁定属性保留（2026-07-13 修复/优化）

1. **环路弯道跨边界遍历**：
   - **背景**：在环形赛道（闭合环路）中，弯道起止索引可能会跨越数组首尾（如 `turnStartIdx > turnEndIdx`）。原来的 `for (let i = start; i <= end; i++)` 遍历会导致数组越界或逻辑死锁。
   - **优化**：在 `server/src/services/track/track-turns.js` 的 `calculateTurnAttributes` 中，改用模运算对索引进行遍历（即 `const i = (turnStartIdx + step) % len`），使其在处理跨越边界的环路弯道时能够正常循环计算出弯道半径、Apex 弯心及坡度起伏信息。

2. **合并/重建赛道时保留用户锁定修改**：
   - **背景**：在进行赛道合并（`/api/tracks/merge`）或重新生成中心线时，原来的逻辑在映射旧弯道到新中线时，会把用户修改好的 `direction`、`severity`、`camber`、`crest` 等路书属性覆盖为默认生成的计算值。
   - **优化**：
     - 在 `routes/tracks.js` 的 `/merge` 接口中，将现有的赛道弯道数据（`oldTurns` 等）作为选项传递给 `buildTrackFromTrajectories`。
     - 在 `mapOldTurnsToNewCenterline` 中增加了对 `isLoop` 环路特性的检查（通过 `isLoopCrossing` 判断是否跨数组首尾），并确保新构建的弯道对象保留了用户已锁定的属性值，避免了赛道合并后用户手修路书丢失的问题。

---

### 11.6 调校改装中心体验与一键升级逻辑深度重构（2026-07-17 优化）

1. **AI 改装逻辑彻底解锁与余量释放**：
   - **安全余量精细化**：将 AI 自动改装时的预估安全余量从原来保守的 `Math.max(10, targetPi * 0.02)`（对 S2 998 级别强制留出 20 PI 空余，限制到 978）缩减为固定值 `2` 点 PI。现在 AI 能把 S2 级车升到 `996`，S1 级车升到 `898`，大幅增加了高端配件的推荐几率，拒绝保守升级。
   - **解锁核心限制**：移除了前端对缺少 PI、AI 不推荐（`aiEligible !== true`）的现有改装件的阻断弹窗与强制中断限制，大模型智能诊断时直接静默输出改装方案，移除弹窗打扰。

2. **界面视觉与原厂标记优化**：
   - 彻底移除了“专属”、“通用”、“通用候选”等徽章和配件前的 Emoji 图标，收起时默认对未更改项展示灰色“原厂”徽章。
   - **驱动原厂动态比对**：在 `PartSelector` 中动态获取原厂驱动，并在选择项中将 stock 标识为 `原厂（后驱/四驱/前驱）`。同时过滤掉冗余的重复驱动项，且原厂或匹配原厂驱动的 PI 增量严格设为 `0`。

3. **保存机制及服务稳定性**：
   - **解决组件崩溃**：修正了 `currentVehicleStats` 与 `partsPiDelta` 在 Hook 中的声明顺序，修复了进入调校管理页面时由于变量未初始化导致的 React `ReferenceError` 页面崩溃。
   - **绕过限制保存**：移除了后端对 AI 改装时 `vehicle_specific_unknown`（无法精确知晓底盘参数物理范围）的强制拦截保存校验，对未解锁/已锁定的字段采取“忽略并放行”策略，确保用户生成的 AI 改装能顺利保存进数据库。
   - **脚本开发模式支持**：将 `启动.command` 中的后端 Node 启动命令改为 `npm run dev` 侦听模式，实现了前后端完全一致的实时热更体验。

---

### 11.8 引擎与增压 1:1 专属纯中文格式化与赛车工程诊断工作台重构（2026-08-02）

1. **引擎 (`engine_swap`) 与进气增压 (`aspiration_swap`) 纯中文格式化与 1:1 隔离**：
   - **完全截断清理**：彻底剔除了带伤的来源车辆描述文本（如 `来自 BMW M3`、`来自 Lamborghini` 等），避免用户误以为放入了其他车辆的脏数据。
   - **纯中文物理规格**：格式化统一为 `3.2L 直列六缸发动机 (321马力)`、`6.2L V8发动机 (510马力)`、`5.2L V10发动机 (602马力)`、`赛用 3.0L 涡轮增压直六发动机 (805马力)`。
   - **严格 1:1 白名单**：有置换引擎的车辆（如 `1929 Mercedes-Benz SSK`）精准展示 5 个官方置换白名单；无置换选项的车辆下拉框显示纯中文只读锁止提示 `🔒 仅原厂发动机` 和 `🔒 增压已固定`。

2. **赛车工程诊断工作台 (`Diagnostic Workbench`) 全面重构**：
   - **3 步可视化沉浸工程流**：
     - **Step 1: 目标方案与赛道遥测绑定条**：一键切换被诊断调校方案与绑定的赛道遥测记录。
     - **Step 2: 双核诊断模式 Tab 切换**：包含 `📈 全车遥测深度健康扫描` (全车避震触底、抓地力滑移率、重刹抱死与前后轴胎温差) 与 `🙋 驾驶感受问题定向攻坚` (结合已有调校参数 + 选中遥测 Session 定向攻坚)。
     - **Step 3: 诊断对比矩阵 (Matrix Table)**：对比显示 `参数名称` | `当前值` ➔ `<推荐目标值>` | `变动幅度与物理依据`，并提供一键写入平滑进入编辑的快捷通道。
   - **界面排版规范**：遵守纯中文 UI 规范，修正 React 中 Unicode 箭头渲染与层级排版。

---

### 11.9 调校方案删除二次确认 Modal 修复（2026-08-02）

1. **移除原生 `window.confirm`**：
   - 彻底移除了 `useTuneManager.js` 中依赖原生的 `confirm()` 方法，避免了在 Web/React 焦点事件切换下弹窗出现后一闪而逝的问题。

2. **自定义 React 删除确认 Modal (`tuneToDelete Modal`)**：
   - 在 `TuneManagerPage.jsx` 中添加独立的 `tuneToDelete` State 变量。
   - 删除按钮的 `onClick` 事件增加 `e.preventDefault()` 与 `e.stopPropagation()`。
   - 打造红黑警示风格的 `tuneToDelete` React Modal 居中弹窗，显示被删除方案的名称、适用车型与 PI 等级，需用户明确点击【确认删除】或【取消】，彻底解决闪退问题。

---

### 11.10 弹窗一闪而逝根治与【修改对比明细 Preview 面板】重构（2026-08-02）

1. **全面拔除原生 `alert(...)` 阻断与失焦**：
   - 将诊断、快捷扫描、参数写入时的原生 `alert` 替换为无毒的客户端全局轻量消息 Toast 组件 `setUnlockToast`，解决了弹窗关闭时触发 DOM 失焦引发工作台 Modal 一闪而逝的根源。

2. **新增【拟修正参数明细预览面板 (Preview Fix Data Panel)】**：
   - 响应用户关于“点完不自动关闭 Modal、不强行弹出编辑框”的建议。
   - 点击“⚡ 生成拟修正方案”后，直接在工作台内部展出现有参数 ➔ 拟修改目标值的变动对比矩阵（明确标注原来是多少、现在变成多少及变动幅度与物理理由）。
   - 底部设【放弃本次修改】与【确认写入并直接保存该方案】按钮，确认后静默写入数据库并保留在工作台，掌控感拉满。

---

### 11.11 遥测传感器物理特征归约与 AI 大模型深度对接（2026-08-02）

1. **毫秒级传感器特征提炼 (Telemetry Sensor Feature Extraction)**：
   - 在后端 `server/src/routes/tunes.js` 的 `/:tuneId/ai-diagnosis` 路由中引入 `generateTelemetryTuningRecommendations` 物理解算引擎。
   - 采用等步长均匀流式采样（Uniform Downsampling Filter），将几十万帧 UDP 采样点在 3~5 毫秒内归约为仅 300 字节的精炼物理传感器指标（驱动轮空转打滑率、避震触底帧数占比、刹车抱死率、前后轴轮胎工作温差）。

2. **硬核数据对接 AI 大模型 (Qwen3.7-Plus)**：
   - 大模型不再只接收赛道名称等外围文本，而是直接拿到【打滑率 18%】、【防倾杆载荷触底】、【刹车抱死率 12%】等硬核传感器证据。
   - 输出兼具物理严谨性与大模型智慧的对症调整方案，并通过前端【拟修正对比 Preview 面板】实现一键确认保存。

---

### 11.12 驾驶感受问题多选复选与无遥测模式完美支持（2026-08-02）

1. **多选复选网格 (Multi-Select Problems Grid)**：
   - 彻底打破单选局限。驾驶体验问题网格改用开关式复选框控件，允许玩家自由勾选 1~N 个复合问题（如：`弯中推头` + `出弯甩尾` + `刹车锁死`）。
   - 系统支持自动计算复合问题在物理参数层面的权衡微调叠加。

2. **遥测数据完全可选 (Optional Telemetry Mode)**：
   - 遥测 Session 在诊断中降级为**完全可选项**。
   - 即使玩家完全未关联遥测记录（刚创建的新方案），系统也能直接放行，由后端提取车辆已有改装物理参数与多选问题，送入 AI 大模型和物理计算引擎进行无障碍精准攻坚。

---

### 11.13 后端 formatZodError 安全校验防空修复（2026-08-02）

1. **`formatZodError` 安全判空防护**：
   - 修复了当服务器接收到非标准 ZodError 对象或普通 Error 时调用 `error.errors.map` 产生 `Cannot read properties of undefined (reading 'map')` 崩溃的问题。
   - 增加 `const issues = error?.issues || error?.errors` 数组判定，保障校验提示安全优雅返回。

---

### 11.7 改装中心四项 Bug 修复（2026-07-17）

#### Bug 1：配件 PI 变化未完整显示

- **原因 A**：`PartSelector` 中非原厂但 `piEstimate === 0` 的选项（如空气动力学固定件/可调件），因条件 `Number(rawPi) !== 0` 导致既不显示 PI pill 也不显示"PI 待确认"，用户看不到任何反馈。
- **原因 B**：`drivetrain_swap` 的客户端特殊处理中，错误读取 `opt.piBonus`（服务端不存在该字段，实际是 `opt.piEstimate`），导致驱动变速配件的 PI 全部丢失，显示"PI 待确认"。
- **修复**：
  - `piEstimate === 0` 的非原厂选项，统一显示 `±0 PI` 灰色标记。
  - `drivetrain_swap` 客户端逻辑改为读取 `opt.piEstimate`。
  - 新增 `sizeDisplay: true` 标记（服务端槽位标记）：对轮胎宽度、轮毂尺寸、轮距等尺寸型配件，在选项右侧显示紫色"尺寸"标记 + PI 变化，区分尺寸调整与性能提升。

#### Bug 2：车辆原厂驱动取错来源

- **原因**：`PartSelector` 的 `defaultDrivetrain` 和 AI 模式驱动下拉框，使用 `currentVehicleStats?.drivetrain`（来自遥测动态数据 `stateManager.vehicles`），该字段反映当前改装状态，不是原厂出厂驱动。
- **修复**：完全改为仅使用 `upgradeShop?.baseDriveType`（来自 `upgrades-metadata.json` 静态库），彻底移除遥测数据 fallback。原厂驱动以静态库为准。

#### Bug 3：自主改装模式仍自动填写调教参数

- **原因**：`chooseBuildMode('manual')` 后，`refreshUpgradeShop` 异步完成时通过 `setFormData(parts)` 更新配件，触发自动填参 `useEffect`。该 effect 读取 React 状态 `buildMode`，存在异步闭包竞争窗口，极端情况下可能在 `manual` 模式下误触发 AI 填参逻辑。
- **修复**：引入 `buildModeRef`（`useRef`），所有 `setBuildMode(mode)` 改为 `_setBuildMode(mode)` 同步写入 ref。自动填参 effect 改为读 `buildModeRef.current` 而非 React 状态，确保切换模式时立即生效，不受异步批处理影响。

#### Bug 4：调教参数单位不一致

| 参数 | 原单位 | 正确单位 | 修改位置 |
|------|--------|----------|----------|
| 胎压 | PSI (范围 15~55) | **bar** (范围 1.0~3.8) | 前端 `TUNE_FIELDS_SCHEMA` + 服务端 `buildTuneParameters` |
| 弹簧硬度 | 无单位 (1~100) | **kgf/mm** (0.1~200) | 前端 `TUNE_FIELDS_SCHEMA` |
| 下压力 | kg (0~500) | **kgf** (0~1000) | 前端 `TUNE_FIELDS_SCHEMA` |
| AI 胎压默认值 | 28 (PSI) | **1.9** (bar) | `useTuneManager.js` recommended 对象 |

> [!NOTE]
> 车身高度 `cm` 单位原本已正确，本次无需修改。

---

### 11.8 赛道即时保存与调教工坊硬件清单解算深度修复（2026-07-26 优化/修复）

1. **赛道保存与合并即时列表更新优化**：
   - **服务端即时响应**：将 `POST /api/tracks/merge` 改造为 20ms 内优先写入 `stateManager.tracks` 内存数据库与存盘，并触发 Socket.io 的 `trackUpdated` 和 `trackDeleted` 广播；耗时的 RDP 简化、高精中心线提取与弯道路书构建全量移至后台 `setImmediate` 异步线程处理。
   - **前端即时交互**：`TrackManagerPage` 接入 Socket 实时监听，合并指令发出后赛道瞬间在列表中上架并选中，用户无需等待地图渲染，可第一时间直接修改赛道名称。

2. **调教工坊硬件清单与参数推荐解算重构**：
   - **后端协议归一化兼容**：在 `resolveTuningCapabilities` 中引入了兼容映射层，统一将前端发来的 `springs`, `antiRollBars`, `aero`, `transmission` 等结构映射为后端的精准可调标识。
   - **解除路由屏蔽门禁**：修正了 `GET /api/vehicles/:id/upgrades` 中 `!hasPartsSelections` 的硬性约束，实现了配件解算与清单解算的并集合并。
   - **重构 `buildTuneParameters` 动态解算**：增加 `isAdjustable` 检测，不论通过选装配件还是清单能力声明，均能正确解算出全套 33 个核心参数与 `gear_1`~`gear_10` 档位。
   - **修补前端齿轮比推荐值属性名**：在 `getInitialParameterRecommendations` 中修复了档位推荐键名缺少 `gear1`（无下划线）绑定的 Bug，确保齿轮比推荐值完美填入 UI 表单。

---

### 11.9 AI 遥测诊断全屏剧场、LTTB 降采样性能优化与倒转不中断录制架构（2026-08-01 优化）

1. **LTTB 降采样算法**：在 `server/src/utils/lttb.js` 中实现了最大三角形三桶降采样算法，对长达数万帧的遥测数据流进行特征保留的快速降采样，显著降低了全屏诊断与历史数据对比时的前端图表渲染开销。
2. **游戏倒转防断流架构**：在录制状态机中加入倒转容错与回溯缓冲机制，自动识别游戏内的倒转行为，保持录制连贯，防止比赛记录被意外切断或丢帧。
3. **AI 遥测诊断全屏剧场**：重构 `SessionHistoryPage.jsx`，提供全屏剧场沉浸式大屏诊断与可视化遥测分析视图。

---

### 11.10 调教工坊配件升级库与物理推荐算法深度修复（2026-08-02 修复/重构）

1. **服务端变量缺失修复**：修复 `vehicles.js` 与 `upgrade-catalog.js` 中因引用未定义变量导致的崩溃问题，提升配件查询稳定性。
2. **通用与特定车型配件解算重构**：重构 `upgrade-catalog.js`，完善车辆专属配件（引擎置换、宽体套件、空力组件）与通用改装件在算法层的合并逻辑，并补充单元测试套件 `server/test/upgrade-catalog.test.js`。
3. **调教推荐物理算法精准化**：更新 `telemetry-tuning-recommendations.js`，结合轮速差、悬挂行程、重力加速度与滑移率计算，为防倾杆、弹簧及阻尼提供更贴合真实赛道特性的物理调教推荐。
4. **前端调教表单与原厂重置逻辑修正**：在 `TuneManagerPage.jsx`、`useTuneManager.js` 与 `parts.js` 中，修正配件分类、精度舍入与原厂参数重置时的同步逻辑。

---

