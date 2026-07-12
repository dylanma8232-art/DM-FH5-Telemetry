import React from 'react';
import { ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export function SuspensionAnalysisPanel({ data, channelsData }) {
  if (!data || !data.bottomingEvents) {
    return <div style={{ color: '#8b949e', padding: 20 }}>暂无充足的悬挂行程数据</div>;
  }

  const { bottomingEvents, bottomingScore, totalBottomingTicks } = data;

  // Prepare track map overlay data for bottoming out
  const mapData = bottomingEvents.map(b => ({
    x: b.position?.x || 0,
    z: b.position?.z || 0,
    speed: b.speed
  })).filter(b => b.x !== 0 || b.z !== 0);

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden', padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>💥 底盘与避震扫描仪</span>
        <span style={{ 
          fontSize: 9, 
          background: bottomingScore < 80 ? 'rgba(248,81,73,0.1)' : 'rgba(46,160,67,0.1)', 
          color: bottomingScore < 80 ? '#ff7b72' : '#3fb950', 
          padding: '1px 6px', borderRadius: 10, 
          border: `1px solid ${bottomingScore < 80 ? 'rgba(248,81,73,0.4)' : 'rgba(46,160,67,0.4)'}` 
        }}>
          悬挂健康度: {bottomingScore} (严重托底 {totalBottomingTicks} 帧)
        </span>
      </div>

      {totalBottomingTicks > 50 && (
        <div style={{ background: 'rgba(210,153,34,0.1)', borderLeft: '3px solid #d29922', padding: '4px 8px', marginBottom: 8, color: '#c9d1d9', fontSize: 10 }}>
          <strong>⚠️ 诊断建议：</strong> 您的车辆底盘存在严重托底现象，这会导致极速骤降并引发转向失控。建议进入调校中心：
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
            <li>适当调高车身高度。</li>
            <li>增加前/后弹簧硬度。</li>
            <li>在越野/拉力赛道中增加回弹阻尼。</li>
          </ul>
        </div>
      )}

      {mapData.length > 0 ? (
        <div style={{ height: 260, width: '100%', display: 'flex', flexDirection: 'column', marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: '#484f58', marginBottom: 4 }}>赛道托底分布热力图 (红点为悬挂压缩达 100% 区域)</div>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis type="number" dataKey="x" hide domain={['dataMin - 100', 'dataMax + 100']} />
              <YAxis type="number" dataKey="z" hide domain={['dataMin - 100', 'dataMax + 100']} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}
                formatter={(value, name) => [value, name === 'speed' ? '托底时车速(km/h)' : name]}
              />
              <Scatter name="托底点" data={mapData} fill="#ff7b72">
                {mapData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="#ff7b72" />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3fb950', marginBottom: 16, fontSize: 10 }}>
          ✅ 底盘高度与悬挂支撑完美，全场无任何严重托底发生。
        </div>
      )}

      {channelsData && channelsData.channels && channelsData.channels.length > 0 && (
        <div style={{ height: 200, width: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 9, color: '#484f58', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>四轮独立悬挂动态 (行程米)</span>
            <span>如果曲线触底(0)则说明避震被压满。蓝=左前 绿=右前 黄=左后 红=右后</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={channelsData.channels} syncId="overlaySync" margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="distance" hide={true} />
              <YAxis stroke="#8b949e" tick={{ fontSize: 10, fill: '#8b949e' }} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 10 }}
                formatter={(value, name) => [(value != null ? value.toFixed(3) : '0.000') + 'm', name === 'suspensionFL' ? '左前' : name === 'suspensionFR' ? '右前' : name === 'suspensionRL' ? '左后' : '右后']}
                labelFormatter={(label) => '距离: ' + label + 'm'}
              />
              <Line type="monotone" dataKey="suspensionFL" stroke="#58a6ff" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="suspensionFR" stroke="#3fb950" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="suspensionRL" stroke="#d29922" strokeWidth={1} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="suspensionRR" stroke="#ff7b72" strokeWidth={1} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
