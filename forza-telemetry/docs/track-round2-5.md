# 赛道管理模块 - Round 2-5 迭代方案

## 迭代日期
2026-07-01

## 修改范围

| 文件 | 变更类型 |
|------|---------|
| `client/src/components/pages/TrackManagerPage.jsx` | 功能增强（Round 2-5） |

---

## Round 2: 合并预览功能

### 需求
赛道合并前应该能看到预览对比，避免误操作。

### 修改方案

#### 2.1 合并弹窗 - 对比信息表格
在选择目标赛道和源赛道后，弹窗中显示一个对比表格，包含：

| 对比项 | 说明 |
|--------|------|
| 名称 | 赛道名称（或 ID） |
| 长度 | 赛道长度（单位 m） |
| 弯道数 | 弯道数量 |
| 轨迹数 | 已录制轨迹条数 |

表格使用三列布局：对比项 / 目标赛道（蓝色字体）/ 源赛道（红色字体），与 Canvas 预览中的颜色一致。

```jsx
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
  <thead>
    <tr>
      <th>对比项</th>
      <th style={{ color: '#58a6ff' }}>目标赛道（保留）</th>
      <th style={{ color: '#f85149' }}>源赛道（删除）</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>名称</td><td>{target.name}</td><td>{source.name}</td></tr>
    <tr><td>长度</td><td>{target.length}m</td><td>{source.length}m</td></tr>
    <tr><td>弯道数</td><td>{target.turns}弯</td><td>{source.turns}弯</td></tr>
    <tr><td>轨迹数</td><td>{target.count}</td><td>{source.count}</td></tr>
  </tbody>
</table>
```

#### 2.2 合并确认提示增强
将普通黄色文字提示替换为带背景的醒目警告框：

```
⚠ 合并后源赛道将被删除，轨迹将合并到目标赛道，此操作不可撤销
```

- 背景色：`rgba(210,153,34,0.1)`
- 边框：`1px solid rgba(210,153,34,0.3)`
- 前景色：`#d29922`
- 添加 padding 和 border-radius 增强视觉层次

#### 2.3 已有功能（无需修改）
合并预览 Canvas（`MergePreviewCanvas` 组件）已在之前实现，显示蓝线（目标赛道）和红线（源赛道）的重叠轨迹，并附带图例。

### 效果
- 用户选择两个赛道后，弹窗顶部出现对比表格
- 表格下方是轨迹重叠预览 Canvas
- 再下方是醒目的警告提示
- 用户确认信息无误后再点击"确认合并"

---

## Round 3: 删除确认优化

### 需求
将 `confirm()` / modal 弹窗替换为内联确认，减少打断操作流程。删除后需要 toast 提示。

### 修改方案

#### 3.1 删除 modal 弹窗 -> 内联确认
**删除前：** 点击 X 按钮弹出 modal 确认弹窗（17 行 JSX）

**删除后：** 点击 X 按钮后，按钮区域原地替换为内联确认 UI

```jsx
{showDeleteConfirm === id ? (
  <>
    <span style={{ fontSize: 9, color: '#f85149', marginRight: 2 }}>确认删除？</span>
    <button onClick={(e) => { e.stopPropagation(); deleteTrack(id); }}
            style={btnDangerSmallStyle}>确认</button>
    <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
            style={btnSmallStyle}>取消</button>
  </>
) : (
  /* 原有操作按钮组 */
)}
```

- 红色"确认删除？"文字提示
- "确认"按钮使用 `btnDangerSmallStyle`（红色背景）
- "取消"按钮使用 `btnSmallStyle`（普通按钮）
- 点击取消或选择其他赛道时恢复原状

#### 3.2 Toast 提示
`deleteTrack` 函数中已有 toast 调用，无需额外修改：

```js
toast('赛道已删除', 'success');  // 成功
toast('删除失败', 'error');      // 失败
```

#### 3.3 代码变化
- 删除 17 行 modal 弹窗 JSX
- 列表行按钮区域增加条件渲染分支（净增约 8 行）

### 效果
- 删除确认不再弹出 modal，而是在列表行内直接切换显示
- 操作更轻量，不打断用户浏览节奏
- 删除成功/失败均有 toast 提示

---

## Round 4: 排序方向切换

### 需求
名称/长度/轨迹数的排序支持升序/降序切换，当前排序列高亮显示，点击同一列切换方向。

### 修改方案（已在代码中实现）

#### 4.1 排序状态管理
```jsx
const [sortBy, setSortBy] = useState('name');
const [sortDir, setSortDir] = useState('asc');
```

#### 4.2 排序切换逻辑
```jsx
const handleSortBy = (key) => {
  if (sortBy === key) {
    setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
  } else {
    setSortBy(key);
    setSortDir('asc');
  }
};
```

- 点击已排序列：切换方向（asc <-> desc）
- 点击未排序列：切换到该列，默认升序

#### 4.3 排序箭头指示
```jsx
const sortArrow = (key) => {
  if (sortBy !== key) return '';
  return sortDir === 'asc' ? ' ↑' : ' ↓';
};
```

- 当前排序列显示方向箭头（升序 ↑ / 降序 ↓）
- 非排序列不显示箭头

#### 4.4 高亮样式
```jsx
style={sortBy === s.key ? btnPrimarySmallStyle : btnSmallStyle}
```

- 当前排序列使用绿色背景（`btnPrimarySmallStyle`）
- 非排序列使用普通灰色背景（`btnSmallStyle`）

#### 4.5 排序比较逻辑
```jsx
list = [...list].sort((a, b) => {
  let cmp = 0;
  if (sortBy === 'name') cmp = (a[1].name || a[0]).localeCompare(b[1].name || b[0], 'zh-CN');
  if (sortBy === 'length') cmp = (a[1].length || 0) - (b[1].length || 0);
  if (sortBy === 'trajectory') cmp = (a[1].trajectoryCount || 0) - (b[1].trajectoryCount || 0);
  return sortDir === 'asc' ? cmp : -cmp;
});
```

- 名称排序使用 `localeCompare` 支持 中文拼音排序
- 长度/轨迹数使用数值比较
- `sortDir` 控制升序/降序

### 效果
- 三个排序按钮（名称/长度/轨迹数）
- 当前排序列绿色高亮 + 方向箭头
- 点击同一切换方向，点击不同列切换排序字段

---

## Round 5: 赛道图片导出

### 需求
在赛道预览区域右上角添加"导出图片"按钮，点击后通过 Canvas.toDataURL() 生成 PNG 并下载。

### 修改方案

#### 5.1 按钮位置调整
**修改前：** 导出 PNG 按钮在列表行中的小图标按钮（与其他操作按钮挤在一起）

**修改后：** 导出按钮移至预览区域顶部工具栏（"重置视图"按钮左侧）

```jsx
<div style={{ /* 顶部工具栏 */ }}>
  {selectedTrack && (
    <button onClick={() => exportTrackPNG(selectedTrack)} style={btnSmallStyle}>
      导出图片
    </button>
  )}
  <button onClick={resetView} style={btnSmallStyle}>重置视图</button>
  <span>缩放比例</span>
</div>
```

- 仅在有选中赛道时显示
- 使用与其他工具栏按钮一致的 `btnSmallStyle`
- 位于工具栏最左侧（justify-end 布局中靠右显示）

#### 5.2 导出函数（已有，无需修改）
```jsx
const exportTrackPNG = (id) => {
  const track = tracks[id];
  if (!track || !track.points || track.points.length < 2) {
    toast('赛道数据不足，无法导出', 'error');
    return;
  }
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = 1200;
  exportCanvas.height = 800;
  const ctx = exportCanvas.getContext('2d');
  drawTrack(ctx, exportCanvas, track, { x: 0, y: 0, scale: 1 });

  const link = document.createElement('a');
  link.download = (track.name || id) + '.png';
  link.href = exportCanvas.toDataURL('image/png');
  link.click();
  toast('赛道图片已导出', 'success');
};
```

- 创建 1200x800 离屏 Canvas
- 复用 `drawTrack` 函数绘制赛道轨迹
- `toDataURL('image/png')` 生成 Base64 PNG
- 通过 `<a>` 标签的 download 属性触发下载
- 文件名格式：`赛道名.png`
- 导出成功/失败均有 toast 提示

### 效果
- 预览区域顶部工具栏新增"导出图片"按钮
- 列表行操作按钮减少一个（移除小相机图标），更简洁
- 点击导出生成 1200x800 PNG 高清赛道图

---

## 构建验证

所有 4 轮均通过 `npm run build` 验证：

| 轮次 | 构建结果 | 备注 |
|------|---------|------|
| Round 2 | SUCCESS | 对比表格 + 确认提示增强 |
| Round 3 | SUCCESS | 内联删除确认替代 modal |
| Round 4 | SUCCESS | 排序切换已实现 |
| Round 5 | SUCCESS | 导出按钮移至预览工具栏 |

---

## Round 2-5 变更总结

| 项 | 修改前 | 修改后 |
|----|-------|-------|
| 合并弹窗 | 仅 Canvas 预览 + 普通文字提示 | 对比表格 + Canvas 预览 + 醒目警告框 |
| 删除确认 | Modal 弹窗（17 行 JSX） | 内联确认（列表行内切换显示） |
| 删除 Toast | 已有 | 已有（无需修改） |
| 排序切换 | 已实现（Round 1 后遗留） | 已实现（升降序 + 高亮 + 箭头） |
| 导出图片按钮 | 列表行内小图标 | 预览区域顶部工具栏按钮 |
| 文件总行数 | ~980 行 | ~980 行（删除 modal -17 行 + 对比表格 +36 行 + 内联确认 +8 行 - 导出按钮 -1 行 ≈ 持平） |
