import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTelemetryPacket } from '../telemetry-parser.js';

const PORT = 9996;
const HOST = '0.0.0.0';
const server = dgram.createSocket('udp4');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scratchDir = path.resolve(__dirname, '../../../../scratch');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

console.log(`[UDP监听器] 正在尝试绑定端口 ${PORT}...`);

let packetCount = 0;

server.on('message', (msg, rinfo) => {
  packetCount++;
  
  // 打印每一帧的简要信息以确保连接正常，防止刷屏
  if (packetCount % 60 === 1) {
    console.log(`[接收中] 已累计收到 ${packetCount} 个包，当前来自: ${rinfo.address}:${rinfo.port} (大小: ${msg.length}字节)`);
  }
  
  if (packetCount === 1) {
    console.log(`\n[成功] 捕获到首个 UDP 数据包！`);
    console.log(`来源: ${rinfo.address}:${rinfo.port}`);
    console.log(`包长度: ${msg.length} 字节`);
    
    // 保存一份原始二进制数据到 scratch 方便分析
    const rawPath = path.join(scratchDir, 'captured_raw_packet.bin');
    fs.writeFileSync(rawPath, msg);
    console.log(`原始二进制数据已保存至: ${rawPath}`);
    
    // 解析包
    const parsedData = parseTelemetryPacket(msg);
    if (parsedData) {
      const parsedPath = path.join(scratchDir, 'captured_parsed_packet.json');
      fs.writeFileSync(parsedPath, JSON.stringify(parsedData, null, 2));
      console.log(`解析后的 JSON 已保存至: ${parsedPath}`);
      
      console.log('\n==================================================');
      console.log('            首个抓包数据全部分类展示 (示例)          ');
      console.log('==================================================');
      
      printClassifiedData(parsedData);
      
      console.log('\n==================================================');
      console.log('           [提示] 监听器将持续运行以接收数据。        ');
      console.log('           若想退出监听，请在终端按 Ctrl+C 终止。      ');
      console.log('==================================================\n');
    } else {
      console.log('[错误] 解析首包数据失败，数据包长度可能不足 232 字节。');
    }
  }
});

server.on('error', (err) => {
  console.error(`[UDP监听错误]:\n${err.stack}`);
  server.close();
});

server.bind(PORT, HOST, () => {
  console.log(`[UDP监听器] 成功绑定 ${HOST}:${PORT}。正在等待数据包传入...`);
  console.log('提示: 请确保游戏内开启了 Data Out，并将输出 IP 设为这台电脑的 IP，端口设为 9996。');
  console.log('按 Ctrl+C 可以退出监听。');
});


function printClassifiedData(data) {
  console.log('\n【 1. 比赛与时间状态 (Race & Time State) 】');
  console.log(`  isRaceOn (比赛中): ${data.isRaceOn}`);
  console.log(`  timestampMS (时间戳): ${data.timestampMS} ms`);
  if (data.currentRaceTime !== undefined) {
    console.log(`  currentRaceTime (当前比赛时间): ${data.currentRaceTime?.toFixed(3)} s`);
    console.log(`  currentLap (当前圈用时): ${data.currentLap?.toFixed(3)} s`);
    console.log(`  lastLap (上一圈用时): ${data.lastLap?.toFixed(3)} s`);
    console.log(`  bestLap (最快圈速): ${data.bestLap?.toFixed(3)} s`);
    console.log(`  lapNumber (当前圈数): ${data.lapNumber}`);
    console.log(`  racePosition (比赛排名): ${data.racePosition}`);
  }

  console.log('\n【 2. 动力系统参数 (Engine & Drivetrain) 】');
  console.log(`  engineMaxRpm (最大转速): ${data.engineMaxRpm?.toFixed(0)} RPM`);
  console.log(`  engineIdleRpm (怠速转速): ${data.engineIdleRpm?.toFixed(0)} RPM`);
  console.log(`  currentEngineRpm (当前转速): ${data.currentEngineRpm?.toFixed(0)} RPM`);
  if (data.powerWatts !== undefined) {
    console.log(`  powerWatts (引擎功率): ${data.powerWatts?.toFixed(0)} W (${(data.powerHP)?.toFixed(0)} HP)`);
    console.log(`  torque (扭矩): ${data.torque?.toFixed(1)} Nm`);
    console.log(`  boost (增压值): ${data.boost?.toFixed(2)}`);
    console.log(`  fuel (燃油比例): ${(data.fuel * 100)?.toFixed(1)}%`);
  }
  console.log(`  car.ordinal (车辆ID): ${data.car?.ordinal}`);
  console.log(`  car.class (车辆等级): ${data.car?.class} (PI: ${data.car?.performanceIndex})`);
  console.log(`  car.drivetrainType (驱动类型): ${data.car?.drivetrainType} (0=FWD, 1=RWD, 2=AWD)`);
  console.log(`  car.numCylinders (气缸数): ${data.car?.numCylinders}`);

  console.log('\n【 3. 操控输入与辅助 (Controls & Inputs) 】');
  if (data.controls) {
    console.log(`  accel (油门): ${data.controls.accel} (0-255) -> ${((data.controls.accel / 255) * 100).toFixed(0)}%`);
    console.log(`  brake (刹车): ${data.controls.brake} (0-255) -> ${((data.controls.brake / 255) * 100).toFixed(0)}%`);
    console.log(`  clutch (离合): ${data.controls.clutch} (0-255) -> ${((data.controls.clutch / 255) * 100).toFixed(0)}%`);
    console.log(`  handBrake (手刹): ${data.controls.handBrake} (0-255) -> ${((data.controls.handBrake / 255) * 100).toFixed(0)}%`);
    console.log(`  gear (档位): ${data.controls.gear} (0=R, 1=N, 2=D1...)`);
    console.log(`  steer (方向盘转向): ${data.controls.steer} (-128到+127) -> ${((data.controls.steer / 127) * 100).toFixed(0)}%`);
  } else {
    console.log('  [提示] 当前数据包不含操控输入数据 (可能长度 < 323 字节)');
  }
  if (data.drivingLine !== undefined) {
    console.log(`  drivingLine (走线偏差): ${data.drivingLine}`);
    console.log(`  aiBrakeDiff (AI刹车差值): ${data.aiBrakeDiff}`);
  }

  console.log('\n【 4. 车辆动力学与运动 (Dynamics & Motion) 】');
  console.log(`  speedKmh (速度): ${data.speedKmh?.toFixed(1)} km/h (${data.speedMs?.toFixed(1)} m/s)`);
  console.log(`  acceleration (G力) -> X(横向): ${data.acceleration?.x?.toFixed(2)}G | Y(垂直): ${data.acceleration?.y?.toFixed(2)}G | Z(纵向): ${data.acceleration?.z?.toFixed(2)}G`);
  console.log(`  velocity (速度矢量) -> X: ${data.velocity?.x?.toFixed(2)}m/s | Y: ${data.velocity?.y?.toFixed(2)}m/s | Z: ${data.velocity?.z?.toFixed(2)}m/s`);
  console.log(`  angularVelocity (角速度) -> X(俯仰): ${data.angularVelocity?.x?.toFixed(2)} | Y(偏航): ${data.angularVelocity?.y?.toFixed(2)} | Z(侧倾): ${data.angularVelocity?.z?.toFixed(2)}`);
  console.log(`  orientation (角度) -> yaw(偏航): ${data.yaw?.toFixed(2)}rad | pitch(俯仰): ${data.pitch?.toFixed(2)}rad | roll(侧倾): ${data.roll?.toFixed(2)}rad`);
  if (data.position) {
    console.log(`  position (世界坐标) -> X: ${data.position.x?.toFixed(2)}m | Y: ${data.position.y?.toFixed(2)}m | Z: ${data.position.z?.toFixed(2)}m`);
    console.log(`  distanceTraveled (行驶总距离): ${data.distanceTraveled?.toFixed(1)} m`);
  }

  console.log('\n【 5. 悬挂系统 】');
  console.log(`  suspensionTravel (悬挂绝对行程-米):`);
  console.log(`    FL (前左): ${data.suspensionTravelMeters?.frontLeft?.toFixed(4)}m | FR (前右): ${data.suspensionTravelMeters?.frontRight?.toFixed(4)}m`);
  console.log(`    RL (后左): ${data.suspensionTravelMeters?.rearLeft?.toFixed(4)}m | RR (后右): ${data.suspensionTravelMeters?.rearRight?.toFixed(4)}m`);
  console.log(`  normalizedSuspensionTravel (归一化悬挂行程 0-1):`);
  console.log(`    FL (前左): ${data.suspension?.frontLeft?.toFixed(4)} | FR (前右): ${data.suspension?.frontRight?.toFixed(4)}`);
  console.log(`    RL (后左): ${data.suspension?.rearLeft?.toFixed(4)} | RR (后右): ${data.suspension?.rearRight?.toFixed(4)}`);

  console.log('\n【 6. 轮胎与路面状态 (Tires & Road) 】');
  if (data.tireTemp) {
    console.log(`  tireTemp (轮胎温度-°F):`);
    console.log(`    FL: ${data.tireTemp.frontLeft?.toFixed(1)}°F (${((data.tireTemp.frontLeft-32)*5/9).toFixed(1)}°C) | FR: ${data.tireTemp.frontRight?.toFixed(1)}°F (${((data.tireTemp.frontRight-32)*5/9).toFixed(1)}°C)`);
    console.log(`    RL: ${data.tireTemp.rearLeft?.toFixed(1)}°F (${((data.tireTemp.rearLeft-32)*5/9).toFixed(1)}°C) | RR: ${data.tireTemp.rearRight?.toFixed(1)}°F (${((data.tireTemp.rearRight-32)*5/9).toFixed(1)}°C)`);
  }
  console.log(`  tireSlipRatio (纵向滑移率):`);
  console.log(`    FL: ${data.tireSlipRatio?.frontLeft?.toFixed(4)} | FR: ${data.tireSlipRatio?.frontRight?.toFixed(4)}`);
  console.log(`    RL: ${data.tireSlipRatio?.rearLeft?.toFixed(4)} | RR: ${data.tireSlipRatio?.rearRight?.toFixed(4)}`);
  console.log(`  tireSlipAngle (侧偏角):`);
  console.log(`    FL: ${data.tireSlipAngle?.frontLeft?.toFixed(4)} | FR: ${data.tireSlipAngle?.frontRight?.toFixed(4)}`);
  console.log(`    RL: ${data.tireSlipAngle?.rearLeft?.toFixed(4)} | RR: ${data.tireSlipAngle?.rearRight?.toFixed(4)}`);
  console.log(`  tireCombinedSlip (综合滑移值):`);
  console.log(`    FL: ${data.tireCombinedSlip?.frontLeft?.toFixed(4)} | FR: ${data.tireCombinedSlip?.frontRight?.toFixed(4)}`);
  console.log(`    RL: ${data.tireCombinedSlip?.rearLeft?.toFixed(4)} | RR: ${data.tireCombinedSlip?.rearRight?.toFixed(4)}`);
  console.log(`  wheelRotationSpeed (车轮转速-rad/s):`);
  console.log(`    FL: ${data.wheelRotationSpeed?.frontLeft?.toFixed(1)} | FR: ${data.wheelRotationSpeed?.frontRight?.toFixed(1)}`);
  console.log(`    RL: ${data.wheelRotationSpeed?.rearLeft?.toFixed(1)} | RR: ${data.wheelRotationSpeed?.rearRight?.toFixed(1)}`);
  console.log(`  onRumbleStrip (是否压在路肩上):`);
  console.log(`    FL: ${data.onRumbleStrip?.frontLeft} | FR: ${data.onRumbleStrip?.frontRight}`);
  console.log(`    RL: ${data.onRumbleStrip?.rearLeft} | RR: ${data.onRumbleStrip?.rearRight}`);
  console.log(`  puddleDepth (水坑深度):`);
  console.log(`    FL: ${data.puddleDepth?.frontLeft?.toFixed(2)} | FR: ${data.puddleDepth?.frontRight?.toFixed(2)}`);
  console.log(`    RL: ${data.puddleDepth?.rearLeft?.toFixed(2)} | RR: ${data.puddleDepth?.rearRight?.toFixed(2)}`);
  console.log(`  surfaceRumble (路面震动强度):`);
  console.log(`    FL: ${data.surfaceRumble?.frontLeft?.toFixed(2)} | FR: ${data.surfaceRumble?.frontRight?.toFixed(2)}`);
  console.log(`    RL: ${data.surfaceRumble?.rearLeft?.toFixed(2)} | RR: ${data.surfaceRumble?.rearRight?.toFixed(2)}`);
}

function printStandardDictionary() {
  console.log(`
这里为您整理了地平线 5 (Forza Horizon 5) UDP 完整的数据格式字典。
数据类型约定:
- f32: float32 (单精度浮点数，4 字节)
- s32: int32 (带符号 32 位整型，4 字节)
- u32: uint32 (无符号 32 位整型，4 字节)
- u16: uint16 (无符号 16 位整型，2 字节)
- u8:  uint8 (无符号 8 位整型，1 字节)
- s8:  int8 (带符号 8 位整型，1 字节)

--------------------------------------------------------------------------------
【分类字典 1: SLED 基础数据区域 (偏移量 0 - 231 字节，共 232 字节)】
--------------------------------------------------------------------------------
1. 比赛与时间:
   - isRaceOn: 偏移 0 (s32) - 1表示比赛中/驾驶中，0表示菜单或暂停
   - timestampMS: 偏移 4 (u32) - 游戏时间戳(毫秒)

2. 引擎参数:
   - engineMaxRpm: 偏移 8 (f32) - 引擎最大转速
   - engineIdleRpm: 偏移 12 (f32) - 引擎怠速转速
   - currentEngineRpm: 偏移 16 (f32) - 当前引擎转速

3. 动力学 G力 (已乘以重力常数以G为单位，或原始m/s²):
   - accelerationX: 偏移 20 (f32) - 横向加速度 (左转为负，右转为正)
   - accelerationY: 偏移 24 (f32) - 垂直加速度 (向下为负，向上为正)
   - accelerationZ: 偏移 28 (f32) - 纵向加速度 (刹车为负，加速为正)

4. 速度矢量 (m/s):
   - velocityX: 偏移 32 (f32) - 右向速度
   - velocityY: 偏移 36 (f32) - 向上速度
   - velocityZ: 偏移 40 (f32) - 前向速度

5. 角速度 (rad/s):
   - angularVelocityX: 偏移 44 (f32) - 俯仰率
   - angularVelocityY: 偏移 48 (f32) - 偏航率
   - angularVelocityZ: 偏移 52 (f32) - 侧倾率

6. 车辆姿态 (弧度 rad):
   - yaw: 偏移 56 (f32) - 偏航角
   - pitch: 偏移 60 (f32) - 俯仰角
   - roll: 偏移 64 (f32) - 侧倾角

7. 悬挂与轮胎 (按照 FL, FR, RL, RR 顺序排列):
   - 归一化悬挂行程 (0.0=最压缩, 1.0=最伸展):
     - normalizedSuspensionTravelFrontLeft:  偏移 68 (f32)
     - normalizedSuspensionTravelFrontRight: 偏移 72 (f32)
     - normalizedSuspensionTravelRearLeft:   偏移 76 (f32)
     - normalizedSuspensionTravelRearRight:  偏移 80 (f32)
   - 轮胎纵向滑移率 (0=无滑移，>0=加速打滑，<0=制动抱死):
     - tireSlipRatioFrontLeft:   偏移 84 (f32)
     - tireSlipRatioFrontRight:  偏移 88 (f32)
     - tireSlipRatioRearLeft:    偏移 92 (f32)
     - tireSlipRatioRearRight:   偏移 96 (f32)
   - 车轮旋转速度 (rad/s):
     - wheelRotationSpeedFrontLeft:   偏移 100 (f32)
     - wheelRotationSpeedFrontRight:  偏移 104 (f32)
     - wheelRotationSpeedRearLeft:    偏移 108 (f32)
     - wheelRotationSpeedRearRight:   偏移 112 (f32)
   - 压路肩指示 (1=压在路肩上, 0=未压):
     - wheelOnRumbleStripFrontLeft:   偏移 116 (s32)
     - wheelOnRumbleStripFrontRight:  偏移 120 (s32)
     - wheelOnRumbleStripRearLeft:    偏移 124 (s32)
     - wheelOnRumbleStripRearRight:   偏移 128 (s32)
   - 积水深度 (0.0=干燥, 1.0=深水):
     - wheelInPuddleDepthFrontLeft:   偏移 132 (f32)
     - wheelInPuddleDepthFrontRight:  偏移 136 (f32)
     - wheelInPuddleDepthRearLeft:    偏移 140 (f32)
     - wheelInPuddleDepthRearRight:   偏移 144 (f32)
   - 路面震动反馈:
     - surfaceRumbleFrontLeft:   偏移 148 (f32)
     - surfaceRumbleFrontRight:  偏移 152 (f32)
     - surfaceRumbleRearLeft:    偏移 156 (f32)
     - surfaceRumbleRearRight:   偏移 160 (f32)
   - 轮胎侧滑偏角 (弧度/度):
     - tireSlipAngleFrontLeft:   偏移 164 (f32)
     - tireSlipAngleFrontRight:  偏移 168 (f32)
     - tireSlipAngleRearLeft:    偏移 172 (f32)
     - tireSlipAngleRearRight:   偏移 176 (f32)
   - 轮胎综合滑移值 (0.0到1.0以上，反映抓地力极限):
     - tireCombinedSlipFrontLeft:  偏移 180 (f32)
     - tireCombinedSlipFrontRight: 偏移 184 (f32)
     - tireCombinedSlipRearLeft:   偏移 188 (f32)
     - tireCombinedSlipRearRight:  偏移 192 (f32)
   - 悬挂悬挂位移绝对值 (米 m):
     - suspensionTravelMetersFrontLeft:  偏移 196 (f32)
     - suspensionTravelMetersFrontRight: 偏移 200 (f32)
     - suspensionTravelMetersRearLeft:   偏移 204 (f32)
     - suspensionTravelMetersRearRight:  偏移 208 (f32)

8. 车辆基本配置:
   - carOrdinal: 偏移 212 (s32) - 车辆数据库ID
   - carClass: 偏移 216 (s32) - 车辆等级 (0=D, 1=C, 2=B, 3=A, 4=S1, 5=S2, 6=X)
   - carPerformanceIndex: 偏移 220 (s32) - 车辆性能PI值 (如 798)
   - drivetrainType: 偏移 224 (s32) - 驱动类型 (0=FWD, 1=RWD, 2=AWD)
   - numCylinders: 偏移 228 (s32) - 引擎气缸数

--------------------------------------------------------------------------------
【占位填充区域 (偏移量 232 - 243 字节，共 12 字节)】
--------------------------------------------------------------------------------
- FH6 Gap: FH5 格式比标准 Forza Motorsport 多了这 12 字节的空数据。

--------------------------------------------------------------------------------
【分类字典 2: Dash 扩展高级数据区域 (偏移量 244 字节之后，通常总长度为 324 或 332 字节)】
--------------------------------------------------------------------------------
1. 三维世界位置坐标 (米 m):
   - positionX: 偏移 244 (f32) - 世界坐标 X (东/西)
   - positionY: 偏移 248 (f32) - 世界坐标 Y (高度)
   - positionZ: 偏移 252 (f32) - 世界坐标 Z (南/北)

2. 动力与速度:
   - speed: 偏移 256 (f32) - 实时速度 (m/s，乘以 3.6 转换为 km/h)
   - power: 偏移 260 (f32) - 实时功率 (W瓦特，除以 745.7 转换为 匹马力HP)
   - torque: 偏移 264 (f32) - 实时扭矩

3. 轮胎温度 (华氏度 °F):
   - tireTempFrontLeft:  偏移 268 (f32)
   - tireTempFrontRight: 偏移 272 (f32)
   - tireTempRearLeft:   偏移 276 (f32)
   - tireTempRearRight:  偏移 280 (f32)

4. 辅助状态:
   - boost: 偏移 284 (f32) - 涡轮增压压力
   - fuel: 偏移 288 (f32) - 剩余燃油百分比 (0.0 到 1.0)
   - distanceTraveled: 偏移 292 (f32) - 本局累计行驶距离 (米 m)

5. 计时与圈速 (秒 s):
   - bestLap: 偏移 296 (f32) - 最快圈速
   - lastLap: 偏移 300 (f32) - 上一圈速
   - currentLap: 偏移 304 (f32) - 当前圈已用时
   - currentRaceTime: 偏移 308 (f32) - 比赛总时间

6. 比赛名次与圈数:
   - lapNumber: 偏移 312 (u16) - 当前圈数 (0开始，1代表第2圈)
   - racePosition: 偏移 314 (u8) - 比赛名次 (1-24)

7. 驾驶员物理输入控制 (踏板为 0-255):
   - accel: 偏移 315 (u8) - 油门深度 (0=松开, 255=踩满)
   - brake: 偏移 316 (u8) - 刹车深度 (0=松开, 255=踩满)
   - clutch: 偏移 317 (u8) - 离合深度 (0=接合, 255=踩满)
   - handBrake: 偏移 318 (u8) - 手刹深度 (0=松开, 255=拉满)
   - gear: 偏移 319 (u8) - 当前挡位 (0=倒挡R, 1=空挡N, 2=1档, 3=2档...)
   - steer: 偏移 320 (s8) - 转向角度 (-128代表最左, 0代表居中, 127代表最右)

8. 游戏辅助系统:
   - normalizedDrivingLine: 偏移 321 (s8) - 走线偏差
   - normalizedAIBrakeDifference: 偏移 322 (s8) - AI刹车指示
`);
}
