# Forza Horizon 5 UDP 遥测数据字段全量参考

> **数据包总大小:** 324 - 332 字节  
> **字节序:** Little-Endian (小端字节序)  
> **默认接收端口:** UDP 9996  
> **解析参考模块:** `server/src/telemetry-parser.js`

---

## 💡 开发避坑与核心说明 (Important Notes)

在对接或修改 UDP 数据字典时，请务必注意以下几点：

1. **FH6 Gap 12字节空隙 (最容易导致错位的问题)**  
   Forza Horizon 5 的数据包在 SLED 区域（偏移 0-231）和 Dash 区域（偏移 244 往后）之间，塞入了 **12 字节的空数据占位区**（偏移量 232 到 243）。**解析时必须跳过这 12 字节**，否则后面的世界坐标、车速、马力、胎温、踏板输入等全部都会发生错位。
2. **⚠️ 官方 UDP 广播不支持的“缺失字段”**  
   虽然游戏内的 Telemetry HUD（十字键下）会显示以下数据，但**官方没有在外部 UDP 网络流中发送它们**。任何外部软件均无法直接拿到它们的实时变化：
   * **实时轮胎压力 (Tire Pressure)**：例如 1.78 bar
   * **轮胎磨损损耗 (Tire Damage/Wear)**：例如 0.0%
   * **实时外倾角 (Real-time Camber Angle)**：例如 -1.54°
   * *解决方案*：如果页面需要，可以使用车辆静态调校输入的值进行展示，或者在实时面板中隐藏。
3. **四轮数组顺序**  
   悬架、滑移、轮速、胎温等所有按四轮分组的字段，在字节流中存放顺序严格为：  
   `前左 (FL) -> 前右 (FR) -> 后左 (RL) -> 后右 (RR)`。
4. **悬架绝对行程 vs 偏距**  
   游戏内 HUD 显示的 54cm 偏距为车辆调校最大静态值。而 UDP 发送的 `suspensionTravelMeters`（如 `0.006m`）是当前时刻悬挂受力产生的**实时压缩/拉伸位移**，两者物理意义不同。

---

## 📂 1. SLED 数据区域 (偏移 0 - 231 字节，共 232 字节)

### 比赛状态与时间 (Status & Time)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **0** | `isRaceOn` | `int32` (4B) | Boolean | 1=比赛/漫游中，0=菜单/暂停/等待 |
| **4** | `timestampMS` | `uint32` (4B) | 毫秒 ms | 游戏系统毫秒时间戳 |

### 引擎参数 (Engine)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **8** | `engineMaxRpm` | `float32` (4B) | RPM | 引擎最大转速极限 |
| **12** | `engineIdleRpm` | `float32` (4B) | RPM | 引擎怠速转速 |
| **16** | `currentEngineRpm` | `float32` (4B) | RPM | 实时引擎转速 |

### 动力学加速度 (G力)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **20** | `accelerationX` | `float32` (4B) | G | **横向G力** (左转为负，右转为正) |
| **24** | `accelerationY` | `float32` (4B) | G | **垂直G力** (包含重力常数) |
| **28** | `accelerationZ` | `float32` (4B) | G | **纵向G力** (刹车为负，加速为正) |

### 速度矢量 (Velocity)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **32** | `velocityX` | `float32` (4B) | m/s | X 轴右向速度 |
| **36** | `velocityY` | `float32` (4B) | m/s | Y 轴向上速度 |
| **40** | `velocityZ` | `float32` (4B) | m/s | Z 轴前向速度 |

### 角速度 (Angular Velocity)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **44** | `angularVelocityX` | `float32` (4B) | rad/s | 俯仰角速度 (Pitch rate) |
| **48** | `angularVelocityY` | `float32` (4B) | rad/s | 偏航角速度 (Yaw rate) |
| **52** | `angularVelocityZ` | `float32` (4B) | rad/s | 侧倾角速度 (Roll rate) |

### 车辆朝向姿态角 (Orientation)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **56** | `yaw` | `float32` (4B) | 弧度 rad | 偏航角 (车头水平指向) |
| **60** | `pitch` | `float32` (4B) | 弧度 rad | 俯仰角 (车头抬起/低下) |
| **64** | `roll` | `float32` (4B) | 弧度 rad | 侧倾角 (车身左右倾斜) |

### 归一化悬挂行程 (Normalized Suspension Travel)
> 0.0 代表最压缩（压到底），1.0 代表最伸展（悬空）
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **68** | `normalizedSuspensionTravelFrontLeft` | `float32` (4B) | 前左 (FL) 归一化行程 |
| **72** | `normalizedSuspensionTravelFrontRight` | `float32` (4B) | 前右 (FR) 归一化行程 |
| **76** | `normalizedSuspensionTravelRearLeft` | `float32` (4B) | 后左 (RL) 归一化行程 |
| **80** | `normalizedSuspensionTravelRearRight` | `float32` (4B) | 后右 (RR) 归一化行程 |

### 轮胎纵向滑移率 (Tire Slip Ratio)
> 0 = 无滑移，>0 = 驱动轮加速打滑，<0 = 刹车轮胎抱死
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **84** | `tireSlipRatioFrontLeft` | `float32` (4B) | 前左轮胎纵向滑移率 |
| **88** | `tireSlipRatioFrontRight` | `float32` (4B) | 前右轮胎纵向滑移率 |
| **92** | `tireSlipRatioRearLeft` | `float32` (4B) | 后左轮胎纵向滑移率 |
| **96** | `tireSlipRatioRearRight` | `float32` (4B) | 后右轮胎纵向滑移率 |

### 车轮旋转速度 (Wheel Rotation Speed)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **100** | `wheelRotationSpeedFrontLeft` | `float32` (4B) | rad/s | 前左轮速 |
| **104** | `wheelRotationSpeedFrontRight` | `float32` (4B) | rad/s | 前右轮速 |
| **108** | `wheelRotationSpeedRearLeft` | `float32` (4B) | rad/s | 后左轮速 |
| **112** | `wheelRotationSpeedRearRight` | `float32` (4B) | rad/s | 后右轮速 |

### 压路肩指示 (On Rumble Strip)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **116** | `wheelOnRumbleStripFrontLeft` | `int32` (4B) | 前左车轮是否压上路肩 (1=是, 0=否) |
| **120** | `wheelOnRumbleStripFrontRight` | `int32` (4B) | 前右车轮是否压上路肩 |
| **124** | `wheelOnRumbleStripRearLeft` | `int32` (4B) | 后左车轮是否压上路肩 |
| **128** | `wheelOnRumbleStripRearRight` | `int32` (4B) | 后右车轮是否压上路肩 |

### 积水深度 (Puddle Depth)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **132** | `wheelInPuddleDepthFrontLeft` | `float32` (4B) | 前左车轮积水深度 (0=干燥, 1=深水) |
| **136** | `wheelInPuddleDepthFrontRight` | `float32` (4B) | 前右车轮积水深度 |
| **140** | `wheelInPuddleDepthRearLeft` | `float32` (4B) | 后左车轮积水深度 |
| **144** | `wheelInPuddleDepthRearRight` | `float32` (4B) | 后右车轮积水深度 |

### 路面颠簸震动反馈 (Surface Rumble)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **148** | `surfaceRumbleFrontLeft` | `float32` (4B) | 前左路面震动强度 (越粗糙数值越大) |
| **152** | `surfaceRumbleFrontRight` | `float32` (4B) | 前右路面震动强度 |
| **156** | `surfaceRumbleRearLeft` | `float32` (4B) | 后左路面震动强度 |
| **160** | `surfaceRumbleRearRight` | `float32` (4B) | 后右路面震动强度 |

### 轮胎侧偏角 (Tire Slip Angle)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **164** | `tireSlipAngleFrontLeft` | `float32` (4B) | 前左侧向滑移角 |
| **168** | `tireSlipAngleFrontRight` | `float32` (4B) | 前右侧向滑移角 |
| **172** | `tireSlipAngleRearLeft` | `float32` (4B) | 后左侧向滑移角 |
| **176** | `tireSlipAngleRearRight` | `float32` (4B) | 后右侧向滑移角 |

### 轮胎综合滑移值 (Tire Combined Slip / 摩擦力消耗比例)
> 0.0 代表抓地力充沛，越接近或超过 1.0 反映抓地力越接近物理极限 (即打滑/消耗最大)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **180** | `tireCombinedSlipFrontLeft` | `float32` (4B) | 前左综合滑移值 |
| **184** | `tireCombinedSlipFrontRight` | `float32` (4B) | 前右综合滑移值 |
| **188** | `tireCombinedSlipRearLeft` | `float32` (4B) | 后左综合滑移值 |
| **192** | `tireCombinedSlipRearRight` | `float32` (4B) | 后右综合滑移值 |

### 悬挂绝对物理位移行程 (Suspension Travel Meters)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **196** | `suspensionTravelMetersFrontLeft` | `float32` (4B) | 米 m | 前左悬挂实际压缩/拉伸行程 |
| **200** | `suspensionTravelMetersFrontRight` | `float32` (4B) | 米 m | 前右悬挂实际压缩/拉伸行程 |
| **204** | `suspensionTravelMetersRearLeft` | `float32` (4B) | 米 m | 后左悬挂实际压缩/拉伸行程 |
| **208** | `suspensionTravelMetersRearRight` | `float32` (4B) | 米 m | 后右悬挂实际压缩/拉伸行程 |

### 车辆底层配置信息 (Car Config)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **212** | `carOrdinal` | `int32` (4B) | 车辆唯一数据库 ID |
| **216** | `carClass` | `int32` (4B) | 车辆等级 (0=D, 1=C, 2=B, 3=A, 4=S1, 5=S2, 6=X) |
| **220** | `carPerformanceIndex` | `int32` (4B) | 车辆性能PI值 (100 - 999) |
| **224** | `drivetrainType` | `int32` (4B) | 驱动形式 (0=FWD, 1=RWD, 2=AWD) |
| **228** | `numCylinders` | `int32` (4B) | 引擎气缸个数 |

---

## 🚧 2. 占位区域 (偏移 232 - 243 字节，共 12 字节)
*   **FH6 Gap**: 地平线 5 遥测在此处有 12 字节的数据空隙，**读取高级数据前必须跳过这 12 个字节**。

---

## 📂 3. Dash 扩展高级数据区 (偏移 244 字节往后)

### 世界位置坐标 (World Positions)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **244** | `positionX` | `float32` (4B) | 米 m | 三维世界坐标 X (东/西) |
| **248** | `positionY` | `float32` (4B) | 米 m | 三维世界坐标 Y (海拔高度) |
| **252** | `positionZ` | `float32` (4B) | 米 m | 三维世界坐标 Z (南/北) |

### 速度、功率与扭矩 (Engine Out)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **256** | `speed` | `float32` (4B) | 米/秒 m/s | 车身速度 (乘以 `3.6` 得到 km/h) |
| **260** | `power` | `float32` (4B) | 瓦特 W | 实时功率 (除以 `745.7` 得到马力 HP) |
| **264** | `torque` | `float32` (4B) | 牛米 Nm | 实时引擎输出扭矩 |

### 轮胎温度 (Tire Temperature)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **268** | `tireTempFrontLeft` | `float32` (4B) | 华氏度 °F | 前左胎面实时温度 (转换为摄氏度: `(°F-32)*5/9`) |
| **272** | `tireTempFrontRight` | `float32` (4B) | 华氏度 °F | 前右胎面实时温度 |
| **276** | `tireTempRearLeft` | `float32` (4B) | 华氏度 °F | 后左胎面实时温度 |
| **280** | `tireTempRearRight` | `float32` (4B) | 华氏度 °F | 后右胎面实时温度 |

### 增压、燃油与距离 (Distance & Fuel)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **284** | `boost` | `float32` (4B) | Psi | 实时涡轮增压值 |
| **288** | `fuel` | `float32` (4B) | % | 剩余油量比例 (0.0 - 1.0) |
| **292** | `distanceTraveled` | `float32` (4B) | 米 m | 本局累计行驶距离 |

### 比赛与圈速计时 (Lap Timing)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 物理单位 | 说明 |
|:---|:---|:---|:---|:---|
| **296** | `bestLap` | `float32` (4B) | 秒 s | 本局最快圈速纪录 |
| **300** | `lastLap` | `float32` (4B) | 秒 s | 上一圈完成时间 |
| **304** | `currentLap` | `float32` (4B) | 秒 s | 当前圈当前计时 |
| **308** | `currentRaceTime` | `float32` (4B) | 秒 s | 比赛累计总用时 |
| **312** | `lapNumber` | `uint16` (2B) | - | 当前圈数 (0 为第1圈，1 为第2圈) |
| **314** | `racePosition` | `uint8` (1B) | - | 比赛实时排名 (1-24) |

### 驾驶员操作输入 (Driver Inputs)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 数值区间 | 说明 |
|:---|:---|:---|:---|:---|
| **315** | `accel` | `uint8` (1B) | 0 - 255 | 油门踏板踩下深度 (0=松开, 255=踩满) |
| **316** | `brake` | `uint8` (1B) | 0 - 255 | 刹车踏板踩下深度 |
| **317** | `clutch` | `uint8` (1B) | 0 - 255 | 离合器踏板踩下深度 (0=松开/接合, 255=踩下/断开) |
| **318** | `handBrake` | `uint8` (1B) | 0 - 255 | 手刹拉起深度 (0=松开, 255=拉死) |
| **319** | `gear` | `uint8` (1B) | 0 - 15 | 当前挡位 (0=R倒挡, 1=N空挡, 2=1挡...) |
| **320** | `steer` | `int8` (1B) | -128 ~ 127 | 方向盘转向角度 (-128=极限左转, 0=回正, 127=极限右转) |

### 游戏辅助系统参数 (Game Assists)
| 偏移 (Offset) | 字段名 (Field Name) | 数据类型 (Type) | 说明 |
|:---|:---|:---|:---|
| **321** | `normalizedDrivingLine` | `int8` (1B) | 最佳辅助路线偏离值 |
| **322** | `normalizedAIBrakeDifference`| `int8` (1B) | AI 辅助制动介入指标差值 |

---

## 🛠️ 数据转换公式表

在获取到原始二进制字段后，若想转换为前端更容易阅读的形式，可以使用以下换算公式：

| 原始属性 | 转换目标 | 换算公式 |
| :--- | :--- | :--- |
| `speed` (m/s) | **公里/小时 (km/h)** | `speed * 3.6` |
| `speed` (m/s) | **英里/小时 (mph)** | `speed * 2.23694` |
| `power` (W) | **马力 (HP)** | `power / 745.7` |
| `tireTemp` (°F) | **摄氏度 (°C)** | `(tireTemp - 32) * 5 / 9` |
| `yaw / pitch / roll` | **角度 (deg)** | `angle * 180 / Math.PI` |
| `accel / brake / clutch` | **百分比 (%)** | `(value / 255) * 100` |
| `steer` | **百分比 (%)** | `(value / 127) * 100` |
