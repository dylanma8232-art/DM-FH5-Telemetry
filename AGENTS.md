# AI Agent 协作指南

> [!IMPORTANT]
> ### 🛑 唯一开发与运行环境绝对军规 (Iron Rules - DO NOT DEVIATE)
> 1. **唯一服务端口**：本项目的唯一运行与调试网页永远是且仅是 **`http://localhost:9188`**。
> 2. **禁止启用测试端口**：任何时候进场，**严禁**搭建或使用 Vite dev server 的临时开发测试端口（如 `9187` 或 `5173` 等）。
> 3. **强制自动构建同步（Vite Build Sync）**：由于后端服务直接从 `client/dist` 托管静态页面，任何时候修改了 `client/src/` 下的前端代码，**必须无条件立刻进入 `forza-telemetry/client` 目录执行 `npm run build` 进行编译同步**！所有页面效果验证与自动化测试必须基于 `9188` 进行。

## CodeGraph 知识图谱

本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) 进行智能索引和知识图谱管理。

### 快速开始

1. **安装 CodeGraph CLI**（建议安装 v1.5.0+ 版本以获得 Rust 原生内核解析与毫秒级增量同步加速）：
   ```bash
   npm install -g @colbymchenry/codegraph@latest
   ```

2. **初始化项目索引**：
   ```bash
   codegraph init
   ```

3. **查询代码**：
   - 使用 MCP 工具：`codegraph_explore`
   - 使用命令行：`codegraph explore "<symbol names or question>"`

### 使用场景

- **理解代码结构**：查询函数、类、组件的定义和调用关系
- **查找相关代码**：搜索特定功能或变量的使用位置
- **分析调用链**：追踪函数调用路径和依赖关系
- **影响分析**：修改代码前评估影响范围

### 注意事项

- 索引文件（`.codegraph/`）不会提交到 Git，需要本地初始化
- 索引会自动同步代码变更
- 详细文档请参考 [CodeGraph GitHub](https://github.com/colbymchenry/codegraph)

---

## 项目文档

- **[CLAUDE.md](forza-telemetry/CLAUDE.md)**：详细的项目知识图谱和架构说明
- **[CODEMAP.md](CODEMAP.md)**：代码模块结构树和导出分析
- **[README.md](forza-telemetry/README.md)**：项目概述和使用说明

---

## 界面语言与排版规范

- **界面 UI 文字必须使用纯中文，严禁在中文词汇后附加括号英文备注**（如禁止出现 `路面倾角 (Camber)`、`语速 (Speech Rate)` 等格式，应当直接写为 `路面倾角`、`语速`）。
- 仅保留全行业或技术领域内公认且无合适中文翻译的缩写（如 WRC、PI、ABS、FWD、AWD 等）。
- 任何后续 Agent 编写前端界面时必须严格遵守此规范，避免中英夹杂的杂乱视觉。

---

## 前端构建与部署规范

- **客户端（Client）编译**：由于本项目的静态资源由后端（Express）从 `client/dist` 目录托管，因此在任何修改了 `client/src/` 目录下前端代码（如 React 组件、样式、Hooks）后，**必须进入 `forza-telemetry/client` 目录执行 `npm run build` 命令**。
- 如果不执行此命令，前端的修改将不会在实际的浏览器页面和后端路由中生效！

## 长期架构规范

所有后续开发必须遵循 [架构与开发规范](forza-telemetry/docs/ARCHITECTURE_BOUNDARIES.md)，尤其是 API 唯一入口、共享状态唯一来源、文件规模和验证门禁。新增功能不得以绕过这些边界的方式实现。
