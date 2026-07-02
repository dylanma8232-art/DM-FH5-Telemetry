# 赛道管理模块 - Round 1 迭代方案

## 迭代日期
2026-07-01

## 修改范围

| 文件 | 变更类型 |
|------|---------|
| `client/src/components/pages/TrackManagerPage.jsx` | P0 Bug修复 + 精简重构 |
| `server/src/index.js` | 存储瘦身优化 |

---

## Bug 1: 赛道预览图精简

### 问题
赛道预览 Canvas 存在过多视觉元素：8种数据颜色叠加模式（速度/油门/刹车/G力/走线/档位/打滑/高度）、弯道编号圆点标记、复杂图例面板。用户打开赛道管理页时信息过载，预览图不够直观。

### 修改方案

**删除项：**
- `previewMode` state 及 `setPreviewMode` setter
- `selectedTurn` state 及点击弯道选中逻辑
- 8个模式切换按钮（速度/油门/刹车/G力/走线/档位/打滑/高度）
- 图例面板（`Legend` 组件 + 8组条件渲染图例）
- `getColor()` 多色计算函数（约50行）
- 同色路径合并绘制逻辑
- 弯道编号圆点绘制逻辑（约30行）
- `handleMouseDown` 中的弯道点击检测逻辑
- 底部信息栏中的弯道详情面板

**保留/新增项：**
- Canvas 绘制：单色轨迹线（`#58a6ff`）+ 白色起点圆点 + 红色终点圆点
- 鼠标拖拽平移 + 滚轮缩放
- 降采样逻辑（>1000点时保留约500点）
- 底部信息栏精简为：赛道名 + 长度 + 弯道数

**效果：**
- 代码量从 832 行减少到 602 行（减少约 28%）
- Canvas 绘制函数从约 175 行减少到约 78 行
- 用户界面更简洁直观

---

## Bug 2: Canvas resize 监听

### 问题
窗口尺寸变化时（如浏览器缩放、拖拽调整窗口大小），Canvas 不会自动重绘，导致画面错位或空白。

### 修改方案
```jsx
// 新增 drawCanvas 统一封装
const drawCanvas = useCallback(() => {
  if (!selectedTrack) return;
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const track = tracks[selectedTrack];
  if (!track) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  drawTrack(ctx, canvas, track, transform);
}, [selectedTrack, tracks, transform, drawTrack]);

// 新增 window resize 监听
useEffect(() => {
  const handleResize = () => { drawCanvas(); };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [drawCanvas]);
```

---

## Bug 3: 搜索防抖

### 问题
搜索输入框每次按键都立即触发列表过滤和重渲染，当赛道数量较多时会造成不必要的性能开销。

### 修改方案
```jsx
// 新增防抖状态
const [debouncedQuery, setDebouncedQuery] = useState('');

// 防抖 effect（300ms）
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(searchQuery);
  }, 300);
  return () => clearTimeout(timer);
}, [searchQuery]);

// 搜索过滤使用 debouncedQuery 替代 searchQuery
```

---

## Bug 4: tracks.json 瘦身（服务端）

### 问题
`tracks.json` 文件随使用时间增长会变得非常大，原因：
1. `JSON.stringify(data, null, 2)` 格式化输出导致体积翻倍
2. `trajectories` 数组无上限，每次比赛都追加完整轨迹
3. 历史轨迹保留全量点数据，内存和磁盘开销大

### 修改方案

#### 4.1 saveJSON 去掉格式化
```js
// 修改前
const content = JSON.stringify(data, null, 2);
// 修改后
const content = JSON.stringify(data);
```

#### 4.2 新增降采样工具函数
```js
function downsampleTrajectory(positions, step = 10) {
  if (!positions || positions.length <= step * 2) return positions;
  const sampled = [positions[0]];
  for (let i = step; i < positions.length - 1; i += step) {
    sampled.push(positions[i]);
  }
  sampled.push(positions[positions.length - 1]);
  return sampled;
}
```

#### 4.3 新增轨迹数限制函数
```js
function trimTrajectories(trajectories, maxCount = 5) {
  if (!trajectories || trajectories.length <= maxCount) return trajectories;
  return trajectories.slice(-maxCount);
}
```

#### 4.4 在三个轨迹写入分支中统一应用
- 赛道模式分支（`trackMode && trackId`）
- 普通模式匹配到已有赛道分支（`matchedTrackId`）
- 手动录制历史赛道分支（`trackId && tracks[trackId]`）

**规则：**
- 最新一条轨迹保留完整精度（不降采样）
- 历史轨迹每 10 个点取 1 个（降采样率 10:1）
- 最多保留 5 条轨迹（保留最新 5 条）

**预估瘦身效果（假设）：**
- 10 条轨迹 x 每条 5000 点 → 5 条轨迹（最新 5000 点 + 4 条各约 500 点）≈ 节省 60%+ 磁盘空间
- 去掉 JSON 缩进：文件体积再减少约 30%

---

## 构建验证

```
npm run build → SUCCESS (exit code 0)
- TrackManagerPage-DeMJUDqf.js: 10.90 kB (gzip: 3.91 kB)
- 681 modules transformed
- 零错误、零警告
```

---

## Round 1 变更总结

| 项 | 修改前 | 修改后 |
|----|-------|-------|
| TrackManagerPage.jsx 行数 | 832 行 | 602 行 |
| Canvas 绘制模式 | 8 种颜色模式 | 1 种（单色轨迹线） |
| Canvas 标记元素 | 轨迹线 + 弯道编号 + 图例 | 轨迹线 + 起点圆 + 终点圆 |
| resize 监听 | 无 | window.onresize 重绘 |
| 搜索防抖 | 无（即时过滤） | 300ms 防抖 |
| JSON 格式化 | `null, 2` 缩进 | 无缩进 |
| 轨迹数量上限 | 无限制 | 最多 5 条 |
| 历史轨迹采样 | 全量保存 | 每 10 点取 1 |
