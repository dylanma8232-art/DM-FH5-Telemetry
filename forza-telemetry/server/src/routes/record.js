import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import { stateManager } from '../services/state-manager.js';
import { saveJSON, loadJSON } from '../utils/helpers.js';
import { saveTracksDatabase, readTrackDetail, writeTrackDetail, deleteTrackDetail, loadSession } from '../storage/session-db.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();


  
const DATA_DIR = stateManager.DATA_DIR;
const LEADERBOARD_CACHE_TTL = 30000;

const calculateTrackLength = (pts) => {
  if (!pts || pts.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x;
    const dy = (pts[i].y || 0) - (pts[i-1].y || 0);
    const dz = pts[i].z - pts[i-1].z;
    len += Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
  return Math.round(len);
};


  // 内部状态
  let isManualRecording = false;
  let manualRacePositions = [];
  let manualRecordTempPath = null;
  let manualRecordWriteStream = null;
  let manualRecordDataCount = 0;
  let lastManualRecordSaveTime = 0;
  let lastManualPositionSaveTime = 0;

  let autoRacePositions = [];
  let autoRecordTempPath = null;
  let autoRecordWriteStream = null;
  let autoRecordDataCount = 0;
  let lastAutoRecordSaveTime = 0;
  let lastAutoPositionSaveTime = 0;

  let autoRecordState = 'IDLE'; // IDLE | RECORDING | POST_RACE
  let autoRecordStartTimer = null;
  let autoRecordStopTimer = null;
  let autoRecordStartTime = null;
  let lastTelemetryPacket = null;
  let lastTelemetryPacketTime = 0;
  let lastRecognitionCheckTime = 0;
  const RECOGNITION_INTERVAL_MS = 5000;
  const START_DEBOUNCE_MS = 500;
  const STOP_DEBOUNCE_MS = 25000;
  const MIN_RACE_DURATION_MS = 30000;

  let lastSignificantPosition = null;
  let staticPositionCount = 0;
  const MAX_STATIC_COUNT = 100;

  const SPEED_THRESHOLD = 10;
  const SPEED_SUSTAIN_MS = 2000;
  let speedSustainStart = null;
  let lastLapNumber = 0;

  function extractTrackPoint(telemetry) {
    const acc = telemetry.acceleration || {};
    const controls = telemetry.controls || {};
    const tireSlip = telemetry.tireCombinedSlip || {};
    const onRumble = telemetry.onRumbleStrip || {};
    const puddle = telemetry.puddleDepth || {};
    
    return {
      x: telemetry.position.x,
      y: telemetry.position.y || 0,
      z: telemetry.position.z,
      yaw: telemetry.yaw || 0,
      drivingLine: telemetry.drivingLine || 0,
      speed: telemetry.speedKmh || 0,
      lapTime: telemetry.currentLap || 0,
      racePos: telemetry.racePosition || 0,
      lapNum: telemetry.lapNumber || 0,
      accel: controls.accel || 0,
      brake: controls.brake || 0,
      steer: controls.steer || 0,
      clutch: controls.clutch || 0,
      handBrake: controls.handBrake || 0,
      gear: controls.gear || 0,
      gLong: acc.z || 0,
      gLat: acc.x || 0,
      gVert: acc.y || 0,
      roll: telemetry.roll || 0,
      pitch: telemetry.pitch || 0,
      slipFL: tireSlip.frontLeft || 0,
      slipFR: tireSlip.frontRight || 0,
      slipRL: tireSlip.rearLeft || 0,
      slipRR: tireSlip.rearRight || 0,
      suspFL: telemetry.suspension?.frontLeft !== undefined ? telemetry.suspension.frontLeft : 1.0,
      suspFR: telemetry.suspension?.frontRight !== undefined ? telemetry.suspension.frontRight : 1.0,
      suspRL: telemetry.suspension?.rearLeft !== undefined ? telemetry.suspension.rearLeft : 1.0,
      suspRR: telemetry.suspension?.rearRight !== undefined ? telemetry.suspension.rearRight : 1.0,
      tireTempFL: telemetry.tireTemp?.frontLeft || 0,
      tireTempFR: telemetry.tireTemp?.frontRight || 0,
      tireTempRL: telemetry.tireTemp?.rearLeft || 0,
      tireTempRR: telemetry.tireTemp?.rearRight || 0,
      onRumble: (onRumble.frontLeft || onRumble.frontRight || onRumble.rearLeft || onRumble.rearRight) ? 1 : 0,
      puddle: Math.max(puddle.frontLeft || 0, puddle.frontRight || 0, puddle.rearLeft || 0, puddle.rearRight || 0)
    };
  }

  function startAutoRecording() {
    autoRecordState = 'RECORDING';
    autoRecordStartTime = Date.now();
    autoRacePositions.length = 0;
    autoRecordDataCount = 0;
    lastAutoRecordSaveTime = Date.now();
    lastAutoPositionSaveTime = Date.now();
    
    const tempDir = path.join(DATA_DIR, 'sessions');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    autoRecordTempPath = path.join(tempDir, `temp_auto_record_${Date.now()}.jsonl`);
    autoRecordWriteStream = fs.createWriteStream(autoRecordTempPath, { flags: 'a' });
    autoRecordWriteStream.on('error', (err) => console.error('[自动录制] 文件写入流异常:', err));

    console.log(`[自动录制] 比赛开始，实时流式写入: ${autoRecordTempPath}`);
    stateManager.io.emit('autoRecordStatus', { state: 'RECORDING', message: '比赛开始，自动录制中' });
  }

  function stopAutoRecording() {
    const duration = Date.now() - autoRecordStartTime;
    if (autoRecordWriteStream) {
      autoRecordWriteStream.end();
      autoRecordWriteStream = null;
    }
    
    if (duration < MIN_RACE_DURATION_MS) {
      console.log(`[自动录制] 比赛太短 (${duration}ms)，丢弃数据`);
      autoRecordState = 'IDLE';
      autoRacePositions.length = 0;
      if (autoRecordTempPath && fs.existsSync(autoRecordTempPath)) {
        try { fs.unlinkSync(autoRecordTempPath); } catch {}
      }
      stateManager.io.emit('autoRecordStatus', { state: 'IDLE', message: '比赛太短，数据已丢弃' });
      return;
    }
    
    autoRecordState = 'IDLE';
    console.log(`[自动录制] 比赛结束，准备后台异步保存 ${autoRecordDataCount} 条数据，${autoRacePositions.length} 个轨迹点`);
    
    const capturedPositions = [...autoRacePositions];
    const tempPath = autoRecordTempPath;
    
    autoRacePositions.length = 0;
    autoRecordDataCount = 0;
    speedSustainStart = null;
    lastLapNumber = 0;
    staticPositionCount = 0;
    lastSignificantPosition = null;
    
    // 比赛确实结束并保存时，立即退出路书模式，提供更快的 UI 响应
    const trackMode = stateManager.getTrackMode();
    if (trackMode) {
      console.log(`[赛道模式] 比赛已结束并保存，退出路书模式。`);
      stateManager.setTrackMode(null);
      stateManager.io.emit('trackModeChanged', { active: false, trackId: null, trackName: null });
    }
    
    stateManager.io.emit('autoRecordStatus', { state: 'PROCESSING', message: '正在后台生成赛道地图和路书...' });
    
    saveAutoRecordedDataWithWorker(duration, tempPath, capturedPositions, trackMode);
  }

  function saveAutoRecordedDataWithWorker(duration, tempFilePath, positions, activeTrackMode) {
    const trackMode = activeTrackMode;
    let trackId = null;
    let trackName = null;
    
    if (trackMode) {
      trackId = trackMode.trackId;
      trackName = trackMode.trackName;
    } else {
      const now = new Date();
      const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
      trackName = '赛道_' + dateStr + '_' + timeStr;
    }

    const ts = Date.now();
    const currentData = stateManager.getCurrentData();
    // 从 stateManager.vehicles 获取带名称的车辆信息，避免保存空白编号
    const carOrdinal = currentData?.car?.ordinal;
    const vehicleFromState = carOrdinal && carOrdinal > 0 ? stateManager.vehicles[String(carOrdinal)] : null;
    const vehicleToSave = vehicleFromState
      ? { ordinal: carOrdinal, name: vehicleFromState.name, class: vehicleFromState.class, performanceIndex: vehicleFromState.pi }
      : (carOrdinal > 0 ? currentData.car : null);
    const sessionDataMeta = {
      id: 'session_' + ts,
      trackName: trackName,
      trackId: trackId,
      savedAt: new Date().toISOString(),
      autoRecorded: true,
      trackMode: !!trackMode,
      duration: duration,
      vehicle: vehicleToSave
    };

    const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../storage/save-worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        tempFilePath,
        positions,
        sessionDataMeta,
        DATA_DIR, tracks: stateManager.tracks,
        trackMode
      }
    });

    worker.on('message', (msg) => {
      if (msg.status === 'success') {
        console.log(`[自动录制] 后台保存成功，会话 ID: ${msg.sessionId}`);
        
        if (msg.tracksUpdate) {
          const trUpdate = msg.tracksUpdate;
          stateManager.tracks[trUpdate.id] = trUpdate;
          saveTracksDatabase(stateManager.tracks);
        }

        // 核心修复：通知缓存比赛记录+1
        if (msg.tracksUpdate && msg.tracksUpdate.id) {
          stateManager.incrementSessionCount(msg.tracksUpdate.id);
        } else if (trackId) {
          stateManager.incrementSessionCount(trackId);
        }

        const sessionSummary = msg.sessionSummary;
        const vehicleOrdinal = sessionSummary.vehicle ? sessionSummary.vehicle.ordinal : null;
        if (vehicleOrdinal && stateManager.vehicles[vehicleOrdinal]) {
          stateManager.vehicles[vehicleOrdinal].raceCount = (stateManager.vehicles[vehicleOrdinal].raceCount || 0) + 1;
          const finalTrackId = (msg.tracksUpdate && msg.tracksUpdate.id) || trackId;
          if (finalTrackId && finalTrackId !== 'unknown' && !stateManager.vehicles[vehicleOrdinal].tracks.includes(finalTrackId)) {
            stateManager.vehicles[vehicleOrdinal].tracks.push(finalTrackId);
          }
          if (!stateManager.vehicles[vehicleOrdinal].bestLap || (sessionSummary.laps && sessionSummary.laps.best && sessionSummary.laps.best < stateManager.vehicles[vehicleOrdinal].bestLap)) {
            stateManager.vehicles[vehicleOrdinal].bestLap = sessionSummary.laps?.best;
          }
          saveJSON(DATA_DIR + '/vehicles.json', stateManager.vehicles);
        }

        stateManager.io.emit('autoRecordStatus', { 
          state: 'COMPLETED', 
          message: `比赛结束，数据保存成功`,
          sessionId: msg.sessionId,
          trackId: msg.tracksUpdate ? msg.tracksUpdate.id : null,
          trackName: trackName
        });
      } else {
        console.error(`[自动录制] 后台保存失败: ${msg.error}`);
        stateManager.io.emit('autoRecordStatus', { state: 'ERROR', message: `保存失败: ${msg.error}` });
      }

      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      
      // 注意：trackMode 已在 stopAutoRecording() 捕获后立即清除，
      // 此处不能再次 stateManager.setTrackMode(null)，否则会误杀用户随后开始的新赛道模式
      worker.terminate();
    });

    worker.on('error', (err) => {
      console.error(`[自动录制] 后台保存工作线程出现错误:`, err);
      stateManager.io.emit('autoRecordStatus', { state: 'ERROR', message: `工作线程错误: ${err.message}` });
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      // 同上，不在此清除 trackMode
      worker.terminate();
    });
  }


  // 外部暴露的自动录制 UDP 包处理句柄
  function handleAutoRecord(telemetry) {
    const now = Date.now();
    const speed = telemetry.speedKmh || 0;
    const position = telemetry.position;
    
    // 更新看门狗数据
    lastTelemetryPacket = telemetry;
    lastTelemetryPacketTime = now;
    
    const isPositionValid = position && (position.x !== 0 || position.z !== 0);
    
    if (isPositionValid && telemetry.isRaceOn) {
      const posKey = Math.round(position.x) + ',' + Math.round(position.z);
      if (lastSignificantPosition === posKey) {
        staticPositionCount++;
      } else {
        staticPositionCount = 0;
        lastSignificantPosition = posKey;
      }
    }
    
    // 启动判定：必须在比赛中 且 有名次 且 比赛时间流动
    const isStartConditionMet = telemetry.isRaceOn && 
      telemetry.racePosition > 0 && 
      (telemetry.currentRaceTime && telemetry.currentRaceTime > 0);

    // 维持判定：只要 isRaceOn 是 true 就可以继续录制（防止倒车/暂停/瞬移/多人游戏名次为0导致的录制中断）
    const isRaceActive = telemetry.isRaceOn;

    // 检测是否为重新开始比赛 (当已经在录制中，但比赛时间突然归零/重置，说明玩家在菜单里点了“重新开始”)
    const isRestart = (autoRecordState === 'RECORDING' || autoRecordState === 'POST_RACE') && 
                      (telemetry.currentRaceTime !== undefined && telemetry.currentRaceTime < 2) && 
                      (autoRecordStartTime && now - autoRecordStartTime > 10000);

    if (isRestart) {
      console.log('[自动录制] 检测到玩家重新开始比赛，强行结束并保存当前会话，准备重新录制');
      if (autoRecordStopTimer) {
        clearTimeout(autoRecordStopTimer);
        autoRecordStopTimer = null;
      }
      stopAutoRecording();
      return;
    }

    if (autoRecordState === 'IDLE') {
      if (isStartConditionMet) {
        if (speed < SPEED_THRESHOLD) {
          speedSustainStart = null;
        }
        if (!speedSustainStart) {
          speedSustainStart = now;
        }
        
        const isRaceAlreadyInProgress = telemetry.currentRaceTime && telemetry.currentRaceTime > 30;
        const isStaticPosition = staticPositionCount > MAX_STATIC_COUNT;
        const isValidRace = !isStaticPosition || isRaceAlreadyInProgress;

        // 如果已经开始很久了或者起步加速持续了一段时间
        const isSustainedSpeed = isRaceAlreadyInProgress || (now - speedSustainStart >= SPEED_SUSTAIN_MS);

        if (isValidRace && isSustainedSpeed && !autoRecordStartTimer) {
          console.log('[自动录制] 检测到有效比赛开始，启动去抖定时器...');
          autoRecordStartTimer = setTimeout(() => {
            startAutoRecording();
            autoRecordStartTimer = null;
          }, START_DEBOUNCE_MS);
        }
      } else {
        speedSustainStart = null;
        if (autoRecordStartTimer) {
          clearTimeout(autoRecordStartTimer);
          autoRecordStartTimer = null;
        }
      }
    } else {
      // 已经处于录制中 (RECORDING | POST_RACE)
      if (isRaceActive) {
        // 如果重新检测到比赛依然处于激活状态，若之前处于 POST_RACE，则恢复为 RECORDING
        if (autoRecordState === 'POST_RACE') {
          console.log('[自动录制] 检测到比赛继续，取消自动结束定时器');
          autoRecordState = 'RECORDING';
          if (autoRecordStopTimer) {
            clearTimeout(autoRecordStopTimer);
            autoRecordStopTimer = null;
          }
        }
        
        // 持续写入遥测包和打点
        const nowTime = Date.now();
        if (nowTime - lastAutoRecordSaveTime >= 50) {
          if (autoRecordWriteStream) {
            autoRecordWriteStream.write(JSON.stringify({ ...telemetry, _recordedAt: new Date().toISOString() }) + '\n');
            autoRecordDataCount++;
          }
          lastAutoRecordSaveTime = nowTime;
        }

        if (isPositionValid) {
          const currLapTime = telemetry.currentLap || 0;
          // 倒转 (Rewind) 实时防护：当圈时间回退超过 0.5 秒时，自动裁剪倒转期间多余的轨迹打点
          if (autoRacePositions.length > 0 && currLapTime > 0) {
            const lastPtLap = autoRacePositions[autoRacePositions.length - 1].lapTime || 0;
            if (lastPtLap > 0 && currLapTime < lastPtLap - 0.5) {
              console.log(`[自动录制] 检测到玩家触发倒转 (${lastPtLap.toFixed(2)}s ➡️ ${currLapTime.toFixed(2)}s)，自动回裁剪倒转打结点...`);
              while (autoRacePositions.length > 0) {
                const topPt = autoRacePositions[autoRacePositions.length - 1];
                if (topPt.lapTime && topPt.lapTime > currLapTime) {
                  autoRacePositions.pop();
                } else {
                  break;
                }
              }
            }
          }

          if (nowTime - lastAutoPositionSaveTime >= 100) {
            autoRacePositions.push(extractTrackPoint(telemetry));
            lastAutoPositionSaveTime = nowTime;
          }
          
          const trackMode = stateManager.getTrackMode();
          // 路书播报依旧基于 isStartConditionMet 避免倒车/静止时播报，但正常比赛时继续
          if (isStartConditionMet && trackMode && trackMode.detail) {
            const track = trackMode.detail;
            if (track.turns && track.turns.length > 0) {

            }
          }
        }
        
        const packetCount = stateManager.getPacketCount();
        if (packetCount % 30 === 0) {
          stateManager.io.emit('recordStats', {
            state: 'RECORDING',
            pointCount: autoRecordDataCount,
            positionCount: autoRacePositions.length,
            speed: Math.round(speed),
            duration: autoRecordStartTime ? now - autoRecordStartTime : 0
          });
        }
      } else {
        // isRaceActive === false (即 isRaceOn 变成 0，玩家退出比赛或比赛结束)
        if (autoRecordState === 'RECORDING') {
          console.log('[自动录制] 检测到比赛结束(isRaceOn=0)，进入结束缓冲期...');
          autoRecordState = 'POST_RACE';
          autoRecordStopTimer = setTimeout(() => {
            stopAutoRecording();
            autoRecordStopTimer = null;
          }, STOP_DEBOUNCE_MS);
        }
      }
    }

    const trackMode = stateManager.getTrackMode();
    if (isManualRecording && isStartConditionMet && trackMode && trackMode.detail) {
      const track = trackMode.detail;
      if (track.turns && track.turns.length > 0 && isPositionValid) {

      }
    }
  }

  // HTTP API 路由挂载
  router.get('/autoRecord/status', (req, res) => {
    res.json({
      state: autoRecordState,
      isRecording: autoRecordState === 'RECORDING',
      packetCount: autoRecordDataCount,
      positionCount: autoRacePositions.length
    });
  });

  router.post('/record/start', (req, res) => { 
    manualRacePositions.length = 0; 
    manualRecordDataCount = 0;
    lastManualRecordSaveTime = 0;
    lastManualPositionSaveTime = 0;
    isManualRecording = true; 
    
    const tempDir = path.join(DATA_DIR, 'sessions');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    manualRecordTempPath = path.join(tempDir, `temp_manual_record_${Date.now()}.jsonl`);
    manualRecordWriteStream = fs.createWriteStream(manualRecordTempPath, { flags: 'a' });
    manualRecordWriteStream.on('error', (err) => console.error('[手动录制] 文件写入流异常:', err));

    console.log(`[手动录制] 录制开始，流式写入临时文件: ${manualRecordTempPath}`);
    res.json({ status: 'ok' }); 
  });

  router.post('/record/stop', (req, res) => { 
    isManualRecording = false; 
    if (manualRecordWriteStream) {
      manualRecordWriteStream.end();
      manualRecordWriteStream = null;
    }
    console.log(`[手动录制] 录制停止，已录制 ${manualRecordDataCount} 条数据，内存收集 ${manualRacePositions.length} 个轨迹点`);
    res.json({ status: 'ok', count: manualRecordDataCount, positions: manualRacePositions.length }); 
  });

  router.post('/record/save', express.json(), (req, res) => {
    const ts = Date.now();
    const trackName = req.body.trackName || '未命名赛道';
    const trackId = req.body.trackId;
    
    if (!manualRecordTempPath || !fs.existsSync(manualRecordTempPath)) {
      return res.status(400).json({ error: '没有录制数据或临时文件已丢失' });
    }

    const currentData = stateManager.getCurrentData();
    const manCarOrdinal = currentData?.car?.ordinal;
    const manVehicleFromState = manCarOrdinal && manCarOrdinal > 0 ? stateManager.vehicles[String(manCarOrdinal)] : null;
    const manVehicleToSave = manVehicleFromState
      ? { ordinal: manCarOrdinal, name: manVehicleFromState.name, class: manVehicleFromState.class, performanceIndex: manVehicleFromState.pi }
      : (manCarOrdinal > 0 ? currentData.car : null);
    const sessionDataMeta = {
      id: 'session_' + ts,
      trackName: trackName,
      trackId: trackId || null,
      savedAt: new Date().toISOString(),
      autoRecorded: false,
      duration: 0,
      vehicle: manVehicleToSave
    };

    const tempFilePath = manualRecordTempPath;
    const positions = [...manualRacePositions];

    manualRecordTempPath = null;
    manualRacePositions = [];
    manualRecordDataCount = 0;

    const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../storage/save-worker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        tempFilePath,
        positions,
        sessionDataMeta,
        DATA_DIR, tracks: stateManager.tracks,
        trackMode: trackId ? { trackId, trackName } : null
      }
    });

    worker.on('message', (msg) => {
      if (msg.status === 'success') {
        console.log(`[手动录制] 后台保存成功，会话 ID: ${msg.sessionId}`);
        
        if (msg.tracksUpdate) {
          const trUpdate = msg.tracksUpdate;
          stateManager.tracks[trUpdate.id] = trUpdate;
          saveTracksDatabase(stateManager.tracks);
        }

        // 核心修复：通知缓存比赛记录+1
        const targetTrackId = msg.tracksUpdate ? msg.tracksUpdate.id : trackId;
        if (targetTrackId) {
          stateManager.incrementSessionCount(targetTrackId);
        }

        const sessionSummary = msg.sessionSummary;
        const vehicleOrdinal = sessionSummary.vehicle ? sessionSummary.vehicle.ordinal : null;
        if (vehicleOrdinal && stateManager.vehicles[vehicleOrdinal]) {
          stateManager.vehicles[vehicleOrdinal].raceCount = (stateManager.vehicles[vehicleOrdinal].raceCount || 0) + 1;
          if (targetTrackId && targetTrackId !== 'unknown' && !stateManager.vehicles[vehicleOrdinal].tracks.includes(targetTrackId)) {
            stateManager.vehicles[vehicleOrdinal].tracks.push(targetTrackId);
          }
          if (!stateManager.vehicles[vehicleOrdinal].bestLap || (sessionSummary.laps && sessionSummary.laps.best && sessionSummary.laps.best < stateManager.vehicles[vehicleOrdinal].bestLap)) {
            stateManager.vehicles[vehicleOrdinal].bestLap = sessionSummary.laps?.best;
          }
          saveJSON(DATA_DIR + '/vehicles.json', stateManager.vehicles);
        }

        res.json({
          status: 'ok',
          filename: 'session_' + ts + '.json',
          count: sessionSummary.summary.dataCount,
          positions: sessionSummary.summary.positionCount,
          trackId: msg.tracksUpdate ? msg.tracksUpdate.id : null,
          merged: !!trackId,
          trajectoryCount: msg.tracksUpdate ? msg.tracksUpdate.trajectoryCount : 1,
          trackLength: msg.tracksUpdate ? msg.tracksUpdate.length : 0
        });
      } else {
        console.error(`[手动录制] 后台保存失败: ${msg.error}`);
        res.status(500).json({ error: `保存失败: ${msg.error}` });
      }

      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      worker.terminate();
    });

    worker.on('error', (err) => {
      console.error(`[手动录制] 保存工作线程发生错误:`, err);
      res.status(500).json({ error: `保存工作线程崩溃: ${err.message}` });
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      worker.terminate();
    });
  });

  router.get('/record/positions', (req, res) => res.json(manualRacePositions));

  // 独立看门狗：防止游戏闪退或关闭导致永远卡在 RECORDING
  setInterval(() => {
    const now = Date.now();
    if (autoRecordState !== 'IDLE' && autoRecordStartTime) {
      // 如果最后一包是比赛中（可能是暂停），给更宽容的超时时间（比如 40 秒）
      // 如果最后一包不是比赛中（可能在倒转/重置菜单），给 25 秒防抖超时
      const timeoutLimit = (lastTelemetryPacket && lastTelemetryPacket.isRaceOn) ? 40000 : 25000;
      if (now - lastTelemetryPacketTime > timeoutLimit) {
        console.log(`[自动录制] 超过 ${timeoutLimit / 1000} 秒未收到游戏数据包，看门狗强制结束并保存录制`);
        if (autoRecordStopTimer) {
          clearTimeout(autoRecordStopTimer);
          autoRecordStopTimer = null;
        }
        stopAutoRecording();
      }
    }
  }, 2000);

  // 将辅助参数与核心逻辑包导给外部
  export default {
    router,
    handleAutoRecord,
    getIsManualRecording: () => isManualRecording,
    getAutoRecordState: () => autoRecordState,
    getManualRecordDataCount: () => manualRecordDataCount,
    getManualRacePositionsLength: () => manualRacePositions.length,
    onPacketReceived: (telemetry) => {
      if (isManualRecording) {
        const nowTime = Date.now();
        if (nowTime - lastManualRecordSaveTime >= 50) {
          if (manualRecordWriteStream) {
            manualRecordWriteStream.write(JSON.stringify({ ...telemetry, _recordedAt: new Date().toISOString() }) + '\n');
            manualRecordDataCount++;
          }
          lastManualRecordSaveTime = nowTime;
        }
        if (telemetry.position && (telemetry.position.x !== 0 || telemetry.position.z !== 0)) {
          const currLapTime = telemetry.currentLap || 0;
          if (manualRacePositions.length > 0 && currLapTime > 0) {
            const lastPtLap = manualRacePositions[manualRacePositions.length - 1].lapTime || 0;
            if (lastPtLap > 0 && currLapTime < lastPtLap - 0.5) {
              console.log(`[手动录制] 检测到玩家触发倒转 (${lastPtLap.toFixed(2)}s ➡️ ${currLapTime.toFixed(2)}s)，自动回裁剪倒转打结点...`);
              while (manualRacePositions.length > 0) {
                const topPt = manualRacePositions[manualRacePositions.length - 1];
                if (topPt.lapTime && topPt.lapTime > currLapTime) {
                  manualRacePositions.pop();
                } else {
                  break;
                }
              }
            }
          }

          if (nowTime - lastManualPositionSaveTime >= 100) {
            manualRacePositions.push(extractTrackPoint(telemetry));
            lastManualPositionSaveTime = nowTime;
          }
        }
      }
    }
  };
