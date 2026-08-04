import React from 'react';
import { TelemetryRecommendationList } from './TelemetryRecommendationList';
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../../data/tunePresets';
import { FIX_PARAM_MAP } from '../../../utils/tuneForm';
import { PARAM_NAMES_ZH } from './tuneConstants';



// 自动注入的缺失依赖 (原页面中被引用但未定义，为防止崩溃添加的 fallback)
const getCarStats = () => ({});
const getDefaultParts = () => ({});
const getPerformanceClassBadge = () => null;
const getTuneDefaults = () => ({});
const handleApplyDiagnosisInViewOnly = () => {};
const isDiagnosing = false;
const recentSessions = [];
const statCardStyle = {};
const handleSelectTuneForDiagnosis = () => {};
const selectedCarId = null;
const diagnosticLoading = false;

export const TuneDiagnosticModal = React.memo(function TuneDiagnosticModal(props) {
  const {
    activeDiagnosisTab,
    setActiveDiagnosisTab,
    setDiagnosisResult,
    previewFixData,
    setPreviewFixData,
    handleConfirmSaveFixPreview,
    runTelemetryDiagnosis,
    toggleProblemSelection,
    formatDate,
    inputStyle,
    btnPrimaryStyle,
    diagnosisModalTune,
    setDiagnosisModalTune,
    modalOverlayStyle,
    modalContentStyle,
    btnSmallStyle,
    getVehicleName,
    tunes,
    diagnosisResult,
    handleGenerateFixPreview,
    runAiProblemDiagnosis,
    selectedProblems,
    setSelectedProblems,
    selectedSessionId,
    setSelectedSessionId,
    handleApplyProblemsFixInViewOnly,
    aiDiagnosing,
    aiDiagnosis,
    availableSessions,
    diagnosing,
    setUnlockToast
  } = props;

  // We will paste the JSX below.
        {/* 🔬 沉浸式赛车工程诊断工作台 (Diagnostic Workbench) Modal */}
      if (!diagnosisModalTune) return null;

  return (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setDiagnosisModalTune(null); }}>
          <div style={{
            ...modalContentStyle,
            maxWidth: 920,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflow: 'hidden',
            padding: 22,
            background: 'linear-gradient(145deg, #0d1117 0%, #161b22 100%)',
            border: '1px solid var(--accent)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
            borderRadius: 12
          }}>
            {/* Header 顶栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(63, 185, 80, 0.15)', border: '1px solid rgba(63, 185, 80, 0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#3fb950'
                }}>
                  🔬
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                    赛车工程诊断工作台
                  </h2>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    基于真实物理遥测与物理模型双核驱动，解决动态极限与驾驶表现瓶颈
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDiagnosisModalTune(null)}
                style={{ ...btnSmallStyle, border: 'none', fontSize: 18, cursor: 'pointer', padding: '2px 10px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Step 1: 目标方案与赛道遥测绑定条 */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 180px',
              gap: 12,
              alignItems: 'center',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>
                  ① 目标调校方案
                </label>
                <select
                  value={diagnosisModalTune.id}
                  onChange={(e) => {
                    const selected = tunes.find(t => t.id === e.target.value);
                    if (selected) {
                      setDiagnosisModalTune(selected);
                      setDiagnosisResult(null);
                      setSelectedSessionId('');
                    }
                  }}
                  style={{ ...inputStyle, padding: '5px 8px', fontSize: 11, background: 'var(--bg-primary)' }}
                >
                  {tunes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({getVehicleName(t.vehicleId)} | PI {t.totalPi || '-'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff', display: 'block', marginBottom: 4 }}>
                  ② 绑定的赛道遥测比赛
                </label>
                {(() => {
                  const carSessions = availableSessions.filter(s => {
                    const sVehicleId = s.vehicleId || s.vehicle?.ordinal || s.carOrdinal || '';
                    return String(sVehicleId) === String(diagnosisModalTune.vehicleId);
                  });
                  return (
                    <select
                      value={selectedSessionId}
                      onChange={e => {
                        setSelectedSessionId(e.target.value);
                        setDiagnosisResult(null);
                      }}
                      style={{ ...inputStyle, padding: '5px 8px', fontSize: 11, background: 'var(--bg-primary)' }}
                    >
                      <option value="">-- 手动选择赛道遥测 ({carSessions.length} 场记录) --</option>
                      {carSessions.map(session => {
                        const track = session.trackName || session.track || '未知赛道';
                        const dateVal = session.savedAt || session.date || session.createdAt;
                        return (
                          <option key={session.id} value={session.id}>
                            {track} ({dateVal ? formatDate(dateVal) : '未知时间'})
                          </option>
                        );
                      })}
                    </select>
                  );
                })()}
              </div>

              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 6,
                padding: '6px 10px',
                textAlign: 'right',
                border: '1px solid rgba(255, 255, 255, 0.04)'
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>适用车辆</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getVehicleName(diagnosisModalTune.vehicleId)}
                </div>
              </div>
            </div>

            {/* Step 2: 诊断工作流 Mode Tabs */}
            <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}>
              <button
                type="button"
                onClick={() => setActiveDiagnosisTab('telemetry')}
                style={{
                  ...btnSmallStyle,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: activeDiagnosisTab === 'telemetry' ? 'rgba(63, 185, 80, 0.15)' : 'transparent',
                  borderColor: activeDiagnosisTab === 'telemetry' ? '#3fb950' : 'var(--border)',
                  color: activeDiagnosisTab === 'telemetry' ? '#3fb950' : 'var(--text-secondary)'
                }}
              >
                <span>📈 全车遥测深度健康扫描</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDiagnosisTab('problems')}
                style={{
                  ...btnSmallStyle,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: activeDiagnosisTab === 'problems' ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                  borderColor: activeDiagnosisTab === 'problems' ? '#58a6ff' : 'var(--border)',
                  color: activeDiagnosisTab === 'problems' ? '#58a6ff' : 'var(--text-secondary)'
                }}
              >
                <span>🙋 驾驶感受问题定向攻坚</span>
              </button>
            </div>

            {/* Step 3: 工作台内容展示 */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Tab 1: 全车遥测扫描 */}
              {activeDiagnosisTab === 'telemetry' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 8,
                    padding: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)'
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        全车物理遥测数据扫描
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        归约分析赛道实测的悬挂触底、轮胎滑移率、重刹锁死率与前后轴轴向温差
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const carSessions = availableSessions.filter(s => {
                            const sVehicleId = s.vehicleId || s.vehicle?.ordinal || s.carOrdinal || '';
                            return String(sVehicleId) === String(diagnosisModalTune.vehicleId);
                          });
                          if (carSessions.length === 0) {
                            setUnlockToast('ℹ️ 暂未找到该车型的赛道遥测记录，请先去赛道跑几圈录制遥测数据！');
                            return;
                          }
                          setSelectedSessionId(carSessions[0].id);
                          runTelemetryDiagnosis(carSessions[0].id);
                        }}
                        disabled={diagnosing}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'rgba(63, 185, 80, 0.18)',
                          border: '1px solid rgba(63, 185, 80, 0.4)',
                          color: '#3fb950',
                          borderRadius: 6,
                          padding: '8px 16px',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ 快捷扫描本车最新比赛
                      </button>

                      <button
                        type="button"
                        onClick={() => runTelemetryDiagnosis(selectedSessionId)}
                        disabled={!selectedSessionId || diagnosing}
                        style={{
                          ...btnPrimaryStyle,
                          fontSize: 11,
                          padding: '8px 16px',
                          background: diagnosing ? '#484f58' : '#238636'
                        }}
                      >
                        {diagnosing ? '深度扫描中...' : '🚀 开始全面扫描'}
                      </button>
                    </div>
                  </div>

                  {/* 扫描分析矩阵 */}
                  {diagnosisResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'toastSlideIn 0.3s ease' }}>
                      
                      {/* 扫描结论 Card */}
                      <div style={{
                        padding: 12,
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 8,
                        border: '1px solid ' + (diagnosisResult.issues && diagnosisResult.issues.length > 0 ? '#d29922' : '#3fb950'),
                        borderLeftWidth: 4
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                          📊 工程扫描评估结论:
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {diagnosisResult.summary || '全车遥测数据质量良好，未发现严重的物理碰撞失衡。'}
                        </div>
                      </div>

                      {/* 细节物理证据 */}
                      <TelemetryRecommendationList result={diagnosisResult} />

                      {/* 物理参数调整对比表 (Parameter Contrast Matrix Table) */}
                      {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                        <div style={{
                          background: 'var(--bg-primary)',
                          borderRadius: 8,
                          padding: 14,
                          border: '1px solid var(--accent)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🔧 拟修正调校参数对比矩阵:</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>已针对当前方案换算目标绝对值</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(diagnosisResult.suggestedChanges).map(([cat, params]) =>
                              Object.entries(params).map(([key, val]) => {
                                const curVal = diagnosisModalTune[cat]?.[key];
                                const targetVal = Number.isFinite(Number(curVal)) ? (Number(curVal) + Number(val)).toFixed(2) : null;
                                return (
                                  <div key={key} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '120px 140px 1fr',
                                    gap: 10,
                                    alignItems: 'center',
                                    fontSize: 11,
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255, 255, 255, 0.04)'
                                  }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{PARAM_NAMES_ZH[key] || key}</span>
                                    <span style={{ fontFamily: 'monospace' }}>
                                      {curVal !== undefined ? curVal : '?'} ➔ <strong style={{ color: '#3fb950' }}>{targetVal !== null ? targetVal : '微调'}</strong>
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                      幅度: <strong style={{ color: val > 0 ? '#3fb950' : '#da3633' }}>{val > 0 ? `+${val}` : val}</strong>
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              handleGenerateFixPreview(diagnosisModalTune, diagnosisResult.suggestedChanges, '全车遥测深度健康扫描');
                            }}
                            style={{
                              ...btnPrimaryStyle,
                              width: '100%',
                              fontSize: 12,
                              padding: '10px 16px',
                              background: '#238636',
                              fontWeight: 800,
                              marginTop: 6,
                              borderRadius: 6
                            }}
                          >
                            ⚡ 生成并查看拟修正参数明细预览 (Before vs After)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: 驾驶感受问题定向攻坚 */}
              {activeDiagnosisTab === 'problems' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      勾选在赛道驾驶时遇到的复合动态问题。遥测数据为<strong>完全可选</strong>，无遥测时系统将直接结合本车已有调校参数进行攻坚剖析。
                    </span>
                    <span style={{ fontSize: 10, color: '#58a6ff', fontWeight: 700 }}>
                      已勾选 {selectedProblems.length} 项问题
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>
                    
                    {/* 左侧：驾驶问题多选网格 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          驾驶问题库 (支持多选复选):
                        </span>
                        {selectedProblems.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedProblems([])}
                            style={{ ...btnSmallStyle, padding: '1px 6px', fontSize: 9, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            清空选择
                          </button>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                        {DRIVING_PROBLEMS.map((prob, idx) => {
                          const isSelected = selectedProblems.some(p => p.name === prob.name);
                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '10px 12px',
                                background: isSelected ? 'rgba(88, 166, 255, 0.14)' : 'var(--bg-primary)',
                                border: `1px solid ${isSelected ? '#58a6ff' : 'var(--border)'}`,
                                borderRadius: 8,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                transition: 'all 0.2s',
                                cursor: 'pointer'
                              }}
                              onClick={() => {
                                toggleProblemSelection(prob);
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? '#58a6ff' : 'var(--text-primary)' }}>
                                    {prob.name}
                                  </span>
                                </div>
                                <span style={{
                                  fontSize: 8.5,
                                  color: isSelected ? '#fff' : '#58a6ff',
                                  background: isSelected ? '#238636' : 'rgba(88, 166, 255, 0.1)',
                                  borderRadius: 4,
                                  padding: '1px 6px',
                                  fontWeight: 700
                                }}>
                                  {isSelected ? '✓ 已勾选' : '+ 选择'}
                                </span>
                              </div>
                              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', lineHeight: 1.3, paddingLeft: 20 }}>
                                {prob.description}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (selectedProblems.length === 0) {
                            setUnlockToast('⚠️ 请至少在上方勾选一个驾驶体验问题！');
                            return;
                          }
                          runAiProblemDiagnosis(selectedProblems, selectedSessionId, diagnosisModalTune);
                        }}
                        disabled={selectedProblems.length === 0 || aiDiagnosing}
                        style={{
                          ...btnPrimaryStyle,
                          width: '100%',
                          fontSize: 11,
                          padding: '9px 12px',
                          background: selectedProblems.length > 0 ? '#238636' : '#30363d',
                          color: selectedProblems.length > 0 ? '#fff' : 'var(--text-muted)',
                          fontWeight: 800,
                          borderRadius: 6,
                          marginTop: 4
                        }}
                      >
                        {aiDiagnosing ? 'AI 攻坚诊断中...' : `⚡ 联合攻坚诊断选中的 ${selectedProblems.length} 项问题`}
                      </button>
                    </div>

                    {/* 右侧：专项分析与参数对决面板 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {selectedProblems.length === 0 ? (
                        <div style={{
                          padding: 40,
                          textAlign: 'center',
                          background: 'var(--bg-primary)',
                          borderRadius: 8,
                          border: '1px dashed var(--border)',
                          color: 'var(--text-muted)',
                          fontSize: 11
                        }}>
                          👈 请在左侧勾选 1~N 个驾驶体验问题（无遥测数据也可直接诊断）
                        </div>
                      ) : (
                        <div style={{
                          padding: 14,
                          background: 'var(--bg-primary)',
                          borderRadius: 8,
                          border: '1px solid #58a6ff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          animation: 'toastSlideIn 0.3s ease'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(88, 166, 255, 0.15)', paddingBottom: 8 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#58a6ff' }}>
                              🔬 复合问题「{selectedProblems.map(p => p.name).join(' + ')}」攻坚报告
                            </div>
                            {aiDiagnosing && <span style={{ fontSize: 10, color: '#d29922' }}>AI & 物理模型联合计算中...</span>}
                          </div>

                          {/* 诊断结论文本 */}
                          {aiDiagnosis ? (
                            <div style={{
                              fontSize: 10.5,
                              color: 'var(--text-primary)',
                              whiteSpace: 'pre-wrap',
                              lineHeight: 1.6,
                              background: 'rgba(88, 166, 255, 0.04)',
                              padding: 12,
                              borderRadius: 6,
                              border: '1px solid rgba(88, 166, 255, 0.15)'
                            }}>
                              {aiDiagnosis}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                              点击左侧「⚡ 联合攻坚诊断选中的 {selectedProblems.length} 项问题」获取针对这多项症状的综合对症分析
                            </div>
                          )}

                          {/* 针对该问题的物理修正建议 */}
                          <button
                            type="button"
                            onClick={() => {
                              handleApplyProblemsFixInViewOnly(diagnosisModalTune, selectedProblems);
                            }}
                            disabled={selectedProblems.length === 0}
                            style={{
                              ...btnPrimaryStyle,
                              width: '100%',
                              fontSize: 12,
                              padding: '10px 16px',
                              background: '#238636',
                              fontWeight: 800,
                              marginTop: 4,
                              borderRadius: 6
                            }}
                          >
                            ⚡ 生成这 {selectedProblems.length} 项问题的拟修正对比预览 (Before vs After)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ⚡ 拟修正参数明细对决与保存确认面板 (Preview Fix Data Panel) */}
              {previewFixData && (
                <div id="fix-preview-panel" style={{
                  background: 'linear-gradient(135deg, rgba(35, 134, 54, 0.15) 0%, rgba(13, 17, 23, 0.95) 100%)',
                  border: '1px solid #3fb950',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  marginTop: 8,
                  animation: 'toastSlideIn 0.3s ease',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(63, 185, 80, 0.2)', paddingBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⚡ {previewFixData.title} · 参数修改明细预览</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(原来是多少 ➔ 拟更新为多少)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewFixData(null)}
                      style={{ ...btnSmallStyle, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {previewFixData.items.map((item, idx) => (
                      <div key={idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '130px 180px 1fr',
                        gap: 10,
                        padding: '8px 12px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        borderRadius: 6,
                        fontSize: 11,
                        alignItems: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.04)'
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.label}</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{item.oldVal}</span> ➔ <strong style={{ color: '#3fb950' }}>{item.newVal}</strong>
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          幅度: <strong style={{ color: item.delta > 0 ? '#3fb950' : '#da3633' }}>{item.delta > 0 ? `+${item.delta}` : item.delta}</strong>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4, paddingTop: 8, borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewFixData(null)}
                      style={{
                        ...btnSmallStyle,
                        padding: '7px 16px',
                        fontSize: 11,
                        background: 'transparent',
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)',
                        borderRadius: 6
                      }}
                    >
                      放弃本次修改
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSaveFixPreview}
                      style={{
                        ...btnPrimaryStyle,
                        padding: '7px 20px',
                        fontSize: 11,
                        background: '#238636',
                        fontWeight: 800,
                        borderRadius: 6
                      }}
                    >
                      确认写入并直接保存该方案
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
});
