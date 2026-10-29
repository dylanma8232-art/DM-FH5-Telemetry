import React, { useEffect, useState, useMemo } from 'react'
import { EmptyState } from '../shared/EmptyState'
import { useTuneManager } from '../../hooks/useTuneManager'
import { FIX_PARAM_MAP } from '../../utils/tuneForm'
import { VehicleSearchSelect } from './tune/VehicleSearchSelect'
import { NumberInput } from './tune/NumberInput'
import { PARAM_NAMES_ZH, TUNE_FIELDS_SCHEMA } from './tune/tuneConstants'

import { TuneDiagnosticModal } from './tune/TuneDiagnosticModal'
import { TuneShareModal } from './tune/TuneShareModal'




export const TuneManagerPage = React.memo(function TuneManagerPage({ onNavigate, navIntent }) {

  // 自动注入的缺失依赖 (原页面中被引用但未定义，为防止崩溃添加的 fallback)

  const {
    tunes,
    vehicles,
    tracks,
    loading,
    showModal,
    editingTune,
    setSearchQuery,
    vehicleFilter,
    setVehicleFilter,
    tagFilter,
    setTagFilter,
    formData,
    setFormData,
    compareMode,
    compareSelected,
    compareResult,
    setCompareResult,
    compareLoading,
    compareTrackId,
    setCompareTrackId,
    shareCodeModal,
    setShareCodeModal,
    importPreview,
    setImportPreview,
    importFileRef,
    collapsedSections,
    solutionPi,
    setSolutionPi,
    basePi,
    wizardStep,
    setWizardStep,
    updateTuningCapabilities,
    generateAssistedTune,
    aiUpgradeLoading,
    aiUpgradeReason,
    handleAiUpgrade,
    selectVehicleForDraft,
    aiRaceType,
    setAiRaceType,
    segmentType,
    setSegmentType,
    availableSessions,
    selectedSessionId,
    setSelectedSessionId,
    diagnosing,
    diagnosisResult,
    setDiagnosisResult,
    tuneSessionStats,
    runTelemetryDiagnosis,
    aiDiagnosis,
    aiDiagnosing,
    runAiProblemDiagnosis,
    saveTune,
    deleteTune,
    duplicateTune,
    startEdit,
    startCreate,
    closeModal,
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
    tuneDefaults,
    resetAllToDefaults,
    updatePartSelection,
    tuneConstraints,
    upgradeShop,
    exportTune,
    parseShareCode,
    handleImportFile,
    importFromShareCode,
    ni,
    toggleSection,
  } = useTuneManager({ onNavigate, navIntent });
  const [activeParamTab, setActiveParamTab] = useState('tire-pressure');
  const [aiLoading] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [, setAdviceSubTab] = useState('feel');
  const [diagnosisModalTune, setDiagnosisModalTune] = useState(null);
  const [activeDiagnosisTab, setActiveDiagnosisTab] = useState('telemetry');
  const [tuneToDelete, setTuneToDelete] = useState(null);
  const [previewFixData, setPreviewFixData] = useState(null);
  const [selectedProblems, setSelectedProblems] = useState([]);

  const toggleProblemSelection = (prob) => {
    setSelectedProblems(prev => {
      const exists = prev.some(p => p.name === prob.name);
      if (exists) {
        return prev.filter(p => p.name !== prob.name);
      } else {
        return [...prev, prob];
      }
    });
  };

  const handleApplyProblemsFixInViewOnly = (tune, problems) => {
    if (!problems || problems.length === 0) {
      setUnlockToast('⚠️ 请至少勾选一项驾驶感受问题！');
      return;
    }

    const combinedChanges = {};
    for (const prob of problems) {
      const changes = prob.suggestedChanges || convertFixes(prob.fixes) || {};
      for (const [category, params] of Object.entries(changes)) {
        if (!combinedChanges[category]) combinedChanges[category] = {};
        for (const [key, val] of Object.entries(params)) {
          const curVal = combinedChanges[category][key] || 0;
          combinedChanges[category][key] = Number((curVal + val).toFixed(2));
        }
      }
    }

    const title = problems.length === 1
      ? `攻坚问题「${problems[0].name}」`
      : `联合攻坚 ${problems.length} 项问题 (${problems.map(p => p.name).join(' + ')})`;

    handleGenerateFixPreview(tune, combinedChanges, title);
  };

  const openDiagnosisModal = (tune = null) => {
    const targetTune = tune || (tunes.length > 0 ? tunes[0] : null);
    if (!targetTune) {
      setUnlockToast('⚠️ 请先新建或选择一个调校方案再进行诊断！');
      return;
    }
    setDiagnosisModalTune(targetTune);
    setDiagnosisResult(null);
    setSelectedSessionId('');
  };

  const baseDriveType = (
    upgradeShop?.baseDriveType ||
    (formData.vehicleId && vehicles[formData.vehicleId]?.drivetrain) ||
    'awd'
  ).toLowerCase();

  const currentDriveType = (() => {
    const optId = formData.parts?.drivetrain_swap?.optionId;
    if (!optId || optId === 'stock') {
      return baseDriveType;
    }
    return optId.toLowerCase();
  })();

  useEffect(() => {
    if (navIntent?.openTelemetry) setAdviceSubTab('telemetry');
  }, [navIntent]);


  const convertFixes = (fixes) => {
    if (!fixes) return null;
    const result = {};
    for (const [paramKey, fix] of Object.entries(fixes)) {
      const dotPath = FIX_PARAM_MAP[paramKey];
      if (!dotPath) continue;
      const [category, field] = dotPath.split('.');
      if (!result[category]) result[category] = {};
      result[category][field] = fix.delta;
    }
    return result;
  };

  const handleGenerateFixPreview = (tune, suggestedChanges, title = '对症参数修正') => {
    if (!suggestedChanges || Object.keys(suggestedChanges).length === 0) {
      setUnlockToast('⚠️ 该诊断方案暂无建议的物理参数修改');
      return;
    }
    const items = [];
    const updatedTune = JSON.parse(JSON.stringify(tune));

    for (const [category, params] of Object.entries(suggestedChanges)) {
      if (!updatedTune[category]) updatedTune[category] = {};
      for (const [key, value] of Object.entries(params)) {
        const curVal = updatedTune[category][key];
        const oldValNum = Number.isFinite(Number(curVal)) ? Number(curVal) : 0;
        const newValNum = Number((oldValNum + Number(value)).toFixed(2));
        updatedTune[category][key] = newValNum;

        items.push({
          category,
          key,
          label: PARAM_NAMES_ZH[key] || key,
          oldVal: curVal !== undefined ? curVal : '未设置',
          newVal: newValNum,
          delta: value,
          reason: value > 0 ? '增加刚度/硬度/限制' : '降低硬度/释放抓地'
        });
      }
    }

    setPreviewFixData({
      tune: updatedTune,
      originalTune: tune,
      title,
      items
    });

    setTimeout(() => {
      document.getElementById('fix-preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  };


  const handleConfirmSaveFixPreview = async () => {
    if (!previewFixData) return;
    try {
      await saveTune(previewFixData.tune);
      setUnlockToast(`✅ 参数修正已成功写入并保存至数据库！（修改了 ${previewFixData.items.length} 项物理参数）`);
      setDiagnosisModalTune(previewFixData.tune);
      setPreviewFixData(null);
    } catch (e) {
      setUnlockToast('❌ 保存失败: ' + (e.message || '系统错误'));
    }
  };
  const renderPiBadge = (piValue) => {
    const num = Number(piValue);
    let classLetter = 'D';
    let color = '#8b949e'; // 默认 D 级 灰色
    
    if (num > 998) {
      classLetter = 'X';
      color = 'linear-gradient(135deg, #f2c94c 0%, #d29922 100%)';
    } else if (num >= 901) {
      classLetter = 'S2';
      color = '#da3633'; // 亮粉红
    } else if (num >= 801) {
      classLetter = 'S1';
      color = '#8957e5'; // 紫色
    } else if (num >= 701) {
      classLetter = 'A';
      color = '#1f6feb'; // 经典蓝色
    } else if (num >= 601) {
      classLetter = 'B';
      color = '#f0883b'; // 橙色
    } else if (num >= 501) {
      classLetter = 'C';
      color = '#d29922'; // 黄色
    }

  return (
      <div className="fh5-pi-badge">
        <span className="fh5-pi-class" style={{ background: color, color: '#fff', fontWeight: 900 }}>
          {classLetter}
        </span>
        <span className="fh5-pi-number">
          {num || '-'}
        </span>
      </div>
    );
  };

  const drawerOverlayStyle = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  };

  const drawerContentStyle = {
    background: 'transparent',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  };


  const diagnosticModalProps = useMemo(() => ({
    activeDiagnosisTab, setActiveDiagnosisTab, setDiagnosisResult, previewFixData, setPreviewFixData, handleConfirmSaveFixPreview, runTelemetryDiagnosis, toggleProblemSelection, formatDate, inputStyle, btnPrimaryStyle, diagnosisModalTune, setDiagnosisModalTune, modalOverlayStyle, modalContentStyle, btnSmallStyle, getVehicleName, tunes, diagnosisResult, handleGenerateFixPreview, runAiProblemDiagnosis, selectedProblems, setSelectedProblems, selectedSessionId, setSelectedSessionId, handleApplyProblemsFixInViewOnly, aiDiagnosing, aiDiagnosis, availableSessions, diagnosing, setUnlockToast
  }), [
    activeDiagnosisTab, setActiveDiagnosisTab, setDiagnosisResult, previewFixData, setPreviewFixData, handleConfirmSaveFixPreview, runTelemetryDiagnosis, toggleProblemSelection, formatDate, inputStyle, btnPrimaryStyle, diagnosisModalTune, modalOverlayStyle, modalContentStyle, btnSmallStyle, getVehicleName, tunes, diagnosisResult, handleGenerateFixPreview, runAiProblemDiagnosis, selectedProblems, selectedSessionId, handleApplyProblemsFixInViewOnly, aiDiagnosing, aiDiagnosis, availableSessions, diagnosing, setUnlockToast
  ]);

  const tuneShareModalProps = useMemo(() => ({
    shareCodeModal, setShareCodeModal, modalOverlayStyle, modalContentStyle, btnSmallStyle, btnPrimaryStyle, inputStyle, importFromShareCode, importPreview, setImportPreview, getVehicleName, parseShareCode
  }), [
    shareCodeModal, modalOverlayStyle, modalContentStyle, btnSmallStyle, btnPrimaryStyle, inputStyle, importFromShareCode, importPreview, getVehicleName, parseShareCode
  ]);

  return (
    <div style={showModal ? {
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 60px)',
      background: 'linear-gradient(145deg, #0b0e14 0%, #151a22 100%)',
      overflow: 'hidden',
      color: 'var(--text-primary)'
    } : {
      padding: 8,
      height: 'calc(100vh - 60px)',
      overflow: 'auto',
      background: '#0d1117'
    }}>
      <style>{`
        @keyframes drawerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .fh5-pi-badge {
          display: inline-flex;
          align-items: center;
          font-weight: 800;
          font-family: 'monospace', 'Impact', sans-serif;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .fh5-pi-class {
          padding: 4px 10px;
          font-size: 16px;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
        }
        .fh5-pi-number {
          background: #f0f6fc;
          color: #0d1117;
          padding: 4px 10px;
          font-size: 16px;
          font-weight: 900;
        }

        /* 改装商店卡片高级样式 */
        .part-card {
          background: rgba(22, 27, 34, 0.4);
          border-radius: 8px;
          border: 1px solid rgba(48, 54, 66, 0.5);
          backdrop-filter: blur(8px);
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .part-card:hover {
          border-color: rgba(139, 148, 158, 0.25);
          background: rgba(30, 36, 45, 0.45);
        }
        .part-card.active {
          background: rgba(33, 39, 53, 0.55);
          box-shadow: 0 4px 16px var(--glow-color);
        }
        .part-header {
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s ease;
        }
        .part-header:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .part-title {
          font-size: 10px;
          font-weight: 700;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        /* Pill badges */
        .badge-pill {
          font-size: 8px;
          font-weight: 700;
          padding: 1.5px 5px;
          border-radius: 20px;
          letter-spacing: 0.02em;
        }
        .badge-exclusive {
          background: rgba(188, 140, 255, 0.12);
          color: #bc8cff;
          border: 1px solid rgba(188, 140, 255, 0.2);
        }
        .badge-state {
          background: rgba(255, 136, 0, 0.12);
          color: #ff8800;
          border: 1px solid rgba(255, 136, 0, 0.2);
        }
        .badge-inferred {
          background: rgba(210, 153, 34, 0.12);
          color: #d29922;
          border: 1px solid rgba(210, 153, 34, 0.2);
        }
        .badge-common {
          background: rgba(88, 166, 255, 0.1);
          color: #58a6ff;
          border: 1px solid rgba(88, 166, 255, 0.18);
        }
        
        .badge-selected {
          font-size: 8.5px;
          font-weight: 700;
          padding: 1.5px 6px;
          border-radius: 4px;
          border: 1px solid transparent;
        }
        
        /* Buttons */
        .part-opt-btn {
          width: 100%;
          text-align: left;
          padding: 5px 8px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          color: #8b949e;
          font-size: 9.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .part-opt-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #c9d1d9;
          transform: translateX(3px);
        }
        .part-opt-btn.active {
          border-color: var(--active-border);
          background: var(--active-bg);
          color: var(--active-color);
          font-weight: 700;
        }
        
        .part-pi-pill {
          font-size: 8px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 3px;
          background: rgba(63, 185, 80, 0.12);
          color: #3fb950;
          border: 1px solid rgba(63, 185, 80, 0.2);
        }
        .part-pi-pill.negative {
          background: rgba(255, 123, 114, 0.12);
          color: #ff7b72;
          border: 1px solid rgba(255, 123, 114, 0.2);
        }
      `}</style>
      {!showModal && (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8, padding: '0 6px' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#c9d1d9' }}>调教工坊</h2>
          <div style={{ fontSize: 9, color: '#484f58', marginTop: 2 }}>
            {tunes.length} 个调校方案
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* B08：从车库进入时提供原路返回，并在车库高亮该车 */}
          {navIntent?.returnTab === 'vehicles' && (
            <button
              onClick={() => onNavigate('vehicles', { highlightVehicleId: navIntent.returnVehicleId })}
              style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10, background: 'rgba(210,153,34,0.12)', borderColor: 'rgba(210,153,34,0.35)', color: '#d29922' }}
              title="返回车辆管理并定位到该车"
            >
              ← 返回车库
            </button>
          )}
          <button
            onClick={toggleCompareMode}
            style={compareMode ? { ...btnPrimaryStyle, background: '#58a6ff', padding: '4px 10px', fontSize: 10 } : { ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}
          >
            {compareMode ? '退出' : '对比'}
          </button>
          <button onClick={() => setShowImportMenu(true)} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            导入
          </button>
          <button onClick={() => setShareCodeModal('input')} style={{ ...btnSmallStyle, padding: '4px 10px', fontSize: 10 }}>
            分享码
          </button>
          <button
            onClick={() => openDiagnosisModal()}
            style={{
              ...btnSmallStyle,
              padding: '4px 10px',
              fontSize: 10,
              background: 'rgba(63, 185, 80, 0.15)',
              borderColor: 'rgba(63, 185, 80, 0.35)',
              color: '#3fb950',
              fontWeight: 700
            }}
          >
            🔬 遥测与驾驶诊断
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

      {showImportMenu && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setShowImportMenu(false) }}>
          <div style={{ ...modalContentStyle, maxWidth: 410 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>导入调校</h2>
              <button onClick={() => setShowImportMenu(false)} style={{ ...btnSmallStyle, border: 'none' }}>关闭</button>
            </div>
            <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.55 }}>
              请选择已有调校文件，或先下载模板填写。未填写的配件会保持原厂。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => { setShowImportMenu(false); importFileRef.current?.click() }}
                style={{ ...btnPrimaryStyle, minHeight: 72, fontSize: 12 }}
              >
                上传文件
              </button>
              <a
                href="/调校导入模板.json"
                download="调校导入模板.json"
                onClick={() => setShowImportMenu(false)}
                style={{ ...btnSmallStyle, minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 12, fontWeight: 700, color: '#58a6ff', borderColor: 'rgba(88,166,255,0.45)' }}
              >
                下载模板
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 搜索与筛选栏 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <VehicleSearchSelect id="vehicle-filter" value={vehicleFilter} options={vehicleOptions} onChange={setVehicleFilter} placeholder="筛选车辆" style={{ ...inputStyle, width: 180, marginBottom: 0 }} />
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
        {(vehicleFilter || tagFilter) && (
          <button
            onClick={() => { setSearchQuery(''); setVehicleFilter(''); setTagFilter('') }}
            style={btnSmallStyle}
          >
            清除筛选
          </button>
        )}
      </div>

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
          {filteredTunes.map(tune => {
            return (
              <div
                key={tune.id}
                style={{
                  background: 'rgba(22, 27, 34, 0.4)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 16,
                  transition: 'all 0.25s ease',
                  backdropFilter: 'blur(10px)',
                  boxShadow: 'none',
                  position: 'relative'
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
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
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {formatDate(tune.createdAt)}
                    </div>
                  </div>
                  
                  {/* 高频按钮 */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDiagnosisModal(tune); }}
                      style={{
                        ...btnSmallStyle,
                        fontSize: 11,
                        padding: '3px 10px',
                        background: 'rgba(63, 185, 80, 0.15)',
                        borderColor: 'rgba(63, 185, 80, 0.35)',
                        color: '#3fb950',
                        fontWeight: 700
                      }}
                      title="针对该方案进行遥测数据分析与常见问题诊断"
                    >
                      🔬 诊断
                    </button>
                    <button onClick={() => startEdit(tune)} style={btnSmallStyle}>编辑</button>
                    
                    {/* 操作按钮组 */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateTune(tune); }}
                        style={{ ...btnSmallStyle, fontSize: 11, padding: '3px 10px' }}
                        title="复制一份副本"
                      >
                        复制
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); exportTune(tune); }}
                        style={{ ...btnSmallStyle, fontSize: 11, padding: '3px 10px' }}
                        title="导出为文件"
                      >
                        导出
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTuneToDelete(tune); }}
                        style={{
                          ...btnSmallStyle,
                          fontSize: 11,
                          padding: '3px 10px',
                          color: '#f85149',
                          borderColor: 'rgba(248, 81, 73, 0.3)'
                        }}
                        title="删除此调校"
                      >
                        删除
                      </button>
                    </div>
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
                {Number.isFinite(Number(tune.totalPi)) && (
                  <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#d29922', fontFamily: 'monospace' }}>
                    PI {tune.totalPi}
                  </span>
                )}
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
                          查看使用该调校的比赛记录 ({st.count}) →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 详情展开区域已禁用 */}
            </div>
          );
        }) }
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
      </>)}

      {showModal && (
        <div style={drawerOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={drawerContentStyle}>
            {aiLoading && (
              <div className="ai-loading-mask" style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(13, 17, 23, 0.9)',
                backdropFilter: 'blur(6px)',
                zIndex: 999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16
              }}>
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  border: '2px solid rgba(88, 166, 255, 0.2)',
                  borderTopColor: '#58a6ff',
                  animation: 'spin 1s linear infinite',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    background: 'rgba(88, 166, 255, 0.1)',
                    boxShadow: '0 0 15px rgba(88, 166, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20
                  }}>
                    🧠
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#58a6ff', letterSpacing: 0.5 }}>
                  自动改装正在计算...
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
                  正在根据车辆资料、目标 PI、赛事类型和驱动形式筛选可行配件
                </div>
              </div>
            )}
            {/* 固定顶栏 */}
            <div style={{
              height: 54,
              flexShrink: 0,
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 20px',
              background: 'rgba(21, 26, 34, 0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  onClick={closeModal}
                  style={{
                    ...btnSmallStyle,
                    background: 'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}
                >
                  ← 返回调校库
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {editingTune ? `编辑调校: ${formData.name || '未命名'}` : '新建调校工坊'}
                  </span>
                  {formData.vehicleId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>|</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {vehicles[formData.vehicleId]?.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3 步分步进度条 */}
            <div style={{ padding: '16px 20px 0 20px', flexShrink: 0, background: 'rgba(21, 26, 34, 0.2)' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { step: 1, label: editingTune ? '1. 车辆构型与改装 (允许修改)' : '1. 选择车辆与改装构建' },
                  { step: 2, label: '2. 专注参数调校 Workspace' },
                  { step: 3, label: '3. 方案命名与保存' }
                ].map((item) => {
                  return (
                    <div
                      key={item.step}
                      onClick={() => setWizardStep(item.step)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.25s ease',
                        background: wizardStep === item.step
                          ? 'var(--accent)'
                          : (wizardStep > item.step ? 'rgba(63,185,80,.12)' : 'rgba(255,255,255,0.02)'),
                        border: `1px solid ${wizardStep === item.step ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}`,
                        color: wizardStep >= item.step ? '#fff' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <span style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: wizardStep > item.step ? '#3fb950' : (wizardStep === item.step ? '#fff' : 'rgba(255,255,255,0.1)'),
                        color: wizardStep === item.step ? 'var(--accent)' : '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9
                      }}>
                        {wizardStep > item.step ? '✓' : item.step}
                      </span>
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 滚动 Body 内容区 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column' }}>
            {wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflow: 'visible' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, overflow: 'visible' }}>
                  
                  {/* 左：选择车辆与基础构型 */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--accent)' }}>🚗</span> 选择目标车辆与核心构型
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 16 }}>
                      选择车型、引擎置换、进气增压与驱动形式，作为物理推导基础。
                    </div>
                    <label style={labelStyle}>目标车型</label>
                    <VehicleSearchSelect id="create-vehicle" value={formData.vehicleId} options={vehicleOptions} onChange={selectVehicleForDraft} style={inputStyle} />
                    
                    {formData.vehicleId && (
                      <div style={{
                        marginTop: 16,
                        padding: 14,
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        animation: 'drawerFadeIn 0.3s ease'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>原厂 PI（未改装）</span>
                          <div>
                            {renderPiBadge(upgradeShop?.basePi || vehicles[formData.vehicleId]?.basePi || vehicles[formData.vehicleId]?.pi)}
                          </div>
                        </div>

                        {/* 1. 驱动形式 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>驱动形式</span>
                          <select
                            value={currentDriveType}
                            onChange={e => {
                              const dt = e.target.value;
                              updatePartSelection('drivetrain_swap', 'stock', dt === baseDriveType ? 'stock' : dt, { driveType: dt });
                            }}
                            style={{ ...inputStyle, width: 'auto', padding: '3px 8px', fontSize: 11 }}
                          >
                            <option value="fwd">前驱 FWD{baseDriveType === 'fwd' ? '（原厂）' : ''}</option>
                            <option value="rwd">后驱 RWD{baseDriveType === 'rwd' ? '（原厂）' : ''}</option>
                            <option value="awd">四驱 AWD{baseDriveType === 'awd' ? '（原厂）' : ''}</option>
                          </select>
                        </div>

                        {/* 2. 专属引擎置换 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>专属引擎</span>
                          {(() => {
                            const engineSlot = upgradeShop?.slots?.find(s => s.id === 'engine_swap');
                            const options = engineSlot?.options || [{ id: 'stock', label: '原厂引擎' }];
                            const currentOptId = formData.parts?.engine_swap?.optionId || 'stock';
                            if (options.length <= 1) {
                              return (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                  🔒 仅原厂发动机
                                </span>
                              );
                            }
                            return (
                              <select
                                value={currentOptId}
                                onChange={e => updatePartSelection('engine_swap', 'stock', e.target.value)}
                                style={{ ...inputStyle, width: 'auto', maxWidth: 180, padding: '3px 8px', fontSize: 11 }}
                              >
                                {options.map(opt => (
                                  <option key={opt.id} value={opt.id}>{opt.label || opt.name}</option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>

                        {/* 3. 进气增压方式 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>进气增压方式</span>
                          {(() => {
                            const aspSlot = upgradeShop?.slots?.find(s => s.id === 'aspiration_swap');
                            const options = aspSlot?.options || [];
                            const currentOptId = formData.parts?.aspiration_swap?.optionId || 'stock';
                            if (!aspSlot || options.length <= 1) {
                              return (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                  🔒 增压已固定
                                </span>
                              );
                            }
                            return (
                              <select
                                value={currentOptId}
                                onChange={e => updatePartSelection('aspiration_swap', 'stock', e.target.value)}
                                style={{ ...inputStyle, width: 'auto', maxWidth: 180, padding: '3px 8px', fontSize: 11 }}
                              >
                                {options.map(opt => (
                                  <option key={opt.id} value={opt.id}>{opt.label || opt.name}</option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>

                        {/* 4. 车身宽体套件 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>宽体套件</span>
                          {(() => {
                            const widebodySlot = upgradeShop?.slots?.find(s => s.id === 'widebody');
                            if (!widebodySlot) {
                              return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒 无宽体套件</span>;
                            }
                            const isWidebody = (formData.parts?.widebody?.optionId === 'listed_widebody');
                            return (
                              <button
                                type="button"
                                onClick={() => updatePartSelection('widebody', 'stock', isWidebody ? 'stock' : 'listed_widebody')}
                                style={{
                                  ...btnSmallStyle,
                                  padding: '4px 8px',
                                  fontSize: 10,
                                  background: isWidebody ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.03)',
                                  borderColor: isWidebody ? '#3fb950' : 'var(--border)',
                                  color: isWidebody ? '#3fb950' : 'var(--text-secondary)',
                                  fontWeight: isWidebody ? 700 : 400
                                }}
                              >
                                {isWidebody ? '✓ 已选装宽体' : '☐ 未加装宽体'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 右：赛事用途与调教偏好 */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#3fb950' }}>⚡</span> 设定赛事用途与调教偏好
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 16 }}>
                      选择本次调校的比赛场景，系统将基于 FH5 确定性车辆动力学物理公式精准推导标杆参数。
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                      {[
                        ['road', '公路', '🏎️'],
                        ['street', '街头', '🌃'],
                        ['rally', '山地拉力', '⛰️'],
                        ['dirt', '泥地拉力赛', '🪵'],
                        ['cross_country', '越野', '🏜️'],
                        ['drift', '漂移', '💨']
                      ].map(([rtId, rtLabel, rtIcon]) => {
                        const active = aiRaceType === rtId;
                        return (
                          <button
                            key={rtId}
                            type="button"
                            onClick={() => {
                              const defaults = { road: 'balanced', dirt: 'balanced', rally: 'balanced', cross_country: 'balanced', drift: 'balanced', street: 'balanced' };
                              setAiRaceType(rtId);
                              setSegmentType(defaults[rtId] || 'balanced');
                            }}
                            style={{
                              ...btnSmallStyle,
                              padding: '10px 8px',
                              textAlign: 'center',
                              background: active ? 'rgba(63,185,80,.15)' : 'rgba(255,255,255,0.02)',
                              borderColor: active ? '#3fb950' : 'var(--border)',
                              borderRadius: 6,
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ fontSize: 16, marginBottom: 2 }}>{rtIcon}</div>
                            <div style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? '#3fb950' : 'var(--text-primary)' }}>{rtLabel}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ padding: 14, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>调教偏好</label>
                        <select value={segmentType} onChange={e => setSegmentType(e.target.value)} style={inputStyle}>
                          {({
                            road: [['balanced', '均衡'], ['technical', '抓地与技术弯'], ['high_speed', '极速']],
                            street: [['balanced', '均衡'], ['technical', '抓地与技术弯'], ['high_speed', '加速与极速']],
                            dirt: [['balanced', '均衡'], ['technical', '抓地与稳定'], ['fast_flow', '加速']],
                            rally: [['balanced', '均衡'], ['tarmac_bias', '抓地'], ['dirt_bias', '颠簸适应']],
                            cross_country: [['balanced', '均衡'], ['flat_fast', '极速'], ['rough', '通过性']],
                            drift: [['balanced', '均衡'], ['technical', '低速控制'], ['high_speed', '高速角度']]
                          })[aiRaceType]?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>游戏内实际 PI</label>
                        <input type="number" min="100" max="999" value={solutionPi ?? ''} placeholder={`原厂参考 ${basePi}`} onChange={e => setSolutionPi(e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. 哪些部件支持调校？（可调硬件清单） */}
                <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--accent)' }}>🔧</span> 哪些部件支持调校？（可调硬件清单）
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>未勾选即默认为原厂不可调；已勾选则解锁大表滑块</span>
                      <button
                        type="button"
                        onClick={() => {
                          const currentCaps = formData.tuningCapabilities || {};
                          const isAll = currentCaps.springs === 'race' && currentCaps.antiRollBars === 'both' && currentCaps.transmission === 'race' && currentCaps.differential && currentCaps.brakes;
                          updateTuningCapabilities(isAll ? {
                            springs: 'none', antiRollBars: 'none', transmission: 'none', differential: false, brakes: false, frontAero: false, rearAero: false
                          } : {
                            springs: 'race', antiRollBars: 'both', transmission: 'race', differential: true, brakes: true, frontAero: true, rearAero: true
                          });
                        }}
                        style={{ ...btnSmallStyle, padding: '2px 8px', fontSize: 9 }}
                      >
                        {((formData.tuningCapabilities?.springs === 'race') && (formData.tuningCapabilities?.antiRollBars === 'both')) ? '取消全选' : '快捷全选解锁'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
                    {[
                      { key: 'springs', label: '弹簧与避震', icon: '🔩', onVal: 'race', offVal: 'none' },
                      { key: 'antiRollBars', label: '防倾杆', icon: '↔️', onVal: 'both', offVal: 'none' },
                      { key: 'transmission', label: '传动比 / 齿轮比', icon: '⚙️', onVal: 'race', offVal: 'none', hasGearSelect: true },
                      { key: 'differential', label: '差速器', icon: '🔄', onVal: true, offVal: false },
                      { key: 'brakes', label: '刹车系统', icon: '🛑', onVal: true, offVal: false },
                      { key: 'frontAero', label: '前空力套件', icon: '🌪️', onVal: true, offVal: false },
                      { key: 'rearAero', label: '后空力套件', icon: '🌪️', onVal: true, offVal: false }
                    ].map(item => {
                      const currentCaps = formData.tuningCapabilities || {};
                      const val = currentCaps[item.key];
                      const isChecked = typeof item.onVal === 'boolean' ? !!val : val === item.onVal;
                      const currentGearCount = Number(formData.drivetrain?.gearCount || formData.tuningCapabilities?.gearCount || 6);

                      return (
                        <div
                          key={item.key}
                          onClick={() => {
                            updateTuningCapabilities({ [item.key]: isChecked ? item.offVal : item.onVal });
                          }}
                          style={{
                            padding: '10px 12px',
                            background: isChecked ? 'rgba(63, 185, 80, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                            border: `1px solid ${isChecked ? 'rgba(63, 185, 80, 0.35)' : 'rgba(255, 255, 255, 0.05)'}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            userSelect: 'none',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: `1.5px solid ${isChecked ? '#3fb950' : 'var(--text-muted)'}`,
                              background: isChecked ? '#3fb950' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0
                            }}>
                              {isChecked ? '✓' : ''}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: isChecked ? '#fff' : 'var(--text-secondary)' }}>
                                <span style={{ marginRight: 4 }}>{item.icon}</span>{item.label}
                              </div>
                              <div style={{ fontSize: 9, color: isChecked ? '#3fb950' : 'var(--text-muted)', marginTop: 2 }}>
                                {isChecked ? (item.hasGearSelect ? `${currentGearCount} 档可调` : '可调') : '不可调 (原厂)'}
                              </div>
                            </div>
                          </div>

                          {/* 若已勾选齿轮比，允许直接选择 4 - 10 档位数 */}
                          {item.hasGearSelect && isChecked && (
                            <div onClick={e => e.stopPropagation()} style={{ marginTop: 2 }}>
                              <select
                                value={currentGearCount}
                                onChange={e => {
                                  const cnt = Number(e.target.value);
                                  updateFormField('drivetrain', 'gearCount', cnt);
                                  updateTuningCapabilities({ gearCount: cnt, transmission: 'race' });
                                }}
                                style={{ ...inputStyle, padding: '2px 6px', fontSize: 10, width: '100%' }}
                              >
                                {[4, 5, 6, 7, 8, 9, 10].map(cnt => (
                                  <option key={cnt} value={cnt}>{cnt} 档变速箱</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}



            {/* 3.2 步骤 2：专注参数调校 Workspace（智能隐藏未升级分类，零重复信息） */}
            {wizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflow: 'auto', paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(!editingTune && !upgradeShop?.tuneParameters?.length) ? (
                    <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                      该车型的可调教参数范围正在收集核对中。当前不展示未经验证的调校项目。
                    </div>
                  ) : (
                    <>
                      {/* 动态筛选已升级解封的参数分类选项卡 */}
                      {(() => {
                        const ALL_PARAM_TABS = [
                          { id: 'tire-pressure', label: '轮胎', icon: '🛞' },
                          { id: 'gearing', label: '齿轮比', icon: '⚙️' },
                          { id: 'alignment', label: '轮胎定位', icon: '📐' },
                          { id: 'anti-roll-bars', label: '防倾杆', icon: '↔️' },
                          { id: 'springs', label: '弹簧', icon: '🔩' },
                          { id: 'damping', label: '阻尼', icon: '⚡' },
                          { id: 'aero', label: '空力设置', icon: '🌪️' },
                          { id: 'brakes', label: '刹车', icon: '🛑' },
                          { id: 'differential', label: '差速器', icon: '🔄' }
                        ];

                        const isCategoryUnlocked = (catId) => {
                          const caps = formData.tuningCapabilities || {};
                          switch (catId) {
                            case 'tire-pressure':
                              return true;
                            case 'gearing':
                              return caps.transmission === 'race' || (caps.gearCount && Number(caps.gearCount) > 1);
                            case 'alignment':
                            case 'springs':
                            case 'damping':
                              return ['race', 'drift', 'rally', 'offroad'].includes(caps.springs);
                            case 'anti-roll-bars':
                              return ['both', 'front', 'rear'].includes(caps.antiRollBars);
                            case 'aero':
                              return !!caps.frontAero || !!caps.rearAero;
                            case 'brakes':
                              return caps.brakes === true || caps.brakes === 'race';
                            case 'differential':
                              return caps.differential === true || ['race', 'drift', 'rally', 'offroad'].includes(caps.differential);
                            default:
                              return true;
                          }
                        };

                        const unlockedTabs = ALL_PARAM_TABS.filter(tab => isCategoryUnlocked(tab.id));
                        const currentActiveValid = unlockedTabs.some(t => t.id === activeParamTab);
                        const effectiveActiveTab = currentActiveValid ? activeParamTab : (unlockedTabs[0]?.id || 'tire-pressure');

                        return (
                          <>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflow: 'auto', paddingBottom: 4, flexShrink: 0 }}>
                              {unlockedTabs.map(tab => {
                                const isSelected = effectiveActiveTab === tab.id;
                                return (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveParamTab(tab.id)}
                                    style={{
                                      background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                                      border: '1px solid ' + (isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.05)'),
                                      borderRadius: 4,
                                      padding: '6px 14px',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    <span style={{ marginRight: 4 }}>{tab.icon}</span>
                                    {tab.label}
                                  </button>
                                );
                              })}
                            </div>

                            {TUNE_FIELDS_SCHEMA.filter(section => (section.sectionKey || section.kind || section.category) === effectiveActiveTab).map(section => {
                              if (section.kind === 'differential') {
                                return (
                                  <div key={section.category} className="form-section" style={formSectionStyle}>
                                    <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', margin: 0, paddingBottom: collapsedSections.has('differential') ? 0 : 8 }} onClick={() => toggleSection('differential')}>
                                      <span>{collapsedSections.has('differential') ? '▶ ' : '▼ '}差速器</span>
                                    </div>
                                    <div style={{
                                      maxHeight: collapsedSections.has('differential') ? '0px' : '500px',
                                      overflow: 'hidden',
                                      opacity: collapsedSections.has('differential') ? 0 : 1,
                                      transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-in-out',
                                      marginTop: collapsedSections.has('differential') ? 0 : 8
                                    }}>
                                      <div style={formGridStyle}>
                                        {(() => {
                                          const selectedDriveSwap = formData.parts?.drivetrain_swap?.optionId;
                                          const effectiveDrive = (
                                            ['fwd', 'rwd', 'awd'].includes(selectedDriveSwap) ? selectedDriveSwap :
                                              formData.tuningCapabilities?.driveType || upgradeShop?.effectiveDriveType || upgradeShop?.baseDriveType || 'rwd'
                                          ).toLowerCase();
                                          const isAwd = effectiveDrive === 'awd';
                                          const isFwd = effectiveDrive === 'fwd';
                                          const isRwd = effectiveDrive === 'rwd';

                                          const fields = [
                                            ['frontDiffAccel', '前差速器加速', !isFwd && !isAwd, '仅前驱/四驱支持'],
                                            ['frontDiffDecel', '前差速器减速', !isFwd && !isAwd, '仅前驱/四驱支持'],
                                            ['rearDiffAccel', '后差速器加速', !isRwd && !isAwd, '仅后驱/四驱支持'],
                                            ['rearDiffDecel', '后差速器减速', !isRwd && !isAwd, '仅后驱/四驱支持']
                                          ];

                                          return (
                                            <>
                                              {fields.map(([field, label, forceLocked, lockMsg]) => {
                                                const isLocked = forceLocked || tuneConstraints[`drivetrain.${field}`]?.locked;
                                                return (
                                                  <NumberInput
                                                    key={field}
                                                    label={label}
                                                    value={isLocked ? '' : formData.drivetrain[field]}
                                                    onChange={v => updateFormField('drivetrain', field, v)}
                                                    min={tuneConstraints[`drivetrain.${field}`]?.min ?? 0}
                                                    max={tuneConstraints[`drivetrain.${field}`]?.max ?? 100}
                                                    step={tuneConstraints[`drivetrain.${field}`]?.step ?? 1}
                                                    unit="%"
                                                    locked={isLocked}
                                                    lockedHint={forceLocked ? lockMsg : tuneConstraints[`drivetrain.${field}`]?.lockedHint}
                                                    {...ni('drivetrain', field)}
                                                  />
                                                );
                                              })}
                                              <NumberInput
                                                label="中央差速偏置"
                                                value={!isAwd ? '' : formData.drivetrain.diffCenter}
                                                onChange={v => updateFormField('drivetrain', 'diffCenter', v)}
                                                min={tuneConstraints['drivetrain.diffCenter']?.min ?? 0}
                                                max={tuneConstraints['drivetrain.diffCenter']?.max ?? 100}
                                                step={tuneConstraints['drivetrain.diffCenter']?.step ?? 1}
                                                unit="%"
                                                locked={!isAwd || tuneConstraints['drivetrain.diffCenter']?.locked}
                                                lockedHint={!isAwd ? '仅四驱车型支持' : tuneConstraints['drivetrain.diffCenter']?.lockedHint}
                                                {...ni('drivetrain', 'diffCenter')}
                                              />
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              if (section.kind === 'gearing') {
                                const currentGearCount = Number(formData.drivetrain?.gearCount || formData.tuningCapabilities?.gearCount || 6);
                                return (
                                  <div key="gearing" className="form-section" style={formSectionStyle}>
                                    <div style={{ ...formSectionTitleStyle, cursor: 'pointer', userSelect: 'none', margin: 0, paddingBottom: collapsedSections.has('gearing') ? 0 : 8 }} onClick={() => toggleSection('gearing')}>
                                      <span>{collapsedSections.has('gearing') ? '▶ ' : '▼ '}传动比</span>
                                    </div>
                                    <div style={{
                                      maxHeight: collapsedSections.has('gearing') ? '0px' : '600px',
                                      overflow: 'hidden',
                                      opacity: collapsedSections.has('gearing') ? 0 : 1,
                                      transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-in-out',
                                      marginTop: collapsedSections.has('gearing') ? 0 : 8
                                    }}>
                                      {/* 档位数控制 */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '8px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>⚙️ 变速箱档位数</span>
                                        <select
                                          value={currentGearCount}
                                          onChange={e => {
                                            const newCount = Number(e.target.value);
                                            updateFormField('drivetrain', 'gearCount', newCount);
                                            updateTuningCapabilities({ gearCount: newCount });
                                          }}
                                          style={{ ...inputStyle, width: 'auto', padding: '3px 8px', fontSize: 11 }}
                                        >
                                          {[4, 5, 6, 7, 8, 9, 10].map(cnt => (
                                            <option key={cnt} value={cnt}>{cnt} 档变速箱</option>
                                          ))}
                                        </select>
                                      </div>

                                      <div style={formGridStyle}>
                                        <NumberInput label="终传比" value={formData.drivetrain.finalDrive} onChange={v => updateFormField('drivetrain', 'finalDrive', v)} min={tuneConstraints['drivetrain.finalDrive']?.min ?? 1} max={tuneConstraints['drivetrain.finalDrive']?.max ?? 6} step={tuneConstraints['drivetrain.finalDrive']?.step ?? 0.01} locked={tuneConstraints['drivetrain.finalDrive']?.locked} {...ni('drivetrain', 'finalDrive')} />
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                                        {Array.from({ length: currentGearCount }, (_, i) => i + 1).map(gear => (
                                          <NumberInput key={gear} label={`${gear}档齿比`} value={formData.drivetrain[`gear${gear}`]} onChange={v => updateFormField('drivetrain', `gear${gear}`, v)} min={tuneConstraints[`drivetrain.gear${gear}`]?.min ?? 0.5} max={tuneConstraints[`drivetrain.gear${gear}`]?.max ?? 6} step={tuneConstraints[`drivetrain.gear${gear}`]?.step ?? 0.01} locked={tuneConstraints[`drivetrain.gear${gear}`]?.locked} {...ni('drivetrain', `gear${gear}`)} />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={section.sectionKey || section.category} className="form-section">
                                  <div style={{ ...formSectionTitleStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSection(section.sectionKey || section.category)}>
                                    <span>{collapsedSections.has(section.sectionKey || section.category) ? '▶ ' : '▼ '}{section.title}</span>
                                    {section.category !== 'brakes' && Object.keys(tuneDefaults).some(k => k.startsWith(`${section.category}.`)) && (
                                      <button onClick={(e) => { e.stopPropagation(); resetAllToDefaults(); }} className="btn-small" style={{ padding: '1px 8px', fontSize: 8, background: 'rgba(210, 153, 34, 0.15)', borderColor: 'rgba(210, 153, 34, 0.3)', color: '#d29922' }}>
                                        重置为推荐值
                                      </button>
                                    )}
                                  </div>
                                  <div style={{
                                    maxHeight: collapsedSections.has(section.sectionKey || section.category) ? '0px' : '600px',
                                    overflow: 'hidden',
                                    opacity: collapsedSections.has(section.sectionKey || section.category) ? 0 : 1,
                                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-in-out',
                                    marginTop: collapsedSections.has(section.sectionKey || section.category) ? 0 : 8
                                  }}>
                                    <div className="form-grid">
                                      {section.fields.map(f => (
                                        <NumberInput
                                          key={f.id}
                                          label={f.label}
                                          value={formData[section.category][f.id]}
                                          onChange={v => updateFormField(section.category, f.id, v)}
                                          min={tuneConstraints[`${section.category}.${f.id}`]?.min ?? f.min}
                                          max={tuneConstraints[`${section.category}.${f.id}`]?.max ?? f.max}
                                          step={tuneConstraints[`${section.category}.${f.id}`]?.step ?? f.step}
                                          unit={f.unit}
                                          locked={tuneConstraints[`${section.category}.${f.id}`]?.locked}
                                          {...ni(section.category, f.id)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 3.3 步骤 3：独立方案命名、分享码与保存（专注于方案收尾） */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', padding: 10 }}>
                <div style={{
                  maxWidth: 680,
                  margin: '0 auto',
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 10,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: 10 }}>
                    💾 保存调校方案
                  </div>

                  <div>
                    <label style={labelStyle}>调校方案名称 *</label>
                    <input
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="例如: 街头赛 S1900 高速弯道专用调校"
                      style={{ ...inputStyle, fontSize: 12, padding: '8px 12px' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={labelStyle}>游戏内分享码 (9位或12位数字)</label>
                      <input
                        value={formData.shareCode || ''}
                        onChange={e => setFormData(prev => ({ ...prev, shareCode: e.target.value }))}
                        placeholder="例如: 123 456 789"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>标签 (逗号分隔)</label>
                      <input
                        value={formData.tags}
                        onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                        placeholder="公路, 漂移, S1..."
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>调校笔记与修改心得</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="在此记录调校特点、改动细节或赛道适用性..."
                      rows={4}
                      style={{ ...inputStyle, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
                    />
                  </div>
                </div>
              </div>
            )}
            </div> {/* 闭合滚动 Body 内容区 */}

            {/* B03：AI 改装理由（仅在本次 AI 求解成功后展示，不占用常驻空间） */}
            {aiUpgradeReason && wizardStep === 1 && (
              <div style={{
                margin: '0 20px 8px', padding: '8px 12px', borderRadius: 6,
                background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.3)',
                fontSize: 10, color: '#c9d1d9', lineHeight: 1.6
              }}>
                <span style={{ color: '#58a6ff', fontWeight: 700, marginRight: 6 }}>AI 改装理由</span>
                {aiUpgradeReason}
              </div>
            )}

            {/* 固定 Footer */}
            <div style={{
              height: 52,
              flexShrink: 0,
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 20px',
              background: 'rgba(21, 26, 34, 0.95)',
              zIndex: 10
            }}>
              {/* 左侧：快捷键提示 */}
              <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--text-muted)' }}>
                <div><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: 3 }}>Esc</span> 关闭工作台</div>
                <div><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: 3 }}>Ctrl+S</span> 保存</div>
                <div><span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: 3 }}>Ctrl+D</span> 复制草稿</div>
              </div>

              {/* 右侧：操作按钮 */}
              <div style={{ display: 'flex', gap: 8 }}>
                {wizardStep === 1 && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await handleAiUpgrade();
                        if (result?.ok) {
                          setUnlockToast('🧠 AI 智能改装方案已生成并填入（已通过本地 PI 校验）');
                          setWizardStep(2);
                        } else if (result?.error) {
                          setUnlockToast('⚠️ AI 改装失败：' + result.error);
                        }
                      }}
                      disabled={!formData.vehicleId || !upgradeShop || aiUpgradeLoading}
                      style={{ ...btnSmallStyle, padding: '6px 14px', fontSize: 11, fontWeight: 700 }}
                      title="调用大模型在当前车辆合法配件中选择组合，结果仍需通过本地 PI 校验"
                    >
                      {aiUpgradeLoading ? '🧠 AI 求解中...' : '🧠 AI 智能改装'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (generateAssistedTune()) {
                          setWizardStep(2);
                        }
                      }}
                      disabled={!formData.vehicleId || !upgradeShop}
                      style={{ ...btnPrimaryStyle, padding: '6px 20px', fontSize: 11, fontWeight: 700 }}
                    >
                      {(!upgradeShop && formData.vehicleId) ? '加载物理资料中...' : '⚡ 生成物理推荐并进入调校 →'}
                    </button>
                  </>
                )}

                {wizardStep === 2 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      style={{ ...btnSmallStyle, padding: '5px 14px', fontSize: 11 }}
                    >
                      ← 返回修改构建
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(3)}
                      style={{ ...btnPrimaryStyle, padding: '6px 18px', fontSize: 11, fontWeight: 700 }}
                    >
                      下一步：方案命名与保存 →
                    </button>
                  </>
                )}

                {wizardStep === 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      style={{ ...btnSmallStyle, padding: '5px 14px', fontSize: 11 }}
                    >
                      ← 返回参数调校
                    </button>
                    <button
                      type="button"
                      onClick={saveTune}
                      disabled={loading}
                      style={{
                        ...btnPrimaryStyle,
                        background: 'var(--success)',
                        borderColor: '#2ea44f',
                        padding: '6px 20px',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      💾 {loading ? '保存中...' : (editingTune ? '保存修改' : '完成并保存调校')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 分享码弹窗 */}
      <TuneShareModal {...tuneShareModalProps} />

      <TuneDiagnosticModal {...diagnosticModalProps} />
      {/* 🗑️ 删除调校方案二次确认 Modal */}
      {tuneToDelete && (
        <div style={modalOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setTuneToDelete(null); }}>
          <div style={{
            ...modalContentStyle,
            maxWidth: 420,
            padding: 22,
            background: 'linear-gradient(145deg, #161b22 0%, #0d1117 100%)',
            border: '1px solid rgba(248, 81, 73, 0.4)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 8,
                background: 'rgba(248, 81, 73, 0.15)', border: '1px solid rgba(248, 81, 73, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#f85149'
              }}>
                🗑️
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  确认删除此调校方案？
                </h3>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  此操作将从系统中永久删除该方案，不可恢复
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 8,
              padding: '12px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: 11
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {tuneToDelete.name || '未命名调校'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                适用车辆: {getVehicleName(tuneToDelete.vehicleId)} | PI {tuneToDelete.totalPi || '-'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setTuneToDelete(null)}
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
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = tuneToDelete.id;
                  setTuneToDelete(null);
                  await deleteTune(targetId);
                }}
                style={{
                  ...btnPrimaryStyle,
                  padding: '7px 18px',
                  fontSize: 11,
                  background: '#da3633',
                  fontWeight: 800,
                  borderRadius: 6
                }}
              >
                确认删除
              </button>
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
