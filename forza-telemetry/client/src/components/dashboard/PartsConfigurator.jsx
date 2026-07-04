import React from 'react'
import { PART_CATEGORIES, TIER_LABELS } from '../../data/parts'

const TIERS = ['stock', 'street', 'sport', 'race', 'extreme']

export function PartsConfigurator({ parts = {}, onChange }) {
  const handleTierChange = (categoryId, tier) => {
    if (!onChange) return
    const updatedParts = { ...parts }
    updatedParts[categoryId] = { ...updatedParts[categoryId], tier }
    onChange(updatedParts)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      padding: 16,
      color: 'var(--text-main)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: 8,
        marginBottom: 4
      }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>改装配件配置 (Build Config)</h3>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>UDP不发配件，请手动匹配游戏改装</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10,
        maxHeight: 400,
        overflowY: 'auto',
        paddingRight: 4
      }}>
        {PART_CATEGORIES.filter(cat => cat.tierSystem).map(cat => {
          const currentTier = parts[cat.id]?.tier || 'stock'

          return (
            <div key={cat.id} style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 6,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              {/* 配件名与说明 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{cat.labelEn}</span>
              </div>

              {/* 升级等级按钮组 */}
              <div style={{ display: 'flex', gap: 4 }}>
                {TIERS.map(tier => {
                  const labelInfo = TIER_LABELS[tier]
                  const isSelected = currentTier === tier
                  
                  return (
                    <button
                      key={tier}
                      onClick={() => handleTierChange(cat.id, tier)}
                      style={{
                        flex: 1,
                        background: isSelected ? labelInfo.color : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (isSelected ? labelInfo.color : 'rgba(255,255,255,0.1)'),
                        color: isSelected ? '#000' : 'var(--text-main)',
                        fontSize: 9,
                        fontWeight: isSelected ? 800 : 500,
                        padding: '4px 0',
                        borderRadius: 4,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title={labelInfo.zh}
                    >
                      {labelInfo.en}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      
      <style>{`
        /* 自定义美化滚动条 */
        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
        }
        ::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--accent);
        }
      `}</style>
    </div>
  )
}
