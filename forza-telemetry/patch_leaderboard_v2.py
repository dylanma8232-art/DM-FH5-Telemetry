import re

filepath = 'client/src/components/pages/SessionHistoryPage.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update states
if 'const [selectedLbTrackId, setSelectedLbTrackId]' not in content:
    content = re.sub(
        r'const \[lbViewMode, setLbViewMode\] = useState\(\'achievements\'\);',
        r'const [selectedLbTrackId, setSelectedLbTrackId] = useState(null);',
        content
    )

# 2. Replace Status 1 Header and Body
status1_pattern = r'(// 状态 1: 我的赛道成就墙 \(首屏\)\s*<div>\s*<div style=\{\{ display: \'flex\', justifyContent: \'space-between\', alignItems: \'center\', marginBottom: 16 \}\}>[\s\S]*?)(\{/\* 卡片网格或风云榜 \*/\}[\s\S]*?            \}\)\(\)\}\s*</div>\s*</div>)'

replacement_status1 = """// 状态 1: 赛道风云榜大屏
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
                                <div style={{ fontSize: 12, color: '#fff', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{top3[1].vehicleName}</div>
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
                                <div style={{ fontSize: 13, color: '#fff', textAlign: 'center', fontWeight: 600, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{top3[0].vehicleName}</div>
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
                                <div style={{ fontSize: 12, color: '#fff', textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top3[2].vehicleName}</div>
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
                                    <td style={{ padding: '12px 16px', color: '#e6edf3' }}>{v.vehicleName}</td>
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
          </div>"""

if '风云榜大屏' not in content:
    content = re.sub(status1_pattern, replacement_status1, content)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched completely!")
else:
    print("Already patched!")
