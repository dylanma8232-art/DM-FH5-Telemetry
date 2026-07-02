# 比赛中心模块 - Round 1~5 深度优化文档

## 变更概览

| 轮次 | 变更项 | 类型 | 状态 |
|------|--------|------|------|
| Round 1 | 驾驶评分算法优化 - 维度子指标展示 + Top3改进优先级 | 功能增强 | 已完成 |
| Round 2 | 赛后分析增强 - 圈速趋势/档位分布/改进优先级面板 | 功能增强 | 已完成 |
| Round 3 | 圈速排行榜增强 - 车辆筛选/趋势箭头/理论最佳金色高亮 | 功能增强 | 已完成 |
| Round 4 | 数据可视化组件优化 - 速度热力图/油门刹车叠加/分段对比 | 功能增强 | 已完成 |
| Round 5 | 交互体验优化 - 缩略图/批量操作/键盘快捷键 | 用户体验 | 已完成 |

---

## Round 1: 驾驶评分算法优化

### 问题

驾驶评分维度卡片仅展示分数和满分，缺少具体的子指标信息。"最需改进"面板只显示2个维度，不足以全面反映改进方向。

### 方案

- 维度卡片新增子指标显示：每个维度下方展示关键数据（圈速维度显示最佳/平均圈速，刹车显示重刹占比，油门显示弯中给油比，走线显示良好比例，一致性显示统计圈数）
- "最需改进"面板从 Top 2 扩展为 **Top 3**，提供更全面的改进建议
- 新增 `worst3` useMemo 计算函数，从5个维度中按得分比率升序取前3

### 修改的代码

#### `client/src/components/pages/SessionHistoryPage.jsx`

**新增 worst3 计算：**
```jsx
const worst3 = useMemo(() => {
  if (!analysis?.驾驶评分?.维度) return [];
  const sorted = Object.entries(analysis.驾驶评分.维度)
    .map(([name, dim]) => ({ name, ratio: dim.分数 / dim.满分, 分数: dim.分数, 满分: dim.满分 }))
    .sort((a, b) => a.ratio - b.ratio);
  return sorted.slice(0, 3);
}, [analysis?.驾驶评分?.维度]);
```

**维度卡片增强 - 子指标映射：**
```jsx
const subMetrics = {
  '圈速': dim.最佳圈 != null ? [
    { label: '最佳圈', value: formatTime(dim.最佳圈), color: 'var(--warning)' },
    { label: '平均圈', value: formatTime(dim.平均圈), color: 'var(--text-secondary)' },
  ] : [],
  '刹车': [{ label: '重刹占比', value: dim.重刹占比 + '%' }],
  '油门': [{ label: '弯中给油', value: dim.弯中给油比 + '%' }],
  '走线': [{ label: '良好比例', value: dim.良好比例 + '%' }],
  '一致性': [{ label: '统计圈数', value: dim.圈数 + '圈' }],
};
```

**最需改进面板改为 Top 3：**
```jsx
{worst3.length > 0 ? (
  <div style={{ /* ... */ }}>
    <div>最需改进 (Top 3)</div>
    {worst3.map(item => { /* ... */ })}
  </div>
) : null}
```

### 构建验证

```
npm run build -- SUCCESS
构建时间: 1.58s
```

---

## Round 2: 赛后分析增强

### 问题

比赛记录的"总览"Tab缺少直观的数据可视化。用户需要在多个Tab之间切换才能看到关键分析数据。

### 方案

在"总览"Tab中新增以下区块：

1. **圈速趋势图**：每圈用时折线图 + 最佳圈速参考线（绿色虚线），最快圈用金色圆点标注，最慢圈用红色圆点标注
2. **档位使用分布**：横向条形图，按使用时间降序排列，>20% 用蓝色高亮，其余绿色
3. **改进优先级面板**：清晰展示 Top 3 改进建议，带有优先级标签（最需改进/次要改进/建议关注），使用不同颜色区分
4. **关键事件标注**：趋势图下方标注最快圈(金色)、最慢圈(红色)、最佳参考线(绿色)

### 修改的代码

#### `client/src/components/pages/SessionHistoryPage.jsx`

**圈速趋势图（带关键事件标注）：**
```jsx
{lapTrendData && (
  <div style={sectionStyle}>
    <h3>圈速趋势</h3>
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={lapTrendData.data}>
        <ReferenceLine y={lapTrendData.bestTime} stroke="var(--success)" strokeDasharray="6 4" />
        <Line dot={(props) => {
          const isBest = payload.time === lapTrendData.bestTime;
          const isWorst = payload.time === Math.max(...data.map(d => d.time));
          if (isBest) return <circle r={5} fill="var(--warning)" />;
          if (isWorst) return <circle r={5} fill="var(--danger)" />;
          return <circle r={3} fill="var(--accent)" />;
        }} />
      </LineChart>
    </ResponsiveContainer>
    {/* 关键事件图例 */}
  </div>
)}
```

**改进优先级面板：**
```jsx
{worst3.length > 0 && (
  <div style={{ border: '1px solid var(--warning)' }}>
    <h3>改进优先级</h3>
    {worst3.map((item, idx) => {
      const priorityLabel = idx === 0 ? '最需改进' : idx === 1 ? '次要改进' : '建议关注';
      const priorityColor = idx === 0 ? 'var(--danger)' : idx === 1 ? 'var(--warning)' : 'var(--accent)';
      return (
        <div key={item.name}>
          <span style={{ background: priorityColor }}>{priorityLabel}</span>
          <span>{item.name}</span>
          <span>{item.分数}/{item.满分} ({Math.round(item.ratio * 100)}%)</span>
        </div>
      );
    })}
  </div>
)}
```

### 构建验证

```
npm run build -- SUCCESS
构建时间: 1.40s
```

---

## Round 3: 圈速排行榜增强

### 问题

排行榜缺少按车辆筛选能力，无法快速查看某辆车的圈速排行。排行项缺少趋势指示，不便于判断进步/退步。

### 方案

1. **车辆筛选下拉框**：新增车辆筛选下拉选择器，显示车辆名称+等级+PI
2. **趋势箭头**：排行榜主行显示进步(绿色上箭头)/退步(红色下箭头)/持平(灰色等号)
3. **理论最佳圈速金色高亮**：当最佳圈速等于理论最佳圈速时，圈速数字和"TL"标记使用金色显示
4. **LbStatCard 高亮模式**：理论最佳卡片使用金色边框和背景

### 修改的代码

#### `client/src/components/pages/SessionHistoryPage.jsx`

**新增车辆筛选状态和车辆列表计算：**
```jsx
const [lbVehicleFilter, setLbVehicleFilter] = useState('');

const lbAllVehicles = useMemo(() => {
  const map = new Map();
  lbEntries.forEach(e => {
    const key = e.vehicleOrdinal + '_' + e.vehicleName;
    if (!map.has(key)) {
      map.set(key, { ordinal: e.vehicleOrdinal, name: e.vehicleName || `Car #${e.vehicleOrdinal}`, pi: e.vehiclePI, cls: e.vehicleClass });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.ordinal - b.ordinal);
}, [lbEntries]);
```

**lbFiltered 增加车辆筛选逻辑：**
```jsx
const matchVehicle = !lbVehicleFilter || e.vehicleOrdinal === lbVehicleFilter;
return matchSearch && matchTrack && matchVehicle && matchTime;
```

**排行榜主行趋势箭头 + 金色高亮：**
```jsx
{entry.improvement > 0 && <span style={{ color: '#3fb950' }}>&#9650;</span>}
{entry.improvement < 0 && <span style={{ color: '#f85149' }}>&#9660;</span>}
<div style={{ color: entry.bestLap <= entry.optimalLap ? '#d29922' : '#3fb950' }}>
  {lbFormatTime(entry.bestLap)}
</div>
```

**LbStatCard 增强 - highlight 模式：**
```jsx
function LbStatCard({ label, value, color, highlight }) {
  return (
    <div style={{
      background: highlight ? 'rgba(210, 153, 34, 0.12)' : 'var(--bg-secondary)',
      border: highlight ? '1px solid rgba(210, 153, 34, 0.4)' : '1px solid var(--border)',
    }}>
      <div style={{ color: highlight ? '#d29922' : 'var(--text-secondary)' }}>{label}</div>
      <div style={{ color }}>{value}</div>
    </div>
  );
}
```

### 构建验证

```
npm run build -- SUCCESS
构建时间: 1.39s
```

---

## Round 4: 数据可视化组件优化

### 问题

回放组件的速度热力图仅使用简单的红绿渐变（硬编码250km/h为最大值），视觉效果不够精确。热力图组件缺少油门+刹车叠加显示。分段分析缺少理论最佳圈速对比。

### 方案

1. **回放速度热力图优化**（ReplayPlayer.jsx）：
   - 使用动态最大速度标准化（从实际数据计算而非硬编码）
   - 5段渐变色谱：蓝(低速) -> 青 -> 绿 -> 黄 -> 红(高速)
   - 图例增强：显示色谱条和最大速度值

2. **油门/刹车热力图叠加显示**（ThrottleBrakeHeatmap.jsx）：
   - 新增"叠加显示"按钮（仅在油门/刹车模式下可用）
   - 叠加模式：在基础层上以半透明方式叠加另一种数据（油门模式叠加刹车，反之亦然）
   - 叠加时跳过低值区域避免杂乱

3. **分段分析增强**（SectorAnalysis.jsx）：
   - 新增理论最佳圈速对比面板（实际圈速 vs 理论最佳 vs 可提升空间）
   - 分段时间柱状图新增金色参考线（标记最快分段时间）

### 修改的代码

#### `client/src/components/dashboard/ReplayPlayer.jsx`

**动态最大速度计算：**
```jsx
const maxSpeed = useMemo(() => {
  return validPositions.reduce((max, p) => Math.max(max, p.speed || 0), 0);
}, [validPositions]);
```

**5段渐变色谱：**
```jsx
const speedColor = (speed) => {
  const v = maxSpeed > 0 ? Math.min(1, Math.max(0, speed / maxSpeed)) : 0;
  if (v < 0.25) { /* 蓝 -> 青 */ }
  else if (v < 0.5) { /* 青 -> 绿 */ }
  else if (v < 0.75) { /* 绿 -> 黄 */ }
  else { /* 黄 -> 红 */ }
  return `rgba(${r}, ${g}, ${b}, `;
};
```

#### `client/src/components/dashboard/ThrottleBrakeHeatmap.jsx`

**叠加模式：**
```jsx
const [overlay, setOverlay] = useState(false);

// 绘制叠加层
if (overlay && positions.length > 1) {
  const overlayMode = mode === 'throttle' ? 'brake' : 'throttle';
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < positions.length; i++) {
    const v = overlayMode === 'brake' ? (p1.brake || 0) / 255 : (p1.accel || 0) / 255;
    if (v < 0.1) continue; // 跳过低值区域
    // 绘制叠加轨迹
  }
  ctx.globalAlpha = 1.0;
}
```

#### `client/src/components/dashboard/SectorAnalysis.jsx`

**理论最佳对比面板：**
```jsx
{actualLap > 0 && theoreticalBest > 0 && (
  <div style={{ background: 'rgba(210, 153, 34, 0.08)', border: '1px solid rgba(210, 153, 34, 0.25)' }}>
    <span>实际圈速: {formatTime(actualLap)}</span>
    <span>理论最佳: {formatTime(theoreticalBest)}</span>
    <span>可提升: {(actualLap - theoreticalBest).toFixed(3)}s</span>
  </div>
)}
```

### 构建验证

```
npm run build -- SUCCESS
构建时间: 1.55s
```

---

## Round 5: 交互体验优化

### 问题

Session卡片缺少赛道轨迹预览，用户需点开才能确认赛道。缺少批量操作能力，删除多条记录效率低。缺少键盘快捷键，频繁切换需要多次点击。

### 方案

1. **Session卡片缩略图**：新增 `TrackThumbnail` 组件，在每张Session卡片左侧显示60x40px的赛道轨迹缩略图，异步加载（从 `/api/tracks/:trackId/thumbnail` 获取位置数据后Canvas绘制）
2. **批量操作**：
   - 侧边栏顶部新增"批量操作"按钮，进入批量模式
   - 批量模式下卡片可多选（带复选框），支持"全选/取消全选"
   - 选中后显示"删除(N)"和"导出CSV(N)"按钮
3. **键盘快捷键**：
   - `Left/Right` 箭头：切换Session（在左侧列表中前后切换）
   - `Up/Down` 箭头：切换分析Tab（在10个Tab之间切换）
   - 输入框内按键不触发快捷键（避免干扰搜索/筛选操作）
4. **快捷键提示**：侧边栏底部显示快捷键说明

### 修改的代码

#### `client/src/components/pages/SessionHistoryPage.jsx`

**新增状态：**
```jsx
const [selectedSessionIds, setSelectedSessionIds] = useState(new Set());
const [batchMode, setBatchMode] = useState(false);
const allSubTabs = ['overview', 'style', 'tires', 'sectors', 'shifts', 'braking', 'accel', 'comparison', 'replay', 'heatmap'];
```

**键盘快捷键处理：**
```jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // 切换Session
      const idx = filteredSessions.findIndex(s => s.id === selectedSession);
      if (e.key === 'ArrowLeft' && idx > 0) loadAnalysis(filteredSessions[idx - 1].id);
      if (e.key === 'ArrowRight' && idx < filteredSessions.length - 1) loadAnalysis(filteredSessions[idx + 1].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // 切换Tab
      const curIdx = allSubTabs.indexOf(activeChart);
      // ...
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [filteredSessions, selectedSession, activeChart, allSubTabs]);
```

**批量删除：**
```jsx
const batchDelete = async () => {
  const ids = Array.from(selectedSessionIds);
  await Promise.all(ids.map(id => fetch('/api/sessions/' + id, { method: 'DELETE' })));
  setSessions(prev => prev.filter(s => !selectedSessionIds.has(s.id)));
  setSelectedSessionIds(new Set());
  setBatchMode(false);
};
```

**TrackThumbnail 缩略图组件：**
```jsx
function TrackThumbnail({ trackId }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const drawThumb = async () => {
      const res = await fetch(`/api/tracks/${trackId}/thumbnail`);
      if (!res.ok) return;
      const data = await res.json();
      // Canvas 绘制赛道轨迹
    };
    drawThumb();
  }, [trackId]);
  return <canvas ref={canvasRef} width={60} height={40} />;
}
```

### 构建验证

```
npm run build -- SUCCESS
构建时间: 1.47s
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `client/src/components/pages/SessionHistoryPage.jsx` | 修改 | Round 1~5 全部核心变更 |
| `client/src/components/dashboard/ReplayPlayer.jsx` | 修改 | Round 4 速度热力图优化 |
| `client/src/components/dashboard/ThrottleBrakeHeatmap.jsx` | 修改 | Round 4 叠加模式 |
| `client/src/components/dashboard/SectorAnalysis.jsx` | 修改 | Round 4 理论最佳对比 |
| `client/src/components/pages/VehicleManagerPage.jsx` | 修复 | 修复预先存在的文件损坏（import注入） |

---

## 用户可见变化

1. **Round 1** - 驾驶评分维度卡片新增子指标信息。"最需改进"面板扩展为Top 3，更全面地指出需要改进的方面。
2. **Round 2** - "总览"Tab新增圈速趋势图（含最快/最慢圈标注）、档位使用分布图、改进优先级面板（含最需改进/次要改进/建议关注三级标签）。用户无需切换Tab即可快速了解关键数据。
3. **Round 3** - 排行榜筛选栏新增"全部车辆"下拉选择器。排行项主行新增趋势箭头（绿上/红下/灰等）。达到理论最佳圈速时圈速数字和"TL"标记变为金色。
4. **Round 4** - 回放轨迹颜色从简单红绿渐变升级为5段色谱（蓝->青->绿->黄->红），动态适配最大速度。热力图新增"叠加显示"模式，可在油门/刹车模式下叠加显示另一种数据。分段分析新增理论最佳圈速对比面板和金色参考线。
5. **Round 5** - Session卡片左侧新增赛道轨迹缩略图（60x40px）。支持批量选择删除/导出。支持键盘快捷键（Left/Right切换记录，Up/Down切换Tab），底部显示快捷键提示。
