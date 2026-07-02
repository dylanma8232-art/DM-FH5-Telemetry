import fs from 'fs';

const SERVER_URL = 'http://localhost:9188';
let checkCount = 0;
let lastPacketCount = 0;

async function checkData() {
  checkCount++;
  
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    const status = await res.json();
    
    const currentCount = status.packetCount || 0;
    
    if (currentCount > lastPacketCount) {
      console.log(`[数据监听] 收到新数据: ${currentCount} 包 (增加 ${currentCount - lastPacketCount})`);
      lastPacketCount = currentCount;
      
      // 获取当前数据
      const dataRes = await fetch(`${SERVER_URL}/api/current`);
      const data = await dataRes.json();
      
      if (data && Object.keys(data).length > 0) {
        analyzeData(data, currentCount);
      }
    }
    
    if (checkCount % 10 === 0) {
      console.log(`[数据监听] 检查 #${checkCount}: ${currentCount} 包`);
    }
    
  } catch (e) {
    console.log(`[数据监听] 错误: ${e.message}`);
  }
  
  setTimeout(checkData, 1000);
}

function analyzeData(data, count) {
  console.log('\n=== 数据分析 ===');
  console.log(`包数量: ${count}`);
  console.log(`isRaceOn: ${data.isRaceOn}`);
  console.log(`timestampMS: ${data.timestampMS}`);
  console.log();
  
  // SLED区域数据
  console.log('=== SLED区域数据 ===');
  console.log(`engineMaxRpm: ${data.engineMaxRpm}`);
  console.log(`engineIdleRpm: ${data.engineIdleRpm}`);
  console.log(`currentEngineRpm: ${data.currentEngineRpm}`);
  console.log(`acceleration: x=${data.acceleration?.x?.toFixed(4)}, y=${data.acceleration?.y?.toFixed(4)}, z=${data.acceleration?.z?.toFixed(4)}`);
  console.log(`velocity: x=${data.velocity?.x?.toFixed(6)}, y=${data.velocity?.y?.toFixed(6)}, z=${data.velocity?.z?.toFixed(6)}`);
  console.log(`yaw: ${data.yaw?.toFixed(4)}`);
  console.log(`pitch: ${data.pitch?.toFixed(4)}`);
  console.log(`roll: ${data.roll?.toFixed(4)}`);
  console.log();
  
  // Dash扩展区域数据
  console.log('=== Dash扩展区域数据 ===');
  console.log(`position: x=${data.position?.x?.toFixed(2)}, y=${data.position?.y?.toFixed(2)}, z=${data.position?.z?.toFixed(2)}`);
  console.log(`speedMs: ${data.speedMs?.toFixed(2)}`);
  console.log(`speedKmh: ${data.speedKmh?.toFixed(2)}`);
  console.log(`powerWatts: ${data.powerWatts?.toFixed(0)}`);
  console.log(`powerHP: ${data.powerHP?.toFixed(0)}`);
  console.log(`torque: ${data.torque?.toFixed(0)}`);
  console.log(`tireTemp: FL=${data.tireTemp?.frontLeft?.toFixed(1)}, FR=${data.tireTemp?.frontRight?.toFixed(1)}, RL=${data.tireTemp?.rearLeft?.toFixed(1)}, RR=${data.tireTemp?.rearRight?.toFixed(1)}`);
  console.log(`boost: ${data.boost?.toFixed(2)}`);
  console.log(`fuel: ${data.fuel?.toFixed(2)}`);
  console.log(`distanceTraveled: ${data.distanceTraveled?.toFixed(0)}`);
  console.log(`bestLap: ${data.bestLap?.toFixed(3)}`);
  console.log(`lastLap: ${data.lastLap?.toFixed(3)}`);
  console.log(`currentLap: ${data.currentLap?.toFixed(3)}`);
  console.log(`currentRaceTime: ${data.currentRaceTime?.toFixed(3)}`);
  console.log(`lapNumber: ${data.lapNumber}`);
  console.log(`racePosition: ${data.racePosition}`);
  console.log(`controls: accel=${data.controls?.accel}, brake=${data.controls?.brake}, gear=${data.controls?.gear}, steer=${data.controls?.steer}`);
  console.log();
  
  // 保存数据
  const dataDir = new URL('../../data/current_data.json', import.meta.url).pathname;
  fs.writeFileSync(dataDir, JSON.stringify(data, null, 2));
  console.log('当前数据已保存到 data/current_data.json');
  
  // 分析字段合理性
  console.log('\n=== 字段合理性分析 ===');
  
  const speedKmh = data.speedKmh || 0;
  const racePosition = data.racePosition || 0;
  const lapNumber = data.lapNumber || 0;
  const currentRaceTime = data.currentRaceTime || 0;
  const bestLap = data.bestLap || 0;
  
  console.log(`speedKmh: ${speedKmh.toFixed(2)} - ${speedKmh >= 0 && speedKmh <= 500 ? '✅ 合理' : '❌ 不合理'}`);
  console.log(`racePosition: ${racePosition} - ${racePosition >= 1 && racePosition <= 24 ? '✅ 合理' : '❌ 不合理'}`);
  console.log(`lapNumber: ${lapNumber} - ${lapNumber >= 0 && lapNumber <= 100 ? '✅ 合理' : '❌ 不合理'}`);
  console.log(`currentRaceTime: ${currentRaceTime.toFixed(3)} - ${currentRaceTime >= 0 && currentRaceTime <= 3600 ? '✅ 合理' : '❌ 不合理'}`);
  console.log(`bestLap: ${bestLap.toFixed(3)} - ${bestLap >= 0 && bestLap <= 600 ? '✅ 合理' : '❌ 不合理'}`);
}

console.log('[数据监听] 开始监听服务器数据...');
console.log('[数据监听] 等待游戏发送数据...');
checkData();
