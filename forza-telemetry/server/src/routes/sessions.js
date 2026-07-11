import express from 'express';
import fs from 'fs';
import path from 'path';
import { 
  calculateDrivingLineAnalysis,
  calculateDrivingStyle,
  calculateDetailedStats,
  calculateDrivingScore,
  calculateTireAnalysis,
  calculateBrakingAnalysis,
  calculateAccelerationAnalysis,
  calculateShiftAnalysis,
  calculateSectorAnalysis,
  analyzeSectors,
  generateDrivingAdvice,
  getBestLapNum,
  findClosestPoint
} from '../services/physics-analyzer.js';

const router = express.Router();

// CSV Headers
const CSV_HEADERS = [
  'timestampMS', 'engineMaxRpm', 'engineIdleRpm', 'currentEngineRpm',
  'accelX', 'accelY', 'accelZ', 'velocityX', 'velocityY', 'velocityZ',
  'angularVelX', 'angularVelY', 'angularVelZ', 'yaw', 'pitch', 'roll',
  'suspTravelFL', 'suspTravelFR', 'suspTravelRL', 'suspTravelRR',
  'slipRatioFL', 'slipRatioFR', 'slipRatioRL', 'slipRatioRR',
  'wheelSpeedFL', 'wheelSpeedFR', 'wheelSpeedRL', 'wheelSpeedRR',
  'rumbleFL', 'rumbleFR', 'rumbleRL', 'rumbleRR',
  'puddleFL', 'puddleFR', 'puddleRL', 'puddleRR',
  'surfaceRumbleFL', 'surfaceRumbleFR', 'surfaceRumbleRL', 'surfaceRumbleRR',
  'slipAngleFL', 'slipAngleFR', 'slipAngleRL', 'slipAngleRR',
  'combinedSlipFL', 'combinedSlipFR', 'combinedSlipRL', 'combinedSlipRR',
  'suspTravelMetersFL', 'suspTravelMetersFR', 'suspTravelMetersRL', 'suspTravelMetersRR',
  'carOrdinal', 'carClass', 'carPerformanceIndex', 'drivetrainType', 'numCylinders',
  'posX', 'posY', 'posZ', 'speedKmh', 'powerHP', 'torqueNm',
  'tireTempFL', 'tireTempFR', 'tireTempRL', 'tireTempRR',
  'boost', 'fuel', 'distanceTraveled', 'bestLap', 'lastLap', 'currentLap',
  'currentRaceTime', 'racePosition', 'lapNumber', 'drivingLine',
  'onRumbleFL', 'onRumbleFR', 'onRumbleRL', 'onRumbleRR',
  'puddleDepthFL', 'puddleDepthFR', 'puddleDepthRL', 'puddleDepthRR'
];

function flattenTelemetry(d) {
  return [
    d.timestampMS || 0,
    d.engineMaxRpm || 0,
    d.engineIdleRpm || 0,
    d.currentEngineRpm || 0,
    d.acceleration?.x || 0,
    d.acceleration?.y || 0,
    d.acceleration?.z || 0,
    d.velocity?.x || 0,
    d.velocity?.y || 0,
    d.velocity?.z || 0,
    d.angularVelocity?.x || 0,
    d.angularVelocity?.y || 0,
    d.angularVelocity?.z || 0,
    d.yaw || 0,
    d.pitch || 0,
    d.roll || 0,
    d.normalizedSuspensionTravel?.frontLeft || 0,
    d.normalizedSuspensionTravel?.frontRight || 0,
    d.normalizedSuspensionTravel?.rearLeft || 0,
    d.normalizedSuspensionTravel?.rearRight || 0,
    d.tireSlipRatio?.frontLeft || 0,
    d.tireSlipRatio?.frontRight || 0,
    d.tireSlipRatio?.rearLeft || 0,
    d.tireSlipRatio?.rearRight || 0,
    d.wheelRotationSpeed?.frontLeft || 0,
    d.wheelRotationSpeed?.frontRight || 0,
    d.wheelRotationSpeed?.rearLeft || 0,
    d.wheelRotationSpeed?.rearRight || 0,
    d.wheelOnRumbleStrip?.frontLeft || 0,
    d.wheelOnRumbleStrip?.frontRight || 0,
    d.wheelOnRumbleStrip?.rearLeft || 0,
    d.wheelOnRumbleStrip?.rearRight || 0,
    d.wheelInPuddleDepth?.frontLeft || 0,
    d.wheelInPuddleDepth?.frontRight || 0,
    d.wheelInPuddleDepth?.rearLeft || 0,
    d.wheelInPuddleDepth?.rearRight || 0,
    d.surfaceRumble?.frontLeft || 0,
    d.surfaceRumble?.frontRight || 0,
    d.surfaceRumble?.rearLeft || 0,
    d.surfaceRumble?.rearRight || 0,
    d.tireSlipAngle?.frontLeft || 0,
    d.tireSlipAngle?.frontRight || 0,
    d.tireSlipAngle?.rearLeft || 0,
    d.tireSlipAngle?.rearRight || 0,
    d.tireCombinedSlip?.frontLeft || 0,
    d.tireCombinedSlip?.frontRight || 0,
    d.tireCombinedSlip?.rearLeft || 0,
    d.tireCombinedSlip?.rearRight || 0,
    d.suspensionTravelMeters?.frontLeft || 0,
    d.suspensionTravelMeters?.frontRight || 0,
    d.suspensionTravelMeters?.rearLeft || 0,
    d.suspensionTravelMeters?.rearRight || 0,
    d.car?.ordinal || 0,
    d.car?.class || 0,
    d.car?.performanceIndex || 0,
    d.car?.drivetrainType || 0,
    d.car?.numCylinders || 0,
    d.position?.x || 0,
    d.position?.y || 0,
    d.position?.z || 0,
    d.speedKmh || 0,
    d.powerHP || 0,
    d.torque || 0,
    d.tireTemp?.frontLeft || 0,
    d.tireTemp?.frontRight || 0,
    d.tireTemp?.rearLeft || 0,
    d.tireTemp?.rearRight || 0,
    d.boost || 0,
    d.fuel || 0,
    d.distanceTraveled || 0,
    d.bestLap || 0,
    d.lastLap || 0,
    d.currentLap || 0,
    d.currentRaceTime || 0,
    d.racePosition || 0,
    d.lapNumber || 0,
    d.drivingLine || 0,
    d.onRumbleStrip?.frontLeft || 0,
    d.onRumbleStrip?.frontRight || 0,
    d.onRumbleStrip?.rearLeft || 0,
    d.onRumbleStrip?.rearRight || 0,
    d.puddleDepth?.frontLeft || 0,
    d.puddleDepth?.frontRight || 0,
    d.puddleDepth?.rearLeft || 0,
    d.puddleDepth?.rearRight || 0
  ].map(v => typeof v === 'string' ? v : (typeof v === 'number' ? v.toFixed(4) : v));
}

// HTML报告生成器
function generateHTMLReport(session) {
  const analysis = {
    走线分析: calculateDrivingLineAnalysis(session.positions || []),
    驾驶风格: calculateDrivingStyle(session.data || []),
    轮胎分析: calculateTireAnalysis(session.data || []),
    制动分析: calculateBrakingAnalysis(session.data || [], session.positions || []),
    加速分析: calculateAccelerationAnalysis(session.data || []),
    换挡分析: calculateShiftAnalysis(session.data || []),
    分段分析: calculateSectorAnalysis(session.data || [], session.positions || [])
  };
  analysis.建议 = generateDrivingAdvice(analysis);
  analysis.驾驶评分 = calculateDrivingScore(session);

  const vehicle = session.vehicle || {};
  const laps = session.laps || {};
  const score = analysis.驾驶评分 || {};
  
  const fmtTime = (seconds) => {
    if (!seconds || seconds === 0) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + secs.toFixed(3).padStart(6, '0');
  };
  
  let html = '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Forza Horizon 5 赛后分析报告</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}' +
    '.header{text-align:center;padding:20px 0;border-bottom:1px solid #30363d;margin-bottom:20px}' +
    '.header h1{font-size:24px;color:#58a6ff;margin-bottom:8px}' +
    '.header p{color:#8b949e;font-size:14px}' +
    '.card{background:#161b22;border-radius:8px;padding:16px;margin-bottom:16px;border:1px solid #30363d}' +
    '.card h2{font-size:16px;color:#58a6ff;margin-bottom:12px;border-bottom:1px solid #30363d;padding-bottom:8px}' +
    '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}' +
    '.stat{text-align:center;padding:12px;background:#0d1117;border-radius:6px}' +
    '.stat .label{font-size:11px;color:#8b949e;text-transform:uppercase}' +
    '.stat .value{font-size:24px;font-weight:700;color:#3fb950;margin-top:4px}' +
    '.stat .value.warn{color:#d29922}' +
    '.stat .value.danger{color:#f85149}' +
    '.advice{padding:12px;border-radius:6px;margin-bottom:8px}' +
    '.advice.high{background:rgba(248,81,73,0.1);border:1px solid #f85149}' +
    '.advice.medium{background:rgba(210,153,34,0.1);border:1px solid #d29922}' +
    '.advice.low{background:rgba(88,166,255,0.1);border:1px solid #58a6ff}' +
    '.advice.info{background:rgba(63,185,80,0.1);border:1px solid #3fb950}' +
    '.advice .type{font-weight:600;margin-bottom:4px}' +
    '.advice .msg{font-size:14px;margin-bottom:4px}' +
    '.advice .detail{font-size:12px;color:#8b949e}' +
    'table{width:100%;border-collapse:collapse}' +
    'th,td{padding:8px;text-align:left;border-bottom:1px solid #21262d;font-size:13px}' +
    'th{color:#8b949e;font-size:11px;text-transform:uppercase}' +
    '.heatmap-tabs{display:flex;gap:6px;margin-bottom:8px}' +
    '.heatmap-tab{padding:4px 12px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;cursor:pointer;font-size:11px;font-family:inherit}' +
    '.heatmap-tab.active{background:#58a6ff;color:#0d1117;border-color:#58a6ff;font-weight:700}' +
    '.heatmap-canvas{width:100%;height:420px;background:#0d1117;border-radius:4px;display:block}' +
    '.heatmap-legend{display:flex;align-items:center;gap:14px;margin-top:8px;font-size:11px;color:#8b949e}' +
    '.heatmap-legend .swatch{display:inline-block;width:12px;height:8px;border-radius:1px}' +
    '.heatmap-legend .bar{height:8px;border-radius:4px}' +
    '</style></head><body>' +
    '<div class="header">' +
    '<h1>Forza Horizon 5 赛后分析报告</h1>' +
    '<p>赛道: ' + (session.trackName || '未知') + ' | 车辆: ' + (vehicle.name || 'Car #' + (vehicle.ordinal || '未知')) + ' | 日期: ' + new Date(session.savedAt).toLocaleDateString('zh-CN') + '</p>' +
    '</div>' +
    
    '<div class="card" style="background:linear-gradient(135deg,rgba(0,120,255,0.08) 0%,rgba(0,200,150,0.08) 100%);border:1px solid #58a6ff">' +
    '<h2>驾驶综合评分</h2>' +
    '<div style="display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 0">' +
    '<div style="font-size:48px;font-weight:900;color:#58a6ff;font-family:monospace">' + (score.总分 || 0) + '</div>' +
    '<div style="font-size:24px;font-weight:700;padding:6px 14px;border-radius:6px;background:' + 
      ((score.总分 || 0) >= 80 ? '#3fb950' : (score.总分 || 0) >= 60 ? '#d29922' : '#f85149') + ';color:#000">' + (score.等级 || 'N/A') + '</div>' +
    '</div>' +
    '<div class="stats">' +
    Object.entries(score.维度 || {}).map(([name, dim]) => {
      const ratio = (dim.分数 || 0) / (dim.满分 || 1);
      const c = ratio >= 0.8 ? '#3fb950' : ratio >= 0.6 ? '#d29922' : '#f85149';
      return '<div class="stat"><div class="label">' + name + '</div><div class="value" style="color:' + c + '">' + (dim.分数 || 0) + '/' + (dim.满分 || 0) + '</div></div>';
    }).join('') +
    '</div>' +
    ((score.建议 && score.建议.length > 0) ? 
      '<div style="margin-top:12px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border-left:3px solid #58a6ff">' +
      score.建议.map(function(t){ return '<div style="font-size:13px;margin:4px 0;color:#c9d1d9">• ' + t + '</div>'; }).join('') +
      '</div>' : '') +
    '</div>' +
    
    '<div class="card"><h2>赛道热力图</h2>' +
    '<div class="heatmap-tabs">' +
    '<button class="heatmap-tab active" data-mode="line" onclick="switchHeatmap(\'line\')">走线</button>' +
    '<button class="heatmap-tab" data-mode="throttle" onclick="switchHeatmap(\'throttle\')">油门</button>' +
    '<button class="heatmap-tab" data-mode="brake" onclick="switchHeatmap(\'brake\')">刹车</button>' +
    '<button class="heatmap-tab" data-mode="speed" onclick="switchHeatmap(\'speed\')">速度</button>' +
    '</div>' +
    '<canvas id="heatmap" class="heatmap-canvas" width="1200" height="500"></canvas>' +
    '<div class="heatmap-legend" id="heatmap-legend"></div>' +
    '</div>' +
    
    '<div class="card"><h2>成绩统计</h2><div class="stats">' +
    '<div class="stat"><div class="label">最快圈速</div><div class="value">' + (laps.best ? fmtTime(laps.best) : '--:--.---') + '</div></div>' +
    '<div class="stat"><div class="label">上一圈速</div><div class="value">' + (laps.last ? fmtTime(laps.last) : '--:--.---') + '</div></div>' +
    '<div class="stat"><div class="label">圈数</div><div class="value">' + (laps.count || 0) + '</div></div>' +
    '<div class="stat"><div class="label">总时长</div><div class="value">' + Math.round((session.summary?.duration || 0) / 1000) + 's</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>走线分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">评分</div><div class="value' + (analysis.走线分析.评分 < 70 ? ' warn' : '') + '">' + analysis.走线分析.评分 + '%</div></div>' +
    '<div class="stat"><div class="label">良好比例</div><div class="value">' + analysis.走线分析.良好比例 + '%</div></div>' +
    '<div class="stat"><div class="label">偏差比例</div><div class="value warn">' + analysis.走线分析.偏差比例 + '%</div></div>' +
    '<div class="stat"><div class="label">严重偏离</div><div class="value danger">' + analysis.走线分析.严重偏离 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>驾驶风格</h2><div class="stats">' +
    '<div class="stat"><div class="label">油门控制</div><div class="value">' + analysis.驾驶风格.油门控制 + '%</div></div>' +
    '<div class="stat"><div class="label">刹车控制</div><div class="value">' + analysis.驾驶风格.刹车控制 + '%</div></div>' +
    '<div class="stat"><div class="label">转向平顺性</div><div class="value">' + analysis.驾驶风格.转向平顺性 + '%</div></div>' +
    '<div class="stat"><div class="label">最大纵向G</div><div class="value">' + (analysis.驾驶风格.G力分布?.最大纵向 || 0) + 'G</div></div>' +
    '<div class="stat"><div class="label">最大横向G</div><div class="value">' + (analysis.驾驶风格.G力分布?.最大横向 || 0) + 'G</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>轮胎分析</h2>' +
    '<div class="stats">' +
    '<div class="stat"><div class="label">平均温度</div><div class="value">' + analysis.轮胎分析.温度分布.平均温度 + '°C</div></div>' +
    '<div class="stat"><div class="label">最高温差</div><div class="value' + (analysis.轮胎分析.温度分布.最高温差 > 11 ? ' warn' : '') + '">' + analysis.轮胎分析.温度分布.最高温差 + '°C</div></div>' +
    '<div class="stat"><div class="label">打滑时间</div><div class="value">' + analysis.轮胎分析.打滑统计.打滑时间比例 + '%</div></div>' +
    '<div class="stat"><div class="label">最大打滑</div><div class="value">' + analysis.轮胎分析.打滑统计.最大打滑 + '</div></div>' +
    '</div>' +
    '<table><tr><th>轮胎</th><th>温度</th><th>平均打滑</th><th>侧偏角</th></tr>' +
    '<tr><td>前左</td><td>' + (analysis.轮胎分析.温度分布.前left平均 || analysis.轮胎分析.温度分布.前左 || 0) + '°C</td><td>' + (analysis.轮胎分析.打滑统计.前left平均 || analysis.轮胎分析.打滑统计.前左平均 || 0) + '</td><td>' + (analysis.轮胎分析.侧偏角分析.前left平均 || analysis.轮胎分析.侧偏角分析.前左平均 || 0) + '°</td></tr>' +
    '<tr><td>前右</td><td>' + (analysis.轮胎分析.温度分布.前right平均 || analysis.轮胎分析.温度分布.前右 || 0) + '°C</td><td>' + (analysis.轮胎分析.打滑统计.前right平均 || analysis.轮胎分析.打滑统计.前右平均 || 0) + '</td><td>' + (analysis.轮胎分析.侧偏角分析.前right平均 || analysis.轮胎分析.侧偏角分析.前右平均 || 0) + '°</td></tr>' +
    '<tr><td>后左</td><td>' + (analysis.轮胎分析.温度分布.后left平均 || analysis.轮胎分析.温度分布.后左 || 0) + '°C</td><td>' + (analysis.轮胎分析.打滑统计.后左平均 || 0) + '</td><td>' + (analysis.轮胎分析.侧偏角分析.后左平均 || 0) + '°</td></tr>' +
    '<tr><td>后右</td><td>' + (analysis.轮胎分析.温度分布.后right平均 || analysis.轮胎分析.温度分布.后右 || 0) + '°C</td><td>' + (analysis.轮胎分析.打滑统计.后right平均 || analysis.轮胎分析.打滑统计.后右平均 || 0) + '</td><td>' + (analysis.轮胎分析.侧偏角分析.后right平均 || analysis.轮胎分析.侧偏角分析.后右平均 || 0) + '°</td></tr>' +
    '</table></div>' +
    
    '<div class="card"><h2>制动分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">刹车事件</div><div class="value">' + analysis.制动分析.刹车事件总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均刹车力度</div><div class="value">' + analysis.制动分析.平均刹车力度 + '%</div></div>' +
    '<div class="stat"><div class="label">平均刹车G力</div><div class="value">' + analysis.制动分析.平均刹车G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">刹车效率</div><div class="value">' + analysis.制动分析.刹车效率 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>加速分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">加速事件</div><div class="value">' + analysis.加速分析.加速事件总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均加速G力</div><div class="value">' + analysis.加速分析.平均加速G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">最大加速G力</div><div class="value">' + analysis.加速分析.最大加速G力 + 'G</div></div>' +
    '<div class="stat"><div class="label">牵引力利用率</div><div class="value">' + analysis.加速分析.牵引力利用率 + '%</div></div>' +
    '</div></div>' +
    
    '<div class="card"><h2>换挡分析</h2><div class="stats">' +
    '<div class="stat"><div class="label">换挡总数</div><div class="value">' + analysis.换挡分析.换挡总数 + '</div></div>' +
    '<div class="stat"><div class="label">平均换挡转速</div><div class="value">' + analysis.换挡分析.平均换挡转速 + 'RPM</div></div>' +
    '<div class="stat"><div class="label">转速利用率</div><div class="value">' + analysis.换挡分析.平均转速利用率 + '%</div></div>' +
    '</div>' +
    '<table><tr><th>档位</th><th>使用比例</th></tr>';
  
  const gearUsage = analysis.换挡分析.档位使用 || {};
  Object.entries(gearUsage).forEach(([gear, percent]) => {
    html += '<tr><td>' + gear + '</td><td>' + percent + '%</td></tr>';
  });
  html += '</table></div>';
  
  html += '<div class="card"><h2>赛道分段</h2><table><tr><th>段落</th><th>平均速度</th><th>最高速度</th><th>走线评分</th></tr>';
  const sectors = analysis.分段分析.分段 || [];
  sectors.forEach(s => {
    html += '<tr><td>段落' + s.段落 + '</td><td>' + s.平均速度 + 'km/h</td><td>' + s.最高速度 + 'km/h</td><td>' + s.走线评分 + '%</td></tr>';
  });
  html += '</table></div>';
  
  html += '<div class="card"><h2>驾驶建议</h2>';
  const advice = analysis.建议 || [];
  advice.forEach(a => {
    html += '<div class="advice ' + a.严重程度 + '">' +
      '<div class="type">' + a.类型 + '</div>' +
      '<div class="msg">' + a.消息 + '</div>' +
      '<div class="detail">' + a.具体 + '</div>' +
      '</div>';
  });
  html += '</div>';
  
  html += '<div style="text-align:center;padding:20px;color:#8b949e;font-size:12px">' +
    'Forza Horizon 5 遥测系统 | 报告生成时间: ' + new Date().toLocaleString('zh-CN') +
    '</div>' +
    
    '<script>var HEATMAP_POSITIONS = ' + JSON.stringify((session.positions || []).map(function(p){ 
      return { x: p.x, y: p.y, z: p.z, drivingLine: p.drivingLine, speed: p.speed, accel: p.accel, brake: p.brake }; 
    })) + ';</script>' +
    '<script>' +
    'var currentHeatmapMode = "line";' +
    'function lerpColor(a, b, t) { t = Math.max(0, Math.min(1, t)); return "rgb(" + Math.round(a[0] + (b[0]-a[0])*t) + "," + Math.round(a[1] + (b[1]-a[1])*t) + "," + Math.round(a[2] + (b[2]-a[2])*t) + ")"; }' +
    'function switchHeatmap(mode) {' +
      'currentHeatmapMode = mode;' +
      'document.querySelectorAll(".heatmap-tab").forEach(function(b){ b.classList.toggle("active", b.dataset.mode === mode); });' +
      'drawHeatmap();' +
    '}' +
    'function drawHeatmap() {' +
      'var canvas = document.getElementById("heatmap");' +
      'if (!canvas) return;' +
      'var ctx = canvas.getContext("2d");' +
      'var pts = HEATMAP_POSITIONS;' +
      'if (!pts || pts.length < 2) { ctx.fillStyle = "#0d1117"; ctx.fillRect(0,0,canvas.width,canvas.height); return; }' +
      'var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;' +
      'pts.forEach(function(p){ if (p.x<minX) minX=p.x; if (p.x>maxX) maxX=p.x; if (p.z<minZ) minZ=p.z; if (p.z>maxZ) maxZ=p.z; });' +
      'var pad = 30, w = canvas.width - pad*2, h = canvas.height - pad*2;' +
      'var scale = Math.min(w/(maxX-minX||1), h/(maxZ-minZ||1));' +
      'var offX = pad + (w - (maxX-minX)*scale)/2, offY = pad + (h - (maxZ-minZ)*scale)/2;' +
      'var toScreen = function(p) { return { x: offX + (p.x-minX)*scale, y: offY + (maxZ-p.z)*scale }; };' +
      'ctx.fillStyle = "#0d1117"; ctx.fillRect(0,0,canvas.width,canvas.height);' +
      'ctx.strokeStyle = "#21262d"; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";' +
      'ctx.beginPath(); pts.forEach(function(p,i){ var s=toScreen(p); if(i===0) ctx.moveTo(s.x,s.y); else ctx.lineTo(s.x,s.y); }); ctx.closePath(); ctx.stroke();' +
      'var maxSpeed = 0; pts.forEach(function(p){ if (p.speed > maxSpeed) maxSpeed = p.speed; });' +
      'ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";' +
      'for (var i = 1; i < pts.length; i++) {' +
        'var p1 = pts[i-1], p2 = pts[i]; var s1 = toScreen(p1), s2 = toScreen(p2);' +
        'var color;' +
        'if (currentHeatmapMode === "line") {' +
          'var dl = Math.abs(p1.drivingLine || 0);' +
          'if (dl < 20) color = "rgb(63,185,80)";' +
          'else if (dl < 50) color = "rgb(210,153,34)";' +
          'else color = "rgb(248,81,73)";' +
        '} else if (currentHeatmapMode === "throttle") {' +
          'color = lerpColor([40,40,40], [0,200,80], (p1.accel||0)/255);' +
        '} else if (currentHeatmapMode === "brake") {' +
          'color = lerpColor([40,40,40], [220,50,50], (p1.brake||0)/255);' +
        '} else {' +
          'color = lerpColor([30,30,60], [120,200,255], maxSpeed>0 ? (p1.speed||0)/maxSpeed : 0);' +
        '}' +
        'ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke();' +
      '}' +
      'var start = toScreen(pts[0]);' +
      'ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(start.x, start.y, 6, 0, Math.PI*2); ctx.fill();' +
      'ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();' +
      'var leg = document.getElementById("heatmap-legend");' +
      'if (currentHeatmapMode === "line") {' +
        'leg.innerHTML = "<span><span class=\\"swatch\\" style=\\"background:#3fb950\\"></span> 理想</span><span><span class=\\"swatch\\" style=\\"background:#d29922\\"></span> 偏离</span><span><span class=\\"swatch\\" style=\\"background:#f85149\\"></span> 严重</span>";' +
      '} else if (currentHeatmapMode === "throttle") {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(40,40,40),rgb(0,200,80))\\"></span><span>高</span>";' +
      '} else if (currentHeatmapMode === "brake") {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(40,40,40),rgb(220,50,50))\\"></span><span>高</span>";' +
      '} else {' +
        'leg.innerHTML = "<span>低</span><span class=\\"bar\\" style=\\"flex:1;max-width:200px;background:linear-gradient(to right,rgb(30,30,60),rgb(120,200,255))\\"></span><span>高</span>";' +
      '}' +
    '}' +
    'window.addEventListener("DOMContentLoaded", function(){ setTimeout(drawHeatmap, 50); });' +
    '</script>' +
    '</body></html>';
  
  return html;
}

export default function(context) {
  const { loadSession, tracks, tunes, DATA_DIR, saveJSON, leaderboardCache, setLeaderboardCache } = context;

  // 获取比赛记录列表
  router.get('/api/sessions', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('_summary.json'));
      const sessions = files.map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + f, 'utf8'));
          const tune = data.tuneId && tunes[data.tuneId] ? tunes[data.tuneId] : null;
          const trackName = (typeof tracks !== 'undefined' && data.trackId && tracks[data.trackId])
            ? tracks[data.trackId].name
            : (data.trackName || '未知赛道');
          return {
            id: data.id,
            filename: f,
            trackName: trackName,
            trackId: data.trackId || null,
            vehicle: data.vehicle || null,
            laps: data.laps || {},
            summary: data.summary || {},
            savedAt: data.savedAt,
            tuneId: data.tuneId || null,
            tuneName: tune ? tune.name : null,
            hasDetail: data.hasDetail ?? false
          };
        } catch (e) {
          return null;
        }
      }).filter(s => s !== null);

      sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      res.json(sessions);
    } catch (e) {
      res.json([]);
    }
  });

  // 获取比赛记录详情
  router.get('/api/sessions/:id', (req, res) => {
    try {
      const session = loadSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load session' });
    }
  });

  // 获取比赛记录的遥测数据
  router.get('/api/sessions/:id/telemetry', (req, res) => {
    try {
      const session = loadSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session.data || []);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load session telemetry' });
    }
  });

  // 删除比赛记录
  router.delete('/api/sessions/:id', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const summaryPath = path.join(sessionsDir, `${req.params.id}_summary.json`);
      const hifiPath = path.join(sessionsDir, `${req.params.id}_detail_hifi.json.br`);
      const lowfiPath = path.join(sessionsDir, `${req.params.id}_detail_lowfi.json.br`);
      const brPath = path.join(sessionsDir, `${req.params.id}_detail.json.br`);
      const gzPath = path.join(sessionsDir, `${req.params.id}_detail.json.gz`);
      
      let deleted = false;
      if (fs.existsSync(summaryPath)) {
        fs.unlinkSync(summaryPath);
        deleted = true;
      }
      if (fs.existsSync(hifiPath)) {
        fs.unlinkSync(hifiPath);
        deleted = true;
      }
      if (fs.existsSync(lowfiPath)) {
        fs.unlinkSync(lowfiPath);
        deleted = true;
      }
      if (fs.existsSync(brPath)) {
        fs.unlinkSync(brPath);
        deleted = true;
      }
      if (fs.existsSync(gzPath)) {
        fs.unlinkSync(gzPath);
        deleted = true;
      }
      
      if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      if (context.clearLeaderboardCache) {
        context.clearLeaderboardCache();
      }
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // 编辑比赛记录的赛道名称
  router.put('/api/sessions/:id/track', express.json(), (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const filePath = path.join(sessionsDir, `${req.params.id}_summary.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const newTrackName = req.body.trackName;
      if (!newTrackName) {
        return res.status(400).json({ error: 'trackName is required' });
      }
      
      data.trackName = newTrackName;
      if (req.body.trackId) {
        data.trackId = req.body.trackId;
      }
      
      saveJSON(filePath, data);
      res.json({ status: 'ok', trackName: newTrackName });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // 批量更新比赛记录的赛道名称
  router.put('/api/sessions/batch/track', express.json(), (req, res) => {
    try {
      const { sessionIds, trackName, trackId } = req.body;
      if (!sessionIds || !Array.isArray(sessionIds) || !trackName) {
        return res.status(400).json({ error: 'sessionIds array and trackName are required' });
      }
      
      const sessionsDir = DATA_DIR + '/sessions';
      let updatedCount = 0;
      
      sessionIds.forEach(sessionId => {
        const filePath = path.join(sessionsDir, `${sessionId}_summary.json`);
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          data.trackName = trackName;
          if (trackId) data.trackId = trackId;
          saveJSON(filePath, data);
          updatedCount++;
        }
      });
      
      res.json({ status: 'ok', updatedCount });
    } catch (e) {
      res.status(500).json({ error: 'Failed to batch update sessions' });
    }
  });

  // CSV导出API
  router.get('/api/export/csv/:sessionId', (req, res) => {
    try {
      const session = loadSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="forza_telemetry_' + session.id + '.csv"');
      
      res.write(CSV_HEADERS.join(',') + '\n');
      
      const data = session.data || [];
      for (let i = 0; i < data.length; i++) {
        const row = flattenTelemetry(data[i]);
        res.write(row.join(',') + '\n');
      }
      
      res.end();
    } catch (e) {
      res.status(500).json({ error: 'Failed to export CSV' });
    }
  });

  // JSON导出API
  router.get('/api/export/json/:sessionId', (req, res) => {
    try {
      const session = loadSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="forza_telemetry_' + session.id + '.json"');
      
      res.json(session);
    } catch (e) {
      res.status(500).json({ error: 'Failed to export JSON' });
    }
  });

  // 测试HTML报告生成
  router.get('/api/test/report/:sessionId', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const file = files.find(f => f.includes(req.params.sessionId));
      if (!file) return res.status(404).json({ error: 'Session not found' });
      const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
      
      const html = generateHTMLReport(session);
      res.json({ htmlLen: html.length, hasHeatmap: html.includes('HEATMAP_POSITIONS'), hasSectors: html.includes('赛道分段'), hasAdvice: html.includes('驾驶建议'), sample: html.slice(7500, 7550) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // HTML报告导出API
  router.get('/api/export/report/:sessionId', (req, res) => {
    try {
      const sessionsDir = DATA_DIR + '/sessions';
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const file = files.find(f => f.includes(req.params.sessionId));
      if (!file) {
        return res.status(404).json({ error: 'Session not found' });
      }
      const session = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
      
      const html = generateHTMLReport(session);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', 'attachment; filename="forza_report_' + session.id + '.html"');

      res.send(html);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report: ' + e.message });
    }
  });

  return router;
}
