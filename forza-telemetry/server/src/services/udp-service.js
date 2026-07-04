import dgram from 'dgram';
import telemetryParser from '../telemetry-parser.js';

class UdpService {
  constructor() {
    this.socket = null;
    this.packetCount = 0;
    this.lastPacketTime = null;
    this.lastEmitTime = 0;
    this.isRecording = false;
  }

  start(port, onData, onError) {
    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('message', (msg) => {
      this.packetCount++;
      this.lastPacketTime = new Date();
      
      const now = Date.now();
      const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
      const isRaceOn = view.getInt32(0, true) === 1;

      if (this.isRecording || isRaceOn) {
        const telemetry = telemetryParser.parseTelemetryPacket(msg);
        if (telemetry) {
          telemetry._packetSize = msg.length;
          onData(telemetry);
        }
      } else {
        if (now - this.lastEmitTime >= 33) {
          const telemetry = telemetryParser.parseTelemetryPacket(msg);
          if (telemetry) {
            telemetry._packetSize = msg.length;
            onData(telemetry);
            this.lastEmitTime = now;
          }
        }
      }
    });

    this.socket.on('error', (err) => {
      console.error('[UDP] Socket Error:', err.message);
      if (onError) onError(err);
    });

    this.socket.bind(port, () => {
      console.log(`[UDP] Server listening on port ${port}`);
    });
  }

  setRecordingStatus(isRecording) {
    this.isRecording = isRecording;
  }

  getStatus() {
    return {
      udpPort: this.socket ? this.socket.address().port : null,
      packetCount: this.packetCount,
      lastPacketTime: this.lastPacketTime,
      isReceiving: this.lastPacketTime && (Date.now() - this.lastPacketTime.getTime() < 2000)
    };
  }
}

export const udpService = new UdpService();
