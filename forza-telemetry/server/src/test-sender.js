import dgram from 'dgram';

const PORT = 9996;
const HOST = '127.0.0.1';

const client = dgram.createSocket('udp4');

// Create a simulated telemetry packet (332 bytes)
function createTestPacket() {
  const buffer = Buffer.alloc(332);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;

  // isRaceOn (s32)
  view.setInt32(offset, 1, true); offset += 4;

  // timestampMS (u32)
  view.setUint32(offset, Date.now() % 1000000, true); offset += 4;

  // Engine RPM
  view.setFloat32(offset, 8000, true); offset += 4;  // maxRpm
  view.setFloat32(offset, 800, true); offset += 4;   // idleRpm
  view.setFloat32(offset, 4500, true); offset += 4;  // currentRpm

  // Acceleration (G-force, 1G = 1.0)
  view.setFloat32(offset, 0.1, true); offset += 4;   // accelX
  view.setFloat32(offset, 1.0, true); offset += 4;   // accelY (gravity = 1G)
  view.setFloat32(offset, 0.0, true); offset += 4;   // accelZ

  // Velocity (m/s)
  view.setFloat32(offset, 0.0, true); offset += 4;   // velX (横向)
  view.setFloat32(offset, 0.0, true); offset += 4;   // velY (垂直)
  view.setFloat32(offset, 30.0, true); offset += 4;  // velZ (纵向/前进)

  // Angular velocity
  view.setFloat32(offset, 0.0, true); offset += 4;
  view.setFloat32(offset, 0.0, true); offset += 4;
  view.setFloat32(offset, 0.0, true); offset += 4;

  // Yaw, Pitch, Roll
  view.setFloat32(offset, 1.57, true); offset += 4;  // yaw
  view.setFloat32(offset, 0.0, true); offset += 4;   // pitch
  view.setFloat32(offset, 0.0, true); offset += 4;   // roll

  // Suspension (normalized 0-1)
  view.setFloat32(offset, 0.5, true); offset += 4;   // FL
  view.setFloat32(offset, 0.5, true); offset += 4;   // FR
  view.setFloat32(offset, 0.5, true); offset += 4;   // RL
  view.setFloat32(offset, 0.5, true); offset += 4;   // RR

  // Tire slip ratio
  view.setFloat32(offset, 0.05, true); offset += 4;  // FL
  view.setFloat32(offset, 0.05, true); offset += 4;  // FR
  view.setFloat32(offset, 0.02, true); offset += 4;  // RL
  view.setFloat32(offset, 0.02, true); offset += 4;  // RR

  // Wheel rotation speed
  view.setFloat32(offset, 50.0, true); offset += 4;  // FL
  view.setFloat32(offset, 50.0, true); offset += 4;  // FR
  view.setFloat32(offset, 50.0, true); offset += 4;  // RL
  view.setFloat32(offset, 50.0, true); offset += 4;  // RR

  // Rumble strip
  view.setInt32(offset, 0, true); offset += 4;  // FL
  view.setInt32(offset, 0, true); offset += 4;  // FR
  view.setInt32(offset, 0, true); offset += 4;  // RL
  view.setInt32(offset, 0, true); offset += 4;  // RR

  // Puddle depth
  view.setFloat32(offset, 0, true); offset += 4;    // FL
  view.setFloat32(offset, 0, true); offset += 4;    // FR
  view.setFloat32(offset, 0, true); offset += 4;    // RL
  view.setFloat32(offset, 0, true); offset += 4;    // RR

  // Surface rumble
  view.setFloat32(offset, 0.3, true); offset += 4;  // FL
  view.setFloat32(offset, 0.3, true); offset += 4;  // FR
  view.setFloat32(offset, 0.3, true); offset += 4;  // RL
  view.setFloat32(offset, 0.3, true); offset += 4;  // RR

  // Tire slip angle
  view.setFloat32(offset, 2.0, true); offset += 4;  // FL
  view.setFloat32(offset, 2.0, true); offset += 4;  // FR
  view.setFloat32(offset, 1.0, true); offset += 4;  // RL
  view.setFloat32(offset, 1.0, true); offset += 4;  // RR

  // Tire combined slip
  view.setFloat32(offset, 0.3, true); offset += 4;  // FL
  view.setFloat32(offset, 0.3, true); offset += 4;  // FR
  view.setFloat32(offset, 0.2, true); offset += 4;  // RL
  view.setFloat32(offset, 0.2, true); offset += 4;  // RR

  // Suspension travel meters
  view.setFloat32(offset, 0.03, true); offset += 4;  // FL
  view.setFloat32(offset, 0.03, true); offset += 4;  // FR
  view.setFloat32(offset, 0.03, true); offset += 4;  // RL
  view.setFloat32(offset, 0.03, true); offset += 4;  // RR

  // Car info
  view.setInt32(offset, 1234, true); offset += 4;    // carOrdinal
  view.setInt32(offset, 3, true); offset += 4;       // carClass (A)
  view.setInt32(offset, 750, true); offset += 4;     // performanceIndex
  view.setInt32(offset, 2, true); offset += 4;       // drivetrainType (AWD)
  view.setInt32(offset, 8, true); offset += 4;       // numCylinders

  // Horizon placeholder (12 bytes)
  offset += 12;

  // Position
  view.setFloat32(offset, 100.0, true); offset += 4;  // X
  view.setFloat32(offset, 0.0, true); offset += 4;    // Y
  view.setFloat32(offset, 200.0, true); offset += 4;  // Z

  // Speed, Power, Torque
  view.setFloat32(offset, 30.0, true); offset += 4;   // speed (m/s)
  view.setFloat32(offset, 200000, true); offset += 4;  // power (watts)
  view.setFloat32(offset, 400, true); offset += 4;     // torque

  // Tire temp
  view.setFloat32(offset, 85.0, true); offset += 4;   // FL
  view.setFloat32(offset, 85.0, true); offset += 4;   // FR
  view.setFloat32(offset, 80.0, true); offset += 4;   // RL
  view.setFloat32(offset, 80.0, true); offset += 4;   // RR

  // Boost and fuel
  view.setFloat32(offset, 1.5, true); offset += 4;    // boost
  view.setFloat32(offset, 0.75, true); offset += 4;   // fuel

  // Distance
  view.setFloat32(offset, 5000, true); offset += 4;   // distance

  // Lap times
  view.setFloat32(offset, 65.123, true); offset += 4;   // bestLap = 65.123秒
  view.setFloat32(offset, 67.456, true); offset += 4;   // lastLap = 67.456秒
  view.setFloat32(offset, 15.5, true); offset += 4;     // currentLap = 15.5秒
  view.setFloat32(offset, 15.5, true); offset += 4;     // currentRaceTime = 15.5秒

  // Lap number (u16)
  view.setUint16(offset, 1, true); offset += 2;

  // Race position (u8)
  view.setUint8(offset, 3); offset += 1;

  // Controls
  view.setUint8(offset, 180); offset += 1;   // accel
  view.setUint8(offset, 0); offset += 1;     // brake
  view.setUint8(offset, 0); offset += 1;     // clutch
  view.setUint8(offset, 0); offset += 1;     // handBrake
  view.setUint8(offset, 4); offset += 1;     // gear
  view.setInt8(offset, 10); offset += 1;    // steer

  // Driving line
  view.setUint8(offset, 0); offset += 1;     // normalizedDrivingLine
  view.setUint8(offset, 0); offset += 1;     // normalizedAIBrakeDifference

  return buffer;
}

// Send test packets
let count = 0;
const interval = setInterval(() => {
  const packet = createTestPacket();
  client.send(packet, 0, packet.length, PORT, HOST, (err) => {
    if (err) {
      console.error('Error sending:', err);
    } else {
      count++;
      if (count % 100 === 0) {
        console.log(`Sent ${count} packets`);
      }
    }
  });
}, 16); // ~60fps

console.log(`Sending test UDP packets to ${HOST}:${PORT}...`);
console.log('Press Ctrl+C to stop');

process.on('SIGINT', () => {
  clearInterval(interval);
  client.close();
  console.log(`\nStopped after sending ${count} packets`);
  process.exit(0);
});
