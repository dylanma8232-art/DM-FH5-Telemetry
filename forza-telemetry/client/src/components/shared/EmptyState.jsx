export function EmptyState({ icon = '📭', title = '暂无数据', description = '', action = null }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      gap: 12,
      color: 'var(--text-secondary)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}>{description}</div>
      )}
      {action && (
        <div style={{ marginTop: 8 }}>{action}</div>
      )}
    </div>
  );
}
