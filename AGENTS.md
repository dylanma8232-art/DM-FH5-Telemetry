# AI Agent 协作指南

## CodeGraph 知识图谱

本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) 进行智能索引和知识图谱管理。

### 快速开始

1. **安装 CodeGraph CLI**（如果尚未安装）：
   ```bash
   npm install -g @colbymchenry/codegraph
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
