# Forza Horizon 5 UDP 遥测数据字段全量参考

> **数据包大小:** 324-332 字节  
> **字节序:** Little-Endian (小端)  
> **接收端口:** UDP 9996  
> **解析模块:** `server/src/telemetry-parser.js`

---

## 目录

1. [数据包结构概览](#数据包结构概览)
2. [SLED 区域 (基础车辆动力学)](#sled-区域-基础车辆动力学)
3. [Dash 扩展区域 (高级数据)](#dash-扩展区域-高级数据)
4. [解析后输出结构](#解析后输出结构)
5. [枚举值映射表](#枚举值映射表)
6. [单位转换公式](#单位转换公式)

---

## 数据包结构概览

```
┌─────────────────────────────────────────────────────────┐
│  偏移 0-231    │  SLED 区域 (232 字节)                   │
│                │  基础车辆动力学数据                       │
├─────────────────────────────────────────────────────────┤
│  偏移 232-243  │  FH6 间隙 (12 字节)                     │
│                │  占位数据 (为 Forza Motorsport 预留)      │
├─────────────────────────────────────────────────────────┤
│  偏移 244-322  │  Dash 扩展区域 (79 字节)                 │
│                │  需要包长度 >= 323 字节                   │
│                │  位置/速度/圈速/操控输入等                 │
└─────────────────────────────────────────────────────────┘
```

---

## SLED 区域 (基础车辆动力学)

### 比赛状态与时间

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 1 | `isRaceOn` | 0 | int32 | 4B | 比赛是否进行中 (1=比赛中, 0=菜单/暂停) |
| 2 | `timestampMS` | 4 | uint32 | 4B | 游戏时间戳 (毫秒)，用于计算帧率和时间差 |

### 引擎参数

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 3 | `engineMaxRpm` | 8 | float32 | 4B | 引擎最大转速 (RPM)，如 8000 |
| 4 | `engineIdleRpm` | 12 | float32 | 4B | 引擎怠速转速 (RPM)，如 800 |
| 5 | `currentEngineRpm` | 16 | float32 | 4B | 当前引擎转速 (RPM)，实时值 |

### 加速度 (G力)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 6 | `accelerationX` | 20 | float32 | 4B | X轴加速度 - **横向G力** (左右转弯) |
| 7 | `accelerationY` | 24 | float32 | 4B | Y轴加速度 - **垂直G力** (含重力=1G) |
| 8 | `accelerationZ` | 28 | float32 | 4B | Z轴加速度 - **纵向G力** (加速/制动) |

### 速度 (m/s)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 9 | `velocityX` | 32 | float32 | 4B | X轴速度 - 横向速度 |
| 10 | `velocityY` | 36 | float32 | 4B | Y轴速度 - 垂直速度 |
| 11 | `velocityZ` | 40 | float32 | 4B | Z轴速度 - 纵向/前进速度 |

### 角速度 (rad/s)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 12 | `angularVelocityX` | 44 | float32 | 4B | X轴角速度 - **俯仰** (车头抬/低) |
| 13 | `angularVelocityY` | 48 | float32 | 4B | Y轴角速度 - **偏航** (左右转向) |
| 14 | `angularVelocityZ` | 52 | float32 | 4B | Z轴角速度 - **侧倾** (车身左右倾) |

### 姿态角 (弧度)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 15 | `yaw` | 56 | float32 | 4B | 偏航角 - 车辆水平朝向 |
| 16 | `pitch` | 60 | float32 | 4B | 俯仰角 - 车头抬起/低下 |
| 17 | `roll` | 64 | float32 | 4B | 侧倾角 - 车身左右倾斜 |

### 悬挂行程 (归一化 0-1)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 18 | `normalizedSuspensionTravelFrontLeft` | 68 | float32 | 4B | 前左 (0=压缩, 1=伸展) |
| 19 | `normalizedSuspensionTravelFrontRight` | 72 | float32 | 4B | 前右 |
| 20 | `normalizedSuspensionTravelRearLeft` | 76 | float32 | 4B | 后左 |
| 21 | `normalizedSuspensionTravelRearRight` | 80 | float32 | 4B | 后右 |

### 轮胎纵向滑移率

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 22 | `tireSlipRatioFrontLeft` | 84 | float32 | 4B | 前左 (+加速打滑, -制动打滑) |
| 23 | `tireSlipRatioFrontRight` | 88 | float32 | 4B | 前右 |
| 24 | `tireSlipRatioRearLeft` | 92 | float32 | 4B | 后左 |
| 25 | `tireSlipRatioRearRight` | 96 | float32 | 4B | 后右 |

### 车轮转速 (rad/s)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 26 | `wheelRotationSpeedFrontLeft` | 100 | float32 | 4B | 前左轮速 |
| 27 | `wheelRotationSpeedFrontRight` | 104 | float32 | 4B | 前右轮速 |
| 28 | `wheelRotationSpeedRearLeft` | 108 | float32 | 4B | 后左轮速 |
| 29 | `wheelRotationSpeedRearRight` | 112 | float32 | 4B | 后右轮速 |

### 路肩检测 (Boolean)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 30 | `wheelOnRumbleStripFrontLeft` | 116 | int32 | 4B | 前左是否压路肩 (1=是) |
| 31 | `wheelOnRumbleStripFrontRight` | 120 | int32 | 4B | 前右 |
| 32 | `wheelOnRumbleStripRearLeft` | 124 | int32 | 4B | 后左 |
| 33 | `wheelOnRumbleStripRearRight` | 128 | int32 | 4B | 后右 |

### 水坑深度 (归一化)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 34 | `wheelInPuddleDepthFrontLeft` | 132 | float32 | 4B | 前左 (>0.5=湿滑) |
| 35 | `wheelInPuddleDepthFrontRight` | 136 | float32 | 4B | 前右 |
| 36 | `wheelInPuddleDepthRearLeft` | 140 | float32 | 4B | 后左 |
| 37 | `wheelInPuddleDepthRearRight` | 144 | float32 | 4B | 后右 |

### 路面震动强度

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 38 | `surfaceRumbleFrontLeft` | 148 | float32 | 4B | 前左路面粗糙度 |
| 39 | `surfaceRumbleFrontRight` | 152 | float32 | 4B | 前右 |
| 40 | `surfaceRumbleRearLeft` | 156 | float32 | 4B | 后左 |
| 41 | `surfaceRumbleRearRight` | 160 | float32 | 4B | 后右 |

### 轮胎侧偏角 (度)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 42 | `tireSlipAngleFrontLeft` | 164 | float32 | 4B | 前左侧向滑移角 |
| 43 | `tireSlipAngleFrontRight` | 168 | float32 | 4B | 前右 |
| 44 | `tireSlipAngleRearLeft` | 172 | float32 | 4B | 后左 |
| 45 | `tireSlipAngleRearRight` | 176 | float32 | 4B | 后右 |

### 轮胎综合打滑值

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 46 | `tireCombinedSlipFrontLeft` | 180 | float32 | 4B | 前左 (>0.8打滑, >1.2严重) |
| 47 | `tireCombinedSlipFrontRight` | 184 | float32 | 4B | 前右 |
| 48 | `tireCombinedSlipRearLeft` | 188 | float32 | 4B | 后左 |
| 49 | `tireCombinedSlipRearRight` | 192 | float32 | 4B | 后右 |

### 悬挂行程 (绝对值，米)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 50 | `suspensionTravelMetersFrontLeft` | 196 | float32 | 4B | 前左 (米) |
| 51 | `suspensionTravelMetersFrontRight` | 200 | float32 | 4B | 前右 |
| 52 | `suspensionTravelMetersRearLeft` | 204 | float32 | 4B | 后左 |
| 53 | `suspensionTravelMetersRearRight` | 208 | float32 | 4B | 后右 |

### 车辆信息

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 54 | `carOrdinal` | 212 | int32 | 4B | 车辆唯一ID |
| 55 | `carClass` | 216 | int32 | 4B | 车辆等级 (见枚举表) |
| 56 | `carPerformanceIndex` | 220 | int32 | 4B | 性能指数 PI (100-999) |
| 57 | `drivetrainType` | 224 | int32 | 4B | 驱动类型 (见枚举表) |
| 58 | `numCylinders` | 228 | int32 | 4B | 引擎气缸数 |

---

## Dash 扩展区域 (高级数据)

> **注意:** 需要数据包长度 >= 323 字节才能解析此区域

### 世界坐标位置

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 59 | `positionX` | 244 | float32 | 4B | 世界X坐标 (米)，横向位置 |
| 60 | `positionY` | 248 | float32 | 4B | 世界Y坐标 (米)，高度位置 |
| 61 | `positionZ` | 252 | float32 | 4B | 世界Z坐标 (米)，纵向位置 |

### 速度与动力

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 62 | `speed` | 256 | float32 | 4B | 车速 (m/s)，×3.6=km/h |
| 63 | `power` | 260 | float32 | 4B | 引擎功率 (瓦特)，÷745.7=HP |
| 64 | `torque` | 264 | float32 | 4B | 引擎扭矩 (Nm) |

### 轮胎温度 (华氏度)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 65 | `tireTempFrontLeft` | 268 | float32 | 4B | 前左轮胎温度 (°F) |
| 66 | `tireTempFrontRight` | 272 | float32 | 4B | 前右 |
| 67 | `tireTempRearLeft` | 276 | float32 | 4B | 后左 |
| 68 | `tireTempRearRight` | 280 | float32 | 4B | 后右 |

### 增压与燃油

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 69 | `boost` | 284 | float32 | 4B | 涡轮增压值 |
| 70 | `fuel` | 288 | float32 | 4B | 燃油量 (0-1)，1=满 |

### 行驶距离

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 71 | `distanceTraveled` | 292 | float32 | 4B | 行驶距离 (米) |

### 圈速与比赛时间

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 72 | `bestLap` | 296 | float32 | 4B | 最快圈速 (秒) |
| 73 | `lastLap` | 300 | float32 | 4B | 上一圈速 (秒) |
| 74 | `currentLap` | 304 | float32 | 4B | 当前圈已用时间 (秒) |
| 75 | `currentRaceTime` | 308 | float32 | 4B | 比赛总用时 (秒) |

### 比赛信息

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 76 | `lapNumber` | 312 | uint16 | 2B | 当前圈数 |
| 77 | `racePosition` | 314 | uint8 | 1B | 比赛排名 (1-24) |

### 操控输入 (0-255)

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 78 | `accel` | 315 | uint8 | 1B | 油门踏板 (0=无, 255=全油门) |
| 79 | `brake` | 316 | uint8 | 1B | 刹车踏板 (0=无, 255=全刹车) |
| 80 | `clutch` | 317 | uint8 | 1B | 离合器 (0=接合, 255=踩下) |
| 81 | `handBrake` | 318 | uint8 | 1B | 手刹 (0=松, 255=拉满) |
| 82 | `gear` | 319 | uint8 | 1B | 档位 (0=R, 1=N, 2+=D1/D2...) |
| 83 | `steer` | 320 | int8 | 1B | 转向 (-128左, +127右) |

### 辅助信息

| # | 字段名 | 偏移 | 类型 | 大小 | 说明 |
|---|--------|------|------|------|------|
| 84 | `normalizedDrivingLine` | 321 | int8 | 1B | 走线偏差 (归一化) |
| 85 | `normalizedAIBrakeDifference` | 322 | int8 | 1B | AI刹车差异 (归一化) |

---

## 解析后输出结构

```javascript
{
  // 比赛状态
  isRaceOn: Boolean,
  timestampMS: Number,

  // 引擎
  engineMaxRpm: Number,
  engineIdleRpm: Number,
  currentEngineRpm: Number,

  // 运动学 (分组对象)
  acceleration: { x, y, z },      // G力
  velocity: { x, y, z },          // m/s
  angularVelocity: { x, y, z },   // rad/s
  yaw: Number,                     // rad
  pitch: Number,                   // rad
  roll: Number,                    // rad

  // 悬挂
  suspension: { frontLeft, frontRight, rearLeft, rearRight },           // 0-1
  suspensionTravelMeters: { frontLeft, frontRight, rearLeft, rearRight }, // 米

  // 轮胎
  tireSlipRatio: { frontLeft, frontRight, rearLeft, rearRight },     // 纵向滑移
  tireSlipAngle: { frontLeft, frontRight, rearLeft, rearRight },     // 侧偏角
  tireCombinedSlip: { frontLeft, frontRight, rearLeft, rearRight },  // 综合打滑
  tireTemp: { frontLeft, frontRight, rearLeft, rearRight },          // °F
  wheelRotationSpeed: { frontLeft, frontRight, rearLeft, rearRight }, // rad/s

  // 路面
  onRumbleStrip: { frontLeft, frontRight, rearLeft, rearRight },     // Boolean
  puddleDepth: { frontLeft, frontRight, rearLeft, rearRight },       // 0-1
  surfaceRumble: { frontLeft, frontRight, rearLeft, rearRight },     // 震动强度

  // 位置 (Dash扩展)
  position: { x, y, z },          // 世界坐标 (米)

  // 速度与动力 (Dash扩展)
  speedMs: Number,                 // m/s
  speedKmh: Number,                // km/h
  speedMph: Number,                // mph
  powerWatts: Number,              // 瓦特
  powerHP: Number,                 // 马力
  torque: Number,                  // Nm

  // 增压与燃油 (Dash扩展)
  boost: Number,
  fuel: Number,                    // 0-1

  // 行驶 (Dash扩展)
  distanceTraveled: Number,        // 米

  // 圈速 (Dash扩展)
  bestLap: Number,                 // 秒
  lastLap: Number,                 // 秒
  currentLap: Number,              // 秒
  currentRaceTime: Number,         // 秒

  // 比赛信息 (Dash扩展)
  lapNumber: Number,
  racePosition: Number,            // 1-24

  // 操控输入 (Dash扩展)
  controls: {
    accel: Number,                 // 0-255
    brake: Number,                 // 0-255
    clutch: Number,                // 0-255
    handBrake: Number,             // 0-255
    gear: Number,                  // 0=R, 1=N, 2+=D
    steer: Number,                 // -128~+127
  },

  // 辅助 (Dash扩展)
  drivingLine: Number,
  aiBrakeDiff: Number,

  // 车辆信息
  car: {
    ordinal: Number,               // 车辆ID
    class: Number,                 // 0-6
    performanceIndex: Number,      // PI
    drivetrainType: Number,        // 0-2
    numCylinders: Number,
  },

  // 元数据
  _packetSize: Number,             // 原始包大小
}
```

---

## 枚举值映射表

### 车辆等级 (carClass)

| 值 | 等级 | 说明 |
|----|------|------|
| 0 | D | 入门级 |
| 1 | C | 初级 |
| 2 | B | 中级 |
| 3 | A | 高级 |
| 4 | S1 | 运动级 |
| 5 | S2 | 超跑级 |
| 6 | X | 极限级 |

### 驱动类型 (drivetrainType)

| 值 | 类型 | 英文 |
|----|------|------|
| 0 | 前驱 | FWD |
| 1 | 后驱 | RWD |
| 2 | 四驱 | AWD |

### 档位 (gear)

| 值 | 档位 |
|----|------|
| 0 | R (倒档) |
| 1 | N (空档) |
| 2 | D1 (1档) |
| 3 | D2 (2档) |
| ... | ... |

---

## 单位转换公式

| 原始值 | 转换目标 | 公式 |
|--------|----------|------|
| speed (m/s) | km/h | `× 3.6` |
| speed (m/s) | mph | `× 2.23694` |
| power (瓦特) | 马力 HP | `÷ 745.7` |
| tireTemp (°F) | °C | `(°F - 32) × 5/9` |
| 角度 (弧度) | 度 | `× 180 / π` |
| accel/brake/clutch | 百分比 | `÷ 255 × 100%` |
| steer | 百分比 | `÷ 127 × 100%` |

---

## 数据应用场景

| 数据类型 | 应用场景 |
|----------|----------|
| 位置坐标 (position) | 赛道轨迹记录、走线分析 |
| G力 (acceleration) | 驾驶风格分析、过弯极限检测 |
| 轮胎数据 (slip/temp) | 轮胎状态监控、打滑预警 |
| 悬挂数据 | 调校验证、路面状态分析 |
| 操控输入 | 输入分析、油门/刹车曲线 |
| 圈速数据 | 比赛计时、成绩统计 |
| 引擎数据 | 换挡提示、转速预警 |

---

## 实际捕获数据示例

> 以下数据来自真实游戏会话，捕获于 2026-06-28

### 数据包信息
- **来源**: 192.168.31.154:5200 (游戏设备)
- **大小**: 324 字节
- **格式**: SLED (232字节) + FH6间隙 (12字节) + Dash扩展 (80字节)

### 实时数据快照

```
【比赛状态】
isRaceOn: 1 (比赛中)
timestampMS: 405055 ms

【引擎】
engineMaxRpm: 10000.00 RPM
engineIdleRpm: 1037.11 RPM
currentEngineRpm: 7230.67 RPM

【加速度 (G力)】
accelerationX: -4.7307 G (横向，左转弯)
accelerationY: -0.8949 G (垂直)
accelerationZ: 3.4515 G (纵向，加速中)

【速度】
velocityX: 0.3222 m/s
velocityY: 0.0979 m/s
velocityZ: 41.4029 m/s (前进速度)
speed: 41.4043 m/s = 149.06 km/h

【姿态】
yaw: 0.5249 rad (30.07°)
pitch: 0.0036 rad (0.21°)
roll: -0.0041 rad (-0.23°)

【悬挂 (归一化 0-1)】
suspensionFL: 0.2208 (压缩状态)
suspensionFR: 0.2721
suspensionRL: 0.2691
suspensionRR: 0.3102

【轮胎滑移率】
tireSlipRatioFL: 0.1446
tireSlipRatioFR: 0.0832
tireSlipRatioRL: 0.1709
tireSlipRatioRR: 0.1143

【轮胎侧偏角】
tireSlipAngleFL: -0.1984°
tireSlipAngleFR: -0.1835°
tireSlipAngleRL: -0.1081°
tireSlipAngleRR: -0.1027°

【轮胎综合打滑】
tireCombinedSlipFL: 0.2455
tireCombinedSlipFR: 0.2015
tireCombinedSlipRL: 0.2022
tireCombinedSlipRR: 0.1537

【轮胎温度】
tireTempFL: 110.77°F (43.76°C)
tireTempFR: 126.02°F (52.23°C)
tireTempRL: 102.52°F (39.18°C)
tireTempRR: 102.52°F (39.18°C)

【车轮转速】
wheelSpeedFL: 126.8499 rad/s
wheelSpeedFR: 126.8040 rad/s
wheelSpeedRL: 124.8868 rad/s
wheelSpeedRR: 124.8050 rad/s

【世界坐标位置】
positionX: 1118.8076 m
positionY: 131.4879 m (高度)
positionZ: 540.0558 m

【动力系统】
power: 369756.03 W = 495.85 HP
torque: 488.4263 Nm
boost: 0.0000 (自然吸气)
fuel: 1.0000 (满油)

【比赛信息】
bestLap: 0.0000 秒
lastLap: 0.0000 秒
currentLap: 32.1988 秒
currentRaceTime: 36.9035 秒
lapNumber: 0
racePosition: 1 (第一名)
distanceTraveled: 1662.3876 m

【操控输入】
accel: 255 (全油门)
brake: 0 (无刹车)
clutch: 0 (离合器接合)
handBrake: 0 (手刹松开)
gear: 4 (4档)
steer: -28 (左转)
drivingLine: 10
aiBrakeDiff: 0

【车辆信息】
carOrdinal: 3546
carClass: 3 (A级)
carPerformanceIndex: 795
drivetrainType: 2 (四驱AWD)
numCylinders: 10 (V10)

【路面状态】
rumbleStrip: 全0 (未压路肩)
puddleDepth: 全0 (干燥路面)
surfaceRumble: 全0 (平滑路面)
```

---

**总计: 85 个原始二进制字段 (全部由游戏UDP协议定义)**

> 文档生成时间: 2026-06-28  
> 数据来源: `server/src/telemetry-parser.js` + 实时UDP捕获  
> 捕获工具: `server/debug-udp-capture.cjs`
