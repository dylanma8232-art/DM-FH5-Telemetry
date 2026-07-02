# 车辆工坊深度优化 Round 1-5

## 概述

对调校管理（TuneManagerPage）和车辆管理（VehicleManagerPage）两大核心模块进行深度优化，覆盖智能提示、遥测诊断、车辆对比、导入导出和详情视图五个方向。

---

## Round 1: 调校参数联动智能提示

### 新增功能

**1. 参数高亮闪烁动画**

配件升级解锁新参数时，不再仅显示 toast 提示，新解锁的参数输入框会触发绿色边框闪烁动画（`paramHighlight` keyframe，0.5s 间隔，循环 3 次），参数标签旁显示 "NEW" 标记。

**2. 推荐值提示**

基于 `getTuneDefaults()` 计算当前配件配置下的推荐默认值，每个参数输入框下方显示：
- 黄色文字 "推荐: XX"
- 当参数值偏离推荐值时，输入框显示黄色边框
- 旁边显示可点击的 "重置" 链接

**3. "重置为推荐值" 按钮**

每个参数分组（轮胎/悬挂/传动/空力）标题栏右侧新增 "重置为推荐值" 按钮，一键将该分组所有参数恢复到推荐默认值。

### 技术实现

- 新增 `highlightedParams` state，记录当前高亮的参数嵌套路径
- 新增 `tuneDefaults` useMemo，将 flat key 映射为嵌套路径 `category.field`
- 新增 `ni()` 辅助函数，自动为 NumberInput 注入 `defaultValue`/`highlighted`/`onResetDefault` 属性
- `NumberInput` 组件扩展接收 `defaultValue`、`highlighted`、`onResetDefault` 三个新属性
- CSS `@keyframes paramHighlight` 通过 `<style>` 标签内联注入

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`

---

## Round 2: 遥测诊断功能完善

### 新增功能

**1. 诊断结果严重程度排序**

诊断结果列表按严重程度排序：`high > medium > low > info`，高严重程度问题优先展示，方便用户快速定位关键问题。

**2. "应用全部建议" 按钮**

原 "应用诊断建议" 按钮重命名为 "应用全部建议"，语义更清晰，样式使用绿色高亮。

**3. "重新诊断" 按钮**

诊断面板底部新增 "重新诊断" 按钮，修改调校参数后可一键重新触发遥测诊断，查看参数调整后的效果。按钮使用蓝色高亮，诊断中显示加载状态。

### 技术实现

- `severityOrder` 映射表：`{ high: 0, medium: 1, low: 2, info: 3 }`
- 诊断结果 `issues` 数组在展示前执行 `.sort()` 排序
- "重新诊断" 按钮直接调用 `runTelemetryDiagnosis()`

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`

---

## Round 3: 车辆管理增强

### 新增功能

**1. 车辆卡片赛道适配信息**

每个车辆卡片底部显示该车辆跑过的赛道标签列表（最多显示 4 条 + "+N" 折叠提示），使用小标签样式展示。

**2. 最佳圈速 / 平均圈速统计**

车辆卡片统计区域从 3 格扩展为 4 格，新增 "均速" 列，显示该车辆所有有效圈速的加权平均值（基于最近有圈速记录的比赛）。

**3. 车辆对比功能**

- 顶部新增 "对比" 按钮，进入对比模式
- 对比模式下点击车辆卡片选择（最多选 2 辆），选中卡片显示蓝色序号标记
- 选择 2 辆后自动弹出对比面板，展示：
  - 基础信息对比：PI / 驱动类型 / 等级 / 比赛次数 / 最佳圈速 / 平均圈速 / 赛道数
  - 共同赛道圈速对比：逐赛道对比两车最佳圈速，更快者绿色高亮
  - 独占赛道展示：各车独有赛道以彩色标签列出

### 技术实现

- `statsByOrdinal` 增强：新增 `avgLap`、`trackList` 字段
- `compareMode` / `compareSelected` state 管理对比状态
- `compareData` useMemo 计算对比分析数据
- 赛道性能对比通过 sessions 数据实时计算

### 修改文件

- `client/src/components/pages/VehicleManagerPage.jsx`（全量重写）

---

## Round 4: 调校导入导出优化

### 新增功能

**1. 分享码支持中文**

使用 `TextEncoder` / `TextDecoder` 替代 `btoa` / `atob` 进行编解码，支持包含中文字符的调校名称。

**2. 分享码添加校验和**

分享码格式升级为 `base64(payload).XXX`（XXX 为 3 位校验和），基于简单 hash 算法计算。导入时自动验证校验和，失败则提示 "分享码校验失败，可能复制不完整"。

**3. 导入预览**

分享码导入弹窗新增 "预览调校" 按钮，点击后解析分享码并显示预览面板，包含：
- 调校名称和适用车辆
- 四组参数的当前值一览
- "确认导入" 按钮

用户可先预览再决定是否导入。

**4. 版本号和兼容性检查**

- 分享码版本升级为 `v2`，JSON 导出版本升级为 `v3`
- 导出 JSON 新增 `generator` 和 `compatibility` 字段
- 导入时校验版本号，高版本分享码提示 "请更新软件"

### 技术实现

- `uint8ToBase64()` / `base64ToUint8()` 工具函数处理字节转换
- `simpleChecksum()` 使用 djb2 变体 hash 算法
- `importPreview` state 控制预览面板显示
- `parseShareCode()` 返回值支持 `{ error }` 格式，增强错误处理

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`

---

## Round 5: 调校详情视图优化

### 新增功能

**1. 参数与默认值差异显示**

调校卡片展开详情时，每个 `ParamItem` 旁边显示与推荐默认值的差值：
- 差值数字使用彩色标签显示（+X / -X）
- 前束角参数：接近 0 显示绿色（更好），远离 0 显示红色（更差）
- 其他参数：使用黄色中性色表示变化
- 无默认值时不显示差值

**2. 参数分组颜色分区**

四个参数分组使用不同颜色的左边框线进行视觉区分：
- 轮胎参数：蓝色 (`#58a6ff`)
- 悬挂参数：橙色 (`#d29922`)
- 传动系统：绿色 (`#3fb950`)
- 空气动力学：紫色 (`#bc8cff`)

每组标题颜色与左边框一致，增强可识别性。

**3. 调校笔记功能**

- 调校数据模型新增 `notes` 字段（字符串）
- 编辑表单新增 "调校笔记" 文本域（3 行，可扩展）
- 展开详情底部显示当前调校笔记内容
- 笔记内容随调校一起保存和加载

### 技术实现

- `ParamItem` 组件扩展 `defaultValue` 属性，计算差值并渲染彩色标签
- 详情展开区域使用 IIFE 内联计算 `tuneDefaultsForView`
- 每组使用 `borderLeft: '3px solid COLOR'` 实现彩色分区
- `saveTune` payload 包含 `notes` 字段

### 修改文件

- `client/src/components/pages/TuneManagerPage.jsx`

---

## 构建验证

每轮修改后执行 `npm run build`，全部通过：

```
Round 1: ✓ built in 1.82s
Round 2: ✓ built in 1.45s
Round 3: ✓ built in 1.51s
Round 4: ✓ built in 1.49s
Round 5: ✓ built in 1.48s
```

---

## 修改文件汇总

| 文件 | 轮次 | 变更类型 |
|------|------|----------|
| `TuneManagerPage.jsx` | R1-R5 | 增量修改 |
| `VehicleManagerPage.jsx` | R3 | 全量重写 |
