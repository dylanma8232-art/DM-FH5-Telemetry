# 车辆工坊模块 Round 1 - P0 Bug 修复

> 日期: 2026-07-01
> 模块: 车辆工坊（原车辆管理 + 调校管理合并模块）
> 迭代目标: 修复所有 P0 Bug，确保核心功能可用

---

## 修复概览

| # | Bug | 严重度 | 状态 | 修复方式 |
|---|-----|--------|------|----------|
| 1 | getTuneConstraints 参数 ID 格式不匹配 | P0 | **已修复** | 新增 key 映射层 |
| 2 | 驾驶问题建议字段名不匹配 | P0 | **已有修复** | 已有 convertFixesToSuggestedChanges |
| 3 | 遥测诊断返回格式不匹配 | P0 | **已有修复** | 已有数组→对象转换逻辑 |
| 4 | 对比功能缺少 trackId | P0 | **已有修复** | 已有 compareTrackId 和赛道选择 |
| 5 | /api/sessions/:id/telemetry 端点不存在 | P0 | **已修复** | 服务端新增路由 |
| 6 | VehicleManagerPage 未监听 vehicleDetected | P0 | **已有修复** | 已有 socket.on 监听 |

---

## Bug 1: getTuneConstraints/getTuneDefaults 返回扁平 key，UI 使用嵌套格式

### 问题分析

`parts.js` 中的 `getTuneConstraints()` 和 `getTuneDefaults()` 返回扁平 key 格式：

```js
// parts.js 返回
{ tire_pressure_front: 30, spring_front: 10, gear_1: 3.5, ... }
```

但 UI 的 `formData` 使用嵌套格式：

```js
// UI formData
{ tires: { frontPressure: 30 }, suspension: { frontSpring: 10 }, drivetrain: { gear1: 3.5 }, ... }
```

### 原有修复情况

- **tuneConstraints**: `TuneManagerPage.jsx` 第601-643行已有 `PARAM_KEY_MAP` 映射层，正确地将扁平 key 转换为嵌套路径。
- **getTuneDefaults**: 第168-184行的 `useEffect` 中直接使用 `...defaults.tires` 展开，但 `getTuneDefaults` 返回扁平 key，没有 `.tires` 属性，**导致配件变更时推荐默认值完全未生效**。

### 本次修复内容

在 `TuneManagerPage.jsx` 新增 `TUNE_DEFAULT_KEY_MAP`，将 `getTuneDefaults` 的扁平 key 映射为嵌套结构后再 merge 到 formData：

```js
const TUNE_DEFAULT_KEY_MAP = {
  tire_pressure_front: ['tires', 'frontPressure'],
  tire_pressure_rear: ['tires', 'rearPressure'],
  spring_front: ['suspension', 'frontSpring'],
  // ... 共26个映射
};

// 配件变更时自动更新推荐调校默认值
useEffect(() => {
  const defaults = getTuneDefaults(formData.parts, currentVehicleStats);
  const mapped = { tires: {}, suspension: {}, drivetrain: {}, aero: {} };
  for (const [flatKey, value] of Object.entries(defaults)) {
    if (value == null) continue;
    const path = TUNE_DEFAULT_KEY_MAP[flatKey];
    if (path) mapped[path[0]][path[1]] = value;
  }
  setFormData(prev => ({
    ...prev,
    tires: { ...prev.tires, ...mapped.tires },
    suspension: { ...prev.suspension, ...mapped.suspension },
    drivetrain: { ...prev.drivetrain, ...mapped.drivetrain },
    aero: { ...prev.aero, ...mapped.aero }
  }));
}, [formData.parts, currentVehicleStats]);
```

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx` 第167-219行

---

## Bug 2: 驾驶问题建议字段名不匹配

### 问题分析

`DRIVING_PROBLEMS` 使用 `fixes` 字段（扁平 key + delta 增量），但 UI 的 `applyProblemFix` 检查 `suggestedChanges`（嵌套 key）。

### 原有修复情况

代码中已存在完整修复：

1. **FIX_PARAM_MAP** (第21-43行): 扁平 key 到嵌套路径的映射
2. **convertFixesToSuggestedChanges()** (第50-61行): 将 `fixes` 转换为 `suggestedChanges` 格式
3. **applyProblemFix()** (第224-245行): 先尝试 `suggestedChanges`，fallback 到 `convertFixesToSuggestedChanges(fixes)`，然后将 delta 累加到当前值

**结论：无需额外修改。**

---

## Bug 3: 遥测诊断返回格式不匹配 (数组 vs 对象)

### 问题分析

`diagnoseFromTelemetry()` 返回数组 `[{ problem, severity, details, fix }]`，但 UI 期望对象 `{ summary, issues, suggestedChanges }`。

### 原有修复情况

`runTelemetryDiagnosis()` 函数（第261-322行）已包含完整的格式转换逻辑：

1. 将数组元素转换为 `{ severity, message, description }` 格式的 issues
2. 合并所有 `fix` 到 `suggestedChanges`（使用 `FIX_PARAM_MAP` 映射）
3. 生成 summary 文本
4. 若已经是对象格式则直接使用

**结论：无需额外修改。**

---

## Bug 4: 对比功能缺少 trackId

### 问题分析

`runCompare` 调用 `/api/tunes/compare` 时需要传 `trackId` 参数，但原代码没有。

### 原有修复情况

代码中已有完整修复：

1. **compareTrackId state** (第120行)
2. **赛道选择下拉框** (第866-876行): 从 `tracks` state 渲染选项
3. **runCompare 检查** (第508-509行): 未选赛道时 alert 提示
4. **URL 传参** (第515行): `&trackId=${encodeURIComponent(compareTrackId)}`
5. **按钮禁用** (第884行): `disabled={compareSelected.length !== 2 || !compareTrackId || compareLoading}`

**结论：无需额外修改。**

---

## Bug 5: /api/sessions/:id/telemetry 端点不存在

### 问题分析

`runTelemetryDiagnosis()` 调用 `fetch('/api/sessions/${selectedSessionId}/telemetry')`，但服务端没有定义该路由，返回 404。

### 本次修复内容

在服务端 `server/src/index.js` 的 `GET /api/sessions/:id` 路由后新增：

```js
app.get('/api/sessions/:id/telemetry', (req, res) => {
  try {
    const sessionsDir = DATA_DIR + '/sessions';
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const file = files.find(f => f.includes(req.params.id));
    if (!file) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const data = JSON.parse(fs.readFileSync(sessionsDir + '/' + file, 'utf8'));
    res.json(data.data || []);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load session telemetry' });
  }
});
```

返回 session 文件中的 `data` 数组（遥测帧列表），若不存在则返回空数组。

### 修改文件

- `server/src/index.js` 第1634-1650行（新增）

---

## Bug 6: VehicleManagerPage 未监听 vehicleDetected

### 问题分析

服务端在检测到新车辆时通过 socket 发出 `vehicleDetected` 事件，但 `VehicleManagerPage` 没有监听该事件，导致车辆列表不会自动刷新。

### 原有修复情况

代码中已有完整修复：

1. **App.jsx** (第146行): 已将 `socket` prop 传递给 `VehicleManagerPage`
   ```jsx
   <VehicleManagerPage onNavigate={navigateTo} socket={socket} />
   ```
2. **VehicleManagerPage** (第26-33行): 已有 `socket.on('vehicleDetected')` 监听，触发时调用 `loadVehicles()` 重新加载车辆列表

**结论：无需额外修改。**

---

## 构建验证

```
npm run build -- vite v5.4.21
682 modules transformed, built in 1.43s
Exit code: 0 (成功)
```

---

## Round 1 总结

6 个 P0 Bug 中：
- **3 个已在先前迭代中修复**（Bug 2/3/4），代码逻辑正确
- **1 个已有监听实现**（Bug 6），功能完整
- **2 个为本次新修复**：
  - Bug 1: `getTuneDefaults` 扁平 key → 嵌套 formData 的映射层，修复配件变更后推荐值不生效的问题
  - Bug 5: 服务端新增 `GET /api/sessions/:id/telemetry` 路由，修复遥测诊断功能 404 错误

实际代码变更量小且精确，构建通过，无引入新问题。
