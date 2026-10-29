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
  street:   { zh: '街车级', en: 'Street',  color: '#58a6ff', sort: 1 },
  sport:    { zh: '跑车级', en: 'Sport',   color: '#3fb950', sort: 2 },
  race:     { zh: '赛车级', en: 'Race',    color: '#d29922', sort: 3 },
  extreme:  { zh: '极限级', en: 'Extreme', color: '#f85149', sort: 4 }
};

// ============================================================
// 配件类别定义 (30+类)
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
  weight_reduction:  { stock: 3,  street: 5,  sport: 8,  race: 4  },

  // 发动机子项
  engine_intake:       { stock: 2, street: 4, sport: 6, race: 3 },
  engine_fuel_system:  { stock: 3, street: 5, sport: 8, race: 4 },
  engine_ignition:     { stock: 1, street: 2, sport: 4, race: 2 },
  engine_camshaft:     { stock: 6, street: 10, sport: 15, race: 12 },
  engine_valves:       { stock: 2, street: 4, sport: 6, race: 3 },
  engine_displacement: { stock: 4, street: 7, sport: 11, race: 8 },
  engine_pistons:      { stock: 3, street: 6, sport: 9, race: 6 },
  engine_turbo:        { stock: 8, street: 14, sport: 22, race: 16 },
  engine_intercooler:  { stock: 2, street: 3, sport: 5, race: 3 },
  engine_oil_cooling:  { stock: 1, street: 2, sport: 4, race: 2 },
  engine_flywheel:     { stock: 1, street: 2, sport: 4, race: 2 },

  // 传动与底盘子项
  driveline:           { stock: 1, street: 2, sport: 4, race: 2 },
  roll_cage:           { stock: 1, street: 2, sport: 4, race: 2 },

  // 轮胎尺寸与轮距
  tires_width_front:   { stock: 2, street: 4, sport: 6, race: 3 },
  tires_width_rear:    { stock: 3, street: 6, sport: 9, race: 5 },
  rim_size_front:      { stock: 1, street: 2, sport: 3, race: 1 },
  rim_size_rear:       { stock: 1, street: 2, sport: 3, race: 1 },
  track_width_front:   { stock: 1, street: 2, sport: 3, race: 1 },
  track_width_rear:    { stock: 1, street: 2, sport: 3, race: 1 }
};

/**
 * 配件类别完整定义
 */
const PART_CATEGORIES = [
  {
    id: 'engine_swap',
    label: '引擎置换',
    labelEn: 'Engine Swap',
    icon: '⚙️',
    description: '更换引擎，影响最大马力、最大扭矩、车重和车辆平衡',
    tierSystem: false,
    options: [
      { id: 'stock', label: '原厂引擎', labelEn: 'Stock Engine', piBonus: 0, powerMod: 0, torqueMod: 0, weightMod: 0 }
    ]
  },
  {
    id: 'drivetrain_swap',
    label: '驱动置换',
    labelEn: 'Drivetrain Swap',
    icon: '🔄',
    description: '改变驱动形式（前驱/后驱/四驱），大幅改变操控特性',
    tierSystem: false,
    options: [
      { id: 'stock', label: '原厂驱动', labelEn: 'Stock Drivetrain', piBonus: 0 },
      { id: 'fwd', label: '前轮驱动 FWD', labelEn: 'FWD', piBonus: -15 },
      { id: 'rwd', label: '后轮驱动 RWD', labelEn: 'RWD', piBonus: -10 },
      { id: 'awd', label: '四轮驱动 AWD', labelEn: 'AWD', piBonus: 25 }
    ]
  },
  {
    id: 'aspiration_swap',
    label: '进气置换',
    labelEn: 'Aspiration Swap',
    icon: '🌪️',
    description: '加装或更换增压系统类别（涡轮/双涡轮/机械增压）',
    tierSystem: false,
    options: [
      { id: 'stock', label: '原厂进气方式', labelEn: 'Stock Aspiration', piBonus: 0 },
      { id: 'turbo', label: '单涡轮增压', labelEn: 'Single Turbo', piBonus: 15 },
      { id: 'twin_turbo', label: '双涡轮增压', labelEn: 'Twin Turbo', piBonus: 20 },
      { id: 'supercharger', label: '机械增压', labelEn: 'Supercharger', piBonus: 18 }
    ]
  },
  {
    id: 'engine_intake',
    label: '引擎进气系统',
    labelEn: 'Intake',
    icon: '💨',
    description: '升级进气滤网及进气歧管',
    tierSystem: true,
    piSteps: PI_TABLE.engine_intake
  },
  {
    id: 'engine_fuel_system',
    label: '燃油系统',
    labelEn: 'Fuel System',
    icon: '⛽',
    description: '升级喷油嘴及燃油泵',
    tierSystem: true,
    piSteps: PI_TABLE.engine_fuel_system
  },
  {
    id: 'engine_ignition',
    label: '点火系统',
    labelEn: 'Ignition',
    icon: '⚡',
    description: '升级点火线圈与火花塞',
    tierSystem: true,
    piSteps: PI_TABLE.engine_ignition
  },
  {
    id: 'exhaust',
    label: '排气系统',
    labelEn: 'Exhaust',
    icon: '🔊',
    description: '更换排气管与催化器，提升排气效率',
    tierSystem: true,
    piSteps: PI_TABLE.exhaust
  },
  {
    id: 'engine_camshaft',
    label: '凸轮轴',
    labelEn: 'Camshaft',
    icon: '⚙️',
    description: '升级凸轮轴，提升中高转速马力，提高最高转速上限',
    tierSystem: true,
    piSteps: PI_TABLE.engine_camshaft
  },
  {
    id: 'engine_valves',
    label: '气门与弹簧',
    labelEn: 'Valves',
    icon: '🔩',
    description: '升级气门机构，提升引擎呼吸效率',
    tierSystem: true,
    piSteps: PI_TABLE.engine_valves
  },
  {
    id: 'engine_displacement',
    label: '发动机排量',
    labelEn: 'Displacement',
    icon: '🧪',
    description: '扩缸增加排量，全转速区间提升扭矩',
    tierSystem: true,
    piSteps: PI_TABLE.engine_displacement
  },
  {
    id: 'engine_pistons',
    label: '活塞与压缩比',
    labelEn: 'Pistons',
    icon: '⚙️',
    description: '更换锻造活塞，提高压缩比',
    tierSystem: true,
    piSteps: PI_TABLE.engine_pistons
  },
  {
    id: 'engine_turbo',
    label: '增压器套件',
    labelEn: 'Turbocharger',
    icon: '🐌',
    description: '更换更大号的增压器或废气旁通阀',
    tierSystem: true,
    piSteps: PI_TABLE.engine_turbo
  },
  {
    id: 'engine_intercooler',
    label: '中冷器',
    labelEn: 'Intercooler',
    icon: '❄️',
    description: '换装高效中冷器，降低进气温度',
    tierSystem: true,
    piSteps: PI_TABLE.engine_intercooler
  },
  {
    id: 'engine_oil_cooling',
    label: '机油冷却',
    labelEn: 'Oil Cooling',
    icon: '🌡️',
    description: '换装机油冷凝器，确保引擎稳定运转',
    tierSystem: true,
    piSteps: PI_TABLE.engine_oil_cooling
  },
  {
    id: 'engine_flywheel',
    label: '飞轮',
    labelEn: 'Flywheel',
    icon: '💿',
    description: '换装轻量化飞轮，加快引擎转速爬升与下落速度',
    tierSystem: true,
    piSteps: PI_TABLE.engine_flywheel
  },
  {
    id: 'aspiration',
    label: '进气增压大项',
    labelEn: 'Aspiration Kit',
    icon: '💨',
    description: '进气增压主改装选项',
    tierSystem: true,
    piSteps: PI_TABLE.aspiration
  },
  {
    id: 'transmission',
    label: '变速箱',
    labelEn: 'Transmission',
    icon: '🔀',
    description: '更换变速箱，影响齿比范围，Sport以上解锁自定义齿比',
    tierSystem: true,
    piSteps: PI_TABLE.transmission
  },
  {
    id: 'clutch',
    label: '离合器',
    labelEn: 'Clutch',
    icon: '🔧',
    description: '更换离合器，影响换挡动力中断时间',
    tierSystem: true,
    piSteps: PI_TABLE.clutch
  },
  {
    id: 'driveline',
    label: '传动轴',
    labelEn: 'Driveline',
    icon: '🥖',
    description: '换装碳纤维/轻量化传动轴，降低传动损耗与转动惯量',
    tierSystem: true,
    piSteps: PI_TABLE.driveline
  },
  {
    id: 'differential',
    label: '差速器',
    labelEn: 'Differential',
    icon: '🔄',
    description: '更换差速器，逐步解锁差速器加速/减速/中央差速调校',
    tierSystem: true,
    piSteps: PI_TABLE.differential
  },
  {
    id: 'tires_compound',
    label: '轮胎配方',
    labelEn: 'Tire Compound',
    icon: '🛞',
    description: '更换轮胎配方，大幅影响抓地力；Sport以上解锁外倾角和束角调校',
    tierSystem: true,
    piSteps: PI_TABLE.tires_compound
  },
  {
    id: 'tires_width',
    label: '轮胎宽度大项',
    labelEn: 'Tire Width',
    icon: '🛞',
    description: '轮胎宽度主改装项',
    tierSystem: true,
    piSteps: PI_TABLE.tires_width
  },
  {
    id: 'tires_width_front',
    label: '前轮胎宽度',
    labelEn: 'Front Tire Width',
    icon: '🛞',
    description: '加宽前胎，提升弯道导向能力与刹车抓地力',
    tierSystem: true,
    piSteps: PI_TABLE.tires_width_front
  },
  {
    id: 'tires_width_rear',
    label: '后轮胎宽度',
    labelEn: 'Rear Tire Width',
    icon: '🛞',
    description: '加宽后胎，大幅提升驱动轮加速抓地力',
    tierSystem: true,
    piSteps: PI_TABLE.tires_width_rear
  },
  {
    id: 'rim_size_front',
    label: '前轮毂尺寸',
    labelEn: 'Front Rim Size',
    icon: '🎡',
    description: '加大前轮毂，减少轮胎胎壁厚度，提升转向瞬态响应',
    tierSystem: true,
    piSteps: PI_TABLE.rim_size_front
  },
  {
    id: 'rim_size_rear',
    label: '后轮毂尺寸',
    labelEn: 'Rear Rim Size',
    icon: '🎡',
    description: '加大后轮毂，提升高速出弯车尾支撑性',
    tierSystem: true,
    piSteps: PI_TABLE.rim_size_rear
  },
  {
    id: 'track_width_front',
    label: '前轮距加宽',
    labelEn: 'Front Track Width',
    icon: '↔️',
    description: '垫宽前轮距，提升前轴侧翻极限与横向稳定性',
    tierSystem: true,
    piSteps: PI_TABLE.track_width_front
  },
  {
    id: 'track_width_rear',
    label: '后轮距加宽',
    labelEn: 'Rear Track Width',
    icon: '↔️',
    description: '垫宽后轮距，提升高速过弯车尾侧向抓地力',
    tierSystem: true,
    piSteps: PI_TABLE.track_width_rear
  },
  {
    id: 'brakes',
    label: '制动系统',
    labelEn: 'Brakes',
    icon: '🛑',
    description: '更换刹车系统，解锁刹车力度及前后平衡调校',
    tierSystem: true,
    piSteps: PI_TABLE.brakes
  },
  {
    id: 'suspension',
    label: '悬挂系统',
    labelEn: 'Suspension',
    icon: '🔩',
    description: '更换悬挂系统，逐步解锁弹簧、阻尼、车身高度调校',
    tierSystem: true,
    piSteps: PI_TABLE.suspension
  },
  {
    id: 'anti_roll_bars',
    label: '防倾杆大项',
    labelEn: 'Anti-Roll Bars',
    icon: '📐',
    description: '前后防倾杆改装大项',
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
    id: 'roll_cage',
    label: '底盘防滚架',
    labelEn: 'Roll Cage',
    icon: '🕸️',
    description: '加装防滚架，提升车身扭转刚性，略微增加车重',
    tierSystem: true,
    piSteps: PI_TABLE.roll_cage
  },
  {
    id: 'body_kit',
    label: '宽体套件',
    labelEn: 'Widebody Kit',
    icon: '🚘',
    description: '加装大宽体，提升极限胎宽限制与轮距稳定性',
    tierSystem: false,
    options: [
      { id: 'stock', label: '原厂车身', labelEn: 'Stock Body', piBonus: 0 },
      { id: 'widebody', label: '竞赛宽体套件', labelEn: 'Widebody Kit', piBonus: 15 }
    ]
  },
  {
    id: 'weight_reduction',
    label: '减重',
    labelEn: 'Weight Reduction',
    icon: '⚖️',
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
  // 轮胎胎压 (原厂即可调)
  tire_pressure_front:    { category: null,         minTier: 'stock'  },
  tire_pressure_rear:     { category: null,         minTier: 'stock'  },

  // 轮胎定位 / 悬挂对齐 (倾角/束角/前倾角，需升级悬挂/对齐配件)
  tire_camber_front:      { category: 'suspension', minTier: 'street' },
  tire_camber_rear:       { category: 'suspension', minTier: 'street' },
  tire_toe_front:         { category: 'suspension', minTier: 'street' },
  tire_toe_rear:          { category: 'suspension', minTier: 'street' },
  caster_front:           { category: 'suspension', minTier: 'street' },

  // 悬挂与避震
  spring_front:           { category: 'suspension', minTier: 'street' },
  spring_rear:            { category: 'suspension', minTier: 'street' },
  damping_front:          { category: 'suspension', minTier: 'sport'  },
  damping_rear:           { category: 'suspension', minTier: 'sport'  },
  rebound_front:          { category: 'suspension', minTier: 'sport'  },
  rebound_rear:           { category: 'suspension', minTier: 'sport'  },
  bump_front:             { category: 'suspension', minTier: 'sport'  },
  bump_rear:              { category: 'suspension', minTier: 'sport'  },
  ride_height_front:      { category: 'suspension', minTier: 'street' },
  ride_height_rear:       { category: 'suspension', minTier: 'street' },

  // 防倾杆
  arb_front:              { category: 'anti_roll_bars', minTier: 'street' },
  arb_rear:               { category: 'anti_roll_bars', minTier: 'street' },

  // 刹车系统 (需要改竞技级刹车才能调)
  brake_balance:          { category: 'brakes', minTier: 'race' },
  brake_pressure:         { category: 'brakes', minTier: 'race' },

  // 差速器
  diff_accel:             { category: 'differential', minTier: 'street' },
  diff_decel:             { category: 'differential', minTier: 'sport'  },
  diff_front_accel:       { category: 'differential', minTier: 'street' },
  diff_front_decel:       { category: 'differential', minTier: 'sport'  },
  diff_rear_accel:        { category: 'differential', minTier: 'street' },
  diff_rear_decel:        { category: 'differential', minTier: 'sport'  },
  diff_center:            { category: 'differential', minTier: 'race'   },

  // 传动
  final_drive:            { category: null,         minTier: 'stock'  }, // 始终可用
  gear_1:                 { category: 'transmission', minTier: 'sport'  },
  gear_2:                 { category: 'transmission', minTier: 'sport'  },
  gear_3:                 { category: 'transmission', minTier: 'sport'  },
  gear_4:                 { category: 'transmission', minTier: 'sport'  },
  gear_5:                 { category: 'transmission', minTier: 'sport'  },
  gear_6:                 { category: 'transmission', minTier: 'sport'  },

  // 空力 (修正在 PART_CATEGORIES 中的别名匹配: aero_front / aero_rear)
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
  caster_front: {
    stock:   { min: 1, max: 7, step: 0.1 },
    street:  { min: 1, max: 7, step: 0.1 },
    sport:   { min: 1, max: 7, step: 0.1 },
    race:    { min: 1, max: 7, step: 0.1 },
    extreme: { min: 1, max: 7, step: 0.1 }
  },
  damping_front: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
  },
  damping_rear: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
  },
  rebound_front: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
  },
  rebound_rear: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
  },
  bump_front: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
  },
  bump_rear: {
    stock:   null,
    street:  null,
    sport:   { min: 1, max: 15, step: 0.1 },
    race:    { min: 1, max: 20, step: 0.1 },
    extreme: { min: 1, max: 30, step: 0.1 }
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
  diff_front_accel: {
    stock:   null,
    street:  { min: 0, max: 80, step: 1 },
    sport:   { min: 0, max: 100, step: 1 },
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  diff_front_decel: {
    stock:   null,
    street:  null,
    sport:   { min: 0, max: 80, step: 1 },
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  diff_rear_accel: {
    stock:   null,
    street:  { min: 0, max: 80, step: 1 },
    sport:   { min: 0, max: 100, step: 1 },
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  diff_rear_decel: {
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
  brake_balance: {
    stock:   null,
    street:  null,
    sport:   null,
    race:    { min: 0, max: 100, step: 1 },
    extreme: { min: 0, max: 100, step: 1 }
  },
  brake_pressure: {
    stock:   null,
    street:  null,
    sport:   null,
    race:    { min: 20, max: 200, step: 1 },
    extreme: { min: 20, max: 200, step: 1 }
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
export function getTuneConstraints(parts, freeMode = false) {
  const constraints = {};

  for (const [paramId, rangeMap] of Object.entries(TUNE_RANGES)) {
    if (freeMode) {
      const range = rangeMap.extreme || rangeMap.race || rangeMap.sport || rangeMap.street || rangeMap.stock;
      constraints[paramId] = {
        locked: false,
        min: range?.min ?? null,
        max: range?.max ?? null,
        step: range?.step ?? null
      };
      continue;
    }

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

    // 获取当前配件的等级 (包含别名与 optionId 兼容)
    const getPartTier = catId => {
      const p = parts?.[catId];
      if (p?.tier) return p.tier;
      if (p?.optionId && p.optionId !== 'stock') return 'race';
      if (catId === 'front_aero' && parts?.aero_front) return parts.aero_front.tier || (parts.aero_front.optionId !== 'stock' ? 'race' : 'stock');
      if (catId === 'aero_front' && parts?.front_aero) return parts.front_aero.tier || (parts.front_aero.optionId !== 'stock' ? 'race' : 'stock');
      if (catId === 'rear_aero' && parts?.aero_rear) return parts.aero_rear.tier || (parts.aero_rear.optionId !== 'stock' ? 'race' : 'stock');
      if (catId === 'aero_rear' && parts?.rear_aero) return parts.rear_aero.tier || (parts.rear_aero.optionId !== 'stock' ? 'race' : 'stock');
      return 'stock';
    };
    const currentTier = getPartTier(categoryId);
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
export function getTuneDefaults(parts, rawCarStats) {
  const carStats = rawCarStats || {};
  const constraints = getTuneConstraints(parts);
  const defaults = {};
  const weight = carStats.weight || 1500;
  const drivetrain = (carStats.drivetrain || 'AWD').toUpperCase();

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
      case 'rebound_front':
      case 'rebound_rear':
        // 回弹阻尼约为最大范围的 55-65%
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.60, constraint.step);
        break;

      case 'bump_front':
      case 'bump_rear':
        // 压缩阻尼约为回弹阻尼的 50-60%（约为范围的 30-40%）
        defaults[paramId] = roundToStep(constraint.min + (constraint.max - constraint.min) * 0.35, constraint.step);
        break;

      case 'caster_front':
        // 默认前后倾角约为 5.0 至 6.0 度（提升弯道外倾变动）
        defaults[paramId] = roundToStep(Math.min(constraint.max, Math.max(constraint.min, 5.5)), constraint.step);
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
// 移除了前台冗余的 PI 估算算法与一键升级估算，统一对齐后端 pi-model.js 数据真源
// ============================================================
