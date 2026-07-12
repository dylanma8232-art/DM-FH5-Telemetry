// Forza Horizon 5 UDP Telemetry Parser
// Based on fh6-tcu-transformer project's packet layout
// Packet size: 324 bytes (Forzatar format with FH6 gap)

const SCHEMA = [
  // SLED format (232 bytes): basic vehicle dynamics
  { path: ['isRaceOn'], type: 's32', offset: 0, t: v => v === 1 },
  { path: ['timestampMS'], type: 'u32', offset: 4 },
  { path: ['engineMaxRpm'], type: 'f32', offset: 8 },
  { path: ['engineIdleRpm'], type: 'f32', offset: 12 },
  { path: ['currentEngineRpm'], type: 'f32', offset: 16 },
  { path: ['acceleration', 'x'], type: 'f32', offset: 20 },
  { path: ['acceleration', 'y'], type: 'f32', offset: 24 },
  { path: ['acceleration', 'z'], type: 'f32', offset: 28 },
  { path: ['velocity', 'x'], type: 'f32', offset: 32 },
  { path: ['velocity', 'y'], type: 'f32', offset: 36 },
  { path: ['velocity', 'z'], type: 'f32', offset: 40 },
  { path: ['angularVelocity', 'x'], type: 'f32', offset: 44 },
  { path: ['angularVelocity', 'y'], type: 'f32', offset: 48 },
  { path: ['angularVelocity', 'z'], type: 'f32', offset: 52 },
  { path: ['yaw'], type: 'f32', offset: 56 },
  { path: ['pitch'], type: 'f32', offset: 60 },
  { path: ['roll'], type: 'f32', offset: 64 },
  { path: ['suspension', 'frontLeft'], type: 'f32', offset: 68 },
  { path: ['suspension', 'frontRight'], type: 'f32', offset: 72 },
  { path: ['suspension', 'rearLeft'], type: 'f32', offset: 76 },
  { path: ['suspension', 'rearRight'], type: 'f32', offset: 80 },
  { path: ['tireSlipRatio', 'frontLeft'], type: 'f32', offset: 84 },
  { path: ['tireSlipRatio', 'frontRight'], type: 'f32', offset: 88 },
  { path: ['tireSlipRatio', 'rearLeft'], type: 'f32', offset: 92 },
  { path: ['tireSlipRatio', 'rearRight'], type: 'f32', offset: 96 },
  { path: ['wheelRotationSpeed', 'frontLeft'], type: 'f32', offset: 100 },
  { path: ['wheelRotationSpeed', 'frontRight'], type: 'f32', offset: 104 },
  { path: ['wheelRotationSpeed', 'rearLeft'], type: 'f32', offset: 108 },
  { path: ['wheelRotationSpeed', 'rearRight'], type: 'f32', offset: 112 },
  { path: ['onRumbleStrip', 'frontLeft'], type: 's32', offset: 116, t: v => v === 1 },
  { path: ['onRumbleStrip', 'frontRight'], type: 's32', offset: 120, t: v => v === 1 },
  { path: ['onRumbleStrip', 'rearLeft'], type: 's32', offset: 124, t: v => v === 1 },
  { path: ['onRumbleStrip', 'rearRight'], type: 's32', offset: 128, t: v => v === 1 },
  { path: ['puddleDepth', 'frontLeft'], type: 'f32', offset: 132 },
  { path: ['puddleDepth', 'frontRight'], type: 'f32', offset: 136 },
  { path: ['puddleDepth', 'rearLeft'], type: 'f32', offset: 140 },
  { path: ['puddleDepth', 'rearRight'], type: 'f32', offset: 144 },
  { path: ['surfaceRumble', 'frontLeft'], type: 'f32', offset: 148 },
  { path: ['surfaceRumble', 'frontRight'], type: 'f32', offset: 152 },
  { path: ['surfaceRumble', 'rearLeft'], type: 'f32', offset: 156 },
  { path: ['surfaceRumble', 'rearRight'], type: 'f32', offset: 160 },
  { path: ['tireSlipAngle', 'frontLeft'], type: 'f32', offset: 164 },
  { path: ['tireSlipAngle', 'frontRight'], type: 'f32', offset: 168 },
  { path: ['tireSlipAngle', 'rearLeft'], type: 'f32', offset: 172 },
  { path: ['tireSlipAngle', 'rearRight'], type: 'f32', offset: 176 },
  { path: ['tireCombinedSlip', 'frontLeft'], type: 'f32', offset: 180 },
  { path: ['tireCombinedSlip', 'frontRight'], type: 'f32', offset: 184 },
  { path: ['tireCombinedSlip', 'rearLeft'], type: 'f32', offset: 188 },
  { path: ['tireCombinedSlip', 'rearRight'], type: 'f32', offset: 192 },
  { path: ['suspensionTravelMeters', 'frontLeft'], type: 'f32', offset: 196 },
  { path: ['suspensionTravelMeters', 'frontRight'], type: 'f32', offset: 200 },
  { path: ['suspensionTravelMeters', 'rearLeft'], type: 'f32', offset: 204 },
  { path: ['suspensionTravelMeters', 'rearRight'], type: 'f32', offset: 208 },
  { path: ['car', 'ordinal'], type: 's32', offset: 212 },
  { path: ['car', 'class'], type: 's32', offset: 216 },
  { path: ['car', 'performanceIndex'], type: 's32', offset: 220 },
  { path: ['car', 'drivetrainType'], type: 's32', offset: 224 },
  { path: ['car', 'numCylinders'], type: 's32', offset: 228 },

  // FH6 gap: 12 bytes (232-243)
  
  // Dash extension (79 bytes, starting at offset 244)
  { path: ['position', 'x'], type: 'f32', offset: 244 },
  { path: ['position', 'y'], type: 'f32', offset: 248 },
  { path: ['position', 'z'], type: 'f32', offset: 252 },
  { path: ['speedMs'], type: 'f32', offset: 256 },
  { path: ['powerWatts'], type: 'f32', offset: 260 },
  { path: ['torque'], type: 'f32', offset: 264 },
  { path: ['tireTemp', 'frontLeft'], type: 'f32', offset: 268 },
  { path: ['tireTemp', 'frontRight'], type: 'f32', offset: 272 },
  { path: ['tireTemp', 'rearLeft'], type: 'f32', offset: 276 },
  { path: ['tireTemp', 'rearRight'], type: 'f32', offset: 280 },
  { path: ['boost'], type: 'f32', offset: 284 },
  { path: ['fuel'], type: 'f32', offset: 288 },
  { path: ['distanceTraveled'], type: 'f32', offset: 292 },
  { path: ['bestLap'], type: 'f32', offset: 296 },
  { path: ['lastLap'], type: 'f32', offset: 300 },
  { path: ['currentLap'], type: 'f32', offset: 304 },
  { path: ['currentRaceTime'], type: 'f32', offset: 308 },
  { path: ['lapNumber'], type: 'u16', offset: 312 },
  { path: ['racePosition'], type: 'u8', offset: 314 },
  { path: ['controls', 'accel'], type: 'u8', offset: 315 },
  { path: ['controls', 'brake'], type: 'u8', offset: 316 },
  { path: ['controls', 'clutch'], type: 'u8', offset: 317 },
  { path: ['controls', 'handBrake'], type: 'u8', offset: 318 },
  { path: ['controls', 'gear'], type: 'u8', offset: 319 },
  { path: ['controls', 'steer'], type: 's8', offset: 320 },
  { path: ['drivingLine'], type: 's8', offset: 321 },
  { path: ['aiBrakeDiff'], type: 's8', offset: 322 }
];

export function parseTelemetryPacket(buffer) {
  if (buffer.length < 232) return null;
  const view = buffer instanceof DataView ? buffer : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const readers = {
    f32: (o) => o + 4 <= buffer.length ? view.getFloat32(o, true) : 0,
    s32: (o) => o + 4 <= buffer.length ? view.getInt32(o, true) : 0,
    u32: (o) => o + 4 <= buffer.length ? view.getUint32(o, true) : 0,
    u16: (o) => o + 2 <= buffer.length ? view.getUint16(o, true) : 0,
    u8:  (o) => o + 1 <= buffer.length ? view.getUint8(o) : 0,
    s8:  (o) => {
      if (o + 1 > buffer.length) return 0;
      const v = view.getUint8(o);
      return v > 127 ? v - 256 : v;
    }
  };

  const data = {};

  for (let i = 0; i < SCHEMA.length; i++) {
    const field = SCHEMA[i];
    let val = readers[field.type](field.offset);
    if (field.t) val = field.t(val);

    const path = field.path;
    if (path.length === 1) {
      data[path[0]] = val;
    } else {
      if (!data[path[0]]) data[path[0]] = {};
      data[path[0]][path[1]] = val;
    }
  }

  // Dependent computations
  if (data.speedMs !== undefined) {
    data.speedKmh = data.speedMs * 3.6;
    data.speedMph = data.speedMs * 2.23694;
  }
  if (data.powerWatts !== undefined) {
    data.powerHP = data.powerWatts / 745.7;
  }

  return data;
}

export const CAR_CLASSES = { 0: 'D', 1: 'C', 2: 'B', 3: 'A', 4: 'S1', 5: 'S2', 6: 'X' };
export const DRIVETRAIN_TYPES = { 0: 'FWD', 1: 'RWD', 2: 'AWD' };
export default { parseTelemetryPacket, CAR_CLASSES, DRIVETRAIN_TYPES };
