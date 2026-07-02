import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../shared/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export function LapComparison({ sessionId }) {
  const [session, setSession] = useState(null);
  const [selectedLaps, setSelectedLaps] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch('/api/sessions/' + sessionId)
      .then(res => res.json())
      .then(data => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const laps = useMemo(() => {
    if (!session || !session.data) return [];
    
    const lapMap = {};
    session.data.forEach(d => {
      const lap = d.lapNumber || 0;
      if (!lapMap[lap]) {
        lapMap[lap] = { lap, startTime: d.timestampMS, data: [] };
      }
      lapMap[lap].data.push(d);
      lapMap[lap].endTime = d.timestampMS;
    });

    return Object.values(lapMap).map(l => ({
      ...l,
      duration: (l.endTime - l.startTime) / 1000,
      pointCount: l.data.length
    })).filter(l => l.lap > 0 && l.duration > 10);
  }, [session]);

  const compareLaps = useMemo(() => {
    if (selectedLaps.length < 2) return null;

    const selectedLapData = selectedLaps.map(num => laps.find(l => l.lap === num)).filter(Boolean);
    if (selectedLapData.length < 2) return null;

    const maxLen = Math.max(...selectedLapData.map(l => l.data.length));
    const data = [];
    // 找最佳圈作为基准
    const refLap = selectedLapData.reduce((a, b) => a.duration < b.duration ? a : b);

    for (let i = 0; i < maxLen; i++) {
      const row = { index: i };
      // 每圈数据
      selectedLapData.forEach((l, idx) => {
        const d = l.data[Math.min(i, l.data.length - 1)];
        row['speed' + (idx + 1)] = d?.speedKmh || 0;
        row['throttle' + (idx + 1)] = d?.controls?.accel || 0;
        row['brake' + (idx + 1)] = d?.controls?.brake || 0;
        row['rpm' + (idx + 1)] = d?.currentEngineRpm || 0;
      });
      // 累加时间差（vs 基准圈）
      selectedLapData.forEach((l, idx) => {
        if (l === refLap) {
          row['cumDelta' + (idx + 1)] = 0;
        } else {
          // 累加差：当前圈当前位置时间 - 基准圈同位置时间
          const refIdx = Math.min(i, refLap.data.length - 1);
          const refD = refLap.data[refIdx];
          const curD = l.data[Math.min(i, l.data.length - 1)];
          if (refD && curD) {
            const refElapsed = refD.timestampMS - refLap.startTime;
            const curElapsed = curD.timestampMS - l.startTime;
            row['cumDelta' + (idx + 1)] = (curElapsed - refElapsed) / 1000;
          } else {
            row['cumDelta' + (idx + 1)] = 0;
          }
        }
      });
      data.push(row);
    }

    return {
      refLap: { lap: refLap.lap, duration: refLap.duration },
      laps: selectedLapData.map(l => ({ ...l, duration: l.duration.toFixed(3) })),
      data
    };
  }, [laps, selectedLaps]);

  const toggleLap = (lapNum) => {
    setSelectedLaps(prev => {
      if (prev.includes(lapNum)) {
        return prev.filter(l => l !== lapNum);
      }
      if (prev.length >= 5) {
        // 替换最早的（最左）
        return [...prev.slice(1), lapNum];
      }
      return [...prev, lapNum];
    });
  };

  // 调色板（多圈用）
  const LAP_COLORS = ['#58a6ff', '#ffa657', '#3fb950', '#a371f7', '#f85149'];

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 8,
        fontSize: 10
      }}>
        <div style={{ marginBottom: 4 }}>数据点: {label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: {p.value?.toFixed(1)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <Card title="圈速对比"><div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>加载中...</div></Card>;
  }

  if (!session) {
    return <Card title="圈速对比"><div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>选择比赛记录查看圈速对比</div></Card>;
  }

  return (
    <Card title="圈速对比">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
          选择 2-5 圈叠加对比（基准：最快圈）
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {laps.map(lap => {
            const isSelected = selectedLaps.includes(lap.lap);
            const selectedIdx = selectedLaps.indexOf(lap.lap);
            const color = isSelected ? LAP_COLORS[selectedIdx] : null;
            return (
              <button
                key={lap.lap}
                onClick={() => toggleLap(lap.lap)}
                style={{
                  padding: '4px 10px',
                  background: isSelected ? color : 'var(--bg-tertiary)',
                  color: isSelected ? '#000' : 'var(--text-primary)',
                  border: isSelected ? 'none' : '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: isSelected ? 700 : 400
                }}
              >
                第{lap.lap}圈 ({lap.duration.toFixed(1)}s)
              </button>
            );
          })}
        </div>
      </div>

      {compareLaps && (
        <div>
          <div style={{
            display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap',
            padding: 8, background: 'var(--bg-primary)', borderRadius: 6, fontSize: 11
          }}>
            {compareLaps.laps.map((l, i) => {
              const isRef = l.lap === compareLaps.refLap.lap;
              const delta = parseFloat(l.duration) - compareLaps.refLap.duration;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: LAP_COLORS[i]
                  }} />
                  <span style={{ fontWeight: 600 }}>第{l.lap}圈</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{l.duration}s</span>
                  {isRef ? (
                    <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 9 }}>基准</span>
                  ) : (
                    <span style={{
                      color: delta > 0 ? 'var(--danger)' : 'var(--success)',
                      fontWeight: 600, fontSize: 9
                    }}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(3)}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 累加差值曲线（最重要的：能直接看出哪一段慢/快） */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
              累加时间差（vs 基准圈，0 以上=落后）
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={compareLaps.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="index" tick={{ fontSize: 8 }} />
                <YAxis tick={{ fontSize: 8 }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} />
                {compareLaps.laps.map((l, i) => (
                  <Line key={i} type="monotone"
                    dataKey={'cumDelta' + (i + 1)}
                    stroke={LAP_COLORS[i]}
                    dot={false} strokeWidth={1.5}
                    name={'第' + l.lap + '圈差'} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>速度对比</div>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={compareLaps.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="index" tick={{ fontSize: 8 }} />
                <YAxis tick={{ fontSize: 8 }} />
                <Tooltip content={<CustomTooltip />} />
                {compareLaps.laps.map((l, i) => (
                  <Line key={i} type="monotone"
                    dataKey={'speed' + (i + 1)}
                    stroke={LAP_COLORS[i]}
                    dot={false} strokeWidth={1.5}
                    name={'第' + l.lap + '圈'} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>油门/刹车对比</div>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={compareLaps.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="index" tick={{ fontSize: 8 }} />
                <YAxis tick={{ fontSize: 8 }} domain={[0, 255]} />
                <Tooltip content={<CustomTooltip />} />
                {compareLaps.laps.map((l, i) => (
                  <React.Fragment key={i}>
                    <Line type="monotone" dataKey={'throttle' + (i + 1)}
                      stroke={LAP_COLORS[i]} dot={false} strokeWidth={1}
                      name={'第' + l.lap + '圈油门'} />
                    <Line type="monotone" dataKey={'brake' + (i + 1)}
                      stroke={LAP_COLORS[i]} dot={false} strokeWidth={1} strokeDasharray="5 5"
                      name={'第' + l.lap + '圈刹车'} />
                  </React.Fragment>
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}