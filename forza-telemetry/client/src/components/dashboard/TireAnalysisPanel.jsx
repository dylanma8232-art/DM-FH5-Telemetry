import React from 'react';

export function TireAnalysisPanel({ channelsData }) {
  if (!channelsData || !channelsData.channels || channelsData.channels.length === 0) {
    return (
      <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 16, color: '#8b949e', fontSize: 11, textAlign: 'center' }}>
        ⚙️ 暂无充足的单圈轮胎通道遥测数据，请在“总览与遥测”查看基础统计。
      </div>
    );
  }

  const { channels } = channelsData;
  const count = channels.length;

  let sumFL = 0, sumFR = 0, sumRL = 0, sumRR = 0;
  let maxSlipFL = 0, maxSlipFR = 0, maxSlipRL = 0, maxSlipRR = 0;

  channels.forEach(c => {
    sumFL += c.tempFL || 0;
    sumFR += c.tempFR || 0;
    sumRL += c.tempRL || 0;
    sumRR += c.tempRR || 0;

    const sFL = Math.abs(c.slipFL || 0);
    const sFR = Math.abs(c.slipFR || 0);
    const sRL = Math.abs(c.slipRL || 0);
    const sRR = Math.abs(c.slipRR || 0);

    if (sFL > maxSlipFL) maxSlipFL = sFL;
    if (sFR > maxSlipFR) maxSlipFR = sFR;
    if (sRL > maxSlipRL) maxSlipRL = sRL;
    if (sRR > maxSlipRR) maxSlipRR = sRR;
  });

  const avgFL = Math.round(sumFL / count);
  const avgFR = Math.round(sumFR / count);
  const avgRL = Math.round(sumRL / count);
  const avgRR = Math.round(sumRR / count);

  // Helper to determine tire state style
  const getTireStyle = (temp) => {
    if (temp === 0) return { background: '#161b22', border: '1px solid #21262d', color: '#8b949e' };
    if (temp < 70) {
      return {
        background: 'rgba(88, 166, 255, 0.08)',
        border: '1px solid rgba(88, 166, 255, 0.3)',
        color: '#58a6ff',
        label: '欠温 (低温限制抓地)'
      };
    }
    if (temp <= 90) {
      return {
        background: 'rgba(46, 160, 67, 0.08)',
        border: '1px solid rgba(46, 160, 67, 0.3)',
        color: '#3fb950',
        label: '理想 (最佳工作状态)'
      };
    }
    return {
      background: 'rgba(248, 81, 73, 0.08)',
      border: '1px solid rgba(248, 81, 73, 0.3)',
      color: '#ff7b72',
      label: '过热 (摩擦滑动加剧)'
    };
  };

  const styleFL = getTireStyle(avgFL);
  const styleFR = getTireStyle(avgFR);
  const styleRL = getTireStyle(avgRL);
  const styleRR = getTireStyle(avgRR);

  // Diagnostic advice generation
  const diagnostics = [];
  const maxSlipThreshold = 0.15; // 15% slip ratio represents serious wheel spin or brake lock

  // 1. Slip diagnosis
  const slipIssues = [];
  if (maxSlipFL > maxSlipThreshold || maxSlipFR > maxSlipThreshold) {
    slipIssues.push(`前轮最高滑移率达到 ${(Math.max(maxSlipFL, maxSlipFR) * 100).toFixed(0)}%，入弯或刹车时存在抓地流失。`);
  }
  if (maxSlipRL > maxSlipThreshold || maxSlipRR > maxSlipThreshold) {
    slipIssues.push(`后轮最高滑移率达到 ${(Math.max(maxSlipRL, maxSlipRR) * 100).toFixed(0)}%，大油门出弯空转明显。`);
  }

  if (slipIssues.length > 0) {
    diagnostics.push({
      type: 'warning',
      title: '⚠️ 轮胎抓地力流失警告',
      text: slipIssues.join(' ') + ' 建议在工坊中加宽受影响车轴的轮胎宽度，或升级到更高工作极限的轮胎配方（如运动胎/赛用胎）。'
    });
  }

  // 2. Temperature Balance Diagnosis
  const avgFront = (avgFL + avgFR) / 2;
  const avgRear = (avgRL + avgRR) / 2;

  if (avgFront > 90 && avgRear < 75) {
    diagnostics.push({
      type: 'info',
      title: '📐 前后配比诊断: 前热后冷',
      text: `前胎均温 ${avgFront.toFixed(0)}°C 偏高，而后胎均温 ${avgRear.toFixed(0)}°C 处于欠温。这说明前轴负担过重，极易产生弯中推头。建议：调软前悬挂弹簧，或在工坊中略微降低前空气下压力。`
    });
  } else if (avgRear > 90 && avgFront < 75) {
    diagnostics.push({
      type: 'info',
      title: '📐 前后配比诊断: 后热前冷',
      text: `后胎均温 ${avgRear.toFixed(0)}°C 偏高，而前胎均温 ${avgFront.toFixed(0)}°C 欠温。后轮空转打滑产生了大量热量。建议：调软后悬挂，调低后差速器加速锁，或降低后胎胎压。`
    });
  }

  // 3. Overall Pressure Advice
  const allTemps = [avgFL, avgFR, avgRL, avgRR].filter(t => t > 0);
  const avgAll = allTemps.reduce((a, b) => a + b, 0) / allTemps.length;
  if (avgAll > 92) {
    diagnostics.push({
      type: 'tip',
      title: '🎈 胎压调整提示',
      text: '全车轮胎平均工作温度处于高位。若出弯时抓地发飘，建议将胎压调高 1.0-2.0 PSI 以抑制轮胎形变过热。若两侧胎温高、中间低，则必须提高胎压。'
    });
  } else if (avgAll < 68) {
    diagnostics.push({
      type: 'tip',
      title: '🎈 胎压调整提示',
      text: '全车轮胎平均工作温度处于偏冷状态。建议将胎压调低 1.0-1.5 PSI 以增加胎壁形变产热，扩展触地面积以完全释放抓地力。'
    });
  }

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 12, borderBottom: '1px solid #21262d', paddingBottom: 6 }}>
        <span style={{ fontWeight: 600, color: '#e6edf3' }}>🛞 轮胎定位与抓地力透视仪</span>
        <span style={{ fontSize: 9, color: '#8b949e' }}>通过四轮动态胎温与滑移率计算最佳外倾/胎压</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* FL */}
        <div style={{ background: styleFL.background, border: styleFL.border, borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: styleFL.color }}>左前轮 (FL)</span>
            {maxSlipFL > maxSlipThreshold && <span style={{ fontSize: 7, padding: '1px 4px', background: '#f85149', color: '#fff', borderRadius: 3 }}>打滑</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: styleFL.color, margin: '4px 0' }}>
            {avgFL > 0 ? `${avgFL}°C` : '-'}
          </div>
          <div style={{ fontSize: 8, color: '#8b949e' }}>{styleFL.label}</div>
          <div style={{ fontSize: 8, color: '#8b949e', marginTop: 2 }}>最大滑移: <span style={{ fontFamily: 'monospace' }}>{(maxSlipFL * 100).toFixed(1)}%</span></div>
        </div>

        {/* FR */}
        <div style={{ background: styleFR.background, border: styleFR.border, borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: styleFR.color }}>右前轮 (FR)</span>
            {maxSlipFR > maxSlipThreshold && <span style={{ fontSize: 7, padding: '1px 4px', background: '#f85149', color: '#fff', borderRadius: 3 }}>打滑</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: styleFR.color, margin: '4px 0' }}>
            {avgFR > 0 ? `${avgFR}°C` : '-'}
          </div>
          <div style={{ fontSize: 8, color: '#8b949e' }}>{styleFR.label}</div>
          <div style={{ fontSize: 8, color: '#8b949e', marginTop: 2 }}>最大滑移: <span style={{ fontFamily: 'monospace' }}>{(maxSlipFR * 100).toFixed(1)}%</span></div>
        </div>

        {/* RL */}
        <div style={{ background: styleRL.background, border: styleRL.border, borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: styleRL.color }}>左后轮 (RL)</span>
            {maxSlipRL > maxSlipThreshold && <span style={{ fontSize: 7, padding: '1px 4px', background: '#f85149', color: '#fff', borderRadius: 3 }}>打滑</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: styleRL.color, margin: '4px 0' }}>
            {avgRL > 0 ? `${avgRL}°C` : '-'}
          </div>
          <div style={{ fontSize: 8, color: '#8b949e' }}>{styleRL.label}</div>
          <div style={{ fontSize: 8, color: '#8b949e', marginTop: 2 }}>最大滑移: <span style={{ fontFamily: 'monospace' }}>{(maxSlipRL * 100).toFixed(1)}%</span></div>
        </div>

        {/* RR */}
        <div style={{ background: styleRR.background, border: styleRR.border, borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: styleRR.color }}>右后轮 (RR)</span>
            {maxSlipRR > maxSlipThreshold && <span style={{ fontSize: 7, padding: '1px 4px', background: '#f85149', color: '#fff', borderRadius: 3 }}>打滑</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: styleRR.color, margin: '4px 0' }}>
            {avgRR > 0 ? `${avgRR}°C` : '-'}
          </div>
          <div style={{ fontSize: 8, color: '#8b949e' }}>{styleRR.label}</div>
          <div style={{ fontSize: 8, color: '#8b949e', marginTop: 2 }}>最大滑移: <span style={{ fontFamily: 'monospace' }}>{(maxSlipRR * 100).toFixed(1)}%</span></div>
        </div>
      </div>

      {/* Diagnostics List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {diagnostics.length === 0 ? (
          <div style={{ fontSize: 10, color: '#3fb950', background: 'rgba(46,160,67,0.05)', padding: '6px 10px', borderRadius: 4, border: '1px solid rgba(46,160,67,0.2)' }}>
            ✅ 四轮胎温与滑移状态极其理想，触地受力均匀，无需调整外倾角或胎压。
          </div>
        ) : (
          diagnostics.map((diag, i) => (
            <div key={i} style={{
              fontSize: 10,
              padding: '6px 10px',
              borderRadius: 4,
              background: diag.type === 'warning' ? 'rgba(248,81,73,0.05)' : diag.type === 'info' ? 'rgba(88,166,255,0.05)' : 'rgba(210,153,34,0.05)',
              border: `1px solid ${diag.type === 'warning' ? 'rgba(248,81,73,0.2)' : diag.type === 'info' ? 'rgba(88,166,255,0.2)' : 'rgba(210,153,34,0.2)'}`,
              color: '#e6edf3'
            }}>
              <strong style={{ color: diag.type === 'warning' ? '#ff7b72' : diag.type === 'info' ? '#58a6ff' : '#d29922' }}>{diag.title}</strong>
              <div style={{ marginTop: 2, color: '#c9d1d9', lineHeight: 1.4 }}>{diag.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
