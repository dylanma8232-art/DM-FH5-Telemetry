import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Scatter, ScatterChart, ZAxis } from 'recharts';

export function GearingAnalysisPanel({ data }) {
  if (!data || !data.powerBand || data.powerBand.length === 0) {
    return <div style={{ color: '#8b949e', padding: 20 }}>暂无充足的传动与动力数据</div>;
  }

  const { powerBand, shifts, maxRpmBangingTimeSec } = data;

  // Convert powerWatts to HP (1 Watt = 0.00134102 HP)
  // Assuming the data is in Watts based on the parser. 
  // Actually, sometimes it's already HP. Let's just normalize to display.
  const chartData = powerBand.map(d => ({
    rpm: d.rpm,
    power: Math.round(d.power * 0.00134102), // Convert Watts to HP
    torque: Math.round(d.torque), // Newton meters
  }));

  // Create scatter points for shift locations
  const shiftPoints = shifts.map(s => ({
    rpm: s.rpm,
    gear: s.gear,
    power: chartData.find(c => Math.abs(c.rpm - s.rpm) < 150)?.power || 0
  })).filter(s => s.power > 0);

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden', padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>⚙️ 动力与传动透视图 (实战机滤图)</span>
        {maxRpmBangingTimeSec > 1 && (
          <span style={{ fontSize: 9, background: 'rgba(248,81,73,0.1)', color: '#ff7b72', padding: '1px 6px', borderRadius: 10, border: '1px solid rgba(248,81,73,0.4)' }}>
            ⚠️ 最高档断油严重 ({maxRpmBangingTimeSec}秒) - 建议将尾牙调小(偏向极速)
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>红=马力 蓝=扭矩。</div>

      <div style={{ height: 260, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="rpm" stroke="#8b949e" tick={{fill: '#8b949e', fontSize: 10}} />
            <YAxis yAxisId="left" stroke="#ff7b72" tick={{fill: '#ff7b72', fontSize: 10}} />
            <YAxis yAxisId="right" orientation="right" stroke="#58a6ff" tick={{fill: '#58a6ff', fontSize: 10}} />
            <Tooltip 
              contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', fontSize: 10 }}
              itemStyle={{ color: '#fff' }}
            />
            <Line yAxisId="left" type="monotone" dataKey="power" stroke="#ff7b72" strokeWidth={2} dot={false} name="马力" />
            <Line yAxisId="right" type="monotone" dataKey="torque" stroke="#58a6ff" strokeWidth={2} dot={false} name="扭矩" />
            
            {shiftPoints.map((sp, idx) => (
              <ReferenceLine key={idx} yAxisId="left" x={sp.rpm} stroke="rgba(210,153,34,0.4)" strokeDasharray="3 3">
              </ReferenceLine>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div style={{ marginTop: 16, color: '#8b949e', fontSize: 13 }}>
        <p>💡 <strong>调校建议：</strong> 垂直虚线代表您的升档时机。理想的换挡点应位于马力曲线（红线）达到顶峰之后，确保换入下一档时，转速正好落在最大扭矩（蓝线）区间内。如果虚线都在最高峰左侧，说明您换挡过早。</p>
      </div>
    </div>
  );
}
