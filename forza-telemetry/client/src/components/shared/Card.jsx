import React from 'react';

export function Card({ title, children, style = {}, accent = false }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      padding: 12,
      borderRadius: 8,
      border: accent ? '1px solid var(--accent)' : '1px solid var(--border)',
      ...style
    }}>
      {title && (
        <div style={{ 
          fontSize: 10, 
          color: 'var(--text-secondary)', 
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}