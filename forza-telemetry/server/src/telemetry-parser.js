// Forza Horizon 5 UDP Telemetry Parser
// Based on fh6-tcu-transformer project's packet layout
// Packet size: 324 bytes (Forzatar format with FH6 gap)

// SLED format (232 bytes): basic vehicle dynamics
const SLED_OFFSETS = {
  isRaceOn: 0,              // s32
  timestampMS: 4,           // u32
  engineMaxRpm: 8,          // f32
  engineIdleRpm: 12,        // f32
  currentEngineRpm: 16,     // f32
  accelerationX: 20,        // f32
  accelerationY: 24,        // f32
  accelerationZ: 28,        // f32
  velocityX: 32,            // f32
  velocityY: 36,            // f32
  velocityZ: 40,            // f32
  angularVelocityX: 44,     // f32
  angularVelocityY: 48,     // f32
  angularVelocityZ: 52,     // f32
  yaw: 56,                  // f32
  pitch: 60,                // f32
  roll: 64,                 // f32
  normalizedSuspensionTravelFrontLeft: 68,   // f32
  normalizedSuspensionTravelFrontRight: 72,  // f32
  normalizedSuspensionTravelRearLeft: 76,    // f32
  normalizedSuspensionTravelRearRight: 80,   // f32
  tireSlipRatioFrontLeft: 84,    // f32
  tireSlipRatioFrontRight: 88,   // f32
  tireSlipRatioRearLeft: 92,     // f32
  tireSlipRatioRearRight: 96,    // f32
  wheelRotationSpeedFrontLeft: 100,   // f32
  wheelRotationSpeedFrontRight: 104,  // f32
  wheelRotationSpeedRearLeft: 108,    // f32
  wheelRotationSpeedRearRight: 112,   // f32
  wheelOnRumbleStripFrontLeft: 116,   // s32
  wheelOnRumbleStripFrontRight: 120,  // s32
  wheelOnRumbleStripRearLeft: 124,    // s32
  wheelOnRumbleStripRearRight: 128,   // s32
  wheelInPuddleDepthFrontLeft: 132,   // f32
  wheelInPuddleDepthFrontRight: 136,  // f32
  wheelInPuddleDepthRearLeft: 140,    // f32
  wheelInPuddleDepthRearRight: 144,   // f32
  surfaceRumbleFrontLeft: 148,   // f32
  surfaceRumbleFrontRight: 152,  // f32
  surfaceRumbleRearLeft: 156,    // f32
  surfaceRumbleRearRight: 160,   // f32
  tireSlipAngleFrontLeft: 164,   // f32
  tireSlipAngleFrontRight: 168,  // f32
  tireSlipAngleRearLeft: 172,    // f32
  tireSlipAngleRearRight: 176,   // f32
  tireCombinedSlipFrontLeft: 180,   // f32
  tireCombinedSlipFrontRight: 184,  // f32
  tireCombinedSlipRearLeft: 188,    // f32
  tireCombinedSlipRearRight: 192,   // f32
  suspensionTravelMetersFrontLeft: 196,   // f32
  suspensionTravelMetersFrontRight: 200,  // f32
  suspensionTravelMetersRearLeft: 204,    // f32
  suspensionTravelMetersRearRight: 208,   // f32
  carOrdinal: 212,          // s32
  carClass: 216,            // s32
  carPerformanceIndex: 220, // s32
  drivetrainType: 224,      // s32
  numCylinders: 228,        // s32
};

// FH6 gap: 12 bytes (232-243) - no data

// Dash extension (79 bytes, starting at offset 244)
// FH5格式：有12字节FH6间隙，Dash从244开始
const DASH_OFFSETS = {
  positionX: 244,           // f32
  positionY: 248,           // f32
  positionZ: 252,           // f32
  speed: 256,               // f32 - m/s
  power: 260,               // f32 - watts
  torque: 264,              // f32 - newton meters
  tireTempFrontLeft: 268,   // f32
  tireTempFrontRight: 272,  // f32
  tireTempRearLeft: 276,    // f32
  tireTempRearRight: 280,   // f32
  boost: 284,               // f32
  fuel: 288,                // f32 - normalized 0-1
  distanceTraveled: 292,    // f32
  bestLap: 296,             // f32 - seconds
  lastLap: 300,             // f32 - seconds
  currentLap: 304,          // f32 - seconds
  currentRaceTime: 308,     // f32 - seconds
  lapNumber: 312,           // u16
  racePosition: 314,        // u8
  accel: 315,               // u8
  brake: 316,               // u8
  clutch: 317,              // u8
  handBrake: 318,           // u8
  gear: 319,                // u8
  steer: 320,               // s8
  normalizedDrivingLine: 321,        // s8
  normalizedAIBrakeDifference: 322,  // s8
};

export function parseTelemetryPacket(buffer) {
  if (buffer.length < 232) {
    return null;
  }

  const view = buffer instanceof DataView ? buffer : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const readFloat = (offset) => {
    try {
      return view.getFloat32(offset, true); // little-endian
    } catch {
      return 0;
    }
  };

  const readInt32 = (offset) => {
    try {
      return view.getInt32(offset, true);
    } catch {
      return 0;
    }
  };

  const readUint32 = (offset) => {
    try {
      return view.getUint32(offset, true);
    } catch {
      return 0;
    }
  };

  const readUint16 = (offset) => {
    try {
      return view.getUint16(offset, true);
    } catch {
      return 0;
    }
  };

  const readUint8 = (offset) => {
    try {
      return view.getUint8(offset);
    } catch {
      return 0;
    }
  };

  const readInt8 = (offset) => {
    try {
      const val = view.getUint8(offset);
      return val > 127 ? val - 256 : val;
    } catch {
      return 0;
    }
  };

  // Parse SLED data
  const data = {
    // Race state
    isRaceOn: readInt32(SLED_OFFSETS.isRaceOn) === 1,
    timestampMS: readUint32(SLED_OFFSETS.timestampMS),

    // Engine
    engineMaxRpm: readFloat(SLED_OFFSETS.engineMaxRpm),
    engineIdleRpm: readFloat(SLED_OFFSETS.engineIdleRpm),
    currentEngineRpm: readFloat(SLED_OFFSETS.currentEngineRpm),

    // Acceleration (G-force) - FH5 直接以 G 为单位
    acceleration: {
      x: readFloat(SLED_OFFSETS.accelerationX),
      y: readFloat(SLED_OFFSETS.accelerationY),
      z: readFloat(SLED_OFFSETS.accelerationZ),
    },

    // Velocity (m/s)
    velocity: {
      x: readFloat(SLED_OFFSETS.velocityX),
      y: readFloat(SLED_OFFSETS.velocityY),
      z: readFloat(SLED_OFFSETS.velocityZ),
    },

    // Angular velocity
    angularVelocity: {
      x: readFloat(SLED_OFFSETS.angularVelocityX),
      y: readFloat(SLED_OFFSETS.angularVelocityY),
      z: readFloat(SLED_OFFSETS.angularVelocityZ),
    },

    // Orientation (radians)
    yaw: readFloat(SLED_OFFSETS.yaw),
    pitch: readFloat(SLED_OFFSETS.pitch),
    roll: readFloat(SLED_OFFSETS.roll),

    // Suspension
    suspension: {
      frontLeft: readFloat(SLED_OFFSETS.normalizedSuspensionTravelFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.normalizedSuspensionTravelFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.normalizedSuspensionTravelRearLeft),
      rearRight: readFloat(SLED_OFFSETS.normalizedSuspensionTravelRearRight),
    },

    // Tire slip ratio
    tireSlipRatio: {
      frontLeft: readFloat(SLED_OFFSETS.tireSlipRatioFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.tireSlipRatioFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.tireSlipRatioRearLeft),
      rearRight: readFloat(SLED_OFFSETS.tireSlipRatioRearRight),
    },

    // Wheel rotation speed
    wheelRotationSpeed: {
      frontLeft: readFloat(SLED_OFFSETS.wheelRotationSpeedFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.wheelRotationSpeedFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.wheelRotationSpeedRearLeft),
      rearRight: readFloat(SLED_OFFSETS.wheelRotationSpeedRearRight),
    },

    // Rumble strip
    onRumbleStrip: {
      frontLeft: readInt32(SLED_OFFSETS.wheelOnRumbleStripFrontLeft) === 1,
      frontRight: readInt32(SLED_OFFSETS.wheelOnRumbleStripFrontRight) === 1,
      rearLeft: readInt32(SLED_OFFSETS.wheelOnRumbleStripRearLeft) === 1,
      rearRight: readInt32(SLED_OFFSETS.wheelOnRumbleStripRearRight) === 1,
    },

    // Puddle depth
    puddleDepth: {
      frontLeft: readFloat(SLED_OFFSETS.wheelInPuddleDepthFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.wheelInPuddleDepthFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.wheelInPuddleDepthRearLeft),
      rearRight: readFloat(SLED_OFFSETS.wheelInPuddleDepthRearRight),
    },

    // Surface rumble
    surfaceRumble: {
      frontLeft: readFloat(SLED_OFFSETS.surfaceRumbleFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.surfaceRumbleFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.surfaceRumbleRearLeft),
      rearRight: readFloat(SLED_OFFSETS.surfaceRumbleRearRight),
    },

    // Tire slip angle
    tireSlipAngle: {
      frontLeft: readFloat(SLED_OFFSETS.tireSlipAngleFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.tireSlipAngleFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.tireSlipAngleRearLeft),
      rearRight: readFloat(SLED_OFFSETS.tireSlipAngleRearRight),
    },

    // Tire combined slip
    tireCombinedSlip: {
      frontLeft: readFloat(SLED_OFFSETS.tireCombinedSlipFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.tireCombinedSlipFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.tireCombinedSlipRearLeft),
      rearRight: readFloat(SLED_OFFSETS.tireCombinedSlipRearRight),
    },

    // Suspension travel meters
    suspensionTravelMeters: {
      frontLeft: readFloat(SLED_OFFSETS.suspensionTravelMetersFrontLeft),
      frontRight: readFloat(SLED_OFFSETS.suspensionTravelMetersFrontRight),
      rearLeft: readFloat(SLED_OFFSETS.suspensionTravelMetersRearLeft),
      rearRight: readFloat(SLED_OFFSETS.suspensionTravelMetersRearRight),
    },

    // Car info
    car: {
      ordinal: readInt32(SLED_OFFSETS.carOrdinal),
      class: readInt32(SLED_OFFSETS.carClass),
      performanceIndex: readInt32(SLED_OFFSETS.carPerformanceIndex),
      drivetrainType: readInt32(SLED_OFFSETS.drivetrainType),
      numCylinders: readInt32(SLED_OFFSETS.numCylinders),
    },
  };

  // Parse Dash extension (if available)
  // FH5格式：有12字节FH6间隙，Dash从244开始，需要至少323字节
  if (buffer.length >= 323) {
    data.position = {
      x: readFloat(DASH_OFFSETS.positionX),
      y: readFloat(DASH_OFFSETS.positionY),
      z: readFloat(DASH_OFFSETS.positionZ),
    };

    data.speedMs = readFloat(DASH_OFFSETS.speed);
    data.speedKmh = data.speedMs * 3.6;
    data.speedMph = data.speedMs * 2.23694;

    data.powerWatts = readFloat(DASH_OFFSETS.power);
    data.powerHP = data.powerWatts / 745.7;
    data.torque = readFloat(DASH_OFFSETS.torque);

    data.tireTemp = {
      frontLeft: readFloat(DASH_OFFSETS.tireTempFrontLeft),
      frontRight: readFloat(DASH_OFFSETS.tireTempFrontRight),
      rearLeft: readFloat(DASH_OFFSETS.tireTempRearLeft),
      rearRight: readFloat(DASH_OFFSETS.tireTempRearRight),
    };

    data.boost = readFloat(DASH_OFFSETS.boost);
    data.fuel = readFloat(DASH_OFFSETS.fuel);
    data.distanceTraveled = readFloat(DASH_OFFSETS.distanceTraveled);

    // Lap times (seconds)
    data.bestLap = readFloat(DASH_OFFSETS.bestLap);
    data.lastLap = readFloat(DASH_OFFSETS.lastLap);
    data.currentLap = readFloat(DASH_OFFSETS.currentLap);
    data.currentRaceTime = readFloat(DASH_OFFSETS.currentRaceTime);

    // Race info
    data.lapNumber = readUint16(DASH_OFFSETS.lapNumber);
    data.racePosition = readUint8(DASH_OFFSETS.racePosition);

    // Controls
    data.controls = {
      accel: readUint8(DASH_OFFSETS.accel),
      brake: readUint8(DASH_OFFSETS.brake),
      clutch: readUint8(DASH_OFFSETS.clutch),
      handBrake: readUint8(DASH_OFFSETS.handBrake),
      gear: readUint8(DASH_OFFSETS.gear),
      steer: readInt8(DASH_OFFSETS.steer),
    };

    // Driving line
    data.drivingLine = readInt8(DASH_OFFSETS.normalizedDrivingLine);
    data.aiBrakeDiff = readInt8(DASH_OFFSETS.normalizedAIBrakeDifference);
  }

  return data;
}

// Car class mapping
export const CAR_CLASSES = {
  0: 'D',
  1: 'C',
  2: 'B',
  3: 'A',
  4: 'S1',
  5: 'S2',
  6: 'X',
};

// Drivetrain type mapping
export const DRIVETRAIN_TYPES = {
  0: 'FWD',
  1: 'RWD',
  2: 'AWD',
};

export default { parseTelemetryPacket, CAR_CLASSES, DRIVETRAIN_TYPES };
