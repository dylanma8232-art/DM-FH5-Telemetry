import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaceNoteExport } from './PaceNoteExport';
import { api } from '../../services/api';

/**
 * PaceNotesPanel - 路书面板
 *
 * 基于赛道已有数据 (turns / sectors / centerline / navigation) 自动生成路书。
 * 紧凑型设计，适合驾驶时快速扫视。
 *
 * 功能:
 * 1. 弯道路书: 方向、角度、推荐速度、推荐档位、刹车点
 * 2. 特殊路段: 直道加速区、刹车区、坡度变化
 * 3. 路面信息: 砾石、积水、路肩等 (来自轨迹点 onRumble/puddle/surfaceRumble)
 * 4. 实时高亮: 根据当前位置跟踪当前/下一个弯道
 * 5. 导出: 支持文本和图片导出
 */

// ==================== 工具函数 ====================

/** 推荐速度 -> 推荐档位（与 TurnWarningHUD 保持一致） */
function recommendGearForSpeed(speedKmh) {
  if (speedKmh <= 0) return 'N';
  if (speedKmh < 30) return 1;
  if (speedKmh < 60) return 2;
  if (speedKmh < 100) return 3;
  if (speedKmh < 140) return 4;
  if (speedKmh < 180) return 5;
  if (speedKmh < 220) return 6;
  return 7;
}

/** 弯道类型中文标签（统一 1-6 等级） */
const TURN_TYPE_LABELS = {
  hairpin: '1',
  sharp: '2',
  medium: '3',
  gentle: '4',
  slight: '5',
  micro: '6',
  sweeping: '4',
};

/** 弯道类型严重度（越高越需要注意） */
const TURN_SEVERITY = {
  hairpin: 6,
  sharp: 5,
  medium: 4,
  gentle: 3,
  slight: 2,
  micro: 1,
  sweeping: 3,
};

/** 路面类型映射 */
const SURFACE_MAP = {
  onRumble: { label: '路肩', icon: 'W', color: '#d29922' },
  puddle: { label: '积水', icon: '~', color: '#58a6ff' },
  surfaceRumble: { label: '碎石', icon: '*', color: '#a371f7' },
};

// ==================== 路书数据生成 ====================

/**
 * 从 turns / sectors / centerline / navigation 自动生成路书条目
 */
function generatePaceNotes(trackData) {
  const notes = [];
  if (!trackData) return notes;

  const { turns, sectors, centerline, navigation, points } = trackData;

  // 1. 从弯道数据生成弯道路书（WRC标准）
  if (turns && turns.length > 0) {
    turns.forEach((turn, idx) => {
      const recSpeed = turn.apexSpeed || turn.bestApexSpeed || 0;
      const recGear = recSpeed > 0 ? recommendGearForSpeed(recSpeed) : null;
      const dirLabel = turn.direction === 'left' ? '左' : '右';
      
      const wrcNumber = turn.wrcNumber || turn.severity || 0;
      const wrcLabel = wrcNumber > 0 ? `${dirLabel}${wrcNumber}` : '';

      // 计算刹车点距离弯道的距离（利用 suggestedBrakePoint 和弯道 index）
      let brakeDistance = 0;
      if (turn.suggestedBrakePoint !== undefined && turn.index !== undefined && centerline) {
        const brakePt = centerline[turn.suggestedBrakePoint];
        const turnPt = centerline[turn.index];
        if (brakePt && turnPt) {
          const dx = brakePt.x - turnPt.x;
          const dz = brakePt.z - turnPt.z;
          brakeDistance = Math.round(Math.sqrt(dx * dx + dz * dz));
        }
      }

      // 速度差值信息
      const speedDiff = (turn.bestEntrySpeed || 0) - (turn.bestExitSpeed || 0);

      // 计算到下一个弯道的实际路段距离 (沿中心线计算)
      let distanceToNext = 0;
      if (centerline) {
        const nextTurn = turns[(idx + 1) % turns.length];
        const start = turn.endIdx !== undefined ? turn.endIdx : turn.index;
        const end = nextTurn.startIdx !== undefined ? nextTurn.startIdx : nextTurn.index;
        if (start !== undefined && end !== undefined) {
          if (start < end) {
            for (let i = start + 1; i <= end && i < centerline.length; i++) {
              const dx = centerline[i].x - centerline[i-1].x;
              const dz = centerline[i].z - centerline[i-1].z;
              distanceToNext += Math.sqrt(dx * dx + dz * dz);
            }
          } else {
            // 环形赛道跨越起点终点
            for (let i = start + 1; i < centerline.length; i++) {
              const dx = centerline[i].x - centerline[i-1].x;
              const dz = centerline[i].z - centerline[i-1].z;
              distanceToNext += Math.sqrt(dx * dx + dz * dz);
            }
            for (let i = 1; i <= end && i < centerline.length; i++) {
              const dx = centerline[i].x - centerline[i-1].x;
              const dz = centerline[i].z - centerline[i-1].z;
              distanceToNext += Math.sqrt(dx * dx + dz * dz);
            }
          }
        }
      }

      notes.push({
        type: 'turn',
        id: `turn-${idx}`,
        index: turn.index,
        turnIndex: idx,
        x: turn.x,
        z: turn.z,
        direction: turn.direction,
        dirLabel,
        wrcNumber,
        wrcLabel,
        severity: wrcNumber || 3,
        angle: turn.angle,
        turnType: turn.type,
        turnTypeLabel: TURN_TYPE_LABELS[turn.type] || turn.type,
        entrySpeed: turn.entrySpeed || turn.bestEntrySpeed || 0,
        recommendedGear: recGear,
        brakeDistance,
        speedDiff,
        bestEntrySpeed: turn.bestEntrySpeed,
        bestExitSpeed: turn.bestExitSpeed,
        // 组合弯信息
        isChicane: turn.isChicane,
        chicaneDirection: turn.chicaneDirection,
        camber: turn.camber,
        crest: turn.crest,
        customNote: turn.customNote || '',
        startIdx: turn.startIdx,
        endIdx: turn.endIdx,
        // 到下一弯的直道物理距离
        distanceToNext: Math.round(distanceToNext)
      });
    });
  }

  // 2. 从弯道间距离推导特殊路段（直道加速区、刹车区）
  if (notes.length >= 2) {
    for (let i = 0; i < notes.length - 1; i++) {
      const curr = notes[i];
      const next = notes[i + 1];
      const dx = next.x - curr.x;
      const dz = next.z - curr.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 500) {
        // 长直道 -> 加速区
        notes.push({
          type: 'straight',
          id: `straight-${i}`,
          betweenTurns: [i, i + 1],
          distance: Math.round(dist),
          label: '长直道',
          severity: 1,
          x: (curr.x + next.x) / 2,
          z: (curr.z + next.z) / 2,
        });
      }

      if (next.entrySpeed > 0 && curr.entrySpeed > 0) {
        const speedDelta = next.entrySpeed - curr.entrySpeed;
        if (speedDelta < -40) {
          // 急剧减速区
          notes.push({
            type: 'braking_zone',
            id: `brake-zone-${i}`,
            beforeTurn: i + 1,
            speedDelta: Math.round(speedDelta),
            label: '重刹区',
            severity: 4,
            x: next.x,
            z: next.z,
          });
        }
      }
    }
  }

  // 3. 从导航点提取路面信息
  if (navigation && navigation.length > 0) {
    const surfacePoints = new Map();

    // 也从原始轨迹点提取路面信息
    if (points && points.length > 0) {
      points.forEach((p) => {
        const surfaces = [];
        if (p.onRumble) surfaces.push('onRumble');
        if (p.puddle > 0.5) surfaces.push('puddle');
        if (p.surfaceRumble > 0.3) surfaces.push('surfaceRumble');

        if (surfaces.length > 0) {
          const key = `${Math.round(p.x / 10)},${Math.round(p.z / 10)}`;
          if (!surfacePoints.has(key)) {
            surfacePoints.set(key, {
              x: p.x,
              z: p.z,
              surfaces,
              count: 1,
            });
          } else {
            const existing = surfacePoints.get(key);
            existing.surfaces = [...new Set([...existing.surfaces, ...surfaces])];
            existing.count++;
          }
        }
      });
    }

    // 只保留出现多次的路面区域
    surfacePoints.forEach((sp, key) => {
      if (sp.count >= 3) {
        notes.push({
          type: 'surface',
          id: `surface-${key}`,
          x: sp.x,
          z: sp.z,
          surfaces: sp.surfaces,
          severity: 2,
        });
      }
    });
  }

  // 4. 从 centerline Y 值变化推导坡度信息
  if (centerline && centerline.length > 20) {
    const step = Math.max(1, Math.floor(centerline.length / 50)); // 采样约50个点
    for (let i = step; i < centerline.length - step; i += step) {
      const prev = centerline[i - step];
      const curr = centerline[i];
      const next = centerline[Math.min(i + step, centerline.length - 1)];

      if (!prev || !curr || !next) continue;

      const heightDiff = (next.y || 0) - (prev.y || 0);
      if (Math.abs(heightDiff) > 5) {
        // 排除与已有弯道重合的位置
        const tooClose = notes.some(
          (n) =>
            n.type === 'turn' &&
            n.x !== undefined &&
            Math.abs(n.x - curr.x) < 20 &&
            Math.abs(n.z - curr.z) < 20
        );

        if (!tooClose) {
          notes.push({
            type: 'elevation',
            id: `elev-${i}`,
            x: curr.x,
            z: curr.z,
            slopeType: heightDiff > 0 ? 'uphill' : 'downhill',
            slopeMagnitude: Math.round(Math.abs(heightDiff)),
            label:
              Math.abs(heightDiff) > 15
                ? heightDiff > 0
                  ? '急上坡'
                  : '急下坡'
                : heightDiff > 0
                  ? '上坡'
                  : '下坡',
            severity: Math.abs(heightDiff) > 15 ? 3 : 2,
          });
        }
      }
    }
  }

  // 按 index 排序（有 index 的排前面，没有的排后面）
  notes.sort((a, b) => {
    if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
    if (a.index !== undefined) return -1;
    if (b.index !== undefined) return 1;
    return 0;
  });

  return notes;
}

/**
 * 找到当前位置最近的中心线索引
 */
function findNearestIndex(position, centerline) {
  if (!position || !centerline || centerline.length === 0) return -1;
  let minDist = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];
    const dx = position.x - p.x;
    const dz = position.z - p.z;
    const dist = dx * dx + dz * dz;
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

/**
 * 获取弯道方向箭头字符
 */
function getDirectionArrow(direction) {
  switch (direction) {
    case 'left': return '\u2196'; // ↖
    case 'right': return '\u2197'; // ↗
    default: return '\u2191'; // ↑
  }
}

/**
 * 标准拉力路书标签：方向+等级（如 "左3" / "右1"）
 */
function getWrcLabel(note) {
  if (!note) return '';
  const dir = note.direction === 'left' ? '左' : '右';
  const sev = note.wrcNumber || note.severity || '3';
  return `${dir}${sev}`;
}

// ==================== 路书条目子组件 ====================

/** 动态 SVG 弯道图形 */
function TurnIcon({ direction, severity }) {
  const isLeft = direction === 'left';
  const sevNum = parseInt(severity, 10) || 3; // 1 to 6
  
  // 颜色根据严重度区分：1-2红，3-4橙，5-6绿
  let strokeColor = '#3fb950'; // 5, 6
  if (sevNum <= 2) strokeColor = '#f85149'; // 1, 2
  else if (sevNum <= 4) strokeColor = '#f0883e'; // 3, 4

  let pathD = '';
  if (sevNum === 1) {
    // 发卡弯 (U-turn)
    pathD = isLeft 
      ? "M 16,20 L 16,10 A 4,4 0 0,0 8,10 L 8,20" 
      : "M 8,20 L 8,10 A 4,4 0 0,1 16,10 L 16,20";
  } else if (sevNum === 2) {
    // 急弯 (90-deg angle)
    pathD = isLeft
      ? "M 18,20 L 18,10 L 6,10 M 10,6 L 6,10 L 10,14"
      : "M 6,20 L 6,10 L 18,10 M 14,6 L 18,10 L 14,14";
  } else {
    // 3-6 弧弯：严重度越低，弯度越小，越直
    const curveAmount = 24 - (sevNum * 2.5); // severity 3 => 16.5, severity 6 => 9
    if (isLeft) {
      pathD = `M 17,20 Q 17,11 ${17 - curveAmount},9 M ${21 - curveAmount},12 L ${17 - curveAmount},9 L ${20 - curveAmount},6`;
    } else {
      pathD = `M 7,20 Q 7,11 ${7 + curveAmount},9 M ${3 + curveAmount},12 L ${7 + curveAmount},9 L ${4 + curveAmount},6`;
    }
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: strokeColor, flexShrink: 0 }} stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d={pathD} />
    </svg>
  );
}

/** 弯道路书条目 - WRC简化版 */
function TurnNoteItem({ note, isActive, isNext, currentSpeed }) {
  const dirArrow = getDirectionArrow(note.direction);
  const severityVal = note.severity || (note.wrcLabel ? note.wrcLabel.match(/\d/)?.[0] : null) || '3';

  const bgStyle = isActive
    ? {
        background: 'rgba(88, 166, 255, 0.15)',
        borderLeft: '3px solid #58a6ff',
      }
    : isNext
      ? {
          background: 'rgba(210, 153, 34, 0.1)',
          borderLeft: '3px solid #d29922',
        }
      : {
          background: '#0d1117',
          borderLeft: '3px solid transparent',
        };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px',
        borderRadius: 3,
        fontSize: 10,
        fontFamily: 'monospace',
        transition: 'all 0.15s',
        ...bgStyle,
      }}
    >
      {/* 序号 */}
      <span
        style={{
          color: isActive ? '#58a6ff' : '#484f58',
          fontWeight: 700,
          minWidth: 16,
          textAlign: 'center',
          fontSize: 9,
        }}
      >
        {note.turnIndex + 1}
      </span>

      {/* 动态弯道图片图示 */}
      {note.direction && (
        <TurnIcon direction={note.direction} severity={severityVal} />
      )}

      {/* WRC编号（核心） */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: isActive ? '#58a6ff' : note.direction === 'left' ? '#a371f7' : '#f0883e',
          lineHeight: 1,
          minWidth: 24,
          textAlign: 'center',
        }}
      >
        {note.wrcLabel || dirArrow}
      </span>

      {/* 几何特征徽章 */}
      {note.crest === 'jump' && (
        <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: '#f85149', color: '#fff', fontWeight: 'bold', transform: 'scale(0.85)', transformOrigin: 'left center', display: 'inline-block' }}>飞跳 ✈</span>
      )}

      {/* 当前激活指示器 */}
      {isActive && (
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#58a6ff',
            boxShadow: '0 0 6px #58a6ff',
            marginLeft: 'auto',
          }}
        />
      )}
    </div>
  );
}

/** 特殊路段条目 */
function SpecialNoteItem({ note, isActive }) {
  const typeConfig = {
    straight: { icon: '>>', color: '#3fb950', label: '加速' },
    braking_zone: { icon: '!!', color: '#f85149', label: '刹车' },
    elevation: {
      icon: note.slopeType === 'uphill' ? '/\\' : '\\/',
      color: note.slopeMagnitude > 15 ? '#d29922' : '#8b949e',
      label: note.label,
    },
    surface: { icon: '~*', color: '#a371f7', label: '路面' },
  };

  const config = typeConfig[note.type] || { icon: '?', color: '#8b949e', label: '' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        background: isActive ? 'rgba(210,153,34,0.1)' : 'rgba(22,27,34,0.5)',
        borderLeft: isActive ? '2px solid #d29922' : '2px solid transparent',
        fontSize: 9,
        color: '#8b949e',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ color: config.color, fontWeight: 700, minWidth: 16 }}>{config.icon}</span>
      <span style={{ color: isActive ? '#c9d1d9' : '#8b949e', fontWeight: 600 }}>
        {config.label}
      </span>
      {note.type === 'straight' && note.distance > 0 && (
        <span style={{ color: '#484f58' }}>{note.distance}m</span>
      )}
      {note.type === 'braking_zone' && (
        <span style={{ color: '#f85149' }}>Δ{note.speedDelta}km/h</span>
      )}
      {note.type === 'surface' && note.surfaces && (
        <span style={{ color: '#a371f7' }}>
          {note.surfaces.map((s) => SURFACE_MAP[s]?.label || s).join('+')}
        </span>
      )}
    </div>
  );
}

// ==================== 主面板组件 ====================

export function PaceNotesPanel({
  trackData,
  position,
  currentSpeed = 0,
  isRaceOn = 0,
  racePosition = 0,
  gear = 0,
  compact = false,
  onExit,
}) {
  const [activeTurnIdx, setActiveTurnIdx] = useState(-1);
  const hasRaceStarted = isRaceOn && (racePosition > 0 || currentSpeed > 5);
  const [nextTurnIdx, setNextTurnIdx] = useState(-1);
  const [showExport, setShowExport] = useState(false);
  const [scrollToActive, setScrollToActive] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleExitConfirm = async () => {
    try {
      await api.trackMode.stopResponse();
      if (onExit) onExit();
    } catch (e) {
      console.error(e);
    }
    setShowExitConfirm(false);
  };
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  // 1. 已播报弯道索引管理
  const broadcastedTurnsInLapRef = useRef(new Set());
  const prevNearestIdxRef = useRef(-1);
  const pauseTimerRef = useRef(null);

  // 2. 缓存各点到起点的累积物理距离
  const cumDist = useMemo(() => {
    if (!trackData?.centerline) return [];
    const pts = trackData.centerline;
    const arr = new Array(pts.length);
    arr[0] = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = (pts[i].y || 0) - (pts[i - 1].y || 0);
      const dz = pts[i].z - pts[i - 1].z;
      arr[i] = arr[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return arr;
  }, [trackData?.centerline]);

  // 3. 物理距离计算辅助函数
  const getDistanceBetween = (start, end) => {
    if (!cumDist || cumDist.length === 0) return 0;
    if (start === end) return 0;
    if (start < end) return cumDist[end] - cumDist[start];
    const total = cumDist[cumDist.length - 1];
    return (total - cumDist[start]) + cumDist[end];
  };

  // 只计算赛道前方距离；点对点赛不允许把已经通过的弯当成“绕一圈后”的目标。
  const getForwardDistance = (start, end) => {
    if (!trackData?.isLoop && end < start) return Infinity;
    return getDistanceBetween(start, end);
  };

  // 4. 判定弯道是否在车辆前方 (环线逻辑)
  const isTurnAhead = (turnIdx, currentIdx, totalPoints) => {
    let diff = turnIdx - currentIdx;
    if (diff < 0) diff += totalPoints;
    return diff < totalPoints / 2;
  };

  // 赛道切换时重置状态
  useEffect(() => {
    setActiveTurnIdx(-1);
    broadcastedTurnsInLapRef.current.clear();
    prevNearestIdxRef.current = -1;
  }, [trackData?.id]);

  // 生成路书数据
  const paceNotes = useMemo(() => generatePaceNotes(trackData), [trackData]);

  // 仅保留弯道路书（用于导航跟踪与播报）
  const turnNotes = useMemo(
    () => paceNotes.filter((n) => n.type === 'turn'),
    [paceNotes]
  );

  // 实时追踪当前/下一个弯道，并执行路书前瞻播报与回溯、暂停处理
  useEffect(() => {
    if (!position || !trackData?.centerline || turnNotes.length === 0) {
      setActiveTurnIdx(-1);
      setNextTurnIdx(-1);
      return;
    }

    const nearestIdx = findNearestIndex(position, trackData.centerline);
    if (nearestIdx < 0) return;

    const centerlineLength = trackData.centerline.length;

    // --- A. 双重暂停与流超时器处理 ---
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    
    // 超时器：1秒没有新包，立即静音
    pauseTimerRef.current = setTimeout(() => {
      import('../../utils/speechQueue').then(m => {
        m.speechManager.cancelCurrent();
      });
    }, 1000);

    if (!isRaceOn) {
      if (broadcastedTurnsInLapRef.current.size > 0) {
        broadcastedTurnsInLapRef.current.clear();
      }
      prevNearestIdxRef.current = -1;
      import('../../utils/speechQueue').then(m => {
        m.speechManager.cancelCurrent();
      });
    } else if (prevNearestIdxRef.current !== -1) {
      const indexDiff = nearestIdx - prevNearestIdxRef.current;
      
      // B1. 检测跨越终点 (新一圈)
      if (indexDiff < -centerlineLength / 2) {
        broadcastedTurnsInLapRef.current.clear();
      } 
      // B2. 检测时间回溯 (Rewind)
      else if (indexDiff < -80 && indexDiff > -centerlineLength / 2) {
        console.log(`[路书播报] 侦测到回溯: nearestIdx ${prevNearestIdxRef.current} -> ${nearestIdx}`);
        const toClear = [];
        for (const turnIdxGlobal of broadcastedTurnsInLapRef.current) {
          const turn = turnNotes[turnIdxGlobal];
          if (turn && isTurnAhead(turn.index, nearestIdx, centerlineLength)) {
            toClear.push(turnIdxGlobal);
          }
        }
        toClear.forEach(idx => broadcastedTurnsInLapRef.current.delete(idx));
        console.log(`[路书播报] 已重置前方弯道播报状态:`, toClear);
      }
    }
    prevNearestIdxRef.current = nearestIdx;

    // --- C. 寻找下一个要高亮/激活的弯道 (UI高亮逻辑保持原样) ---
    let nextForwardIdx = -1;
    for (let i = 0; i < turnNotes.length; i++) {
      if (turnNotes[i].index > nearestIdx) {
        nextForwardIdx = i;
        break;
      }
    }
    if (nextForwardIdx === -1 && trackData.isLoop && turnNotes.length > 0) {
      nextForwardIdx = 0;
    }

    if (nextForwardIdx !== -1) {
      const targetNote = turnNotes[nextForwardIdx];
      let indexDiff = targetNote.index - nearestIdx;
      if (indexDiff < 0 && trackData.isLoop) {
        indexDiff = (targetNote.index + centerlineLength) - nearestIdx;
      }

      const pointsPreview = Math.max(25, Math.round(currentSpeed * 0.347));

      let passedDiff = nearestIdx - targetNote.index;
      if (passedDiff < 0 && trackData.isLoop) {
        passedDiff = (nearestIdx + centerlineLength) - targetNote.index;
      }

      const isApproaching = indexDiff <= pointsPreview;
      const hasPassed = passedDiff > 12 && passedDiff < centerlineLength - pointsPreview;

      if (isApproaching && !hasPassed) {
        setActiveTurnIdx(nextForwardIdx);
        const next = nextForwardIdx + 1 < turnNotes.length ? nextForwardIdx + 1 : 0;
        setNextTurnIdx(next);
        setScrollToActive(true);
      } else {
        setActiveTurnIdx(-1);
        setNextTurnIdx(nextForwardIdx);
        setScrollToActive(false);
      }
    } else {
      setActiveTurnIdx(-1);
      setNextTurnIdx(-1);
      setScrollToActive(false);
    }

    // --- D. 独立的语音提前播报逻辑 (时速前瞻 + 真实WRC等级同步) ---

    if (hasRaceStarted && gear !== 0 && currentSpeed > 20) {
      // 从仪表盘正在跟踪的“下一个几何弯”开始找未播报项，避免被数组前方的旧弯卡住。
      let nextUnspokenIdx = -1;
      if (nextForwardIdx !== -1) {
        for (let offset = 0; offset < turnNotes.length; offset++) {
          const rawIdx = nextForwardIdx + offset;
          if (!trackData.isLoop && rawIdx >= turnNotes.length) break;
          const candidateIdx = rawIdx % turnNotes.length;
          if (!broadcastedTurnsInLapRef.current.has(candidateIdx)) {
            nextUnspokenIdx = candidateIdx;
            break;
          }
        }
      }

      if (nextUnspokenIdx !== -1) {
        const nextTurn = turnNotes[nextUnspokenIdx];
        const targetIdx = nextTurn.startIdx !== undefined ? nextTurn.startIdx : nextTurn.index;
        
        // 计算车辆与该弯道入口的物理距离
        const distToEntry = getForwardDistance(nearestIdx, targetIdx);
        
        // 动态前瞻物理距离：低速至少提前 85 米，高速视界提前 3.5 秒
        const previewDistance = Math.max(85, (currentSpeed / 3.6) * 3.5);

        if (distToEntry <= previewDistance) {
          let text = getWrcLabel(nextTurn);

          // 级联播报判定：下个弯与当前弯直道距离小于 120 米
          const nextNote = turnNotes[nextUnspokenIdx + 1];
          if (nextNote && nextTurn.distanceToNext < 120) {
            text += `，接${getWrcLabel(nextNote)}`;
          }

          // 地形与坡度描述
          if (nextTurn.crest === 'jump') text += '，飞跳';
          else if (nextTurn.crest === 'crest') text += '，过坡';

          // 自定义语音备注
          if (nextTurn.customNote) {
            text += `，${nextTurn.customNote}`;
          }

          import('../../utils/speechQueue').then(m => {
            // 语音忙碌或被高优先级警告打断时，保持未播报状态，让后续遥测重试。
            if (m.speechManager.speak(text, 2)) {
              broadcastedTurnsInLapRef.current.add(nextUnspokenIdx);
              if (nextNote && nextTurn.distanceToNext < 120) {
                broadcastedTurnsInLapRef.current.add(nextUnspokenIdx + 1);
              }
            }
          });
        }
      }
    }
  }, [position, trackData, turnNotes, currentSpeed, isRaceOn, racePosition, gear]);

  // 自动滚动到当前激活弯道
  useEffect(() => {
    if (scrollToActive && activeItemRef.current && listRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [scrollToActive, activeTurnIdx]);

  // ==================== 无数据状态 ====================
  if (!trackData || paceNotes.length === 0) {
    return (
      <div
        style={{
          background: '#161b22',
          borderRadius: 8,
          border: '1px solid #21262d',
          padding: 10,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* 顶部标题行：路书 + ? 按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>路书</span>
          <span
            onClick={() => setShowGlossary(true)}
            style={{
              cursor: 'pointer',
              color: '#8b949e',
              fontSize: 10,
              fontWeight: 'bold',
              padding: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              width: 14,
              height: 14,
              flexShrink: 0,
            }}
            title="路书术语释义"
          >
            ?
          </span>
        </div>
        {/* 空状态提示 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 20, color: '#484f58', fontWeight: 300, marginBottom: 4 }}>
            NOTE
          </div>
          <div style={{ fontSize: 10, color: '#484f58' }}>
            需要赛道数据才能生成路书
          </div>
        </div>
        {showGlossary && <PaceNoteGlossaryModal onClose={() => setShowGlossary(false)} />}
      </div>
    );
  }

  // ==================== 紧凑模式 ====================
  if (compact) {
    const nextNote = nextTurnIdx >= 0 ? turnNotes[nextTurnIdx] : null;
    const activeNote = activeTurnIdx >= 0 ? turnNotes[activeTurnIdx] : null;
    const displayNote = activeNote || nextNote;
    const hasBoth = activeNote && nextNote && activeNote !== nextNote;

    return (
      <div
        style={{
          background: '#161b22',
          borderRadius: 8,
          border: '1px solid #21262d',
          padding: '10px 12px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box'
        }}
      >
        {/* 标题行 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
            flexShrink: 0
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            路书
            <span
              onClick={() => setShowGlossary(true)}
              style={{
                cursor: 'pointer',
                color: '#8b949e',
                fontSize: 10,
                fontWeight: 'bold',
                padding: '0 4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                width: 14,
                height: 14
              }}
              title="路书术语释义"
            >
              ?
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* 退出按钮 */}
            <button
              onClick={() => setShowExitConfirm(true)}
              style={{
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: 3,
                padding: '2px 6px',
                color: '#f85149',
                fontSize: 9,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              退出
            </button>
            <span style={{ fontSize: 9, color: '#484f58' }}>
              弯道数: {turnNotes.length}
            </span>
            {hasRaceStarted && displayNote && (
              <span
                style={{
                  fontSize: 9,
                  color: displayNote === activeNote ? '#58a6ff' : '#d29922',
                  fontWeight: 600,
                }}
              >
                {displayNote === activeNote ? '当前弯道' : '下一弯道'}
              </span>
            )}
          </div>
        </div>

        {/* 弯道内容区 */}
        {!hasRaceStarted ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#58a6ff',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            路书已加载，等待比赛开始...
          </div>
        ) : displayNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 8 }}>
            
            {/* 上部主行：WRC路书格式 - 只显示编号 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                justifyContent: 'center',
              }}
            >
              {/* WRC编号（核心） */}
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 900,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  color: displayNote.direction === 'left' ? '#a371f7' : '#f0883e',
                  lineHeight: 1.1,
                  textAlign: 'center',
                  textShadow: displayNote === activeNote ? '0 0 20px rgba(88,166,255,0.5)' : 'none',
                }}
              >
                {getDirectionArrow(displayNote.direction)} {getWrcLabel(displayNote)}
              </span>
            </div>

            {/* 下部次行：下一弯道预览 */}
            {hasBoth && (
              <div style={{
                borderTop: '1px solid rgba(48, 54, 61, 0.4)',
                paddingTop: 5,
                fontSize: 12,
                color: '#d29922',
                textAlign: 'center',
                fontWeight: 700,
              }}>
                下一个：{getWrcLabel(nextNote)}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#484f58',
              fontSize: 10,
            }}
          >
            {turnNotes.length > 0 ? '已通过所有弯道' : '无弯道数据'}
          </div>
        )}
        {showGlossary && <PaceNoteGlossaryModal onClose={() => setShowGlossary(false)} />}
        {showExitConfirm && (
          <ExitConfirmModal
            onConfirm={handleExitConfirm}
            onCancel={() => setShowExitConfirm(false)}
          />
        )}
      </div>
    );
  }

  // ==================== 完整模式 ====================
  return (
    <div
      style={{
        background: '#161b22',
        borderRadius: 8,
        border: '1px solid #21262d',
        padding: 10,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          路书
          <span
            onClick={() => setShowGlossary(true)}
            style={{
              cursor: 'pointer',
              color: '#8b949e',
              fontSize: 10,
              fontWeight: 'bold',
              padding: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              width: 14,
              height: 14
            }}
            title="路书术语释义"
          >
            ?
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#484f58' }}>
            {trackData?.name || '赛道'} | {turnNotes.length}弯 | {(trackData?.length / 1000).toFixed(1)}km
          </span>
          {/* 退出按钮 */}
          <button
            onClick={() => setShowExitConfirm(true)}
            style={{
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.3)',
              borderRadius: 3,
              padding: '2px 6px',
              color: '#f85149',
              fontSize: 9,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            退出
          </button>

          {/* 导出按钮 */}
          <button
            onClick={() => setShowExport(!showExport)}
            style={{
              background: 'rgba(88,166,255,0.1)',
              border: '1px solid rgba(88,166,255,0.3)',
              borderRadius: 3,
              padding: '2px 6px',
              color: '#58a6ff',
              fontSize: 9,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            导出
          </button>
        </div>
      </div>

      {/* 导出面板 */}
      {showExport && (
        <PaceNoteExport paceNotes={paceNotes} trackData={trackData} turnNotes={turnNotes} />
      )}

      {/* 图例 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 4,
          fontSize: 8,
          color: '#484f58',
          flexShrink: 0,
          paddingBottom: 3,
          borderBottom: '1px solid #21262d',
        }}
      >
        <span>
          <span style={{ color: '#a371f7' }}>L</span> 左转
        </span>
        <span>
          <span style={{ color: '#f0883e' }}>R</span> 右转
        </span>
        <span>
          <span style={{ color: '#3fb950' }}>SPD</span> 推荐速度
        </span>
        <span>
          <span style={{ color: '#58a6ff' }}>GEAR</span> 档位
        </span>
        <span>
          <span style={{ color: '#f85149' }}>BRK</span> 刹车点
        </span>
      </div>

      {/* 路书列表 */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {paceNotes.map((note) => {
          if (note.type === 'turn') {
            const turnGlobalIdx = turnNotes.indexOf(note);
            return (
              <div
                key={note.id}
                ref={turnGlobalIdx === activeTurnIdx ? activeItemRef : null}
              >
                <TurnNoteItem
                  note={note}
                  isActive={turnGlobalIdx === activeTurnIdx}
                  isNext={turnGlobalIdx === nextTurnIdx}
                  currentSpeed={currentSpeed}
                />
              </div>
            );
          }
          return <SpecialNoteItem key={note.id} note={note} isActive={false} />;
        })}
      </div>

      {/* 底部：当前状态摘要 */}
      {(activeTurnIdx >= 0 || nextTurnIdx >= 0 || !hasRaceStarted) && (
        <div
          style={{
            marginTop: 4,
            padding: '4px 6px',
            background: '#0d1117',
            borderRadius: 4,
            fontSize: 9,
            color: '#8b949e',
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          {!hasRaceStarted ? (
            <span style={{ color: '#58a6ff' }}>路书已加载，等待比赛开始...</span>
          ) : (
            <>
              <span>
                {activeTurnIdx >= 0
                  ? `当前: T${activeTurnIdx + 1} ${turnNotes[activeTurnIdx]?.turnTypeLabel}`
                  : '直道行驶'}
              </span>
              {nextTurnIdx >= 0 && (
                <span>
                  下一: T{nextTurnIdx + 1}{' '}
                  {turnNotes[nextTurnIdx]?.dirLabel}转{' '}
                  {turnNotes[nextTurnIdx]?.turnTypeLabel}{' '}
                  {turnNotes[nextTurnIdx]?.angle}°
                </span>
              )}
            </>
          )}
        </div>
      )}
      {showGlossary && <PaceNoteGlossaryModal onClose={() => setShowGlossary(false)} />}
      {showExitConfirm && (
        <ExitConfirmModal
          onConfirm={handleExitConfirm}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}

export function PaceNoteGlossaryModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 20
    }} onClick={onClose}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0d1117'
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>路书术语与评级释义</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b949e',
              fontSize: 16,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
        
        {/* 内容 */}
        <div style={{ padding: 16, overflowY: 'auto', fontSize: 11, color: '#c9d1d9', display: 'flex', flexDirection: 'column', gap: 12, lineHeight: 1.5 }}>
          {/* 弯道等级 */}
          <div>
            <div style={{ fontWeight: 700, color: '#58a6ff', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>●</span> 弯道严重度评级 (1 - 6)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', background: '#0d1117', padding: 8, borderRadius: 6, border: '1px solid #21262d' }}>
              <div><strong style={{ color: '#f85149' }}>1档 (发卡弯)</strong>: 极锐角，低速 (通常&lt;30km/h)</div>
              <div><strong style={{ color: '#f85149' }}>2档 (急弯)</strong>: 近似直角，低速 (通常30-60km/h)</div>
              <div><strong style={{ color: '#f0883e' }}>3档 (中等弯)</strong>: 中等弧度，中速 (通常60-100km/h)</div>
              <div><strong style={{ color: '#f0883e' }}>4档 (缓弯)</strong>: 较缓弧度，中高速 (通常100-140km/h)</div>
              <div><strong style={{ color: '#3fb950' }}>5档 (轻弯)</strong>: 很缓，高速 (通常140-180km/h)</div>
              <div><strong style={{ color: '#3fb950' }}>6档 (微弯)</strong>: 极轻微弯度，近乎直道 (通常&gt;180km/h)</div>
            </div>
          </div>

          {/* 几何特征 */}
          <div>
            <div style={{ fontWeight: 700, color: '#58a6ff', marginBottom: 4 }}>
              <span>●</span> 几何与路况特征
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0d1117', padding: 8, borderRadius: 6, border: '1px solid #21262d' }}>
              <div><strong>过坡</strong>: 赛车越过起伏坡顶，视线受阻，需提前校准行进线。</div>
              <div><strong>飞跳</strong>: 重起伏路段，赛车会腾空，起跳前需摆正车身。</div>
              <div><strong>路面倾角</strong>:</div>
              <div style={{ paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div>• <strong style={{ color: '#3fb950' }}>向心倾角</strong>: 弯道向内侧倾斜，增加过弯贴合度与抓地极限。</div>
                <div>• <strong style={{ color: '#f85149' }}>离心反坡</strong>: 弯道向外侧倾斜，向心抓地力极易突破，需提前减速。</div>
              </div>
            </div>
          </div>

          {/* 锁定与合并 */}
          <div>
            <div style={{ fontWeight: 700, color: '#58a6ff', marginBottom: 4 }}>
              <span>●</span> 骨架锁定与弯道合并
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#0d1117', padding: 8, borderRadius: 6, border: '1px solid #21262d' }}>
              <div><strong>锁定</strong>: 手动编辑过的弯道锁定后，未来再次跑圈做合并时，系统将以此弯道为参考基准进行叠加优化，不修改其核心骨架。</div>
              <div><strong>合并</strong>: 将当前弯道与下一个弯道融合为一个弯道，系统重新合并它们的物理特征及推荐速度。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExitConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(13, 17, 23, 0.8)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 8,
        padding: '16px 20px',
        width: 280,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
          确定要退出当前路书/赛道模式吗？
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              background: '#f85149',
              border: '1px solid rgba(248,81,73,0.4)',
              borderRadius: 6,
              padding: '6px 12px',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            确定退出
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '6px 12px',
              color: '#c9d1d9',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
