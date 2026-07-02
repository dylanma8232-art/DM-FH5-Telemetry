import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('组件渲染错误:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          background: 'rgba(248,81,73,0.08)',
          border: '1px solid rgba(248,81,73,0.3)',
          borderRadius: 'var(--radius-lg, 8px)',
          color: '#f85149',
          fontSize: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠ 组件加载失败</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            {this.props.name || '未知组件'} 渲染出错
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '4px 12px',
              background: 'rgba(248,81,73,0.15)',
              border: '1px solid rgba(248,81,73,0.4)',
              borderRadius: 4,
              color: '#f85149',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
