import React, { useState } from 'react'
import { EmptyState } from '../shared/EmptyState'
import {
  PART_CATEGORIES,
  TIER_LABELS,
} from '../../data/parts'
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets'
import { useTuneManager, FIX_PARAM_MAP } from '../../hooks/useTuneManager'

export function TuneManagerPage({ onNavigate, navIntent }) {
  const {
    tunes,
    setTunes,
    vehicles,
    setVehicles,
    tracks,
    setTracks,
    loading,
    setLoading,
    showModal,
    setShowModal,
    editingTune,
    setEditingTune,
    expandedTune,
    setExpandedTune,
    searchQuery,
    setSearchQuery,
    vehicleFilter,
    setVehicleFilter,
    tagFilter,
    setTagFilter,
    formData,
    setFormData,
    compareMode,
    setCompareMode,
    compareSelected,
    setCompareSelected,
    compareResult,
    setCompareResult,
    compareLoading,
    setCompareLoading,
    compareTrackId,
    setCompareTrackId,
    shareCodeModal,
    setShareCodeModal,
    importPreview,
    setImportPreview,
    importFileRef,
    dirtyParamsRef,
    collapsedSections,
    setCollapsedSections,
    targetPi,
    setTargetPi,
    basePi,
    setBasePi,
    autoUpgradeLoading,
    setAutoUpgradeLoading,
    drivingProblemsOpen,
    setDrivingProblemsOpen,
    selectedProblem,
    setSelectedProblem,
    activeTune,
    setActiveTune,
    activeTuneLoading,
    setActiveTuneLoading,
    telemetryPanelOpen,
    setTelemetryPanelOpen,
    availableSessions,
    setAvailableSessions,
    selectedSessionId,
    setSelectedSessionId,
    diagnosing,
    setDiagnosing,
    diagnosisResult,
    setDiagnosisResult,
    tuneSessionStats,
    setTuneSessionStats,
    partsPiDelta,
    totalPi,
    currentVehicleStats,
    handleAutoUpgrade,
    applyProblemFix,
    loadTelemetrySessions,
    runTelemetryDiagnosis,
    applyDiagnosisFix,
    loadTunes,
    loadVehicles,
    loadTracks,
    loadTuneSessionStats,
    loadActiveTune,
    setActiveTuneById,
    clearActiveTune,
    saveTune,
    deleteTune,
    duplicateTune,
    startEdit,
    startCreate,
    closeModal,
    toggleExpand,
    toggleCompareMode,
    toggleSelectForCompare,
    runCompare,
    clearCompare,
    allTags,
    filteredTunes,
    vehicleOptions,
    getVehicleName,
    formatDate,
    formatTime,
    updateFormField,
    unlockToast,
    setUnlockToast,
    highlightedParams,
    setHighlightedParams,
    tuneDefaults,
    resetParamToDefault,
    resetAllToDefaults,
    updatePartSelection,
    tuneConstraints,
    exportTune,
    uint8ToBase64,
    base64ToUint8,
    simpleChecksum,
    generateShareCode,
    parseShareCode,
    handleImportFile,
    importFromShareCode,
    applyPresetTune,
    ni,
    toggleSection,
    TUNE_DEFAULT_KEY_MAP,
    telemetrySuggestions,
    setTelemetrySuggestions,
    applyTelemetrySuggestions
  } = useTuneManager({ onNavigate, navIntent });
  return (
    <div style={{ padding: 8, height: 'calc(100vh - 60px)', overflow: 'auto', background: '#0d1117' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8, padding: '0 6px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>调校管理</h2>
          <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>
            {tunes.length} 个调校方案
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={toggleCompareMode}
            style={compareMode ? { ...btnPrimaryStyle, background: '#58a6ff', padding: '4px 10px', fontSize: 10 } : { ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}
          >
            {compareMode ? '退出' : '对比'}
          </button>
          <button onClick={() => importFileRef.current?.click()} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            导入
          </button>
          <button onClick={() => setShareCodeModal('input')} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            分享码
          </button>
          <button onClick={startCreate} style={{ ...btnPrimaryStyle, padding: '4px 12px', fontSize: 11 }}>
            + 新建
          </button>
        </div>
      </div>
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {/* 搜索与筛选栏 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="按名称搜索..."
          style={{ ...inputStyle, width: 180, marginBottom: 0 }}
        />
        <select
          value={vehicleFilter}
          onChange={e => setVehicleFilter(e.target.value)}
          style={{ ...inputStyle, width: 160, marginBottom: 0 }}
        >
          <option value="">全部车辆</option>
          {vehicleOptions.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          style={{ ...inputStyle, width: 140, marginBottom: 0 }}
        >
          <option value="">全部标签</option>
          {allTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        {(searchQuery || vehicleFilter || tagFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setVehicleFilter(''); setTagFilter('') }}
            style={btnSmallStyle}
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Round 4: 当前活跃调校 */}
      {activeTune && (
        <div style={{
          background: 'rgba(35, 134, 54, 0.1)',
          border: '1px solid rgba(35, 134, 54, 0.35)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>当前活跃调校:</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--success)' }}>{activeTune.name}</span>
            {activeTune.vehicleId && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                / {getVehicleName(activeTune.vehicleId)}
              </span>
            )}
          </div>
          <button
            onClick={clearActiveTune}
            style={{
              ...btnSmallStyle,
              background: 'rgba(218, 54, 51, 0.15)',
              borderColor: 'rgba(218, 54, 51, 0.3)',
              color: '#da3633'
            }}
          >
            取消活跃
          </button>
        </div>
      )}

      {/* 对比控制栏 */}
      {compareMode && (
        <div style={{
          background: compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.15)' : 'rgba(210, 153, 34, 0.12)',
          border: `1px solid ${compareSelected.length === 2 ? 'rgba(35, 134, 54, 0.4)' : 'rgba(210, 153, 34, 0.35)'}`,
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>已选择: </span>
              <span style={{ fontWeight: 700, color: compareSelected.length === 2 ? 'var(--success)' : 'var(--warning)' }}>
                {compareSelected.length}/2
              </span>
              {compareSelected.length === 2 && (
                <span style={{ color: 'var(--success)', marginLeft: 8 }}>可以开始对比</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>赛道:</span>
              <select
                value={compareTrackId}
                onChange={e => setCompareTrackId(e.target.value)}
                style={{ ...inputStyle, width: 180, marginBottom: 0, padding: '4px 6px', fontSize: 11 }}
              >
                <option value="">-- 选择赛道 --</option>
                {tracks.map(t => (
                  <option key={t.id} value={t.id}>{t.name || t.trackName || t.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {compareSelected.length > 0 && (
              <button onClick={clearCompare} style={btnSmallStyle}>清除选择</button>
            )}
            <button
              onClick={runCompare}
              disabled={compareSelected.length !== 2 || !compareTrackId || compareLoading}
              style={compareSelected.length === 2 && compareTrackId ? btnPrimaryStyle : { ...btnPrimaryStyle, opacity: 0.5, cursor: 'not-allowed' }}
            >
              {compareLoading ? '对比中...' : '开始对比'}
            </button>
          </div>
        </div>
      )}

      {/* 对比结果 */}
      {compareResult && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 14,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>调校对比结果</h3>
            <button onClick={() => setCompareResult(null)} style={btnSmallStyle}>关闭</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>指标</div>
            <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{compareResult.tuneAName || '调校A'}</div>
            <div style={{ fontWeight: 700, color: 'var(--warning)' }}>{compareResult.tuneBName || '调校B'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>最佳圈速</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{compareResult.tuneA?.bestLap ? formatTime(compareResult.tuneA.bestLap) : '-'}</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{compareResult.tuneB?.bestLap ? formatTime(compareResult.tuneB.bestLap) : '-'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>平均圈速</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.avgLap ? formatTime(compareResult.tuneA.avgLap) : '-'}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.avgLap ? formatTime(compareResult.tuneB.avgLap) : '-'}</div>

            <div style={{ color: 'var(--text-secondary)' }}>总圈数</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.totalLaps || 0}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.totalLaps || 0}</div>

            <div style={{ color: 'var(--text-secondary)' }}>比赛次数</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneA?.sessionCount || 0}</div>
            <div style={{ fontFamily: 'monospace' }}>{compareResult.tuneB?.sessionCount || 0}</div>
          </div>
          {compareResult.winner && (
            <div style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(35, 134, 54, 0.15)',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--success)',
              textAlign: 'center'
            }}>
              {compareResult.winner === 'A' ? compareResult.tuneAName : compareResult.tuneBName} 更快，领先 {formatTime(compareResult.diff)}
            </div>
          )}
        </div>
      )}

      {/* 调校卡片列表 */}
      {filteredTunes.length === 0 ? (
        <EmptyState
          icon="🔧"
          title={tunes.length === 0 ? '暂无调校方案' : '没有匹配的调校方案'}
          description={tunes.length === 0 ? '点击"新建调校"创建第一个方案。' : '尝试调整筛选条件。'}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12
        }}>
          {filteredTunes.map(tune => (
            <div
              key={tune.id}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 14,
                transition: 'all 0.15s'
              }}
            >
              {/* 卡片头部 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                {compareMode && (
                  <div
                    onClick={() => toggleSelectForCompare(tune.id)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: `2px solid ${compareSelected.includes(tune.id) ? 'var(--accent)' : 'var(--border)'}`,
                      background: compareSelected.includes(tune.id) ? 'var(--accent)' : 'transparent',
                      marginRight: 10,
                      flexShrink: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: '#fff',
                      fontWeight: 700
                    }}
                  >
                    {compareSelected.includes(tune.id) ? '✓' : ''}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {tune.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(tune.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => duplicateTune(tune)} style={btnSmallStyle}>复制</button>
                  <button onClick={() => exportTune(tune)} style={btnSmallStyle}>导出</button>
                  <button onClick={() => {
                    const code = generateShareCode(tune)
                    if (code) {
                      navigator.clipboard?.writeText(code).then(() => alert('分享码已复制到剪贴板')).catch(() => alert(code))
                    }
                  }} style={btnSmallStyle}>分享码</button>
                  <button onClick={() => startEdit(tune)} style={btnSmallStyle}>编辑</button>
                  <button
                    onClick={() => setActiveTuneById(tune.id)}
                    disabled={activeTuneLoading || (activeTune && activeTune.id === tune.id)}
                    style={{
                      ...btnSmallStyle,
                      background: (activeTune && activeTune.id === tune.id) ? 'rgba(35, 134, 54, 0.15)' : 'var(--bg-tertiary)',
                      borderColor: (activeTune && activeTune.id === tune.id) ? 'rgba(35, 134, 54, 0.3)' : 'var(--border)',
                      color: (activeTune && activeTune.id === tune.id) ? '#3fb950' : 'var(--text-primary)'
                    }}
                  >
                    {activeTune && activeTune.id === tune.id ? '活跃中' : '设为活跃'}
                  </button>
                  <button onClick={() => deleteTune(tune.id)} style={btnDangerSmallStyle}>删除</button>
                </div>
              </div>

              {/* 标签 */}
              {(tune.tags || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {tune.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)'
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 车辆信息 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 10,
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{ color: 'var(--text-muted)' }}>适用车辆:</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{getVehicleName(tune.vehicleId)}</span>
              </div>

              {/* Round 6: 调校与比赛关联统计 */}
              {tuneSessionStats[tune.id] && (() => {
                const st = tuneSessionStats[tune.id];
                return (
                  <div style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    marginBottom: 10,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 6,
                    fontSize: 10
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>比赛次数</div>
                      <div style={{ fontWeight: 700, color: '#58a6ff', fontFamily: 'monospace' }}>{st.count}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>最佳圈速</div>
                      <div style={{ fontWeight: 700, color: '#d29922', fontFamily: 'monospace' }}>
                        {st.bestLap < Infinity ? formatTime(st.bestLap) : '-'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>总圈数</div>
                      <div style={{ fontWeight: 700, color: '#3fb950', fontFamily: 'monospace' }}>{st.totalLaps}</div>
                    </div>
                    {/* Round 6: 跳转到比赛记录 */}
                    {st.sessions.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <button
                          onClick={() => onNavigate && onNavigate('sessions', { trackName: st.sessions[0].trackName })}
                          style={{ fontSize: 9, color: '#58a6ff', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 3, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          查看使用该调校的比赛记录 ({st.count}) &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 操作栏 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => toggleExpand(tune.id)}
                  style={btnSmallStyle}
                >
                  {expandedTune === tune.id ? '收起详情' : '展开详情'}
                </button>
              </div>

              {/* 详情展开区域 */}
              {expandedTune === tune.id && (() => {
                // Round 5: 计算调校默认值用于差异对比
                const tuneDefaultsForView = (() => {
                  try {
                    const parts = tune.parts || getDefaultParts()
                    const v = tune.vehicleId && vehicles[tune.vehicleId]
                    const stats = v ? (v.stats || v.carStats || null) : null
                    const raw = getTuneDefaults(parts, stats)
                    if (!raw) return {}
                    const mapped = {}
                    for (const [flatKey, value] of Object.entries(raw)) {
                      const path = TUNE_DEFAULT_KEY_MAP[flatKey]
                      if (path) mapped[`${path[0]}.${path[1]}`] = value
                    }
                    return mapped
                  } catch (e) { return {} }
                })()

                return (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  {/* 配件改装摘要 */}
                  {tune.parts && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: '#8b949e',
                        marginBottom: 8, borderBottom: '1px solid #21262d', paddingBottom: 4
                      }}>
                        改装配件
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                        {PART_CATEGORIES.map(cat => {
                          const part = tune.parts[cat.id]
                          const isStock = cat.tierSystem
                            ? (!part?.tier || part.tier === 'stock')
                            : (!part?.optionId || part.optionId === 'stock')
                          const partLabel = cat.tierSystem
                            ? (part?.tier ? (TIER_LABELS[part.tier]?.zh || part.tier) : cat.label)
                            : (cat.options?.find(o => o.id === part?.optionId)?.label || cat.label)
                          return (
                            <div key={cat.id} style={{
                              fontSize: 9,
                              color: isStock ? 'var(--text-muted)' : 'var(--text-primary)',
                              background: isStock ? 'transparent' : 'var(--bg-tertiary)',
                              padding: '3px 6px', borderRadius: 3,
                              display: 'flex', alignItems: 'center', gap: 3
                            }}>
                              <span>{cat.icon}</span>
                              <span style={{ fontWeight: isStock ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {partLabel}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Round 5: 轮胎参数 - 蓝色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #58a6ff', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#58a6ff', marginBottom: 8 }}>
                      轮胎参数
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前胎压" value={tune.tires?.frontPressure} unit="PSI" defaultValue={tuneDefaultsForView['tires.frontPressure']} />
                      <ParamItem label="后胎压" value={tune.tires?.rearPressure} unit="PSI" defaultValue={tuneDefaultsForView['tires.rearPressure']} />
                      <ParamItem label="前外倾角" value={tune.tires?.frontCamber} unit="deg" defaultValue={tuneDefaultsForView['tires.frontCamber']} />
                      <ParamItem label="后外倾角" value={tune.tires?.rearCamber} unit="deg" defaultValue={tuneDefaultsForView['tires.rearCamber']} />
                      <ParamItem label="前束角" value={tune.tires?.frontToe} unit="deg" defaultValue={tuneDefaultsForView['tires.frontToe']} />
                      <ParamItem label="后束角" value={tune.tires?.rearToe} unit="deg" defaultValue={tuneDefaultsForView['tires.rearToe']} />
                    </div>
                  </div>

                  {/* Round 5: 悬挂参数 - 橙色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #d29922', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#d29922', marginBottom: 8 }}>
                      悬挂参数
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前弹簧硬度" value={tune.suspension?.frontSpring} defaultValue={tuneDefaultsForView['suspension.frontSpring']} />
                      <ParamItem label="后弹簧硬度" value={tune.suspension?.rearSpring} defaultValue={tuneDefaultsForView['suspension.rearSpring']} />
                      <ParamItem label="前阻尼" value={tune.suspension?.frontDamping} defaultValue={tuneDefaultsForView['suspension.frontDamping']} />
                      <ParamItem label="后阻尼" value={tune.suspension?.rearDamping} defaultValue={tuneDefaultsForView['suspension.rearDamping']} />
                      <ParamItem label="前防倾杆" value={tune.suspension?.frontARB} defaultValue={tuneDefaultsForView['suspension.frontARB']} />
                      <ParamItem label="后防倾杆" value={tune.suspension?.rearARB} defaultValue={tuneDefaultsForView['suspension.rearARB']} />
                      <ParamItem label="前车身高度" value={tune.suspension?.frontRideHeight} unit="cm" defaultValue={tuneDefaultsForView['suspension.frontRideHeight']} />
                      <ParamItem label="后车身高度" value={tune.suspension?.rearRideHeight} unit="cm" defaultValue={tuneDefaultsForView['suspension.rearRideHeight']} />
                    </div>
                  </div>

                  {/* Round 5: 传动系统 - 绿色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #3fb950', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#3fb950', marginBottom: 8 }}>
                      传动系统
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="差速器加速" value={tune.drivetrain?.diffAccel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffAccel']} />
                      <ParamItem label="差速器减速" value={tune.drivetrain?.diffDecel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffDecel']} />
                      <ParamItem label="中央差速器" value={tune.drivetrain?.diffCenter} unit="%" defaultValue={tuneDefaultsForView['drivetrain.diffCenter']} />
                      <ParamItem label="终传比" value={tune.drivetrain?.finalDrive} defaultValue={tuneDefaultsForView['drivetrain.finalDrive']} />
                    </div>
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <ParamItem label="1档齿比" value={tune.drivetrain?.gear1} defaultValue={tuneDefaultsForView['drivetrain.gear1']} />
                      <ParamItem label="2档齿比" value={tune.drivetrain?.gear2} defaultValue={tuneDefaultsForView['drivetrain.gear2']} />
                      <ParamItem label="3档齿比" value={tune.drivetrain?.gear3} defaultValue={tuneDefaultsForView['drivetrain.gear3']} />
                      <ParamItem label="4档齿比" value={tune.drivetrain?.gear4} defaultValue={tuneDefaultsForView['drivetrain.gear4']} />
                      <ParamItem label="5档齿比" value={tune.drivetrain?.gear5} defaultValue={tuneDefaultsForView['drivetrain.gear5']} />
                      <ParamItem label="6档齿比" value={tune.drivetrain?.gear6} defaultValue={tuneDefaultsForView['drivetrain.gear6']} />
                    </div>
                  </div>

                  {/* Round 5: 空气动力学 - 紫色分区 */}
                  <div style={{ marginBottom: 12, borderLeft: '3px solid #bc8cff', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#bc8cff', marginBottom: 8 }}>
                      空气动力学
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="前下压力" value={tune.aero?.frontDownforce} unit="kg" defaultValue={tuneDefaultsForView['aero.frontDownforce']} />
                      <ParamItem label="后下压力" value={tune.aero?.rearDownforce} unit="kg" defaultValue={tuneDefaultsForView['aero.rearDownforce']} />
                    </div>
                  </div>

                  {/* Round 5: 调校笔记 */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', marginBottom: 6 }}>
                      调校笔记
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--text-primary)',
                      background: 'var(--bg-primary)', borderRadius: 4,
                      padding: 8, minHeight: 30, lineHeight: 1.6,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                    }}>
                      {tune.notes || '暂无笔记'}
                    </div>
                  </div>

                  {/* Round 8: 赛道表现 + 调校历史 */}
                  {tuneSessionStats[tune.id]?.sessions?.length > 0 && (() => {
                    const st = tuneSessionStats[tune.id];
                    const trackPerf = {};
                    st.sessions.forEach(s => {
                      if (!s.trackName) return;
                      if (!trackPerf[s.trackName]) {
                        trackPerf[s.trackName] = { count: 0, bestLap: Infinity, totalLaps: 0 };
                      }
                      const tp = trackPerf[s.trackName];
                      tp.count++;
                      tp.totalLaps += s.laps?.count || 0;
                      if (s.laps?.best > 0 && s.laps.best < tp.bestLap) {
                        tp.bestLap = s.laps.best;
                      }
                    });
                    const trackEntries = Object.entries(trackPerf)
                      .filter(([, v]) => v.bestLap < Infinity)
                      .sort((a, b) => a[1].bestLap - b[1].bestLap);

                    return (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#58a6ff', marginBottom: 6 }}>
                          赛道表现 ({trackEntries.length} 条赛道)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 6, fontSize: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <div>赛道</div>
                          <div style={{ textAlign: 'right' }}>最佳圈速</div>
                          <div style={{ textAlign: 'right' }}>次数</div>
                        </div>
                        {trackEntries.slice(0, 8).map(([track, perf]) => (
                          <div key={track} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 6, fontSize: 10, padding: '4px 0', borderBottom: '1px solid #21262d', alignItems: 'center' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track}</div>
                            <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#d29922' }}>{formatTime(perf.bestLap)}</div>
                            <div style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{perf.count}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      {/* Round 9: 配件升级解锁提示 toast */}
      {unlockToast && (
        <div style={{
          position: 'fixed', top: 70, right: 20, zIndex: 9999,
          background: 'rgba(63, 185, 80, 0.95)', color: '#fff',
          padding: '8px 16px', borderRadius: 6,
          fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'toastSlideIn 0.3s ease-out'
        }}>
          {unlockToast}
        </div>
      )}

      {showModal && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={{ ...modalContentStyle, maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {editingTune ? '编辑调校' : '新建调校'}
              </h2>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {telemetrySuggestions && (
              <div style={{
                background: 'rgba(210, 153, 34, 0.08)',
                border: '1px solid rgba(210, 153, 34, 0.45)',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 16,
                boxShadow: '0 0 12px rgba(210, 153, 34, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#d29922', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💡</span> 遥测诊断建议
                  </div>
                  <div style={{ fontSize: 10, color: '#c9d1d9', lineHeight: 1.4 }}>
                    针对您的车辆在「{telemetrySuggestions.trackName}」的「{telemetrySuggestions.problemName}」操控问题，推荐进行以下参数调整：
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 4 }}>
                      {Object.entries(telemetrySuggestions.changes).map(([paramKey, fix]) => {
                        const paramNames = {
                          frontTirePressure: '前胎压', rearTirePressure: '后胎压',
                          frontCamber: '前外倾角', rearCamber: '后外倾角',
                          frontToe: '前束角', rearToe: '后束角',
                          frontSpring: '前弹簧刚度', rearSpring: '后弹簧刚度',
                          frontDamping: '前阻尼压缩', rearDamping: '后阻尼压缩',
                          frontARB: '前防倾杆', rearARB: '后防倾杆',
                          frontRideHeight: '前车身高度', rearRideHeight: '后车身高度',
                          diffAccel: '差速器加速锁', diffDecel: '差速器减速锁',
                          diffCenter: '中央差速偏置', finalDrive: '终传比',
                          frontDownforce: '前下压力', rearDownforce: '后下压力',
                          brakeBias: '刹车偏置'
                        };
                        const paramName = paramNames[paramKey] || paramKey;
                        const unit = paramKey.includes('Pressure') ? ' PSI' : paramKey.includes('Height') ? ' cm' : paramKey.includes('Downforce') ? ' kg' : paramKey.includes('Camber') || paramKey.includes('Toe') ? '°' : paramKey.includes('diff') || paramKey.includes('Bias') ? '%' : '';
                        const deltaText = fix.delta > 0 ? `+${fix.delta}` : `${fix.delta}`;
                        return (
                          <span key={paramKey} style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontFamily: 'monospace', color: '#bc8cff' }}>
                            {paramName}: {deltaText}{unit}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => applyTelemetrySuggestions(telemetrySuggestions)}
                    style={{
                      padding: '4px 10px',
                      background: '#d29922',
                      border: 'none',
                      borderRadius: 4,
                      color: '#0d1117',
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(210, 153, 34, 0.3)'
                    }}
                  >
                    一键预填建议
                  </button>
                  <button
                    type="button"
                    onClick={() => setTelemetrySuggestions(null)}
                    style={{
                      padding: '4px 8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid #30363d',
                      borderRadius: 4,
                      color: '#8b949e',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    忽略
                  </button>
                </div>
              </div>
            )}

            {/* 基本信息 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>调校名称</label>
              <input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: 公路赛高速调校"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>标签（用逗号分隔）</label>
                <input
                  value={formData.tags}
                  onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="公路, 漂移, 拉力..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>适用车辆</label>
                <select
                  value={formData.vehicleId}
                  onChange={e => setFormData(prev => ({ ...prev, vehicleId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">未指定</option>
                  {vehicleOptions.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Round 5: 调校笔记 */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>调校笔记</label>
              <textarea
                value={formData.notes || ''}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="记录这个调校的特点、适用场景、调校思路等..."
                rows={3}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  lineHeight: 1.6,
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* 自由改装模式与智能改装向导 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 12px', background: 'rgba(56, 139, 253, 0.1)', border: '1px solid rgba(56, 139, 253, 0.3)', borderRadius: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#58a6ff' }}>自由改装模式</span>
                <span style={{ fontSize: 9, color: '#8b949e' }}>开启后解除配件解锁限制，直接开启全部调校参数（原厂参数直接调校）</span>
              </div>
              <input
                type="checkbox"
                checked={formData.freeMode || false}
                onChange={e => setFormData(prev => ({ ...prev, freeMode: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
            </div>

            <div style={{
              background: 'rgba(35, 134, 54, 0.08)',
              border: '1px solid rgba(35, 134, 54, 0.3)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#56d364', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚡ 智能改装向导</span>
                <span style={{ fontSize: 9, color: '#8b949e', fontWeight: 400 }}>一键填充符合地平线5 Meta 的基准调校与改装</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 2, fontSize: 9 }}>赛事类型</label>
                  <select id="presetRaceType" style={{ ...inputStyle, padding: '4px 6px', fontSize: 10, height: 26 }} defaultValue="road">
                    <option value="road">公路赛/街头赛 (高下压力/硬避震)</option>
                    <option value="dirt">泥地赛 (拉力避震/拉力胎/AWD)</option>
                    <option value="cross_country">越野赛 (最大高度/软避震/AWD)</option>
                    <option value="drift">漂移赛 (大前外倾/双100%锁/漂移避震)</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 2, fontSize: 9 }}>目标 PI 等级</label>
                  <select id="presetPiClass" style={{ ...inputStyle, padding: '4px 6px', fontSize: 10, height: 26 }} defaultValue="A">
                    <option value="D">D 500</option>
                    <option value="C">C 600</option>
                    <option value="B">B 700</option>
                    <option value="A">A 800</option>
                    <option value="S1">S1 900</option>
                    <option value="S2">S2 998</option>
                    <option value="X">X 999</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const type = document.getElementById('presetRaceType').value;
                    const pi = document.getElementById('presetPiClass').value;
                    if (window.confirm('一键生成会覆盖当前的改装配件和调校值，确定生成吗？')) {
                      applyPresetTune(type, pi);
                    }
                  }}
                  style={{ ...btnPrimaryStyle, padding: '4px 10px', fontSize: 10, height: 26, background: '#238636', borderColor: '#3fb950' }}
                >
                  生成向导方案
                </button>
              </div>
            </div>

            {/* Round 7: 配件推荐引擎 */}
            {formData.vehicleId && (
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                border: '1px solid var(--border)'
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#bc8cff',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>配件推荐</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>基于车辆类型和赛道特性</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                  {(() => {
                    const v = vehicles[formData.vehicleId];
                    const driveType = v?.driveType || v?.drivetrain || 'AWD';
                    const vClass = v?.class || 3;
                    const recommendations = [];
                    // 基于驱动类型的推荐
                    if (driveType === 'FWD') {
                      recommendations.push({ cat: ' diffs', text: '前驱车推荐较硬前弹簧和高前防倾杆，减少转向不足', color: '#58a6ff' });
                      recommendations.push({ cat: ' tires', text: '前驱车前轮承载更多，建议略高前胎压(32-34PSI)', color: '#58a6ff' });
                    } else if (driveType === 'RWD') {
                      recommendations.push({ cat: ' diffs', text: '后驱车推荐较低的差速器减速设定(15-30%)，增强弯中稳定性', color: '#3fb950' });
                      recommendations.push({ cat: ' diffs', text: '后驱车建议后弹簧比前弹簧略软，提升后轮抓地力', color: '#3fb950' });
                    } else if (driveType === 'AWD') {
                      recommendations.push({ cat: ' diffs', text: '全驱车推荐中等差速器设定(40-60%)，平衡加速和弯道表现', color: '#d29922' });
                    }
                    // 基于等级的推荐
                    if (vClass >= 5) {
                      recommendations.push({ cat: ' aero', text: '高等级(S1/S2)车辆建议加大下压力，优先增加后下压力', color: '#bc8cff' });
                      recommendations.push({ cat: ' brakes', text: '高速赛道建议升级刹车套件至赛用级别', color: '#f85149' });
                    } else if (vClass <= 2) {
                      recommendations.push({ cat: ' power', text: '低等级车辆建议优先升级引擎和进气，提升基础马力', color: '#3fb950' });
                    }
                    // 通用推荐
                    recommendations.push({ cat: ' general', text: '大多数赛道推荐中等偏硬的弹簧设定(6-14)，兼顾弯道支撑和路面颠簸吸收', color: 'var(--text-secondary)' });
                    return recommendations.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 8px', background: r.color + '08',
                        border: `1px solid ${r.color}22`,
                        borderRadius: 4
                      }}>
                        <span style={{ color: r.color, fontWeight: 700, flexShrink: 0 }}>{r.cat}</span>
                        <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{r.text}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* PI锁定区域 */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              border: '1px solid var(--border)'
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#d29922',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>PI 锁定区域</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: totalPi > targetPi ? '#da3633' : 'var(--success)'
                }}>
                  总PI: {totalPi} / {targetPi}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>基础PI</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {basePi}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>配件PI增量</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: partsPiDelta > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    +{partsPiDelta}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>总PI</div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, fontFamily: 'monospace',
                    color: totalPi > targetPi ? '#da3633' : 'var(--text-primary)'
                  }}>
                    {totalPi}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>目标PI上限</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range"
                      min={basePi}
                      max={1000}
                      step={1}
                      value={targetPi}
                      onChange={e => setTargetPi(parseInt(e.target.value))}
                      style={{ flex: 1, accentColor: '#d29922' }}
                    />
                    <input
                      type="number"
                      min={basePi}
                      max={1000}
                      value={targetPi}
                      onChange={e => {
                        const val = parseInt(e.target.value)
                        if (val >= basePi && val <= 1000) setTargetPi(val)
                      }}
                      style={{ ...inputStyle, width: 70, textAlign: 'center' }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleAutoUpgrade}
                  disabled={autoUpgradeLoading || totalPi >= targetPi}
                  style={{
                    ...btnPrimaryStyle,
                    background: autoUpgradeLoading ? '#484f58' : (totalPi >= targetPi ? '#484f58' : '#d29922'),
                    whiteSpace: 'nowrap',
                    marginTop: 14
                  }}
                >
                  {autoUpgradeLoading ? '升级中...' : (totalPi >= targetPi ? '已达上限' : '一键升级')}
                </button>
              </div>
              {totalPi > targetPi && (
                <div style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  background: 'rgba(218, 54, 51, 0.12)',
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#da3633'
                }}>
                  当前PI已超出目标上限 {totalPi - targetPi} 点，请降低配件等级或提高PI上限
                </div>
              )}
            </div>

            {/* 配件改装区域 */}
            <div style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              border: '1px solid var(--border)'
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>改装配件</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {PART_CATEGORIES.filter(c => {
                    const p = formData.parts[c.id]
                    if (c.tierSystem) return p?.tier && p.tier !== 'stock'
                    return p?.optionId && p.optionId !== 'stock'
                  }).length} 项改装
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8
              }}>
                {PART_CATEGORIES.map(cat => {
                  const selectedPart = formData.parts[cat.id]
                  return <PartSelector
                    key={cat.id}
                    category={cat}
                    selected={selectedPart}
                    onChange={(tier, optionId) => updatePartSelection(cat.id, tier, optionId)}
                  />
                })}
              </div>
            </div>

            {/* 轮胎参数 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('tires')}>
                <span>{collapsedSections.has('tires') ? '▶ ' : '▼ '}轮胎参数</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('tires.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('tires') && <div style={formGridStyle}>
                <NumberInput
                  label="前胎压"
                  value={formData.tires.frontPressure}
                  onChange={v => updateFormField('tires', 'frontPressure', v)}
                  min={tuneConstraints['tires.frontPressure']?.min ?? 20}
                  max={tuneConstraints['tires.frontPressure']?.max ?? 40}
                  step={0.1}
                  unit="PSI"
                  locked={tuneConstraints['tires.frontPressure']?.locked}
                  {...ni('tires', 'frontPressure')}
                />
                <NumberInput
                  label="后胎压"
                  value={formData.tires.rearPressure}
                  onChange={v => updateFormField('tires', 'rearPressure', v)}
                  min={tuneConstraints['tires.rearPressure']?.min ?? 20}
                  max={tuneConstraints['tires.rearPressure']?.max ?? 40}
                  step={0.1}
                  unit="PSI"
                  locked={tuneConstraints['tires.rearPressure']?.locked}
                  {...ni('tires', 'rearPressure')}
                />
                <NumberInput
                  label="前外倾角"
                  value={formData.tires.frontCamber}
                  onChange={v => updateFormField('tires', 'frontCamber', v)}
                  min={tuneConstraints['tires.frontCamber']?.min ?? -5}
                  max={tuneConstraints['tires.frontCamber']?.max ?? 0}
                  step={tuneConstraints['tires.frontCamber']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.frontCamber']?.locked}
                  {...ni('tires', 'frontCamber')}
                />
                <NumberInput
                  label="后外倾角"
                  value={formData.tires.rearCamber}
                  onChange={v => updateFormField('tires', 'rearCamber', v)}
                  min={tuneConstraints['tires.rearCamber']?.min ?? -5}
                  max={tuneConstraints['tires.rearCamber']?.max ?? 0}
                  step={tuneConstraints['tires.rearCamber']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.rearCamber']?.locked}
                  {...ni('tires', 'rearCamber')}
                />
                <NumberInput
                  label="前束角"
                  value={formData.tires.frontToe}
                  onChange={v => updateFormField('tires', 'frontToe', v)}
                  min={tuneConstraints['tires.frontToe']?.min ?? -0.5}
                  max={tuneConstraints['tires.frontToe']?.max ?? 0.5}
                  step={tuneConstraints['tires.frontToe']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.frontToe']?.locked}
                  {...ni('tires', 'frontToe')}
                />
                <NumberInput
                  label="后束角"
                  value={formData.tires.rearToe}
                  onChange={v => updateFormField('tires', 'rearToe', v)}
                  min={tuneConstraints['tires.rearToe']?.min ?? -0.5}
                  max={tuneConstraints['tires.rearToe']?.max ?? 0.5}
                  step={tuneConstraints['tires.rearToe']?.step ?? 0.1}
                  unit="°"
                  locked={tuneConstraints['tires.rearToe']?.locked}
                  {...ni('tires', 'rearToe')}
                />
              </div>}
            </div>

            {/* 悬挂参数 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('suspension')}>
                <span>{collapsedSections.has('suspension') ? '▶ ' : '▼ '}悬挂参数</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('suspension.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('suspension') && <div style={formGridStyle}>
                <NumberInput
                  label="前弹簧硬度"
                  value={formData.suspension.frontSpring}
                  onChange={v => updateFormField('suspension', 'frontSpring', v)}
                  min={tuneConstraints['suspension.frontSpring']?.min ?? 1}
                  max={tuneConstraints['suspension.frontSpring']?.max ?? 100}
                  step={tuneConstraints['suspension.frontSpring']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontSpring']?.locked}
                  {...ni('suspension', 'frontSpring')}
                />
                <NumberInput
                  label="后弹簧硬度"
                  value={formData.suspension.rearSpring}
                  onChange={v => updateFormField('suspension', 'rearSpring', v)}
                  min={tuneConstraints['suspension.rearSpring']?.min ?? 1}
                  max={tuneConstraints['suspension.rearSpring']?.max ?? 100}
                  step={tuneConstraints['suspension.rearSpring']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearSpring']?.locked}
                  {...ni('suspension', 'rearSpring')}
                />
                <NumberInput
                  label="前阻尼"
                  value={formData.suspension.frontDamping}
                  onChange={v => updateFormField('suspension', 'frontDamping', v)}
                  min={tuneConstraints['suspension.frontDamping']?.min ?? 1}
                  max={tuneConstraints['suspension.frontDamping']?.max ?? 20}
                  step={tuneConstraints['suspension.frontDamping']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontDamping']?.locked}
                  {...ni('suspension', 'frontDamping')}
                />
                <NumberInput
                  label="后阻尼"
                  value={formData.suspension.rearDamping}
                  onChange={v => updateFormField('suspension', 'rearDamping', v)}
                  min={tuneConstraints['suspension.rearDamping']?.min ?? 1}
                  max={tuneConstraints['suspension.rearDamping']?.max ?? 20}
                  step={tuneConstraints['suspension.rearDamping']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearDamping']?.locked}
                  {...ni('suspension', 'rearDamping')}
                />
                <NumberInput
                  label="前防倾杆"
                  value={formData.suspension.frontARB}
                  onChange={v => updateFormField('suspension', 'frontARB', v)}
                  min={tuneConstraints['suspension.frontARB']?.min ?? 1}
                  max={tuneConstraints['suspension.frontARB']?.max ?? 50}
                  step={tuneConstraints['suspension.frontARB']?.step ?? 1}
                  locked={tuneConstraints['suspension.frontARB']?.locked}
                  {...ni('suspension', 'frontARB')}
                />
                <NumberInput
                  label="后防倾杆"
                  value={formData.suspension.rearARB}
                  onChange={v => updateFormField('suspension', 'rearARB', v)}
                  min={tuneConstraints['suspension.rearARB']?.min ?? 1}
                  max={tuneConstraints['suspension.rearARB']?.max ?? 50}
                  step={tuneConstraints['suspension.rearARB']?.step ?? 1}
                  locked={tuneConstraints['suspension.rearARB']?.locked}
                  {...ni('suspension', 'rearARB')}
                />
                <NumberInput
                  label="前车身高度"
                  value={formData.suspension.frontRideHeight}
                  onChange={v => updateFormField('suspension', 'frontRideHeight', v)}
                  min={tuneConstraints['suspension.frontRideHeight']?.min ?? 3}
                  max={tuneConstraints['suspension.frontRideHeight']?.max ?? 20}
                  step={tuneConstraints['suspension.frontRideHeight']?.step ?? 1}
                  unit="cm"
                  locked={tuneConstraints['suspension.frontRideHeight']?.locked}
                  {...ni('suspension', 'frontRideHeight')}
                />
                <NumberInput
                  label="后车身高度"
                  value={formData.suspension.rearRideHeight}
                  onChange={v => updateFormField('suspension', 'rearRideHeight', v)}
                  min={tuneConstraints['suspension.rearRideHeight']?.min ?? 3}
                  max={tuneConstraints['suspension.rearRideHeight']?.max ?? 20}
                  step={tuneConstraints['suspension.rearRideHeight']?.step ?? 1}
                  unit="cm"
                  locked={tuneConstraints['suspension.rearRideHeight']?.locked}
                  {...ni('suspension', 'rearRideHeight')}
                />
              </div>}
            </div>

            {/* 传动系统 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('drivetrain')}>
                <span>{collapsedSections.has('drivetrain') ? '▶ ' : '▼ '}传动系统</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('drivetrain.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('drivetrain') && <>
                <div style={formGridStyle}>
                <NumberInput
                  label="差速器加速"
                  value={formData.drivetrain.diffAccel}
                  onChange={v => updateFormField('drivetrain', 'diffAccel', v)}
                  min={tuneConstraints['drivetrain.diffAccel']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffAccel']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffAccel']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffAccel']?.locked}
                  {...ni('drivetrain', 'diffAccel')}
                />
                <NumberInput
                  label="差速器减速"
                  value={formData.drivetrain.diffDecel}
                  onChange={v => updateFormField('drivetrain', 'diffDecel', v)}
                  min={tuneConstraints['drivetrain.diffDecel']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffDecel']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffDecel']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffDecel']?.locked}
                  {...ni('drivetrain', 'diffDecel')}
                />
                <NumberInput
                  label="中央差速器"
                  value={formData.drivetrain.diffCenter}
                  onChange={v => updateFormField('drivetrain', 'diffCenter', v)}
                  min={tuneConstraints['drivetrain.diffCenter']?.min ?? 0}
                  max={tuneConstraints['drivetrain.diffCenter']?.max ?? 100}
                  step={tuneConstraints['drivetrain.diffCenter']?.step ?? 1}
                  unit="%"
                  locked={tuneConstraints['drivetrain.diffCenter']?.locked}
                  {...ni('drivetrain', 'diffCenter')}
                />
                <NumberInput
                  label="终传比"
                  value={formData.drivetrain.finalDrive}
                  onChange={v => updateFormField('drivetrain', 'finalDrive', v)}
                  min={tuneConstraints['drivetrain.finalDrive']?.min ?? 2.0}
                  max={tuneConstraints['drivetrain.finalDrive']?.max ?? 6.0}
                  step={tuneConstraints['drivetrain.finalDrive']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.finalDrive']?.locked}
                  {...ni('drivetrain', 'finalDrive')}
                />
              </div>
              <div style={{ ...formGridStyle, marginTop: 8, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <NumberInput
                  label="1档齿比"
                  value={formData.drivetrain.gear1}
                  onChange={v => updateFormField('drivetrain', 'gear1', v)}
                  min={tuneConstraints['drivetrain.gear1']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear1']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear1']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear1']?.locked}
                  {...ni('drivetrain', 'gear1')}
                />
                <NumberInput
                  label="2档齿比"
                  value={formData.drivetrain.gear2}
                  onChange={v => updateFormField('drivetrain', 'gear2', v)}
                  min={tuneConstraints['drivetrain.gear2']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear2']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear2']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear2']?.locked}
                  {...ni('drivetrain', 'gear2')}
                />
                <NumberInput
                  label="3档齿比"
                  value={formData.drivetrain.gear3}
                  onChange={v => updateFormField('drivetrain', 'gear3', v)}
                  min={tuneConstraints['drivetrain.gear3']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear3']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear3']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear3']?.locked}
                  {...ni('drivetrain', 'gear3')}
                />
                <NumberInput
                  label="4档齿比"
                  value={formData.drivetrain.gear4}
                  onChange={v => updateFormField('drivetrain', 'gear4', v)}
                  min={tuneConstraints['drivetrain.gear4']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear4']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear4']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear4']?.locked}
                  {...ni('drivetrain', 'gear4')}
                />
                <NumberInput
                  label="5档齿比"
                  value={formData.drivetrain.gear5}
                  onChange={v => updateFormField('drivetrain', 'gear5', v)}
                  min={tuneConstraints['drivetrain.gear5']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear5']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear5']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear5']?.locked}
                  {...ni('drivetrain', 'gear5')}
                />
                <NumberInput
                  label="6档齿比"
                  value={formData.drivetrain.gear6}
                  onChange={v => updateFormField('drivetrain', 'gear6', v)}
                  min={tuneConstraints['drivetrain.gear6']?.min ?? 0.5}
                  max={tuneConstraints['drivetrain.gear6']?.max ?? 5.0}
                  step={tuneConstraints['drivetrain.gear6']?.step ?? 0.01}
                  locked={tuneConstraints['drivetrain.gear6']?.locked}
                  {...ni('drivetrain', 'gear6')}
                />
              </div>
              </>}
            </div>

            {/* 空气动力学 */}
            <div style={formSectionStyle}>
              <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection('aero')}>
                <span>{collapsedSections.has('aero') ? '▶ ' : '▼ '}空气动力学</span>
                {Object.keys(tuneDefaults).some(k => k.startsWith('aero.')) && (
                  <button onClick={resetAllToDefaults} style={{ ...btnSmallStyle, padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                    重置为推荐值
                  </button>
                )}
              </div>
              {!collapsedSections.has('aero') && <div style={formGridStyle}>
                <NumberInput
                  label="前下压力"
                  value={formData.aero.frontDownforce}
                  onChange={v => updateFormField('aero', 'frontDownforce', v)}
                  min={tuneConstraints['aero.frontDownforce']?.min ?? 0}
                  max={tuneConstraints['aero.frontDownforce']?.max ?? 500}
                  step={tuneConstraints['aero.frontDownforce']?.step ?? 1}
                  unit="kg"
                  locked={tuneConstraints['aero.frontDownforce']?.locked}
                  {...ni('aero', 'frontDownforce')}
                />
                <NumberInput
                  label="后下压力"
                  value={formData.aero.rearDownforce}
                  onChange={v => updateFormField('aero', 'rearDownforce', v)}
                  min={tuneConstraints['aero.rearDownforce']?.min ?? 0}
                  max={tuneConstraints['aero.rearDownforce']?.max ?? 500}
                  step={tuneConstraints['aero.rearDownforce']?.step ?? 1}
                  unit="kg"
                  locked={tuneConstraints['aero.rearDownforce']?.locked}
                  {...ni('aero', 'rearDownforce')}
                />
              </div>}
            </div>

            {/* 常用驾驶问题面板 + 遥测诊断面板 - 并排显示 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* 常用驾驶问题面板 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                border: '1px solid var(--border)'
              }}>
                <div
                  onClick={() => setDrivingProblemsOpen(!drivingProblemsOpen)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#58a6ff',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                  }}
                >
                  <span>常见问题调校</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{drivingProblemsOpen ? '▲ 收起' : '▼ 展开'}</span>
                </div>

                {drivingProblemsOpen && (
                  <div style={{ marginTop: 10 }}>
                    {/* 分类筛选 */}
                    <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Array.isArray(DRIVING_PROBLEMS) && (() => {
                        const categories = [...new Set(DRIVING_PROBLEMS.map(p => p.category).filter(Boolean))]
                        return categories.map(cat => {
                          const catInfo = PROBLEM_CATEGORIES.find(c => c.id === cat)
                          const label = catInfo?.label || cat
                          const color = catInfo?.color || 'var(--text-secondary)'
                          return (
                            <span key={cat} style={{
                              fontSize: 9,
                              padding: '2px 6px',
                              borderRadius: 3,
                              background: `${color}18`,
                              color,
                              border: `1px solid ${color}40`
                            }}>
                              {label}
                            </span>
                          )
                        })
                      })()}
                    </div>

                    {/* 问题列表 */}
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      {Array.isArray(DRIVING_PROBLEMS) && DRIVING_PROBLEMS.map((problem, idx) => (
                        <div key={idx} style={{ marginBottom: 4 }}>
                          <div
                            onClick={() => setSelectedProblem(selectedProblem === idx ? null : idx)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 4,
                              background: selectedProblem === idx ? 'rgba(88, 166, 255, 0.12)' : 'var(--bg-secondary)',
                              border: `1px solid ${selectedProblem === idx ? 'rgba(88, 166, 255, 0.3)' : 'var(--border)'}`,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {problem.name || problem.problem}
                              </div>
                              {problem.category && (
                                <div style={{ fontSize: 8, marginTop: 1 }}>
                                  {(() => {
                                    const catInfo = PROBLEM_CATEGORIES.find(c => c.id === problem.category)
                                    const catLabel = catInfo?.label || problem.category
                                    const catColor = catInfo?.color || 'var(--text-muted)'
                                    return <span style={{ color: catColor }}>{catLabel}</span>
                                  })()}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                              {selectedProblem === idx ? '▲' : '▼'}
                            </span>
                          </div>

                          {selectedProblem === idx && (
                            <div style={{
                              marginTop: 4,
                              padding: '8px 10px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: 4,
                              border: '1px solid var(--border)',
                              fontSize: 10
                            }}>
                              {problem.symptoms && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>症状</div>
                                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                    {problem.symptoms}
                                  </div>
                                </div>
                              )}
                              {problem.description && (
                                <div style={{ marginBottom: 6 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>问题描述</div>
                                  <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                    {problem.description}
                                  </div>
                                </div>
                              )}
                              {(problem.suggestedChanges || problem.fixes) && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, fontSize: 9 }}>建议修改</div>
                                  {problem.fixes ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                      {Object.entries(problem.fixes).map(([param, fix]) => (
                                        <div key={param} style={{
                                          padding: '2px 6px',
                                          background: 'var(--bg-primary)',
                                          borderRadius: 3,
                                          fontSize: 8,
                                          fontFamily: 'monospace',
                                          color: fix.delta > 0 ? '#3fb950' : '#f85149'
                                        }}>
                                          {param}: {fix.delta > 0 ? '+' : ''}{fix.delta}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                                      {Object.entries(problem.suggestedChanges).map(([cat, params]) =>
                                        Object.entries(params).map(([key, val]) => (
                                          <div key={`${cat}.${key}`} style={{
                                            padding: '2px 6px',
                                            background: 'var(--bg-primary)',
                                            borderRadius: 3,
                                            fontSize: 8,
                                            fontFamily: 'monospace',
                                            color: 'var(--accent)'
                                          }}>
                                            {key}: {val}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(problem.suggestedChanges || problem.fixes) && (
                                <button
                                  onClick={() => applyProblemFix(problem)}
                                  style={{
                                    ...btnSmallStyle,
                                    width: '100%',
                                    background: 'rgba(88, 166, 255, 0.15)',
                                    borderColor: 'rgba(88, 166, 255, 0.3)',
                                    color: '#58a6ff',
                                    fontWeight: 600
                                  }}
                                >
                                  应用此建议
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 遥测诊断面板 */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 8,
                padding: 12,
                border: '1px solid var(--border)'
              }}>
                <div
                  onClick={() => {
                    setTelemetryPanelOpen(!telemetryPanelOpen)
                    if (!telemetryPanelOpen) loadTelemetrySessions()
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#3fb950',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none'
                  }}
                >
                  <span>遥测诊断</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{telemetryPanelOpen ? '▲ 收起' : '▼ 展开'}</span>
                </div>

                {telemetryPanelOpen && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>选择遥测Session</label>
                      <select
                        value={selectedSessionId}
                        onChange={e => {
                          setSelectedSessionId(e.target.value)
                          setDiagnosisResult(null)
                        }}
                        style={inputStyle}
                      >
                        <option value="">-- 请选择 --</option>
                        {availableSessions.map(session => (
                          <option key={session.id} value={session.id}>
                            {session.track || '未知赛道'} - {session.car || '未知车辆'} ({formatDate(session.date || session.createdAt)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={runTelemetryDiagnosis}
                      disabled={!selectedSessionId || diagnosing}
                      style={{
                        ...btnPrimaryStyle,
                        width: '100%',
                        background: diagnosing ? '#484f58' : '#238636',
                        marginBottom: 10
                      }}
                    >
                      {diagnosing ? '诊断中...' : '开始诊断'}
                    </button>

                    {diagnosisResult && (
                      <div style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        maxHeight: 350,
                        overflow: 'auto'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>
                          诊断结果
                        </div>
                        {diagnosisResult.summary && (
                          <div style={{
                            fontSize: 10,
                            color: 'var(--text-secondary)',
                            marginBottom: 8,
                            lineHeight: 1.5,
                            padding: '6px 8px',
                            background: diagnosisResult.issues && diagnosisResult.issues.length > 0
                              ? 'rgba(210, 153, 34, 0.1)' : 'rgba(35, 134, 54, 0.1)',
                            borderRadius: 4
                          }}>
                            {diagnosisResult.summary}
                          </div>
                        )}

                        {diagnosisResult.issues && diagnosisResult.issues.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>发现的问题</div>
                            {diagnosisResult.issues.map((issue, idx) => (
                              <div key={idx} style={{
                                fontSize: 10,
                                color: 'var(--text-primary)',
                                padding: '4px 8px',
                                marginBottom: 3,
                                background: 'var(--bg-primary)',
                                borderRadius: 3,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}>
                                <span style={{ color: issue.severity === 'high' ? '#da3633' : '#d29922', fontSize: 10 }}>
                                  {issue.severity === 'high' ? '!!' : '!'}
                                </span>
                                <span>{issue.description || issue.message || issue}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>建议的参数修改</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                              {Object.entries(diagnosisResult.suggestedChanges).map(([cat, params]) =>
                                Object.entries(params).map(([key, val]) => (
                                  <div key={`${cat}.${key}`} style={{
                                    padding: '2px 6px',
                                    background: 'var(--bg-primary)',
                                    borderRadius: 3,
                                    fontSize: 8,
                                    fontFamily: 'monospace',
                                    color: 'var(--accent)'
                                  }}>
                                    {key}: {val}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                          <button
                            onClick={applyDiagnosisFix}
                            style={{
                              ...btnSmallStyle,
                              width: '100%',
                              background: 'rgba(63, 185, 80, 0.15)',
                              borderColor: 'rgba(63, 185, 80, 0.3)',
                              color: '#3fb950',
                              fontWeight: 600
                            }}
                          >
                            应用全部建议
                          </button>
                        )}
                        {/* Round 2: 重新诊断按钮 */}
                        <button
                          onClick={runTelemetryDiagnosis}
                          disabled={!selectedSessionId || diagnosing}
                          style={{
                            ...btnSmallStyle,
                            width: '100%',
                            marginTop: 4,
                            background: 'rgba(88, 166, 255, 0.15)',
                            borderColor: 'rgba(88, 166, 255, 0.3)',
                            color: '#58a6ff',
                            fontWeight: 600
                          }}
                        >
                          {diagnosing ? '诊断中...' : '重新诊断'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button onClick={saveTune} disabled={loading} style={{ ...btnPrimaryStyle, width: '100%', marginTop: 8 }}>
              {loading ? '保存中...' : (editingTune ? '保存修改' : '创建调校')}
            </button>
            {/* Round 9: 快捷键提示 */}
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center', lineHeight: 1.6 }}>
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Esc</span> 关闭 &nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+S</span> 保存 &nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+D</span> 复制调校
            </div>
          </div>
        </div>
      )}

      {/* 分享码弹窗 */}
      {shareCodeModal && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { setShareCodeModal(null); setImportPreview(null); } }}>
          <div style={{ ...modalContentStyle, maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>通过分享码导入调校</h2>
              <button onClick={() => { setShareCodeModal(null); setImportPreview(null); }} style={{ ...btnSmallStyle, border: 'none' }}>关闭</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>分享码</label>
              <textarea
                id="shareCodeInput"
                placeholder="粘贴分享码..."
                rows={4}
                style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (!code.trim()) return
                  // Round 4: 先预览
                  const preview = parseShareCode(code.trim())
                  if (preview && preview.error) {
                    alert(preview.error)
                  } else if (preview) {
                    setImportPreview(preview)
                  } else {
                    alert('分享码无效')
                  }
                }}
                style={{ ...btnSmallStyle, flex: 1, background: 'rgba(88, 166, 255, 0.15)', borderColor: 'rgba(88, 166, 255, 0.3)', color: '#58a6ff', fontWeight: 600 }}
              >
                预览调校
              </button>
              <button
                onClick={() => {
                  const code = document.getElementById('shareCodeInput').value
                  if (code.trim()) importFromShareCode(code.trim())
                }}
                style={{ ...btnPrimaryStyle, flex: 1 }}
              >
                直接导入
              </button>
            </div>

            {/* Round 4: 导入预览面板 */}
            {importPreview && (
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 6, padding: 10,
                border: '1px solid var(--border)',
                maxHeight: 350, overflow: 'auto'
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>
                  调校预览: {importPreview.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                  <div style={{ color: 'var(--text-secondary)' }}>车辆</div>
                  <div style={{ color: 'var(--text-primary)' }}>{importPreview.vehicleId || '未指定'}</div>

                  <div style={{ color: 'var(--text-secondary)', marginTop: 6 }}>轮胎参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9, marginTop: 6 }}>
                    {importPreview.tires ? Object.entries(importPreview.tires).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>悬挂参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.suspension ? Object.entries(importPreview.suspension).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>传动参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.drivetrain ? Object.entries(importPreview.drivetrain).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>

                  <div style={{ color: 'var(--text-secondary)' }}>空力参数</div>
                  <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 9 }}>
                    {importPreview.aero ? Object.entries(importPreview.aero).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ') : '-'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const code = document.getElementById('shareCodeInput').value
                    if (code.trim()) importFromShareCode(code.trim())
                  }}
                  style={{
                    ...btnPrimaryStyle, width: '100%', marginTop: 10
                  }}
                >
                  确认导入
                </button>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              提示：在调校卡片上点击"分享码"按钮即可复制该调校的分享码。支持中文调校名称。
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes paramHighlight { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 12px rgba(63,185,80,0.8); } }
      `}</style>
    </div>
  )
}

const ParamItem = React.memo(function ParamItem({ label, value, unit = '', defaultValue }) {
  const displayValue = value !== undefined && value !== null ? value : '-'
  const diff = defaultValue !== undefined && value !== undefined && value !== null && value !== defaultValue ? value - defaultValue : null
  const diffStr = diff !== null
    ? (diff > 0 ? '+' : '') + (Number.isInteger(diff) ? diff : diff.toFixed(2))
    : null
  const diffColor = diff !== null
    ? (label.includes('束角') || label.includes('Toe')
        ? (Math.abs(value) < Math.abs(defaultValue) ? '#3fb950' : '#f85149')
        : '#d29922')
    : 'inherit'

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 4,
      padding: '6px 8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
          {displayValue}{unit}
        </span>
        {diffStr && (
          <span style={{
            fontSize: 8, fontWeight: 600, fontFamily: 'monospace',
            color: diffColor,
            background: diffColor === '#3fb950' ? 'rgba(63,185,80,0.12)' : (diffColor === '#f85149' ? 'rgba(248,81,73,0.12)' : 'rgba(210,153,34,0.12)'),
            padding: '0 3px', borderRadius: 2
          }}>
            {diffStr}
          </span>
        )}
      </div>
    </div>
  )
});

const NumberInput = React.memo(function NumberInput({ label, value, onChange, min, max, step, unit = '', locked = false, lockedHint = '', defaultValue, highlighted = false, onResetDefault, suggestedValue }) {
  const handleChange = (e) => {
    if (locked) return
    const raw = e.target.value
    if (raw === '' || raw === '-') {
      onChange(raw)
      return
    }
    const num = parseFloat(raw)
    if (isNaN(num)) return
    onChange(num)
  }

  const handleBlur = () => {
    if (locked) return
    if (value === '' || value === '-') {
      onChange(min)
      return
    }
    let num = parseFloat(value)
    if (isNaN(num)) num = min
    if (num < min) num = min
    if (num > max) num = max
    onChange(num)
  }

  const isOffDefault = defaultValue !== undefined && value !== undefined && parseFloat(value) !== parseFloat(defaultValue)

  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>
        {label} {unit && <span style={{ color: 'var(--text-muted)' }}>({unit})</span>}
        {locked && <span style={{ color: '#da3633', marginLeft: 4, fontSize: 9, fontWeight: 400 }} title={lockedHint}>🔒 {lockedHint || '需升级'}</span>}
        {highlighted && <span style={{ color: '#d29922', marginLeft: 4, fontSize: 9, fontWeight: 600 }}>遥测推荐</span>}
      </label>
      {suggestedValue !== undefined && !locked ? (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>遥测预填建议: {suggestedValue}</span>
          <span style={{ color: 'var(--text-muted)' }}>(差值: {Number((parseFloat(value) - suggestedValue).toFixed(2)) > 0 ? `+${(parseFloat(value) - suggestedValue).toFixed(2)}` : (parseFloat(value) - suggestedValue).toFixed(2)})</span>
        </div>
      ) : (defaultValue !== undefined && !locked && isOffDefault && (
        <div style={{
          fontSize: 8, color: '#d29922', marginTop: -2, marginBottom: 2,
          display: 'flex', alignItems: 'center', gap: 3
        }}>
          <span>推荐: {typeof defaultValue === 'number' ? (Number.isInteger(defaultValue) ? defaultValue : defaultValue.toFixed(1)) : defaultValue}</span>
          {onResetDefault && (
            <span onClick={(e) => { e.stopPropagation(); onResetDefault() }} style={{
              cursor: 'pointer', color: '#58a6ff', textDecoration: 'underline', fontSize: 7
            }}>重置</span>
          )}
        </div>
      ))}
      <input
        type="number"
        value={locked ? '-' : value}
        onChange={handleChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        style={{
          ...inputStyle,
          opacity: locked ? 0.4 : 1,
          cursor: locked ? 'not-allowed' : 'auto',
          boxShadow: highlighted ? '0 0 10px rgba(210, 153, 34, 0.6)' : (isOffDefault ? 'inset 0 0 0 1px rgba(210, 153, 34, 0.3)' : 'none'),
          borderColor: highlighted ? '#d29922' : (isOffDefault ? 'rgba(210, 153, 34, 0.5)' : 'var(--border)'),
          animation: highlighted ? 'paramAmberBreathing 1.5s ease-in-out infinite' : 'none'
        }}
      />
    </div>
  )
});

// ============================================================
// 配件选择器组件
// ============================================================
const PartSelector = React.memo(function PartSelector({ category, selected, onChange }) {
  const [expanded, setExpanded] = useState(false)

  // 若 tierSystem 类别缺少 tiers 数组（仅有 piSteps），自动从 piSteps 合成
  const effectiveTiers = React.useMemo(() => {
    if (!category.tierSystem) return null;
    if (category.tiers && category.tiers.length > 0) return category.tiers;
    if (category.piSteps) {
      return Object.entries(category.piSteps)
        .filter(([tierId]) => tierId !== 'stock' && TIER_LABELS[tierId])
        .sort((a, b) => (TIER_LABELS[a[0]]?.sort ?? 99) - (TIER_LABELS[b[0]]?.sort ?? 99))
        .map(([tierId, piBonus]) => ({
          id: tierId,
          label: TIER_LABELS[tierId]?.zh || tierId,
          color: TIER_LABELS[tierId]?.color || '#8b949e',
          piBonus: piBonus || 0,
          options: [{ id: tierId, label: TIER_LABELS[tierId]?.zh || tierId }]
        }));
    }
    return [];
  }, [category]);

  const isStock = category.tierSystem
    ? (!selected?.tier || selected.tier === 'stock')
    : (!selected?.optionId || selected.optionId === 'stock')

  const selectedTier = category.tierSystem && selected?.tier ? selected.tier : null
  const selectedColor = selectedTier ? (TIER_LABELS[selectedTier]?.color || 'var(--accent)') : 'var(--accent)'
  const selectedLabel = selectedTier ? (TIER_LABELS[selectedTier]?.zh || selectedTier) : ''

  const handleSelect = (tier, optionId) => {
    onChange(tier, optionId)
  }

  return (
    <div style={{
      background: isStock ? 'var(--bg-primary)' : 'var(--bg-tertiary)',
      borderRadius: 6,
      border: `1px solid ${isStock ? 'var(--border)' : (selectedColor + '33')}`,
      overflow: 'hidden'
    }}>
      {/* 头部 - 点击展开/收起 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border)' : 'none'
        }}
      >
        <span style={{ fontSize: 12 }}>{category.icon}</span>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: isStock ? 'var(--text-muted)' : 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {category.label}
        </span>
        {selectedTier && (
          <span style={{
            fontSize: 8,
            padding: '1px 5px',
            borderRadius: 3,
            background: `${selectedColor}22`,
            color: selectedColor,
            fontWeight: 600
          }}>
            {selectedLabel}
          </span>
        )}
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 展开的选项列表 */}
      {expanded && (
        <div style={{ padding: '4px 6px 6px' }}>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4, paddingLeft: 2 }}>
            {category.description}
          </div>

          {category.tierSystem ? (
            /* 等级制配件 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(effectiveTiers || []).map(tier => {
                const isActive = selected?.tier === tier.id
                const options = tier.options || []
                return (
                  <div key={tier.id}>
                    {options.length === 1 ? (
                      /* 只有一个选项：直接选等级 */
                      <button
                        onClick={() => handleSelect(tier.id, options[0].id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '3px 6px',
                          borderRadius: 3,
                          border: `1px solid ${isActive ? tier.color + '66' : 'transparent'}`,
                          background: isActive ? tier.color + '22' : 'transparent',
                          color: isActive ? tier.color : 'var(--text-secondary)',
                          fontSize: 9,
                          cursor: 'pointer',
                          fontWeight: isActive ? 600 : 400,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: 2,
                          background: isActive ? tier.color : 'var(--border)'
                        }} />
                        <span style={{ flex: 1 }}>{tier.label}</span>
                        {tier.piBonus > 0 && (
                          <span style={{ fontSize: 8, color: tier.color }}>+{tier.piBonus}PI</span>
                        )}
                      </button>
                    ) : (
                      /* 多个选项：显示子选项 */
                      <div>
                        <div style={{
                          fontSize: 8,
                          color: tier.color,
                          fontWeight: 600,
                          padding: '2px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: 2,
                            background: options.some(o => o.id === selected?.optionId) ? tier.color : 'var(--border)'
                          }} />
                          {tier.label}
                          {tier.piBonus > 0 && <span>+{tier.piBonus}PI</span>}
                        </div>
                        <div style={{ paddingLeft: 12 }}>
                          {options.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => handleSelect(tier.id, opt.id)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '2px 6px',
                                borderRadius: 2,
                                border: 'none',
                                background: selected?.optionId === opt.id ? tier.color + '22' : 'transparent',
                                color: selected?.optionId === opt.id ? tier.color : 'var(--text-muted)',
                                fontSize: 8,
                                cursor: 'pointer',
                                fontWeight: selected?.optionId === opt.id ? 600 : 400
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* 选项制配件（如引擎swap） */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(category.options || []).map(opt => {
                const isActive = selected?.optionId === opt.id
                const color = opt.color || '#8b949e'
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelect(undefined, opt.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '3px 6px',
                      borderRadius: 3,
                      border: `1px solid ${isActive ? color + '66' : 'transparent'}`,
                      background: isActive ? color + '22' : 'transparent',
                      color: isActive ? color : 'var(--text-secondary)',
                      fontSize: 9,
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 2,
                      background: isActive ? color : 'var(--border)'
                    }} />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {opt.piBonus > 0 && (
                      <span style={{ fontSize: 8, color }}>+{opt.piBonus}PI</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
});

const btnPrimaryStyle = {
  padding: '8px 16px',
  background: '#238636',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600
}

const btnSmallStyle = {
  padding: '4px 10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
}

const btnDangerSmallStyle = {
  padding: '4px 10px',
  background: '#da3633',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
  boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 1
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.8)',
  zIndex: 1000,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 20
}

const modalContentStyle = {
  background: 'var(--bg-secondary)',
  borderRadius: 10,
  padding: 20,
  width: '100%',
  border: '1px solid var(--border)'
}

const formSectionStyle = {
  background: 'var(--bg-primary)',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  border: '1px solid var(--border)'
}

const formSectionTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  marginBottom: 10
}

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10
}
