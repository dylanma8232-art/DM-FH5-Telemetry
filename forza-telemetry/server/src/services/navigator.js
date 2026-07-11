import { generateTTS } from './tts.js';

export let lastAnnouncedTurnIndex = -1;
export let lastAnnounceTime = 0;

export function resetAnnouncedTurnIndex(index = -1) {
  lastAnnouncedTurnIndex = index;
}

export function setAnnounceTime(time) {
  lastAnnounceTime = time;
}

// 辅助函数：计算沿赛道的真实轨迹距离
function getPathDistance(trackPoints, startIdx, endIdx) {
  if (startIdx < 0 || endIdx >= trackPoints.length || startIdx >= endIdx) return 0;
  let dist = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const p1 = trackPoints[i];
    const p2 = trackPoints[i + 1];
    if (p1 && p2) {
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      dist += Math.sqrt(dx * dx + dz * dz);
    }
  }
  return dist;
}

export async function checkAndAnnounceTurn(position, turns, trackPoints, context) {
  if (!position || !turns || turns.length === 0 || !trackPoints || trackPoints.length === 0) {
    return;
  }
  
  const { io } = context;
  const now = Date.now();
  
  let minDist = Infinity;
  let nearestIndex = -1;
  let nearestPoint = null;
  
  // 1. 找到当前车辆在赛道上的最近点
  for (let i = 0; i < trackPoints.length; i++) {
    const p = trackPoints[i];
    const dx = position.x - p.x;
    const dz = position.z - p.z;
    const dist = dx * dx + dz * dz;
    if (dist < minDist) {
      minDist = dist;
      nearestIndex = i;
      nearestPoint = p;
    }
  }
  
  if (!nearestPoint) return;
  const nearestIdx = trackPoints.indexOf(nearestPoint);
  if (nearestIdx === -1) return;

  // 2. 找到需要播报的下一个弯道
  let nextTurn = null;
  let nextTurnIndex = -1;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.startIdx > nearestIdx) {
      nextTurn = turn;
      nextTurnIndex = i;
      break;
    }
  }

  // 如果前方没有弯道，可能身处弯道中
  if (!nextTurn) {
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (nearestIdx >= turn.startIdx && nearestIdx <= turn.endIdx) {
        if (lastAnnouncedTurnIndex < i) {
          nextTurn = turn;
          nextTurnIndex = i;
          break;
        }
      }
    }
  }

  if (!nextTurn) return;

  const turnStartPoint = trackPoints[nextTurn.startIdx];
  if (!turnStartPoint) return;
  
  // 使用轨迹累加距离，解决发卡弯直线距离极短的穿墙误判问题
  const distToStart = getPathDistance(trackPoints, nearestIdx, nextTurn.startIdx);

  const currentSpeedKmh = nearestPoint.speed || 0;
  const currentSpeedMs = currentSpeedKmh / 3.6;

  // 圈数回绕重置逻辑
  if (lastAnnouncedTurnIndex !== -1 && nextTurnIndex < lastAnnouncedTurnIndex) {
    console.log(`[越线检测] 检测到跨越起跑线进入下一圈 (弯道索引回绕: ${lastAnnouncedTurnIndex} -> ${nextTurnIndex})，重置播报状态锁。`);
    lastAnnouncedTurnIndex = -1;
  }

  // 3. 提取弯道危险等级 (Severity)
  const angle = nextTurn.angle || 0;
  let level = nextTurn.severity || '3';
  if (!level || !['1', '2', '3', '4', '5', '6'].includes(String(level))) {
    if (angle >= 130) level = '1';
    else if (angle >= 90) level = '2';
    else if (angle >= 60) level = '3';
    else if (angle >= 40) level = '4';
    else if (angle >= 20) level = '5';
    else level = '6';
  }

  // 4. 动态反应时间算法
  let reactionTime = 4.5;
  if (level === '1' || level === '2') {
    reactionTime = 6.5; // 发卡弯/急弯需要更长的预警时间来重刹
  } else if (level === '3' || level === '4') {
    reactionTime = 4.5; // 中速弯
  } else {
    reactionTime = 3.0; // 高速弯，不需要提早报
  }
  
  // 计算预警触发距离，边界 100米 - 550米
  const preWarnDist = Math.max(100, Math.min(550, currentSpeedMs * reactionTime));

  // 5. 播报触发逻辑
  if (distToStart < preWarnDist && lastAnnouncedTurnIndex < nextTurnIndex) {
    let consecutiveTurn = null;
    let consecutiveTurnIndex = -1;
    let linkTextAnnounce = '';
    let linkTextTTS = '';

    // 判断连续弯 (接/紧接)
    if (nextTurnIndex + 1 < turns.length) {
      const nextNextTurn = turns[nextTurnIndex + 1];
      // 计算两个弯道之间的真实轨迹距离
      const distBetweenTurns = getPathDistance(trackPoints, nextTurn.endIdx, nextNextTurn.startIdx);
      
      if (distBetweenTurns < 80) { // 从 180米直线距离 改为 80米真实赛道距离
        consecutiveTurn = nextNextTurn;
        consecutiveTurnIndex = nextTurnIndex + 1;
        if (distBetweenTurns < 30) {
          linkTextAnnounce = '紧接';
          linkTextTTS = '，紧接';
        } else {
          linkTextAnnounce = '接';
          linkTextTTS = '，接';
        }
      }
    }

    const direction = nextTurn.direction === 'left' ? '左' : (nextTurn.direction === 'right' ? '右' : '');
    
    // 路面状况解析
    let geoText = '';
    if (nextTurn.crest === 'jump') geoText += '飞跳';
    else if (nextTurn.crest === 'crest') geoText += '过坡';
    if (nextTurn.camber === 'off-camber') geoText += '外倾';
    else if (nextTurn.camber === 'banking') geoText += '斜坡';
    
    const geoTextWithComma = geoText ? '，' + geoText : '';
    const geoTextCompact = geoText ? ' ' + geoText : '';

    let announceText = '';
    let ttsText = '';

    // 如果判定为连续弯，处理复合播报文本
    if (consecutiveTurn) {
      const nextDir = consecutiveTurn.direction === 'left' ? '左' : '右';
      let nextLevel = consecutiveTurn.severity || '3';
      if (!nextLevel || !['1', '2', '3', '4', '5', '6'].includes(String(nextLevel))) {
        const nextAngle = consecutiveTurn.angle || 0;
        if (nextAngle >= 130) nextLevel = '1';
        else if (nextAngle >= 90) nextLevel = '2';
        else if (nextAngle >= 60) nextLevel = '3';
        else if (nextAngle >= 40) nextLevel = '4';
        else if (nextAngle >= 20) nextLevel = '5';
        else nextLevel = '6';
      }
      announceText = direction + level + geoTextCompact + ' ' + linkTextAnnounce + nextDir + nextLevel;
      ttsText = direction + level + geoTextWithComma + linkTextTTS + nextDir + nextLevel;
      
      // 核心修复：直接把状态锁拨到下下个弯，防止过弯后重复播报下下个弯
      lastAnnouncedTurnIndex = consecutiveTurnIndex;
    } else {
      // 独立播报，带上更加智能的取整距离
      let distText = 0;
      if (distToStart > 100) {
          distText = Math.round(distToStart / 50) * 50; // 百米以上按 50米 精度取整
      } else {
          distText = Math.round(distToStart / 10) * 10; // 百米以内按 10米 精度取整
      }
      announceText = direction + level + geoTextCompact + ' ' + distText;
      ttsText = direction + level + geoTextWithComma + '，' + distText + '米';
      
      lastAnnouncedTurnIndex = nextTurnIndex;
    }

    if (nextTurn.customNote) {
      announceText += ' ' + nextTurn.customNote;
      ttsText += '，' + nextTurn.customNote;
    }

    lastAnnounceTime = now;

    // 触发 TTS 与前端通信
    const audioUrl = await generateTTS(ttsText);
    io.emit('turnAnnounce', { 
      text: announceText, 
      ttsText: ttsText,
      audioUrl: audioUrl,
      direction: nextTurn.direction, 
      level: level,
      angle: angle,
      distance: Math.round(distToStart),
      turnType: nextTurn.type,
      announceType: 'pre_warn',
      radius: nextTurn.radius || 0,
      camber: nextTurn.camber,
      crest: nextTurn.crest
    });
    
    console.log(`[领航播报] ${announceText} (车速: ${Math.round(currentSpeedKmh)}km/h, 提前量: ${Math.round(distToStart)}米, 反应时间: ${reactionTime}s)`);
  }
}
