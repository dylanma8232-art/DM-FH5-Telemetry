# 赛道管理模块 - Round 6-10 迭代方案

## 迭代日期
2026-07-01

## 修改范围

| 文件 | 变更类型 |
|------|---------|
| `server/src/index.js` | Round 6/7/9 功能增强 |
| `client/src/components/pages/TrackManagerPage.jsx` | Round 7/8/9/10 功能增强与清理 |
| `client/src/components/pages/DashboardPage.jsx` | Round 6 功能增强 |
| `client/src/components/pages/SessionHistoryPage.jsx` | Round 7 附带修复 |

---

## Round 6: 赛道重命名同步优化

### 需求
赛道改名时，如果仪表盘正在使用该赛道（赛道模式），需要通过 socket 通知前端实时同步名称。

### 修改方案

#### 6.1 服务端 - PUT /api/tracks/:id 路由中添加 socket 通知

在赛道改名成功并保存后，通过 `io.emit` 向所有连接的客户端广播：

```js
// Round 6: 通知前端赛道已更新（改名同步到仪表盘等页面）
io.emit('trackUpdated', { trackId: req.params.id, name: tracks[req.params.id].name });
```

位置：`server/src/index.js` PUT `/api/tracks/:id` 路由内，`saveJSON` 之后、`res.json` 之前。

#### 6.2 前端 - DashboardPage 监听 trackUpdated 事件

在 `DashboardPage` 组件中添加 `useEffect` 监听：

```jsx
// Round 6: 监听赛道重命名事件，同步更新仪表盘中的赛道名称
useEffect(() => {
  if (!socket) return;
  const onTrackUpdated = (payload) => {
    setTrackData(prev => {
      if (prev && prev.id === payload.trackId) {
        return { ...prev, name: payload.name };
      }
      return prev;
    });
  };
  socket.on('trackUpdated', onTrackUpdated);
  return () => socket.off('trackUpdated', onTrackUpdated);
}, [socket]);
```

- 使用函数式 `setTrackData` 更新器，避免闭包陈旧问题
- 仅当当前 `trackData.id` 与事件中的 `trackId` 匹配时更新
- 组件卸载时正确清除监听器

### 效果
- 在赛道管理页面重命名赛道后，仪表盘页面无需刷新即可实时看到新名称
- 底部信息栏、赛道名称显示等位置同步更新

---

## Round 7: 赛道列表 UI 优化

### 需求
赛道卡片增加最后使用时间显示和比赛场次数，卡片布局更紧凑。

### 修改方案

#### 7.1 服务端 - GET /api/tracks 增强返回数据

将原来简单的 `res.json(tracks)` 替换为聚合查询，遍历 `sessions` 目录为每个赛道计算：

```js
// Round 7: 赛道列表增强 - 附带每个赛道的 lastUsed 和 sessionCount
app.get('/api/tracks', (req, res) => {
  const sessionsDir = DATA_DIR + '/sessions';
  const sessionCounts = {};
  const lastUsedMap = {};
  // 遍历 session 文件，按 trackId 聚合计数和最新时间
  // ...
  const enriched = {};
  for (const [id, track] of Object.entries(tracks)) {
    enriched[id] = {
      ...track,
      sessionCount: sessionCounts[id] || 0,
      lastUsedAt: lastUsedMap[id] || track.updatedAt || track.createdAt || null
    };
  }
  res.json(enriched);
});
```

每个赛道对象新增字段：
- `sessionCount`：该赛道下的比赛场次数（从 sessions 聚合）
- `lastUsedAt`：最后使用时间（取 sessions 中最新 savedAt）

#### 7.2 前端 - 赛道卡片信息紧凑化

信息行改动：

**修改前：**
```jsx
<div style={{ fontSize: 9, color: '#8b949e' }}>
  {track.length ? Math.round(track.length) + 'm' : '-'} ·
  {track.turns ? track.turns.length + '弯' : '0弯'} ·
  {track.trajectoryCount || 0}轨迹
</div>
```

**修改后：**
```jsx
<div style={{ fontSize: 9, color: '#8b949e', lineHeight: 1.4 }}>
  {track.length ? Math.round(track.length) + 'm' : '-'} ·
  {track.turns ? track.turns.length + '弯' : '0弯'} ·
  {track.trajectoryCount || 0}轨迹
  {track.sessionCount > 0 ? <span style={{ color: '#58a6ff' }}> · {track.sessionCount}场比赛</span> : ''}
</div>
{track.lastUsedAt && (
  <div style={{ fontSize: 8, color: '#484f58', lineHeight: 1.3 }}>
    最近: {formatRelativeTime(track.lastUsedAt)}
  </div>
)}
```

- 名称行 marginBottom 从 3px 减为 2px，lineHeight 从默认减为 1.2
- 信息行增加 `lineHeight: 1.4`，行间距更紧凑
- 新增蓝色高亮显示的 "N场比赛"
- 新增灰色小字显示 "最近: X分钟前/小时前/天前"

#### 7.3 相对时间格式化函数

新增 `formatRelativeTime` 辅助函数：

```jsx
const formatRelativeTime = (isoStr) => {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
  return then.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};
```

#### 7.4 附带修复 - SessionHistoryPage JSX 结构错误

构建验证时发现 `SessionHistoryPage.jsx` 存在预有的 JSX 结构错误：
- `{mainTab === 'sessions' && (...)}` 的闭合 `</div>)}` 意外关闭了外层主容器 div
- 导致排行榜标签 `{mainTab === 'leaderboard' && (...)}` 渲染在 return 语句之外

修复：移除多余的 `</div>)}` 三行，使排行榜视图保持在主容器内。

### 效果
- 赛道卡片单行显示更多信息（长度/弯道/轨迹/比赛场次）
- 有比赛记录的赛道蓝色高亮显示场次
- 第三行小字显示最后使用时间的相对格式
- 整体卡片间距更紧凑

---

## Round 8: 添加赛道功能改进

### 需求
"添加赛道"按钮改为真正可用的录制模式，不再弹模态框。

### 修改方案

#### 8.1 移除旧代码

删除以下状态和弹窗：
- `showAddModal` 状态
- `newTrackName` 状态
- 添加赛道模态框 JSX（约 25 行）

#### 8.2 新增录制模式状态

```jsx
const [isRecording, setIsRecording] = useState(false);
const [recordStartTime, setRecordStartTime] = useState(null);
const [recordingElapsed, setRecordingElapsed] = useState(0);
```

#### 8.3 录制功能实现

**开始录制：**
```jsx
const startRecording = async () => {
  const res = await fetch('/api/record/start', { method: 'POST' });
  if (res.ok) {
    setIsRecording(true);
    setRecordStartTime(Date.now());
    toast('录制已开始！请在游戏中跑一圈...', 'info');
  }
};
```

**停止录制：**
```jsx
const stopRecording = async () => {
  const res = await fetch('/api/record/stop', { method: 'POST' });
  const data = await res.json();
  if (data.positions > 10) {
    toast(`录制完成！获得 ${data.positions} 个轨迹点。`, 'success');
  } else {
    toast('录制数据不足，请确保已在游戏中开启 Data Out。', 'error');
  }
  setIsRecording(false);
  loadTracks();
};
```

#### 8.4 按钮与录制状态 UI

按钮区域根据录制状态切换：

```jsx
{isRecording ? (
  <button onClick={stopRecording} style={{ ...btnPrimaryStyle, background: '#da3633' }}>
    停止录制 {recordingElapsed > 0 ? recordingElapsed + 's' : ''}
  </button>
) : (
  <button onClick={startRecording} style={btnPrimaryStyle}>录制赛道</button>
)}
```

录制计时器通过 `setInterval` 每秒更新 `recordingElapsed`。

#### 8.5 录制中提示横幅

固定在页面顶部（top: 60px）的红色横幅：

```jsx
{isRecording && (
  <div style={{ position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(218,54,51,0.9)', ... }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', animation: 'pulse 1s infinite' }} />
    录制中 - 请在游戏中驾驶以采集赛道轨迹
  </div>
)}
```

### 效果
- 点击"录制赛道"按钮，调用 `POST /api/record/start` 开始采集遥测数据
- 按钮变为红色"停止录制 Ns"，实时显示已录制时长
- 页面顶部出现红色横幅提示录制中
- 点击"停止录制"，调用 `POST /api/record/stop`，根据轨迹点数量给出成功/失败提示
- 停止后自动刷新赛道列表

---

## Round 9: 路书编辑功能（简化版）

### 需求
在赛道管理中选中赛道后，可以看到弯道列表，并手动编辑推荐速度。

### 修改方案

#### 9.1 服务端 - 新增弯道速度更新 API

```
PUT /api/tracks/:id/turns/:index/speedHint
Body: { speedHint: "80km/h" }
Response: { status: 'ok', turnIndex: 0, speedHint: '80km/h' }
```

```js
app.put('/api/tracks/:id/turns/:index/speedHint', express.json(), (req, res) => {
  const track = tracks[req.params.id];
  if (!track) return res.status(404).json({ error: 'Track not found' });
  if (!track.turns || !Array.isArray(track.turns)) return res.status(400).json({ error: 'Track has no turns' });
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= track.turns.length) return res.status(400).json({ error: 'Invalid turn index' });
  track.turns[idx].speedHint = req.body.speedHint || '';
  track.updatedAt = new Date().toISOString();
  saveJSON(DATA_DIR + '/tracks.json', tracks);
  res.json({ status: 'ok', turnIndex: idx, speedHint: track.turns[idx].speedHint });
});
```

位置：`DELETE /api/tracks/:id` 之后、调校管理 API 之前。

#### 9.2 前端 - 右侧面板底部弯道列表

选中赛道后，在底部信息栏下方显示弯道编辑面板（maxHeight: 200px，可滚动）：

```jsx
{selectedTrackData && selectedTrackData.turns && selectedTrackData.turns.length > 0 && (
  <div style={{ borderTop: '1px solid var(--border)', maxHeight: 200, overflow: 'auto' }}>
    <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700 }}>路书 - 弯道列表</div>
    <table>
      <thead><tr><th>#</th><th>方向</th><th>角度</th><th>推荐速度</th></tr></thead>
      <tbody>
        {selectedTrackData.turns.map((turn, idx) => (
          <tr>
            <td>{idx + 1}</td>
            <td style={{ color: turn.direction === 'left' ? '#58a6ff' : '#f85149' }}>
              {turn.direction === 'left' ? '左' : '右'}
            </td>
            <td>{turn.angle.toFixed(0)}°</td>
            <td>
              <input
                value={turn.speedHint || ''}
                onChange={/* 乐观更新 setTracks */}
                onBlur={/* 调用 PUT API 保存 */}
                placeholder="如: 80km/h"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

关键设计：
- **乐观更新**：onChange 时立即更新本地状态（`setTracks`），用户无需等待
- **延迟保存**：onBlur 时调用 `PUT /api/tracks/:id/turns/:index/speedHint` 持久化到服务端
- **Enter 快捷键**：onKeyDown 中按 Enter 触发 blur（即触发保存）
- 方向颜色编码：左弯蓝色，右弯红色
- placeholder 提示输入格式

### 效果
- 选中赛道后，右侧面板底部出现弯道列表
- 每行显示弯道序号、方向（彩色）、角度、推荐速度输入框
- 编辑推荐速度后，输入框失焦或按 Enter 即自动保存
- 保存失败时有 toast 错误提示

---

## Round 10: 代码清理

### 需求
删除未使用的代码，确认所有函数正确，构建验证通过。

### 清理内容

| 清理项 | 说明 | 行数变化 |
|--------|------|---------|
| `trackDataRef` | useRef 声明但从未使用 | -1 行 |
| `drawMergePreview` | useCallback 函数（约 60 行），合并预览已改用独立组件 `MergePreviewCanvas` | -61 行 |
| `btnDangerStyle` | 样式常量声明但从未引用 | -11 行 |
| `showAddModal` / `newTrackName` | 状态声明（已在 Round 8 移除模态框时清理） | 已清理 |

### 验证结果

所有导入项使用检查：

| 导入 | 使用位置 |
|------|---------|
| `useState` | 多处 |
| `useEffect` | 多处 |
| `useRef` | canvasRef, dragStart 等 |
| `useCallback` | drawTrack, drawCanvas |
| `EmptyState` | 空列表提示 |
| `toast` | 多处操作反馈 |

所有样式常量使用检查：

| 样式常量 | 使用位置 |
|---------|---------|
| `btnPrimaryStyle` | 主按钮 |
| `btnSecondaryStyle` | 合并/取消按钮 |
| `btnSmallStyle` | 小按钮（重置、保存等） |
| `btnPrimarySmallStyle` | 排序高亮按钮 |
| `btnDangerSmallStyle` | 删除确认按钮 |
| `btnIconStyle` | 图标操作按钮 |
| `btnDangerIconStyle` | 删除图标按钮 |
| `inputStyle` | 输入框 |
| `modalOverlayStyle` | 弹窗遮罩 |
| `modalContentStyle` | 弹窗内容 |
| `statCardStyle` | 详情弹窗统计卡片 |

---

## 构建验证

| 轮次 | 构建结果 | 备注 |
|------|---------|------|
| Round 6 | SUCCESS | 服务端 io.emit + 前端 socket 监听 |
| Round 7 | SUCCESS | API 增强 + 卡片 UI 优化 + 附带修复 SessionHistoryPage |
| Round 8 | SUCCESS | 录制模式替代弹窗 |
| Round 9 | SUCCESS | 路书弯道编辑 + 服务端 API |
| Round 10 | SUCCESS | 清理 73 行未使用代码 |

---

## Round 6-10 变更总结

| 项 | 修改前 | 修改后 |
|----|-------|-------|
| 赛道重命名同步 | 仅本地更新 | socket 广播 + 仪表盘实时同步 |
| 赛道列表信息 | 长度/弯道/轨迹 | + 比赛场次(蓝色高亮) + 最后使用时间(相对格式) |
| 卡片布局 | marginBottom: 3 | marginBottom: 2, lineHeight 紧凑化 |
| 添加赛道 | 弹模态框输入名称 | 录制模式(开始/停止) + 红色录制横幅 + 计时器 |
| 路书编辑 | 仅详情弹窗只读 | 右侧面板底部弯道列表 + 速度输入框(乐观更新+延迟保存) |
| 弯道速度 API | 无 | PUT /api/tracks/:id/turns/:index/speedHint |
| GET /api/tracks | 直接返回 tracks 对象 | 聚合 sessionCount + lastUsedAt |
| 未使用代码清理 | trackDataRef, drawMergePreview, btnDangerStyle | 已删除（共约 73 行） |
| SessionHistoryPage | JSX 结构错误导致构建失败 | 修复闭合标签层级 |

## 修改文件总行数变化

| 文件 | 修改前 | 修改后 | 变化 |
|------|-------|-------|------|
| `TrackManagerPage.jsx` | ~980 行 | ~930 行 | -50（删 73 未使用 + 加 23 新功能） |
| `DashboardPage.jsx` | ~730 行 | ~745 行 | +15（Round 6 监听） |
| `server/src/index.js` | ~3692 行 | ~3730 行 | +38（Round 6/7/9 API） |
| `SessionHistoryPage.jsx` | ~1787 行 | ~1784 行 | -3（修复 JSX 结构） |
