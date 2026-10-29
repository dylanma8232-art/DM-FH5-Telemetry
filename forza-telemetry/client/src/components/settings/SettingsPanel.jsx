import React, { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { themes } from '../../themes';
import { api } from '../../services/api';
import { API_KEY_PLACEHOLDER } from '../../utils/constants';

const fieldControlStyle = {
  width: '100%',
  padding: 8,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 11
};

export function SettingsPanel({ onClose }) {
  const { settings, updateSetting, updatePreferences,  resetSettings, exportSettings, importSettings } = useSettings();
  const [activeTab, setActiveTab] = useState('theme');
  const fileInputRef = useRef(null);
  const backupFileRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        await importSettings(file);
        alert('设置已导入');
      } catch (err) {
        alert('导入失败: ' + err.message);
      }
    }
  };

  const [serverUrl, setServerUrl] = useState(() => {
    try { return localStorage.getItem('serverUrl') || ''; } catch (e) { return ''; }
  });

  // AI 环境变量配置状态
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [model, setModel] = useState('qwen3.7-plus');
  const [savingKey, setSavingKey] = useState(false);
  const [loadingKey, setLoadingKey] = useState(false);

  useEffect(() => {
    if (activeTab === 'ai') {
      setLoadingKey(true);
      api.system.getDashscopeKey()
        .then(data => {
          setApiKey(data.apiKey || '');
          setBaseUrl(data.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
          setModel(data.model || 'qwen3.7-plus');
        })
        .catch(err => console.error('获取 API 配置失败:', err))
        .finally(() => setLoadingKey(false));
    }
  }, [activeTab]);

  const handleSaveAiConfig = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      alert('请输入 API Key');
      return;
    }
    setSavingKey(true);
    try {
      await api.system.setDashscopeKey({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() });
      alert('AI 密钥配置已成功保存！');
    } catch (err) {
      console.error('[Settings] 保存配置失败:', err);
      alert(err.status ? '配置保存失败' : '请求失败，请稍后重试');
    } finally {
      setSavingKey(false);
    }
  };

  const tabs = [
    { id: 'theme', label: '主题' },
    { id: 'preferences', label: '偏好' },
    { id: 'speech', label: '语音播报' },
    { id: 'network', label: '网络' },
    { id: 'data', label: '数据' },
    { id: 'ai', label: 'AI 配置' },
    { id: 'help', label: '指标说明' }
  ];

  // 语音播报设置
  const ttsRate = settings.tts?.rate ?? 0.9;
  const ttsVoiceName = settings.tts?.voiceName ?? '';

  // 获取系统可用中文语音列表
  const [availableVoices, setAvailableVoices] = React.useState([]);
  React.useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      // 优先列出中文语音，如果没有则显示所有语音
      const zhVoices = voices.filter(v => v.lang.includes('zh') || v.lang.includes('CHN'));
      setAvailableVoices(zhVoices.length > 0 ? zhVoices : voices);
    };
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      zIndex: 1000,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 10,
        padding: 20,
        maxWidth: 600,
        width: '90%',
        maxHeight: '85vh',
        overflow: 'auto',
        border: '1px solid var(--border)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>设置</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 20,
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 12px',
                background: activeTab === tab.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: activeTab === tab.id ? '#fff' : 'var(--text-primary)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === 'theme' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              选择主题
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {Object.values(themes).map(theme => (
                <div
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id)}
                  style={{
                    padding: 12,
                    background: theme.colors.bgPrimary,
                    border: settings.theme === theme.id ? '2px solid var(--accent)' : '2px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textPrimary, marginBottom: 4 }}>
                    {theme.name}
                  </div>
                  <div style={{ fontSize: 9, color: theme.colors.textSecondary }}>
                    {theme.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'preferences' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              偏好设置
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                速度单位
              </label>
              <select
                value={settings.preferences.speedUnit}
                onChange={(e) => updatePreferences('speedUnit', e.target.value)}
                style={fieldControlStyle}
              >
                <option value="kmh">km/h</option>
                <option value="mph">mph</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                温度单位
              </label>
              <select
                value={settings.preferences.tempUnit}
                onChange={(e) => updatePreferences('tempUnit', e.target.value)}
                style={fieldControlStyle}
              >
                <option value="celsius">°C</option>
                <option value="fahrenheit">°F</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                G力小数位
              </label>
              <select
                value={settings.preferences.gForceDecimals}
                onChange={(e) => updatePreferences('gForceDecimals', parseInt(e.target.value))}
                style={fieldControlStyle}
              >
                <option value={1}>1位</option>
                <option value={2}>2位</option>
                <option value={3}>3位</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={settings.preferences.warningSound}
                  onChange={(e) => updatePreferences('warningSound', e.target.checked)}
                />
                预警音效
              </label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <input
                  type="checkbox"
                  checked={settings.preferences.warningVisualEffects}
                  onChange={(e) => updatePreferences('warningVisualEffects', e.target.checked)}
                />
                预警动画效果
              </label>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              网络设置（用于手机/副屏通过局域网连接）
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                服务器地址
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="例如: http://192.168.1.5:3001"
                style={fieldControlStyle}
              />
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                留空表示自动连接当前主机。修改后需刷新页面生效。
              </div>
            </div>
            <button
              onClick={() => {
                try {
                  if (serverUrl.trim()) {
                    localStorage.setItem('serverUrl', serverUrl.trim());
                  } else {
                    localStorage.removeItem('serverUrl');
                  }
                  alert('已保存，请刷新页面生效');
                } catch (e) {
                  alert('保存失败');
                }
              }}
              style={{
                padding: '6px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11
              }}
            >
              保存并应用
            </button>
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-primary)', borderRadius: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>使用说明：</div>
              <div>1. 确保手机和电脑在同一WiFi下</div>
              <div>2. 在手机浏览器访问电脑IP:3001</div>
              <div>3. 设置服务器地址为 http://电脑IP:3001</div>
              <div>4. 刷新页面即可连接</div>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              数据备份与恢复
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                导出所有数据（赛道、车辆、比赛记录、调校方案）为一个压缩备份文件。
              </div>
              <button
                onClick={() => {
                  window.location.href = '/api/backup/export';
                }}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  width: '100%'
                }}
              >
                导出全量备份
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                从备份文件恢复数据。恢复前会自动备份当前数据。
              </div>
              <button
                onClick={() => backupFileRef.current?.click()}
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  width: '100%'
                }}
              >
                选择备份文件恢复
              </button>
              <input
                ref={backupFileRef}
                type="file"
                accept=".json.gz,.json"
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (!confirm('确定恢复数据？当前数据将自动备份。')) {
                    e.target.value = '';
                    return;
                  }
                  try {
                    const buf = await file.arrayBuffer();
                    const res = await api.backup.restoreResponse(buf);
                    const data = await res.json();
                    if (data.success) {
                      alert(data.message);
                    } else {
                      alert('恢复失败: ' + (data.error || '未知错误'));
                    }
                  } catch (err) {
                    alert('恢复失败: ' + err.message);
                  } finally {
                    e.target.value = '';
                  }
                }}
                style={{ display: 'none' }}
              />
            </div>

            <div style={{ padding: 10, background: 'var(--bg-primary)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-secondary)' }}>说明：</div>
              <div>备份文件包含所有JSON数据（赛道、车辆、比赛记录、调校）。</div>
              <div>恢复操作会自动将当前数据备份到 data_backup_时间戳 目录。</div>
              <div>建议定期导出备份以防数据丢失。</div>
            </div>
          </div>
        )}

        {activeTab === 'help' && (
          <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: 8 }}>
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
              📖 遥测核心物理指标说明
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 11, lineHeight: 1.5 }}>
              
              <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                <strong style={{ color: '#ff7b72', display: 'block', marginBottom: 4 }}>1. 滑移率</strong>
                <span>• <b>概念</b>：车轮转动的线速度与车身实际移动速度的相对比例。
                <br />• <b>正数（如 +0.5）</b>：表示轮胎比车子跑得快，通常在大脚油门导致轮胎“挠地打滑”（烧胎空转）时触发，TCS（循迹控制系统）会在此状态下介入。
                <br />• <b>负数（如 -0.5）</b>：表示轮胎比车子跑得慢，表示重踩刹车时轮胎被“抱死拖行”（当达到 -1.0 时代表轮胎百分之百不转，纯粹滑行），ABS（防抱死系统）通常会被此数据触发。</span>
              </div>

              <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                <strong style={{ color: '#56d364', display: 'block', marginBottom: 4 }}>2. 抓地力</strong>
                <span>• <b>概念</b>：基于横向打滑（侧滑/漂移角）与纵向打滑（加速/刹车）合成出的综合地面附着力百分比。
                <br />• <b>完美抓地 (100%)</b>：车轮没有发生任何滑移，物理极限富余充足。
                <br />• <b>滑移阶段 (50%~80%)</b>：车辆开始出现微小的打滑，在弯道或重刹制动中非常多见，处于循迹极限边缘。
                <br />• <b>失控打转 ({"<"}30%)</b>：轮胎完全失去与地面附着（Combined Slip 超过 1.0），车辆极易开始失控打摆或原地打转。</span>
              </div>

              <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                <strong style={{ color: '#e3b341', display: 'block', marginBottom: 4 }}>3. 轮速差</strong>
                <span>• <b>显示格式</b>：例如「42.3 km/h (+2.1)」。
                <br />• <b>基础数值 (42.3)</b>：指该轮胎当前根据旋转圈数换算出来的实时相对轮速。
                <br />• <b>括号数值 (+2.1)</b>：当前轮速减去车身实际车速的差值。
                <br />• <b>赛道应用</b>：正数太大表示该侧轮胎正在空转打滑（浪费马力，差速器把动力全传给了轻载轮）；负数太大代表该轮制动过度被锁死拖地（推头打滑）。数值差在 ±3.0 km/h 内表示正常紧贴地面。</span>
              </div>

              <div style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                <strong style={{ color: '#79c0ff', display: 'block', marginBottom: 4 }}>4. 避震行程</strong>
                <span>• <b>概念</b>：弹簧阻尼器的压缩程度（100% 为拉长悬空，0% 为压实压满）。
                <br />• <b>过度压缩 ({"<"}25%)</b>：车辆重心转移或高速下压力将弹簧彻底压死。底盘此时极其贴地，若压上高路肩或发生重力着陆，极易拖底。
                <br />• <b>过度伸展 ({">"}75%)</b>：车轮载荷丧失。车辆在飞坡或激烈弯道中内侧轮翘起时，避震被拉伸，车轮离地，无法继续传递驱动力。</span>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
              阿里云百炼平台大模型服务密钥与参数配置。在此配置后，AI 驾驶教练诊断将在本机会话中直接生效并存入本地 .env 环境变量。
            </div>
            {loadingKey ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                正在加载现有 AI 配置...
              </div>
            ) : (
              <form onSubmit={handleSaveAiConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    百炼 API 密钥
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={API_KEY_PLACEHOLDER}
                    style={fieldControlStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    百炼兼容接口端点
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    style={fieldControlStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    默认评估模型
                  </label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 8,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="qwen3.7-plus">qwen3.7-plus (最新智能体推理模型，推荐)</option>
                    <option value="qwen-plus">qwen-plus (中端高性价比模型)</option>
                    <option value="qwen-max">qwen-max (旗舰最高智能模型)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingKey}
                  style={{
                    marginTop: 8,
                    padding: '8px 16px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'pointer',
                    opacity: savingKey ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {savingKey ? '正在保存...' : '保存 AI 配置'}
                </button>
              </form>
            )}
          </div>
        )}

        {activeTab === 'speech' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              选择语音并调节语速，设置立即生效，下次播报时采用新配置。
            </div>

            {/* 语音选择 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>选择语音</div>
              {availableVoices.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>
                  未检测到可用语音，播报将使用系统默认语音
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* 系统默认选项 */}
                  <button
                    onClick={() => updateSetting('tts.voiceName', '')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: ttsVoiceName === '' ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: ttsVoiceName === '' ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)',
                      color: ttsVoiceName === '' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: ttsVoiceName === '' ? 700 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s'
                    }}
                  >
                    系统默认
                  </button>
                  {/* 列出具体语音 */}
                  {availableVoices.map(v => (
                    <button
                      key={v.name}
                      onClick={() => updateSetting('tts.voiceName', v.name)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: ttsVoiceName === v.name ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: ttsVoiceName === v.name ? 'rgba(88,166,255,0.15)' : 'var(--bg-tertiary)',
                        color: ttsVoiceName === v.name ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: ttsVoiceName === v.name ? 700 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>{v.name}</span>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>{v.lang}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 语速 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>语速</div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  background: 'rgba(88,166,255,0.1)',
                  padding: '2px 10px',
                  borderRadius: 4,
                  minWidth: 40,
                  textAlign: 'center'
                }}>
                  {ttsRate.toFixed(1)}x
                </div>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={ttsRate}
                onChange={e => updateSetting('tts.rate', parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                <span>慢 0.5x</span>
                <span>正常 1.0x</span>
                <span>快 2.0x</span>
              </div>
            </div>

            {/* 试听按钮 */}
            <button
              onClick={() => {
                if (!window.speechSynthesis) return;
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance('左三，接右二，注意！');
                u.rate = ttsRate;
                const voices = window.speechSynthesis.getVoices();
                let voice = null;
                if (ttsVoiceName) {
                  voice = voices.find(v => v.name === ttsVoiceName);
                }
                if (!voice) {
                  voice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CHN'));
                }
                if (voice) u.voice = voice;
                window.speechSynthesis.speak(u);
              }}
              style={{
                padding: '9px 0',
                background: 'rgba(63,185,80,0.12)',
                border: '1px solid rgba(63,185,80,0.35)',
                borderRadius: 6,
                color: '#3fb950',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              试听效果
            </button>
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)'
        }}>
          <button
            onClick={exportSettings}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 11
            }}
          >
            导出设置
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 11
            }}
          >
            导入设置
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => {
              if (confirm('确定重置所有设置？')) {
                resetSettings();
              }
            }}
            style={{
              padding: '6px 12px',
              background: 'var(--danger)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
              marginLeft: 'auto'
            }}
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
