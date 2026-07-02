# 比赛中心模块 - Round 1 迭代文档

## 迭代目标

将原「比赛记录」(SessionHistoryPage) 和「圈速榜」(LeaderboardPage) 合并为统一的「比赛中心」模块，修复已知 Bug，优化 UI 交互。

## 变更概览

| 变更项 | 类型 | 状态 |
|--------|------|------|
| 模块合并：比赛记录 + 圈速榜 | 重构 | 已完成 |
| 顶部导航 tab 精简（6 -> 5） | 重构 | 已完成 |
| 赛道标签筛选改为下拉选择器 | UI优化 | 已完成 |
| Session 删除功能（前后端） | Bug修复 | 前后端均已存在，无需改动 |
| 跨模块导航兼容处理 | 兼容性 | 已完成 |

---

## 1. 模块合并

### 方案

在 `SessionHistoryPage.jsx` 顶部增加「比赛记录」/「圈速排行榜」子 Tab 栏，将 LeaderboardPage 的全部核心逻辑和 JSX 内联到 SessionHistoryPage 中。

### 修改的文件

#### `client/src/App.jsx`
- 移除 `LeaderboardPage` 的 `lazy import`
- 从 `tabs` 数组中移除 `{ id: 'leaderboard', label: '圈速榜' }` 条目
- 将「比赛记录」tab label 改为「比赛中心」
- 从 `Suspense` 路由中移除 `activeTab === 'leaderboard'` 分支
- 更新键盘快捷键（车辆管理从 5 调整为 4，调校管理从 6 调整为 5）
- 在 `navigateTo` 函数中增加 `leaderboard -> sessions` 的自动重定向逻辑：
  - 当其他模块调用 `onNavigate('leaderboard', intent)` 时，自动重定向到 `sessions` tab
  - 同时在 intent 中注入 `_subTab: 'leaderboard'` 标记，用于子 Tab 切换

#### `client/src/components/pages/SessionHistoryPage.jsx`
- **新增状态变量**（以 `lb` 前缀区分排行榜状态）：
  - `mainTab` - 子 Tab 切换（'sessions' / 'leaderboard'）
  - `lbEntries`, `lbLoading`, `lbExpandedKey`, `lbTrendData`, `lbTrendLoading`
  - `lbSearchQuery`, `lbTrackFilter`, `lbLoaded`
- **新增函数**：
  - `loadLeaderboard()` - 加载排行榜数据（懒加载，首次切到 Tab 时才请求）
  - `loadLbTrend()` - 加载趋势数据
  - `toggleLbExpand()` - 展开/收起排行榜条目
  - `lbFormatTime()`, `getVehicleClass()` - 格式化辅助函数
- **JSX 结构改造**：
  - 外层容器改为 `flex-column`，顶部放置子 Tab 栏
  - 比赛记录视图（含左侧列表 + 右侧分析面板）包裹在 `{mainTab === 'sessions' && (...)}`
  - 圈速排行榜视图包裹在 `{mainTab === 'leaderboard' && (...)}`
- **导航意图处理**：
  - 支持 `navIntent._subTab === 'leaderboard'` 标记，自动切换到排行榜子 Tab
  - 支持仅传 `trackId` 无 `trackName` 的情况，也自动切换到排行榜子 Tab
- **排行榜内部跨 Tab 跳转**：
  - 「查看该赛道比赛记录」按钮改为 `setMainTab('sessions')` + `setTrackFilter(trackName)`，不再使用 `onNavigate`

#### `client/src/components/pages/LeaderboardPage.jsx`
- 文件保留但不再被引用（可作为历史参考）
- 所有功能已完整迁移到 SessionHistoryPage

### 导航兼容性

TrackManagerPage 中两处 `onNavigate('leaderboard', { trackId })` 调用无需修改：
1. App.jsx 的 `navigateTo` 函数拦截 `'leaderboard'` tabId，自动重定向到 `'sessions'`
2. 通过 `navIntent._subTab` 标记触发 SessionHistoryPage 的排行榜子 Tab 切换

---

## 2. Bug 修复

### 2.1 Session 删除功能

**状态：前后端均已存在，无需改动**

- 前端：SessionHistoryPage 中已有 `deleteSession()` 函数和 `showDeleteConfirm` 确认弹窗
- 后端：`server/src/index.js` 第 1653 行已有 `app.delete('/api/sessions/:id', ...)` 路由
- 删除后自动清除排行榜缓存（`leaderboardCache = null`）

### 2.2 赛道标签筛选 UI 优化

**状态：已完成**

将原来的一排赛道标签按钮替换为 `<select>` 下拉选择器：
- 原实现：所有赛道名显示为一排 `<button>` 标签，赛道多时占用大量空间
- 新实现：单个 `<select>` 下拉框，选项包含「全部赛道」和各赛道名称
- 视觉风格与页面内其他下拉选择器保持一致

---

## 3. 构建验证

```
npm run build -- SUCCESS
680 modules transformed
SessionHistoryPage chunk: 69.31 kB (gzip: 16.89 kB)
总构建时间: 1.48s
```

无编译错误，无运行时警告。

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `client/src/App.jsx` | 修改 | 移除 LeaderboardPage 引用，精简 tabs，增加导航重定向 |
| `client/src/components/pages/SessionHistoryPage.jsx` | 修改 | 合并排行榜功能，增加子 Tab，改赛道筛选为下拉框 |
| `client/src/components/pages/LeaderboardPage.jsx` | 保留但不再引用 | 功能已迁移，文件可作为参考保留 |
| `server/src/index.js` | 未改动 | DELETE /api/sessions/:id 路由已存在 |

---

## 5. 用户可见变化

1. 顶部导航栏从 6 个 Tab 减少为 5 个（「比赛中心」替代「比赛记录」+「圈速榜」）
2. 进入比赛中心后，顶部有两个子 Tab：「比赛记录」和「圈速排行榜」
3. 赛道筛选改为下拉选择器，节省左侧面板空间
4. 键盘快捷键重新编号：1=仪表盘, 2=赛道, 3=比赛中心, 4=车辆, 5=调校
5. 赛道管理页面中点击排行榜按钮（⏱）仍然正常工作，会自动跳转到比赛中心的排行榜子 Tab
