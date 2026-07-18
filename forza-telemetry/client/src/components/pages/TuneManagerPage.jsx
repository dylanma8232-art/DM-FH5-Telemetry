import React, { useEffect, useState } from 'react'
import { EmptyState } from '../shared/EmptyState'
import {
  PART_CATEGORIES,
  TIER_LABELS,
} from '../../data/parts'
import { DRIVING_PROBLEMS, PROBLEM_CATEGORIES } from '../../data/tunePresets'
import { useTuneManager, FIX_PARAM_MAP } from '../../hooks/useTuneManager'
import { VehicleSearchSelect } from './tune/VehicleSearchSelect'
import { ParamItem } from './tune/ParamItem'
import { NumberInput } from './tune/NumberInput'
import { PartSelector } from './tune/PartSelector'

const TUNE_FIELDS_SCHEMA = [
  {
    category: 'tires',
    sectionKey: 'tire-pressure',
    title: '胎压',
    fields: [
      { id: 'frontPressure', label: '前胎压', min: 1.4, max: 2.8, step: 0.01, unit: 'bar' },
      { id: 'rearPressure', label: '后胎压', min: 1.4, max: 2.8, step: 0.01, unit: 'bar' }
    ]
  },
  {
    category: 'tires',
    sectionKey: 'alignment',
    title: '定位',
    fields: [
      { id: 'frontCamber', label: '前外倾角', min: -5, max: 0, step: 0.1, unit: '°' },
      { id: 'rearCamber', label: '后外倾角', min: -5, max: 0, step: 0.1, unit: '°' },
      { id: 'frontToe', label: '前束角', min: -0.5, max: 0.5, step: 0.1, unit: '°' },
      { id: 'rearToe', label: '后束角', min: -0.5, max: 0.5, step: 0.1, unit: '°' },
      { id: 'frontCaster', label: '主销后倾角', min: 1, max: 7, step: 0.1, unit: '°' }
    ]
  },
  {
    category: 'suspension',
    sectionKey: 'anti-roll-bars',
    title: '防倾杆',
    fields: [
      { id: 'frontARB', label: '前防倾杆', min: 1, max: 65, step: 0.1, unit: '' },
      { id: 'rearARB', label: '后防倾杆', min: 1, max: 65, step: 0.1, unit: '' }
    ]
  },
  {
    category: 'suspension',
    sectionKey: 'springs',
    title: '弹簧',
    fields: [
      { id: 'frontSpring', label: '前弹簧硬度', min: 0.1, max: 200, step: 0.1, unit: 'kgf/mm' },
      { id: 'rearSpring', label: '后弹簧硬度', min: 0.1, max: 200, step: 0.1, unit: 'kgf/mm' },
      { id: 'frontRideHeight', label: '前车身高度', min: 3, max: 20, step: 1, unit: 'cm' },
      { id: 'rearRideHeight', label: '后车身高度', min: 3, max: 20, step: 1, unit: 'cm' }
    ]
  },
  {
    category: 'suspension',
    sectionKey: 'damping',
    title: '阻尼',
    fields: [
      { id: 'frontRebound', label: '前回弹阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'rearRebound', label: '后回弹阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'frontBump', label: '前压缩阻尼', min: 1, max: 20, step: 0.1, unit: '' },
      { id: 'rearBump', label: '后压缩阻尼', min: 1, max: 20, step: 0.1, unit: '' }
    ]
  },
  {
    category: 'drivetrain',
    title: '差速器',
    kind: 'differential'
  },
  {
    category: 'drivetrain',
    title: '传动比',
    kind: 'gearing'
  },
  {
    category: 'brakes',
    title: '制动系统',
    fields: [
      { id: 'balance', label: '制动力平衡', min: 0, max: 100, step: 1, unit: '%' },
      { id: 'pressure', label: '制动力压力', min: 20, max: 200, step: 1, unit: '%' }
    ]
  },
  {
    category: 'aero',
    title: '空气动力学',
    fields: [
      { id: 'frontDownforce', label: '前下压力', min: 0, max: 1000, step: 1, unit: 'kgf' },
      { id: 'rearDownforce', label: '后下压力', min: 0, max: 1000, step: 1, unit: 'kgf' }
    ]
  }
]


const PARAM_NAMES_ZH = {
  frontTirePressure: '前胎压',
  rearTirePressure: '后胎压',
  frontCamber: '前外倾角',
  rearCamber: '后外倾角',
  frontToe: '前束角',
  rearToe: '后束角',
  frontCaster: '主销后倾角',
  frontSpring: '前弹簧刚度',
  rearSpring: '后弹簧刚度',
  frontDamping: '前避震阻尼',
  rearDamping: '后避震阻尼',
  frontRebound: '前回弹阻尼',
  rebound_front: '前回弹阻尼',
  rebound_rear: '后回弹阻尼',
  bump_front: '前阻尼压缩',
  bump_rear: '后阻尼压缩',
  rearRebound: '后回弹阻尼',
  frontBump: '前阻尼压缩',
  rearBump: '后阻尼压缩',
  frontARB: '前防倾杆',
  rearARB: '后防倾杆',
  frontRideHeight: '前车身高度',
  rearRideHeight: '后车身高度',
  diffAccel: '差速器加速锁',
  diffDecel: '差速器减速锁',
  diffCenter: '中央差速偏置',
  frontDiffAccel: '前部差速器加速',
  frontDiffDecel: '前部差速器减速',
  rearDiffAccel: '后部差速器加速',
  rearDiffDecel: '后部差速器减速',
  finalDrive: '终传比',
  frontDownforce: '前下压力',
  rearDownforce: '后下压力',
  brakeBias: '刹车偏置',
  gear1: '1挡齿比', gear2: '2挡齿比', gear3: '3挡齿比', gear4: '4挡齿比', gear5: '5挡齿比', gear6: '6挡齿比', gear7: '7挡齿比', gear8: '8挡齿比', gear9: '9挡齿比', gear10: '10挡齿比',
  tire_pressure_front: '前胎压',
  tire_pressure_rear: '后胎压',
  tire_camber_front: '前外倾角',
  tire_camber_rear: '后外倾角',
  tire_toe_front: '前束角',
  tire_toe_rear: '后束角',
  caster_front: '主销后倾角',
  spring_front: '前弹簧',
  spring_rear: '后弹簧',
  damping_front: '前避震阻尼',
  damping_rear: '后避震阻尼',
  arb_front: '前防倾杆',
  arb_rear: '后防倾杆',
  ride_height_front: '前车身高度',
  ride_height_rear: '后车身高度',
  diff_accel: '差速器加速锁',
  diff_decel: '差速器减速锁',
  diff_center: '中央差速偏置',
  diff_front_accel: '前差速器加速',
  diff_front_decel: '前差速器减速',
  diff_rear_accel: '后差速器加速',
  diff_rear_decel: '后差速器减速',
  final_drive: '终传比',
  downforce_front: '前下压力',
  downforce_rear: '后下压力'
};

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
    solutionPi,
    setSolutionPi,
    basePi,
    setBasePi,
    wizardStep,
    setWizardStep,
    buildMode,
    setBuildMode,
    selectVehicleForDraft,
    chooseBuildMode,
    aiRaceType,
    setAiRaceType,
    aiDriveType,
    setAiDriveType,
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
    totalPiUpper,
    unknownPiSelectionCount,
    piIsVerified,
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
    upgradeShop,
    visiblePartCategories,
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
  const hasAiOption = (slotId, optionId) => upgradeShop?.slots?.find(slot => slot.id === slotId)?.options?.some(option => option.id === optionId && option.aiEligible === true && Number.isFinite(Number(option.piUpperEstimate)))
  const [activePartTab, setActivePartTab] = useState('全部');

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

  const handleApplyDiagnosisInViewOnly = (tune, suggestedChanges) => {
    startEdit(tune);
    setFormData(prev => {
      const updated = {
        ...prev,
        tires: { ...prev.tires, ...tune.tires },
        suspension: { ...prev.suspension, ...tune.suspension },
        drivetrain: { ...prev.drivetrain, ...tune.drivetrain },
        brakes: { ...prev.brakes, ...tune.brakes },
        aero: { ...prev.aero, ...tune.aero },
        parts: tune.parts || prev.parts,
        vehicleId: tune.vehicleId,
        name: tune.name || prev.name,
        notes: tune.notes || prev.notes
      };

      const newHighlighted = [];
      for (const [category, params] of Object.entries(suggestedChanges)) {
        if (updated[category]) {
          updated[category] = { ...updated[category] };
          for (const [key, value] of Object.entries(params)) {
            if (key in updated[category]) {
              const currentVal = Number(updated[category][key] || 0);
              updated[category][key] = Number((currentVal + value).toFixed(2));
              newHighlighted.push(`${category}.${key}`);
            }
          }
        }
      }
      setHighlightedParams(newHighlighted);
      return updated;
    });
    setWizardStep(3);
  };

  const handleApplyProblemFixInViewOnly = (tune, problem) => {
    const suggestedChanges = problem.suggestedChanges || convertFixes(problem.fixes);
    if (!suggestedChanges) {
      alert('该问题暂无建议的参数修改');
      return;
    }
    handleApplyDiagnosisInViewOnly(tune, suggestedChanges);
    alert(`已自动开启编辑并应用「${problem.name}」的调校建议`);
  };
  const aiRaceAvailability = {
    road: true,
    dirt: hasAiOption('tires_compound', 'rally') && hasAiOption('suspension', 'rally'),
    cross_country: hasAiOption('tires_compound', 'offroad') && hasAiOption('suspension', 'offroad'),
    drift: hasAiOption('suspension', 'drift') && hasAiOption('differential', 'drift')
  }
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
                      <ParamItem label="前外倾角" value={tune.tires?.frontCamber} unit="°" defaultValue={tuneDefaultsForView['tires.frontCamber']} />
                      <ParamItem label="后外倾角" value={tune.tires?.rearCamber} unit="°" defaultValue={tuneDefaultsForView['tires.rearCamber']} />
                      <ParamItem label="前束角" value={tune.tires?.frontToe} unit="°" defaultValue={tuneDefaultsForView['tires.frontToe']} />
                      <ParamItem label="后束角" value={tune.tires?.rearToe} unit="°" defaultValue={tuneDefaultsForView['tires.rearToe']} />
                      <ParamItem label="主销后倾角" value={tune.tires?.frontCaster} unit="°" defaultValue={tuneDefaultsForView['tires.frontCaster']} />
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
                      <ParamItem label="前回弹阻尼" value={tune.suspension?.frontRebound} defaultValue={tuneDefaultsForView['suspension.frontRebound']} />
                      <ParamItem label="后回弹阻尼" value={tune.suspension?.rearRebound} defaultValue={tuneDefaultsForView['suspension.rearRebound']} />
                      <ParamItem label="前压缩阻尼" value={tune.suspension?.frontBump} defaultValue={tuneDefaultsForView['suspension.frontBump']} />
                      <ParamItem label="后压缩阻尼" value={tune.suspension?.rearBump} defaultValue={tuneDefaultsForView['suspension.rearBump']} />
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
                      <ParamItem label="前差速器加速" value={tune.drivetrain?.frontDiffAccel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.frontDiffAccel']} />
                      <ParamItem label="前差速器减速" value={tune.drivetrain?.frontDiffDecel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.frontDiffDecel']} />
                      <ParamItem label="后差速器加速" value={tune.drivetrain?.rearDiffAccel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.rearDiffAccel']} />
                      <ParamItem label="后差速器减速" value={tune.drivetrain?.rearDiffDecel} unit="%" defaultValue={tuneDefaultsForView['drivetrain.rearDiffDecel']} />
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
                      {[7, 8, 9, 10].map(gear => <ParamItem key={gear} label={`${gear}档齿比`} value={tune.drivetrain?.[`gear${gear}`]} defaultValue={tuneDefaultsForView[`drivetrain.gear${gear}`]} />)}
                    </div>
                  </div>

                  <div style={{ marginBottom: 12, borderLeft: '3px solid #f85149', paddingLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#f85149', marginBottom: 8 }}>制动系统</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <ParamItem label="制动力平衡" value={tune.brakes?.balance} unit="%" defaultValue={tuneDefaultsForView['brakes.balance']} />
                      <ParamItem label="制动力压力" value={tune.brakes?.pressure} unit="%" defaultValue={tuneDefaultsForView['brakes.pressure']} />
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

                  {/* 遥测诊断与常见驾驶问题优化调优面板 */}
                  <div style={{
                    marginTop: 16,
                    borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
                    paddingTop: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🛠️</span> 调校诊断与问题修复
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>
                      针对当前调校进行赛道遥测数据分析，或快速查阅常见车辆驾驶问题解决建议。
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
                      {/* 左侧：遥测检查 */}
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#3fb950', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>📈 遥测数据诊断</span>
                          {/* 快捷诊断本车最新比赛记录的科技绿按钮 */}
                          <button
                            type="button"
                            onClick={() => {
                              const carSessions = availableSessions.filter(s => {
                                const sVehicleId = s.vehicleId || s.vehicle?.ordinal || s.carOrdinal || '';
                                return String(sVehicleId) === String(tune.vehicleId);
                              });
                              if (carSessions.length === 0) {
                                alert('未找到该车型的遥测比赛记录。请先去驾驶这辆车跑几圈录制遥测数据！');
                                return;
                              }
                              runTelemetryDiagnosis(carSessions[0].id);
                            }}
                            disabled={diagnosing}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              background: 'rgba(63, 185, 80, 0.15)',
                              border: '1px solid rgba(63, 185, 80, 0.3)',
                              color: '#3fb950',
                              borderRadius: 4,
                              padding: '4px 10px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <span>⚡</span> {diagnosing ? '分析中...' : '诊断本车最新比赛'}
                          </button>
                        </div>

                        <div>
                          <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>手动选择比赛数据</label>
                          {(() => {
                            const carSessions = availableSessions.filter(s => {
                              const sVehicleId = s.vehicleId || s.vehicle?.ordinal || s.carOrdinal || '';
                              return String(sVehicleId) === String(tune.vehicleId);
                            });
                            return (
                              <select
                                value={selectedSessionId}
                                onChange={e => {
                                  setSelectedSessionId(e.target.value);
                                  setDiagnosisResult(null);
                                }}
                                style={{ ...inputStyle, fontSize: 9.5, padding: '4px 6px', height: 26 }}
                              >
                                <option value="">-- 手动选择比赛 ({carSessions.length} 场记录) --</option>
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

                        <button
                          type="button"
                          onClick={() => runTelemetryDiagnosis(selectedSessionId)}
                          disabled={!selectedSessionId || diagnosing}
                          style={{
                            ...btnPrimaryStyle,
                            width: '100%',
                            fontSize: 10,
                            padding: '6px 10px',
                            background: diagnosing ? '#484f58' : '#238636'
                          }}
                        >
                          {diagnosing ? '数据加载中...' : '开始分析选中 Session'}
                        </button>

                        {/* 诊断结果展示 */}
                        {diagnosisResult && (
                          <div style={{
                            padding: 10,
                            background: 'var(--bg-tertiary)',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            maxHeight: 200,
                            overflow: 'auto',
                            animation: 'drawerFadeIn 0.3s ease'
                          }}>
                            <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-primary)', marginBottom: 4 }}>
                              分析结论
                            </div>
                            {diagnosisResult.summary && (
                              <div style={{
                                fontSize: 9.5,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                padding: '4px 6px',
                                background: diagnosisResult.issues && diagnosisResult.issues.length > 0 ? 'rgba(210,153,34,0.06)' : 'rgba(35,134,54,0.06)',
                                borderRadius: 4
                              }}>
                                {diagnosisResult.summary}
                              </div>
                            )}

                            {diagnosisResult.issues && diagnosisResult.issues.map((issue, idx) => (
                              <div key={idx} style={{ fontSize: 9, color: 'var(--text-primary)', padding: '2px 4px', marginBottom: 2, background: 'var(--bg-primary)', borderRadius: 2 }}>
                                <span style={{ color: issue.severity === 'high' ? '#da3633' : '#d29922', marginRight: 4 }}>•</span>
                                {issue.description || issue.message || issue}
                              </div>
                            ))}

                            {diagnosisResult.suggestedChanges && Object.keys(diagnosisResult.suggestedChanges).length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginBottom: 3 }}>系统建议修改:</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 6 }}>
                                  {Object.entries(diagnosisResult.suggestedChanges).map(([cat, params]) =>
                                    Object.entries(params).map(([key, val]) => (
                                      <div key={key} style={{ fontSize: 8, color: 'var(--accent)', background: 'var(--bg-primary)', padding: '2px 4px', borderRadius: 2 }}>
                                        {PARAM_NAMES_ZH[key] || key}: {val > 0 ? `+${val}` : val}
                                      </div>
                                    ))
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleApplyDiagnosisInViewOnly(tune, diagnosisResult.suggestedChanges)}
                                  style={{
                                    ...btnSmallStyle,
                                    width: '100%',
                                    background: 'rgba(56, 139, 253, 0.15)',
                                    borderColor: 'rgba(56, 139, 253, 0.3)',
                                    color: 'var(--accent)',
                                    fontWeight: 700,
                                    fontSize: 9,
                                    padding: '5px 10px'
                                  }}
                                >
                                  ✍️ 应用建议并进入编辑微调
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 右侧：常见驾驶问题 */}
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 8,
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#58a6ff' }}>
                          🙋 常见驾驶问题调校
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto', paddingRight: 4 }}>
                          {DRIVING_PROBLEMS.map((prob, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '8px 10px',
                                background: 'rgba(255, 255, 255, 0.01)',
                                border: '1px solid rgba(255, 255, 255, 0.04)',
                                borderRadius: 6,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                transition: 'all 0.2s',
                                cursor: 'pointer'
                              }}
                              onClick={() => {
                                handleApplyProblemFixInViewOnly(tune, prob);
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.borderColor = 'rgba(88, 166, 255, 0.3)';
                                e.currentTarget.style.background = 'rgba(88, 166, 255, 0.03)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-primary)' }}>{prob.name}</span>
                                <span style={{
                                  fontSize: 8,
                                  color: '#58a6ff',
                                  border: '1px solid rgba(88, 166, 255, 0.2)',
                                  borderRadius: 4,
                                  padding: '1px 4px',
                                  background: 'rgba(88, 166, 255, 0.05)'
                                }}>
                                  一键修复 &rarr;
                                </span>
                              </div>
                              <div style={{ fontSize: 8.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>{prob.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
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
      </>)}

      {showModal && (
        <div style={drawerOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={drawerContentStyle}>
            {/* 1. 全屏工坊页面级顶栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  onClick={closeModal}
                  style={{
                    ...btnSmallStyle,
                    background: 'rgba(255,255,255,0.03)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}
                >
                  ← 返回调校库
                </button>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>🏎</span> 
                  {editingTune ? '地平线改装工坊 · 编辑调校' : '地平线改装工坊 · 新建升级配置'}
                </h2>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={saveTune}
                  style={{
                    ...btnPrimaryStyle,
                    background: 'var(--success)',
                    borderColor: 'rgba(63, 185, 80, 0.4)',
                    padding: '8px 24px',
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  保存此调校
                </button>
              </div>
            </div>

            {/* 2. 新版 3 步分步导航（编辑与新建均展示） */}
            {showModal && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexShrink: 0 }}>
                {[
                  { step: 1, label: editingTune ? '选定车辆 (只读)' : '配置车辆与改装方式' },
                  { step: 2, label: editingTune ? '更改配件升级' : '确认配件升级' },
                  { step: 3, label: '填写与微调参数' }
                ].map((item) => {
                  const isStep1 = item.step === 1;
                  const isClickable = !isStep1 || !editingTune;
                  return (
                    <div
                      key={item.step}
                      onClick={() => {
                        if (isClickable) setWizardStep(item.step);
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: isClickable ? 'pointer' : 'not-allowed',
                        transition: 'all 0.25s ease',
                        background: wizardStep === item.step
                          ? 'var(--accent)'
                          : (wizardStep > item.step ? 'rgba(63,185,80,.15)' : 'rgba(255,255,255,0.03)'),
                        border: `1px solid ${wizardStep === item.step ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}`,
                        color: wizardStep >= item.step ? '#fff' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        opacity: isClickable ? 1 : 0.4
                      }}
                    >
                      <span style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: wizardStep > item.step ? '#3fb950' : (wizardStep === item.step ? '#fff' : 'rgba(255,255,255,0.1)'),
                        color: wizardStep === item.step ? 'var(--accent)' : '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10
                      }}>
                        {wizardStep > item.step ? '✓' : item.step}
                      </span>
                      {item.label}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3.1 步骤 1：选车与方式合并 */}
            {!editingTune && wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflow: 'visible' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, overflow: 'visible' }}>
                  
                  {/* 左：选择车辆 */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--accent)' }}>🚗</span> 选择目标车辆
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 16 }}>
                      后续只会展示这台车在游戏内真实的改装插槽和参数可调范围。
                    </div>
                    <label style={labelStyle}>目标车型</label>
                    <VehicleSearchSelect id="create-vehicle" value={formData.vehicleId} options={vehicleOptions} onChange={selectVehicleForDraft} style={inputStyle} />
                    
                    {formData.vehicleId && (
                      <div style={{
                        marginTop: 16,
                        padding: 12,
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        animation: 'drawerFadeIn 0.3s ease'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>原厂性能指数</span>
                          <div>
                            {renderPiBadge(upgradeShop?.basePi || vehicles[formData.vehicleId]?.pi || vehicles[formData.vehicleId]?.basePi)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>原厂驱动形式</span>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            padding: '3px 8px',
                            borderRadius: 4
                          }}>
                            {(() => {
                              const dt = (upgradeShop?.baseDriveType || currentVehicleStats?.drivetrain || vehicles[formData.vehicleId]?.drivetrain || '').toUpperCase();
                              if (dt === 'FWD') return '前驱 FWD';
                              if (dt === 'RWD') return '后驱 RWD';
                              if (dt === 'AWD') return '四驱 AWD';
                              return dt || '未知';
                            })()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 右：选择升级模式 */}
                  <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#3fb950' }}>⚡</span> 升级改装方式
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 16 }}>
                      您可以手动点选每一项升级配件，或者使用启发式算法智能生成 META 改装。
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <button
                        type="button"
                        onClick={() => chooseBuildMode('manual')}
                        style={{
                          ...btnSmallStyle,
                          padding: '16px 12px',
                          textAlign: 'left',
                          background: buildMode === 'manual' ? 'rgba(56,139,253,0.1)' : 'transparent',
                          borderColor: buildMode === 'manual' ? 'var(--accent)' : 'var(--border)',
                          height: 'auto',
                          borderRadius: 6
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4, color: buildMode === 'manual' ? 'var(--accent)' : 'var(--text-primary)' }}>手动升级改装</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'normal', lineHeight: 1.4 }}>在下一步中逐个选择发动机、轮胎和悬挂组件。</div>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => chooseBuildMode('ai')}
                        style={{
                          ...btnSmallStyle,
                          padding: '16px 12px',
                          textAlign: 'left',
                          background: buildMode === 'ai' ? 'rgba(63,185,80,0.1)' : 'transparent',
                          borderColor: buildMode === 'ai' ? '#3fb950' : 'var(--border)',
                          height: 'auto',
                          borderRadius: 6
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4, color: buildMode === 'ai' ? '#3fb950' : 'var(--text-primary)' }}>AI 一键生成</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'normal', lineHeight: 1.4 }}>按照您期望的 PI 评级与赛事路面倾向为您智能装配。</div>
                      </button>
                    </div>

                    {buildMode === 'ai' && (
                      <div style={{ padding: 14, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 6, animation: 'drawerFadeIn 0.3s ease' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={labelStyle}>赛道用途</label>
                            <select value={aiRaceType} onChange={e => setAiRaceType(e.target.value)} style={inputStyle}>
                              <option value="road">公路/街头赛</option>
                              <option value="dirt">泥地拉力赛</option>
                              <option value="rally">混合路拉力</option>
                              <option value="cross_country">越野拉力赛</option>
                              <option value="drift">漂移横滑</option>
                            </select>
                          </div>
                          <div>
                            <label style={labelStyle}>驱动形式</label>
                            {(() => {
                              const stock = (upgradeShop?.baseDriveType || '').toUpperCase();
                              return (
                                <select value={aiDriveType} onChange={e => setAiDriveType(e.target.value)} style={inputStyle}>
                                  <option value="fwd">前驱 FWD {stock === 'FWD' ? '(原厂)' : ''}</option>
                                  <option value="rwd">后驱 RWD {stock === 'RWD' ? '(原厂)' : ''}</option>
                                  <option value="awd">四驱 AWD {stock === 'AWD' ? '(原厂)' : ''}</option>
                                </select>
                              );
                            })()}
                          </div>
                          <div>
                            <label style={labelStyle}>目标 PI 等级</label>
                            <select value={targetPi} onChange={e => setTargetPi(Number(e.target.value))} style={inputStyle}>
                              {basePi <= 500 && <option value="500">D 500</option>}
                              {basePi <= 600 && <option value="600">C 600</option>}
                              {basePi <= 700 && <option value="700">B 700</option>}
                              {basePi <= 800 && <option value="800">A 800</option>}
                              {basePi <= 900 && <option value="900">S1 900</option>}
                              {basePi <= 998 && <option value="998">S2 998</option>}
                              <option value="999">X 999 (无上限)</option>
                            </select>
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={async () => {
                            const generated = await handleAutoUpgrade({ preferredDriveType: aiDriveType, raceType: aiRaceType });
                            if (generated) {
                              setFormData(prev => ({ ...prev, tags: prev.tags || aiRaceType }));
                              setWizardStep(2); // 跳往确认升级改装这一步
                            }
                          }}
                          style={{ ...btnPrimaryStyle, width: '100%', marginTop: 12, background: '#238636', borderColor: '#2ea44f' }}
                        >
                          智能启发式计算装配
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  {buildMode === 'manual' && (
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      disabled={!formData.vehicleId || !upgradeShop}
                      style={{ ...btnPrimaryStyle, width: 140 }}
                    >
                      {(!upgradeShop && formData.vehicleId) ? '加载配件中...' : '继续选配升级组件'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 3.2 步骤 2：确认配件改装 */}
            {wizardStep === 2 && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>估算改装后 PI 级</span>
                  {renderPiBadge(solutionPi === null ? totalPi : solutionPi)}
                </div>
                
                {buildMode === 'ai' && (
                  <div style={{ padding: '6px 12px', background: 'rgba(35,134,54,0.1)', border: '1px solid rgba(35,134,54,0.3)', borderRadius: 6, color: '#3fb950', fontSize: 10 }}>
                    💡 这是 AI 生成的预选方案。您可以任意更改下方的轮胎、引擎或减震等配件；进入下一步前，最终选定的升级包将自动决定可调参数范围。
                  </div>
                )}
                
                <div style={{
                  background: 'var(--bg-primary)',
                  borderRadius: 8,
                  padding: 16,
                  border: '1px solid var(--border)',
                  overflow: 'auto',
                  flex: 1
                }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    marginBottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>升级组件选配</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                      已选择 {visiblePartCategories.filter(c => {
                        const p = formData.parts[c.id];
                        if (c.tierSystem) return p?.tier && p.tier !== 'stock';
                        return p?.optionId && p.optionId !== 'stock';
                      }).length} 项升级
                    </span>
                  </div>
                  
                  {(() => {
                    if (!upgradeShop || upgradeShop?.status === 'unverified') return null;
                    const partGroupsData = visiblePartCategories.reduce((groups, category) => {
                      const group = category.group || '其他改装';
                      (groups[group] ||= []).push(category);
                      return groups;
                    }, {});
                    return (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflow: 'auto', paddingBottom: 4, flexShrink: 0 }}>
                        {['全部', ...Object.keys(partGroupsData)].map(tabName => {
                          const isSelected = activePartTab === tabName;
                          return (
                            <button
                              key={tabName}
                              type="button"
                              onClick={() => setActivePartTab(tabName)}
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
                              {tabName}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    alignItems: 'start'
                  }}>
                    {!upgradeShop ? (
                      <div style={{ gridColumn: '1 / -1', padding: '40px 12px', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24, animation: 'spin 1.2s linear infinite' }}>⏳</span>
                        <span>正在加载物理车辆升级配件大表... 请稍候</span>
                        <style>{`
                          @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                          }
                        `}</style>
                      </div>
                    ) : upgradeShop?.status === 'unverified' ? (
                      <div style={{ gridColumn: '1 / -1', padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
                        {upgradeShop.message || '请先选择一辆已有改装资料的车辆。'}
                      </div>
                    ) : (() => {
                      const partGroupsData = visiblePartCategories.reduce((groups, category) => {
                        const group = category.group || '其他改装';
                        (groups[group] ||= []).push(category);
                        return groups;
                      }, {});
                      return Object.entries(partGroupsData)
                        .filter(([groupName]) => activePartTab === '全部' || activePartTab === groupName)
                        .map(([group, categories]) => (
                          <React.Fragment key={group}>
                            <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: '4px 2px', borderBottom: '1px solid var(--border)', color: group === '车辆专属' ? '#bc8cff' : 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>
                              {group}
                            </div>
                            {categories.map(cat => {
                              const selectedPart = formData.parts[cat.id];
                              const slotInfo = upgradeShop?.slots?.find(s => s.id === cat.id);
                              return (
                                <PartSelector
                                  key={cat.id}
                                  category={cat}
                                  selected={selectedPart}
                                  slotInfo={slotInfo}
                                  onChange={(tier, optionId) => updatePartSelection(cat.id, tier, optionId)}
                                  defaultDrivetrain={upgradeShop?.baseDriveType}
                                />
                              );
                            })}
                          </React.Fragment>
                        ));
                    })()}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setWizardStep(1)} style={{ ...btnSmallStyle, flex: 1 }}>上一步</button>
                  <button onClick={() => setWizardStep(3)} style={{ ...btnPrimaryStyle, flex: 2 }}>确认配件去调试参数</button>
                </div>
              </div>
            )}

            {/* 3.3 步骤 3 或编辑模式：填写与微调参数（两栏宽屏 Workspace 布局） */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* 左栏：参数设置区域 (可滚动) */}
                <div style={{ flex: 1.15, overflow: 'auto', paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(!editingTune && !upgradeShop?.tuneParameters?.length) ? (
                    <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11 }}>
                      该车型的可调教参数范围正在收集核对中。当前不展示未经验证的调校项目。
                    </div>
                  ) : (
                    <>
                      {TUNE_FIELDS_SCHEMA.map(section => {
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
                                  {[
                                    ['frontDiffAccel', '前差速器加速'], ['frontDiffDecel', '前差速器减速'],
                                    ['rearDiffAccel', '后差速器加速'], ['rearDiffDecel', '后差速器减速']
                                  ].map(([field, label]) => (
                                    <NumberInput
                                      key={field}
                                      label={label}
                                      value={formData.drivetrain[field]}
                                      onChange={v => updateFormField('drivetrain', field, v)}
                                      min={tuneConstraints[`drivetrain.${field}`]?.min ?? 0}
                                      max={tuneConstraints[`drivetrain.${field}`]?.max ?? 100}
                                      step={tuneConstraints[`drivetrain.${field}`]?.step ?? 1}
                                      unit="%"
                                      locked={tuneConstraints[`drivetrain.${field}`]?.locked}
                                      {...ni('drivetrain', field)}
                                    />
                                  ))}
                                  <NumberInput
                                    label="中央差速偏置"
                                    value={formData.drivetrain.diffCenter}
                                    onChange={v => updateFormField('drivetrain', 'diffCenter', v)}
                                    min={tuneConstraints['drivetrain.diffCenter']?.min ?? 0}
                                    max={tuneConstraints['drivetrain.diffCenter']?.max ?? 100}
                                    step={tuneConstraints['drivetrain.diffCenter']?.step ?? 1}
                                    unit="%"
                                    locked={tuneConstraints['drivetrain.diffCenter']?.locked}
                                    {...ni('drivetrain', 'diffCenter')}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (section.kind === 'gearing') {
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
                                <div style={formGridStyle}>
                                  <NumberInput label="终传比" value={formData.drivetrain.finalDrive} onChange={v => updateFormField('drivetrain', 'finalDrive', v)} min={tuneConstraints['drivetrain.finalDrive']?.min ?? 1} max={tuneConstraints['drivetrain.finalDrive']?.max ?? 6} step={tuneConstraints['drivetrain.finalDrive']?.step ?? 0.01} locked={tuneConstraints['drivetrain.finalDrive']?.locked} {...ni('drivetrain', 'finalDrive')} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
                                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gear => (
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
              )
            })}
                    </>
                  )}
                </div>

                {/* 右栏：评级、基本信息与诊断工具面板 (可滚动) */}
                <div style={{ flex: 0.85, overflow: 'auto', background: 'rgba(10, 10, 15, 0.35)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 16, backdropFilter: 'blur(10px)' }}>
                  
                  {/* 1. 性能指数 (PI) 卡片 */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: 8,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>调校最终 PI 级别</span>
                      {renderPiBadge(solutionPi === null ? totalPi : solutionPi)}
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#3fb950' }}>
                        {buildMode === 'ai' ? '预测总 PI' : '系统预估 PI'}
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        color: buildMode === 'ai' && totalPi > targetPi ? '#da3633' : 'var(--success)'
                      }}>
                        {totalPi} PI
                      </span>
                    </div>
                    {buildMode === 'ai' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, fontSize: 9, color: 'var(--text-muted)' }}>
                        <div>原厂: {basePi}</div>
                        <div>配件增量: +{partsPiDelta}</div>
                      </div>
                    )}
                  </div>

                  {/* 基本配置填报 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>调校名称</label>
                      <input
                        value={formData.name}
                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="例如: 街头赛高速弯道调校"
                        style={inputStyle}
                      />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>标签 (逗号分隔)</label>
                        <input
                          value={formData.tags}
                          onChange={e => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                          placeholder="公路, 漂移, 拉力..."
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>适用车型</label>
                        <VehicleSearchSelect id="edit-vehicle" value={formData.vehicleId} options={vehicleOptions} onChange={vehicleId => setFormData(prev => ({ ...prev, vehicleId }))} style={inputStyle} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>手动修改 PI 级</label>
                        <input
                          type="number"
                          min="100"
                          max="999"
                          step="1"
                          value={solutionPi === null ? totalPi : solutionPi}
                          onChange={e => setSolutionPi(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 6 }}>
                        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>系统估算 PI：{totalPi}</span>
                      </div>
                    </div>

                    <div style={{ marginBottom: 6 }}>
                      <label style={labelStyle}>调校笔记与调参描述</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="在此记录调校改动特点..."
                        rows={3}
                        style={{ ...inputStyle, resize: 'none', fontSize: 10, lineHeight: 1.4 }}
                      />
                    </div>
                  </div>

                  {/* 常用驾驶问题面板 + 遥测诊断面板 */}
                  {editingTune && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        {availableSessions.map(session => {
                          const track = session.trackName || session.track || '未知赛道';
                          const car = session.vehicle?.name || (typeof session.vehicle === 'string' ? session.vehicle : null) || session.car || '未知车辆';
                          const dateVal = session.savedAt || session.date || session.createdAt;
                          return (
                            <option key={session.id} value={session.id}>
                              {track} - {car} ({dateVal ? formatDate(dateVal) : '未知时间'})
                            </option>
                          );
                        })}
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
                                Object.entries(params).map(([key, val]) => {
                                  const name = PARAM_NAMES_ZH[key] || key;
                                  const formattedVal = val > 0 ? `+${val}` : `${val}`;
                                  return (
                                    <div key={`${cat}.${key}`} style={{
                                      padding: '2px 6px',
                                      background: 'var(--bg-primary)',
                                      borderRadius: 3,
                                      fontSize: 8,
                                      fontFamily: 'monospace',
                                      color: 'var(--accent)'
                                    }}>
                                      {name}: {formattedVal}
                                    </div>
                                  );
                                })
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
                
                {showModal && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      style={{ ...btnSmallStyle, flex: 1 }}
                    >
                      上一步 (返回选配)
                    </button>
                    <button
                      type="button"
                      onClick={saveTune}
                      style={{ ...btnPrimaryStyle, flex: 1.5, background: 'var(--success)' }}
                    >
                      完成并保存调校
                    </button>
                  </div>
                )}
              </div>
              </div>
            )}
            </div>
            </div>
            )}

            {/* 4. 快捷键提示与页脚 */}
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.4, flexShrink: 0 }}>
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Esc</span> 关闭工作台 &nbsp;&nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+S</span> 保存调校 &nbsp;&nbsp;
              <span style={{ fontFamily: 'monospace', background: 'var(--bg-primary)', padding: '0 3px', borderRadius: 2 }}>Ctrl+D</span> 复制草稿
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
