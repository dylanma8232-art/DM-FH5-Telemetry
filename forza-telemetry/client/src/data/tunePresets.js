/**
 * FH5 调校预设 - 驾驶问题诊断与遥测数据分析
 *
 * 功能说明:
 * 1. 常用驾驶问题 → 调校参数建议 (25个预设问题)
 * 2. 遥测数据诊断 → 自动检测问题并返回调校建议
 */

// ============================================================
// 问题分类定义
// ============================================================
export const PROBLEM_CATEGORIES = [
  { id: 'steering', label: '转向', color: '#f85149' },
  { id: 'braking', label: '刹车', color: '#d29922' },
  { id: 'chassis', label: '底盘', color: '#58a6ff' },
  { id: 'traction', label: '抓地力', color: '#3fb950' },
  { id: 'stability', label: '稳定性', color: '#bc8cff' },
  { id: 'acceleration', label: '加速', color: '#f778ba' },
  { id: 'speed', label: '速度', color: '#79c0ff' },
  { id: 'gearbox', label: '变速', color: '#ffa657' },
  { id: 'aero', label: '空力', color: '#56d4dd' },
  { id: 'tires', label: '轮胎', color: '#8b949e' }
]

// ============================================================
// 常用驾驶问题 → 调校参数建议
// ============================================================
export const DRIVING_PROBLEMS = [
  // ========== 转向类 ==========
  {
    id: 'understeer_mid',
    name: '中速弯转向不足',
    category: 'steering',
    description: '入弯时车头不肯转，推头明显',
    symptoms: '弯道中需要多打方向盘才能过弯，前轮抓地力不足',
    fixes: {
      frontTirePressure: { delta: -2, reason: '降低前胎压增加接地面积，提升前轮弯道抓地力' },
      rearTirePressure: { delta: 1, reason: '适当提高后胎压，减少后轮抓地力以平衡前后' },
      frontCamber: { delta: -0.5, reason: '增加前轮负外倾角，增强弯道中前轮接地面积' },
      frontARB: { delta: -3, reason: '减小前防倾杆硬度，让前轮在弯道中更灵活接地' },
      frontSpring: { delta: -1, reason: '稍微降低前弹簧硬度，增加前轮载荷转移' },
      rearARB: { delta: 2, reason: '适当增加后防倾杆，让后轮分担更多侧向力' }
    },
    requiresParts: ['street_tires', 'sport_suspension']
  },
  {
    id: 'understeer_high',
    name: '高速弯转向不足',
    category: 'steering',
    description: '高速弯道车头外推',
    symptoms: '高速弯中车辆有明显的向外推的趋势，前轮打滑',
    fixes: {
      frontCamber: { delta: -1.0, reason: '大幅增加前轮负外倾角，高速弯中保持前轮接触面' },
      rearToe: { delta: 0.1, reason: '微调后轮前束为正值，增强直线稳定性以减少入弯干扰' },
      frontDownforce: { delta: 5, reason: '增加前部下压力，提高前轮在高速时的载荷' },
      rearDownforce: { delta: -2, reason: '适当减少后部下压力，平衡前后轴载荷分配' },
      frontARB: { delta: -2, reason: '减小前防倾杆让前轮更接地' },
      frontRideHeight: { delta: -1, reason: '降低前部车身高度，减少前部气流分离提升前下压力' }
    },
    requiresParts: ['sport_tires', 'sport_suspension', 'sport_aero']
  },
  {
    id: 'oversteer_entry',
    name: '入弯过度转向',
    category: 'steering',
    description: '入弯时车尾外甩',
    symptoms: '入弯瞬间车尾突然失去抓地力向外滑出',
    fixes: {
      rearTirePressure: { delta: -2, reason: '降低后胎压增加接地面积，提升后轮抓地力' },
      frontTirePressure: { delta: 1, reason: '适当提高前胎压，增加前轮响应速度' },
      rearCamber: { delta: 0.3, reason: '减小后轮负外倾角(趋于0)，提升直线/入弯时的后轮抓地' },
      rearARB: { delta: -3, reason: '减小后防倾杆，让后轮在入弯时保持更好的接地' },
      rearSpring: { delta: -1, reason: '适当降低后弹簧硬度，改善入弯载荷转移' },
      rearDamping: { delta: -0.5, reason: '减少后阻尼压缩速度，让后轮更平滑地承受载荷转移' }
    },
    requiresParts: ['street_tires', 'sport_suspension']
  },
  {
    id: 'oversteer_exit',
    name: '出弯过度转向',
    category: 'steering',
    description: '出弯加油时车尾甩出',
    symptoms: '出弯踩油门时车尾突然外甩，难以控制出弯线路',
    fixes: {
      diffAccel: { delta: 10, reason: '提高加速差速锁，增加内轮扭矩传递减少出弯打滑' },
      rearSpring: { delta: 2, reason: '增加后弹簧硬度，减少出弯加油时的后部下蹲' },
      rearARB: { delta: 2, reason: '增加后防倾杆，抑制出弯时后部侧倾引起的甩尾' },
      rearTirePressure: { delta: -1, reason: '降低后胎压增加出弯时后轮接地面积' },
      rearDamping: { delta: 1, reason: '增加后阻尼回弹速度，更快稳定出弯车身姿态' }
    },
    requiresParts: ['sport_tires', 'sport_suspension', 'sport_diff']
  },
  {
    id: 'oversteer_power',
    name: '大油门甩尾',
    category: 'steering',
    description: '直线或弯中重油门时后轮打滑甩尾',
    symptoms: '大油门输出超出后轮抓地极限，后轮空转甩尾',
    fixes: {
      diffAccel: { delta: 15, reason: '大幅提高加速差速锁，减少动力造成的内轮打滑' },
      rearTirePressure: { delta: -2, reason: '降低后胎压，最大化后轮接地面积' },
      rearSpring: { delta: 3, reason: '增加后弹簧硬度，减少大油门时后部下蹲带来的载荷变化' },
      rearDamping: { delta: 1.5, reason: '增加后回弹阻尼，更快抑制动力引起的车身摆动' },
      rearRideHeight: { delta: 1, reason: '适当抬高后部，改善加速时的重量转移分布' }
    },
    requiresParts: ['sport_tires', 'sport_suspension', 'sport_diff']
  },

  // ========== 刹车类 ==========
  {
    id: 'brake_dive',
    name: '刹车点头严重',
    category: 'braking',
    description: '重刹时车头明显下沉',
    symptoms: '重刹时车头大幅下沉，刹车后车身姿态恢复慢',
    fixes: {
      frontSpring: { delta: 5, reason: '增加前弹簧硬度，抵抗刹车时的前部下沉' },
      frontDamping: { delta: 2, reason: '增加前压缩阻尼，减缓前悬挂压缩速度' },
      rearDamping: { delta: 1, reason: '增加后回弹阻尼，防止后部过度抬起' },
      frontRideHeight: { delta: 1, reason: '稍微增加前部高度，提供更多悬挂行程应对刹车下蹲' },
      brakeBias: { delta: -2, reason: '略向前移刹车偏置，配合前弹簧减少点头幅度' }
    },
    requiresParts: ['sport_suspension']
  },
  {
    id: 'brake_lock',
    name: '刹车容易锁死',
    category: 'braking',
    description: '重刹时轮胎抱死打滑',
    symptoms: '重刹时轮胎突然抱死，方向盘失去控制力，刹车距离反而增加',
    fixes: {
      brakeBias: { delta: -3, reason: '将刹车偏置向前移，平衡前后刹车力度' },
      frontTirePressure: { delta: -1, reason: '降低前胎压增加接触面积，减少锁死概率' },
      rearTirePressure: { delta: -1, reason: '降低后胎压增加接触面积' },
      frontDamping: { delta: 1, reason: '增加前压缩阻尼，让刹车载荷转移更平滑' },
      rearSpring: { delta: 1, reason: '稍微增加后弹簧硬度，减少后部在刹车时过度抬起导致的载荷集中前轮' }
    },
    requiresParts: ['street_tires', 'sport_suspension']
  },
  {
    id: 'brake_fade',
    name: '刹车热衰减',
    category: 'braking',
    description: '连续刹车后制动力下降',
    symptoms: '连续弯道/下山路段刹车后，刹车踏板感觉变软，制动距离变长',
    fixes: {
      brakeBias: { delta: -2, reason: '前移刹车偏置，减少后轮刹车负担，降低整体热负荷' },
      frontDucts: { delta: 3, reason: '增加前刹车导管开度，提升刹车散热效率（建议升级刹车配件）' },
      rearDucts: { delta: 2, reason: '增加后刹车导管开度，提升散热' },
      tireCompound: { delta: 1, reason: '建议升级至更高等级轮胎，耐热性更好' }
    },
    requiresParts: ['sport_brakes'],
    upgradeAdvice: '建议升级刹车系统至跑车级或赛车级，高等级刹车耐热性显著提升'
  },

  // ========== 底盘类 ==========
  {
    id: 'body_roll_large',
    name: '弯道侧倾过大',
    category: 'chassis',
    description: '弯道中车身侧倾角度大',
    symptoms: '进弯和弯道中车身明显向一侧倾斜，影响驾驶信心和响应速度',
    fixes: {
      frontARB: { delta: 5, reason: '增加前防倾杆硬度，直接抵抗侧倾' },
      rearARB: { delta: 5, reason: '增加后防倾杆硬度，整体减少车身侧倾' },
      frontSpring: { delta: 3, reason: '增加前弹簧硬度，提供更强的侧倾支撑' },
      rearSpring: { delta: 3, reason: '增加后弹簧硬度，整体提升侧倾刚度' },
      frontDamping: { delta: 1, reason: '增加前阻尼，控制侧倾建立速度' },
      rearDamping: { delta: 1, reason: '增加后阻尼，整体抑制侧倾运动' },
      frontRideHeight: { delta: -2, reason: '降低车身高度，降低重心减少侧倾' },
      rearRideHeight: { delta: -2, reason: '降低后部车身高度' }
    },
    requiresParts: ['sport_suspension']
  },
  {
    id: 'body_roll_wobble',
    name: '过弯后车身摇摆',
    category: 'chassis',
    description: '过弯后车身左右摇摆不止',
    symptoms: '出弯后车身像船一样左右摇晃，影响出弯加速和直线稳定性',
    fixes: {
      frontARB: { delta: 3, reason: '增加前防倾杆，更快抑制车身左右摇摆' },
      rearARB: { delta: 3, reason: '增加后防倾杆，前后配合快速稳定车身' },
      frontDamping: { delta: 2, reason: '大幅增加前回弹阻尼，快速消耗摇摆能量' },
      rearDamping: { delta: 2, reason: '大幅增加后回弹阻尼' },
      frontSpring: { delta: 2, reason: '增加前弹簧硬度，提高车身固有频率远离摇摆频率' },
      rearSpring: { delta: 2, reason: '增加后弹簧硬度，整体提高刚性' }
    },
    requiresParts: ['sport_suspension']
  },
  {
    id: 'bump_stiff',
    name: '过坑洼太颠',
    category: 'chassis',
    description: '经过不平路面时弹跳厉害',
    symptoms: '过颠簸路面时车身剧烈弹跳，轮胎离地失去抓地力',
    fixes: {
      frontSpring: { delta: -4, reason: '降低前弹簧硬度，让悬挂更好吸收路面冲击' },
      rearSpring: { delta: -4, reason: '降低后弹簧硬度，整体提升舒适性' },
      frontDamping: { delta: -2, reason: '减小前阻尼，让悬挂压缩更顺畅' },
      rearDamping: { delta: -2, reason: '减小后阻尼，让悬挂更快响应路面变化' },
      frontRideHeight: { delta: 2, reason: '适当增加车身高度，提供更多悬挂行程' },
      rearRideHeight: { delta: 2, reason: '增加后部高度，增加悬挂行程余量' }
    },
    requiresParts: ['sport_suspension']
  },
  {
    id: 'bump_float',
    name: '悬挂太软',
    category: 'chassis',
    description: '悬挂行程过大，车身晃动',
    symptoms: '车身像船一样晃动，转向反应迟钝，过弯缺乏支撑',
    fixes: {
      frontSpring: { delta: 5, reason: '增加前弹簧硬度，减少悬挂行程和车身晃动' },
      rearSpring: { delta: 5, reason: '增加后弹簧硬度，整体提升支撑性' },
      frontARB: { delta: 3, reason: '增加前防倾杆，减少侧倾和晃动' },
      rearARB: { delta: 3, reason: '增加后防倾杆，配合前部抑制车身晃动' },
      frontDamping: { delta: 1, reason: '增加前阻尼，控制悬挂运动速度' },
      rearDamping: { delta: 1, reason: '增加后阻尼' }
    },
    requiresParts: ['sport_suspension']
  },

  // ========== 抓地力类 ==========
  {
    id: 'traction_low',
    name: '抓地力不足',
    category: 'traction',
    description: '加速/弯道中轮胎容易打滑',
    symptoms: '加速时轮胎空转，弯道中轮胎尖叫明显，整体抓地力感觉不够',
    fixes: {
      frontTirePressure: { delta: -2, reason: '降低前胎压，增加接地面积提升抓地力' },
      rearTirePressure: { delta: -2, reason: '降低后胎压，增加接地面积提升抓地力' },
      frontCamber: { delta: -0.3, reason: '微调前轮负外倾角，优化弯道接地面积' },
      rearCamber: { delta: -0.5, reason: '增加后轮负外倾角，改善后轮弯道抓地力' },
      frontARB: { delta: -2, reason: '减小前防倾杆，让前轮在颠簸路面保持接地' },
      rearARB: { delta: -2, reason: '减小后防倾杆，让后轮在弯道中保持更好的接地' }
    },
    requiresParts: ['street_tires'],
    upgradeAdvice: '建议升级轮胎至更高等级(运动/竞赛)，高等级轮胎提供显著更好的抓地力'
  },
  {
    id: 'traction_uneven',
    name: '左右抓地不均',
    category: 'traction',
    description: '左右轮温度或磨损差异大',
    symptoms: '车辆跑偏，某一侧轮胎磨损明显更快，左右温度差距大',
    fixes: {
      frontToe: { delta: -0.1, reason: '微调前束角，确保左右轮负载均匀' },
      rearToe: { delta: 0.1, reason: '微调后束角，辅助校正左右不平衡' },
      frontCamber: { delta: -0.2, reason: '微调前外倾角，校正左右不平衡' },
      rearCamber: { delta: -0.2, reason: '微调后外倾角，确保左右后轮负载一致' },
      frontSpring: { delta: 1, reason: '微调弹簧确保左右平衡（检查左右是否设置一致）' },
      rearSpring: { delta: 1, reason: '微调后弹簧确保左右一致' }
    },
    requiresParts: ['street_tires'],
    upgradeAdvice: '建议检查悬挂几何是否对称，左右参数设置应保持一致'
  },

  // ========== 稳定性类 ==========
  {
    id: 'unstable_straight',
    name: '直线不稳',
    category: 'stability',
    description: '高速直行时车身不稳发飘',
    symptoms: '高速直行时感觉车身发飘，微小的路面变化就会引起车身晃动',
    fixes: {
      frontToe: { delta: -0.1, reason: '微调前束为负值(前束内八字)，增强直线稳定性' },
      rearToe: { delta: 0.1, reason: '微调后束为正值(后展外八字)，辅助稳定后轴' },
      rearDownforce: { delta: 8, reason: '增加后部下压力，压住车尾提升高速稳定性' },
      frontDownforce: { delta: 3, reason: '适当增加前部下压力，保持前后平衡' },
      rearARB: { delta: 2, reason: '增加后防倾杆，抑制高速时后部微摆' },
      rearDamping: { delta: 1, reason: '增加后阻尼，更快抑制高速时的微小振动' },
      rearSpring: { delta: 2, reason: '增加后弹簧硬度，提升后部高速支撑' }
    },
    requiresParts: ['street_tires', 'sport_suspension', 'sport_aero']
  },
  {
    id: 'snap_oversteer',
    name: '突然甩尾',
    category: 'stability',
    description: '不经意间突然大幅甩尾',
    symptoms: '正常行驶中突然出现不可预料的剧烈甩尾，难以提前预防',
    fixes: {
      diffDecel: { delta: 15, reason: '大幅提高减速差速锁，防止收油/刹车时内轮突然锁止导致甩尾' },
      diffAccel: { delta: 10, reason: '提高加速差速锁，防止动力突变引起后轮打滑' },
      rearARB: { delta: -3, reason: '减小后防倾杆，让后轮在突变工况下保持更渐进的滑动特性' },
      rearDamping: { delta: -1, reason: '减小后回弹阻尼，让后悬挂在突变时更柔和地响应' },
      rearSpring: { delta: -2, reason: '降低后弹簧硬度，增加后轮在突变时的容错空间' },
      rearTirePressure: { delta: -2, reason: '降低后胎压增加接地面积，提供更多抓地裕量' }
    },
    requiresParts: ['sport_tires', 'sport_suspension', 'sport_diff']
  },

  // ========== 加速类 ==========
  {
    id: 'launch_wheel_spin',
    name: '起步打滑',
    category: 'acceleration',
    description: '起步时前轮或后轮空转',
    symptoms: '起步瞬间轮胎空转，动力无法有效传递到地面，起步加速慢',
    fixes: {
      diffAccel: { delta: 20, reason: '大幅提高加速差速锁，将扭矩更均匀地分配到左右轮' },
      frontTirePressure: { delta: -2, reason: '降低前胎压增加起步接地面积（适用于前驱/四驱）' },
      rearTirePressure: { delta: -2, reason: '降低后胎压增加起步接地面积（适用于后驱/四驱）' },
      rearSpring: { delta: 3, reason: '增加后弹簧硬度，减少起步时后部下蹲导致的载荷过度集中' },
      rearDamping: { delta: 1, reason: '增加后压缩阻尼，控制起步时的悬挂压缩速度' }
    },
    requiresParts: ['street_tires', 'sport_suspension', 'sport_diff']
  },
  {
    id: 'accel_slow',
    name: '加速缓慢',
    category: 'acceleration',
    description: '油门踩到底加速慢',
    symptoms: '全油门加速时感觉动力输出不足，加速G力低',
    fixes: {
      finalDrive: { delta: -0.3, reason: '缩短最终传动比，提升每个档位的加速G力（牺牲尾速）' },
      rearRideHeight: { delta: -1, reason: '降低后部高度，减少空气阻力提升加速效率' },
      frontRideHeight: { delta: -1, reason: '降低前部高度，减少迎风面积' },
      tireCompound: { delta: 1, reason: '更高等级轮胎提供更好的加速抓地力' }
    },
    requiresParts: ['sport_trans'],
    upgradeAdvice: '如果已优化齿比仍加速慢，建议升级引擎/涡轮增加动力输出'
  },

  // ========== 速度类 ==========
  {
    id: 'top_speed_low',
    name: '尾速不够',
    category: 'speed',
    description: '直道尾速低于预期',
    symptoms: '长直道尾段速度不够高，被对手在直道超越',
    fixes: {
      finalDrive: { delta: 0.3, reason: '加长最终传动比，降低各档转速让引擎在更高速域发力' },
      rearDownforce: { delta: -10, reason: '减少后部下压力，降低高速空气阻力' },
      frontDownforce: { delta: -5, reason: '减少前部下压力，降低整体阻力' },
      frontRideHeight: { delta: 2, reason: '抬高前部，减少前部气流阻塞降低风阻' },
      rearRideHeight: { delta: 1, reason: '适当抬高后部' }
    },
    requiresParts: ['sport_trans', 'sport_aero']
  },

  // ========== 变速类 ==========
  {
    id: 'gear_too_long',
    name: '档位过长',
    category: 'gearbox',
    description: '某档位加速区间太短就到红线',
    fixes: {
      gearAdjustment: { delta: 'shorten', reason: '该档位齿比过长(数值太小)，需要缩短齿比(增大数值)让加速区间更长' },
      finalDrive: { delta: -0.2, reason: '配合缩短最终传动比，让每个档位在更合适的转速区间发力' }
    },
    requiresParts: ['sport_trans'],
    upgradeAdvice: '需要跑车级或更高等级变速箱才能自定义齿比'
  },
  {
    id: 'gear_too_short',
    name: '档位过短',
    category: 'gearbox',
    description: '某档位到达红线时速度不够',
    fixes: {
      gearAdjustment: { delta: 'lengthen', reason: '该档位齿比过短(数值太大)，需要加长齿比(减小数值)让该档位能拉到更高速度' },
      finalDrive: { delta: 0.2, reason: '配合加长最终传动比，让每个档位覆盖更宽的速度范围' }
    },
    requiresParts: ['sport_trans'],
    upgradeAdvice: '需要跑车级或更高等级变速箱才能自定义齿比'
  },

  // ========== 空力类 ==========
  {
    id: 'nose_heavy',
    name: '车头过重',
    category: 'aero',
    description: '入弯迟钝，车头感觉重',
    symptoms: '高速时车头感觉重，入弯反应慢，直线刹车后前部恢复慢',
    fixes: {
      rearDownforce: { delta: 5, reason: '增加后部下压力，把高速时的载荷更多压在后轴上' },
      frontDownforce: { delta: -3, reason: '适当减少前部下压力，减轻高速时前轴载荷' },
      rearRideHeight: { delta: -1, reason: '降低后部高度，增加后下压力效果' },
      frontSpring: { delta: -2, reason: '适当降低前弹簧硬度，让前部更灵活响应转向输入' },
      frontARB: { delta: -2, reason: '减小前防倾杆，增加前轮接地灵活性' }
    },
    requiresParts: ['sport_suspension', 'sport_aero']
  },
  {
    id: 'loose_rear',
    name: '车尾轻盈',
    category: 'aero',
    description: '高速时车尾感觉轻飘不稳固',
    symptoms: '高速直行或弯道中感觉车尾不稳固，容易甩尾或不安定',
    fixes: {
      rearDownforce: { delta: 10, reason: '大幅增加后部下压力，把车尾压向地面' },
      rearARB: { delta: 3, reason: '增加后防倾杆，抑制高速时后部摇摆' },
      rearSpring: { delta: 2, reason: '增加后弹簧硬度，提升后部高速支撑性' },
      rearDamping: { delta: 1, reason: '增加后阻尼，快速稳定后部运动' },
      diffDecel: { delta: 5, reason: '提高减速差速锁，防止高速收油时后轮突然失去稳定性' }
    },
    requiresParts: ['sport_suspension', 'sport_aero', 'sport_diff']
  },

  // ========== 轮胎类 ==========
  {
    id: 'tire_wear_fast',
    name: '轮胎磨损过快',
    category: 'tires',
    description: '轮胎温度上升过快或磨损过快',
    symptoms: '比赛中段轮胎温度就达到过热区间，抓地力明显下降',
    fixes: {
      frontTirePressure: { delta: 2, reason: '提高前胎压，减少胎面弯曲变形产生的热量' },
      rearTirePressure: { delta: 2, reason: '提高后胎压，减少胎面弯曲变形产生的热量' },
      frontCamber: { delta: 0.3, reason: '减小前轮负外倾角(趋于0)，减少弯道中胎面内侧过度磨损' },
      rearCamber: { delta: 0.3, reason: '减小后轮负外倾角，减少后轮磨损' },
      frontARB: { delta: -2, reason: '减小前防倾杆，让轮胎在弯道中更均匀接地，减少局部磨损' },
      rearARB: { delta: -2, reason: '减小后防倾杆，均匀分布后轮接地压力' },
      tireCompound: { delta: -1, reason: '使用更耐久的轮胎配方（牺牲少量抓地力换取耐久性）' }
    },
    requiresParts: ['street_tires'],
    upgradeAdvice: '如果需要兼顾抓地力和耐久，赛车级轮胎是最平衡的选择'
  },
  {
    id: 'tire_wear_uneven',
    name: '轮胎磨损不均',
    category: 'tires',
    description: '内侧或外侧磨损明显多于另一侧',
    symptoms: '轮胎一侧磨损严重，另一侧几乎没有磨损，胎面呈锥形',
    fixes: {
      frontCamber: { delta: 0.5, reason: '减小前轮负外倾角，减少胎面内侧过度磨损（如果内侧磨损大）' },
      rearCamber: { delta: 0.5, reason: '减小后轮负外倾角，减少后轮内侧磨损' },
      frontToe: { delta: 0.1, reason: '微调前束角校正左右磨损不均（外八字磨损内侧则减小）' },
      rearToe: { delta: 0.1, reason: '微调后束角校正磨损方向' }
    },
    requiresParts: ['street_tires'],
    upgradeAdvice: '磨损不均通常是外倾角或束角设置不当导致，建议逐项微调并观察'
  }
]

// ============================================================
// 问题分类索引 (按分类快速查找问题)
// ============================================================
function getProblemsByCategory(categoryId) {
  return DRIVING_PROBLEMS.filter(p => p.category === categoryId)
}

// ============================================================
// 根据问题ID获取调校建议
// ============================================================
function getProblemById(problemId) {
  return DRIVING_PROBLEMS.find(p => p.id === problemId) || null
}

// ============================================================
// 检查配件是否满足调校建议的最低要求
// ============================================================
function checkPartRequirements(problemId, currentParts) {
  const problem = getProblemById(problemId)
  if (!problem) return { met: true, missing: [] }

  const missing = []
  for (const req of problem.requiresParts) {
    // 检查配件等级是否达到要求
    const [cat, tier] = req.split('_') // e.g. 'sport_tires' -> cat='sport', partType='tires'
    const partType = req.replace(`${cat}_`, '')
    const minTierOrder = { street: 1, sport: 2, race: 3, extreme: 4 }
    const currentTierOrder = minTierOrder[currentParts?.[partType]?.tier] || 0
    const requiredTierOrder = minTierOrder[cat] || 0

    if (currentTierOrder < requiredTierOrder) {
      missing.push({
        partType,
        requiredTier: cat,
        currentTier: currentParts?.[partType]?.tier || 'stock'
      })
    }
  }

  return {
    met: missing.length === 0,
    missing,
    upgradeAdvice: problem.upgradeAdvice || null
  }
}

// ============================================================
// 将问题建议应用到当前调校 (生成新调校值)
// ============================================================
function applyProblemFix(problemId, currentTune, paramConstraints) {
  const problem = getProblemById(problemId)
  if (!problem || !currentTune) return null

  const newTune = JSON.parse(JSON.stringify(currentTune))
  const appliedFixes = {}
  const skippedFixes = []

  // 参数名到currentTune路径的映射
  const paramPathMap = {
    frontTirePressure: 'tires.frontPressure',
    rearTirePressure: 'tires.rearPressure',
    frontCamber: 'tires.frontCamber',
    rearCamber: 'tires.rearCamber',
    frontToe: 'tires.frontToe',
    rearToe: 'tires.rearToe',
    frontSpring: 'suspension.frontSpring',
    rearSpring: 'suspension.rearSpring',
    frontDamping: 'suspension.frontDamping',
    rearDamping: 'suspension.rearDamping',
    frontARB: 'suspension.frontARB',
    rearARB: 'suspension.rearARB',
    frontRideHeight: 'suspension.frontRideHeight',
    rearRideHeight: 'suspension.rearRideHeight',
    diffAccel: 'drivetrain.diffAccel',
    diffDecel: 'drivetrain.diffDecel',
    diffCenter: 'drivetrain.diffCenter',
    finalDrive: 'drivetrain.finalDrive',
    frontDownforce: 'aero.frontDownforce',
    rearDownforce: 'aero.rearDownforce'
  }

  for (const [param, fix] of Object.entries(problem.fixes)) {
    const path = paramPathMap[param]
    if (!path) {
      skippedFixes.push({ param, reason: '未知参数' })
      continue
    }

    // 检查参数是否锁定
    const constraint = paramConstraints?.[path]
    if (constraint?.locked) {
      skippedFixes.push({ param, reason: '参数被锁定，需要升级配件' })
      continue
    }

    // 获取当前值
    const pathParts = path.split('.')
    let current = newTune
    for (const part of pathParts) {
      if (current[part] === undefined) current[part] = {}
      if (part === pathParts[pathParts.length - 1]) break
      current = current[part]
    }
    const currentValue = current[pathParts[pathParts.length - 1]]
    if (currentValue === undefined) {
      skippedFixes.push({ param, reason: '无当前值' })
      continue
    }

    // 计算新值
    let newValue
    if (typeof fix.delta === 'string') {
      // 字符串类型的调整(如齿比加长/缩短)不直接计算数值
      appliedFixes[param] = { ...fix, currentValue, note: '需要手动调整' }
      continue
    }

    newValue = currentValue + fix.delta

    // 约束范围
    if (constraint) {
      newValue = Math.max(constraint.min, Math.min(constraint.max, newValue))
    }

    // 精度处理
    if (Number.isInteger(currentValue)) {
      newValue = Math.round(newValue)
    } else {
      newValue = Math.round(newValue * 10) / 10
    }

    current[pathParts[pathParts.length - 1]] = newValue
    appliedFixes[param] = {
      delta: fix.delta,
      reason: fix.reason,
      oldValue: currentValue,
      newValue
    }
  }

  return {
    newTune,
    appliedFixes,
    skippedFixes
  }
}

// 引入声明式诊断规则配置
import diagnoseRules from './diagnoseRules.json'

// 提取遥测帧的时序物理指标
function calculateMetrics(frames) {
  const metrics = {
    bottomOutRatio: 0,
    understeerRatio: 0,
    avgPitch: 0,
    maxRollAngle: 0,
    slipRatio: 0,
    lockRatio: 0,
    yawStdDev: 0,
    maxYaw: 0,
    snapCount: 0,
    spinRatio: 0,
    wobbleCount: 0,
    overheatRatio: 0,
    overallMaxTemp: 0,
    avgFL: 0, avgFR: 0, avgRL: 0, avgRR: 0
  }

  // 1. 悬挂触底
  const suspensionFrames = frames.filter(f => f.suspension)
  if (suspensionFrames.length > 0) {
    const bottomOuts = suspensionFrames.filter(
      f => f.suspension.frontLeft < 0.15 || f.suspension.frontRight < 0.15 || f.suspension.rearLeft < 0.15 || f.suspension.rearRight < 0.15
    ).length
    metrics.bottomOutRatio = bottomOuts / suspensionFrames.length
  }

  // 2. 转向不足
  const corneringFrames = frames.filter(
    f => f.lateralG && Math.abs(f.lateralG) > 0.3 && f.steerAngle !== undefined
  )
  if (corneringFrames.length > 10) {
    const understeerEvents = corneringFrames.filter(f => {
      const steerInput = Math.abs(f.steerAngle)
      const expectedG = steerInput * 0.015
      return steerInput > 5 && Math.abs(f.lateralG) < expectedG * 0.6
    })
    metrics.understeerRatio = understeerEvents.length / corneringFrames.length
  }

  // 3. 刹车点头
  const brakingFrames = frames.filter(f => f.brake > 0.5 && f.suspension)
  if (brakingFrames.length > 5) {
    const totalPitch = brakingFrames.reduce((sum, f) => {
      const frontAvg = (f.suspension.frontLeft + f.suspension.frontRight) / 2
      const rearAvg = (f.suspension.rearLeft + f.suspension.rearRight) / 2
      return sum + (rearAvg - frontAvg)
    }, 0)
    metrics.avgPitch = totalPitch / brakingFrames.length
  }

  // 5. 侧倾角度
  const rollFrames = frames.filter(f => f.rollAngle !== undefined && f.lateralG && Math.abs(f.lateralG) > 0.2)
  if (rollFrames.length > 10) {
    metrics.maxRollAngle = Math.max(...rollFrames.map(f => Math.abs(f.rollAngle)))
  }

  // 6. 出弯打滑
  const accelFrames = frames.filter(f => f.throttle > 0.7 && f.yawRate !== undefined)
  if (accelFrames.length > 10) {
    const slipEvents = accelFrames.filter(f => Math.abs(f.yawRate) > 15 && f.lateralG !== undefined && Math.abs(f.lateralG) < 0.5)
    metrics.slipRatio = slipEvents.length / accelFrames.length
  }

  // 7. 刹车锁死
  const hardBrakeFrames = frames.filter(f => f.brake > 0.8)
  if (hardBrakeFrames.length > 5) {
    let lockEvents = 0
    for (let i = 1; i < hardBrakeFrames.length; i++) {
      const prev = hardBrakeFrames[i - 1]
      const curr = hardBrakeFrames[i]
      const speedDiff = Math.abs(prev.speed - curr.speed)
      const dt = (curr.timestamp - prev.timestamp) / 1000
      if (dt > 0) {
        const decel = speedDiff / dt / 3.6
        if (decel > 15 && Math.abs(curr.longitudinalG || 0) > 1.5) {
          lockEvents++
        }
      }
    }
    metrics.lockRatio = lockEvents / hardBrakeFrames.length
  }

  // 8. 直线不稳定
  const highSpeedFrames = frames.filter(f => f.speed > 200 && f.yawRate !== undefined)
  if (highSpeedFrames.length > 10) {
    const yawRates = highSpeedFrames.map(f => Math.abs(f.yawRate))
    const avgYaw = yawRates.reduce((a, b) => a + b, 0) / yawRates.length
    metrics.maxYaw = Math.max(...yawRates)
    const variance = yawRates.reduce((sum, v) => sum + Math.pow(v - avgYaw, 2), 0) / yawRates.length
    metrics.yawStdDev = Math.sqrt(variance)
  }

  // 9. 突然甩尾
  if (frames.length > 20) {
    let snapCount = 0
    for (let i = 2; i < frames.length; i++) {
      if (frames[i].yawRate === undefined) continue
      const prevRate = Math.abs(frames[i - 2].yawRate || 0)
      const currRate = Math.abs(frames[i].yawRate || 0)
      if (currRate - prevRate > 20 && currRate > 25) {
        snapCount++
      }
    }
    metrics.snapCount = snapCount
  }

  // 10. 起步打滑
  const launchFrames = frames.filter(f => f.speed < 60 && f.throttle > 0.9 && f.speed !== undefined)
  if (launchFrames.length > 10) {
    let slowAccelCount = 0
    for (let i = 1; i < launchFrames.length; i++) {
      const prev = launchFrames[i - 1]
      const curr = launchFrames[i]
      const dt = (curr.timestamp - prev.timestamp) / 1000
      if (dt > 0 && dt < 0.5) {
        const accel = (curr.speed - prev.speed) / dt
        if (accel < 30) {
          slowAccelCount++
        }
      }
    }
    metrics.spinRatio = slowAccelCount / launchFrames.length
  }

  // 11. 过弯后摇摆
  if (frames.length > 30) {
    let wobbleCount = 0
    for (let i = 4; i < frames.length; i++) {
      if (frames[i].yawRate === undefined) continue
      const r1 = frames[i - 3].yawRate || 0
      const r2 = frames[i - 1].yawRate || 0
      const r3 = frames[i].yawRate || 0
      if (Math.abs(r2) > 2 && Math.abs(r3) > 2) {
        if ((r1 > 0 && r2 < 0 && r3 > 0) || (r1 < 0 && r2 > 0 && r3 < 0)) {
          wobbleCount++
        }
      }
    }
    metrics.wobbleCount = wobbleCount
  }

  // 12. 轮胎温度与过热度
  const tireTempFrames = frames.filter(f => f.tireTemp)
  if (tireTempFrames.length > 30) {
    const warmFrames = tireTempFrames.slice(Math.floor(tireTempFrames.length * 0.3))
    let overheatCount = 0
    let tempFL = 0, tempFR = 0, tempRL = 0, tempRR = 0

    for (const f of warmFrames) {
      tempFL += f.tireTemp.frontLeft
      tempFR += f.tireTemp.frontRight
      tempRL += f.tireTemp.rearLeft
      tempRR += f.tireTemp.rearRight
      if (f.tireTemp.frontLeft > 90) overheatCount++
      if (f.tireTemp.frontRight > 90) overheatCount++
      if (f.tireTemp.rearLeft > 90) overheatCount++
      if (f.tireTemp.rearRight > 90) overheatCount++
    }

    const totalTirePoints = warmFrames.length * 4
    metrics.overheatRatio = overheatCount / totalTirePoints
    metrics.avgFL = tempFL / warmFrames.length
    metrics.avgFR = tempFR / warmFrames.length
    metrics.avgRL = tempRL / warmFrames.length
    metrics.avgRR = tempRR / warmFrames.length
    metrics.overallMaxTemp = Math.max(
      ...warmFrames.flatMap(f => [
        f.tireTemp.frontLeft, f.tireTemp.frontRight,
        f.tireTemp.rearLeft, f.tireTemp.rearRight
      ])
    )
  }

  return metrics
}

// 表达式安全计算
function evaluateCondition(condition, metrics) {
  try {
    const keys = Object.keys(metrics)
    const fn = new Function(...keys, `return (${condition});`)
    const values = keys.map(k => metrics[k])
    return fn(...values)
  } catch (e) {
    return false
  }
}

// 格式化文本中的插值
function formatDetails(template, metrics) {
  if (!template) return ''
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = metrics[key]
    if (val === undefined) return ''
    if (key.endsWith('Ratio')) return (val * 100).toFixed(1)
    if (key.endsWith('Pct')) return (metrics[key.replace('Pct', 'Ratio')] * 100).toFixed(1)
    return typeof val === 'number' ? val.toFixed(1).replace(/\.0$/, '') : val
  })
}

// ============================================================
// 遥测数据诊断 → 调校建议
// ============================================================
export function diagnoseFromTelemetry(frames, currentTune = {}) {
  if (!frames || frames.length === 0) return []

  const metrics = calculateMetrics(frames)
  const suggestions = []

  // 1. 运行 JSON 配置的 8 大通用规则
  for (const group of diagnoseRules) {
    let matchedRule = null
    for (const rule of group.rules) {
      if (evaluateCondition(rule.condition, metrics)) {
        matchedRule = rule
        break
      }
    }

    if (matchedRule) {
      const formattedFix = {}
      for (const [param, fixVal] of Object.entries(matchedRule.fix)) {
        formattedFix[param] = {
          delta: fixVal.delta,
          reason: formatDetails(fixVal.reason, metrics)
        }
      }

      suggestions.push({
        problem: group.name,
        severity: matchedRule.severity,
        details: formatDetails(matchedRule.details, metrics),
        fix: formattedFix
      })
    }
  }

  // 2. 轮胎温度不均检测（多路分支特例保留）
  const tireTempFrames = frames.filter(f => f.tireTemp)
  if (tireTempFrames.length > 20) {
    const warmFrames = tireTempFrames.slice(Math.floor(tireTempFrames.length * 0.5))
    const avgTemps = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 }
    for (const f of warmFrames) {
      avgTemps.frontLeft += f.tireTemp.frontLeft
      avgTemps.frontRight += f.tireTemp.frontRight
      avgTemps.rearLeft += f.tireTemp.rearLeft
      avgTemps.rearRight += f.tireTemp.rearRight
    }
    const n = warmFrames.length
    for (const k of Object.keys(avgTemps)) avgTemps[k] /= n

    const maxTempDiff = Math.max(
      Math.abs(avgTemps.frontLeft - avgTemps.frontRight),
      Math.abs(avgTemps.rearLeft - avgTemps.rearRight),
      Math.abs(avgTemps.frontLeft - avgTemps.rearLeft),
      Math.abs(avgTemps.frontRight - avgTemps.rearRight)
    )

    if (maxTempDiff > 8) {
      const isLeftRight = Math.abs(avgTemps.frontLeft - avgTemps.frontRight) > Math.abs(avgTemps.frontLeft - avgTemps.rearLeft)
      const isFrontRear = !isLeftRight && Math.abs(avgTemps.frontLeft - avgTemps.rearLeft) > 5

      let tempIssueDetail = ''
      if (isLeftRight) {
        tempIssueDetail = `左右温差 ${maxTempDiff.toFixed(1)}°C，可能存在外倾角或束角不对称`
      } else if (isFrontRear) {
        tempIssueDetail = `前后温差 ${maxTempDiff.toFixed(1)}°C，可能需要调整前后刹车偏置或弹簧平衡`
      } else {
        tempIssueDetail = `轮胎温差 ${maxTempDiff.toFixed(1)}°C，温差偏大影响抓地力均匀性`
      }

      suggestions.push({
        problem: '轮胎温度不均',
        severity: maxTempDiff > 15 ? 'high' : 'medium',
        details: tempIssueDetail,
        fix: isLeftRight ? {
          frontCamber: { delta: avgTemps.frontLeft > avgTemps.frontRight ? 0.3 : -0.3, reason: '校正前轮外倾角让左右温度均匀' },
          rearCamber: { delta: avgTemps.rearLeft > avgTemps.rearRight ? 0.3 : -0.3, reason: '校正后轮外倾角让左右温度均匀' },
          frontToe: { delta: -0.05, reason: '微调前束角辅助校正左右不平衡' },
          rearToe: { delta: 0.05, reason: '微调后束角辅助校正' }
        } : {
          brakeBias: { delta: avgTemps.frontLeft > avgTemps.rearLeft ? -2 : 2, reason: '调整刹车偏置平衡前后轮温度' },
          frontSpring: { delta: avgTemps.frontLeft > avgTemps.rearLeft ? 2 : -1, reason: '调整前弹簧平衡前后载荷分配' },
          rearSpring: { delta: avgTemps.rearLeft > avgTemps.frontLeft ? 2 : -1, reason: '调整后弹簧平衡前后载荷' }
        }
      })
    }
  }

  // 按严重程度排序
  suggestions.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 }
    return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2)
  })

  return suggestions
}

// ============================================================
// 批量应用遥测诊断建议到当前调校
// ============================================================
function applyTelemetrySuggestions(suggestions, currentTune, paramConstraints) {
  if (!suggestions || suggestions.length === 0 || !currentTune) return { newTune: currentTune, summary: [] }

  const newTune = JSON.parse(JSON.stringify(currentTune))
  const summary = []

  // 参数名到currentTune路径的映射
  const paramPathMap = {
    frontTirePressure: 'tires.frontPressure',
    rearTirePressure: 'tires.rearPressure',
    frontCamber: 'tires.frontCamber',
    rearCamber: 'tires.rearCamber',
    frontToe: 'tires.frontToe',
    rearToe: 'tires.rearToe',
    frontSpring: 'suspension.frontSpring',
    rearSpring: 'suspension.rearSpring',
    frontDamping: 'suspension.frontDamping',
    rearDamping: 'suspension.rearDamping',
    frontARB: 'suspension.frontARB',
    rearARB: 'suspension.rearARB',
    frontRideHeight: 'suspension.frontRideHeight',
    rearRideHeight: 'suspension.rearRideHeight',
    diffAccel: 'drivetrain.diffAccel',
    diffDecel: 'drivetrain.diffDecel',
    diffCenter: 'drivetrain.diffCenter',
    finalDrive: 'drivetrain.finalDrive',
    frontDownforce: 'aero.frontDownforce',
    rearDownforce: 'aero.rearDownforce',
    brakeBias: 'brakes.bias'
  }

  // 累积每个参数的总调整量
  const totalDeltas = {}

  for (const suggestion of suggestions) {
    if (!suggestion.fix) continue

    for (const [param, fix] of Object.entries(suggestion.fix)) {
      if (typeof fix.delta === 'string') continue // 跳过字符串类型的调整

      if (!totalDeltas[param]) {
        totalDeltas[param] = 0
      }
      totalDeltas[param] += fix.delta
    }
  }

  // 应用累积的调整量
  for (const [param, totalDelta] of Object.entries(totalDeltas)) {
    const path = paramPathMap[param]
    if (!path) continue

    const constraint = paramConstraints?.[path]
    if (constraint?.locked) continue

    const pathParts = path.split('.')
    let current = newTune
    for (const part of pathParts) {
      if (current[part] === undefined) current[part] = {}
      if (part === pathParts[pathParts.length - 1]) break
      current = current[part]
    }

    const currentValue = current[pathParts[pathParts.length - 1]]
    if (currentValue === undefined) continue

    let newValue = currentValue + totalDelta

    if (constraint) {
      newValue = Math.max(constraint.min, Math.min(constraint.max, newValue))
    }

    if (Number.isInteger(currentValue)) {
      newValue = Math.round(newValue)
    } else {
      newValue = Math.round(newValue * 10) / 10
    }

    current[pathParts[pathParts.length - 1]] = newValue
    summary.push({
      param,
      path,
      oldValue: currentValue,
      newValue,
      totalDelta,
      applied: newValue !== currentValue
    })
  }

  return { newTune, summary }
}

// ============================================================
// 问题严重程度配置
// ============================================================
const SEVERITY_CONFIG = {
  high: {
    label: '严重',
    color: '#f85149',
    bgColor: 'rgba(248, 81, 73, 0.1)',
    description: '严重影响驾驶表现，建议立即调整'
  },
  medium: {
    label: '中等',
    color: '#d29922',
    bgColor: 'rgba(210, 153, 34, 0.1)',
    description: '影响驾驶体验，建议尽快调整'
  },
  low: {
    label: '轻微',
    color: '#3fb950',
    bgColor: 'rgba(63, 185, 80, 0.1)',
    description: '轻微影响，可在后续调校中优化'
  }
}
