import { useState, useEffect, useRef } from 'react';

export function VehicleSearchSelect({ id, value, options, onChange, className, style, placeholder = '输入品牌、年份或车型搜索' }) {
  const selected = options.find(option => String(option.id) === String(value));
  const [query, setQuery] = useState(selected?.name || '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(options.find(option => String(option.id) === String(value))?.name || '');
  }, [value, options]);

  // 点击外部自动收起下拉框
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        // 如果没有匹配到任何选项，回滚为之前选中的名字
        if (selected) {
          setQuery(selected.name);
        } else {
          setQuery('');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selected]);

  const filteredOptions = options.filter(option => 
    option.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        value={query}
        placeholder={placeholder}
        onFocus={() => setIsOpen(true)}
        onChange={event => {
          const next = event.target.value;
          setQuery(next);
          setIsOpen(true);
          const matched = options.find(option => option.name.toLowerCase() === next.trim().toLowerCase());
          if (matched) {
            onChange(String(matched.id));
          } else if (!next) {
            onChange('');
          }
        }}
        className={className}
        style={{ ...style, width: '100%', boxSizing: 'border-box' }}
      />
      {/* 下拉面板 */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          maxHeight: '260px',
          overflowY: 'auto',
          background: 'rgba(21, 26, 35, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          padding: '4px'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map(option => {
              const isCurrent = String(option.id) === String(value);
              return (
                <div
                  key={option.id}
                  onClick={() => {
                    onChange(String(option.id));
                    setQuery(option.name);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: isCurrent ? 'var(--accent)' : 'var(--text-primary)',
                    background: isCurrent ? 'rgba(88, 166, 255, 0.12)' : 'transparent',
                    transition: 'background 0.15s ease',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  }}
                  onMouseLeave={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {option.name}
                </div>
              );
            })
          ) : (
            <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              未找到匹配车型
            </div>
          )}
        </div>
      )}
    </div>
  );
}
