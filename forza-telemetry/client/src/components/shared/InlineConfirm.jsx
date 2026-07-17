import React from 'react';

export function InlineConfirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0,
      background: '#1c2128', border: '1px solid #da3633',
      borderRadius: 4, padding: '6px 8px', zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      minWidth: 120
    }}>
      <div style={{ fontSize: 10, color: '#f85149', fontWeight: 600 }}>{message}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }} 
          style={{
            flex: 1, padding: '3px 8px', fontSize: 9,
            background: '#da3633', color: '#fff', border: 'none',
            borderRadius: 3, cursor: 'pointer', fontWeight: 600
          }}
        >
          确定
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }} 
          style={{
            flex: 1, padding: '3px 8px', fontSize: 9,
            background: '#30363d', color: '#c9d1d9',
            border: '1px solid #484f58', borderRadius: 3, cursor: 'pointer'
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
