import { useState, useEffect, useRef } from 'react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';

export function AICoachPanel({ sessionId }) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [report, setReport] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  
  // 环境变量配置输入状态
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [model, setModel] = useState('qwen3.7-plus');
  const [savingKey, setSavingKey] = useState(false);

  // 趣言轮播（加载时循环展示）
  const [loadingTip, setLoadingTip] = useState('正在提取弯角出入速度...');
  const tipTimerRef = useRef(null);

  const tips = [
    '正在提取弯角出入车速与物理档位...',
    '正在扫描刹车点 G 力载荷变化...',
    '正在分析出弯油门开度与动力衔接...',
    '正在比对车辆极限弯心速度物理边界...',
    '正在评估整体驾驶平顺性与多圈方差...',
    '正在为您量身定制下一步行动提升清单...',
    'AI 正在提笔为您撰写诊断报告...'
  ];

  const fetchStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/analysis/${sessionId}/ai-coach`);
      if (res.ok) {
        const data = await res.json();
        setKeyConfigured(data.keyConfigured);
        if (data.status === 'success') {
          setReport(data.report);
        } else {
          setReport('');
        }
      }
    } catch (e) {
      console.error('[AI Coach] 获取状态失败:', e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => {
      if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    };
  }, [sessionId]);

  // 开始循环提示词
  const startTipRotation = () => {
    let idx = 0;
    setLoadingTip(tips[0]);
    if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    tipTimerRef.current = setInterval(() => {
      idx = (idx + 1) % tips.length;
      setLoadingTip(tips[idx]);
    }, 2500);
  };

  // 生成 AI 报告
  const generateReport = async () => {
    setLoading(true);
    startTipRotation();
    try {
      const res = await fetch(`/api/analysis/${sessionId}/ai-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.status === 403) {
        setKeyConfigured(false);
        toast('请配置您的百炼 API Key', 'error');
        return;
      }

      if (!res.ok) {
        throw new Error('网络请求异常');
      }

      const data = await res.json();
      if (data.status === 'success') {
        setReport(data.report);
        toast('AI 驾驶诊断报告生成成功！', 'success');
      } else {
        toast(data.error || '生成失败，请稍后重试', 'error');
      }
    } catch (e) {
      console.error('[AI Coach] 生成失败:', e);
      toast('调用 AI 接口失败，请检查网络或 API 配置', 'error');
    } finally {
      setLoading(false);
      if (tipTimerRef.current) {
        clearInterval(tipTimerRef.current);
        tipTimerRef.current = null;
      }
    }
  };

  // 保存 API Key
  const saveApiKey = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast('请输入 API Key', 'error');
      return;
    }
    setSavingKey(true);
    try {
      const res = await fetch('/api/settings/dashscope-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() })
      });
      if (res.ok) {
        toast('API 配置保存成功！', 'success');
        setKeyConfigured(true);
        setApiKey('');
        // 保存成功后触发生成
        generateReport();
      } else {
        toast('配置保存失败', 'error');
      }
    } catch (err) {
      console.error('[Settings] 保存配置失败:', err);
      toast('请求失败，请稍后重试', 'error');
    } finally {
      setSavingKey(false);
    }
  };

  // 极简高性能 Markdown 渲染引擎
  const renderMarkdown = (mdText) => {
    if (!mdText) return null;
    
    // 按行切分进行渲染
    const lines = mdText.split('\n');
    let insideList = false;
    let listItems = [];
    const elements = [];

    const flushList = (keyPrefix) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list_${keyPrefix}`} style={{ paddingLeft: 20, margin: '8px 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listItems}
          </ul>
        );
        listItems = [];
        insideList = false;
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // 解析粗体文字
      const parseInline = (text) => {
        const parts = [];
        let cur = text;
        const regex = /\*\*(.*?)\*\*/g;
        let match;
        let lastIdx = 0;

        while ((match = regex.exec(text)) !== null) {
          const before = text.substring(lastIdx, match.index);
          if (before) parts.push(before);
          parts.push(<strong key={`bold_${match.index}`} style={{ color: '#58a6ff' }}>{match[1]}</strong>);
          lastIdx = regex.lastIndex;
        }
        
        const after = text.substring(lastIdx);
        if (after) parts.push(after);

        return parts.length > 0 ? parts : text;
      };

      // 1. 标题类解析
      if (trimmed.startsWith('# ')) {
        flushList(idx);
        elements.push(<h2 key={idx} style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', borderBottom: '1px solid var(--border)', paddingBottom: 6, margin: '20px 0 12px' }}>{parseInline(trimmed.substring(2))}</h2>);
      } else if (trimmed.startsWith('## ')) {
        flushList(idx);
        elements.push(<h3 key={idx} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '18px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>{parseInline(trimmed.substring(3))}</h3>);
      } else if (trimmed.startsWith('### ')) {
        flushList(idx);
        elements.push(<h4 key={idx} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 8px' }}>{parseInline(trimmed.substring(4))}</h4>);
      }
      // 2. 检查单解析 (TODO Checklist)
      else if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ')) {
        insideList = true;
        const checked = trimmed.startsWith('- [x] ');
        const text = trimmed.substring(6);
        listItems.push(
          <li key={idx} style={{ listStyleType: 'none', display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={checked} readOnly style={{ marginTop: 2, accentColor: '#3fb950', cursor: 'default' }} />
            <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
              {parseInline(text)}
            </span>
          </li>
        );
      }
      // 3. 无序列表解析
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        insideList = true;
        const text = trimmed.substring(2);
        listItems.push(
          <li key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {parseInline(text)}
          </li>
        );
      }
      // 4. 水平分割线
      else if (trimmed === '---') {
        flushList(idx);
        elements.push(<hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />);
      }
      // 5. 空白行
      else if (!trimmed) {
        flushList(idx);
      }
      // 6. 普通段落
      else {
        flushList(idx);
        elements.push(
          <p key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 10px 0' }}>
            {parseInline(trimmed)}
          </p>
        );
      }
    });

    // 扫尾列表
    flushList('end');

    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 18,
        color: 'var(--text-primary)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        {elements}
      </div>
    );
  };

  if (checking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 12 }}>
        <LoadingSpinner />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>正在检查 AI 模块状态...</span>
      </div>
    );
  }

  // 状态 A：API Key 未配置
  if (!keyConfigured) {
    return (
      <div style={{ maxWidth: 460, margin: '20px auto', padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>🤖</span>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 4px' }}>配置阿里百炼大模型服务</h2>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            系统通过阿里云百炼大模型（Qwen3.7-Plus）为您提供深度的赛后驾驶风格诊断与弯道攻防报告。请在此处输入您的 API 密钥以启用该服务。
          </p>
        </div>

        <form onSubmit={saveApiKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>百炼 API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>百炼 OpenAI 兼容端点</label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>选择模型</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={selectStyle}
            >
              <option value="qwen3.7-plus">qwen3.7-plus (推荐，最新智能体)</option>
              <option value="qwen-plus">qwen-plus (中端主力)</option>
              <option value="qwen-max">qwen-max (旗舰推理模型)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={savingKey}
            style={{
              padding: '8px 16px', background: 'var(--accent)', border: 'none',
              borderRadius: 6, color: '#fff', fontWeight: 600, fontSize: 11,
              cursor: 'pointer', opacity: savingKey ? 0.7 : 1, transition: 'all 0.2s'
            }}
          >
            {savingKey ? '正在保存...' : '保存配置并生成诊断建议'}
          </button>
        </form>
      </div>
    );
  }

  // 加载中状态
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16 }}>
        <LoadingSpinner />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>AI 教练正在紧张评估中...</div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, minHeight: 14, fontStyle: 'italic' }}>
            {loadingTip}
          </div>
        </div>
      </div>
    );
  }

  // 状态 B：未生成报告
  if (!report) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, border: '1px dashed var(--border)', borderRadius: 8, background: 'rgba(255,255,255,0.01)' }}>
        <span style={{ fontSize: 36, marginBottom: 12 }}>🏁</span>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px 0' }}>本场赛后 AI 驾驶诊断报告尚未生成</h3>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 380, lineHeight: 1.5, margin: '0 0 16px 0' }}>
          大模型将分析本场最佳圈的每个弯心车速、起步换挡时机、刹车滑行时长及打滑数据，给出赛道大师级别的切角和操盘建议。
        </p>
        <button onClick={generateReport} style={{
          padding: '8px 18px', background: '#3fb950', border: 'none',
          borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 12,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 3px 6px rgba(63,185,80,0.2)'
        }}>
          ⚡ 生成 AI 驾驶教练报告
        </button>
      </div>
    );
  }

  // 状态 C：报告渲染
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 报告头部选项栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🤖</span>
          <span style={{ fontSize: 11, fontWeight: 600 }}>AI 驾驶教练诊断 (基于 {model})</span>
        </div>
        <button onClick={generateReport} style={{
          padding: '4px 10px', background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)', borderRadius: 5,
          color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer',
          transition: 'all 0.2s'
        }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
          重新分析并生成
        </button>
      </div>

      {/* 报告内容 */}
      {renderMarkdown(report)}
    </div>
  );
}

// 统一复用的样式定义
const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
  marginTop: 4
};

const selectStyle = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 11,
  outline: 'none',
  marginTop: 4,
  cursor: 'pointer'
};
