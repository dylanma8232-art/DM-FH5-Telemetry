import React, { useState, useRef, useEffect, useReducer, useMemo } from 'react';

// Sector Timer Reducer
const initialSectorState = {
  sectors: [],
  currentSector: 0,
  sectorTimes: [],
  bestSectorTimes: [],
  lapSectorTimes: [],
  weakSector: -1,
  lapComplete: false,
};

function sectorReducer(state, action) {
  switch (action.type) {
    case 'SET_SECTORS':
      return {
        ...state,
        sectors: action.sectors,
        sectorTimes: new Array(action.sectors.length).fill(0),
        bestSectorTimes: new Array(action.sectors.length).fill(0),
        lapSectorTimes: new Array(action.sectors.length).fill(0),
        currentSector: 0,
        weakSector: -1,
        lapComplete: false,
      };
    case 'SET_CURRENT_SECTOR':
      return { ...state, currentSector: action.index };
    case 'UPDATE_SECTOR_TIME': {
      const newTimes = [...state.sectorTimes];
      newTimes[action.index] = action.time;
      return { ...state, sectorTimes: newTimes };
    }
    case 'SET_LAP_SECTOR_TIMES':
      return { ...state, lapSectorTimes: action.times, lapComplete: true };
    case 'UPDATE_BEST_SECTOR_TIMES': {
      const newBest = [...state.bestSectorTimes];
      action.times.forEach((t, i) => {
        if (t > 0 && (newBest[i] === 0 || t < newBest[i])) {
          newBest[i] = t;
        }
      });
      return { ...state, bestSectorTimes: newBest };
    }
    case 'SET_WEAK_SECTOR':
      return { ...state, weakSector: action.index };
    case 'RESET_LAP':
      return { ...state, currentSector: 0, lapComplete: false };
    default:
      return state;
  }
}

// 格式化时间为 mm:ss.fff
function formatTime(seconds, dec = 3) {
  if (!seconds || seconds <= 0) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * Math.pow(10, dec));
  
  const minStr = mins.toString().padStart(2, '0');
  const secStr = secs.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(dec, '0');
  
  return `${minStr}:${secStr}.${msStr}`;
}

// 格式化分段计时
function formatSecTime(seconds) {
  if (!seconds || seconds <= 0) return '-.--s';
  return `${seconds.toFixed(2)}秒`;
}

export function RacePerformanceTimingPanel({ data, trackData }) {
  const telemetryData = data || {};
  const {
    racePosition = 0,
    currentRaceTime = 0,
    lapNumber = 0,
    lastLap = 0,
    currentLap = 0,
    bestLap = 0,
    position = {}
  } = telemetryData;

  const currentRaceTimeMs = telemetryData.timestampMS ? telemetryData.timestampMS / 1000 : 0;
  const currentRaceTimeFallback = currentRaceTime > 0 ? currentRaceTime : currentRaceTimeMs;

  const [state, dispatch] = useReducer(sectorReducer, initialSectorState);

  const prevPosRef = useRef(null);
  const sectorStartTimesRef = useRef([]);
  const prevLapRef = useRef(0);
  const lapSectorBufferRef = useRef([]);

  const [lapHistory, setLapHistory] = useState([]);

  // 根据当前位置与赛道分段对比
  const sectorsList = trackData?.sectors || [];

  // 监听圈数变化，记录历史圈速
  useEffect(() => {
    if (lapNumber > prevLapRef.current && lastLap > 0) {
      setLapHistory(prev => {
        if (prev.some(h => h.lap === prevLapRef.current)) return prev;
        const newHistory = [...prev, { lap: prevLapRef.current, time: lastLap }];
        return newHistory.slice(-10); // 只保留最近10圈
      });
      dispatch({ type: 'RESET_LAP' });
      // 【修复】新一圈开始时，重置各分段起点，初始化第 0 段起点时间
      sectorStartTimesRef.current = new Array(sectorsList.length).fill(0);
      sectorStartTimesRef.current[0] = currentRaceTimeFallback;
    }
    prevLapRef.current = lapNumber;
  }, [lapNumber, lastLap, sectorsList.length, currentRaceTimeFallback]);
  const currentSectorTime = useMemo(() => {
    if (sectorsList.length === 0 || state.currentSector >= sectorsList.length) return 0;
    const startT = sectorStartTimesRef.current[state.currentSector] || 0;
    if (startT === 0) return 0;
    return Math.max(0, currentRaceTimeFallback - startT);
  }, [currentRaceTimeFallback, sectorsList.length, state.currentSector]);

  // 载入赛道分段
  useEffect(() => {
    if (sectorsList.length > 0) {
      dispatch({ type: 'SET_SECTORS', sectors: sectorsList });
      sectorStartTimesRef.current = new Array(sectorsList.length).fill(0);
    }
  }, [sectorsList]);

  // 实时监测分段触发 (根据坐标距离)
  useEffect(() => {
    if (sectorsList.length === 0 || !position?.x) return;

    // 动态初始化第 0 分段的起始时间
    if (state.currentSector === 0 && sectorStartTimesRef.current[0] === 0) {
      sectorStartTimesRef.current[0] = currentRaceTimeFallback;
    }
    
    const cur = { x: position.x, z: position.z };
    
    // 如果赛道分段已初始化，检查是否通过了分段线
    const currentTargetSector = state.sectors[state.currentSector];
    if (currentTargetSector && currentTargetSector.x !== undefined) {
      const dist = Math.sqrt(
        Math.pow(cur.x - currentTargetSector.x, 2) + 
        Math.pow(cur.z - currentTargetSector.z, 2)
      );

      // 通过分段触发线（25米判断半径）
      if (dist < 25) {
        const sectorIndex = state.currentSector;
        const timeSpent = currentRaceTimeFallback - (sectorStartTimesRef.current[sectorIndex] || currentRaceTimeFallback);
        
        dispatch({ type: 'UPDATE_SECTOR_TIME', index: sectorIndex, time: timeSpent });
        lapSectorBufferRef.current[sectorIndex] = timeSpent;

        // 进入下一分段
        const nextSec = sectorIndex + 1;
        if (nextSec < sectorsList.length) {
          dispatch({ type: 'SET_CURRENT_SECTOR', index: nextSec });
          sectorStartTimesRef.current[nextSec] = currentRaceTimeFallback;
        } else {
          // 本圈全部分段跑完，触发最弱分段判定
          dispatch({ type: 'SET_LAP_SECTOR_TIMES', times: [...lapSectorBufferRef.current] });
          dispatch({ type: 'UPDATE_BEST_SECTOR_TIMES', times: [...lapSectorBufferRef.current] });
          
          // 寻找差值最大（弱点）的分段
          let maxDiff = -1;
          let weakIdx = -1;
          lapSectorBufferRef.current.forEach((t, i) => {
            const best = state.bestSectorTimes[i] || t;
            const diff = t - best;
            if (diff > maxDiff) {
              maxDiff = diff;
              weakIdx = i;
            }
          });
          if (weakIdx >= 0) {
            dispatch({ type: 'SET_WEAK_SECTOR', index: weakIdx });
          }
          // 【修复】跑完最后一分段后，将索引设置为越界，避免在当前圈过线前被高频重复触发
          dispatch({ type: 'SET_CURRENT_SECTOR', index: sectorsList.length });
        }
      }
    }
    prevPosRef.current = cur;
  }, [position, state, currentRaceTimeFallback, sectorsList]);

  // 估算实时圈速差距
  const getDeltaDisplay = () => {
    if (currentLap <= 0 || bestLap <= 0) return { text: '+0.00s', color: '#8b949e' };
    const diff = currentLap - bestLap;
    const sign = diff >= 0 ? '+' : '';
    const color = diff <= 0 ? '#3fb950' : diff > 0.5 ? '#f85149' : '#d29922';
    return {
      text: `${sign}${diff.toFixed(2)}s`,
      color
    };
  };

  const deltaDisplay = getDeltaDisplay();

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '12px 16px',
      background: 'rgba(22, 27, 34, 0.65)',
      border: '1px solid var(--border, #21262d)',
      borderRadius: 8,
      boxSizing: 'border-box'
    }}>
      {/* 统一楼层总标题 */}
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--accent)',
        letterSpacing: 1,
        marginBottom: 10,
        flexShrink: 0,
        borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
        paddingBottom: 6
      }}>
        圈速与分段计时
      </div>

      {/* 顶部行：名次与总计时 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 8,
        borderBottom: '1px solid rgba(48, 54, 61, 0.4)',
        marginBottom: 8,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 700 }}>{racePosition > 0 ? '名次' : '状态'}</span>
          <span style={{ fontSize: 24, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1, color: racePosition > 0 ? '#ffb454' : '#58a6ff' }}>
            {racePosition > 0 ? racePosition : '漫游'}
          </span>
          {racePosition > 0 && <span style={{ fontSize: 12, color: '#8b949e' }}>/ 12</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 600 }}>{racePosition > 0 ? '比赛时间' : '计时'}</span>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#c9d1d9', fontFamily: 'monospace', lineHeight: 1 }}>
            {formatTime(currentRaceTimeFallback, 2)}
          </span>
        </div>
      </div>

      {/* 中部区：圈速对比与实时 Delta */}
      {true && (
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          paddingBottom: 8,
          borderBottom: '1px solid rgba(48, 54, 61, 0.4)',
          marginBottom: 8,
          flexShrink: 0
        }}>
          {/* 单圈详情 - 字体加大 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#8b949e', fontWeight: 600 }}>上一圈:</span>
              <span style={{ color: '#c9d1d9', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{formatTime(lastLap)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#8b949e', fontWeight: 600 }}>当前圈:</span>
              <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{formatTime(currentLap)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span style={{ color: '#8b949e', fontWeight: 600 }}>最快圈:</span>
              <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{formatTime(bestLap)}</span>
            </div>
          </div>

          {/* 核心 Delta */}
          <div style={{
            flex: '0 0 110px',
            background: '#0d1117',
            borderRadius: 6,
            border: '1px solid #30363d',
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 700, letterSpacing: 0.5 }}>当前圈速差</span>
            <span style={{
              fontSize: 20,
              fontWeight: 900,
              fontFamily: 'monospace',
              color: deltaDisplay.color,
              textShadow: deltaDisplay.color === '#3fb950' ? '0 0 8px rgba(63,185,80,0.3)' : 'none',
              lineHeight: 1.2
            }}>
              {deltaDisplay.text}
            </span>
            <span style={{ fontSize: 8.5, color: '#484f58' }}>估算差距</span>
          </div>
        </div>
      )}

      {/* 下部区：分段计时 - 样式增大 */}
      {true && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, marginBottom: 6, flexShrink: 0 }}>
            分段计时
          </div>

          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            overflowY: 'auto',
            minHeight: 0
          }}>
            {state.sectors.length === 0 ? (
              <div style={{ fontSize: 10, color: '#484f58', fontStyle: 'italic', textAlign: 'center', padding: 8 }}>
                等待载入赛道分段数据...
              </div>
            ) : (
              state.sectors.map((sector, index) => {
                const isActive = index === state.currentSector;
                const time = isActive ? currentSectorTime : (state.sectorTimes[index] || 0);
                const best = state.bestSectorTimes[index] || 0;
                const isWeak = index === state.weakSector;

                // 分段差值计算与颜色
                let secDelta = '';
                let secColor = '#c9d1d9';
                if (!isActive && time > 0 && best > 0) {
                  const diff = time - best;
                  if (diff === 0) {
                    secDelta = '最佳';
                    secColor = '#3fb950';
                  } else if (diff < 0) {
                    secDelta = `${diff.toFixed(2)}s`;
                    secColor = '#3fb950';
                  } else {
                    secDelta = `+${diff.toFixed(2)}s`;
                    secColor = diff > 0.5 ? '#f85149' : '#d29922';
                  }
                } else if (isActive) {
                  secDelta = '进行中';
                  secColor = '#58a6ff';
                }

                return (
                  <div
                    key={sector.index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: 4,
                      background: isActive ? 'rgba(88,166,255,0.08)' : isWeak ? 'rgba(248,81,73,0.04)' : '#0d1117',
                      border: `1px solid ${isActive ? 'rgba(88,166,255,0.3)' : isWeak ? 'rgba(248,81,73,0.2)' : 'rgba(48,54,61,0.3)'}`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: isActive ? '#58a6ff' : '#8b949e',
                        fontFamily: 'monospace'
                      }}>
                        S{index + 1}
                      </span>
                      {isWeak && (
                        <span style={{
                          fontSize: 8,
                          background: '#f85149',
                          color: '#fff',
                          padding: '1px 4px',
                          borderRadius: 2,
                          fontWeight: 700
                        }}>
                          慢
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontFamily: 'monospace', fontSize: 11 }}>
                      <span style={{ color: isActive ? '#58a6ff' : '#c9d1d9', fontWeight: 700 }}>
                        {formatSecTime(time)}
                      </span>
                      <span style={{ color: secColor, fontWeight: 800, width: 50, textAlign: 'right' }}>
                        {secDelta}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 底部区：最近圈速记录 */}
      {true && (
        <div style={{
          marginTop: 10,
          borderTop: '1px solid rgba(48, 54, 61, 0.4)',
          paddingTop: 8,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flexShrink: 0
        }}>
          <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>
            最近圈速记录
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 85 }}>
            {lapHistory.length === 0 ? (
              <div style={{ fontSize: 10, color: '#484f58', fontStyle: 'italic', textAlign: 'center', padding: 4 }}>
                暂无历史圈速记录
              </div>
            ) : (
              [...lapHistory].reverse().map((record) => (
                <div key={record.lap} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  background: '#0d1117',
                  border: '1px solid rgba(48,54,61,0.2)',
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontFamily: 'monospace'
                }}>
                  <span style={{ color: '#8b949e' }}>第 {record.lap} 圈</span>
                  <span style={{ color: '#c9d1d9', fontWeight: 700 }}>{formatTime(record.time)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
