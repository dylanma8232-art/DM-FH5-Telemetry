import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ScatterChart, Scatter, Cell } from 'recharts';
import { ReplayPlayer } from '../dashboard/ReplayPlayer';
import { AICoachPanel } from '../dashboard/AICoachPanel';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { GearingAnalysisPanel } from '../dashboard/GearingAnalysisPanel';
import { SuspensionAnalysisPanel } from '../dashboard/SuspensionAnalysisPanel';
import { DifferentialAnalysisPanel } from '../dashboard/DifferentialAnalysisPanel';
import { useSessionHistory } from '../../hooks/useSessionHistory';
import { toast } from '../shared/Toast';

const inputStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11
};

export function SessionHistoryPage({ onNavigate, navIntent }) {
  const {
    sessions,
    setSessions,
    vehiclesList,
    setVehiclesList,
    selectedSession,
    setSelectedSession,
    analysis,
    setAnalysis,
    sessionDetail,
    setSessionDetail,
    loading,
    setLoading,
    activeTab,
    setActiveTab,
    diagnosis,
    setDiagnosis,
    channelsData,
    setChannelsData,
    channelsLoading,
    setChannelsLoading,
    advancedData,
    setAdvancedData,
    advancedLoading,
    setAdvancedLoading,
    turnsData,
    setTurnsData,
    turnsLoading,
    setTurnsLoading,
    activeTurnIdx,
    setActiveTurnIdx,
    zoomOnSelect,
    setZoomOnSelect,
    trackTurnsData,
    setTrackTurnsData,
    sessionSearchQuery,
    setSessionSearchQuery,
    trackFilter,
    setTrackFilter,
    tunes,
    setTunes,
    showDeleteConfirm,
    setShowDeleteConfirm,
    lbEntries,
    setLbEntries,
    lbLoading,
    setLbLoading,
    lbExpandedKeys,
    setLbExpandedKeys,
    lbTrendData,
    setLbTrendData,
    selectedLbTrackId,
    setSelectedLbTrackId,
    lbTrendLoading,
    setLbTrendLoading,
    lbLoaded,
    setLbLoaded,
    lbTrendCacheRef,
    lbTrendLoadingSetRef,
    detailLoaded,
    setDetailLoaded,
    loadedTabsRef,
    selectedSessionIds,
    setSelectedSessionIds,
    batchMode,
    setBatchMode,
    sessionPage,
    setSessionPage,
    uniqueTracks,
    groupedAchievements,
    ggData,
    sectorTimingData,
    batchDelete,
    batchExportCSV,
    toggleSessionSelect,
    loadSessions,
    loadTunes,
    deleteSession,
    loadAnalysis,
    loadSessionDetail,
    loadTelemetryChannels,
    loadAdvancedAnalysis,
    loadTurnsData,
    loadLeaderboard,
    loadLbTrend,
    clearLbTrendCache,
    clearAllLbTrendCache,
    toggleLbExpand,
    lbFormatTime,
    getVehicleClass,
    downloadBlob,
    exportCSV,
    exportEnhancedCSV,
    exportPDFReport,
    exportReport,
    formatTime,
    formatDate,
    getDiagnosisStyle,
    paginatedSessions,
    worst3,
    SESSION_PAGE_SIZE,
    myFilteredSessions,
    totalPages
  } = useSessionHistory({ onNavigate, navIntent });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <div style={{ display: 'flex', flex: 1 }}>
      <div style={{ 
        width: 320, 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          padding: 12, 
          borderBottom: '1px solid var(--border)',
          fontSize: 14,
          fontWeight: 600
        }}>
          比赛记录 ({sessions.length})
          {/* Round 5: 批量操作按钮 */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <button onClick={() => { setBatchMode(b => !b); setSelectedSessionIds(new Set()); }} style={{ ...btnSmallStyle, fontSize: 9 }}>
              {batchMode ? '取消批量' : '批量操作'}
            </button>
            {batchMode && selectedSessionIds.size > 0 && (
              <>
                <button onClick={batchDelete} style={{ ...btnSmallStyle, fontSize: 9, background: 'rgba(248,81,73,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>
                  删除 ({selectedSessionIds.size})
                </button>
                <button onClick={batchExportCSV} style={{ ...btnSmallStyle, fontSize: 9, background: 'rgba(88,166,255,0.1)', color: '#58a6ff', borderColor: 'rgba(88,166,255,0.3)' }}>
                  导出CSV ({selectedSessionIds.size})
                </button>
                <button onClick={() => setSelectedSessionIds(new Set(prev => {
                  const next = new Set(myFilteredSessions.map(s => s.id));
                  return next.size === prev.size ? new Set() : next;
                }))} style={{ ...btnSmallStyle, fontSize: 9 }}>
                  {selectedSessionIds.size === myFilteredSessions.length ? '取消全选' : '全选'}
                </button>
              </>
            )}
          </div>
          {/* Round 5: 快捷键提示 */}
          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            快捷键: <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Left/Right</span> 切换记录 &nbsp;
            <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Up/Down</span> 切换Tab
          </div>
        </div>
        
        {/* 搜索框 */}
        <div style={{ padding: '8px 8px 0', borderBottom: trackFilter ? 'none' : '1px solid var(--border)' }}>
          <input
            value={sessionSearchQuery}
            onChange={e => setSessionSearchQuery(e.target.value)}
            placeholder="按赛道名搜索..."
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: 11,
              outline: 'none'
            }}
          />
        </div>
        
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {/* 赛道标签筛选器 - 下拉选择器 */}
          {uniqueTracks.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <select
                value={trackFilter}
                onChange={e => setTrackFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">全部赛道</option>
                {uniqueTracks.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}
          {myFilteredSessions.length === 0 ? (
            <EmptyState icon="📋" title="暂无比赛记录" description="在游戏中完成比赛后会自动录制。" />
          ) : (
            paginatedSessions.map((session) => (
              <div 
                key={session.id} 
                onClick={() => batchMode ? toggleSessionSelect(e, session.id) : loadAnalysis(session.id)}
                style={{
                  padding: 8,
                  background: batchMode && selectedSessionIds.has(session.id) ? 'rgba(88,166,255,0.1)' : selectedSession === session.id ? '#0d1117' : '#161b22',
                  borderRadius: 6,
                  marginBottom: 4,
                  cursor: 'pointer',
                  border: batchMode && selectedSessionIds.has(session.id) ? '1px solid #58a6ff' : selectedSession === session.id ? '1px solid #58a6ff' : '1px solid #21262d',
                  transition: 'all 0.2s'
                }}
              >
                {/* Round 5: 缩略图 + 复选框 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <TrackThumbnail trackId={session.trackId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span
                    style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)' }}
                  >
                    {session.trackName || '未知赛道'}
                  </span>
                  <span style={{ fontSize: 9, color: '#484f58' }}>
                    {session.autoRecorded ? '自动' : '手动'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e' }}>
                  <span>{formatDate(session.savedAt)}</span>
                  <span>最快 <span style={{ color: '#d29922', fontFamily: 'monospace', fontWeight: 600 }}>{formatTime(session.laps?.best)}</span></span>
                </div>
                {session.tuneId && tunes[session.tuneId] && (
                  <div style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    background: 'rgba(88,166,255,0.1)',
                    borderRadius: 3,
                    color: '#58a6ff',
                    border: '1px solid rgba(88,166,255,0.3)',
                    display: 'inline-block',
                    marginTop: 3,
                    fontWeight: 600
                  }}>
                    调校: {typeof tunes[session.tuneId] === 'string' ? tunes[session.tuneId] : (tunes[session.tuneId]?.name || '未知')}
                  </div>
                )}
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {/* Round 6: PDF报告 */}
                  
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(session.id); }} style={{ ...btnSmallStyle, background: 'rgba(218,54,51,0.1)', color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>删除</button>

                  {/* Round 5: 批量选择复选框 */}
                  {batchMode && (
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSessionSelect(e, session.id); }}
                      style={{
                        width: 16, height: 16, borderRadius: 3,
                        border: selectedSessionIds.has(session.id) ? '2px solid #58a6ff' : '2px solid var(--border)',
                        background: selectedSessionIds.has(session.id) ? '#58a6ff' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0, marginLeft: 'auto'
                      }}
                    >
                      {selectedSessionIds.has(session.id) && (
                        <span style={{ color: '#000', fontSize: 10, fontWeight: 700 }}>&#10003;</span>
                      )}
                    </div>
                  )}
                </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {/* Round 9: 分页控件 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
              <button onClick={() => setSessionPage(1)} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === 1 ? 0.4 : 1 }}>&laquo;</button>
              <button onClick={() => setSessionPage(p => Math.max(1, p - 1))} disabled={sessionPage === 1} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === 1 ? 0.4 : 1 }}>&lsaquo;</button>
              <span style={{ fontSize: 11, color: '#8b949e' }}>
                {sessionPage} / {totalPages} 页
              </span>
              <button onClick={() => setSessionPage(p => Math.min(totalPages, p + 1))} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === totalPages ? 0.4 : 1 }}>&rsaquo;</button>
              <button onClick={() => setSessionPage(totalPages)} disabled={sessionPage === totalPages} style={{ ...btnSmallStyle, fontSize: 9, opacity: sessionPage === totalPages ? 0.4 : 1 }}>&raquo;</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loading ? (
          <LoadingSpinner />
        ) : selectedSession && analysis ? (
          <div>
            {/* 面包屑导航 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setSelectedSession(null); setTrackFilter(''); }}>
                赛道成就墙
              </span>
              <span>&gt;</span>
              {trackFilter ? (
                <>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setSelectedSession(null)}>
                    {trackFilter} 轨迹概览
                  </span>
                  <span>&gt;</span>
                </>
              ) : null}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                单场遥测分析 ({selectedSession.substring(0, 8)})
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
              {[
                { id: 'overview', label: '总览与遥测' },
                { id: 'corners', label: '弯道诊断' },
                { id: 'replay', label: '影子与教练' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }}
                  style={{
                    padding: '6px 14px',
                    background: activeTab === tab.id ? '#58a6ff' : 'transparent',
                    color: activeTab === tab.id ? '#fff' : '#58a6ff',
                    border: '1px solid #30363d',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ===== Tab 1: 总览与遥测 ===== */}
            {activeTab === 'overview' && analysis && (
              <div>
                <>
                {/* 驾驶综合评分 */}
                {analysis.驾驶评分 && (
                  <div style={{
                    ...sectionStyle,
                    background: 'linear-gradient(135deg, rgba(0,120,255,0.08) 0%, rgba(0,200,150,0.08) 100%)',
                    border: '1px solid var(--accent)',
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: 0 }}>驾驶综合评分</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          fontSize: 36, fontWeight: 900, color: 'var(--accent)', fontFamily: 'monospace',
                          textShadow: '0 0 12px rgba(0,120,255,0.4)'
                        }}>
                          {analysis.驾驶评分.总分}
                        </div>
                        <div style={{
                          fontSize: 18, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
                          background: analysis.驾驶评分.总分 >= 80 ? 'var(--success)' :
                                      analysis.驾驶评分.总分 >= 60 ? 'var(--warning)' : 'var(--danger)',
                          color: '#000'
                        }}>
                          {analysis.驾驶评分.等级}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {Object.entries(analysis.驾驶评分.维度 || {}).map(([name, dim]) => {
                        const ratio = dim.分数 / dim.满分;
                        const color = ratio >= 0.8 ? 'var(--success)' : ratio >= 0.6 ? 'var(--warning)' : 'var(--danger)';
                        return (
                          <div key={name} style={{
                            background: 'var(--bg-primary)', borderRadius: 6, padding: 10,
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>{name}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'monospace' }}>{dim.分数}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {dim.满分}</span>
                            </div>
                            <div style={{ height: 3, background: '#21262d', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${ratio * 100}%`, background: color, transition: 'width 0.3s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 驾驶评分建议 */}
                {analysis.驾驶评分?.建议 && analysis.驾驶评分.建议.length > 0 && (
                  <div style={{ ...sectionStyle, marginBottom: 16 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0 }}>改进建议</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {analysis.驾驶评分.建议.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px', borderRadius: 6,
                          background: idx === 0 ? 'rgba(248,81,73,0.06)' : idx === 1 ? 'rgba(210,153,34,0.06)' : 'rgba(88,166,255,0.06)',
                          border: `1px solid ${idx === 0 ? 'rgba(248,81,73,0.2)' : idx === 1 ? 'rgba(210,153,34,0.2)' : 'rgba(88,166,255,0.2)'}`
                        }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, flexShrink: 0, marginTop: 1,
                            background: idx === 0 ? '#f85149' : idx === 1 ? '#d29922' : '#58a6ff',
                            color: '#fff'
                          }}>
                            {idx === 0 ? '优先' : idx === 1 ? '其次' : '建议'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关键指标卡片行 */}
                {(() => {
                  const adv = advancedData;
                  const hasAdv = adv && adv.sessionId === selectedSession;

                  const bestLapTime = analysis?.成绩?.最快圈速 || analysis?.bestLap || 0;
                  const totalDuration = analysis?.成绩?.总时长 || analysis?.总时长 || 0;
                  const formatDuration = (ms) => {
                    if (!ms || ms <= 0) return '--';
                    const sec = Math.floor(ms / 1000);
                    const min = Math.floor(sec / 60);
                    const s = sec % 60;
                    return min > 0 ? `${min}分${s}秒` : `${s}秒`;
                  };

                  const metrics = [
                    { label: '最快圈速', value: bestLapTime > 0 ? formatTime(bestLapTime) : '--', color: '#3fb950' },
                    { label: '总时长', value: formatDuration(totalDuration), color: '#8b949e' },
                    { label: '一致性(σ)', value: hasAdv && adv.consistency?.lapTimeStd != null ? adv.consistency.lapTimeStd.toFixed(3) + 's' : '--', color: '#d29922' },
                    { label: 'Trail Braking', value: hasAdv && adv.trailBraking?.ratio != null ? (adv.trailBraking.ratio * 100).toFixed(1) + '%' : '--', color: '#a371f7' },
                  ];

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                      {metrics.map(m => (
                        <div key={m.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                          <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>{m.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: 'monospace' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 分段分析：多圈显示每圈损失时间，单圈显示分段用时 */}
                {sectorTimingData && advancedData && advancedData.sessionId === selectedSession && (() => {
                  const { isMultiLap } = sectorTimingData;
                  const laps = advancedData.lapSectorDetails;
                  if (!laps || laps.length === 0) return null;
                  
                  // 获取分段数量
                  const sectorCount = laps[0]?.sectors?.length || 0;
                  
                  return (
                    <div style={sectionStyle}>
                      <h3 style={sectionTitleStyle}>
                        {isMultiLap ? '分段损失时间' : '分段用时'}
                      </h3>
                      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, lineHeight: 1.5 }}>
                        {isMultiLap
                          ? '每圈各赛段相比理论最佳的损失时间。'
                          : '当前比赛不同分段的用时。'}
                      </div>
                      
                      {/* 单圈模式：横向表格 */}
                      {!isMultiLap && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#8b949e', fontWeight: 700 }}>分段</th>
                                {laps[0]?.sectors.map(s => {
                                  const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                  const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                  return (
                                    <th key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', color: isBest ? '#3fb950' : isWorst ? '#f85149' : '#8b949e', fontWeight: 700 }}>S{s.sector}</th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #21262d' }}>
                                <td style={{ padding: '8px 12px', color: '#8b949e', fontWeight: 500 }}>用时</td>
                                {laps[0]?.sectors.map(s => {
                                  const isBest = s.time === Math.min(...laps[0].sectors.map(x => x.time));
                                  const isWorst = s.time === Math.max(...laps[0].sectors.map(x => x.time));
                                  const timeColor = isBest ? '#3fb950' : isWorst ? '#f85149' : '#e6edf3';
                                  return (
                                    <td key={s.sector} style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: timeColor, fontWeight: 700 }}>
                                      {s.time.toFixed(2)}s
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      
                      {/* 多圈模式：紧凑表格，每圈一行，限制最大高度 */}
                      {isMultiLap && (
                        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, background: '#0d1117', borderRadius: 6, overflow: 'hidden' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                              <tr style={{ background: '#161b22', borderBottom: '2px solid #30363d' }}>
                                <th style={{ padding: '8px 8px', textAlign: 'left', color: '#8b949e', fontWeight: 700, position: 'sticky', left: 0, background: '#161b22', zIndex: 3 }}>圈</th>
                                <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>总用时</th>
                                {Array.from({ length: sectorCount }, (_, i) => (
                                  <th key={i} style={{ padding: '8px 6px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>S{i + 1}</th>
                                ))}
                                <th style={{ padding: '8px 8px', textAlign: 'right', color: '#8b949e', fontWeight: 700 }}>损失</th>
                              </tr>
                            </thead>
                            <tbody>
                              {laps.map((lap, lapIdx) => {
                                const totalLoss = lap.sectors.reduce((sum, s) => sum + s.loss, 0);
                                return (
                                  <tr key={lap.lap} style={{ borderBottom: '1px solid #21262d', background: lapIdx % 2 === 0 ? 'transparent' : 'rgba(22, 27, 34, 0.5)' }}>
                                    <td style={{ padding: '6px 8px', color: '#e6edf3', fontWeight: 600, position: 'sticky', left: 0, background: lapIdx % 2 === 0 ? '#0d1117' : '#161b22', zIndex: 1 }}>第{lap.lap}圈</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#e6edf3', fontWeight: 600 }}>{lap.totalTime.toFixed(2)}s</td>
                                    {lap.sectors.map(s => {
                                      const isBest = s.loss === 0;
                                      const isWorst = s.loss === Math.max(...lap.sectors.map(x => x.loss));
                                      const lossColor = isBest ? '#3fb950' : isWorst ? '#f85149' : s.loss > 0.05 ? '#d29922' : '#8b949e';
                                      return (
                                        <td key={s.sector} style={{ padding: '6px 6px', textAlign: 'right', fontFamily: 'monospace', color: lossColor, fontWeight: isBest || isWorst ? 700 : 400 }}>
                                          {s.loss > 0 ? '+' : ''}{s.loss.toFixed(2)}s
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: totalLoss > 0 ? '#f85149' : '#3fb950', fontWeight: 700 }}>
                                      {totalLoss > 0 ? '+' : ''}{totalLoss.toFixed(2)}s
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </>
            </div>
          )}

          {/* ===== Tab 2: 弯道诊断 ===== */}
          {activeTab === 'corners' && analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 赛道地图与弯道性能诊断看板（双栏布局 - 400px左侧，1fr右侧） */}
              <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 16 }}>
                <div style={{ ...sectionStyle, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <h3 style={{ ...sectionTitleStyle, margin: 0, borderBottom: 'none', paddingBottom: 0 }}>赛道诊断热力图</h3>
                      <button
                        onClick={() => setZoomOnSelect(!zoomOnSelect)}
                        style={{
                          background: zoomOnSelect ? 'rgba(88, 166, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          color: zoomOnSelect ? '#58a6ff' : '#8b949e',
                          border: `1px solid ${zoomOnSelect ? '#58a6ff' : '#30363d'}`,
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 9,
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.2s'
                        }}
                        title={zoomOnSelect ? '切换为完整赛道全貌' : '自动局部放大当前选中的弯道细节'}
                      >
                        {zoomOnSelect ? '🔍 切换全图' : '🔍 弯道放大'}
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, lineHeight: 1.4, alignSelf: 'flex-start' }}>
                      {zoomOnSelect ? '当前已开启局部放大模式，聚焦于选中弯道的 Apex 顶点细节。' : '当前显示赛道全图。点击右侧行并开启“弯道放大”可查看局部过弯细节。'}
                    </div>
                    <InteractiveTrackMap
                      trackId={analysis.trackId}
                      fallbackPositions={sessionDetail?.positions || []}
                      width={376}
                      height={276}
                      zoomOnSelect={zoomOnSelect}
                      channelsData={channelsData}
                      highlightedPoints={
                        turnsData?.turns
                          ? turnsData.turns.map((t, idx) => ({
                              x: t.current?.x || t.x || 0,
                              z: t.current?.z || t.z || 0,
                              label: t.name,
                              color: activeTurnIdx === idx ? '#d29922' : (turnsData.turns.slice(0, 3).some(t3 => t3.index === t.index) ? '#f85149' : '#8b949e'),
                              isActive: activeTurnIdx === idx,
                              isTopLoss: turnsData.turns.slice(0, 3).some(t3 => t3.index === t.index)
                            }))
                          : []
                      }
                      cursorPoint={
                        turnsData?.turns?.[activeTurnIdx]
                          ? {
                              x: turnsData.turns[activeTurnIdx].current?.x || turnsData.turns[activeTurnIdx].x || 0,
                              z: turnsData.turns[activeTurnIdx].current?.z || turnsData.turns[activeTurnIdx].z || 0
                            }
                          : null
                      }
                    />
                  </div>

                  <div style={{ ...sectionStyle, padding: 12, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={sectionTitleStyle}>弯道性能参数表</h3>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, lineHeight: 1.4 }}>
                      重点关注弯心速度（越高越好）与横向G力。若实际车速显著低于推荐车速，系统会标记差值，说明该弯道有进一步推向极限的空间。
                    </div>
                    {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                        暂无弯道分析数据
                      </div>
                    ) : (
                      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 310 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', position: 'sticky', top: 0, background: '#161b22', zIndex: 1 }}>
                              <th style={{ padding: '8px 6px' }}>弯道</th>
                              <th style={{ padding: '8px 6px' }}>类型</th>
                              <th style={{ padding: '8px 6px' }}>入弯 (实际/推荐)</th>
                              <th style={{ padding: '8px 6px' }}>弯心 (实际/推荐)</th>
                              <th style={{ padding: '8px 6px' }}>出弯 (实际/推荐)</th>
                              <th style={{ padding: '8px 6px' }}>档位 (实际/推荐)</th>
                              <th style={{ padding: '8px 6px' }}>横向G</th>
                              <th style={{ padding: '8px 6px' }}>制动G</th>
                            </tr>
                          </thead>
                          <tbody>
                            {turnsData.turns.map((t, idx) => {
                              const apexSpeed = t.current?.apexSpeed ?? 0;
                              const peakLatG = t.current?.peakLatG ?? 0;
                              const longBrakeG = t.current?.longBrakeG ?? 0;
                              const gColor = peakLatG > 2.5 ? '#3fb950' : peakLatG > 1.5 ? '#d29922' : 'var(--text-secondary)';
                              const isSelected = activeTurnIdx === idx;
                              
                              const recEntry = t.recommended?.entrySpeed || '-';
                              const recApex = t.recommended?.apexSpeed || '-';
                              const recExit = t.recommended?.exitSpeed || '-';
                              const recGear = t.recommended?.apexSpeed ? (
                                t.recommended.apexSpeed < 30 ? 1 :
                                t.recommended.apexSpeed < 60 ? 2 :
                                t.recommended.apexSpeed < 100 ? 3 :
                                t.recommended.apexSpeed < 140 ? 4 :
                                t.recommended.apexSpeed < 180 ? 5 :
                                t.recommended.apexSpeed < 220 ? 6 : 7
                              ) : '-';

                              const speedDiff = typeof recApex === 'number' && recApex > 0 ? apexSpeed - recApex : 0;
                              let diffBadge = null;
                              if (recApex > 0 && typeof recApex === 'number') {
                                if (speedDiff < -5) {
                                  diffBadge = (
                                    <span style={{
                                      fontSize: 8.5,
                                      background: 'rgba(248,81,73,0.12)',
                                      color: '#ff7b72',
                                      padding: '1px 3px',
                                      borderRadius: 3,
                                      marginLeft: 4,
                                      fontWeight: 600
                                    }}>
                                      ↓{Math.abs(speedDiff)}
                                    </span>
                                  );
                                } else if (speedDiff >= 2) {
                                  diffBadge = (
                                    <span style={{
                                      fontSize: 8.5,
                                      background: 'rgba(63,185,80,0.12)',
                                      color: '#56d364',
                                      padding: '1px 3px',
                                      borderRadius: 3,
                                      marginLeft: 4,
                                      fontWeight: 600
                                    }}>
                                      ↑{speedDiff}
                                    </span>
                                  );
                                }
                              }

                              return (
                                <tr
                                  key={t.index ?? idx}
                                  onClick={() => setActiveTurnIdx(idx)}
                                  style={{
                                    borderBottom: '1px solid rgba(48, 54, 61, 0.3)',
                                    background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent'
                                  }}
                                >
                                  <td style={{ padding: '8px 6px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'inherit' }}>{t.name}</td>
                                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{t.turnCategory || (t.direction === 'left' ? '左' : '右')}</td>
                                  <td style={{ padding: '8px 6px' }}>
                                    {t.current?.entrySpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/ {recEntry}</span>
                                  </td>
                                  <td style={{ padding: '8px 6px', fontWeight: 700, color: isSelected ? 'var(--accent)' : '#c9d1d9' }}>
                                    {apexSpeed} <span style={{ color: '#8b949e', fontSize: 9, fontWeight: 'normal' }}>/ {recApex}</span>
                                    {diffBadge}
                                  </td>
                                  <td style={{ padding: '8px 6px' }}>
                                    {t.current?.exitSpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/ {recExit}</span>
                                  </td>
                                  <td style={{ padding: '8px 6px' }}>
                                    {t.current?.gear ?? '-'} <span style={{ color: '#8b949e', fontSize: 9 }}>/ {recGear}</span>
                                  </td>
                                  <td style={{ padding: '8px 6px', color: gColor }}>{peakLatG.toFixed(1)}</td>
                                  <td style={{ padding: '8px 6px' }}>{longBrakeG.toFixed(1)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* ===== Tab 1 动力学 & 驾驶分析 ===== */}
          {activeTab === 'overview' && channelsData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 style={{ ...sectionTitleStyle, margin: 0, marginBottom: 14, fontSize: 14 }}>动力学分析</h3>

                {/* 面板1: G-G 摩擦圆 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>G-G 摩擦力圆</h4>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>横向G力反映过弯极限，纵向G力反映加速/制动极限。点越靠近边缘说明轮胎抓地力利用越充分。</div>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>
                      密集区=极限状态保持久；十字形分布=欠缺循迹刹车
                    </div>
                    <div style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis type="number" dataKey="gLat" name="横向G" domain={[-1.8, 1.8]} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v) => v.toFixed(1)} tickCount={7} />
                          <YAxis type="number" dataKey="gLong" name="纵向G" domain={[-1.8, 1.8]} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} tickFormatter={(v) => v.toFixed(1)} tickCount={7} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} formatter={(value, name) => [(value != null ? value.toFixed(2) : '0.00') + ' G', name === 'gLat' ? '横向G' : '纵向G']} />
                          <Scatter name="遥测G值" data={ggData.sampled} fill="rgba(88, 166, 255, 0.45)" shape="circle" />
                          <ReferenceLine x={0} stroke="#484f58" />
                          <ReferenceLine y={0} stroke="#484f58" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, flex: 1 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>最大横向力</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>{ggData.maxLat.toFixed(2)} G</div>
                      </div>
                      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, flex: 1 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>最大纵向制动</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f85149', fontFamily: 'monospace' }}>{ggData.maxBrake.toFixed(2)} G</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 面板2: US/OS 指数曲线 */}
                <div style={{ ...sectionStyle, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>转向不足/过度分析</h4>
                  <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 8, lineHeight: 1.5 }}>正值=车头向外推（转向不足），负值=车尾向外甩（转向过度）。绝对值越大偏离中性越远，用于调校悬挂和差速器。</div>
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={advancedData?.usOsIndex || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '距离(m)', position: 'insideBottomRight', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: 'US/OS指数', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#8b949e' } }} />
                        <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} />
                        <ReferenceLine y={0} stroke="#484f58" />
                        <Line dataKey="value" stroke="#58a6ff" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 面板3: 轮胎滑移效率图 */}
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionStyle}>
                    <h4 style={{ margin: '0 0 4px', fontSize: 12 }}>轮胎滑移效率图</h4>
                    <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6 }}>
                      X=纵向滑移率，Y=侧偏角。点集中=轮胎工作稳定，分散=不稳定。越靠近原点说明轮胎越接近纯滚动（最高效）
                    </div>
                    <div style={{ height: 300 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                          <XAxis type="number" dataKey="slipAvg" domain={['auto', 'auto']} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '纵向滑移率', position: 'insideBottomRight', style: { fontSize: 10, fill: '#8b949e' } }} />
                          <YAxis type="number" dataKey="angleAvg" domain={['auto', 'auto']} stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} label={{ value: '侧偏角(rad)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#8b949e' } }} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }} formatter={(v,n) => [(v != null ? v.toFixed(3) : '0.000'), n === 'slipAvg' ? '滑移率' : '侧偏角']} />
                          <Scatter name="滑移" data={(channelsData.channels || []).filter((_, i) => i % 4 === 0).map(c => ({
                            slipAvg: (Math.abs(c.slipFL||0) + Math.abs(c.slipFR||0) + Math.abs(c.slipRL||0) + Math.abs(c.slipRR||0)) / 4,
                            angleAvg: (Math.abs(c.angleFL||0) + Math.abs(c.angleFR||0) + Math.abs(c.angleRL||0) + Math.abs(c.angleRR||0)) / 4
                          })).filter(d => d.slipAvg > 0.005 || d.angleAvg > 0.01)} fill="#3fb950" r={3} />
                          <ReferenceLine x={0} stroke="#484f58" />
                          <ReferenceLine y={0} stroke="#484f58" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 style={{ ...sectionTitleStyle, margin: 0, marginBottom: 14, fontSize: 14 }}>驾驶分析</h3>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4, lineHeight: 1.5, marginBottom: 12 }}>
                  鼠标悬停任意图表可同步查看所有通道在同一位置的数据。从上到下对照：车速波谷→刹车深度→方向盘角度→档位变化。
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Trail Braking */}
                  {advancedData?.trailBraking && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>Trail Braking</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: advancedData.trailBraking.ratio > 0.3 ? '#3fb950' : '#d29922', fontFamily: 'monospace' }}>
                          {(advancedData.trailBraking.ratio * 100).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>{advancedData.trailBraking.count}/{advancedData.trailBraking.total} 帧</div>
                      </div>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>最高车速</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#58a6ff', fontFamily: 'monospace' }}>
                          {Math.max(...channelsData.channels.map(c => c.speed))}
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>km/h</div>
                      </div>
                      <div style={{ ...sectionStyle, textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>最高转速</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#d29922', fontFamily: 'monospace' }}>
                          {Math.max(...channelsData.channels.map(c => c.rpm || 0)).toFixed(0)}
                        </div>
                        <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>RPM</div>
                      </div>
                    </div>
                  )}
                  <div style={{ ...sectionStyle, height: 160, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>车速曲线</span>
                      <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>最高: {Math.max(...channelsData.channels.map(c => c.speed))} km/h</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>波谷=制动点，波峰=直道极速。找波谷位置判断刹车时机是否合理</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={['auto', 'auto']} unit="km/h" />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value) => [(value != null ? value.toFixed(1) : '0.0') + ' km/h', '车速']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="speed" stroke="#58a6ff" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...sectionStyle, height: 130, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>踏板深度</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>绿=油门 红=刹车。刹车松开后油门应立即衔接，中间空隙越短越好</div>
                    <ResponsiveContainer width="100%" height="80%">
                      <LineChart data={channelsData.channels} syncId="overlaySync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                        <XAxis dataKey="distance" hide={true} />
                        <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={[0, 100]} unit="%" />
                        <Tooltip
                          contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                          formatter={(value, name) => [(value != null ? value.toFixed(1) : '0.0') + '%', name === 'throttle' ? '油门' : name === 'brake' ? '刹车' : name === 'clutch' ? '离合' : '手刹']}
                          labelFormatter={(label) => '距离: ' + label + 'm'}
                        />
                        <Line type="monotone" dataKey="throttle" stroke="#3fb950" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="brake" stroke="#f85149" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="handBrake" stroke="#ff7b72" strokeDasharray="3 3" strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'overview' && analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {analysis && <GearingAnalysisPanel data={analysis['动力齿比']} />}
              {analysis && <SuspensionAnalysisPanel data={analysis['底盘悬挂']} channelsData={channelsData} />}
              {analysis && <DifferentialAnalysisPanel data={analysis['差速抓地力']} />}
            </div>
          )} 
          {/* ===== Tab 3: 影子与教练 ===== */}
          {activeTab === 'replay' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 影子车回放 */}
              <div style={sectionStyle}>
                <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 14 }}>影子车回放</h3>
                <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, lineHeight: 1.5, marginTop: 8 }}>在赛道䯰视图上回放你的行驶轨迹，观察走线是否合理。</div>
                {sessionDetail ? (
                  <ReplayPlayer positions={sessionDetail.positions || []} data={sessionDetail.data || []} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 30, color: '#8b949e', fontSize: 11 }}>
                    {detailLoaded ? '无回放数据' : '加载中...'}
                  </div>
                )}
              </div>

              {/* AI驾驶教练 */}
              <div style={{ ...sectionStyle }}>
                <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 14 }}>AI 驾驶教练</h3>
                <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, lineHeight: 1.5, marginTop: 8 }}>基于遥测数据的智能分析，给出具体的驾驶改进建议。</div>
                <AICoachPanel sessionId={selectedSession} />
              </div>
            </div>
          )}

          </div>
        </div>
        ) : trackFilter ? (
          // 状态 2: 赛道成长轨迹看板
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 导航面包屑 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setTrackFilter(''); }}>
                  赛道成就墙
                </span>
                <span>&gt;</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {sessions.find(s => s.trackId === trackFilter)?.trackName || trackFilter} 轨迹概览
                </span>
              </div>
              <button onClick={() => setTrackFilter('')} style={{
                ...btnSmallStyle, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)'
              }}>
                返回成就墙
              </button>
            </div>

            {/* 看板主体 */}
            {(() => {
              // trackFilter 是 trackId
              const matchedSession = sessions.find(s => s.trackId === trackFilter);
              const trackId = trackFilter; // 直接用 trackFilter 作为 trackId

              // 过滤出该赛道的排行榜记录
              const matchedEntries = lbEntries.filter(e => e.trackId === trackId);
              const trackSessions = [...myFilteredSessions].reverse(); // 从老到新
              const learningData = trackSessions
                .filter(s => s.laps?.best > 0)
                .map((s, idx) => ({
                  index: idx + 1,
                  bestLap: s.laps.best,
                  date: s.savedAt ? new Date(s.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '',
                  car: s.vehicle?.name || `车辆 #${s.vehicle?.ordinal}`,
                  sessionId: s.id
                }));

              const minLap = learningData.length > 0 ? Math.min(...learningData.map(d => d.bestLap)) : 0;
              const maxLap = learningData.length > 0 ? Math.max(...learningData.map(d => d.bestLap)) : 0;
              const yDomain = learningData.length > 0 ? [Math.max(0, minLap - 2), maxLap + 2] : [0, 100];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 首部概览与缩略图 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {trackId ? <TrackThumbnail trackId={trackId} /> : <div style={{ width: 120, height: 80, background: 'rgba(255,255,255,0.02)' }} />}
                    <div>
                      <h2 style={{ margin: '0 0 6px 0', fontSize: 18, fontWeight: 700 }}>{trackFilter}</h2>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>历史最快圈速</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                            {minLap > 0 ? lbFormatTime(minLap) : '-'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>总出赛次数</div>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                            {trackSessions.length} 次
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>总跑圈数</div>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                            {trackSessions.reduce((sum, s) => sum + (s.laps?.count || (s.laps?.best > 0 ? 1 : 0)), 0)} 圈
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 学习曲线折线图 */}
                  {learningData.length > 1 ? (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>学习曲线 · 赛道圈速演进</div>
                      <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={learningData} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                            <XAxis dataKey="index" tickFormatter={v => `第${v}次`} tick={{ fontSize: 10, fill: '#8b949e' }} />
                            <YAxis domain={yDomain} tickFormatter={v => lbFormatTime(v)} tick={{ fontSize: 10, fill: '#8b949e' }} width={55} reversed />
                            <Tooltip
                              formatter={(v, name, props) => [
                                `${lbFormatTime(v)} (${props.payload.car})`,
                                '圈速'
                              ]}
                              labelFormatter={(label, payload) => {
                                const item = payload?.[0]?.payload;
                                return `第 ${label} 次出赛 · ${item?.date || ''}`;
                              }}
                              contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 10 }}
                            />
                            <ReferenceLine y={minLap} stroke="#d29922" strokeDasharray="4 2" label={{ value: '最快', fill: '#d29922', fontSize: 9, position: 'right' }} />
                            <Line
                              type="monotone" dataKey="bestLap"
                              stroke="#3fb950" strokeWidth={2}
                              dot={{ r: 4, fill: '#3fb950', stroke: '#0d1117', strokeWidth: 1 }}
                              activeDot={{ r: 6 }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 30, background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
                      需要至少 2 次比赛记录来绘制学习曲线趋势图
                    </div>
                  )}

                  {/* 分段演进对比表 */}
                  {lbTrendData && lbTrendData.sessions && lbTrendData.sessions.length > 1 && lbTrendData.sessions[0].sectors && lbTrendData.sessions[0].sectors.length > 0 && (() => {
                    const trendSessions = lbTrendData.sessions.filter(s => s.sectors && s.sectors.length > 0);
                    if (trendSessions.length < 2) return null;
                    const sectorCount = trendSessions[0].sectors.length;
                    const optimalLap = lbTrendData.optimalLap || 0;

                    // 计算每个分段的最佳值
                    const sectorBests = [];
                    for (let i = 0; i < sectorCount; i++) {
                      const times = trendSessions.map(s => s.sectors[i]).filter(t => t > 0);
                      sectorBests.push(times.length > 0 ? Math.min(...times) : 0);
                    }

                    return (
                      <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>
                            分段演进对比
                            <span style={{ fontSize: 10, color: '#8b949e', fontWeight: 400, marginLeft: 8 }}>
                              {lbTrendData.vehicleOrdinal ? `车辆 #${lbTrendData.vehicleOrdinal}` : ''}
                            </span>
                          </div>
                          {optimalLap > 0 && (
                            <div style={{ fontSize: 11, color: '#8b949e' }}>
                              理论最优圈: <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 700 }}>{lbFormatTime(optimalLap)}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8 }}>每行=一次出赛，每列=一个分段。绿色=该分段最佳。对比各分段找进步空间。</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>场次</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>日期</th>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>调校</th>
                                {Array.from({ length: sectorCount }, (_, i) => (
                                  <th key={i} style={{ padding: '6px 8px' }}>S{i + 1}</th>
                                ))}
                                <th style={{ padding: '6px 8px' }}>总圈速</th>
                              </tr>
                            </thead>
                            <tbody>
                              {trendSessions.map((s, sIdx) => {
                                const sectorBest = Math.max(...s.sectors.map((t, i) => t === sectorBests[i] ? 1 : 0));
                                return (
                                  <tr key={s.sessionId} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)' }}>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>第{s.sessionIndex || sIdx + 1}次</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', color: '#8b949e' }}>
                                      {s.savedAt ? new Date(s.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '-'}
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', color: s.tuneName ? '#58a6ff' : '#484f58', fontSize: 9 }}>
                                      {s.tuneName || '-'}
                                    </td>
                                    {s.sectors.map((t, i) => {
                                      const isBest = t === sectorBests[i] && t > 0;
                                      // 与上一场对比
                                      const prevS = trendSessions[sIdx - 1];
                                      const prevT = prevS?.sectors?.[i] || 0;
                                      const diff = prevT > 0 ? t - prevT : 0;
                                      const diffColor = diff < -0.1 ? '#3fb950' : diff > 0.1 ? '#f85149' : '#8b949e';
                                      return (
                                        <td key={i} style={{
                                          padding: '6px 8px',
                                          fontFamily: 'monospace', fontWeight: isBest ? 700 : 400,
                                          color: isBest ? '#3fb950' : 'var(--text-primary)'
                                        }}>
                                          {t > 0 ? t.toFixed(2) : '-'}
                                          {diff !== 0 && (
                                            <span style={{ fontSize: 8, color: diffColor, marginLeft: 2 }}>
                                              {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: s.bestLap === lbTrendData.bestLap ? '#3fb950' : 'var(--text-primary)' }}>
                                      {s.bestLap > 0 ? lbFormatTime(s.bestLap) : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* 最优行 */}
                              {sectorBests.some(t => t > 0) && (
                                <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(63,185,80,0.05)' }}>
                                   <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: '#3fb950' }}>最优</td>
                                   <td style={{ padding: '6px 8px', textAlign: 'left', color: '#8b949e' }}>各段最佳</td>
                                   <td style={{ padding: '6px 8px' }}></td>
                                  {sectorBests.map((t, i) => (
                                    <td key={i} style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                      {t > 0 ? t.toFixed(2) : '-'}
                                    </td>
                                  ))}
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                    {optimalLap > 0 ? lbFormatTime(optimalLap) : '-'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 弯道演进对比表 */}
                  {trackTurnsData && trackTurnsData.turns && trackTurnsData.turns.length > 0 && (() => {
                    const turns = trackTurnsData.turns;
                    // 只显示有历史数据的弯道
                    const turnsWithHistory = turns.filter(t => t.history && t.history.length > 1);
                    if (turnsWithHistory.length === 0) return null;

                    return (
                      <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>弯道演进对比</div>
                        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8 }}>每个弯道在不同场次的弯心速度变化。绿色=历史最佳，红色=退步。</div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'center' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'left' }}>弯道</th>
                                <th style={{ padding: '6px 8px' }}>类型</th>
                                {turnsWithHistory[0].history.slice(-5).map((h, i) => (
                                  <th key={i} style={{ padding: '6px 8px' }}>
                                    {h.savedAt ? new Date(h.savedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : `#${i + 1}`}
                                  </th>
                                ))}
                                <th style={{ padding: '6px 8px' }}>最佳</th>
                              </tr>
                            </thead>
                            <tbody>
                              {turnsWithHistory.map((turn, tIdx) => {
                                const recentHistory = turn.history.slice(-5);
                                const apexSpeeds = recentHistory.map(h => h.apexSpeed || 0).filter(v => v > 0);
                                const bestApex = apexSpeeds.length > 0 ? Math.max(...apexSpeeds) : 0;
                                return (
                                  <tr key={turn.index || tIdx} style={{ borderBottom: '1px solid rgba(48,54,61,0.3)' }}>
                                    <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-primary)' }}>{turn.name}</td>
                                    <td style={{ padding: '6px 8px', color: '#8b949e' }}>{turn.direction === 'left' ? '左' : '右'}</td>
                                    {recentHistory.map((h, i) => {
                                      const speed = h.apexSpeed || 0;
                                      const isBest = speed === bestApex && speed > 0;
                                      // 与上一场对比
                                      const prevSpeed = i > 0 ? (recentHistory[i - 1].apexSpeed || 0) : 0;
                                      const diff = prevSpeed > 0 ? speed - prevSpeed : 0;
                                      const diffColor = diff > 1 ? '#3fb950' : diff < -1 ? '#f85149' : '#8b949e';
                                      return (
                                        <td key={i} style={{
                                          padding: '6px 8px', fontFamily: 'monospace',
                                          fontWeight: isBest ? 700 : 400,
                                          color: isBest ? '#3fb950' : 'var(--text-primary)'
                                        }}>
                                          {speed > 0 ? speed : '-'}
                                          {diff !== 0 && (
                                            <span style={{ fontSize: 8, color: diffColor, marginLeft: 2 }}>
                                              {diff > 0 ? '+' : ''}{diff.toFixed(0)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
                                      {bestApex > 0 ? bestApex : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 出赛车辆排行列表 */}
                  {matchedEntries.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>该赛道出赛车辆与PB</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {matchedEntries.map(e => (
                          <div key={e.vehicleOrdinal} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)'
                          }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{(vehiclesList[e.vehicleOrdinal]?.name || e.vehicleName) || (e.vehicleOrdinal && e.vehicleOrdinal !== 'null' ? `Car #${e.vehicleOrdinal}` : '未知车辆')}</div>
                              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                                #{e.vehicleOrdinal} · {getVehicleClass(e.vehicleClass)} {e.vehiclePI} PI
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>
                                {lbFormatTime(e.bestLap)}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>
                                {e.sessionCount}次出赛 · {e.totalLaps}圈
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 历次比赛记录列表 */}
                  {trackSessions.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>该赛道历史比赛记录</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '8px 6px' }}>出赛日期</th>
                              <th style={{ padding: '8px 6px' }}>出赛车辆</th>
                              <th style={{ padding: '8px 6px' }}>圈速/总用时</th>
                              <th style={{ padding: '8px 6px' }}>总跑圈数</th>
                              <th style={{ padding: '8px 6px', textAlign: 'right' }}>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trackSessions.map(session => (
                              <tr key={session.id} style={{ borderBottom: '1px solid rgba(48, 54, 61, 0.3)' }}>
                                <td style={{ padding: '8px 6px' }}>{formatDate(session.savedAt)}</td>
                                <td style={{ padding: '8px 6px' }}>{(vehiclesList[session.vehicle?.ordinal]?.name || session.vehicle?.name) || (session.vehicle?.ordinal && session.vehicle?.ordinal !== 'null' ? `Car #${session.vehicle?.ordinal}` : '未知车辆')}</td>
                                <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>
                                  {session.laps?.best > 0 ? formatTime(session.laps.best) : (session.summary?.duration > 0 ? formatTime(session.summary.duration / 1000) : '-')}
                                </td>
                                <td style={{ padding: '8px 6px' }}>{session.laps?.count || (session.laps?.best > 0 ? 1 : 0)}圈</td>
                                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => loadAnalysis(session.id)}
                                    style={{
                                      ...btnSmallStyle,
                                      background: 'rgba(88, 166, 255, 0.1)',
                                      color: '#58a6ff',
                                      borderColor: 'rgba(88, 166, 255, 0.3)',
                                      padding: '2px 8px'
                                    }}
                                  >
                                    查看详情
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          // 状态 1: 赛道风云榜大屏
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 700 }}>
            {/* 顶部控制栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, background: 'linear-gradient(90deg, #fff, #8b949e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  🏆 赛道风云榜
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, letterSpacing: 1 }}>
                  GLOBAL TRACK LEADERBOARDS
                </div>
              </div>
              <button onClick={loadLeaderboard} style={{
                padding: '8px 16px', background: 'rgba(88,166,255,0.1)',
                border: '1px solid rgba(88,166,255,0.3)', borderRadius: 6,
                color: '#58a6ff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                transition: 'all 0.2s'
              }} onMouseOver={e => e.currentTarget.style.background='rgba(88,166,255,0.2)'} onMouseOut={e => e.currentTarget.style.background='rgba(88,166,255,0.1)'}>
                刷新榜单
              </button>
            </div>

            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
              {/* 左侧：赛道导航栏 */}
              <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: 10, opacity: 0.5 }}>🔍</span>
                  <input
                    type="text"
                    placeholder="搜索赛道..."
                    value={sessionSearchQuery}
                    onChange={e => setSessionSearchQuery(e.target.value)}
                    style={{ ...inputStyle, width: '100%', paddingLeft: 36, background: 'rgba(0,0,0,0.2)' }}
                  />
                </div>
                
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const tracks = groupedAchievements.filter(t => 
                      !sessionSearchQuery.trim() || t.trackName.toLowerCase().includes(sessionSearchQuery.toLowerCase())
                    );
                    
                    if (tracks.length > 0 && !selectedLbTrackId) {
                      setTimeout(() => setSelectedLbTrackId(tracks[0].trackId), 0);
                    }

                    if (tracks.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: '#8b949e', fontSize: 12 }}>暂无赛道数据</div>;

                    return tracks.map(track => {
                      const isActive = selectedLbTrackId === track.trackId;
                      const activeStyle = isActive ? {
                        background: 'linear-gradient(90deg, rgba(37,99,235,0.2) 0%, rgba(37,99,235,0.05) 100%)',
                        borderLeft: '4px solid #2563eb',
                        borderColor: 'rgba(37,99,235,0.5)',
                        boxShadow: 'inset 0 0 20px rgba(37,99,235,0.1)'
                      } : {
                        background: 'rgba(255,255,255,0.02)',
                        borderLeft: '4px solid transparent',
                        borderColor: 'transparent'
                      };

                      return (
                        <div key={track.trackId} onClick={() => setSelectedLbTrackId(track.trackId)}
                          style={{
                            padding: '12px 16px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            border: '1px solid', ...activeStyle
                          }}
                          onMouseOver={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.05)' }}
                          onMouseOut={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#fff' : '#c9d1d9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {track.trackName}
                            </div>
                            <div style={{ fontSize: 11, color: '#8b949e' }}>
                              {track.vehicles.filter(v => v.bestLap > 0).length} 台参赛车辆
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#3fb950' : '#8b949e', fontFamily: 'monospace' }}>
                            {lbFormatTime(track.bestLap)}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* 右侧：风云榜主视图 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(13, 17, 23, 0.7)', border: '1px solid rgba(48,54,61,0.5)', borderRadius: 12, overflow: 'hidden', backdropFilter: 'blur(10px)', height: '100%' }}>
                {(() => {
                  const track = selectedLbTrackId ? groupedAchievements.find(t => t.trackId === selectedLbTrackId) : null;
                  if (!track) return <div style={{ margin: 'auto', color: '#8b949e' }}>请在左侧选择一个赛道</div>;

                  const validVehicles = track.vehicles.filter(v => v.bestLap > 0).sort((a,b) => a.bestLap - b.bestLap);
                  const top3 = validVehicles.slice(0, 3);
                  const rest = validVehicles.slice(3, 50); // limit to top 50
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      {/* 榜单头部 */}
                      <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 24 }}>🏁</span> {track.trackName}
                          </h3>
                          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8 }}>
                            绝对圈速记录 · 共有 {validVehicles.length} 个有效成绩
                          </div>
                        </div>
                        <button onClick={() => setTrackFilter(track.trackId)} style={{
                          padding: '10px 20px', background: 'linear-gradient(180deg, #2ea043 0%, #238636 100%)',
                          border: '1px solid rgba(240,246,252,0.1)', borderRadius: 8,
                          color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          boxShadow: '0 0 15px rgba(46,160,67,0.4)', transition: 'all 0.2s'
                        }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                          进入历史走势分析库 ➔
                        </button>
                      </div>

                      <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                        {/* 领奖台区域 (Top 3) */}
                        {top3.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24, marginBottom: 40, height: 180 }}>
                            {/* 第二名 */}
                            {top3[1] && (
                              <div style={{ width: 160, height: 130, background: 'linear-gradient(180deg, rgba(192,192,192,0.1) 0%, rgba(0,0,0,0.5) 100%)', borderTop: '2px solid #c0c0c0', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, position: 'relative' }}>
                                <div style={{ position: 'absolute', top: -20, fontSize: 24, textShadow: '0 0 10px rgba(192,192,192,0.5)' }}>🥈</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#c0c0c0', marginBottom: 8 }}>2nd</div>
                                <div style={{ fontSize: 12, color: '#fff', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{(vehiclesList[top3[1].vehicleOrdinal]?.name || top3[1].vehicleName)}</div>
                                <div style={{ fontSize: 10, color: '#8b949e', margin: '4px 0 8px 0' }}>{getVehicleClass(top3[1].vehicleClass)} {top3[1].vehiclePI}</div>
                                <div style={{ fontSize: 16, fontFamily: 'monospace', color: '#c0c0c0', fontWeight: 700, marginTop: 'auto' }}>{lbFormatTime(top3[1].bestLap)}</div>
                                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#8b949e', marginTop: 2 }}>+{ (top3[1].bestLap - top3[0].bestLap).toFixed(3) }s</div>
                              </div>
                            )}
                            
                            {/* 第一名 */}
                            {top3[0] && (
                              <div style={{ width: 180, height: 160, background: 'linear-gradient(180deg, rgba(255,215,0,0.15) 0%, rgba(0,0,0,0.6) 100%)', borderTop: '3px solid #ffd700', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, position: 'relative', boxShadow: '0 -10px 30px rgba(255,215,0,0.15)' }}>
                                <div style={{ position: 'absolute', top: -24, fontSize: 32, textShadow: '0 0 15px rgba(255,215,0,0.8)' }}>👑</div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: '#ffd700', marginBottom: 8, textShadow: '0 0 10px rgba(255,215,0,0.3)' }}>1st</div>
                                <div style={{ fontSize: 13, color: '#fff', textAlign: 'center', fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{(vehiclesList[top3[0].vehicleOrdinal]?.name || top3[0].vehicleName)}</div>
                                <div style={{ fontSize: 11, color: '#ffd700', opacity: 0.8, margin: '4px 0 8px 0' }}>{getVehicleClass(top3[0].vehicleClass)} {top3[0].vehiclePI}</div>
                                <div style={{ fontSize: 18, fontFamily: 'monospace', color: '#ffd700', fontWeight: 800, marginTop: 'auto', letterSpacing: 1 }}>{lbFormatTime(top3[0].bestLap)}</div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>绝对霸主</div>
                              </div>
                            )}

                            {/* 第三名 */}
                            {top3[2] && (
                              <div style={{ width: 160, height: 110, background: 'linear-gradient(180deg, rgba(205,127,50,0.1) 0%, rgba(0,0,0,0.5) 100%)', borderTop: '2px solid #cd7f32', borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, position: 'relative' }}>
                                <div style={{ position: 'absolute', top: -18, fontSize: 20, textShadow: '0 0 10px rgba(205,127,50,0.5)' }}>🥉</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#cd7f32', marginBottom: 8 }}>3rd</div>
                                <div style={{ fontSize: 12, color: '#fff', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(vehiclesList[top3[2].vehicleOrdinal]?.name || top3[2].vehicleName)}</div>
                                <div style={{ fontSize: 10, color: '#8b949e', margin: '4px 0 8px 0' }}>{getVehicleClass(top3[2].vehicleClass)} {top3[2].vehiclePI}</div>
                                <div style={{ fontSize: 15, fontFamily: 'monospace', color: '#cd7f32', fontWeight: 700, marginTop: 'auto' }}>{lbFormatTime(top3[2].bestLap)}</div>
                                <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#8b949e', marginTop: 2 }}>+{ (top3[2].bestLap - top3[0].bestLap).toFixed(3) }s</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 后续排名列表 */}
                        {rest.length > 0 && (
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#8b949e', textAlign: 'left', fontSize: 12 }}>
                                  <th style={{ padding: '12px 24px', width: 60 }}>排名</th>
                                  <th style={{ padding: '12px 16px' }}>参赛车辆</th>
                                  <th style={{ padding: '12px 16px', width: 80 }}>级别/PI</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>最佳圈速</th>
                                  <th style={{ padding: '12px 24px', textAlign: 'right' }}>时间差</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rest.map((v, idx) => (
                                  <tr key={v.vehicleOrdinal} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                    <td style={{ padding: '12px 24px', fontWeight: 600, color: '#8b949e' }}>{idx + 4}</td>
                                    <td style={{ padding: '12px 16px', color: '#e6edf3' }}>{(vehiclesList[v.vehicleOrdinal]?.name || v.vehicleName)}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                      <span style={{ display: 'inline-block', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4, fontSize: 11, color: '#c9d1d9' }}>
                                        {getVehicleClass(v.vehicleClass)} {v.vehiclePI}
                                      </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#58a6ff', fontWeight: 600 }}>{lbFormatTime(v.bestLap)}</td>
                                    <td style={{ padding: '12px 24px', textAlign: 'right', fontFamily: 'monospace', color: '#ff7b72' }}>+{ (v.bestLap - top3[0].bestLap).toFixed(3) }s</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        
                        {validVehicles.length === 0 && (
                          <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🏎️</div>
                            <div>该赛道暂无有效跑圈数据</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={() => setShowDeleteConfirm(null)}>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 10, padding: 20,
            maxWidth: 400, width: '90%', border: '1px solid var(--border)'
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>确认删除</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              确定要删除此比赛记录吗？相关分析数据也将被清除，此操作不可恢复。
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(null)} style={btnSmallStyle}>取消</button>
              <button onClick={() => deleteSession(showDeleteConfirm)} style={{ ...btnSmallStyle, background: '#da3633', color: '#fff', border: 'none' }}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnSmallStyle = {
  padding: '4px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500
};

const sectionStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  border: '1px solid var(--border)'
};

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 12,
  color: 'var(--accent)',
  borderBottom: '1px solid var(--border)',
  paddingBottom: 8
};

// Round 5: 赛道轨迹缩略图
function TrackThumbnail({ trackId }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const drawThumb = async () => {
      try {
        const res = await fetch(`/api/tracks/${trackId}/thumbnail`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.positions || data.positions.length < 2) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const positions = data.positions;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        positions.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        });
        const pad = 3;
        const rX = Math.max(1, maxX - minX);
        const rZ = Math.max(1, maxZ - minZ);
        const toX = x => pad + (x - minX) / rX * (w - pad * 2);
        const toY = z => h - pad - (z - minZ) / rZ * (h - pad * 2);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        positions.forEach((p, i) => {
          if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
          else ctx.lineTo(toX(p.x), toY(p.z));
        });
        ctx.closePath();
        ctx.stroke();
      } catch (e) {
        // 缩略图加载失败，静默忽略
      }
    };
    drawThumb();
  }, [trackId]);

  return (
    <canvas ref={canvasRef} width={60} height={40}
      style={{ width: 60, height: 40, borderRadius: 3, background: 'rgba(88,166,255,0.05)', flexShrink: 0 }}
    />
  );
}

// 交互式 Canvas 赛道图组件
function InteractiveTrackMap({ trackId, fallbackPositions = [], highlightedPoints = [], cursorPoint = null, width = 300, height = 300, showCoasting = false, coastingPoints = [], zoomOnSelect = false, channelsData = null }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState([]);
  
  useEffect(() => {
    const fetchPositions = async () => {
      if (!trackId) return;
      try {
        const res = await fetch(`/api/tracks/${trackId}`);
        if (!res.ok) return;
        const data = await res.json();
        // 与赛道管理完全一致：centerline → points → trajectories[0]
        const resolved = (data.centerline && data.centerline.length > 2) ? data.centerline
          : (data.points && data.points.length > 2) ? data.points
          : (data.trajectories && data.trajectories.length > 0 && data.trajectories[0].length > 2) ? data.trajectories[0]
          : [];
        setPositions(resolved);
      } catch (e) {
        console.error('Failed to load track map coordinates', e);
      }
    };
    fetchPositions();
  }, [trackId]);

  // 选择最终要绘制的点集：优先赛道中心线，若中心线点数不足则用实际行驶轨迹兜底
  const drawPositions = positions.length >= 2 ? positions : fallbackPositions;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawPositions.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    const activePt = highlightedPoints.find(p => p.isActive);
    const hasActiveZoom = zoomOnSelect && activePt && typeof activePt.x === 'number' && typeof activePt.z === 'number';
    
    if (hasActiveZoom) {
      // 放大该弯道顶点，显示附近 150 米范围的弯道细节
      const zoomRange = 150;
      minX = activePt.x - zoomRange;
      maxX = activePt.x + zoomRange;
      minZ = activePt.z - zoomRange;
      maxZ = activePt.z + zoomRange;
    } else {
      drawPositions.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });
    }
    
    if (maxX - minX < 0.01 && maxZ - minZ < 0.01) return;

    // 缩放边距：放大时用紧凑边距，完整赛道用宽边距
    const pad = hasActiveZoom ? 20 : 40;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const sc = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * sc) / 2;
    const oz = (h - (maxZ - minZ) * sc) / 2;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // 降采样（与赛道管理一致：>1000点时降采样到500）
    let pts = drawPositions;
    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 500);
      const sampled = [pts[0]];
      for (let i = step; i < pts.length - 1; i += step) sampled.push(pts[i]);
      sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }
    
    // 1. 绘制真实赛道边界多边形 (如果存在 width 数据) — 与赛道管理一致
    if (pts[0].widthLeft !== undefined) {
      ctx.fillStyle = 'rgba(136, 148, 160, 0.4)'; // 与赛道管理一致的柏油路面灰色
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const yaw = pt.yaw || 0;
        const wl = pt.widthLeft || 2;
        const nx = -Math.cos(yaw);
        const nz = Math.sin(yaw);
        const px = (pt.x + nx * wl - minX) * sc + ox;
        const pz = h - oz - (pt.z + nz * wl - minZ) * sc;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const pt = pts[i];
        const yaw = pt.yaw || 0;
        const wr = pt.widthRight || 2;
        const nx = Math.cos(yaw);
        const nz = -Math.sin(yaw);
        const px = (pt.x + nx * wr - minX) * sc + ox;
        const pz = h - oz - (pt.z + nz * wr - minZ) * sc;
        ctx.lineTo(px, pz);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 回退：画粗线底色
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const px = (p.x - minX) * sc + ox;
        const pz = h - oz - (p.z - minZ) * sc;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
    
    // 2. 绘制高亮蓝色走线 — 与赛道管理一致
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - minX) * sc + ox;
      const pz = h - oz - (p.z - minZ) * sc;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    });
    ctx.stroke();

    // 3. 绘制滑行高亮（Coasting）
    if (showCoasting && coastingPoints && coastingPoints.length > 0) {
      ctx.fillStyle = 'rgba(188, 140, 255, 0.4)';
      coastingPoints.forEach(p => {
        const px = (p.x - minX) * sc + ox;
        const pz = h - oz - (p.z - minZ) * sc;
        ctx.beginPath();
        ctx.arc(px, pz, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    

    // 4. 绘制弯道高亮与标签
    highlightedPoints.forEach((pt) => {
      if (!pt.x || !pt.z) return;
      const tx = (pt.x - minX) * sc + ox;
      const ty = h - oz - (pt.z - minZ) * sc;
      const color = pt.color || '#f85149';
      const isActive = pt.isActive;
      const isTopLoss = pt.isTopLoss;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      if (isActive || isTopLoss) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(tx, ty, isActive ? 24 : 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (isActive) {
        // 绘制十字定位靶线
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx - 35, ty);
        ctx.lineTo(tx + 35, ty);
        ctx.moveTo(tx, ty - 35);
        ctx.lineTo(tx, ty + 35);
        ctx.stroke();
      }
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tx, ty, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = isActive ? 'bold 11px monospace' : '9px monospace';
      ctx.fillText(pt.label || '', tx + (isActive ? 10 : 8), ty - (isActive ? 10 : 8));
    });
    
    // 5. 绘制当前联动游标点
    if (cursorPoint && cursorPoint.x && cursorPoint.z) {
      const cx = (cursorPoint.x - minX) * sc + ox;
      const cy = h - oz - (cursorPoint.z - minZ) * sc;
      
      ctx.strokeStyle = 'rgba(210, 153, 34, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#d29922';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [drawPositions, highlightedPoints, cursorPoint, showCoasting, coastingPoints]);
  
  return (
    <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 8, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}


