import { generateTTS } from './tts.js';

let lastAnnouncedTurnIndex = -1;
let lastAnnounceTime = 0;

export function resetAnnouncedTurnIndex(index = -1) {
  lastAnnouncedTurnIndex = index;
}

function setAnnounceTime(time) {
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

let lastNearestIdx = -1;

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

  // 时光倒流/大倒车/重生 防哑巴检测机制 (负向跳变超过 50 个点)
  if (lastNearestIdx !== -1 && nearestIdx < lastNearestIdx - 50) {
    console.log(`[闪回检测] 位置跳变 (${lastNearestIdx} -> ${nearestIdx})，重置播报锁`);
    lastAnnouncedTurnIndex = -1;
  }
  lastNearestIdx = nearestIdx;

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
  
  // 真实轨迹距离计算
  const distToStart = getPathDistance(trackPoints, nearestIdx, nextTurn.startIdx);

  const currentSpeedKmh = nearestPoint.speed || 0;
  const currentSpeedMs = currentSpeedKmh / 3.6;

  // 圈数回绕重置逻辑
  if (lastAnnouncedTurnIndex !== -1 && nextTurnIndex < lastAnnouncedTurnIndex) {
    console.log(`[越线检测] 检测到跨越起跑线进入下一圈 (回绕: ${lastAnnouncedTurnIndex} -> ${nextTurnIndex})`);
    lastAnnouncedTurnIndex = -1;
  }

  // 3. 提取弯道危险等级
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

  // 4. 动态反应时间算法 (TTS 补偿与急弯补足)
  const reactionTime = 3.0; // 基础人类反应时间
  let difficultyBonus = 0;
  if (level === '1' || level === '2') {
    difficultyBonus = 100; // 发卡弯/急弯需要额外的重刹车距离
  } else if (level === '3' || level === '4') {
    difficultyBonus = 50;  // 中速弯
  }

  const ttsCompensation = Math.min(150, currentSpeedMs * 1.5); // 语音合成与念稿子耗时的物理位移补偿
  const preWarnDist = Math.max(100, Math.min(600, (currentSpeedMs * reactionTime) + difficultyBonus + ttsCompensation));

  // 5. 播报触发逻辑
  if (distToStart < preWarnDist && lastAnnouncedTurnIndex < nextTurnIndex) {
    let consecutiveTurn = null;
    let consecutiveTurnIndex = -1;
    let linkTextAnnounce = '';
    let linkTextTTS = '';

    // 判断连续弯 (最大2连击)
    if (nextTurnIndex + 1 < turns.length) {
      const nextNextTurn = turns[nextTurnIndex + 1];
      const distBetweenTurns = getPathDistance(trackPoints, nextTurn.endIdx, nextNextTurn.startIdx);
      
      if (distBetweenTurns < 80) { 
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
    const longAnnounce = nextTurn.isLong ? '长' : '';
    const longTTS = nextTurn.isLong ? '，长' : '';
    
    // 路面状况解析
    let geoText = '';
    if (nextTurn.crest === 'jump') geoText += '飞跳';
    else if (nextTurn.crest === 'crest') geoText += '过坡';
    
    const geoTextWithComma = geoText ? '，' + geoText : '';
    const geoTextCompact = geoText ? ' ' + geoText : '';

    let announceText = '';
    let ttsText = '';

    // 如果判定为连续弯，处理复合播报文本
    if (consecutiveTurn) {
      const nextDir = consecutiveTurn.direction === 'left' ? '左' : '右';
      let nextLevel = consecutiveTurn.severity || '3';
      if (!['1', '2', '3', '4', '5', '6'].includes(String(nextLevel))) {
        const nextAngle = consecutiveTurn.angle || 0;
        if (nextAngle >= 130) nextLevel = '1';
        else if (nextAngle >= 90) nextLevel = '2';
        else if (nextAngle >= 60) nextLevel = '3';
        else if (nextAngle >= 40) nextLevel = '4';
        else if (nextAngle >= 20) nextLevel = '5';
        else nextLevel = '6';
      }
      const nextLongAnnounce = consecutiveTurn.isLong ? '长' : '';
      const nextLongTTS = consecutiveTurn.isLong ? '，长' : '';

      announceText = direction + level + longAnnounce + geoTextCompact + ' ' + linkTextAnnounce + nextDir + nextLevel + nextLongAnnounce;
      ttsText = direction + level + longTTS + geoTextWithComma + linkTextTTS + nextDir + nextLevel + nextLongTTS;
      
      // 直接把状态锁拨到下下个弯，截断
      lastAnnouncedTurnIndex = consecutiveTurnIndex;
    } else {
      // 独立播报
      announceText = direction + level + longAnnounce + geoTextCompact;
      ttsText = direction + level + longTTS + geoTextWithComma;
      
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
      crest: nextTurn.crest,
      isLong: nextTurn.isLong
    });
    
    console.log(`[领航播报] ${announceText} (车速: ${Math.round(currentSpeedKmh)}km/h, 触发: ${Math.round(distToStart)}米, 阈值: ${Math.round(preWarnDist)}米)`);
  }
}
