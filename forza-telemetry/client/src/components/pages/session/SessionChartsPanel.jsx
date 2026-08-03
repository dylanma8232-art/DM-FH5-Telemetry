import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea, ScatterChart, Scatter, Cell, Legend } from 'recharts';
import { LoadingSpinner } from '../../shared/LoadingSpinner';

export const SessionChartsPanel = React.memo(function SessionChartsPanel(props) {
  const {
    activeTab, reviewSubTab, session, channelsLoading, channelsData,
    formatTimeMs, formatPercent, getCornerName,
    getSuspensionWarningColor, sectionStyle, chartCardStyle, statBoxStyle,
    isDataStale, setIsDataStale, CustomTooltip
  } = props;

  const Math_round = Math.round;
  const Math_max = Math.max;
  const Math_min = Math.min;

  return (
    <>
              {/* ==================== TAB 1: 赛后总览 ==================== */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ ...sectionStyle, margin: 0, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}>本场比赛摘要</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {analysis.track?.name || analysis.trackName || '未知赛道'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 5 }}>
                          {analysis.vehicle?.name || `车辆 ${analysis.vehicle?.ordinal || '--'}`} · {analysis.vehicle?.drivetrain || '驱动形式未知'} · {analysis.成绩?.圈数 || '--'} 圈
                        </div>
                      </div>
                      {raceOverview.score && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>本场驾驶表现</div>
                          <div style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 28, fontWeight: 900 }}>
                            {raceOverview.score.总分}<span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> 分</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                      {[
                        { label: '本场最佳圈', value: formatLapTime(raceOverview.currentLap), tone: 'var(--text-primary)' },
                        { label: '理论最佳圈', value: formatLapTime(raceOverview.theoreticalBest), tone: 'var(--success)' },
                        { label: '可追回时间', value: raceOverview.recoverableMs ? `+${formatLapTime(raceOverview.recoverableMs)}` : '--', tone: 'var(--warning)' },
                        { label: '最大分段损失', value: raceOverview.bestSectorLoss ? `+${raceOverview.bestSectorLoss.toFixed(3)} 秒` : '--', tone: 'var(--danger)' }
                      ].map(item => (
                        <div key={item.label} style={{ padding: 10, border: '1px solid var(--border)', background: 'var(--bg-primary)', borderRadius: 6 }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginBottom: 5 }}>{item.label}</div>
                          <div style={{ color: item.tone, fontSize: 16, fontWeight: 750, fontFamily: 'monospace' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => onNavigate('tunes', {
                        action: sessionTune ? 'edit' : 'create',
                        tuneId: sessionTune?.id,
                        vehicleId: analysis.vehicle?.ordinal || null,
                        sessionId: selectedSession,
                        openTelemetry: true
                      })}
                      style={{ ...btnSmallStyle, marginTop: 12, background: 'rgba(63,185,80,0.14)', borderColor: 'rgba(63,185,80,0.36)', color: '#3fb950', fontWeight: 700 }}
                    >
                      使用本场记录进行车辆调校
                    </button>
                  </div>

                  {lapTrendData.length > 1 && (
                    <div style={{ ...sectionStyle, margin: 0 }}>
                      <h3 style={{ ...sectionTitleStyle, margin: '0 0 8px' }}>📈 圈速稳定性趋势</h3>
                      <div style={chartGuideStyle}>
                        <strong>📚 诊断指南与参考区间：</strong> 横轴为圈数，纵轴为单圈时间。蓝线越平表示发挥越稳定；绿色虚线是本场有效圈中的最快圈，仅用于本场内部比较。明显高出的圈可能包含失误、交通或无效圈，应结合下方事件判断。
                      </div>
                      <div style={{ height: 210 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={lapTrendData} margin={{ top: 8, right: 20, bottom: 8, left: 6 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                            <XAxis dataKey="lap" stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '圈数', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                            <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(value) => `${Number(value).toFixed(1)}秒`} />
                            <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '圈速' ? `${Number(value).toFixed(3)} 秒` : `+${Number(value).toFixed(3)} 秒`} />
                            <ReferenceLine y={lapTrendData[0].best} stroke="#3fb950" strokeDasharray="5 3" />
                            <Line type="monotone" dataKey="totalSeconds" name="圈速" stroke="#58a6ff" dot={{ r: 3 }} strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {raceOverview.events.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {raceOverview.events.map(event => (
                        <div key={event.label} style={{ padding: '7px 10px', borderRadius: 5, border: `1px solid ${event.tone === 'danger' ? 'rgba(248,81,73,0.42)' : 'rgba(210,153,34,0.42)'}`, background: event.tone === 'danger' ? 'rgba(248,81,73,0.08)' : 'rgba(210,153,34,0.08)', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{event.label}</span><span style={{ color: event.tone === 'danger' ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, marginLeft: 7 }}>{event.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 赛后总览内直接给出驾驶诊断，图表仅作为证据展开。 */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16,
                    background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.6) 0%, rgba(13, 17, 23, 0.8) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 10, padding: 18,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    marginBottom: 8
                  }}>
                    {/* 高光卡片 */}
                    <div style={{
                      background: 'rgba(63, 185, 80, 0.03)',
                      border: '1px solid rgba(63, 185, 80, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(63, 185, 80, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>🏆</span> 驾驶表现高光
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.highlights.map((h, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#3fb950' }}>•</span>
                            {h}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 缺陷与秒数损失卡片 */}
                    <div style={{
                      background: 'rgba(248, 81, 73, 0.03)',
                      border: '1px solid rgba(248, 81, 73, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#ff7b72', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(248, 81, 73, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>⚠️</span> 关键失误取证
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.flaws.map((f, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#ff7b72' }}>•</span>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 驾驶脚法提升指南 */}
                    <div style={{
                      background: 'rgba(210, 153, 34, 0.03)',
                      border: '1px solid rgba(210, 153, 34, 0.15)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}>
                      <h4 style={{ margin: 0, fontSize: 12, color: '#d29922', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(210, 153, 34, 0.15)', paddingBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>🚦</span> 驾驶改进动作指南
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                        {sessionConsultation.recommendations.map((r, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: '#c9d1d9', lineHeight: 1.45, position: 'relative', paddingLeft: 12 }}>
                            <span style={{ position: 'absolute', left: 0, color: '#d29922' }}>•</span>
                            <span dangerouslySetInnerHTML={{ __html: r }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>



                  {/* 本场各圈与分段表现 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                    {/* 多圈分段计时对比表 */}
                    {advancedData?.lapSectorDetails && advancedData.lapSectorDetails.length > 0 && (
                      <div style={{ ...sectionStyle, margin: 0, flex: 1 }}>
                        <h3 style={sectionTitleStyle}>🏁 赛局多圈分段计时对比</h3>
                        <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 10 }}>
                          绿色底色代表全场最快分段时间；黄色底色和粗体代表全场最快单圈。
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '6px 8px' }}>圈数</th>
                                <th style={{ padding: '6px 8px' }}>分段一</th>
                                <th style={{ padding: '6px 8px' }}>分段二</th>
                                <th style={{ padding: '6px 8px' }}>分段三</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>单圈总时长</th>
                              </tr>
                            </thead>
                            <tbody>
                              {advancedData.lapSectorDetails.map((lapDetail) => {
                                const isBestLap = lapDetail.sectors.every(s => s.loss === 0) || (analysis?.成绩?.总时长 && Math.abs(lapDetail.totalTime * 1000 - analysis.成绩.总时长) < 100);
                                return (
                                  <tr
                                    key={lapDetail.lap}
                                    style={{
                                      borderBottom: '1px solid rgba(48,54,61,0.2)',
                                      background: isBestLap ? 'rgba(210,153,34,0.06)' : 'transparent',
                                      fontWeight: isBestLap ? 'bold' : 'normal'
                                    }}
                                  >
                                    <td style={{ padding: '8px 8px', color: isBestLap ? '#d29922' : 'inherit' }}>
                                      第 {lapDetail.lap} 圈 {isBestLap && '🌟'}
                                    </td>
                                    {lapDetail.sectors.map((s, idx) => {
                                      const isBestSector = s.loss === 0;
                                      return (
                                        <td
                                          key={idx}
                                          style={{
                                            padding: '8px 8px',
                                            fontFamily: 'monospace',
                                            color: isBestSector ? '#56d364' : '#e6edf3',
                                            background: isBestSector ? 'rgba(63,185,80,0.08)' : 'transparent'
                                          }}
                                        >
                                          {s.time?.toFixed(3)}s
                                        </td>
                                      );
                                    })}
                                    {/* 补齐不足 3 个分段的情况 */}
                                    {Array.from({ length: Math.max(0, 3 - lapDetail.sectors.length) }).map((_, idx) => (
                                      <td key={`empty-${idx}`} style={{ padding: '8px 8px', color: '#484f58' }}>--</td>
                                    ))}
                                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: isBestLap ? '#d29922' : '#e6edf3' }}>
                                      {lapDetail.totalTime?.toFixed(3)}s
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div style={{ ...sectionStyle, margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                        <div>
                          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>📍 本场重点弯道</h3>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                            有参考速度时按弯心速度赤字排序；否则展示弯心速度最低的弯道。
                          </div>
                        </div>
                        <button onClick={() => { setReviewSubTab('corners'); setActiveTab('professional_review'); }} style={{ ...btnInactiveStyle, padding: '4px 8px', fontSize: 10 }}>进入专业复盘</button>
                      </div>
                      {worstCorners.length === 0 ? (
                        <div style={{ padding: '10px 0', color: 'var(--text-secondary)', fontSize: 11 }}>尚未生成弯道数据；完成一场带赛道记录的比赛后会在这里显示。</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                          {worstCorners.map((corner, index) => (
                            <button
                              key={corner.index ?? corner.name ?? index}
                              onClick={() => {
                                const turnIndex = turnsData?.turns?.findIndex((turn) => (turn.index ?? turn.name) === (corner.index ?? corner.name));
                                if (turnIndex >= 0) setActiveTurnIdx(turnIndex);
                                setReviewSubTab('corners');
                                setActiveTab('professional_review');
                              }}
                              style={{ textAlign: 'left', padding: 10, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.02)', border: `1px solid ${['#ff7b72', '#f0883e', '#a371f7'][index]}`, color: 'var(--text-primary)' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700, fontSize: 11 }}>
                                <span>#{index + 1} {corner.name || `弯道 ${index + 1}`}</span>
                                <span style={{ color: ['#ff7b72', '#f0883e', '#a371f7'][index] }}>{corner.apexSpeedKmh.toFixed(0)} 千米/小时</span>
                              </div>
                              <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-secondary)' }}>
                                {corner.hasReference ? `参考 ${corner.refApexSpeedKmh.toFixed(0)} · 速度赤字 ${corner.deficitKmh.toFixed(0)} 千米/小时` : '暂无参考速度 · 这是本场弯心速度较低的弯道'}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 3: 车辆遥测 ==================== */}
              {activeTab === 'professional_review' && ['tires', 'suspension', 'differential', 'aero'].includes(reviewSubTab) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  {channelsLoading && !channelsData && <LoadingSpinner text="正在载入本场车辆证据..." />}
                  {!channelsLoading && !channelsData?.channels?.length && (
                    <EmptyState title="暂时没有可用的车辆遥测信号" description="这场比赛没有保存足够的遥测通道，无法生成车辆物理图表。" />
                  )}
                  {channelsData?.channels?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* 子页签工具栏 */}
                      <div style={{ display: 'none' }}>
                        {[
                          { id: 'tires', label: '🛞 轮胎状况' },
                          { id: 'suspension', label: '⛓️ 避震悬架' },
                          { id: 'differential', label: '⚙️ 传动差速' }
                        ].map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => setChartSubTab(sub.id)}
                            style={{
                              padding: '4px 12px',
                              background: chartSubTab === sub.id ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                              color: chartSubTab === sub.id ? '#000' : '#c9d1d9',
                              border: `1px solid ${chartSubTab === sub.id ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 20,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>

                      {/* 3.1 轮胎与抓地 */}
                      {chartSubTab === 'tires' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 胎温调校计算助手 */}
                          {(() => {
                            const stats = advancedData?.tempStats || { avgFL: 80, avgFR: 80, avgRL: 80, avgRR: 80 };
                            const diffFront = Math.abs(stats.avgFL - stats.avgFR).toFixed(1);
                            const diffRear = Math.abs(stats.avgRL - stats.avgRR).toFixed(1);
                            const avgFront = ((stats.avgFL + stats.avgFR) / 2).toFixed(1);
                            const avgRear = ((stats.avgRL + stats.avgRR) / 2).toFixed(1);
                            
                            const tiresAdvice = [];
                            if (Math.max(stats.avgFL, stats.avgFR, stats.avgRL, stats.avgRR) > 94) {
                              tiresAdvice.push('⚠️ 部分轮胎工作温度偏高（过热会急剧损失抓地力）：建议在调校中降低对应轮位胎压 1.0 - 2.0 PSI，或减小负外倾角 0.2 - 0.4° 以均匀胎面接触。');
                            }
                            if (Math.min(stats.avgFL, stats.avgFR, stats.avgRL, stats.avgRR) < 68) {
                              tiresAdvice.push('⚠️ 部分轮胎无法达到最佳抓地温度（偏冷）：建议稍微增加对应轮位胎压 1.0 - 1.5 PSI 以增加侧向胎壁阻尼，或者多进行热胎滑行。');
                            }
                            if (Math.abs(avgFront - avgRear) > 8) {
                              tiresAdvice.push(avgFront > avgRear 
                                ? '⚠️ 前后轴轮胎温差过大（前轴过热）：车辆存在较严重的转向不足（推头）。建议调软前防倾杆或前弹簧刚度，或稍微调硬后悬挂。'
                                : '⚠️ 前后轴轮胎温差过大（后轴过热）：车辆存在转向过度倾向（甩尾）。建议调软后防倾杆或后弹簧刚度，或增大后外倾角。');
                            }
                            if (tiresAdvice.length === 0) tiresAdvice.push('✅ 四轮工作胎温分配合理，抓地热效应良好。');

                            return (
                              <div style={{ background: 'rgba(88,166,255,0.02)', border: '1px solid rgba(88,166,255,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#58a6ff' }}>🛞 轮胎温差与抓地调校助手</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>前轴平均温 / 左右差</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{avgFront}°C / {diffFront}°C</div>
                                  </div>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>后轴平均温 / 左右差</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{avgRear}°C / {diffRear}°C</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {tiresAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 胎温图 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>轮胎工作温度变化曲线（绿色区域为理想工作区间，单位：摄氏度）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为胎温。两条绿色虚线分别是 75°C 和 90°C，虚线之间的浅绿色区域为理想抓地区；低于该区域表示尚未充分升温，高于该区域表示可能过热。
                            </div>
                            <div style={{ height: 200 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[40, 110]} unit="°C" />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)}°C`} />
                                  <ReferenceArea y1={75} y2={90} fill="rgba(63,185,80,0.06)" />
                                  <ReferenceLine y={75} stroke="#3fb950" strokeDasharray="5 3" />
                                  <ReferenceLine y={90} stroke="#3fb950" strokeDasharray="5 3" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="tempFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="tempFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="tempRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="tempRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.5} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 滑移率图 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>原始四轮滑移率变化曲线（橙线打滑、红线抱死）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#c9d1d9', marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴是赛道距离，纵轴是轮胎滑移率。<span style={{ color: '#f0883e', fontWeight: 700 }}>橙色虚线：+15% 打滑警戒线</span>，超过它表示驱动轮空转；<span style={{ color: '#f85149', fontWeight: 700 }}>红色虚线：-15% 抱死警戒线</span>，低于它表示制动轮接近抱死；灰色实线为 0% 零滑移基线。
                            </div>
                            <div style={{ height: 220 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" margin={{ top: 8, right: 18, bottom: 8, left: 0 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={slipChartDomain} tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} label={{ value: '轮胎滑移率', angle: -90, position: 'insideLeft', offset: 8, fill: '#8b949e', fontSize: 10 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
                                  <ReferenceLine y={0.15} stroke="#f0883e" strokeDasharray="4 2" />
                                  <ReferenceLine y={-0.15} stroke="#f85149" strokeDasharray="4 2" />
                                  <ReferenceLine y={0} stroke="#484f58" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="slipFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="slipFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="slipRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.8} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="slipRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.8} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.2 避震与悬挂 */}
                      {chartSubTab === 'suspension' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 悬挂调校计算助手 */}
                          {(() => {
                            const bottomingTicks = channelsData.channels.filter(c => c.suspFL < 0.05 || c.suspFR < 0.05 || c.suspRL < 0.05 || c.suspRR < 0.05).length;
                            const suspAdvice = [];
                            if (bottomingTicks > 35) {
                              suspAdvice.push('⚠️ 避震器行程频繁用尽（托底）：检测到车辆在多处颠簸段或高速压缩下触底。建议将车身高度上调 1.0 - 2.0 cm，或将弹簧刚度（前后轴）增加 8%-12%，并配合上调阻尼压缩阀。');
                            } else if (bottomingTicks > 0) {
                              suspAdvice.push('💡 避震器有轻微托底：在个别大起伏路段发生托底。若不严重可忽略；若导致车辆颠跳，可稍微增加前束角阻尼或调硬弹簧。');
                            } else {
                              suspAdvice.push('✅ 悬挂行程利用充分，且未发生机械托底限制。');
                            }
                            return (
                              <div style={{ background: 'rgba(188,136,255,0.02)', border: '1px solid rgba(188,136,255,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#bc88ff' }}>⛓️ 避震托底与悬挂调校助手</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 10 }}>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: 6, borderRadius: 4 }}>
                                    <div style={{ fontSize: 8, color: '#8b949e' }}>本场托底采样点总数</div>
                                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: bottomingTicks > 35 ? '#f85149' : '#e6edf3' }}>{bottomingTicks} 个</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {suspAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 避震分布直方图 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>四轮避震压缩位置分布图</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴是归一化避震压缩区间，纵轴是各区间出现的采样比例。重点观察数据是否长期堆积在两端；赛道路肩和单向弯会造成自然偏态，不要求图形必须完全对称。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={suspensionHistogram}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="range" stroke="#8b949e" tick={{ fontSize: 8 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} />
                                  <Bar dataKey="左前" fill="#58a6ff" />
                                  <Bar dataKey="右前" fill="#3fb950" />
                                  <Bar dataKey="左后" fill="#d29922" />
                                  <Bar dataKey="右后" fill="#ff7b72" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 原始悬挂行程 */}
                          <div style={sectionStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <h4 style={{ margin: 0, fontSize: 11 }}>原始四轮悬挂行程变化图（正常工作区间：5% - 95%）</h4>
                              {wheelVisibilityControls}
                            </div>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 浅绿色区域是 5%-95% 常用工作区间；红色虚线是 5% 下限，触碰表示行程接近一端极限；蓝色虚线是 95% 上限，触碰表示接近另一端极限。应结合路肩和腾空事件判断，避免只凭单个尖峰调校。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)}`} />
                                  <ReferenceArea y1={0.05} y2={0.95} fill="rgba(63,185,80,0.03)" />
                                  <ReferenceLine y={0.05} stroke="#f85149" strokeWidth={1} strokeDasharray="3 3" />
                                  <ReferenceLine y={0.95} stroke="#58a6ff" strokeWidth={1} strokeDasharray="3 3" />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="suspFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="suspFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="suspRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="suspRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.3 传动与差速 */}
                      {chartSubTab === 'differential' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 传动调校计算助手 */}
                          {(() => {
                            const bangingTime = channelsData.channels.filter(c => c.rpm > maxSessionRpm * 0.98).length * 0.016;
                            const diffAdvice = [];
                            if (bangingTime > 0.6) {
                              diffAdvice.push('⚠️ 换挡断油超时：检测到引擎多次顶红线断油。换挡晚了，需提前手动升档，或拉长终传比滑块。');
                            } else {
                              diffAdvice.push('✅ 换挡时机节奏良好，完美落入引擎理想输出带。');
                            }
                            return (
                              <div style={{ background: 'rgba(210,153,34,0.02)', border: '1px solid rgba(210,153,34,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#d29922' }}>⚙️ 差速器与换挡节奏调校助手</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {diffAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: adv.startsWith('✅') ? '#3fb950' : '#d29922', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* rpm 与档位 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>发动机转速与档位变化图</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，左轴为发动机转速，右轴为档位。绿色虚线是本场最高转速的 70% 参考线，红色虚线是 95% 高转速参考线；它们用于观察换挡节奏，并非车辆真实动力带或断油转速。
                            </div>
                            <div style={{ height: 220 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={gearingData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis yAxisId="left" stroke="#3fb950" tick={{ fontSize: 9 }} domain={[0, Math.round(maxSessionRpm + 1000)]} unit="rpm" />
                                  <YAxis yAxisId="right" orientation="right" stroke="#58a6ff" tick={{ fontSize: 9 }} domain={[1, 8]} tickCount={8} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '转速' ? `${Number(value).toFixed(0)} RPM` : `${Number(value).toFixed(0)} 档`} />
                                  <ReferenceLine yAxisId="left" y={maxSessionRpm * 0.95} stroke="#f85149" strokeDasharray="4 2" />
                                  <ReferenceLine yAxisId="left" y={maxSessionRpm * 0.70} stroke="#3fb950" strokeDasharray="4 2" />
                                  <Line yAxisId="left" type="monotone" dataKey="rpm" stroke="#3fb950" name="转速" dot={false} strokeWidth={1.5} />
                                  <Line yAxisId="right" type="stepAfter" dataKey="gear" stroke="#58a6ff" name="档位" dot={false} strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 轮速差 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 8px', fontSize: 11 }}>出弯驱动轮速差对比</h4>
                            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#c9d1d9', marginBottom: 10, lineHeight: 1.5 }}>
                              <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为左右轮的原始轮速差。此信号用于比较同一出弯前后变化；当前记录未保存轮胎有效半径，因此不能把数值换算为千米/小时，也不使用固定阈值作调校结论。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={diffData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)}`} />
                                  <Line type="monotone" dataKey="前轴速差" stroke="#58a6ff" dot={false} strokeWidth={1.5} />
                                  <Line type="monotone" dataKey="后轴速差" stroke="#3fb950" dot={false} strokeWidth={1.5} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.4 空气动力 */}
                      {chartSubTab === 'aero' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 空力调校计算助手 */}
                          {(() => {
                            const aeroAdvice = [];
                            aeroAdvice.push('💡 空气下压力调校助手：本车静态下压力分配符合出厂标称设定。若高速弯频现前轴抓地脱节（推头），建议调大前压力 15% - 25% ；若车尾高速发飘（甩尾），建议调大后压力 10% - 20%。');
                            return (
                              <div style={{ background: 'rgba(63,185,80,0.02)', border: '1px solid rgba(63,185,80,0.15)', borderRadius: 8, padding: 12 }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: 11, color: '#3fb950' }}>🍃 空气动力平衡调校助手</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {aeroAdvice.map((adv, idx) => (
                                    <div key={idx} style={{ fontSize: 10, color: '#c9d1d9', lineHeight: 1.4 }}>{adv}</div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 空力下压力代理：悬挂压缩量 vs 车速 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 6px', fontSize: 11 }}>前后悬挂压缩量 vs 车速（高速段压缩增大反映下压力增长）</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南：</strong> 横轴为车速，纵轴为前后轴悬挂平均压缩率（%）。若高速段前后轴压缩曲线同步增大，说明下压力设定有效；若前后差距大，说明空力平衡偏向一端。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={aeroData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="speed" stroke="#8b949e" tick={{ fontSize: 9 }} label={{ value: '车速（千米/小时）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" domain={[0, 100]} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(1)}%`} />
                                  <Line type="monotone" dataKey="前轴压缩" stroke="#58a6ff" name="前轴" dot={false} strokeWidth={1.5} />
                                  <Line type="monotone" dataKey="后轴压缩" stroke="#ff7b72" name="后轴" dot={false} strokeWidth={1.5} />
                                  <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* 车身高度：悬挂伸缩量随距离变化 */}
                          <div style={sectionStyle}>
                            <h4 style={{ margin: '0 0 6px', fontSize: 11 }}>四轮悬挂伸缩率变化曲线（路肩压缩峰值与平坦路面对比）</h4>
                            <div style={chartGuideStyle}>
                              <strong>📚 诊断指南：</strong> 横轴为赛道距离，纵轴为各轮悬挂伸展率（0%=全压缩，100%=全伸展）。路肩或大颠簸段曲线会急剧下探；若四轮长期低于 20% 区间，建议提高车身高度或调硬弹簧以避免托底。
                            </div>
                            <div style={{ height: 180 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedChannels} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                  <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                                  <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} unit="%" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}`} />
                                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} />
                                  <ReferenceLine y={0.15} stroke="#f85149" strokeDasharray="4 2" label={{ value: '托底警戒', fill: '#f85149', fontSize: 8 }} />
                                  {visibleWheels.FL && <Line type="monotone" dataKey="suspFL" stroke="#58a6ff" name="左前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.FR && <Line type="monotone" dataKey="suspFR" stroke="#3fb950" name="右前" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RL && <Line type="monotone" dataKey="suspRL" stroke="#d29922" name="左后" dot={false} strokeWidth={1.5} />}
                                  {visibleWheels.RR && <Line type="monotone" dataKey="suspRR" stroke="#ff7b72" name="右后" dot={false} strokeWidth={1.5} />}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3.5 参数匹配规则 */}
                      {chartSubTab === 'rules' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 常见操控问题规则诊断 */}
                          <div style={{ ...sectionStyle, margin: 0, padding: 12 }}>
                            <h3 style={{ ...sectionTitleStyle, margin: 0, fontSize: 12 }}>常见操控问题诊断规则</h3>
                            <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 12, marginTop: 4 }}>
                              如果您在驾驶时有具体的不适反馈，请在下方选择最接近的物理感受。系统将实时比对当前车辆调校参数，给出确切数值修改方案。
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                              {PROBLEM_CATEGORIES.map(cat => (
                                <button
                                  key={cat.id}
                                  onClick={() => { setSelectedIssueCategory(cat.id); setSelectedIssueId(null); }}
                                  style={{
                                    padding: '4px 10px',
                                    background: selectedIssueCategory === cat.id ? cat.color : '#1f242c',
                                    color: '#fff',
                                    border: '1px solid #30363d',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {cat.label}
                                </button>
                              ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
                              {/* 问题列表 */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                                {DRIVING_PROBLEMS.filter(p => p.category === selectedIssueCategory).map(prob => (
                                  <div
                                    key={prob.id}
                                    onClick={() => setSelectedIssueId(prob.id)}
                                    style={{
                                      padding: '6px 8px',
                                      background: selectedIssueId === prob.id ? 'rgba(88, 166, 255, 0.1)' : '#161b22',
                                      border: selectedIssueId === prob.id ? '1px solid #58a6ff' : '1px solid #21262d',
                                      borderRadius: 4,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <div style={{ fontWeight: 600, fontSize: 10, color: selectedIssueId === prob.id ? '#58a6ff' : '#e6edf3' }}>
                                      {prob.name}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 规则数值修改对比表 */}
                              <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: 12 }}>
                                {selectedIssueId ? (() => {
                                  const prob = DRIVING_PROBLEMS.find(p => p.id === selectedIssueId);
                                  if (!prob) return null;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e6edf3' }}>{prob.name}（典型表现：{prob.symptoms}）</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {Object.entries(prob.fixes).map(([paramKey, fix]) => {
                                          const currentVal = getParamValue(sessionTune, paramKey);
                                          const hasCurrent = currentVal !== null && currentVal !== undefined;
                                          const paramNameMap = {
                                            frontTirePressure: '前胎压', rearTirePressure: '后胎压',
                                            frontCamber: '前外倾角', rearCamber: '后外倾角',
                                            frontToe: '前束角', rearToe: '后束角',
                                            frontSpring: '前弹簧刚度', rearSpring: '后弹簧刚度',
                                            frontDamping: '前阻尼压缩', rearDamping: '后阻尼压缩',
                                            frontARB: '前防倾杆', rearARB: '后防倾杆',
                                            frontRideHeight: '前车身高度', rearRideHeight: '后车身高度',
                                            diffAccel: '差速器加速锁', diffDecel: '差速器减速锁',
                                            diffCenter: '中央差速偏置', finalDrive: '终传比',
                                            frontDownforce: '前空气下压力', rearDownforce: '后空气下压力'
                                          };
                                          const unitMap = {
                                            frontTirePressure: ' PSI', rearTirePressure: ' PSI',
                                            frontCamber: '°', rearCamber: '°', frontToe: '°', rearToe: '°',
                                            frontRideHeight: ' cm', rearRideHeight: ' cm',
                                            diffAccel: '%', diffDecel: '%', diffCenter: '%',
                                            frontDownforce: ' lbs', rearDownforce: ' lbs'
                                          };
                                          return (
                                            <div key={paramKey} style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1117', padding: '4px 8px', borderRadius: 4, fontSize: 10 }}>
                                              <span style={{ color: '#8b949e' }}>{paramNameMap[paramKey] || paramKey}</span>
                                              <span style={{ color: '#e6edf3' }}>
                                                {hasCurrent ? (
                                                  <span>当前: {currentVal}{unitMap[paramKey] || ''} ➡️ <strong style={{ color: '#3fb950' }}>目标: {(currentVal + fix.delta).toFixed(1)}{unitMap[paramKey] || ''}</strong></span>
                                                ) : (
                                                  <strong style={{ color: fix.delta > 0 ? '#3fb950' : '#f85149' }}>推荐微调: {fix.delta > 0 ? '+' : ''}{fix.delta}{unitMap[paramKey] || ''}</strong>
                                                )}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => {
                                          onNavigate('tunes', {
                                            action: 'edit',
                                            tuneId: sessionTune?.id,
                                            vehicleId: analysis.vehicle?.ordinal,
                                            suggestedChanges: prob.fixes,
                                            problemName: prob.name,
                                            trackName: analysis.track?.name || analysis.trackName || '未知赛道'
                                          });
                                        }}
                                        style={{
                                          marginTop: 8,
                                          width: '100%',
                                          padding: '8px 12px',
                                          background: '#d29922',
                                          border: 'none',
                                          borderRadius: 4,
                                          color: '#0d1117',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          boxShadow: '0 2px 6px rgba(210, 153, 34, 0.3)',
                                          textAlign: 'center',
                                          transition: 'all 0.2s'
                                        }}
                                      >
                                        🔧 同步调整方案至调校中心
                                      </button>
                                    </div>
                                  );
                                })() : (
                                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: 10 }}>
                                    请在左侧选择具体驾驶不适问题以输出规则调参数值。
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== TAB 2: 驾驶复盘 ==================== */}
              {activeTab === 'professional_review' && ['corners', 'inputs'].includes(reviewSubTab) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 子页签切换工具栏 */}
                  <div style={{ display: 'none' }}>
                    {[
                      { id: 'analysis', label: '📊 赛段与弯道分析' },
                      { id: 'inputs', label: '📈 驾驶操作曲线' }
                    ].map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setDrivingSubTab(sub.id)}
                        style={{
                          padding: '4px 12px',
                          background: drivingSubTab === sub.id ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                          color: drivingSubTab === sub.id ? '#0d1117' : '#c9d1d9',
                          border: `1px solid ${drivingSubTab === sub.id ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>

                  {drivingSubTab === 'analysis' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 多圈分段计时对比表 */}
                      {false && advancedData?.lapSectorDetails && advancedData.lapSectorDetails.length > 0 && (
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h3 style={sectionTitleStyle}>⏱️ 赛局多圈分段计时对比</h3>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '6px 8px' }}>圈数</th>
                                  <th style={{ padding: '6px 8px' }}>分段一</th>
                                  <th style={{ padding: '6px 8px' }}>分段二</th>
                                  <th style={{ padding: '6px 8px' }}>分段三</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>单圈总时长</th>
                                </tr>
                              </thead>
                              <tbody>
                                {advancedData.lapSectorDetails.map((lapDetail) => {
                                  const isBestLap = lapDetail.sectors.every(s => s.loss === 0) || (analysis?.成绩?.总时长 && Math.abs(lapDetail.totalTime * 1000 - analysis.成绩.总时长) < 100);
                                  return (
                                    <tr key={lapDetail.lap} style={{ borderBottom: '1px solid rgba(48,54,61,0.2)', background: isBestLap ? 'rgba(210,153,34,0.06)' : 'transparent', fontWeight: isBestLap ? 'bold' : 'normal' }}>
                                      <td style={{ padding: '8px 8px', color: isBestLap ? '#d29922' : 'inherit' }}>第 {lapDetail.lap} 圈 {isBestLap && '🌟'}</td>
                                      {lapDetail.sectors.map((s, idx) => (
                                        <td key={idx} style={{ padding: '8px 8px', fontFamily: 'monospace', color: s.loss === 0 ? '#56d364' : '#e6edf3', background: s.loss === 0 ? 'rgba(63,185,80,0.08)' : 'transparent' }}>{s.time?.toFixed(3)}s</td>
                                      ))}
                                      {Array.from({ length: Math.max(0, 3 - lapDetail.sectors.length) }).map((_, idx) => (
                                        <td key={`empty-${idx}`} style={{ padding: '8px 8px', color: '#484f58' }}>--</td>
                                      ))}
                                      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'monospace', color: isBestLap ? '#d29922' : '#e6edf3' }}>{lapDetail.totalTime?.toFixed(3)}s</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 弯道列表 */}
                      <div style={{ ...sectionStyle, margin: 0, padding: 12, order: 2 }}>
                        <h3 style={sectionTitleStyle}>📐 弯道数据分析表</h3>
                        {(!turnsData?.turns || turnsData.turns.length === 0) ? (
                          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>暂无弯道分析数据</div>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '8px 4px' }}>弯道</th>
                                  <th style={{ padding: '8px 4px' }}>类型</th>
                                  <th style={{ padding: '8px 4px' }}>入弯 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>弯心 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>出弯 (实际/推荐)</th>
                                  <th style={{ padding: '8px 4px' }}>档位</th>
                                  <th style={{ padding: '8px 4px' }}>横向G</th>
                                </tr>
                              </thead>
                              <tbody>
                                {turnsData.turns.map((t, idx) => {
                                  const apexSpeed = t.current?.apexSpeed ?? 0;
                                  const peakLatG = t.current?.peakLatG ?? 0;
                                  const isSelected = activeTurnIdx === idx;
                                  const recEntry = t.recommended?.entrySpeed || '-';
                                  const recApex = t.recommended?.apexSpeed || '-';
                                  const recExit = t.recommended?.exitSpeed || '-';
                                  const speedDiff = typeof recApex === 'number' && recApex > 0 ? apexSpeed - recApex : 0;
                                  let diffBadge = null;
                                  if (recApex > 0 && typeof recApex === 'number') {
                                    if (speedDiff < -5) diffBadge = <span style={badgeRedStyle}>↓{Math.abs(speedDiff)}</span>;
                                    else if (speedDiff >= 2) diffBadge = <span style={badgeGreenStyle}>↑{speedDiff}</span>;
                                  }
                                  return (
                                    <tr key={t.index ?? idx} onClick={() => setActiveTurnIdx(idx)} style={{ borderBottom: '1px solid rgba(48, 54, 61, 0.3)', background: isSelected ? 'rgba(88,166,255,0.08)' : 'transparent', cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                                      <td style={{ padding: '8px 4px', fontWeight: 600, color: isSelected ? 'var(--accent)' : 'inherit' }}>{t.name}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.turnCategory || (t.direction === 'left' ? '左弯' : '右弯')}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.entrySpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/{recEntry}</span></td>
                                      <td style={{ padding: '8px 4px', fontWeight: 700 }}>{apexSpeed} <span style={{ color: '#8b949e', fontSize: 9, fontWeight: 'normal' }}>/{recApex}</span> {diffBadge}</td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.exitSpeed || 0} <span style={{ color: '#8b949e', fontSize: 9 }}>/{recExit}</span></td>
                                      <td style={{ padding: '8px 4px' }}>{t.current?.gear ?? '-'}</td>
                                      <td style={{ padding: '8px 4px', color: peakLatG > 1.8 ? '#3fb950' : '#8b949e' }}>{peakLatG.toFixed(1)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* 单弯复盘 */}
                      <div style={{ ...sectionStyle, margin: 0, padding: 12, order: 1, borderColor: 'rgba(88,166,255,0.35)' }}>
                        {!selectedTurnReview ? (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 11, textAlign: 'center', padding: 8 }}>请选择上方或者左侧弯道列表开始弯角技术分析。</div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                              <div>
                                <div style={{ color: '#58a6ff', fontSize: 9, fontWeight: 800, marginBottom: 3 }}>当前弯道诊断</div>
                                <div style={{ fontSize: 14, fontWeight: 800 }}>{selectedTurnReview.turn.name} <span style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 500 }}>{selectedTurnReview.turn.turnCategory || selectedTurnReview.turn.type || '弯道'}</span></div>
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 600 }}>本场优先关注：{selectedTurnReview.focus}</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                              {selectedTurnReview.phases.map((phase, index) => (
                                <div key={phase.id} style={{ position: 'relative', border: '1px solid var(--border)', background: 'var(--bg-primary)', borderRadius: 6, padding: 10, minHeight: 110 }}>
                                  {index < selectedTurnReview.phases.length - 1 && <div style={{ position: 'absolute', top: 23, right: -6, width: 12, height: 1, background: 'var(--border)' }} />}
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 9, marginBottom: 5 }}>{phase.label}</div>
                                  <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800, fontFamily: 'monospace', marginBottom: 4 }}>{phase.value}</div>
                                  <div style={{ color: phase.detail.startsWith('慢') ? 'var(--danger)' : 'var(--accent)', fontSize: 9, marginBottom: 6 }}>{phase.detail}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 9, lineHeight: 1.4 }}>{phase.note}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {drivingSubTab === 'inputs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 新增：按赛道距离定位制动动作与抱死事件 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>制动区证据图：车速、刹车与减速度</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离；黄色线是车速，红线是刹车深度，紫线是纵向减速度绝对值。红色圆点表示刹车超过 40% 且任一车轮滑移率低于 -15% 的抱死采样点。用于判断刹车点、松刹节奏和抱死发生位置，不设置通用减速度阈值。
                        </div>
                        <div style={{ height: 230 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={brakingEvidenceData} syncId="overlaySync" margin={{ top: 8, right: 22, bottom: 8, left: 0 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={7} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis yAxisId="speed" stroke="#ffdf80" tick={{ fontSize: 9 }} label={{ value: '车速', angle: -90, position: 'insideLeft', fill: '#ffdf80', fontSize: 10 }} />
                              <YAxis yAxisId="brake" orientation="right" domain={[0, 100]} stroke="#f85149" tick={{ fontSize: 9 }} unit="%" />
                              <YAxis yAxisId="g" hide domain={[0, 'auto']} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '刹车深度' ? `${Number(value).toFixed(0)}%` : name === '纵向减速度' ? `${Number(value).toFixed(2)} G` : `${Number(value).toFixed(0)} 千米/小时`} />
                              <Line yAxisId="speed" type="monotone" dataKey="speed" name="车速" stroke="#ffdf80" dot={false} strokeWidth={1.7} />
                              <Line yAxisId="brake" type="monotone" dataKey="brake" name="刹车深度" stroke="#f85149" dot={false} strokeWidth={1.4} />
                              <Line yAxisId="g" type="monotone" dataKey="decel" name="纵向减速度" stroke="#bc8cff" dot={false} strokeWidth={1.4} />
                              <Line yAxisId="speed" dataKey="lockupSpeed" name="抱死位置" stroke="transparent" connectNulls={false} dot={{ r: 3, fill: '#f85149', stroke: '#ffffff', strokeWidth: 1 }} activeDot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 油门与刹车对比图 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>油门与刹车控制踏板深度对比（平滑、顺畅的交替是高圈速的秘密）</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 横轴为赛道距离，纵轴为踏板开度。绿色为油门、红色为刹车；两条线长时间同时抬起表示无动力滑行，明显重叠表示油刹同时输入。重点观察刹车释放与开油是否连续平顺。
                        </div>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={channelsData?.channels || []} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} domain={[0, 100]} unit="%" />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(0)}%`} />
                              <Line type="monotone" dataKey="throttle" stroke="#3fb950" name="油门" dot={false} strokeWidth={1.5} />
                              <Line type="monotone" dataKey="brake" stroke="#f85149" name="刹车" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* 新图表：车速与方向盘转向对比图 */}
                      <div style={sectionStyle}>
                        <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>车速与方向盘转向角度对比图（正值代表向右，负值代表向左。横轴为距离）</h4>
                        <div style={chartGuideStyle}>
                          <strong>📚 诊断指南与参考区间：</strong> 黄色线为车速，蓝色线为转向输入，灰色实线为方向盘居中的 0% 基线。转向曲线应保持连续；锯齿和短时间反向输入代表弯中修正。不同车型转向比差异很大，因此不设置统一的高速转向幅值阈值。
                        </div>
                        <div style={{ height: 180 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={steeringSpeedData} syncId="overlaySync" onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                              <XAxis dataKey="distance" stroke="#8b949e" tick={{ fontSize: 9 }} tickCount={6} tickFormatter={Math.round} label={{ value: '赛道距离（米）', position: 'insideBottomRight', offset: -4, fill: '#8b949e', fontSize: 10 }} />
                              <YAxis yAxisId="left" stroke="#ffdf80" tick={{ fontSize: 9 }} domain={[0, 360]} label={{ value: '车速（千米/小时）', angle: -90, position: 'insideLeft', fill: '#ffdf80', fontSize: 10 }} />
                              <YAxis yAxisId="right" orientation="right" stroke="#58a6ff" tick={{ fontSize: 9 }} domain={[-100, 100]} label={{ value: '转向百分比', angle: 90, position: 'insideRight', fill: '#58a6ff', fontSize: 10 }} />
                              <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '转向' ? `${Number(value).toFixed(1)}%` : `${Number(value).toFixed(0)} km/h`} />
                              <ReferenceLine yAxisId="right" y={0} stroke="#484f58" />
                              <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#ffdf80" name="车速" dot={false} strokeWidth={1.5} />
                              <Line yAxisId="right" type="monotone" dataKey="steerPct" stroke="#58a6ff" name="转向" dot={false} strokeWidth={1.5} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {/* G-G 摩擦圆 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>循迹制动：抓地利用图</h4>
                          <div style={chartGuideStyle}>
                            <strong>📚 诊断指南与参考区间：</strong> 横轴为横向 G，纵轴为纵向 G，灰色十字是 0 G 基线。点云向外延伸表示抓地利用更高；点云形状是否连续比单个极值更重要，不设置统一的固定 G 值标准。
                          </div>
                          <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="x" name="横向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <YAxis type="number" dataKey="y" name="纵向G力" domain={[-2.2, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value) => `${Number(value).toFixed(2)} G`} />
                                <ReferenceLine x={0} stroke="#484f58" />
                                <ReferenceLine y={0} stroke="#484f58" />
                                <Scatter name="G-G点" data={ggScatterPoints} fill="#bc8cff" opacity={0.6} />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 重刹效率 */}
                        <div style={{ ...sectionStyle, margin: 0 }}>
                          <h4 style={{ margin: '0 0 10px', fontSize: 11 }}>重刹制动效率</h4>
                          <div style={chartGuideStyle}>
                            <strong>📚 诊断指南与参考区间：</strong> 横轴为刹车踏板深度，纵轴为减速度绝对值。同一踏板深度下点云越集中，制动表现越稳定；大量分散点可能来自路面起伏、转向或轮胎锁死，因此需结合上方制动区证据图定位。
                          </div>
                          <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                                <XAxis type="number" dataKey="brake" name="刹车深度" domain={[0, 100]} stroke="#8b949e" tick={{ fontSize: 9 }} />
                                <YAxis type="number" dataKey="decel" name="制动力" domain={[0, 2.2]} stroke="#8b949e" tick={{ fontSize: 9 }} tickFormatter={(value) => Number(value).toFixed(1)} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }} formatter={(value, name) => name === '制动力' ? `${Number(value).toFixed(2)} G` : `${Number(value).toFixed(0)}%`} />
                                <Scatter name="刹车点" data={brakeGScatterData} fill="#f85149" />
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}


    </>
  );
});
