const fs = require('fs');
const content = `import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export function DifferentialAnalysisPanel({ data }) {
  if (!data || !data.cornerExitSlip || data.cornerExitSlip.length === 0) {
    return <div style={{ color: '#8b949e', padding: 20 }}>暂无出弯加速打滑数据</div>;
  }

  const { cornerExitSlip, oversteerEvents } = data;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🛞 差速器与抓地力诊断</span>
        {oversteerEvents.length > 5 && (
          <span style={{ fontSize: 12, background: 'rgba(210,153,34,0.1)', color: '#d29922', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(210,153,34,0.4)' }}>
            ⚠️ 严重出弯甩尾 ({oversteerEvents.length} 次)
          </span>
        )}
      </h3>

      <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p style={{ margin: '0 0 12px 0', color: '#8b949e', fontSize: 13 }}>
          本图表截取了您在比赛中<strong>“带着方向盘转角，同时踩下油门”</strong>的出弯瞬间，并对比了前后轮的纵向打滑率。
        </p>
        
        {oversteerEvents.length > 5 && (
          <div style={{ color: '#c9d1d9', fontSize: 13, background: 'rgba(210,153,34,0.1)', borderLeft: '3px solid #d29922', padding: '8px 12px' }}>
            <strong>💡 AWD(四驱) 调校处方：</strong> 检测到出弯时后轮打滑率远超前轮，导致严重甩尾。建议进入调校中心：
            <br />1. 将<strong>中央差速器</strong> 向前移。
            <br />2. 调低<strong>后差速器加速锁定值</strong>。
          </div>
        )}
        
        <div style={{ height: 300, marginTop: 20 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cornerExitSlip} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="time" hide />
              <YAxis tick={{fill: '#8b949e'}} stroke="#30363d" label={{ value: '打滑率', angle: -90, position: 'insideLeft', fill: '#8b949e' }} />
              <Tooltip 
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                itemStyle={{ color: '#fff' }}
                labelFormatter={() => '出弯抓取点'}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#8b949e' }}/>
              <Line type="monotone" dataKey="frontSlip" name="前轮打滑" stroke="#58a6ff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="rearSlip" name="后轮打滑" stroke="#ff7b72" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}`;
fs.writeFileSync('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/dashboard/DifferentialAnalysisPanel.jsx', content);
