import React, { useState, useMemo } from 'react';
import { TIER_LABELS } from '../../../data/parts';

export const PartSelector = React.memo(function PartSelector({ category: rawCategory, selected, onChange, defaultDrivetrain = null, slotInfo = null }) {
  const [expanded, setExpanded] = useState(false)

  const category = useMemo(() => {
    if (rawCategory.id === 'drivetrain_swap') {
      const stockType = defaultDrivetrain ? defaultDrivetrain.toUpperCase() : null;
      const zhMap = { FWD: '前驱', RWD: '后驱', AWD: '四驱' };
      const zhName = stockType ? (zhMap[stockType] || stockType) : '原厂';
      
      const nextOptions = rawCategory.options?.filter(opt => {
        if (!stockType) return true;
        return opt.id === 'stock' || opt.id !== stockType.toLowerCase();
      }).map(opt => {
        let label = opt.label;
        if (opt.id === 'stock') {
          label = stockType ? `原厂（${zhName}）` : '原厂';
        }
        const piEstimate = opt.id === 'stock' ? 0 : (opt.piEstimate ?? null);
        return { ...opt, label, piEstimate };
      });
      return { ...rawCategory, options: nextOptions };
    }
    return rawCategory;
  }, [rawCategory, defaultDrivetrain]);

  const effectiveTiers = useMemo(() => {
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
  const selectedColor = selectedTier ? (TIER_LABELS[selectedTier]?.color || '#58a6ff') : '#58a6ff'
  const selectedOption = !category.tierSystem ? category.options?.find(option => option.id === selected?.optionId) : null
  const selectedLabel = selectedTier ? (TIER_LABELS[selectedTier]?.zh || selectedTier) : (selectedOption?.label || '')

  const currentPiBonus = useMemo(() => {
    if (isStock) return 0;
    if (category.tierSystem) {
      const resolvedOpt = slotInfo?.options?.find(o => o.id === selected?.optionId || o.id === selectedTier);
      return resolvedOpt ? (resolvedOpt.piEstimate ?? resolvedOpt.piDeltaFromCurrent) : null;
    } else {
      const activeOpt = slotInfo?.options?.find(o => o.id === selected?.optionId);
      return activeOpt ? (activeOpt.piEstimate ?? activeOpt.piDeltaFromCurrent) : (selectedOption?.piEstimate ?? null);
    }
  }, [isStock, category, selectedOption, selectedTier, selected, slotInfo]);

  const handleSelect = (tier, optionId) => {
    onChange(tier, optionId)
  }

  return (
    <div 
      className={`part-card ${isStock ? '' : 'active'}`}
      style={isStock ? {} : { '--glow-color': selectedColor + '18', borderColor: selectedColor + '44' }}
    >
      <div className="part-header" onClick={() => setExpanded(!expanded)}>
        <span className="part-title" style={{ color: isStock ? 'var(--text-muted)' : 'var(--text-primary)' }}>
          {category.label}
        </span>
        <span 
          className="badge-selected"
          style={{ 
            borderColor: (isStock ? '#8b949e' : selectedColor) + '33', 
            background: (isStock ? '#8b949e' : selectedColor) + '16', 
            color: isStock ? '#8b949e' : selectedColor,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          {isStock ? '原厂' : selectedLabel}
          {!isStock && currentPiBonus !== null && currentPiBonus !== 0 && (
            <span style={{ 
              fontSize: '7.5px', 
              fontWeight: 800, 
              background: 'rgba(63, 185, 80, 0.15)', 
              color: '#3fb950', 
              padding: '1px 4px', 
              borderRadius: '2px',
              marginLeft: '4px'
            }}>
              +{currentPiBonus}
            </span>
          )}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '4px 8px 8px' }}>
          <div style={{ fontSize: 8.5, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 2, lineHeight: 1.3 }}>
            {category.tireWidthSource === 'generic'
              ? '未录入该车型的实测胎宽，以下为通用毫米枚举；选择前请在游戏内确认该尺寸可用。'
              : category.description}
          </div>

          {category.tierSystem ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button
                onClick={() => handleSelect('stock', 'stock')}
                className={`part-opt-btn ${isStock ? 'active' : ''}`}
                style={isStock ? {
                  '--active-border': 'rgba(139, 148, 158, 0.4)',
                  '--active-bg': 'rgba(139, 148, 158, 0.12)',
                  '--active-color': '#8b949e'
                } : {}}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: 2,
                  background: isStock ? '#8b949e' : 'rgba(255,255,255,0.15)'
                }} />
                <span style={{ flex: 1 }}>原厂</span>
                <span className="part-pi-pill" style={{ background: 'rgba(139,148,158,0.06)', color: '#8b949e', border: '1px solid rgba(139,148,158,0.15)' }}>
                  +0PI
                </span>
              </button>

              {(effectiveTiers || []).map(tier => {
                const isActive = selected?.tier === tier.id
                const options = tier.options || []
                
                const resolvedOpt = options.length === 1 
                  ? slotInfo?.options?.find(o => o.id === options[0].id || o.id === tier.id)
                  : null;
                const realPi = resolvedOpt ? (resolvedOpt.piEstimate ?? resolvedOpt.piDeltaFromCurrent) : tier.piBonus;
                const showPi = realPi !== null && realPi !== undefined && realPi !== '';
                const isModelPi = resolvedOpt?.piSource === 'formula_v1' || resolvedOpt?.piConfidence === 'model_estimate';
                const labelPi = `${isModelPi ? '预测 ' : ''}${Number(realPi) > 0 ? '+' : ''}${realPi} PI`;

                return (
                  <div key={tier.id}>
                    {options.length === 1 ? (
                      <button
                        onClick={() => handleSelect(tier.id, options[0].id)}
                        className={`part-opt-btn ${isActive ? 'active' : ''}`}
                        style={isActive ? {
                          '--active-border': tier.color + '55',
                          '--active-bg': tier.color + '1a',
                          '--active-color': tier.color
                        } : {}}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: 2,
                          background: isActive ? tier.color : 'rgba(255,255,255,0.15)'
                        }} />
                        <span style={{ flex: 1 }}>{tier.label}</span>
                        {showPi && Number(realPi) !== 0 && (
                          <span className={`part-pi-pill ${Number(realPi) < 0 ? 'negative' : ''}`}>
                            {labelPi}
                          </span>
                        )}
                        {showPi && Number(realPi) === 0 && (
                          <span className="part-pi-pill" style={{ background: 'rgba(139,148,158,0.06)', color: '#8b949e', border: '1px solid rgba(139,148,158,0.15)' }}>
                            +0 PI
                          </span>
                        )}
                      </button>
                    ) : (
                      <div style={{ padding: '2px 0' }}>
                        <div style={{
                          fontSize: 9,
                          color: tier.color,
                          fontWeight: 700,
                          padding: '3px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: 2,
                            background: options.some(o => o.id === selected?.optionId) ? tier.color : 'rgba(255,255,255,0.15)'
                          }} />
                          {tier.label}
                          {showPi && Number(realPi) !== 0 && (
                            <span className={`part-pi-pill ${Number(realPi) < 0 ? 'negative' : ''}`} style={{ marginLeft: 3 }}>
                              {labelPi}
                            </span>
                          )}
                        </div>
                        <div style={{ paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 1 }}>
                          {options.map(opt => {
                            const subOpt = slotInfo?.options?.find(o => o.id === opt.id);
                            const subPi = subOpt ? (subOpt.piEstimate ?? subOpt.piDeltaFromCurrent) : null;
                            const subLabelPi = subPi !== null && subPi !== undefined ? `${Number(subPi) > 0 ? '+' : ''}${subPi} PI` : '';
                            return (
                              <button
                                key={opt.id}
                                onClick={() => handleSelect(tier.id, opt.id)}
                                className="part-opt-btn"
                                style={selected?.optionId === opt.id ? {
                                  background: tier.color + '16',
                                  color: tier.color,
                                  fontWeight: 700,
                                  paddingLeft: 12,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                } : { paddingLeft: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              >
                                <span>{opt.label}</span>
                                {subLabelPi && (
                                  <span className={`part-pi-pill ${Number(subPi) < 0 ? 'negative' : ''}`} style={{ fontSize: 7.5, transform: 'scale(0.9)', marginRight: 4 }}>
                                    {subLabelPi}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(category.options || []).map(opt => {
                const isActive = selected?.optionId === opt.id || (!selected?.optionId && opt.id === 'stock')
                const color = opt.color || '#8b949e'
                const rawPi = opt.piDeltaFromCurrent ?? opt.piEstimate ?? opt.piBonus
                const hasKnownPi = rawPi !== null && rawPi !== '' && Number.isFinite(Number(rawPi))
                const isModelPi = opt.piSource === 'formula_v1' || opt.piConfidence === 'model_estimate'
                const piLabel = `${isModelPi ? '预测 ' : ''}${Number(rawPi) > 0 ? '+' : ''}${Number(rawPi)} PI`
                const isVerifiedZero = hasKnownPi && Number(rawPi) === 0 && opt.id === 'stock'
                const zeroPiLabel = isModelPi ? '预测 +0 PI' : '原厂 +0 PI'
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelect(undefined, opt.id)}
                    className={`part-opt-btn ${isActive ? 'active' : ''}`}
                    style={isActive ? {
                      '--active-border': color + '55',
                      '--active-bg': color + '1a',
                      '--active-color': color
                    } : {}}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 2,
                      background: isActive ? color : 'rgba(255,255,255,0.15)'
                    }} />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {category.sizeDisplay && opt.id !== 'stock' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontSize: 8, color: '#bc8cff', padding: '1px 4px', borderRadius: 3, background: 'rgba(188,140,255,0.08)', border: '1px solid rgba(188,140,255,0.2)' }}>尺寸</span>
                        {hasKnownPi && Number(rawPi) !== 0 && (
                          <span className={`part-pi-pill ${Number(rawPi) < 0 ? 'negative' : ''}`}>
                            {piLabel}
                          </span>
                        )}
                        {hasKnownPi && Number(rawPi) === 0 && (
                          <span style={{ fontSize: 8, color: isVerifiedZero ? '#8b949e' : '#d29922', padding: '1px 4px', borderRadius: 3 }}>{zeroPiLabel}</span>
                        )}
                      </span>
                    ) : (
                      <>
                        {hasKnownPi && Number(rawPi) !== 0 && (
                          <span className={`part-pi-pill ${Number(rawPi) < 0 ? 'negative' : ''}`}>
                            {piLabel}
                          </span>
                        )}
                        {hasKnownPi && Number(rawPi) === 0 && opt.id !== 'stock' && (
                          <span style={{ fontSize: 8, color: isVerifiedZero ? '#8b949e' : '#d29922', padding: '1px 4px', borderRadius: 3, background: isVerifiedZero ? 'rgba(139,148,158,0.08)' : 'rgba(210,153,34,0.08)', border: `1px solid ${isVerifiedZero ? 'rgba(139,148,158,0.15)' : 'rgba(210,153,34,0.22)'}` }}>{zeroPiLabel}</span>
                        )}
                        {!hasKnownPi && opt.id !== 'stock' && (
                          <span style={{ fontSize: 8, color: 'var(--text-muted)', padding: '1px 4px' }}>公式推算中</span>
                        )}
                      </>
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
