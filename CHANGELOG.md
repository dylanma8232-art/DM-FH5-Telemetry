
## 2026-10-30 v2.1.0 赛道绘制、动态路书播报与赛道编辑专项升级里程碑

- **版本**：v2.1.0（赛道三位一体专项：绘制、路书播报、编辑交互全闭环）
- **Release 链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/releases/tag/v2.1.0
- **核心原则**：底层测绘与曲率算法逻辑 100% 只读保真；功能全面打通。
- **三大模块重大突破**：
  1. **赛道绘制（Canvas 渲染管线）**：
     - 主画布与预览画布全量引入 `Path2D` 预编译缓存；
     - 拖拽平移与滚轮缩放直接使用 Canvas 2D Transform 矩阵，完全摆脱每帧遍历万级坐标点的重绘开销；
     - 交互帧率提升至满帧 60fps，重绘开销从 18ms 降至 0.5ms 以内。
  2. **动态路书播报（拉力级实时语音领航）**：
     - **车速自适应提前量**：根据当前实时毫秒级车速（速度 $\times$ 前瞻时间 3.5s）动态计算前瞻距离，高速早报、低速紧随，消灭进弯滞后漏播；
     - **复合弯连续成句**：连续转向区间（如“左四连右二”）智能合并短语连贯播报，杜绝单词机械切割停顿；
     - **防吞字与双缓冲队列**：实现严格的优先级抢占与单例静音调度，高优先级警报即时插播。
  3. **赛道编辑与大文件解耦**：
     - 单体 2400+ 行 `TrackManagerPage` 与 `SessionHistoryPage` 深度治理；
     - 成功解耦抽出 `TurnEditorTable`（弯道精修列表）、`TrackMergeModal`（赛道合并弹窗）、`TrackCandidateBanner`（新轨迹候选卡片）、`AiDiagnosisModal`（全屏 AI 问诊）与 `TuneCompareSection`（调校对比面板）；
     - 弯心 Apex 点手工微调、起止点参数、单弯速度提示编辑与赛道拼接交互端到端全部打通闭环。
- **质量门禁**：
  - 后端单测 79/79 pass（100%）
  - 前端单测 15/15 pass（新增领航员语音队列状态机测试 6 例）
  - 客户端 Vite 构建 1.36s，Knip 死代码扫描 0 残留

## 2026-10-29 v2.0.0 全系统深度优化与全链路打通里程碑

- **版本**：v2.0.0（深度重构、性能打磨与 14 处功能断链全通）
- **Release 链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/releases/tag/v2.0.0
- **基线 Commit**：a9ba764
- **核心原则**：业务逻辑与计算链路 100% 保持幂等；赛道管理核心算法零逻辑改动。
- **性能战果**：
  - 首屏 JS 体积：636.3KB → 234.0KB（**-63%**，recharts 彻底解耦按需加载）
  - 会话详情载荷：26.5MB → 1.4MB（**-94.7%**，紧凑点流 1MB → 8KB **-99.2%**）
  - 会话冷加载延迟：48.8ms → 16.5ms（门槛 <25ms 达成）
  - 遥测广播节流：消灭 30Hz 广播风暴，recordStats 节流比 1:30
  - 净精简冗余代码：净剔除 2,000+ 行死代码与冗余实现
- **14 处断链与半成品全面贯通**：
  - B01：单场比赛导出闭环（支持 CSV / 增强 CSV / HTML 分析报告 / 打印 PDF 报告）
  - B02：批量导出 400ms 步进防浏览器弹窗拦截
  - B03：大模型 AI 改装求解器端到端贯通（前端接入 + PI 兜底安全校验）
  - B04：在途调校草稿参数穿透至 AI 问诊
  - B05：调校跨车型数字/字符串兼容比对
  - B06：调校分享码协议版本号与车型 ID 隔离
  - B07：车辆删除级联安全，方案降级为「历史归档」不白屏
  - B08：车库↔调校工坊跨页带参回跳与高亮定位
  - B09：智能诊断工坊 Tab（AI 赛车教练、感受调校）全面挂载上线
  - B10：未知赛道支持单场/批量「关联赛道」并自动刷新排行榜
  - B11：赛道模式启停 WebSocket 实时广播同步
  - B12：赛道删除实时广播同步
  - B13：赛道缩略图 JSON 路由补齐，彻底消灭控制台 404 刷屏
  - B14：telemetry-channels 通道投影与 downsampleStep 降采样全联动
- **架构治理与质量提升**：
  - 存储下沉（A5）：统一赛道读写管道 `track-store.js`
  - 路由统一（A2）：单职责挂载，收敛 25 处端点
  - API 层合并（A4）：双套方法族收敛为单一 `request()`，统一异常与返回值
  - 门禁全绿：server 79/79 pass，client 9/9 pass，构建 100% 成功，死代码 0 残留

## 2026-10-29 02:19 迭代

- **PR**：1 ci: add weekly auto-optimization job for TODOs and performance
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/1
- **改动文件**：
- .github/scripts/auto_optimize.py
- .github/workflows/auto-scan-todo-perf.yml

## 2026-10-29 05:27 迭代

- **PR**：2 🧹 Remove console.error in Header status check
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/2
- **改动文件**：
- forza-telemetry/client/src/components/Header.jsx

## 2026-10-29 05:28 迭代

- **PR**：4 🧪 test: add comprehensive unit tests for simplifyRDP algorithm
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/4
- **改动文件**：
- forza-telemetry/server/test/rdp.test.js

## 2026-10-29 05:29 迭代

- **PR**：5 🧹 [code health improvement] Remove debug log in production
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/5
- **改动文件**：
- forza-telemetry/server/src/routes/record.js

## 2026-10-29 05:31 迭代

- **PR**：6 🔒 fix: prevent API key exposure in GET response
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/6
- **改动文件**：
- forza-telemetry/client/package-lock.json
- forza-telemetry/server/src/routes/system.js

## 2026-10-29 05:32 迭代

- **PR**：7 ⚡ Optimize leaderboard generation by making file I/O asynchronous
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/7
- **改动文件**：
- forza-telemetry/client/package-lock.json
- forza-telemetry/server/src/routes/leaderboard.js
- test-benchmark.js
- test-event-loop.js

## 2026-10-29 05:34 迭代

- **PR**：8 ⚡ Perf: Optimize N+1 Query Pattern with Statement Preparation in sqliteDb.migrateAllOldSessions
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/8
- **改动文件**：
- forza-telemetry/server/src/storage/sqlite-db.js

## 2026-10-29 05:35 迭代

- **PR**：9 🧹 [Code Health] Extract API Key placeholder string to shared constant
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/9
- **改动文件**：
- forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx
- forza-telemetry/client/src/components/settings/SettingsPanel.jsx
- forza-telemetry/client/src/utils/constants.js

## 2026-10-29 05:35 迭代

- **PR**：10 ⚡ perf: refactor track session sync to use asynchronous I/O
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/10
- **改动文件**：
- forza-telemetry/client/package-lock.json
- forza-telemetry/server/package-lock.json
- forza-telemetry/server/package.json
- forza-telemetry/server/src/routes/tracks.js

## 2026-10-29 05:36 迭代

- **PR**：12 ⚡ perf: Replace sync file reading with non-blocking I/O in batch track update
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/12
- **改动文件**：
- forza-telemetry/server/src/routes/sessions.js

## 2026-10-30 03:53 迭代

- **PR**：25 fix(ci): secure auto-merge-jules workflow against fork PR spoofing
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/25
- **改动文件**：
- .github/workflows/auto-merge-jules.yml
- forza-telemetry/server/test/auto-merge-workflow.test.js

## 2026-10-30 06:58 迭代

- **PR**：26 Fix z.record schema declarations in saveTuneSchema
- **链接**：https://github.com/dylanma8232-art/DM-FH5-Telemetry/pull/26
- **改动文件**：
- forza-telemetry/server/src/utils/schemas.js
- forza-telemetry/server/test/schemas.test.js
