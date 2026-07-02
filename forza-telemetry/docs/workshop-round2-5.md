# 车辆工坊模块 Round 2-5 - 功能迭代

> 日期: 2026-07-01
> 模块: 车辆工坊（调校管理）
> 迭代目标: 修复配件变更覆盖手动调参问题，新增调校复制/活跃调校/问题分类中文化功能

---

## 修改概览

| Round | 功能 | 类型 | 状态 |
|-------|------|------|------|
| 2 | 配件变更不覆盖手动调整 | Bug Fix | **已完成** |
| 3 | 调校复制功能 | Feature | **已完成** |
| 4 | 活跃调校入口 | Feature | **已完成** |
| 5 | 问题分类中文化 | Enhancement | **已完成** |

---

## Round 2: 配件变更不覆盖手动调整

### 问题描述

配件变更时，`useEffect` 监听 `formData.parts` 变化后调用 `getTuneDefaults`，将所有调校参数重置为推荐默认值。用户之前手动调整的参数值（如弹簧硬度、胎压等）全部丢失。

### 修复方案

使用 `useRef` 维护一个 `dirtyParamsRef` 集合，记录用户手动修改过的参数路径（格式 `category.field`，如 `tires.frontPressure`）。

**核心逻辑变更：**

1. **`dirtyParamsRef`** - 新增 `useRef(new Set())`，存储嵌套路径格式的 dirty 参数集合
2. **`updateFormField`** - 用户每次修改参数时，将 `category.field` 加入 dirty 集合
3. **配件变更 useEffect** - 遍历推荐默认值时，检查该参数是否在 dirty 集合中：
   - 如果在 dirty 集合中：跳过该参数，保持用户手动修改的值
   - 如果不在 dirty 集合中：正常应用推荐默认值
4. **清理时机** - `startCreate`、`startEdit`、`closeModal` 时清除 dirty 集合

### 关键代码

```js
// 记录用户手动修改过的参数
const dirtyParamsRef = useRef(new Set())

const updateFormField = (category, field, value) => {
  dirtyParamsRef.current.add(`${category}.${field}`)
  setFormData(prev => ({
    ...prev,
    [category]: { ...prev[category], [field]: value === '' ? '' : parseFloat(value) }
  }))
}

// 配件变更时跳过 dirty 参数
useEffect(() => {
  const defaults = getTuneDefaults(formData.parts, currentVehicleStats)
  if (defaults) {
    const mapped = { tires: {}, suspension: {}, drivetrain: {}, aero: {} };
    for (const [flatKey, value] of Object.entries(defaults)) {
      if (value == null) continue;
      const path = TUNE_DEFAULT_KEY_MAP[flatKey];
      if (path) {
        const nestedKey = `${path[0]}.${path[1]}`
        if (dirtyParamsRef.current.has(nestedKey)) continue  // 跳过用户修改过的参数
        mapped[path[0]][path[1]] = value;
      }
    }
    setFormData(prev => ({
      ...prev,
      tires: { ...prev.tires, ...mapped.tires },
      suspension: { ...prev.suspension, ...mapped.suspension },
      drivetrain: { ...prev.drivetrain, ...mapped.drivetrain },
      aero: { ...prev.aero, ...mapped.aero }
    }))
  }
}, [formData.parts, currentVehicleStats])
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 第 124 行: 新增 `dirtyParamsRef`
  - 第 619 行: `updateFormField` 中记录 dirty 参数
  - 第 201-225 行: 配件变更 useEffect 跳过 dirty 参数
  - 第 508、522、530 行: `startEdit`/`startCreate`/`closeModal` 清除 dirty 集合

---

## Round 3: 调校复制功能

### 问题描述

用户需要基于现有调校快速创建变体，缺少一键复制功能。

### 实现方案

新增 `duplicateTune` 函数，在每个调校卡片上添加"复制"按钮：

1. **创建副本** - POST 请求创建新调校，名称为 "原名称 (副本)"
2. **完整复制** - 复制所有配件、参数、标签
3. **自动编辑** - 创建成功后自动打开编辑弹窗，方便用户微调

### 关键代码

```js
const duplicateTune = async (tune) => {
  const payload = {
    name: (tune.name || '未命名调校') + ' (副本)',
    tags: [...(tune.tags || [])],
    vehicleId: tune.vehicleId || null,
    tires: { ...tune.tires },
    suspension: { ...tune.suspension },
    drivetrain: { ...tune.drivetrain },
    aero: { ...tune.aero },
    parts: { ...tune.parts }
  }
  const res = await fetch('/api/tunes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  // 创建成功后打开编辑弹窗
  const newTune = await res.json()
  if (newTune && newTune.id) {
    const updatedTunes = await fetch('/api/tunes').then(r => r.ok ? r.json() : [])
    const found = Array.isArray(updatedTunes) && updatedTunes.find(t => t.id === newTune.id)
    if (found) startEdit(found)
  }
}
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 第 481-519 行: 新增 `duplicateTune` 函数
  - 第 1189 行: 卡片操作栏新增"复制"按钮

---

## Round 4: 活跃调校入口

### 问题描述

用户需要一个快速查看和切换当前活跃调校的方式，活跃调校用于关联后续 Session。

### 实现方案

服务端已有 `GET/POST /api/tunes/active` 端点，前端新增对应的 UI 交互：

1. **活跃调校区域** - 页面顶部绿色高亮条，显示当前活跃调校名称和关联车辆
2. **取消活跃** - 绿色条上提供"取消活跃"按钮，POST `{ tuneId: null }` 清除活跃状态
3. **设为活跃** - 每个调校卡片新增"设为活跃"按钮，POST `{ tuneId }` 设置
4. **状态同步** - 活跃中的调校按钮显示绿色"活跃中"文字，禁用点击
5. **数据加载** - 页面初始化时自动 `GET /api/tunes/active` 获取当前状态

### 关键代码

```jsx
{/* 当前活跃调校 */}
{activeTune && (
  <div style={{
    background: 'rgba(35, 134, 54, 0.1)',
    border: '1px solid rgba(35, 134, 54, 0.35)',
    borderRadius: 8, padding: '10px 14px', marginBottom: 16
  }}>
    <div>
      <span>当前活跃调校:</span>
      <span style={{ fontWeight: 700, color: 'var(--success)' }}>{activeTune.name}</span>
      {activeTune.vehicleId && <span>/ {getVehicleName(activeTune.vehicleId)}</span>}
    </div>
    <button onClick={clearActiveTune}>取消活跃</button>
  </div>
)}

{/* 调校卡片上的按钮 */}
<button
  onClick={() => setActiveTuneById(tune.id)}
  disabled={activeTune && activeTune.id === tune.id}
  style={{
    background: (activeTune?.id === tune.id) ? 'rgba(35, 134, 54, 0.15)' : 'var(--bg-tertiary)',
    color: (activeTune?.id === tune.id) ? '#3fb950' : 'var(--text-primary)'
  }}
>
  {activeTune?.id === tune.id ? '活跃中' : '设为活跃'}
</button>
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 第 137-140 行: 新增 `activeTune` 和 `activeTuneLoading` state
  - 第 153 行: 初始化时调用 `loadActiveTune()`
  - 第 437-482 行: 新增 `loadActiveTune`、`setActiveTuneById`、`clearActiveTune` 函数
  - 第 981-1017 行: 页面顶部新增活跃调校显示区域
  - 第 1199-1210 行: 卡片操作栏新增"设为活跃"按钮

---

## Round 5: 问题分类中文化

### 问题描述

常见问题面板的分类标签显示原始英文 ID（如 `steering`、`braking` 等），不够直观。

### 实现方案

使用 `tunePresets.js` 中已有的 `PROBLEM_CATEGORIES` 常量（含 `id`、`label`、`color` 三个字段），将英文 ID 映射为中文标签，并添加颜色区分。

**修改位置：**
1. **分类筛选栏** - 每个分类标签使用对应颜色背景和边框
2. **问题列表项** - 问题名称下方的分类文字使用对应颜色

### PROBLEM_CATEGORIES 映射表

| ID | 中文标签 | 颜色 |
|----|---------|------|
| steering | 转向 | #f85149 |
| braking | 刹车 | #d29922 |
| chassis | 底盘 | #58a6ff |
| traction | 抓地力 | #3fb950 |
| stability | 稳定性 | #bc8cff |
| acceleration | 加速 | #f778ba |
| speed | 速度 | #79c0ff |
| gearbox | 变速 | #ffa657 |
| aero | 空力 | #56d4dd |
| tires | 轮胎 | #8b949e |

### 关键代码

```jsx
// 分类筛选栏
const catInfo = PROBLEM_CATEGORIES.find(c => c.id === cat)
const label = catInfo?.label || cat
const color = catInfo?.color || 'var(--text-secondary)'
<span style={{
  background: `${color}18`,
  color,
  border: `1px solid ${color}40`
}}>
  {label}
</span>

// 问题列表项中的分类标签
{problem.category && (
  <div style={{ fontSize: 8, marginTop: 1 }}>
    {(() => {
      const catInfo = PROBLEM_CATEGORIES.find(c => c.id === problem.category)
      return <span style={{ color: catInfo?.color || 'var(--text-muted)' }}>
        {catInfo?.label || problem.category}
      </span>
    })()}
  </div>
)}
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 第 18 行: import 新增 `PROBLEM_CATEGORIES`
  - 第 1898-1920 行: 分类筛选栏中文化 + 颜色
  - 第 1949-1960 行: 问题列表项分类标签中文化 + 颜色

---

## 附带修复

### SessionHistoryPage.jsx 语法错误

构建过程中发现 `SessionHistoryPage.jsx` 第 1472 行存在预置语法错误（`function` 声明结尾使用了 `);`），已修正为 `)`。

### 修改文件

- `client/src/components/pages/SessionHistoryPage.jsx` 第 1472 行

---

## 构建验证

每轮修改后执行构建验证：

| Round | 结果 | 模块数 | 耗时 |
|-------|------|--------|------|
| Round 2 | Exit code 0 | 681 modules | 1.57s |
| Round 3 | Exit code 0 | 680 modules | 1.61s |
| Round 4 | Exit code 0 | 680 modules | 1.61s |
| Round 5 | Exit code 0 | 680 modules | 1.34s |

---

## Round 2-5 总结

4 轮迭代共涉及以下变更：

- **核心 Bug 修复** (Round 2): 通过 `useRef` dirty 参数集合机制解决配件变更覆盖用户手动调参的问题，保护用户已调整的参数不被推荐默认值覆盖
- **调校复制** (Round 3): 一键复制调校并自动打开编辑，支持快速创建调校变体
- **活跃调校** (Round 4): 顶部活跃调校展示区 + 卡片"设为活跃"按钮，与服务端 `/api/tunes/active` 完整对接
- **分类中文化** (Round 5): 问题面板从英文 ID 切换为中文标签 + 颜色区分，提升可读性

所有修改集中在 `TuneManagerPage.jsx` 一个文件中，服务端无需改动（`/api/tunes/active` 端点已在先前迭代中实现）。构建全部通过。
