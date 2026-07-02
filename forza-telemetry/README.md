# Forza Horizon 5 Telemetry System

实时接收和分析 Forza Horizon 5 的 UDP 遥测数据。

## 项目状态

✅ **已完成：**
- UDP 数据接收服务
- 数据解析模块（332字节完整解析）
- WebSocket 实时推送
- 简单的前端 Dashboard
- 测试数据发送器

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

### 3. 启动前端

```bash
cd client && npm run dev
```

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

## 下一步开发

1. **数据记录** - 将比赛数据保存到数据库
2. **轨迹可视化** - 在地图上显示行驶路线
3. **圈速统计** - 按车辆和赛道统计
4. **驾驶建议** - 基于速度和弯道预测
5. **风险预警** - 轮胎打滑/温度预警
