# 赛道管理模块 - Deep Round 6-10 深度优化

## 迭代日期
2026-07-01

## 修改范围

| 文件 | 变更类型 |
|------|---------|
| `client/src/hooks/usePaceNoteVoice.js` | Round 6 新增：路书语音播报 Hook |
| `client/src/components/pages/DashboardPage.jsx` | Round 6 语音播报集成 + 状态指示器 |
| `server/src/track-builder.js` | Round 7 验证函数 / Round 8 累积优化 / Round 10 清理 |
| `server/src/index.js` | Round 7 验证 API 端点 |
| `client/src/components/pages/TrackManagerPage.jsx` | Round 7 验证UI / Round 8 数据来源显示 / Round 9 导出增强 |

---

## Round 6: 路书语音播报基础

### 需求
在仪表盘赛道模式下，为路书添加语音播报基础架构。

### 优化方案

#### 6.1 usePaceNoteVoice Hook

新建 `client/src/hooks/usePaceNoteVoice.js`，封装完整的语音播报逻辑：

```js
export function usePaceNoteVoice({
  trackData,
  position,
  currentSpeed,
  enabled = true,
  triggerDistance = 60,  // 触发距离60米
  lang = 'zh-CN',
}) { ... }
```

**核心能力：**

| 功能 | 说明 |
|------|------|
| 自动播报 | 车辆位置变化时检测是否接近弯道，自动触发语音 |
| 分级播报 | 远距离（40-60m）简短预警；近距离（<40m）详细播报 |
| 冷却机制 | 同一弯道5秒内不重复播报 |
| 新圈重置 | 圈数变化时自动重置播报状态 |
| 手动控制 | `announceTurn(idx)` / `announce(text)` / `reset()` / `stop()` |

**播报内容生成逻辑：**

```js
// 远距离预警（40-60米）
"前方3号弯，急弯，右转，120公里每小时"

// 近距离详细（<40米）
"弯道3，急弯，右转，建议120公里每小时，准备刹车，降2档"
```

- 弯道编号、方向（左转/右转）、类型（发夹弯/急弯/中速弯/慢弯）
- 推荐速度（从 `recommendedSpeed` 或 `speedHint`）
- 刹车提示（当前速度超过推荐速度1.2倍时触发"准备刹车"）
- 降档提示（`suggestedGearDrop > 0` 时播报）

**弯道检测算法：**

1. 找到车辆在中心线上最近的索引（全量扫描最近点）
2. 从当前位置向前查找距离最近的弯道
3. 计算沿中心线的实际距离（非直线距离）
4. 支持回绕（赛道末尾到第一弯的距离计算）

#### 6.2 DashboardPage 集成

在 DashboardPage 中引入语音 Hook：

```js
import { usePaceNoteVoice } from '../../hooks/usePaceNoteVoice';

const {
  voiceReady,
  isSpeaking: isVoiceSpeaking,
  lastSpokenTurn,
  reset: voiceReset,
  stop: voiceStop,
} = usePaceNoteVoice({
  trackData,
  position: telemetryData.position,
  currentSpeed: telemetryData.speedKmh,
  enabled: voiceEnabled,
  triggerDistance: 60,
});
```

**新圈重置：** 监听 `lapNumber` 变化，新圈开始时自动 `voiceReset()`。

#### 6.3 语音状态指示器

在仪表盘右上角（连接状态指示器左侧）添加可点击的语音状态指示器：

| 状态 | 显示 | 颜色 |
|------|------|------|
| 关闭 | "语音OFF" | 灰色 |
| 开启（空闲） | "语音ON" + 上次播报弯道号 | 浅蓝 |
| 播报中 | 蓝色脉冲圆点 + "播报中" | 亮蓝 |

点击切换开关，关闭时自动停止当前播报。

---

## Round 7: 赛道精度验证工具

### 需求
在赛道管理中添加"验证赛道"功能，显示赛道数据质量评分。

### 优化方案

#### 7.1 validateTrackQuality 函数

新增于 `server/src/track-builder.js`，导出供 API 使用：

```js
export function validateTrackQuality(trackData) {
  // 返回 { overallScore, grade, details, warnings, suggestions, metadata }
}
```

**五维评分体系：**

| 维度 | 权重 | 评估内容 | 评分标准 |
|------|------|---------|---------|
| 轨迹点数量 | 15% | centerline 点数 | <20: 10分, <50: 35分, <100: 65分, <200: 85分, >=200: 100分 |
| 弯道质量 | 25% | 速度数据完整性、刹车点覆盖率 | 基础80分，缺速度-20，缺刹车点-15 |
| 路书完整性 | 30% | 路书弯道数、推荐速度覆盖、直道数据 | 基础70分，缺推荐速度-15，缺直道-10 |
| 数据丰富度 | 15% | 轨迹比赛次数 | 1次: 40分, 2次: 60分, 3-4次: 80分, >=5次: 100分 |
| 赛道覆盖度 | 15% | 中心线连续性（间距检测） | 基础60分，大间距-20，超大间距-15 |

**评级系统：**

| 分数范围 | 评级 | 颜色 |
|----------|------|------|
| >= 85 | A | 绿色 |
| >= 70 | B | 绿色 |
| >= 50 | C | 黄色 |
| >= 30 | D | 黄色 |
| < 30 | F | 红色 |

**警告和建议生成：**
- 轨迹点不足 -> "请至少跑1圈完整的赛道"
- 弯道缺速度 -> "X/Y 个弯道缺少速度数据"
- 仅1次比赛 -> "建议再跑2-3次以提高数据稳定性"
- 中心线断点 -> "中心线有N个大间距点，可能存在数据断点"

#### 7.2 验证 API 端点

```
GET /api/tracks/:id/validate
```

返回完整的验证结果 JSON。

#### 7.3 客户端验证 UI

**赛道列表内联显示：**
- 每个赛道卡片新增 "验证" 按钮（对勾图标）
- 验证后在卡片底部内联显示评分和建议

**详情弹窗自动验证：**
- 打开详情弹窗时自动调用验证 API
- 在弹窗顶部显示完整的验证面板：
  - 圆形评级徽章（A/B/C/D/F）
  - 综合评分数字
  - 数据来源信息
  - 五维评分条形图
  - 警告列表（黄色三角图标）
  - 改进建议列表（蓝色灯泡图标）

---

## Round 8: 路书累积优化

### 需求
多次跑同赛道时，路书数据自动优化。

### 优化方案

#### 8.1 稳定性速度计算

**修改前：** 入弯/弯中/出弯速度取中心线单点的聚合平均值（受异常值影响）。

**修改后：** 从所有原始轨迹点中收集弯道区域的速度样本，使用 P75 分位数（"最稳定的最快"）：

```js
function getStableSpeed(speeds) {
  const sorted = [...speeds].sort((a, b) => a - b);
  const p75Idx = Math.floor(sorted.length * 0.75);
  return sorted[Math.min(p75Idx, sorted.length - 1)];
}
```

原理：
- P75 比最大值更稳定（排除极端异常值）
- P75 比中位数更快（保留较好的成绩）
- 代表"大多数时候能达到的速度"

#### 8.2 刹车点多次平均

**修改前：** 刹车点取单次最大刹车值的位置。

**修改后：** 从所有轨迹中收集刹车强度 > 50 的点索引，取平均位置：

```js
const avgBrakeIdx = stats.brakeIndices.length > 0
  ? Math.round(stats.brakeIndices.reduce((a, b) => a + b, 0) / stats.brakeIndices.length)
  : turn.brakePointIdx;
```

#### 8.3 降档建议累积

从多条轨迹中收集入弯-弯中档位差值，取平均：

```js
const avgGearDrop = stats.gearDrops.length > 0
  ? Math.round(stats.gearDrops.reduce((a, b) => a + b, 0) / stats.gearDrops.length)
  : turn.suggestedGearDrop;
```

#### 8.4 数据来源计数

路书数据新增 `dataSourceCount` 字段：

```js
routeBook.dataSourceCount = new Set(allPoints.map(p => p.trajIndex)).size;
```

每个弯道路书新增 `dataSources` 统计：

```js
dataSources: {
  entrySpeedSamples: 45,    // 入弯速度样本数
  apexSpeedSamples: 42,     // 弯中速度样本数
  exitSpeedSamples: 38,     // 出弯速度样本数
  brakePointSamples: 12,    // 刹车点样本数
}
```

#### 8.5 客户端数据来源显示

路书表标题栏右侧显示 "基于 N 次比赛数据"（取 `routeBook.dataSourceCount || dataSourceCount || trajectoryCount`）。

---

## Round 9: 赛道导出增强

### 需求
增强赛道数据导出能力。

### 优化方案

#### 9.1 导出赛道数据为 JSON

点击 "导出JSON" 按钮，生成包含完整赛道数据的 JSON 文件：

```json
{
  "name": "赛道名称",
  "length": 3200,
  "pointCount": 180,
  "trajectoryCount": 3,
  "dataSourceCount": 3,
  "turns": [...],
  "routeBook": {...},
  "centerline": [...]
}
```

弯道数据包含：类型、方向、角度、半径、推荐速度、速度提示、入/弯中/出弯速度、降档建议、坐标等。

#### 9.2 导出路书为 TXT

点击 "导出路书TXT" 按钮，生成适合打印的纯文本路书：

```
========================================
  路书: 赛道名称
  长度: 3200m | 弯道: 12个
  数据来源: 3次比赛
========================================

弯道 1      左转发夹弯  135°  推荐: 85km/h     入弯: 180km/h  弯中: 82km/h   降2档
弯道 2      右转急弯    78°   推荐: 120km/h    入弯: 200km/h  弯中: 115km/h  降1档
...

----------------------------------------
注: 推荐速度基于半径计算和比赛数据。
    建议多次跑同赛道以获得更准确的路书。
========================================
```

#### 9.3 导出赛道图片含路书叠加

导出 PNG 时在图片左下角叠加路书摘要：

- 半透明深色背景面板
- 显示赛道名称 + "路书摘要" 标题
- 列出最多8个弯道：编号、方向(L/R)、角度、推荐速度、降档、入弯速度
- 右下角显示 "基于 N 次比赛数据"

#### 9.4 工具栏导出按钮

赛道预览工具栏新增三个导出按钮：
- "导出图片" (已有，Round 9 增强：叠加路书信息)
- "导出JSON" (新增)
- "导出路书TXT" (新增)

---

## Round 10: 代码清理

### 删除的未使用代码

| 函数 | 文件 | 原因 |
|------|------|------|
| `getWindowSize(speed)` | track-builder.js | 从未被调用，已被内联窗口计算替代 |
| `getTurnTypeByRadius(radius)` | track-builder.js | 从未被调用，已被 `getTurnCategory(angleDeg)` 替代 |
| `smoothAngles(angles)` | track-builder.js | 从未被调用，Savitzky-Golay 平滑未被使用（中心线使用高斯 EWMA） |
| `analyzeBrakePoint(...)` | track-builder.js | 旧版兼容函数，已被 `detectTurnsEnhanced` 内联的刹车检测替代 |
| `detectTurns(centerline)` | track-builder.js | 旧版兼容包装器，仅委托给 `detectTurnsEnhanced` |

### 保留的函数确认

| 函数 | 用途 | 调用者 |
|------|------|--------|
| `buildTrackFromTrajectories` | 轨迹聚合 | 导出 + index.js |
| `smoothCenterline` | 中心线平滑 | buildTrackFromTrajectories |
| `resampleCenterline` | 等距采样 | buildTrackFromTrajectories |
| `orderPoints` | 点排序 | buildTrackFromTrajectories |
| `calculateCurvatureRadius` | 曲率半径 | detectTurnsEnhanced |
| `getTurnCategory` | 弯道分类 | detectTurnsEnhanced |
| `calculateRecommendedSpeed` | 推荐速度 | detectTurnsEnhanced |
| `detectTurnsEnhanced` | 弯道检测 | buildTrackFromTrajectories |
| `buildRouteBook` | 路书构建 | buildTrackFromTrajectories |
| `generateNavigationData` | 导航数据 | 导出 + index.js |
| `calculateTrackSimilarity` | 简单相似度 | 导出 |
| `calculateDirectionSimilarity` | 方向相似度 | calculateTrackSimilarity |
| `getDirectionDistribution` | 方向分布 | calculateDirectionSimilarity |
| `recognizeTrack` | 赛道识别 | 导出 + index.js |
| `calculateAdvancedSimilarity` | 高级相似度 | recognizeTrack |
| `calculateHausdorffScore` | Hausdorff | calculateAdvancedSimilarity |
| `calculateDirectedHausdorff` | 有向Hausdorff | calculateHausdorffScore |
| `calculateShapeScore` | 形状匹配 | calculateAdvancedSimilarity |
| `calculateCurvatureDistribution` | 曲率分布 | calculateShapeScore |
| `compareHistograms` | 直方图比较 | calculateShapeScore |
| `calculateBoundsScore` | 边界匹配 | calculateAdvancedSimilarity |
| `getBounds` | 获取边界 | calculateBoundsScore + recognizeTrack |
| `calculateLengthScore` | 长度匹配 | calculateAdvancedSimilarity |
| `calculatePathLength` | 路径长度 | calculateLengthScore |
| `calculateFrechetScore` | Frechet近似 | calculateAdvancedSimilarity |
| `discreteFrechet` | 离散Frechet | calculateFrechetScore |
| `samplePoints` | 均匀采样 | calculateTrackSimilarity + Hausdorff + Frechet |
| `generateSectors` | 分段生成 | 导出 + index.js |
| `validateTrackQuality` | 质量验证 | 导出 + index.js API |

### 导出模块更新

```js
export default {
  buildTrackFromTrajectories,
  generateNavigationData,
  calculateTrackSimilarity,
  generateSectors,
  recognizeTrack,
  validateTrackQuality  // Round 7 新增
};
```

---

## 构建验证

| 轮次 | 构建结果 | 备注 |
|------|---------|------|
| Round 6 | SUCCESS | usePaceNoteVoice Hook + DashboardPage 语音集成 + 状态指示器 |
| Round 7 | SUCCESS | validateTrackQuality + API + 验证UI面板 |
| Round 8 | SUCCESS | 稳定性速度 + 平均刹车点 + 数据来源计数 |
| Round 9 | SUCCESS | JSON/TXT导出 + PNG路书叠加 |
| Round 10 | SUCCESS | 删除5个未使用函数 + 导出更新 |

注：客户端构建时存在 `VehicleManagerPage.jsx` 的预有错误（CLASS_LABELS 重复声明），与本次修改无关。所有新增/修改文件无编译错误。

---

## Deep Round 6-10 变更总结

| 项 | 修改前 | 修改后 |
|----|-------|-------|
| 语音播报 | 无 | Web Speech API 中文播报，分级预警（远/近），冷却机制，新圈重置 |
| 语音控制 | 无 | 状态指示器（ON/OFF/播报中），点击切换，手动播报API |
| 数据验证 | 无 | 五维评分体系（轨迹点/弯道/路书/丰富度/覆盖度），A-F评级 |
| 验证入口 | 无 | 赛道卡片验证按钮 + 详情弹窗自动验证 + 独立API端点 |
| 速度优化 | 中心线聚合均值 | P75分位数（最稳定的最快） |
| 刹车点 | 单次最大值 | 多次平均位置 |
| 降档建议 | 单次差值 | 多次平均差值 |
| 数据来源显示 | 仅轨迹数 | "基于N次比赛数据" + 每弯样本计数 |
| JSON导出 | 无 | 完整赛道数据（轨迹/弯道/路书/坐标） |
| TXT导出 | 无 | 打印友好路书（弯道列表+速度+降档） |
| PNG导出 | 纯赛道线条 | + 路书摘要叠加（左下角弯道列表+右下角数据来源） |
| 未使用代码 | 5个遗留函数 | 已清理删除 |

## 修改文件行数变化

| 文件 | 修改前 | 修改后 | 变化 |
|------|-------|-------|------|
| `usePaceNoteVoice.js` | (新增) | ~298 行 | +298 |
| `DashboardPage.jsx` | ~787 行 | ~845 行 | +58 |
| `track-builder.js` | ~1647 行 | ~1525 行 | -122 (删除未使用 + 新增验证) |
| `index.js` (server) | ~3696 行 | ~3703 行 | +7 |
| `TrackManagerPage.jsx` | ~1350 行 | ~1450 行 | +100 |
