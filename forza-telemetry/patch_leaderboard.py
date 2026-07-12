import re

filepath = 'client/src/components/pages/SessionHistoryPage.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state variable
if 'const [lbViewMode, setLbViewMode]' not in content:
    content = re.sub(
        r'(const \[lbTrendData, setLbTrendData\] = useState\(null\);)',
        r'\1\n  const [lbViewMode, setLbViewMode] = useState(\'achievements\');',
        content
    )

# 2. Add toggle UI
header_pattern = r'(<h2 style=\{\{ fontSize: 18, fontWeight: 700, margin: 0 \}\}>我的赛道成就墙</h2>\s*<div style=\{\{ fontSize: 11, color: \'var\(--text-secondary\)\', marginTop: 4 \}\}>\s*共跑过 \{groupedAchievements\.length\} 个赛道，点击卡片聚焦该赛道\s*</div>)'
replacement_header = """<div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>我的赛道成就墙</h2>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 2 }}>
                    <button onClick={() => setLbViewMode('achievements')} style={{ ...btnSmallStyle, background: lbViewMode === 'achievements' ? '#2563eb' : 'transparent', color: lbViewMode === 'achievements' ? '#fff' : '#8b949e', border: 'none' }}>成就视图</button>
                    <button onClick={() => setLbViewMode('leaderboard')} style={{ ...btnSmallStyle, background: lbViewMode === 'leaderboard' ? '#2563eb' : 'transparent', color: lbViewMode === 'leaderboard' ? '#fff' : '#8b949e', border: 'none' }}>风云榜</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {lbViewMode === 'achievements' ? `共跑过 ${groupedAchievements.length} 个赛道，点击卡片聚焦该赛道` : '展示每个赛道的绝对圈速霸主！'}
                </div>"""
content = re.sub(header_pattern, replacement_header, content)

# 3. Add Leaderboard view logic
grid_pattern = r'(\{/\* 卡片网格 \*/\}\s*<div style=\{\{ display: \'grid\', gridTemplateColumns: \'repeat\(auto-fill, minmax\(260px, 1fr\)\)\', gap: 12 \}\}>\s*\{\(\(\) => \{\s*const filteredAchievements = groupedAchievements\.filter\(entry => \{\s*return !sessionSearchQuery\.trim\(\) \|\| entry\.trackName\.toLowerCase\(\)\.includes\(sessionSearchQuery\.toLowerCase\(\)\);\s*\}\);\s*if \(filteredAchievements\.length === 0\) \{\s*return <div style=\{\{ gridColumn: \'1/-1\' \}\}><EmptyState icon="🏆" title="暂无成就卡片" description="在不同赛道跑圈并保存记录后将自动生成成就卡片" /></div>;\s*\}\s*return filteredAchievements\.map\(entry => \{)'
replacement_grid = """{/* 卡片网格或风云榜 */}
            <div style={{ display: lbViewMode === 'achievements' ? 'grid' : 'flex', flexDirection: lbViewMode === 'leaderboard' ? 'column' : 'row', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {(() => {
                const filteredAchievements = groupedAchievements.filter(entry => {
                  return !sessionSearchQuery.trim() || entry.trackName.toLowerCase().includes(sessionSearchQuery.toLowerCase());
                });

                if (filteredAchievements.length === 0) {
                  return <div style={{ gridColumn: '1/-1' }}><EmptyState icon="🏆" title="暂无成就数据" description="在不同赛道跑圈并保存记录后将自动生成" /></div>;
                }

                if (lbViewMode === 'leaderboard') {
                  return filteredAchievements.map(entry => {
                    const validVehicles = entry.vehicles.filter(v => v.bestLap > 0).sort((a,b) => a.bestLap - b.bestLap).slice(0, 10);
                    if (validVehicles.length === 0) return null;
                    return (
                      <div key={entry.trackId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 4 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#e6edf3', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🏁</span> {entry.trackName}
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #30363d', color: '#8b949e', textAlign: 'left' }}>
                              <th style={{ padding: '8px', width: '60px' }}>排名</th>
                              <th style={{ padding: '8px' }}>参赛车辆</th>
                              <th style={{ padding: '8px', textAlign: 'right' }}>最佳圈速</th>
                              <th style={{ padding: '8px', textAlign: 'right' }}>与第一名差距</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validVehicles.map((v, idx) => {
                              const gap = idx === 0 ? '-' : '+' + (v.bestLap - validVehicles[0].bestLap).toFixed(2) + 's';
                              const rankColor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#8b949e';
                              const rowBg = idx === 0 ? 'rgba(255, 215, 0, 0.05)' : 'transparent';
                              return (
                                <tr key={v.vehicleOrdinal} style={{ borderBottom: '1px solid rgba(48,54,61,0.5)', background: rowBg }}>
                                  <td style={{ padding: '8px', fontWeight: 700, color: rankColor, fontSize: idx < 3 ? 14 : 12 }}>#{idx + 1}</td>
                                  <td style={{ padding: '8px', color: '#e6edf3', fontWeight: idx === 0 ? 600 : 400 }}>{v.vehicleName} <span style={{ color: '#8b949e', fontSize: 10, marginLeft: 4 }}>({getVehicleClass(v.vehicleClass)} {v.vehiclePI})</span></td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: idx === 0 ? '#ffd700' : '#3fb950', fontWeight: 700 }}>{lbFormatTime(v.bestLap)}</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace', color: '#8b949e' }}>{gap}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    );
                  });
                }

                return filteredAchievements.map(entry => {"""
content = re.sub(grid_pattern, replacement_grid, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched successfully!')
