# 车辆工坊模块 Round 6-10 - 功能迭代

> 日期: 2026-07-01
> 模块: 车辆工坊（车辆管理 + 调校管理）
> 迭代目标: 车辆管理增强（搜索/排序/卡片交互）、调校参数动态范围、配件升级解锁提示、代码清理

---

## 修改概览

| Round | 功能 | 类型 | 状态 |
|-------|------|------|------|
| 6 | 车辆管理搜索和排序 | Enhancement | **已完成** |
| 7 | 车辆卡片增强 | Feature | **已完成** |
| 8 | 调校参数动态范围 | Bug Fix | **已完成** |
| 9 | 配件升级解锁提示 | Feature | **已完成** |
| 10 | 代码清理和构建 | Maintenance | **已完成** |

---

## Round 6: 车辆管理搜索和排序

### 问题描述

VehicleManagerPage 缺少搜索和排序功能，车辆列表只能按默认顺序展示。删除操作使用 `confirm()`，保存失败使用 `alert()`。

### 实现方案

1. **搜索框** - 支持按车辆名称或 ordinal ID 搜索，使用 `useMemo` 进行过滤
2. **排序选择器** - 支持按比赛次数（默认）、名称（中文排序）、PI（降序）、最近使用时间（降序）排序
3. **Toast 通知** - 替换 `alert()` 为自定义 Toast 组件（右上角弹出，2.5秒自动消失，支持 success/error/info 三种类型）
4. **内联确认** - 替换 `confirm()` 为 InlineConfirm 组件（定位在删除按钮下方，红色边框，带确定/取消按钮）
5. **所有 console.error 移除** - VehicleManagerPage 中不再有任何 console.error 调用

### 关键代码

```jsx
// 搜索过滤
const filteredCards = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return vehicleCards;
  return vehicleCards.filter(card =>
    card.name.toLowerCase().includes(q) || String(card.ord).includes(q)
  );
}, [vehicleCards, searchQuery]);

// 排序
const sortedCards = useMemo(() => {
  const sorted = [...filteredCards];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name, 'zh-CN');
      case 'pi': return (b.pi || 0) - (a.pi || 0);
      case 'lastUsed': return (b.stat.lastUsed || 0) - (a.stat.lastUsed || 0);
      default: return b.stat.count - a.stat.count;
    }
  });
  return sorted;
}, [filteredCards, sortBy]);
```

### 修改文件

- `client/src/components/pages/VehicleManagerPage.jsx`
  - 新增 `searchQuery`, `sortBy`, `toast`, `deleteConfirmId` state
  - 新增 `Toast` 组件（Toast 通知）
  - 新增 `InlineConfirm` 组件（内联确认弹窗）
  - 新增搜索栏和排序选择器 UI
  - `saveVehicle` 中 `alert()` 替换为 `showToast()`
  - `deleteVehicle` 中 `confirm()` 替换为 `InlineConfirm` + `deleteConfirmId` state
  - `loadVehicles` / `loadSessions` 中 `console.error` 替换为 `showToast()`

---

## Round 7: 车辆卡片增强

### 问题描述

车辆卡片无法展开查看关联的比赛记录；未配置的车辆标签不可点击；页面缺少加载状态指示。

### 实现方案

1. **展开卡片** - 点击车辆名称区域可展开/收起，显示该车辆最近5场比赛列表（赛道名 + 最佳圈速）
2. **未配置标签可点击** - 黄色"未配置"标签增加 `cursor: pointer` 和 `onClick`，点击直接打开编辑弹窗
3. **加载状态** - 页面初始加载时显示 CSS spinner 动画 + "加载中..." 文字
4. **session 统计优化** - 使用 `useMemo` 包裹 `statsByOrdinal` 计算，避免不必要的重计算

### 关键代码

```jsx
{/* 展开显示最近5场session */}
{expandedCard === card.ord && card.stat.recentSessions.length > 0 && (
  <div style={{ background: '#0d1117', borderRadius: 4, padding: 6, marginBottom: 4, fontSize: 9 }}>
    <div style={{ color: '#484f58', fontWeight: 600, marginBottom: 4, fontSize: 8 }}>
      最近比赛 ({card.stat.recentSessions.length})
    </div>
    {card.stat.recentSessions.map((s, idx) => (
      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{s.trackName || '未知赛道'}</span>
        <span>{formatTime(s.laps && s.laps.best ? s.laps.best : 0)}</span>
      </div>
    ))}
  </div>
)}
```

### 修改文件

- `client/src/components/pages/VehicleManagerPage.jsx`
  - 新增 `expandedCard`, `loading` state
  - `statsByOrdinal` 改为 `useMemo` 包裹，增加 `recentSessions` 字段
  - 车辆卡片名称区域增加 `onClick` 展开/收起
  - "未配置"标签增加 `onClick` 打开编辑弹窗
  - 页面顶层增加 `loading` 状态渲染（CSS spinner）
  - 新增 `@keyframes spin` 动画

---

## Round 8: 调校参数动态范围

### 问题描述

TuneManagerPage 中 NumberInput 组件的 min/max/step 大部分写死为硬编码值，不随配件等级变化。例如外倾角 `min={-5} max={0}` 不会因为从 Sport 升到 Race 后变为 `min={-6} max={0.5}`。

### 修复方案

将所有 NumberInput 的 `min`, `max`, `step` 属性改为从 `tuneConstraints`（由 `getTuneConstraints` 返回）中读取，保留 `??` 兜底值。

**受影响的参数（共27个 NumberInput）：**

| 参数类别 | 参数 | 原硬编码值 | 修复后 |
|---------|------|-----------|--------|
| 轮胎 | 前外倾角 | `min=-5, max=0, step=0.1` | `tuneConstraints['tires.frontCamber']?.min/max/step` |
| 轮胎 | 后外倾角 | `min=-5, max=0, step=0.1` | `tuneConstraints['tires.rearCamber']?.min/max/step` |
| 轮胎 | 前束角 | `min=-0.5, max=0.5, step=0.1` | `tuneConstraints['tires.frontToe']?.min/max/step` |
| 轮胎 | 后束角 | `min=-0.5, max=0.5, step=0.1` | `tuneConstraints['tires.rearToe']?.min/max/step` |
| 悬挂 | 前弹簧硬度 | `min=1, step=0.1` | `tuneConstraints['suspension.frontSpring']?.min/max/step` |
| 悬挂 | 后弹簧硬度 | `min=1, step=0.1` | `tuneConstraints['suspension.rearSpring']?.min/max/step` |
| 悬挂 | 前阻尼 | `min=1, step=0.1` | `tuneConstraints['suspension.frontDamping']?.min/max/step` |
| 悬挂 | 后阻尼 | `min=1, step=0.1` | `tuneConstraints['suspension.rearDamping']?.min/max/step` |
| 悬挂 | 前防倾杆 | `min=1, step=0.1` | `tuneConstraints['suspension.frontARB']?.min/max/step` |
| 悬挂 | 后防倾杆 | `min=1, step=0.1` | `tuneConstraints['suspension.rearARB']?.min/max/step` |
| 悬挂 | 前车身高度 | `max=20, step=0.1` | `tuneConstraints['suspension.frontRideHeight']?.max/step` |
| 悬挂 | 后车身高度 | `max=20, step=0.1` | `tuneConstraints['suspension.rearRideHeight']?.max/step` |
| 传动 | 差速器加速 | `min=0, max=100` | `tuneConstraints['drivetrain.diffAccel']?.min/max/step` |
| 传动 | 差速器减速 | `min=0, max=100` | `tuneConstraints['drivetrain.diffDecel']?.min/max/step` |
| 传动 | 中央差速器 | `min=0, max=100` | `tuneConstraints['drivetrain.diffCenter']?.min/max/step` |
| 传动 | 终传比 | `min=2.0, max=6.0` | `tuneConstraints['drivetrain.finalDrive']?.min/max/step` |
| 传动 | 1-6档齿比 | `min=0.5, max=5.0` | `tuneConstraints['drivetrain.gearN']?.min/max/step` |
| 空力 | 前下压力 | `min=0, step=1` | `tuneConstraints['aero.frontDownforce']?.min/step` |
| 空力 | 后下压力 | `min=0, step=1` | `tuneConstraints['aero.rearDownforce']?.min/step` |

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 第 1615-1865 行: 27 个 NumberInput 的 min/max/step 改为从 tuneConstraints 动态读取

---

## Round 9: 配件升级解锁提示

### 问题描述

配件升级后（如从 Stock 轮胎升到 Sport 轮胎），用户不知道新解锁了哪些可调参数。

### 实现方案

1. **对比逻辑** - 在 `updatePartSelection` 函数中，对比升级前后 `getTuneConstraints` 返回的锁定状态
2. **Toast 提示** - 如果有新解锁的参数，在页面右上角显示绿色 toast：`已解锁: 前外倾角 / 后外倾角 / 前束角 / 后束角`
3. **中文标签映射** - 使用 `TUNE_PARAM_LABELS` 对象将扁平 key（如 `tire_camber_front`）映射为中文标签（如 `前外倾角`）
4. **自动消失** - toast 3秒后自动消失

### TUNE_PARAM_LABELS 映射表

| flat key | 中文标签 |
|----------|---------|
| tire_camber_front | 前外倾角 |
| tire_camber_rear | 后外倾角 |
| tire_toe_front | 前束角 |
| tire_toe_rear | 后束角 |
| spring_front | 前弹簧硬度 |
| spring_rear | 后弹簧硬度 |
| damping_front | 前阻尼 |
| damping_rear | 后阻尼 |
| arb_front | 前防倾杆 |
| arb_rear | 后防倾杆 |
| ride_height_front | 前车身高度 |
| ride_height_rear | 后车身高度 |
| diff_accel | 差速器加速 |
| diff_decel | 差速器减速 |
| diff_center | 中央差速器 |
| gear_1 ~ gear_6 | 1-6档齿比 |
| downforce_front | 前下压力 |
| downforce_rear | 后下压力 |

### 关键代码

```jsx
const updatePartSelection = (categoryId, tier, optionId) => {
  const oldParts = formData.parts
  const newParts = { ...oldParts, [categoryId]: { tier: tier || undefined, optionId: optionId || 'stock' } }
  const oldConstraints = getTuneConstraints(oldParts)
  const newConstraints = getTuneConstraints(newParts)
  const newlyUnlocked = []
  for (const [paramId, constraint] of Object.entries(newConstraints)) {
    if (!constraint.locked && oldConstraints[paramId]?.locked) {
      newlyUnlocked.push(TUNE_PARAM_LABELS[paramId] || paramId)
    }
  }
  if (newlyUnlocked.length > 0) {
    setUnlockToast('已解锁: ' + newlyUnlocked.join(' / '))
    setTimeout(() => setUnlockToast(null), 3000)
  }
  setFormData(prev => ({ ...prev, parts: newParts }))
}
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`
  - 新增 `unlockToast` state
  - 新增 `TUNE_PARAM_LABELS` 中文标签映射常量
  - `updatePartSelection` 函数增加解锁参数对比逻辑
  - JSX 中新增解锁 toast 渲染（绿色背景，右上角弹出）

---

## Round 10: 代码清理和构建

### 清理内容

| 检查项 | 结果 |
|--------|------|
| 死代码 | 无 |
| console.error | TuneManagerPage: 14处全部移除; VehicleManagerPage: 已在 Round 6 中清除 |
| 无效 import | TuneManagerPage: 移除 `LoadingSpinner`, `getPartCategories`, `getPartTiers`; VehicleManagerPage: 已移除 `DT_LABELS` |
| 构建验证 | Exit code 0 |

### 具体清理

- **TuneManagerPage.jsx**
  - 移除 `import { LoadingSpinner }` (未使用)
  - 移除 `import { getPartCategories, getPartTiers }` (未使用)
  - 移除 14 处 `console.error` 调用，保留 catch 块中的功能性代码（如 `setTunes([])`, `alert()` 等）

- **VehicleManagerPage.jsx**
  - 无 `console.error` 调用
  - 无未使用的 import 或常量

---

## 构建验证

每轮修改后执行构建验证：

| Round | 结果 | 模块数 | 耗时 |
|-------|------|--------|------|
| Round 6 + 7 | Exit code 0 | 680 modules | 1.38s |
| Round 8 | Exit code 0 | 680 modules | 1.39s |
| Round 9 | Exit code 0 | 680 modules | 1.34s |
| Round 10 | Exit code 0 | 680 modules | 1.41s |

---

## Round 6-10 总结

5 轮迭代共涉及以下变更：

- **车辆管理增强** (Round 6-7): 搜索过滤（名称/ID）、排序（4种维度）、Toast 通知替代 alert/confirm、内联确认删除、卡片展开显示最近5场比赛、未配置标签可点击编辑、加载状态指示器
- **调校参数动态范围** (Round 8): 27个 NumberInput 组件的 min/max/step 全部改为从 `getTuneConstraints` 动态读取，配件等级变化时参数范围自动更新
- **配件升级解锁提示** (Round 9): 配件选择器变更时自动对比解锁状态，新解锁参数以绿色 toast 通知用户
- **代码清理** (Round 10): 移除所有 console.error、清理未使用 import（3处）、确认无死代码

修改文件：
- `client/src/components/pages/VehicleManagerPage.jsx` (Round 6-7: 完全重写)
- `client/src/components/pages/TuneManagerPage.jsx` (Round 8-10: 局部修改)
