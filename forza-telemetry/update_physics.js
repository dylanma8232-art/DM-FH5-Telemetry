const fs = require('fs');
const path = require('path');

const physicsPath = path.join(__dirname, 'server/src/services/physics-analyzer.js');
let physicsCode = fs.readFileSync(physicsPath, 'utf8');

// 1. Remove old functions
physicsCode = physicsCode.replace(/\/\/ 轮胎性能分析[\s\S]*?(?=\/\/ 制动分析)/, '');
physicsCode = physicsCode.replace(/\/\/ 制动分析[\s\S]*?(?=\/\/ 加速效率分析)/, '');
physicsCode = physicsCode.replace(/\/\/ 加速效率分析[\s\S]*?(?=\/\/ 换挡分析)/, '');
physicsCode = physicsCode.replace(/\/\/ 换挡分析[\s\S]*?(?=\/\/ 赛道分段分析)/, '');

// 2. Add new functions
const newFunctions = `// FH5 动力与传动透视图分析
export function calculateGearingAnalysis(data) {
  if (!data || data.length === 0) return { powerBand: [], shifts: [], maxRpmBangingTimeSec: 0 };
  
  const shifts = [];
  const powerBandMap = new Map();
  
  let prevGear = 0;
  let rpmBangingTicks = 0;
  
  data.forEach(d => {
    const gear = d.controls?.gear ?? d.gear ?? 0;
    const rpm = d.currentEngineRpm || d.rpm || 0;
    const power = d.powerWatts || d.powerHP || 0;
    const torque = d.torque || 0;
    const maxRpm = d.engineMaxRpm || 8000;
    
    if (gear >= 4 && rpm > maxRpm * 0.98) {
      rpmBangingTicks++;
    }
    
    if (gear > prevGear && prevGear > 0 && gear <= 10) {
      shifts.push({
        gear: \`\${prevGear}->\${gear}\`,
        rpm: Math.round(rpm),
        speed: Math.round(d.speedKmh || (d.speedMs ? d.speedMs * 3.6 : 0)),
        time: d.timestampMS || 0
      });
    }
    prevGear = gear;
    
    if (power > 0 || torque > 0) {
      const roundedRpm = Math.floor(rpm / 100) * 100;
      if (!powerBandMap.has(roundedRpm)) {
        powerBandMap.set(roundedRpm, { power: [], torque: [] });
      }
      powerBandMap.get(roundedRpm).power.push(power);
      powerBandMap.get(roundedRpm).torque.push(torque);
    }
  });
  
  const powerBand = Array.from(powerBandMap.keys()).sort((a,b)=>a-b).map(rpm => {
    const pts = powerBandMap.get(rpm);
    return {
      rpm,
      power: Math.round(pts.power.reduce((a,b)=>a+b,0) / pts.power.length),
      torque: Math.round(pts.torque.reduce((a,b)=>a+b,0) / pts.torque.length)
    };
  });
  
  return {
    powerBand,
    shifts: shifts.slice(0, 50),
    maxRpmBangingTimeSec: (rpmBangingTicks / 60).toFixed(2)
  };
}

// FH5 底盘与避震扫描分析
export function calculateSuspensionAnalysis(data, positions) {
  if (!data || data.length === 0) return { bottomingEvents: [], bottomingScore: 100 };
  
  const bottomingEvents = [];
  let bottomingTicks = 0;
  
  data.forEach((d, i) => {
    const susp = d.suspension || {};
    const isBottoming = (susp.frontLeft >= 0.98 || susp.frontRight >= 0.98 || susp.rearLeft >= 0.98 || susp.rearRight >= 0.98);
    
    if (isBottoming) {
      bottomingTicks++;
      if (bottomingTicks % 10 === 1) {
        bottomingEvents.push({
          time: d.timestampMS || 0,
          speed: Math.round(d.speedKmh || 0),
          position: positions && positions[i] ? positions[i] : null
        });
      }
    }
  });
  
  return {
    bottomingEvents: bottomingEvents.slice(0, 30),
    bottomingScore: Math.max(0, 100 - (bottomingTicks / 10)),
    totalBottomingTicks: bottomingTicks
  };
}

// FH5 差速器与滑移角动态分析
export function calculateDifferentialAnalysis(data) {
  if (!data || data.length === 0) return { cornerExitSlip: [], oversteerEvents: [] };
  
  const cornerExitSlip = [];
  const oversteerEvents = [];
  
  data.forEach(d => {
    const accel = d.controls?.accel || 0;
    const yaw = Math.abs(d.angularVelocity?.y || 0);
    const slipRatio = d.tireSlipRatio || {};
    
    if (accel > 127 && yaw > 0.5) {
      const frontSlip = ((slipRatio.frontLeft || 0) + (slipRatio.frontRight || 0)) / 2;
      const rearSlip = ((slipRatio.rearLeft || 0) + (slipRatio.rearRight || 0)) / 2;
      
      cornerExitSlip.push({
        time: d.timestampMS || 0,
        frontSlip: frontSlip.toFixed(3),
        rearSlip: rearSlip.toFixed(3),
        speed: Math.round(d.speedKmh || 0)
      });
      
      if (rearSlip > frontSlip + 0.5) {
        oversteerEvents.push({ time: d.timestampMS, severity: 'High' });
      }
    }
  });
  
  return {
    cornerExitSlip: cornerExitSlip.filter((_, i) => i % 5 === 0).slice(0, 50),
    oversteerEvents: oversteerEvents.slice(0, 20)
  };
}

// 赛道分段分析
`;

physicsCode = physicsCode.replace('// 赛道分段分析\n', newFunctions);
fs.writeFileSync(physicsPath, physicsCode);

const analysisPath = path.join(__dirname, 'server/src/routes/analysis.js');
let analysisCode = fs.readFileSync(analysisPath, 'utf8');

// Update imports
analysisCode = analysisCode.replace(
  /calculateTireAnalysis,\s*calculateBrakingAnalysis,\s*calculateAccelerationAnalysis,\s*calculateShiftAnalysis,/,
  'calculateGearingAnalysis,\n  calculateSuspensionAnalysis,\n  calculateDifferentialAnalysis,'
);

// Update route definitions
analysisCode = analysisCode.replace(
  /\/\/ 3\. 轮胎状态[\s\S]*?(?=\/\/ 4\. 制动分析)/,
  `// 3. 动力与齿轮比
    router.get('/api/analysis/:sessionId/gearing', (req, res) => {
      const session = loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(calculateGearingAnalysis(session.data || []));
    });

    `
);

analysisCode = analysisCode.replace(
  /\/\/ 4\. 制动分析[\s\S]*?(?=\/\/ 5\. 加速分析)/,
  `// 4. 底盘悬挂与托底分析
    router.get('/api/analysis/:sessionId/suspension', (req, res) => {
      const session = loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(calculateSuspensionAnalysis(session.data || [], session.positions || []));
    });

    `
);

analysisCode = analysisCode.replace(
  /\/\/ 5\. 加速分析[\s\S]*?(?=\/\/ 6\. 换挡分析)/,
  `// 5. 差速器与抓地力 (Differential & Grip)
    router.get('/api/analysis/:sessionId/differential', (req, res) => {
      const session = loadSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json(calculateDifferentialAnalysis(session.data || []));
    });

    `
);

analysisCode = analysisCode.replace(/\/\/ 6\. 换挡分析[\s\S]*?(?=\/\/ 7\. 分段分析)/, '');

// Update "all" endpoint
analysisCode = analysisCode.replace(/轮胎分析: calculateTireAnalysis.*/, '动力齿比: calculateGearingAnalysis(session.data || []),');
analysisCode = analysisCode.replace(/制动分析: calculateBrakingAnalysis.*/, '底盘悬挂: calculateSuspensionAnalysis(session.data || [], session.positions || []),');
analysisCode = analysisCode.replace(/加速分析: calculateAccelerationAnalysis.*/, '差速抓地力: calculateDifferentialAnalysis(session.data || []),');
analysisCode = analysisCode.replace(/换挡分析: calculateShiftAnalysis.*/, '');

fs.writeFileSync(analysisPath, analysisCode);
console.log('Update script finished successfully.');
