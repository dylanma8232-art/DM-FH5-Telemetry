# Forza Horizon 5 遥测分析系统

实时接收和分析《极限竞速：地平线 5》的 UDP 遥测数据，提供实时仪表盘、赛道管理、比赛回放、车辆与调校管理，以及驾驶和调校诊断。

## 核心功能

- **实时遥测**：UDP 数据接收（324字节/包，30fps），WebSocket 实时推送
- **专业仪表盘**：50+ 组件，速度/转速/轮胎温度/悬挂/G力/油门刹车等
- **赛道管理**：自动识别、中心线提取、弯道检测、路书生成、环道检测
- **比赛中心**：记录与回放、分段计时、圈速对比、排行榜
- **车辆管理**：自动检测、车辆数据库、最佳圈速追踪
- **调校管理**：创建、编辑、对比与激活调校；支持分段偏好和目标 PI 的升级建议
- **调校诊断**：依据遥测数据给出可直接应用的调校建议，也可使用 DashScope 生成已保存方案的诊断
- **AI 教练**：DashScope API 驱动的驾驶分析报告
- **语音播报**：小米 TTS API，弯道导航语音提示

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite 5 + Recharts 3.x |
| 后端 | Node.js (ES Modules) + Express 4.x |
| 实时通信 | Socket.IO 4.x |
| 数据接收 | Node.js dgram (UDP) |
| 数据存储 | JSON 文件 + Brotli 压缩 |
| 语音合成 | 小米 TTS API |
| AI 教练 | DashScope API |

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/dylanma8232-art/FH5-.git
cd FH5-
cd forza-telemetry

# 安装依赖
npm run install:all

# 构建前端静态文件（修改 client/src 后均需重新执行）
npm run build:client

# 启动服务（网页：http://localhost:9188；UDP：9996）
npm start
```

前端静态文件由后端从 `client/dist` 托管。请始终通过 `http://localhost:9188` 使用和验证网页，不启动 Vite 开发服务器。

### 配置游戏遥测

在游戏中依次进入“设置 → HUD 选项”，开启数据输出，并填写：

- 数据输出 IP 地址：运行本项目电脑的局域网 IP
- 数据输出端口：`9996`

## CodeGraph 知识图谱

本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) 进行智能索引和知识图谱管理。

```bash
# 安装 CodeGraph CLI
npm install -g @colbymchenry/codegraph

# 初始化项目索引
codegraph init

# 查询代码
codegraph explore "环道检测如何工作"
```

详细说明请参考 [AGENTS.md](AGENTS.md)。

## 项目结构

```
├── AGENTS.md                    # AI 协作指南
├── CODEMAP.md                   # 代码知识图谱
├── forza-telemetry/
│   ├── CLAUDE.md                # 详细知识图谱
│   ├── server/                  # 后端服务
│   │   └── src/
│   │       ├── index.js         # 主入口（API/Socket.IO/UDP）
│   │       ├── telemetry-parser.js  # UDP 数据解析器
│   │       └── track-builder.js     # 赛道算法
│   ├── client/                  # 前端应用
│   │   └── src/
│   │       ├── App.jsx          # 根组件
│   │       └── components/      # UI 组件
│   └── docs/                    # 开发文档
└── .codegraph/                  # CodeGraph 索引
```

## 文档

- [AGENTS.md](AGENTS.md) - AI 协作指南
- [CLAUDE.md](forza-telemetry/CLAUDE.md) - 详细知识图谱
- [CODEMAP.md](CODEMAP.md) - 代码模块结构树
- 本 README - 项目使用说明与启动方式

## 许可证

MIT
