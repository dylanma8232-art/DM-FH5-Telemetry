import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatShortTime(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function SectorAnalysis({ sessionId }) {
  const [sectorData, setSectorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [numSectors, setNumSectors] = useState(3);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/analysis/${sessionId}/sectors?sectors=${numSectors}`)
      .then(r => r.json())
      .then(data => {
        setSectorData(data);
      })
      .catch(e => {
        console.error('Sector analysis error:', e);
        setSectorData(null);
      })
      .finally(() => setLoading(false));
  }, [sessionId, numSectors]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>分析中...</div>;
  }

  if (!sectorData || sectorData.error) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>无足够的位置数据进行分段分析</div>;
  }

  const chartData = (sectorData.sectors || []).map(s => ({
    name: `Sector ${s.sectorIndex}`,
    sectorTime: s.sectorTime,
    maxSpeed: s.maxSpeed,
    avgSpeed: s.avgSpeed,
    avgAccel: (s.avgAccel || 0) / 2.55,
    avgBrake: (s.avgBrake || 0) / 2.55,
    }));

  const maxSectorTime = Math.max(...chartData.map(d => d.sectorTime));
  const minSectorTime = Math.min(...chartData.map(d => d.sectorTime));

  // Round 4: 理论最佳圈速 = 各段最快之和
  const optimalLap = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.sectorTime, 0) - 
    chartData.reduce((sum, d) => sum + (d.sectorTime - minSectorTime > 0 ? d.sectorTime - minSectorTime : 0), 0)
    : 0;
  const actualLap = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.sectorTime, 0) : 0;
  const theoreticalBest = chartData.length > 0 ? minSectorTime * chartData.length : 0;

  return (
    <div>
      {/* 控制栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>赛道分段分析</h3>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
            总距离: {(sectorData.totalDist / 1000).toFixed(2)} km · 分段数: {numSectors}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>分段数:</span>
          {[2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setNumSectors(n)}
              style={{
                padding: '3px 10px',
                background: numSectors === n ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: numSectors === n ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Sector时间柱状图 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>各Sector用时</div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                tickFormatter={(v) => formatShortTime(v)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                formatter={(value) => [formatTime(value), '用时']}
              />
              <Bar dataKey="sectorTime" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.sectorTime === minSectorTime ? '#3fb950' : entry.sectorTime === maxSectorTime ? '#f85149' : '#58a6ff'}
                  />
                ))}
              </Bar>
              {/* Round 4: 最佳分段参考线 */}
              {minSectorTime > 0 && (
                <ReferenceLine y={minSectorTime} stroke="#d29922" strokeDasharray="4 4" strokeWidth={1}
                  label={{ value: '最快段 ' + formatShortTime(minSectorTime), fontSize: 9, fill: '#d29922', position: 'insideTopRight' }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sector统计卡片 */}
      {/* Round 4: 理论最佳圈速对比 */}
      {actualLap > 0 && theoreticalBest > 0 && (
        <div style={{
          background: 'rgba(210, 153, 34, 0.08)',
          border: '1px solid rgba(210, 153, 34, 0.25)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--text-secondary)' }}>实际圈速: </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#58a6ff' }}>{formatTime(actualLap)}</span>
          </div>
          <div style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--text-secondary)' }}>理论最佳: </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#d29922' }}>{formatTime(theoreticalBest)}</span>
          </div>
          <div style={{ fontSize: 11 }}>
            <span style={{ color: 'var(--text-secondary)' }}>可提升: </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3fb950' }}>
              {(actualLap - theoreticalBest).toFixed(3)}s
            </span>
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
      }}>
        {(sectorData.sectors || []).map(s => (
          <div key={s.sectorIndex} style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Sector {s.sectorIndex}</span>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: s.sectorTime === minSectorTime ? '#3fb950' : s.sectorTime === maxSectorTime ? '#f85149' : 'var(--text-primary)',
                fontFamily: 'monospace'
              }}>
                {formatTime(s.sectorTime)}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 10 }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>最高速度: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{Math.round(s.maxSpeed)} km/h</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>平均速度: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{Math.round(s.avgSpeed)} km/h</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>平均油门: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#3fb950' }}>{Math.round((s.avgAccel || 0) / 2.55)}%</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>平均刹车: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f85149' }}>{Math.round((s.avgBrake || 0) / 2.55)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
