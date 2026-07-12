# FH5 遥测分析系统 - 代码知识图谱

该文件为项目的代码知识图谱导航页，供 AI 阅读本仓库代码时快速了解项目结构，减少上下文 Token 占用，避免盲目搜寻。

> [!NOTE]
> 本项目已使用 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) 对代码进行了智能图谱初始化。
> 您可以在本地执行 `codegraph init` 开启实时语法关联索引，与 Agent 结对编程。

---

## 📂 项目模块结构树与导出分析

- 📄 [CLAUDE.md](file:///forza-telemetry/CLAUDE.md) 
- 📄 [README.md](file:///forza-telemetry/README.md) 
- 📂 **client/**
  - 📄 [index.html](file:///forza-telemetry/client/index.html) 
  - 📄 [package-lock.json](file:///forza-telemetry/client/package-lock.json) 
  - 📄 [package.json](file:///forza-telemetry/client/package.json) 
  - 📂 **public/**
    - 📄 [manifest.json](file:///forza-telemetry/client/public/manifest.json) 
  - 📂 **src/**
    - 📄 [App.jsx](file:///forza-telemetry/client/src/App.jsx)   *(默认导出: `App`)*
    - 📂 **components/**
      - 📄 [Header.jsx](file:///forza-telemetry/client/src/components/Header.jsx)   *(函数/组件: `Header`)*
      - 📂 **dashboard/**
        - 📄 [AICoachPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/AICoachPanel.jsx)   *(函数/组件: `AICoachPanel`)*
        - 📄 [AlertAdvicePanel.jsx](file:///forza-telemetry/client/src/components/dashboard/AlertAdvicePanel.jsx)   *(函数/组件: `AlertAdvicePanel`)*
        - 📄 [BrakingGripDynamicsPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/BrakingGripDynamicsPanel.jsx)   *(函数/组件: `BrakingGripDynamicsPanel`)*
        - 📄 [DifferentialAnalysisPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/DifferentialAnalysisPanel.jsx)   *(函数/组件: `DifferentialAnalysisPanel`)*
        - 📄 [GearingAnalysisPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/GearingAnalysisPanel.jsx)   *(函数/组件: `GearingAnalysisPanel`)*
        - 📄 [PaceNoteExport.jsx](file:///forza-telemetry/client/src/components/dashboard/PaceNoteExport.jsx)   *(函数/组件: `PaceNoteExport`)*
        - 📄 [PaceNotesPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/PaceNotesPanel.jsx)   *(函数/组件: `PaceNotesPanel`, 函数/组件: `PaceNoteGlossaryModal`)*
        - 📄 [RacePerformanceTimingPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/RacePerformanceTimingPanel.jsx)   *(函数/组件: `RacePerformanceTimingPanel`)*
        - 📄 [ReplayPlayer.jsx](file:///forza-telemetry/client/src/components/dashboard/ReplayPlayer.jsx)   *(函数/组件: `ReplayPlayer`)*
        - 📄 [SuspensionAnalysisPanel.jsx](file:///forza-telemetry/client/src/components/dashboard/SuspensionAnalysisPanel.jsx)   *(函数/组件: `SuspensionAnalysisPanel`)*
      - 📂 **pages/**
        - 📄 [DashboardPage.jsx](file:///forza-telemetry/client/src/components/pages/DashboardPage.jsx)   *(函数/组件: `DashboardPage`)*
        - 📄 [SessionHistoryPage.jsx](file:///forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx)   *(函数/组件: `SessionHistoryPage`)*
        - 📄 [TrackManagerPage.jsx](file:///forza-telemetry/client/src/components/pages/TrackManagerPage.jsx)   *(函数/组件: `TrackManagerPage`)*
        - 📄 [TuneManagerPage.jsx](file:///forza-telemetry/client/src/components/pages/TuneManagerPage.jsx)   *(函数/组件: `TuneManagerPage`)*
        - 📄 [VehicleManagerPage.jsx](file:///forza-telemetry/client/src/components/pages/VehicleManagerPage.jsx)   *(函数/组件: `VehicleManagerPage`)*
      - 📂 **settings/**
        - 📄 [SettingsPanel.jsx](file:///forza-telemetry/client/src/components/settings/SettingsPanel.jsx)   *(函数/组件: `SettingsPanel`)*
      - 📂 **shared/**
        - 📄 [EmptyState.jsx](file:///forza-telemetry/client/src/components/shared/EmptyState.jsx)   *(函数/组件: `EmptyState`)*
        - 📄 [ErrorBoundary.jsx](file:///forza-telemetry/client/src/components/shared/ErrorBoundary.jsx) 
        - 📄 [LoadingSpinner.jsx](file:///forza-telemetry/client/src/components/shared/LoadingSpinner.jsx)   *(函数/组件: `LoadingSpinner`)*
        - 📄 [Toast.jsx](file:///forza-telemetry/client/src/components/shared/Toast.jsx)   *(函数/组件: `toast`, 函数/组件: `ToastContainer`)*
    - 📂 **contexts/**
      - 📄 [SettingsContext.jsx](file:///forza-telemetry/client/src/contexts/SettingsContext.jsx)   *(函数/组件: `SettingsProvider`, 函数/组件: `useSettings`)*
      - 📄 [ThemeContext.jsx](file:///forza-telemetry/client/src/contexts/ThemeContext.jsx)   *(函数/组件: `ThemeProvider`)*
    - 📂 **hooks/**
      - 📄 [useDashboardData.js](file:///forza-telemetry/client/src/hooks/useDashboardData.js)   *(函数/组件: `useDashboardData`)*
      - 📄 [useKeyboard.js](file:///forza-telemetry/client/src/hooks/useKeyboard.js)   *(函数/组件: `useKeyboard`)*
      - 📄 [useSessionHistory.js](file:///forza-telemetry/client/src/hooks/useSessionHistory.js)   *(函数/组件: `useSessionHistory`)*
      - 📄 [useSocket.js](file:///forza-telemetry/client/src/hooks/useSocket.js)   *(函数/组件: `useSocket`)*
      - 📄 [useTuneManager.js](file:///forza-telemetry/client/src/hooks/useTuneManager.js)   *(函数/组件: `useTuneManager`)*
    - 📄 [main.jsx](file:///forza-telemetry/client/src/main.jsx) 
    - 📄 [themes.js](file:///forza-telemetry/client/src/themes.js)   *(函数/组件: `getThemeCSSVariables`, 常量/方法: `themes`, 常量/方法: `defaultSettings`)*
    - 📂 **utils/**
      - 📄 [speechQueue.js](file:///forza-telemetry/client/src/utils/speechQueue.js)   *(常量/方法: `speechManager`)*
  - 📄 [vite.config.js](file:///forza-telemetry/client/vite.config.js)   *(默认导出: `defineConfig`)*
- 📂 **docs/**
  - 📄 [dashboard-round1.md](file:///forza-telemetry/docs/dashboard-round1.md) 
  - 📄 [dashboard-round2.md](file:///forza-telemetry/docs/dashboard-round2.md) 
  - 📄 [dashboard-round3-5.md](file:///forza-telemetry/docs/dashboard-round3-5.md) 
  - 📄 [dashboard-round6-10.md](file:///forza-telemetry/docs/dashboard-round6-10.md) 
  - 📄 [session-center-round1.md](file:///forza-telemetry/docs/session-center-round1.md) 
  - 📄 [session-center-round2-5.md](file:///forza-telemetry/docs/session-center-round2-5.md) 
  - 📄 [session-center-round6-10.md](file:///forza-telemetry/docs/session-center-round6-10.md) 
  - 📄 [session-deep-round1-5.md](file:///forza-telemetry/docs/session-deep-round1-5.md) 
  - 📄 [session-deep-round6-10.md](file:///forza-telemetry/docs/session-deep-round6-10.md) 
  - 📄 [track-deep-round1-5.md](file:///forza-telemetry/docs/track-deep-round1-5.md) 
  - 📄 [track-deep-round6-10.md](file:///forza-telemetry/docs/track-deep-round6-10.md) 
  - 📄 [track-round1.md](file:///forza-telemetry/docs/track-round1.md) 
  - 📄 [track-round2-5.md](file:///forza-telemetry/docs/track-round2-5.md) 
  - 📄 [track-round6-10.md](file:///forza-telemetry/docs/track-round6-10.md) 
  - 📄 [workshop-deep-round1-5.md](file:///forza-telemetry/docs/workshop-deep-round1-5.md) 
  - 📄 [workshop-deep-round6-10.md](file:///forza-telemetry/docs/workshop-deep-round6-10.md) 
  - 📄 [workshop-round1.md](file:///forza-telemetry/docs/workshop-round1.md) 
  - 📄 [workshop-round2-5.md](file:///forza-telemetry/docs/workshop-round2-5.md) 
  - 📄 [workshop-round6-10.md](file:///forza-telemetry/docs/workshop-round6-10.md) 
- 📄 [monitor.sh](file:///forza-telemetry/monitor.sh) 
- 📂 **out/**
  - 📄 [DashboardPage.js](file:///forza-telemetry/out/DashboardPage.js) 
  - 📄 [SessionHistoryPage.js](file:///forza-telemetry/out/SessionHistoryPage.js) 
  - 📄 [useSessionHistory.js](file:///forza-telemetry/out/useSessionHistory.js) 
- 📄 [package.json](file:///forza-telemetry/package.json) 
- 📂 **scripts/**
  - 📄 [clean_history.js](file:///forza-telemetry/scripts/clean_history.js) 
  - 📄 [clean_sessions.js](file:///forza-telemetry/scripts/clean_sessions.js) 
  - 📄 [generate_codemap.py](file:///forza-telemetry/scripts/generate_codemap.py) 
  - 📄 [start-server.sh](file:///forza-telemetry/scripts/start-server.sh) 
- 📂 **server/**
  - 📄 [package-lock.json](file:///forza-telemetry/server/package-lock.json) 
  - 📄 [package.json](file:///forza-telemetry/server/package.json) 
  - 📂 **src/**
    - 📂 **config/**
      - 📄 [constants.js](file:///forza-telemetry/server/src/config/constants.js)   *(常量/方法: `DATA_DIR`)*
    - 📄 [index.js](file:///forza-telemetry/server/src/index.js) 
    - 📂 **routes/**
      - 📄 [analysis.js](file:///forza-telemetry/server/src/routes/analysis.js)   *(默认导出: `router`)*
      - 📄 [leaderboard.js](file:///forza-telemetry/server/src/routes/leaderboard.js)   *(默认导出: `router`)*
      - 📄 [navigation.js](file:///forza-telemetry/server/src/routes/navigation.js)   *(默认导出: `router`)*
      - 📄 [record.js](file:///forza-telemetry/server/src/routes/record.js)   *(默认导出: `默认导出`)*
      - 📄 [sessions.js](file:///forza-telemetry/server/src/routes/sessions.js)   *(默认导出: `router`)*
      - 📄 [system.js](file:///forza-telemetry/server/src/routes/system.js)   *(默认导出: `router`)*
      - 📄 [tracks.js](file:///forza-telemetry/server/src/routes/tracks.js)   *(默认导出: `router`)*
      - 📄 [tunes.js](file:///forza-telemetry/server/src/routes/tunes.js)   *(默认导出: `router`)*
      - 📄 [vehicles.js](file:///forza-telemetry/server/src/routes/vehicles.js)   *(默认导出: `router`)*
    - 📂 **services/**
      - 📂 **physics/**
        - 📄 [advice-generator.js](file:///forza-telemetry/server/src/services/physics/advice-generator.js)   *(函数/组件: `generateDrivingAdvice`, 函数/组件: `generateTuneDiagnosis`)*
        - 📄 [physics-math.js](file:///forza-telemetry/server/src/services/physics/physics-math.js)   *(函数/组件: `findClosestPoint`)*
        - 📄 [scoring.js](file:///forza-telemetry/server/src/services/physics/scoring.js)   *(函数/组件: `calculateDrivingLineAnalysis`, 函数/组件: `calculateDrivingScore`, 函数/组件: `getBestLapNum`)*
        - 📄 [telemetry-stats.js](file:///forza-telemetry/server/src/services/physics/telemetry-stats.js)   *(函数/组件: `calculateDrivingStyle`, 函数/组件: `calculateDetailedStats`, 函数/组件: `calculateGearingAnalysis`, 函数/组件: `calculateSuspensionAnalysis`, 函数/组件: `calculateDifferentialAnalysis`, 函数/组件: `calculateSectorAnalysis`, 函数/组件: `analyzeSectors`)*
      - 📄 [physics-analyzer.js](file:///forza-telemetry/server/src/services/physics-analyzer.js) 
      - 📄 [retention.js](file:///forza-telemetry/server/src/services/retention.js)   *(函数/组件: `runSessionRetentionCleanup`)*
      - 📄 [state-manager.js](file:///forza-telemetry/server/src/services/state-manager.js)   *(常量/方法: `stateManager`)*
      - 📂 **track/**
        - 📄 [builder-facade.js](file:///forza-telemetry/server/src/services/track/builder-facade.js)   *(函数/组件: `buildTrackFromTrajectories`, 函数/组件: `generateSectors`, 函数/组件: `validateTrackQuality`, 函数/组件: `buildRouteBook`)*
        - 📄 [centerline-processor.js](file:///forza-telemetry/server/src/services/track/centerline-processor.js)   *(函数/组件: `resampleCenterline`, 函数/组件: `smoothCenterline`)*
        - 📄 [track-math.js](file:///forza-telemetry/server/src/services/track/track-math.js)   *(函数/组件: `simplifyRDP`)*
        - 📄 [track-turns.js](file:///forza-telemetry/server/src/services/track/track-turns.js)   *(函数/组件: `detectTurnsEnhanced`, 函数/组件: `calculateTurnAttributes`, 函数/组件: `mapOldTurnsToNewCenterline`, 函数/组件: `remapLockedTurns`)*
        - 📄 [trajectory-cleaner.js](file:///forza-telemetry/server/src/services/track/trajectory-cleaner.js)   *(函数/组件: `correctTrajectoryDrivingLine`)*
    - 📂 **storage/**
      - 📄 [atomic-writer.js](file:///forza-telemetry/server/src/storage/atomic-writer.js)   *(常量/方法: `atomicWriter`)*
      - 📄 [file-db.js](file:///forza-telemetry/server/src/storage/file-db.js)   *(函数/组件: `readJsonAsync`, 函数/组件: `writeJsonAsync`, 函数/组件: `writeBrotliAsync`)*
      - 📄 [migration.js](file:///forza-telemetry/server/src/storage/migration.js)   *(函数/组件: `migrateMonolithicDatabase`)*
      - 📄 [save-worker.js](file:///forza-telemetry/server/src/storage/save-worker.js) 
      - 📄 [session-db.js](file:///forza-telemetry/server/src/storage/session-db.js)   *(函数/组件: `loadTracksDatabase`, 函数/组件: `saveTracksDatabase`, 函数/组件: `readTrackDetail`, 函数/组件: `writeTrackDetail`, 函数/组件: `deleteTrackDetail`, 函数/组件: `loadSession`, 函数/组件: `migrateOldSessions`)*
    - 📄 [telemetry-parser.js](file:///forza-telemetry/server/src/telemetry-parser.js)   *(函数/组件: `parseTelemetryPacket`)*
    - 📄 [track-builder.js](file:///forza-telemetry/server/src/track-builder.js) 
    - 📂 **utils/**
      - 📄 [asyncHandler.js](file:///forza-telemetry/server/src/utils/asyncHandler.js)   *(常量/方法: `asyncHandler`)*
      - 📄 [helpers.js](file:///forza-telemetry/server/src/utils/helpers.js)   *(函数/组件: `getLocalIPs`, 函数/组件: `loadJSON`, 函数/组件: `saveJSON`)*
      - 📄 [rdp.js](file:///forza-telemetry/server/src/utils/rdp.js)   *(函数/组件: `simplifyRDP`)*

---

## ⚡ 核心组件功能概述

### 1. 网页客户端 (`forza-telemetry/client`)
* **`client/src/App.jsx`**: 网页入口，管理核心 Tab 路由（仪表盘、赛道、车辆、调校）并建立后台 WebSocket 数据监听。
* **`client/src/components/Header.jsx`**: 页眉控制器，展示双指示灯（Node 服务连接 & 游戏 UDP 遥测数据流），控制实时遥测录制及保存。
* **`client/src/components/pages/DashboardPage.jsx`**: 三栏式专业遥测大屏布局容器，组合展示下列核心卡片。
* **`client/src/components/dashboard/PaceNotesPanel.jsx`**: 拉力赛路书（Pace Notes）渲染器，支持弯道角度、推荐时速、刹车点提示以及即将到来的双弯叠加预告，内嵌语音播报模块。
* **`client/src/components/dashboard/AlertAdvicePanel.jsx`**: 警报与驾驶反馈中心。基于物理滑移率、悬挂行程及车速等参数，动态计算临界阈值以过滤误报。具备防误触降档（一档 TTS 预警）功能。
* **`client/src/components/dashboard/BrakingGripDynamicsPanel.jsx`**: 底盘监测面板。统一显示四个轮胎的详细滑移、胎温、行程、四轮差速以及 G 轴重力计。
* **`client/src/components/dashboard/RacePerformanceTimingPanel.jsx`**: 比赛时间与分段计时器（S1/S2/S3），支持计算实时 Delta（相较最快圈）以及展示最近 10 圈的历史纪录。

### 2. 后端服务端 (`forza-telemetry/server`)
* **`server/src/index.js`**: 主要的 API 服务端，启动 9188 端口 of Express/WebSocket 监听，接收 UDP 数据包，并管理赛道和录制文件的存取。
* **`server/src/telemetry-parser.js`**: Forza UDP 字节流解析器，根据官方结构体提取车速、引擎转速、胎温、轮速、重力、比赛状态（isRaceOn）等数据。
* **`server/src/speech-worker.js`**: 语音合成与下发接口。
* **`server/src/track-manager.js`**: 赛道曲线几何分析器，提取车辆行驶轨迹，通过曲线聚合重算赛道中线及检测弯道。

---

## 🛠️ 如何快速掌握此项目

如果您是第一次读取此项目的 AI Agent：
1. **主入口分析**：先看 [App.jsx](file:///forza-telemetry/client/src/App.jsx) 与 [index.js](file:///forza-telemetry/server/src/index.js)。
2. **遥测数据解析**：查看 [telemetry-parser.js](file:///forza-telemetry/server/src/telemetry-parser.js) 掌握遥测字节结构。
3. **数据关联**：使用 `codegraph_explore` 查看特定函数的上下文调用，尽量避免直接全量拉取组件文件。
