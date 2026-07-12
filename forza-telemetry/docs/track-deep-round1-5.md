# 赛道管理模块 - Deep Round 1-5 深度优化

## 迭代日期
2026-07-01

## 修改范围

| 文件 | 变更类型 |
|------|---------|
| `server/src/track-builder.js` | Round 1-4 核心算法重写 |
| `client/src/components/pages/TrackManagerPage.jsx` | Round 5 可视化增强 + 路书表增强 |

---

## Round 1: 赛道中心线计算优化

### 需求
当前中心线基于简单网格聚合（每个网格取平均值），容易受异常点影响产生锯齿。

### 优化方案

#### 1.1 简化 DBSCAN 聚类去噪

**修改前：** 网格单元格中点数 >= 2 即认为是有效赛道点。

**修改后：** 使用基于网格坐标的简化 DBSCAN 算法：

```js
const DBSCAN_EPS = 3;      // 网格坐标下8邻域
const DBSCAN_MIN_PTS = 2;  // 至少2个非空邻居

// 计算每个网格点的8邻域非空邻居数
// neighborCount >= DBSCAN_MIN_PTS 才认为是核心点
// 非核心点（偏离主轨迹）被过滤掉
```

核心逻辑：
- 遍历每个网格点，统计8邻域中非空邻居数
- 只有邻居数 >= 2 的点才被认为是"核心点"（属于主轨迹）
- 孤立的网格点（如切弯产生的离群点）被自动排除
- 额外优化：核心点聚合时使用邻居加权中心（距离反比权重），而非简单平均

#### 1.2 高斯加权中心线平滑

**修改前：** 无平滑步骤，中心线直接由最近邻排序产生，可能有锯齿。

**修改后：** 使用高斯加权移动平均平滑：

```js
function smoothCenterline(points, windowSize = 5) {
  // 使用高斯权重（越近的点权重越大）
  const w = Math.exp(-0.5 * (dist / (windowSize / 3))^2);
  // 对 x, y, z, yaw, speed, brake, gear 全部平滑
}
```

特点：
- 比简单移动平均更平滑，对异常值更鲁棒
- 保留 x/y/z 坐标的同时，也平滑 yaw（方向）、speed、brake、gear 等遥测数据
- 窗口大小 5 个采样点

#### 1.3 中心线均匀重采样

**修改前：** 中心线点间距不均匀（取决于网格中点的密度）。

**修改后：** 等距重采样，每 5 米一个点：

```js
function resampleCenterline(centerline, targetSpacing = 5) {
  // 计算累计距离
  // 等距采样，线性插值坐标和遥测数据
  return resampled; // 每个点间距恰好约 5 米
}
```

效果：
- 中心线上点间距均匀（5 米）
- 弯道检测基于等距点，角度计算更准确
- 路书距离计算更精确

---

## Round 2: 弯道检测精度优化

### 需求
旧版弯道检测使用简单的角度阈值（>15度），没有精确的起止点，分类粗糙。

### 优化方案

#### 2.1 基于 Heading 变化率的弯道检测

**修改前：** 计算每个点前后窗口的 heading 差值角度，大于 15 度即标记为弯道。

**修改后：** 逐步跟踪 heading 变化率，检测连续的弯道区域：

```js
// 1. 计算每个点的 heading
const headings = centerline.map((p, i) => 
  Math.atan2(p.z - prev.z, p.x - prev.x)
);

// 2. 计算 heading 变化率（与上一点的 heading 差）
const headingChangeRates = []; // 弧度/点

// 3. 滑动窗口平滑（窗口=5）
const smoothedRates = [];

// 4. 检测连续正/负 heading 变化区域（弯道区域）
//    弯道开始：smoothedRate > 0.05 弧度/点
//    弯道结束：smoothedRate 降至 < 0.025 或方向反转
```

关键改进：
- 不是简单的角度阈值，而是跟踪连续的 heading 变化
- 弯道是一个**区域**（startIdx -> endIdx），不是单个点
- 累加弯道区域内所有 heading 变化得到总角度

#### 2.2 弯道精确起止点

每个弯道包含 `startIdx` 和 `endIdx`：

```js
bendRegions.push({
  startIdx: bendStart,     // 弯道入口（heading 开始变化）
  endIdx: i,               // 弯道出口（heading 变化结束）
  totalAngle: bendAngleDeg, // 累计角度
  direction: 'left' | 'right'
});
```

#### 2.3 细粒度弯道分类

| 角度范围 | 类型 | 标签 | 严重程度 |
|----------|------|------|---------|
| >120     | hairpin | 发夹弯 | critical |
| 60-120   | sharp   | 急弯   | high     |
| 30-60    | medium  | 中速弯 | medium   |
| 15-30    | slow    | 慢弯   | low      |
| <15      | gentle  | 直道微弯 | info    |

```js
function getTurnCategory(angleDeg) {
  if (angleDeg > 120) return { type: 'hairpin', label: '发夹弯', severity: 'critical' };
  if (angleDeg > 60)  return { type: 'sharp', label: '急弯', severity: 'high' };
  // ...
}
```

#### 2.4 弯道半径估算

保留并优化三点圆拟合算法，用于计算每个弯道的曲率半径：

```js
const radius = calculateCurvatureRadius(p1, p2, p3);
// p1 = 入弯点, p2 = apex, p3 = 出弯点
```

---

## Round 3: 路书数据增强

### 需求
旧版路书只有弯道方向、角度和手动输入的推荐速度。需要从遥测数据中提取更多有用信息。

### 优化方案

#### 3.1 速度数据提取

每个弯道新增三个速度字段，从中心线的遥测数据中提取：

```js
turn.entrySpeed = centerline[bend.startIdx].speed || 0;   // 入弯速度 (km/h)
turn.apexSpeed = centerline[apexIdx].speed || 0;          // 弯中速度 (km/h)
turn.exitSpeed = centerline[bend.endIdx].speed || 0;       // 出弯速度 (km/h)
turn.straightMaxSpeed = Math.max(...前段直道速度);         // 直道最大速度 (km/h)
```

#### 3.2 刹车点标记

基于刹车数据（`brake` 字段）提取弯道前的最佳刹车点：

```js
// 扫描弯道前方 20 个采样点的 brake 值
// 找到 brake 最大的点作为刹车点
let brakePointIdx = bend.startIdx;
for (let i = bend.startIdx - 20; i < bend.startIdx; i++) {
  if (centerline[i].brake > maxBrakeBefore) {
    brakePointIdx = i;
  }
}
```

每个弯道新增字段：
- `brakePointIdx`: 刹车点在中心线上的索引
- `brakePointX`, `brakePointZ`: 刹车点坐标

#### 3.3 降档建议

基于入弯和弯中的档位差值：

```js
const gearAtEntry = centerline[bend.startIdx].gear;
const gearAtApex = centerline[apexIdx].gear;
turn.suggestedGearDrop = gearAtEntry - gearAtApex; // 如 2 表示降2档
```

#### 3.4 路书数据结构

新增 `routeBook` 对象，包含完整的路书信息：

```js
track.routeBook = {
  maxSpeed: 320,           // 赛道最大速度
  turns: [
    {
      type: 'hairpin',
      turnCategory: '发夹弯',
      direction: 'left',
      angle: 135,
      recommendedSpeed: 85,
      entrySpeed: 180,
      apexSpeed: 82,
      exitSpeed: 140,
      straightMaxSpeed: 280,
      brakePoint: { x, z, centerlineIndex },
      apex: { x, z, centerlineIndex },
      exit: { x, z, centerlineIndex },
      suggestedGearDrop: 2,
      radius: 25
    }
  ],
  straights: [
    {
      length: 350,
      maxSpeed: 280,
      afterTurn: 0,
      beforeTurn: 1
    }
  ]
};
```

#### 3.5 数据累积优化

多次跑同赛道时，轨迹数据自动合并到 `buildTrackFromTrajectories`，速度数据取多次轨迹的加权平均（邻居加权），因此路书数据随比赛次数自动优化。

---

## Round 4: 赛道匹配精度优化

### 需求
旧版相似度只考虑位置距离，不考虑方向；无法匹配反向赛道。

### 优化方案

#### 4.1 方向相似度维度

新增 `calculateDirectionSimilarity` 函数：

```js
function calculateDirectionSimilarity(points1, points2) {
  const dir1 = getDirectionDistribution(points1);
  const dir2 = getDirectionDistribution(points2);
  // 比较左转/直道/右转比例
  // 差异越小相似度越高
}
```

统计每条轨迹的方向分布（采样 50 个点计算 heading 变化，归类为左转/直道/右转），比较两条轨迹的分布差异。

#### 4.2 改进 calculateTrackSimilarity

```js
// 旧版：仅位置匹配
const positionScore = matchRatio * (1 - avgDist / 20);

// 新版：位置 70% + 方向 30%
const directionScore = calculateDirectionSimilarity(track1Points, track2Points);
return positionScore * 0.7 + directionScore * 0.3;
```

#### 4.3 双向赛道匹配

在 `recognizeTrack` 中同时计算顺时针和逆时针匹配：

```js
// 顺时针匹配
const similarityCW = calculateAdvancedSimilarity(currentPoints, trackPoints);

// 逆时针匹配（反转参考轨迹）
const reversedPoints = [...trackPoints].reverse();
const similarityCCW = calculateAdvancedSimilarity(currentPoints, reversedPoints);

// 取更高分数
const bestSimilarity = max(similarityCW, similarityCCW);
```

匹配结果新增 `reversedMatch: true/false` 标志。

#### 4.4 高级相似度增加方向权重

```js
// 旧版权重
{ hausdorff: 0.25, shape: 0.20, bounds: 0.15, length: 0.10, frechet: 0.30 }

// 新版权重（增加方向维度）
{ hausdorff: 0.20, shape: 0.15, bounds: 0.10, length: 0.10, frechet: 0.30, direction: 0.15 }
```

#### 4.5 匹配阈值调整

- 旧版 `recognizeTrack` 阈值: 0.3
- 新版: 0.4（提高 33%，减少不同赛道的误匹配）

---

## Round 5: 赛道数据可视化增强

### 需求
赛道预览只有蓝色轨迹线，缺少弯道信息、方向指示和路书数据叠加。

### 优化方案

#### 5.1 弯道区域颜色标注

每个弯道根据 `severity` 使用不同颜色：

| 严重程度 | 颜色 | 赛道线 | 背景高亮 |
|----------|------|--------|---------|
| critical | 红色 | #f85149 | rgba(248,81,73,0.15) |
| high     | 橙色 | #f0883e | rgba(240,136,62,0.15) |
| medium   | 黄色 | #d29922 | rgba(210,153,34,0.15) |
| low      | 绿色 | #3fb950 | rgba(63,185,80,0.15) |
| info     | 蓝色 | #58a6ff | rgba(88,166,255,0.10) |

绘制方式：
- 在主轨迹下方先绘制弯道区间的高亮背景（8px 宽度）
- 再绘制弯道区间的边框线（3px 宽度）
- 基于 `centerline` 的 `startIdx` 到 `endIdx` 区间绘制

#### 5.2 弯道编号 + 推荐速度标注

每个弯道的 apex 点绘制：
- 彩色圆圈（14px 半径），内含白色弯道编号
- 圆圈上方显示推荐速度标签（带半透明黑色背景）

#### 5.3 刹车点菱形标记

每个弯道的刹车点位置绘制红色菱形标记（`brakePointX`, `brakePointZ`）。

#### 5.4 方向箭头

沿赛道每隔 80-250 米（根据缩放级别自适应）绘制行驶方向三角形箭头：

```js
const arrowInterval = transform.scale > 2 ? 80 : transform.scale > 1.5 ? 150 : 250;
// 箭头根据 heading 朝向计算方向
```

#### 5.5 起点/终点标记增强

- 起点：白色圆圈 + 黑色 "S" 标记
- 终点：红色圆圈 + 白色 "F" 标记

#### 5.6 右上角图例

如果赛道有弯道数据，右上角显示弯道类型图例（只显示赛道中实际存在的类型）：

```
[发夹弯]
[急弯]
[中速弯]
[慢弯]
```

#### 5.7 路书表增强

底部弯道列表增加更多列：

| 列 | 说明 |
|----|------|
| # | 弯道编号 |
| 类型 | 弯道分类（发夹弯/急弯/中速弯/慢弯） |
| 方向 | 左/右（彩色编码） |
| 角度 | 弯道角度 |
| 入弯 | 入弯速度 (km/h) |
| 弯中 | 弯中速度 (km/h) |
| 出弯 | 出弯速度 (km/h) |
| 推荐 | 可编辑的推荐速度 |
| 降档 | 降档数量（如 -2） |

发夹弯行背景有微弱的红色高亮。

#### 5.8 详情弹窗增强

详情弹窗的弯道列表同样增加：类型、半径、入/弯中/出弯速度、降档建议列。

---

## 构建验证

| 轮次 | 构建结果 | 备注 |
|------|---------|------|
| Round 1 | SUCCESS (服务端) | track-builder.js DBSCAN + 平滑 + 重采样 |
| Round 2 | SUCCESS (服务端) | detectTurnsEnhanced + getTurnCategory |
| Round 3 | SUCCESS (服务端) | buildRouteBook + 速度/刹车/降档提取 |
| Round 4 | SUCCESS (服务端) | 方向相似度 + 双向匹配 + 阈值调整 |
| Round 5 | SUCCESS (客户端) | 方向箭头 + 弯道颜色 + 编号标注 + 刹车点 + 路书表 |

注：客户端构建时存在 `VehicleManagerPage.jsx` 的预有错误（CLASS_LABELS 重复声明），与本次修改无关。`TrackManagerPage.jsx` 无编译错误。

---

## Deep Round 1-5 变更总结

| 项 | 修改前 | 修改后 |
|----|-------|-------|
| 异常点过滤 | 网格点数 >= 2 | DBSCAN 邻域聚类 + 邻居加权 |
| 中心线平滑 | 无 | 高斯加权 EWMA 平滑 |
| 中心线采样 | 网格密度决定 | 等距 5 米重采样 |
| 弯道检测 | 单点角度阈值 | 连续 heading 变化率区域检测 |
| 弯道起止 | 无 | startIdx / endIdx 精确标注 |
| 弯道分类 | 4 级（hairpin/sharp/medium/sweeping） | 5 级（发夹弯/急弯/中速弯/慢弯/直道微弯）+ severity |
| 弯道半径 | 三点圆拟合 | 保留 + 使用起止点+apex 三点 |
| 路书速度 | 仅推荐速度（手动） | 入弯/弯中/出弯速度（自动）+ 推荐速度（手动可编辑） |
| 刹车点 | 基于 speedDiff | 基于 brake 遥测数据 + 坐标标记 |
| 降档建议 | 无 | 入弯档位 - 弯中档位 |
| 直道数据 | 无 | 直道最大速度 + 长度 |
| 轨迹匹配 | 仅位置距离 | 位置 70% + 方向 30% |
| 双向匹配 | 不支持 | 自动尝试正/反向匹配 |
| 匹配阈值 | 0.3 | 0.4（减少误匹配） |
| 赛道预览 | 蓝色线条 + 起终点圆点 | + 方向箭头 + 弯道颜色 + 编号 + 速度标签 + 刹车点菱形 + 图例 |
| 路书表 | 4 列（#/方向/角度/推荐） | 9 列（#/类型/方向/角度/入弯/弯中/出弯/推荐/降档） |

## 修改文件行数变化

| 文件 | 修改前 | 修改后 | 变化 |
|------|-------|-------|------|
| `track-builder.js` | ~984 行 | ~1020 行 | +36（核心算法增强） |
| `TrackManagerPage.jsx` | ~1055 行 | ~1180 行 | +125（可视化 + 路书表增强） |
