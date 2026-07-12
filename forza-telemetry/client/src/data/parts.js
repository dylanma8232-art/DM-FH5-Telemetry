/**
 * FH5 PS5版地平线5 官方改装配件数据模型
 * 基于PS5游戏内真实改装系统完全重构
 *
 * 核心规则:
 * - 每辆车出厂自带Stock配件（即初始配件）
 * - 5个升级等级: Stock → Street → Sport → Race → Extreme
 * - 每个等级的配件有不同的PI增量（不同类别增量不同）
 * - 配件决定能调什么参数：Stock只能调胎压，升级后解锁更多
 * - PI锁定机制：用户设定目标PI，系统在PI内自动生成升级方案
 * - 引擎置换(engine_swap)是选项制，不是等级制
 */

// ============================================================
// 等级定义
// ============================================================
const TIERS = ['stock', 'street', 'sport', 'race', 'extreme'];

const TIER_LABELS = {
  stock:    { zh: '原厂',   en: 'Stock',   color: '#8b949e', sort: 0 },
  street:   { zh: '街道级', en: 'Street',  color: '#58a6ff', sort: 1 },
  sport:    { zh: '运动级', en: 'Sport',   color: '#3fb950', sort: 2 },
  race:     { zh: '竞赛级', en: 'Race',    color: '#d29922', sort: 3 },
  extreme:  { zh: '极限级', en: 'Extreme', color: '#f85149', sort: 4 }
};

// ============================================================
// 配件类别定义 (14类)
// ============================================================

/**
 * PI增量表: piTable[categoryId][fromTier][toTier]
 * 只存储相邻等级之间的增量: stock->street, street->sport, sport->race, race->extreme
 */
const PI_TABLE = {
  aspiration:        { stock: 8,  street: 12, sport: 18, race: 15 },
  exhaust:           { stock: 3,  street: 5,  sport: 8,  race: 4  },
  transmission:      { stock: 5,  street: 8,  sport: 10, race: 5  },
  clutch:            { stock: 2,  street: 3,  sport: 5,  race: 3  },
  differential:      { stock: 3,  street: 5,  sport: 7,  race: 4  },
  tires_compound:    { stock: 10, street: 15, sport: 20, race: 10 },
  tires_width:       { stock: 3,  street: 5,  sport: 8,  race: 4  },
  brakes:            { stock: 4,  street: 6,  sport: 10, race: 5  },
  suspension:        { stock: 5,  street: 8,  sport: 12, race: 6  },
  anti_roll_bars:    { stock: 3,  street: 5,  sport: 8,  race: 4  },
  aero_front:        { stock: 2,  street: 4,  sport: 6,  race: 3  },
  aero_rear:         { stock: 3,  street: 5,  sport: 8,  race: 4  },
  weight_reduction:  { stock: 3,  street: 5,  sport: 8,  race: 4  }
};

/**
 * 配件类别完整定义
 */
const PART_CATEGORIES = [
  {
    id: 'engine_swap',
    label: '引擎置换',
    labelEn: 'Engine Swap',
    icon: '\u2699\uFE0F',
    description: '更换引擎，影响最大马力、最大扭矩、车重和车辆平衡',
    tierSystem: false, // 选项制，非等级制
    // options由用户自行添加，此处仅保留原厂
    options: [
      { id: 'stock', label: '原厂引擎', labelEn: 'Stock Engine', piBonus: 0, powerMod: 0, torqueMod: 0, weightMod: 0 }
    ]
  },
  {
    id: 'aspiration',
    label: '进气增压',
    labelEn: 'Aspiration',
    icon: '\uD83D\uDCA8',
    description: '加装涡轮或机械增压，大幅影响马力/扭矩输出曲线',
    tierSystem: true,
    piSteps: PI_TABLE.aspiration
  },
  {
    id: 'exhaust',
    label: '排气系统',
    labelEn: 'Exhaust',
    icon: '\uD83D\uDD0A',
    description: '更换排气管，小幅影响马力和扭矩',
    tierSystem: true,
    piSteps: PI_TABLE.exhaust
  },
  {
    id: 'transmission',
    label: '变速箱',
    labelEn: 'Transmission',
    icon: '\uD83D\uDD00',
    description: '更换变速箱，影响齿比范围，Sport以上解锁自定义齿比',
    tierSystem: true,
    piSteps: PI_TABLE.transmission
  },
  {
    id: 'clutch',
    label: '离合器',
    labelEn: 'Clutch',
    icon: '\uD83D\uDD27',
    description: '更换离合器，影响换挡速度',
    tierSystem: true,
    piSteps: PI_TABLE.clutch
  },
  {
    id: 'differential',
    label: '差速器',
    labelEn: 'Differential',
    icon: '\uD83D\uDD04',
    description: '更换差速器，逐步解锁差速器加速/减速/中央差速调校',
    tierSystem: true,
    piSteps: PI_TABLE.differential
  },
  {
    id: 'tires_compound',
    label: '轮胎配方',
    labelEn: 'Tire Compound',
    icon: '\uD83D\uDEDE',
    description: '更换轮胎配方，大幅影响抓地力；Sport以上解锁外倾角和束角调校',
    tierSystem: true,
    piSteps: PI_TABLE.tires_compound
  },
  {
    id: 'tires_width',
    label: '轮胎宽度',
    labelEn: 'Tire Width',
    icon: '\uD83D\uDEDE',
    description: '加宽轮胎，小幅提升抓地力和PI',
    tierSystem: true,
    piSteps: PI_TABLE.tires_width
  },
  {
    id: 'brakes',
    label: '制动系统',
    labelEn: 'Brakes',
    icon: '\uD83D\uDED1',
    description: '更换刹车系统，影响刹车力度和热衰减特性',
    tierSystem: true,
    piSteps: PI_TABLE.brakes
  },
  {
    id: 'suspension',
    label: '悬挂系统',
    labelEn: 'Suspension',
    icon: '\uD83D\uDD29',
    description: '更换悬挂系统，逐步解锁弹簧、阻尼、车身高度调校',
    tierSystem: true,
    piSteps: PI_TABLE.suspension
  },
  {
    id: 'anti_roll_bars',
    label: '防倾杆',
    labelEn: 'Anti-Roll Bars',
    icon: '\uD83D\uDCD0',
    description: '独立防倾杆改装，Street以上解锁前后防倾杆调校',
    tierSystem: true,
    piSteps: PI_TABLE.anti_roll_bars
  },
  {
    id: 'aero_front',
    label: '前空气动力学',
    labelEn: 'Front Aero',
    icon: '\uD83C\uDFC1',
    description: '加装前空力套件，Street以上解锁前下压力调校',
    tierSystem: true,
    piSteps: PI_TABLE.aero_front
  },
  {
    id: 'aero_rear',
    label: '后空气动力学',
    labelEn: 'Rear Aero',
    icon: '\uD83C\uDFC1',
    description: '加装后空力套件，Street以上解锁后下压力调校',
    tierSystem: true,
    piSteps: PI_TABLE.aero_rear
  },
  {
    id: 'weight_reduction',
    label: '减重',
    labelEn: 'Weight Reduction',
    icon: '\u2696\uFE0F',
    description: '减轻车重，提升加速、刹车和操控性能',
    tierSystem: true,
    piSteps: PI_TABLE.weight_reduction
  }
];

// ============================================================
// 调校参数 → 所需配件等级 映射
// ============================================================

/**
 * 每个调校参数需要哪个类别达到什么等级才能解锁
 * key: 调校参数ID, value: { category, minTier }
 */
const TUNE_REQUIREMENTS = {
  // 轮胎
  tire_pressure_front:    { category: null,         minTier: 'stock'  }, // 始终可用
  tire_pressure_rear:     { category: null,         minTier: 'stock'  },
  tire_camber_front:      { category: 'tires_compound', minTier: 'sport' },
  tire_camber_rear:       { category: 'tires_compound', minTier: 'sport' },
  tire_toe_front:         { category: 'tires_compound', minTier: 'sport' },
  tire_toe_rear:          { category: 'tires_compound', minTier: 'sport' },

  // 悬挂
  spring_front:           { category: 'suspension', minTier: 'street' },
  spring_rear:            { category: 'suspension', minTier: 'street' },
  damping_front:          { category: 'suspension', minTier: 'sport'  },
  damping_rear:           { category: 'suspension', minTier: 'sport'  },
  ride_height_front:      { category: 'suspension', minTier: 'street' },
  ride_height_rear:       { category: 'suspension', minTier: 'street' },

  // 防倾杆 (防倾杆类别自身)
  arb_front:              { category: 'anti_roll_bars', minTier: 'street' },
  arb_rear:               { category: 'anti_roll_bars', minTier: 'street' },

  // 差速器
  diff_accel:             { category: 'differential', minTier: 'street' },
  diff_decel:             { category: 'differential', minTier: 'sport'  },
  diff_center:           { category: 'differential', minTier: 'race'   },

  // 传动
  final_drive:            { category: null,         minTier: 'stock'  }, // 始终可用
  gear_1:                 { category: 'transmission', minTier: 'sport'  },
  gear_2:                 { category: 'transmission', minTier: 'sport'  },
  gear_3:                 { category: 'transmission', minTier: 'sport'  },
  gear_4:                 { category: 'transmission', minTier: 'sport'  },
  gear_5:                 { category: 'transmission', minTier: 'sport'  },
  gear_6:                 { category: 'transmission', minTier: 'sport'  },

  // 空力
  downforce_front:        { category: 'aero_front', minTier: 'street' },
  downforce_rear:         { category: 'aero_rear',  minTier: 'street' }
};

// ============================================================
// 调校参数范围 → 按配件等级
// ============================================================

/**
 * 调校参数范围按等级定义
 * 对于需要特定配件的参数，范围由该配件的最高等级决定
 * key: 调校参数ID, value: { stock, street, sport, race, extreme }
 * 每个等级值: { min, max, step? } 或 null 表示锁定不可调
 */
const TUNE_RANGES = {
  tire_pressure_front: {
    stock:   { min: 28, max: 35, step: 0.5 },
    street:  { min: 26, max: 38, step: 0.5 },
    sport:   { min: 24, max: 42, step: 0.5 },
    race:    { min: 20, max: 50, step: 0.5 },
    extreme: { min: 18, max: 55, step: 0.5 }
  },
  tire_pressure_rear: {
    stock:   { min: 28, max: 35, step: 0.5 },
    street:  { min: 26, max: 38, step: 0.5 },
    sport:   { min: 24, max: 42, step: 0.5 },
    race:    { min: 20, max: 50, step: 0.5 },
    extreme: { min: 18, max: 55, step: 0.5 }
  },
  tire_camber_front: {
    stock:   null,
    street:  null,
    sport:   { min: -5.0, max: 0, step: 0.1 },
    race:    { min: -6.0, max: 0.5, step: 0.1 },
    extreme: { min: -7.0, max: 1.0, step: 0.1 }
  },
  tire_camber_rear: {
    stock:   null,
    street:  null,
    sport:   { min: -5.0, max: 0, step: 0.1 },
    race:    { min: -6.0, max: 0.5, step: 0.1 },
    extreme: { min: -7.0, max: 1.0, step: 0.1 }
  },
  tire_toe_front: {
    stock:   null,
    street:  null,
    sport:   { min: -0.5, max: 0.5, step: 0.1 },
    race:    { min: -0.8, max: 0.8, step: 0.1 },
    extreme: { min: -1.0, max: 1.0, step: 0.1 }
  },
  tire_toe_rear: {
    stock:   null,
    street:  null,
    sport:   { min: -0.5, max: 0.5, step: 0.1 },
    race:    { min: -0.8, max: 0.8, step: 0.1 },
    extreme: { min: -1.0, max: 1.0, step: 0.1 }
  },
  spring_front: {
    stock:   null,
    street:  { min: 1, max: 50, step: 1 },
    sport:   { min: 1, max: 80, step: 1 },
    race:    { min: 1, max: 150, step: 1 },
    extreme: { min: 1, max: 200, step: 1 }
  },
  spring_rear: {
    stock:   null,
    street:  { min: 1, max: 50, step: 1 },
    sport:   { min: 1, max: 80, step: 1 },
    race:    { min: 1, max: 150, step: 1 },
    extreme: { min: 1, max: 200, step: 1 }
  },
  damping_front: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 1 },
    race:    { min: 1, max: 25, step: 1 },
    extreme: { min: 1, max: 30, step: 1 }
  },
  damping_rear: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 1 },
    race:    { min: 1, max: 25, step: 1 },
    extreme: { min: 1, max: 30, step: 1 }
  },
  arb_front: {
    stock:   null,
    street:  { min: 1, max: 30, step: 1 },
    sport:   { min: 1, max: 40, step: 1 },
    race:    { min: 1, max: 55, step: 1 },
    extreme: { min: 1, max: 60, step: 1 }
  },
  arb_rear: {
    stock:   null,
    street:  { min: 1, max: 30, step: 1 },
    sport:   { min: 1, max: 40, step: 1 },
    race:    { min: 1, max: 55, step: 1 },
    extreme: { min: 1, max: 60, step: 1 }
  },
  ride_height_front: {
    stock:   null,
    street:  { min: 3, max: 15, step: 1 },
    sport:   { min: 3, max: 18, step: 1 },
    race:    { min: 3, max: 20, step: 1 },
    extreme: { min: 2, max: 22, step: 1 }
  },
  ride_height_rear: {
    stock:   null,
    street:  { min: 3, max: 15, step: 1 },
    sport:   { min: 3, max: 18, step: 1 },
    race:    { min: 3, max: 20, step: 1 },
    extreme: { min: 2, max: 22, step: 1 }
  },
  diff_accel: {
    stock:   null,
    street:  { min: 0, max: 80, step: 1 },
    sport:   { min: 0, max: 100, step: 1 },
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  diff_decel: {
    stock:   null,
    street:  null,
    sport:   { min: 0, max: 80, step: 1 },
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  diff_center: {
    stock:   null,
    street:  null,
    sport:   null,
    race:    { min: 0, max: 80, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  final_drive: {
    stock:   { min: 1.0, max: 6.0, step: 0.01 },
    street:  { min: 1.0, max: 6.0, step: 0.01 },
    sport:   { min: 1.0, max: 6.0, step: 0.01 },
    race:    { min: 1.0, max: 6.0, step: 0.01 },
    extreme: { min: 1.0, max: 6.0, step: 0.01 }
  },
  gear_1: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  gear_2: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  gear_3: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  gear_4: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  gear_5: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  gear_6: {
    stock:   null,
    street:  null,
    sport:   { min: 0.5, max: 5.0, step: 0.01 },
    race:    { min: 0.5, max: 5.0, step: 0.01 },
    extreme: { min: 0.5, max: 5.0, step: 0.01 }
  },
  downforce_front: {
    stock:   null,
    street:  { min: 0, max: 100, step: 1 },
    sport:   { min: 0, max: 200, step: 1 },
    race:    { min: 0, max: 400, step: 1 },
    extreme: { min: 0, max: 600, step: 1 }
  },
  downforce_rear: {
    stock:   null,
    street:  { min: 0, max: 100, step: 1 },
    sport:   { min: 0, max: 200, step: 1 },
    race:    { min: 0, max: 400, step: 1 },
    extreme: { min: 0, max: 600, step: 1 }
  }
};

// ============================================================
// 配件性能优先级（用于自动升级贪心算法）
// ============================================================

/**
 * 配件类别对整体性能的影响权重
 * 数值越高，该配件升级对车辆综合性能影响越大
 * 贪心算法会优先升级权重高的配件
 */
const PART_PRIORITY = {
  tires_compound:    100,  // 轮胎配方 → 抓地力影响一切
  aspiration:         95,  // 进气增压 → 马力/扭矩核心
  suspension:         80,  // 悬挂 → 操控核心
  brakes:             70,  // 制动 → 安全基础
  transmission:       65,  // 变速箱 → 加速分配
  weight_reduction:   60,  // 减重 → 全面提升
  differential:       55,  // 差速器 → 驱动效率
  aero_front:         40,  // 前空力 → 高速操控
  aero_rear:          38,  // 后空力 → 高速稳定
  exhaust:            35,  // 排气 → 辅助动力
  anti_roll_bars:     30,  // 防倾杆 → 弯道稳定性
  tires_width:        25,  // 轮胎宽度 → 辅助抓地
  clutch:             20   // 离合器 → 换挡辅助
};

// ============================================================
// 导出的常量
// ============================================================

export { TIER_LABELS, PART_CATEGORIES };


// ============================================================
// 1. getDefaultParts() → 返回全Stock初始配件
// ============================================================

/**
 * 返回所有配件类别为Stock的初始配件对象
 * @returns {Object} { categoryId: 'stock', engine_swap: { optionId: 'stock' } }
 *
 * 等级制配件: { tier: 'stock' }
 * 选项制配件(engine_swap): { optionId: 'stock' }
 */
export function getDefaultParts() {
  const defaults = {};
  for (const cat of PART_CATEGORIES) {
    if (cat.tierSystem) {
      defaults[cat.id] = { tier: 'stock' };
    } else {
      defaults[cat.id] = { optionId: 'stock' };
    }
  }
  return defaults;
}

// ============================================================
// 2. getPartCategories() → 返回所有配件类别
// ============================================================

/**
 * 返回所有配件类别的完整定义
 * @returns {Array} 配件类别数组
 */
function getPartCategories() {
  return PART_CATEGORIES;
}

// ============================================================
// 3. getPartTiers(categoryId) → 返回某类配件的所有等级
// ============================================================

/**
 * 返回某个配件类别的所有等级信息
 * 对于等级制配件，返回5个等级的PI增量
 * 对于选项制配件（engine_swap），返回null
 *
 * @param {string} categoryId - 配件类别ID
 * @returns {Array|null} 等级数组，每个元素 { tier, label, labelEn, color, piAdd(从上一级升到本级) }
 *                       或 null（选项制配件）
 */
function getPartTiers(categoryId) {
  const cat = PART_CATEGORIES.find(c => c.id === categoryId);
  if (!cat) return null;
  if (!cat.tierSystem) return null;

  let cumulativePi = 0;
  return TIERS.map((tierName, index) => {
    const labelInfo = TIER_LABELS[tierName];
    // piAdd: 从上一个等级升到该等级的PI增量
    let piAdd = 0;
    if (index > 0) {
      const prevTier = TIERS[index - 1];
      piAdd = cat.piSteps?.[prevTier] || 0;
      cumulativePi += piAdd;
    }
    return {
      tier: tierName,
      label: labelInfo.zh,
      labelEn: labelInfo.en,
      color: labelInfo.color,
      sort: labelInfo.sort,
      piAdd,         // 从上一级到本级的单步增量
      cumulativePi   // 从stock到本级的累计PI
    };
  });
}

// ============================================================
// 4. getPartPiAdd(partId, fromTier, toTier) → 计算PI增量
// ============================================================

/**
 * 计算某个配件从fromTier升级到toTier的总PI增量
 * 支持跨级升级（如 stock → race），会累加中间所有步骤
 *
 * @param {string} partId - 配件类别ID (如 'aspiration', 'tires_compound')
 * @param {string} fromTier - 起始等级 ('stock'|'street'|'sport'|'race')
 * @param {string} toTier - 目标等级 ('street'|'sport'|'race'|'extreme')
 * @returns {number} 总PI增量。如果partId是选项制配件返回0；如果无效返回0
 *
 * @example
 * getPartPiAdd('aspiration', 'stock', 'sport')  // 8 + 12 = 20
 * getPartPiAdd('tires_compound', 'street', 'race') // 15 + 20 = 35
 * getPartPiAdd('brakes', 'race', 'race')        // 0
 */
function getPartPiAdd(partId, fromTier, toTier) {
  if (!partId || !fromTier || !toTier) return 0;

  const cat = PART_CATEGORIES.find(c => c.id === partId);
  if (!cat || !cat.tierSystem) return 0;

  const fromIndex = TIERS.indexOf(fromTier);
  const toIndex = TIERS.indexOf(toTier);

  if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) return 0;

  let totalPi = 0;
  for (let i = fromIndex; i < toIndex; i++) {
    const currentTier = TIERS[i];
    totalPi += cat.piSteps?.[currentTier] || 0;
  }
  return totalPi;
}

// ============================================================
// 5. getTuneConstraints(parts) → 根据配件返回调校参数的锁定状态和范围
// ============================================================

/**
 * 根据当前配件状态，计算所有调校参数的锁定状态和可调范围
 *
 * @param {Object} parts - 当前配件对象
 *   等级制配件: { categoryId: { tier: 'street' } }
 *   选项制配件: { engine_swap: { optionId: 'stock' } }
 * @returns {Object} 调校参数约束
 *   key: 调校参数ID
 *   value: { locked: boolean, min: number|null, max: number|null, step: number|null }
 *
 * @example
 * const constraints = getTuneConstraints(getDefaultParts());
 * // tire_pressure_front: { locked: false, min: 28, max: 35, step: 0.5 }
 * // spring_front: { locked: true, min: null, max: null, step: null }
 */
export function getTuneConstraints(parts) {
  const constraints = {};

  for (const [paramId, rangeMap] of Object.entries(TUNE_RANGES)) {
    const requirement = TUNE_REQUIREMENTS[paramId];

    if (!requirement || requirement.category === null) {
      // 始终可调的参数（胎压、终传比）
      const range = rangeMap.stock;
      constraints[paramId] = {
        locked: false,
        min: range?.min ?? null,
        max: range?.max ?? null,
        step: range?.step ?? null
      };
      continue;
    }

    // 需要特定配件等级才能解锁的参数
    const categoryId = requirement.category;
    const minTierIndex = TIERS.indexOf(requirement.minTier);

    // 获取当前配件的等级
    const currentTier = parts?.[categoryId]?.tier || 'stock';
    const currentTierIndex = TIERS.indexOf(currentTier);

    if (currentTierIndex < minTierIndex) {
      // 未达到最低要求 → 锁定
      constraints[paramId] = { 
        locked: true, 
        min: null, 
        max: null, 
        step: null, 
        reqCategory: categoryId, 
        reqTier: requirement.minTier 
      };
    } else {
      // 已解锁 → 使用当前等级对应的范围
      const range = rangeMap[currentTier] || rangeMap[currentTierIndex >= 0 ? TIERS[currentTierIndex] : 'stock'];
      // 如果当前等级有范围定义
      const effectiveRange = range || findHighestAvailableRange(rangeMap, currentTierIndex);
      if (effectiveRange) {
        constraints[paramId] = {
          locked: false,
          min: effectiveRange.min,
          max: effectiveRange.max,
          step: effectiveRange.step || null
        };
      } else {
        constraints[paramId] = { 
          locked: true, 
          min: null, 
          max: null, 
          step: null, 
          reqCategory: categoryId, 
          reqTier: requirement.minTier 
        };
      }
    }
  }

  return constraints;
}

/**
 * 从当前等级开始向下找到第一个非null的范围定义
 * （用于处理某些参数在更高等级可能有null的情况，回退到次高等级）
 */
function findHighestAvailableRange(rangeMap, tierIndex) {
  for (let i = tierIndex; i >= 0; i--) {
    const range = rangeMap[TIERS[i]];
    if (range) return range;
  }
  return null;
}

// ============================================================
// 6. getTuneDefaults(parts, carStats) → 推荐调校值
// ============================================================

/**
 * 根据当前配件和车辆基础数据计算推荐调校默认值
 * 推荐值基于中等偏优的策略:
 * - 胎压: 偏向范围中值偏低（更好的抓地力）
 * - 外倾角: 偏向负值（提升弯道抓地力）
 * - 束角: 轻微前束或零
 * - 弹簧: 基于车重计算中等硬度
 * - 阻尼: 弹簧的50%左右
 * - 防倾杆: 前硬后软（中性转向）
 * - 车身高度: 偏低（低重心）
 * - 差速器: 中等值
 * - 齿比: 均匀分配
 * - 下压力: 中等偏上
 *
 * @param {Object} parts - 当前配件
 * @param {Object} carStats - 车辆基础数据 { weight, power, torque, drivetrain }
 * @returns {Object} 推荐调校值 { paramId: value }
 */
export function getTuneDefaults(parts, carStats = {}) {
  const constraints = getTuneConstraints(parts);
  const defaults = {};
  const weight = carStats.weight || 1500;
  const power = carStats.power || 300;
  const drivetrain = carStats.drivetrain || 'AWD';

  for (const [paramId, constraint] of Object.entries(constraints)) {
    if (constraint.locked || constraint.min === null || constraint.max === null) {
      defaults[paramId] = null;
      continue;
    }

    const mid = (constraint.min + constraint.max) / 2;

    switch (paramId) {
      // ---- 轮胎 ----
      case 'tire_pressure_front':
      case 'tire_pressure_rear':
        // 偏低胎压 → 更好的抓地力
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.35, constraint.step);
        break;

      case 'tire_camber_front':
      case 'tire_camber_rear':
        // 偏向负值（约-2到-3度），提升弯道抓地力
        defaults[paramId] = roundToStep(Math.max(constraint.min, -2.5), constraint.step);
        break;

      case 'tire_toe_front':
        // 前轮轻微前束（正束角，提升直行稳定性）
        defaults[paramId] = roundToStep(Math.min(constraint.max, 0.1), constraint.step);
        break;

      case 'tire_toe_rear':
        // 后轮零或轻微前束
        defaults[paramId] = 0;
        break;

      // ---- 悬挂 ----
      case 'spring_front':
      case 'spring_rear': {
        // 基于车重计算: 前轮承重约55-60%，后轮40-45%
        const frontRatio = drivetrain === 'FWD' ? 0.62 : drivetrain === 'RWD' ? 0.55 : 0.58;
        const ratio = paramId === 'spring_front' ? frontRatio : (1 - frontRatio);
        // 弹簧硬度 = (车重比例 * 权重因子) 映射到范围中值
        const baseSpring = (ratio * weight / 20);
        const normalized = Math.min(constraint.max, Math.max(constraint.min, baseSpring));
        defaults[paramId] = roundToStep(normalized, constraint.step);
        break;
      }

      case 'damping_front':
      case 'damping_rear':
        // 阻尼约为弹簧值的40-50%
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.45, constraint.step);
        break;

      case 'arb_front':
        // 前防倾杆偏硬（约55%位置）
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.55, constraint.step);
        break;

      case 'arb_rear':
        // 后防倾杆偏软（约35%位置）→ 产生轻微转向不足（更安全）
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.35, constraint.step);
        break;

      case 'ride_height_front':
      case 'ride_height_rear':
        // 偏低重心
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.3, constraint.step);
        break;

      // ---- 差速器 ----
      case 'diff_accel':
        // 中等偏上，兼顾加速抓地力和转向
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.55, constraint.step);
        break;

      case 'diff_decel':
        // 中等偏下，允许一些转弯滑移
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.35, constraint.step);
        break;

      case 'diff_center':
        // 中等值
        defaults[paramId] = roundToStep(mid, constraint.step);
        break;

      // ---- 传动 ----
      case 'final_drive':
        // 基于马力和极速偏好: 街道偏向加速（较高），赛道偏向极速（较低）
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.5, constraint.step);
        break;

      case 'gear_1':
      case 'gear_2':
      case 'gear_3':
      case 'gear_4':
      case 'gear_5':
      case 'gear_6': {
        // 均匀递增齿比分布
        const gearIndex = parseInt(paramId.split('_')[1]);
        const totalGears = 6;
        const ratio = (gearIndex - 1) / (totalGears - 1); // 0~1
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * (1 - ratio * 0.85), constraint.step);
        break;
      }

      // ---- 空力 ----
      case 'downforce_front':
      case 'downforce_rear':
        // 中等偏上
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.45, constraint.step);
        break;

      default:
        defaults[paramId] = roundToStep(mid, constraint.step);
    }
  }

  return defaults;
}

/**
 * 数值对齐到步进值
 */
function roundToStep(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

// ============================================================
// 7. autoUpgradeToPi(currentParts, currentPi, targetPi) → PI锁定自动升级
// ============================================================

/**
 * 在PI限制内自动生成升级方案（贪心算法）
 * 优先升级对性能影响最大的配件类别
 *
 * @param {Object} currentParts - 当前配件配置
 *   { categoryId: { tier: 'stock' } | { optionId: 'xxx' } }
 * @param {number} currentPi - 当前总PI（已包含配件加成）
 * @param {number} targetPi - 目标PI上限
 * @returns {Object} { parts: Object, totalPiAdd: number, upgrades: Array }
 *   parts: 升级后的配件配置
 *   totalPiAdd: 总PI增量
 *   upgrades: 升级记录 [{ categoryId, from, to, piAdd }]
 *
 * @example
 * // 所有配件为stock，basePi=500，目标PI=600
 * autoUpgradeToPi(getDefaultParts(), 500, 600)
 * // → 在100PI预算内贪心选择最优升级组合
 */
export function autoUpgradeToPi(currentParts, currentPi, targetPi) {
  const piBudget = targetPi - currentPi;
  if (piBudget <= 0) {
    return {
      parts: { ...currentParts },
      totalPiAdd: 0,
      upgrades: []
    };
  }

  // 收集所有可能的升级动作（只考虑等级制配件）
  const possibleUpgrades = [];

  for (const cat of PART_CATEGORIES) {
    if (!cat.tierSystem) continue; // 跳过选项制配件（engine_swap）

    const currentTier = currentParts[cat.id]?.tier || 'stock';
    const currentTierIndex = TIERS.indexOf(currentTier);

    if (currentTierIndex >= TIERS.length - 1) continue; // 已经最高级

    // 考虑升级到下一级
    const nextTierIndex = currentTierIndex + 1;
    const nextTier = TIERS[nextTierIndex];
    const piAdd = cat.piSteps?.[currentTier] || 0;

    possibleUpgrades.push({
      categoryId: cat.id,
      from: currentTier,
      to: nextTier,
      piAdd,
      priority: PART_PRIORITY[cat.id] || 0
    });
  }

  // 按优先级排序（同优先级时PI增量小的优先，更灵活地利用预算）
  possibleUpgrades.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.piAdd - b.piAdd;
  });

  // 贪心选择
  const newParts = { ...currentParts };
  let remainingBudget = piBudget;
  let totalPiAdd = 0;
  const upgrades = [];
  let changed = true;

  // 多轮贪心: 每轮挑选一个最优升级，直到预算不够或无法再升级
  while (changed) {
    changed = false;
    const stillPossible = [];

    for (const cat of PART_CATEGORIES) {
      if (!cat.tierSystem) continue;

      const currentTier = newParts[cat.id]?.tier || 'stock';
      const currentTierIndex = TIERS.indexOf(currentTier);

      if (currentTierIndex >= TIERS.length - 1) continue; // 已最高级

      const nextTierIndex = currentTierIndex + 1;
      const nextTier = TIERS[nextTierIndex];
      const piAdd = cat.piSteps?.[currentTier] || 0;

      if (piAdd <= remainingBudget) {
        stillPossible.push({
          categoryId: cat.id,
          from: currentTier,
          to: nextTier,
          piAdd,
          priority: PART_PRIORITY[cat.id] || 0
        });
      }
    }

    if (stillPossible.length === 0) break;

    // 按优先级排序，选最高优先级
    stillPossible.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.piAdd - b.piAdd;
    });

    const best = stillPossible[0];
    newParts[best.categoryId] = { tier: best.to };
    remainingBudget -= best.piAdd;
    totalPiAdd += best.piAdd;
    upgrades.push(best);
    changed = true;
  }

  return {
    parts: newParts,
    totalPiAdd,
    upgrades
  };
}

// ============================================================
// 8. calculateTotalPi(basePi, parts) → 计算当前配件下的总PI
// ============================================================

/**
 * 计算基础PI + 所有配件升级后的总PI
 *
 * @param {number} basePi - 车辆基础PI（原厂状态）
 * @param {Object} parts - 当前配件配置
 *   等级制: { categoryId: { tier: 'sport' } }
 *   选项制: { engine_swap: { optionId: 'stock' } }
 * @returns {number} 总PI值
 *
 * @example
 * calculateTotalPi(500, getDefaultParts())  // 500 (全Stock)
 * calculateTotalPi(500, { ...getDefaultParts(), aspiration: { tier: 'sport' } })
 * // 500 + 8 + 12 = 520
 */
export function calculateTotalPi(basePi, parts) {
  if (!parts || !basePi) return basePi || 0;

  let totalPiAdd = 0;

  for (const cat of PART_CATEGORIES) {
    if (!cat.tierSystem) {
      // 选项制配件: 从选项的piBonus获取
      const optionId = parts[cat.id]?.optionId || 'stock';
      const option = cat.options?.find(o => o.id === optionId);
      if (option) {
        totalPiAdd += option.piBonus || 0;
      }
      continue;
    }

    // 等级制配件: 累加从stock到当前等级的PI
    const currentTier = parts[cat.id]?.tier || 'stock';
    totalPiAdd += getPartPiAdd(cat.id, 'stock', currentTier);
  }

  return basePi + totalPiAdd;
}
