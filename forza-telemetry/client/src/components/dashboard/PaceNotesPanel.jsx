import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaceNoteExport } from './PaceNoteExport';

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

/** 弯道类型中文标签 */
const TURN_TYPE_LABELS = {
  hairpin: '发卡',
  sharp: '急弯',
  medium: '中弯',
  slow: '缓弯',
  gentle: '微弯',
  slight: '极微弯',
  micro: '直道',
  sweeping: '高速',
  chicane: 'S弯',
};

/** 弯道类型严重度（越高越需要注意） */
const TURN_SEVERITY = {
  hairpin: 6,
  sharp: 5,
  medium: 4,
  slow: 3,
  gentle: 2,
  slight: 1,
  micro: 0,
  sweeping: 2,
  chicane: 5,
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
      const recSpeed = turn.recommendedSpeed || 0;
      const recGear = recSpeed > 0 ? recommendGearForSpeed(recSpeed) : null;
      const severity = TURN_SEVERITY[turn.type] || 3;
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
        angle: turn.angle,
        turnType: turn.type,
        turnTypeLabel: TURN_TYPE_LABELS[turn.type] || turn.type,
        severity,
        recommendedSpeed: recSpeed,
        recommendedGear: recGear,
        brakeDistance,
        speedDiff,
        bestEntrySpeed: turn.bestEntrySpeed,
        bestExitSpeed: turn.bestExitSpeed,
        // 组合弯信息
        isChicane: turn.isChicane,
        chicaneDirection: turn.chicaneDirection,
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

      if (dist > 150) {
        // 长直道 -> 加速区
        notes.push({
          type: 'straight',
          id: `straight-${i}`,
          betweenTurns: [i, i + 1],
          distance: Math.round(dist),
          label: dist > 300 ? '长直道' : '短直道',
          severity: 1,
          x: (curr.x + next.x) / 2,
          z: (curr.z + next.z) / 2,
        });
      }

      if (next.recommendedSpeed > 0 && curr.recommendedSpeed > 0) {
        const speedDelta = next.recommendedSpeed - curr.recommendedSpeed;
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

// ==================== 路书条目子组件 ====================

/** 弯道路书条目 */
function TurnNoteItem({ note, isActive, isNext, currentSpeed }) {
  const dirArrow = getDirectionArrow(note.direction);
  const speedDiff = currentSpeed
    ? Math.round(currentSpeed - note.recommendedSpeed)
    : 0;

  // 超速判定
  let speedStatus = 'ok';
  if (note.recommendedSpeed > 0 && currentSpeed > 0) {
    if (speedDiff > 30) speedStatus = 'danger';
    else if (speedDiff > 15) speedStatus = 'warn';
    else if (speedDiff < -20) speedStatus = 'slow';
  }

  const speedStatusColors = {
    danger: '#f85149',
    warn: '#d29922',
    ok: '#3fb950',
    slow: '#58a6ff',
  };

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

      {/* 方向箭头 */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: isActive ? '#58a6ff' : note.direction === 'left' ? '#a371f7' : '#f0883e',
          lineHeight: 1,
          minWidth: 14,
          textAlign: 'center',
        }}
      >
        {dirArrow}
      </span>

      {/* 弯道类型 */}
      <span
        style={{
          color: isActive ? '#c9d1d9' : '#8b949e',
          fontSize: 9,
          fontWeight: 600,
          minWidth: 24,
        }}
      >
        {note.turnTypeLabel}
      </span>

      {/* 角度 */}
      <span
        style={{
          color: '#8b949e',
          fontSize: 9,
          minWidth: 28,
        }}
      >
        {note.angle}°
      </span>

      {/* 推荐速度 */}
      {note.recommendedSpeed > 0 && (
        <span
          style={{
            color:
              isActive && currentSpeed > 0
                ? speedStatusColors[speedStatus]
                : '#3fb950',
            fontWeight: 700,
            fontSize: 10,
            minWidth: 40,
          }}
        >
          {Math.round(note.recommendedSpeed)}
          <span style={{ fontSize: 8, opacity: 0.6 }}>km/h</span>
        </span>
      )}

      {/* 推荐档位 */}
      {note.recommendedGear !== null && (
        <span
          style={{
            color: '#58a6ff',
            fontWeight: 700,
            fontSize: 10,
            background: 'rgba(88,166,255,0.1)',
            borderRadius: 2,
            padding: '0 3px',
            minWidth: 14,
            textAlign: 'center',
          }}
        >
          {note.recommendedGear}
        </span>
      )}

      {/* 刹车距离 */}
      {note.brakeDistance > 10 && (
        <span
          style={{
            color: '#f85149',
            fontSize: 8,
            fontWeight: 600,
            minWidth: 30,
          }}
        >
          -{note.brakeDistance}m
        </span>
      )}

      {/* 实时速度差 */}
      {isActive && currentSpeed > 0 && note.recommendedSpeed > 0 && (
        <span
          style={{
            color: speedStatusColors[speedStatus],
            fontWeight: 700,
            fontSize: 9,
            minWidth: 30,
            textAlign: 'right',
          }}
        >
          {speedDiff > 0 ? '+' : ''}
          {speedDiff}
        </span>
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
  compact = false,
}) {
  const [activeTurnIdx, setActiveTurnIdx] = useState(-1);
  const [nextTurnIdx, setNextTurnIdx] = useState(-1);
  const [showExport, setShowExport] = useState(false);
  const [scrollToActive, setScrollToActive] = useState(false);
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  // 生成路书数据
  const paceNotes = useMemo(() => generatePaceNotes(trackData), [trackData]);

  // 仅保留弯道路书（用于导航跟踪）
  const turnNotes = useMemo(
    () => paceNotes.filter((n) => n.type === 'turn'),
    [paceNotes]
  );

  // 实时追踪当前/下一个弯道
  useEffect(() => {
    if (!position || !trackData?.centerline || turnNotes.length === 0) {
      setActiveTurnIdx(-1);
      setNextTurnIdx(-1);
      return;
    }

    const nearestIdx = findNearestIndex(position, trackData.centerline);
    if (nearestIdx < 0) return;

    // 找到最近的弯道（通过 centerline index 比较）
    let closestTurnIdx = -1;
    let closestDist = Infinity;

    turnNotes.forEach((note, idx) => {
      if (note.index === undefined) return;
      const dist = Math.abs(note.index - nearestIdx);
      if (dist < closestDist) {
        closestDist = dist;
        closestTurnIdx = idx;
      }
    });

    // 20个索引点以内认为"处于弯道中"
    const isAtTurn = closestDist < 20;
    if (isAtTurn) {
      setActiveTurnIdx(closestTurnIdx);
      // 下一个弯道
      const next = closestTurnIdx + 1 < turnNotes.length ? closestTurnIdx + 1 : -1;
      setNextTurnIdx(next);
      setScrollToActive(true);
    } else {
      // 查找前方最近的弯道
      let nextForward = -1;
      for (let i = 0; i < turnNotes.length; i++) {
        if (turnNotes[i].index > nearestIdx) {
          nextForward = i;
          break;
        }
      }
      setActiveTurnIdx(-1);
      setNextTurnIdx(nextForward);
      setScrollToActive(false);
    }
  }, [position, trackData, turnNotes]);

  // 自动滚动到当前激活弯道
  useEffect(() => {
    if (scrollToActive && activeItemRef.current && listRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [scrollToActive, activeTurnIdx]);

  // 语音播报路书弯道 (优先级 2: 中等优先级) - WRC标准格式
  useEffect(() => {
    if (activeTurnIdx >= 0 && turnNotes[activeTurnIdx]) {
      const note = turnNotes[activeTurnIdx];
      const dirText = note.direction === 'left' ? '左' : note.direction === 'right' ? '右' : '';
      const wrcNum = note.wrcNumber || note.severity || 0;
      const wrcText = wrcNum > 0 ? `${dirText}${wrcNum}` : `${dirText}弯`;
      const gearText = note.recommendedGear ? `, 推荐${note.recommendedGear}档` : '';
      const distText = note.distanceToNext > 0 ? `, 后接${Math.round(note.distanceToNext)}米直道` : '';
      
      const speakText = `前有${wrcText}${gearText}${distText}`;
      import('../../utils/speechQueue').then(m => {
        m.speechManager.speak(speakText, 2);
      });
    }
  }, [activeTurnIdx, turnNotes]);

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
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: '#484f58',
            fontWeight: 300,
            marginBottom: 4,
          }}
        >
          NOTE
        </div>
        <div style={{ fontSize: 10, color: '#484f58' }}>
          需要赛道数据才能生成路书
        </div>
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
            }}
          >
            路书
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#484f58' }}>
              弯道数: {turnNotes.length}
            </span>
            {displayNote && (
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
        {displayNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 8 }}>
            
            {/* 上部主行：当前/即将发生的弯（WRC路书格式） */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* 方向箭头 */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: displayNote.direction === 'left' ? '#a371f7' : '#f0883e',
                    lineHeight: 1,
                    textShadow: displayNote === activeNote ? '0 0 12px rgba(88,166,255,0.5)' : 'none',
                  }}
                >
                  {getDirectionArrow(displayNote.direction)}
                </span>
                <span style={{ fontSize: 9, color: '#8b949e', fontWeight: 600, marginTop: 2 }}>
                  {displayNote.turnTypeLabel}
                </span>
              </div>

              {/* 详情指标 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1, color: displayNote.direction === 'left' ? '#a371f7' : '#f0883e' }}>
                    {displayNote.wrcLabel || displayNote.angle + '°'}
                  </span>
                  <span style={{ fontSize: 9, color: '#484f58' }}>
                    弯 {displayNote.turnIndex + 1}
                  </span>
                </div>

                {/* 速度和推荐档位 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {displayNote.recommendedSpeed > 0 && (
                    <div
                      style={{
                        background: 'rgba(63,185,80,0.12)',
                        borderRadius: 3,
                        padding: '1px 5px',
                        border: '1px solid rgba(63,185,80,0.3)',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#3fb950', fontFamily: 'monospace' }}>
                        {Math.round(displayNote.recommendedSpeed)}
                      </span>
                      <span style={{ fontSize: 8, color: '#484f58', marginLeft: 2 }}>
                        公里/小时
                      </span>
                    </div>
                  )}
                  {displayNote.recommendedGear !== null && (
                    <div
                      style={{
                        background: 'rgba(88,166,255,0.12)',
                        borderRadius: 3,
                        padding: '1px 5px',
                        border: '1px solid rgba(88,166,255,0.3)',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#58a6ff', fontFamily: 'monospace' }}>
                        {displayNote.recommendedGear}
                      </span>
                      <span style={{ fontSize: 8, color: '#484f58', marginLeft: 2 }}>
                        档
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 刹车距离 */}
              {displayNote.brakeDistance > 10 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, color: '#f85149', fontWeight: 700 }}>刹车点</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#f85149', fontFamily: 'monospace', lineHeight: 1 }}>
                    -{displayNote.brakeDistance}米
                  </span>
                </div>
              )}

              {/* 弯道强度条 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 7, color: '#484f58', letterSpacing: 1 }}>强度</span>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        height: 4 + i * 3,
                        borderRadius: 1,
                        background: i < displayNote.severity
                          ? (displayNote.direction === 'left' ? '#a371f7' : '#f0883e')
                          : 'rgba(255,255,255,0.08)',
                        transition: 'background 0.2s',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 下部次行：如果有下一个弯道，进行预览展示 */}
            {hasBoth && (
              <div style={{
                borderTop: '1px solid rgba(48, 54, 61, 0.4)',
                paddingTop: 5,
                fontSize: 9,
                color: '#8b949e',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{ color: '#d29922', fontWeight: 700 }}>预告 ➡️</span>
                <span>
                  弯 {nextNote.turnIndex + 1}：
                  <strong>{nextNote.direction === 'left' ? '左弯' : '右弯'} {nextNote.angle}°</strong>
                  {nextNote.recommendedSpeed > 0 && ` / 推荐 ${Math.round(nextNote.recommendedSpeed)}公里/小时`}
                  {nextNote.recommendedGear !== null && ` / ${nextNote.recommendedGear}档`}
                </span>
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
          }}
        >
          路书 / Pace Notes
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#484f58' }}>
            {trackData?.name || '赛道'} | {turnNotes.length}弯 | {(trackData?.length / 1000).toFixed(1)}km
          </span>
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
      {(activeTurnIdx >= 0 || nextTurnIdx >= 0) && (
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
        </div>
      )}
    </div>
  );
}

export default PaceNotesPanel;
