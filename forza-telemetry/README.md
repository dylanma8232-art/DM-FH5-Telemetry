# Forza Horizon 5 Telemetry System

实时接收和分析 Forza Horizon 5 的 UDP 遥测数据，支持专业级仪表盘、赛道自动识别、比赛记录与回放、驾驶建议等功能。

## 项目状态

✅ **核心功能：**
- UDP 数据接收服务（324字节完整解析，30fps）
- WebSocket 实时推送
- 专业级仪表盘（50+组件，React 18 + Vite 5）
- 赛道自动识别与管理（多维度相似度算法）
- 比赛记录与回放、分段计时、圈速对比
- 车辆自动检测与管理
- 调校管理与对比
- 驾驶建议与语音播报（小米 TTS）
- 数据压缩优化（Brotli 等级 9，节省 5-10% 空间）
- 智能清理机制（30天自动清理高精度数据）

## 数据存储与压缩

### 存储结构
```
forza-telemetry/data/
├── sessions/               # 比赛记录
│   ├── *_summary.json      # 摘要数据（无压缩）
│   ├── *_detail_hifi.json.br   # 高精度数据（Brotli 压缩）
│   └── *_detail_lowfi.json.br  # 低精度数据（Brotli 压缩）
├── tracks/                 # 赛道数据
├── tracks.json.br          # 赛道数据库（6.1MB）
├── vehicles.json           # 车辆数据（6.1KB）
└── tunes.json              # 调校数据
```

### 压缩优化
- **压缩算法**：Brotli 等级 9（原等级 5）
- **压缩率**：21.38% → 16.77%（提升约 5-10%）
- **空间节省**：每个高精度文件额外节省 0.2-0.5 MB
- **压缩时间**：319ms → 890ms（增加约 2.8 倍，仅影响保存）

### 智能清理机制
- **清理策略**：自动清理超过 30 天的高精度详情文件
- **保留内容**：低精度详情文件 + 摘要文件
- **触发时机**：服务器启动时自动执行
- **清理后影响**：
  - 历史记录和排行榜：仍可使用摘要信息显示基本数据
  - 遥测数据回放：低精度文件存在时仍可工作，但精度降低
  - 数据分析模块：高精度分析功能会受限，但基础会话元数据保留

### 后台压缩
```bash
# 重新压缩现有文件（后台批量处理）
cd forza-telemetry/server && npm run recompress
```

## 快速开始

### 1. 安装依赖

```bash
cd server && npm install
cd ../client && npm install
```

### 2. 启动服务器

```bash
cd server && npm run dev
```

### 3. 构建前端

```bash
cd client && npm run build
```

前端由后端从 `client/dist` 托管，所有页面验证均使用 `http://localhost:9188`。

### 4. 测试数据接收

```bash
# 在另一个终端运行测试发送器
cd server && npm test
```

### 5. 配置游戏

在 Forza Horizon 5 中：
1. 设置 → HUD 选项
2. Data Out: **ON**
3. Data Out IP Address: **你的电脑IP**
4. Data Out IP Port: **9996**

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /api/status` | 服务器状态 |
| `GET /api/current` | 当前遥测数据 |

## 已解析的 UDP 数据

### 基础信息
- `isRaceOn` - 是否在比赛中
- `timestampMS` - 时间戳

### 引擎
- `engineMaxRpm` / `engineIdleRpm` / `currentEngineRpm`

### 运动状态
- `velocity` (x/y/z) - 速度向量 (m/s)
- `acceleration` (x/y/z) - 加速度
- `position` (x/y/z) - 世界坐标
- `yaw` / `pitch` / `roll` - 姿态角

### 轮胎
- `tireSlipRatio` (4轮) - 打滑率
- `tireSlipAngle` (4轮) - 打滑角
- `tireCombinedSlip` (4轮) - 综合打滑
- `tireTemp` (4轮) - 温度

### 比赛信息
- `bestLap` / `lastLap` / `currentLap` - 圈速
- `lapNumber` - 圈数
- `racePosition` - 排名

### 控制输入
- `controls.accel` / `brake` / `clutch` / `steer`
- `controls.gear` - 档位

### 车辆信息
- `car.ordinal` - 车辆ID
- `car.class` - 等级 (D/C/B/A/S1/S2/X)
- `car.performanceIndex` - PI值
- `car.drivetrainType` - 驱动类型 (FWD/RWD/AWD)

---

## 赛道数据方案

UDP 数据**不包含赛道名称**，但有 `positionX/Y/Z` 坐标。

### 方案一：自采集（推荐）
1. 跑比赛时记录 Position 轨迹
2. 通过轨迹形状识别赛道
3. 手动标注赛道名称
4. 逐步建立赛道数据库

### 方案二：社区数据
- 搜索 FH5 赛道坐标数据
- 从游戏文件提取（需要 mod）

### 方案三：实时识别
- 根据 Position 范围判断区域
- 结合比赛类型推断赛道
- 使用历史轨迹匹配

---

## 已完成优化

1. **数据压缩优化** - Brotli 压缩等级提升至 9，节省 5-10% 存储空间
2. **智能清理机制** - 自动清理超过 30 天的高精度数据，保留摘要和低精度数据
3. **后台压缩脚本** - 支持后台批量重新压缩现有文件
4. **赛道自动识别** - 多维度相似度算法（Hausdorff + Fréchet + 曲率 + 方向 + 边界 + 长度）
5. **专业仪表盘** - 50+ 组件，支持实时遥测显示

## 下一步开发

1. **数据记录** - 将比赛数据保存到数据库
2. **轨迹可视化** - 在地图上显示行驶路线
3. **圈速统计** - 按车辆和赛道统计
4. **驾驶建议** - 基于速度和弯道预测
5. **风险预警** - 轮胎打滑/温度预警
6. **增量压缩** - 实现帧间变化量压缩，进一步减少存储空间
7. **列式存储** - 将 JSON 转为 Parquet 格式，提升压缩率
