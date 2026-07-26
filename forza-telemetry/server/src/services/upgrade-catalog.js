import { applyPiPredictions, predictBuildPi } from './pi-model.js';

const option = (id, label, piEstimate = 0, extra = {}) => ({ id, label, piEstimate, ...extra });
const TIER_INDEX = { stock: 0, street: 1, sport: 2, race: 3, extreme: 4 };
const levels = (street = 2, sport = 4, race = 7) => [
  option('stock', '原厂', 0), option('street', '街车级', street), option('sport', '跑车级', sport), option('race', '赛车级', race)
];
// 无车型实测资料时使用的 FH5 常见胎宽枚举。它只用于手动选择，不进入
// AI 的 PI 搜索；每个车型最终可用项仍应以游戏内改装菜单为准。
const GENERIC_TIRE_WIDTHS_MM = Array.from({ length: 27 }, (_, index) => 145 + index * 10);
const estimatedStockTireWidth = basePi => {
  const pi = Number(basePi) || 600;
  if (pi >= 901) return 275;
  if (pi >= 801) return 245;
  if (pi >= 701) return 225;
  if (pi >= 601) return 205;
  return 185;
};
const estimateTireWidthPi = (profile, widthMm, knownWidths = [], position = 'front') => {
  // 有该车选项列表时，以最小宽度作为可用升级序列的参考；没有时按原厂
  // PI 所在级别推定常见原厂胎宽。每 10 mm 约 1 PI，最小非原厂成本为 1 PI。
  const reference = Number(profile.stockTireWidths?.[position])
    || (knownWidths.length ? Math.min(...knownWidths.map(Number).filter(Number.isFinite)) : 0)
    || estimatedStockTireWidth(profile.basePi);
  return Math.max(1, Math.round(Math.abs(Number(widthMm) - reference) / 10));
};

const COMMON_SLOTS = [
  {
    id: 'drivetrain_swap',
    label: '驱动置换',
    group: '置换',
    // FH5 的绝大多数可调校车辆都支持驱动置换。缺少车型证据时应作为
    // 通用手动选项展示，而不是误判为“没有”；明确验证不存在时仍由
    // commonSlotOverrides.drivetrain_swap.availability 隐藏。
    options: [
      option('stock', '保持原厂驱动', 0),
      option('fwd', '置换为前轮驱动', -15, { driveType: 'fwd' }),
      option('rwd', '置换为后轮驱动', -15, { driveType: 'rwd' }),
      option('awd', '置换为四轮驱动', 30, { driveType: 'awd' })
    ]
  },
  {
    id: 'aspiration_swap',
    label: '增压方式置换',
    group: '置换',
    // 车型档案存在时以专属候选覆盖；缺少档案时显示通用手动候选。
    options: [
      option('stock', '保持原厂增压方式', 0),
      option('aspiration_na', '自然吸气', 0),
      option('aspiration_t', '涡轮增压', 20),
      option('aspiration_tt', '双涡轮增压', 20),
      option('aspiration_pds', '机械增压', 20),
      option('aspiration_cs', '离心式机械增压', 20)
    ]
  },
  {
    id: 'widebody',
    label: '宽体与车身套件',
    group: '置换',
    // 专属资料缺失时保留通用候选，并明确要求以游戏内菜单为准。
    options: [
      option('stock', '保持原厂车身', 0),
      option('listed_widebody', '宽体或车身套件（请对照游戏）', 8)
    ]
  },
  { id: 'engine_intake', label: '进气系统', group: '发动机', options: levels(1, 2, 4) },
  { id: 'engine_intake_manifold', label: '进气歧管与节气门', group: '发动机', options: levels(1, 3, 5) },
  { id: 'engine_fuel_system', label: '燃油系统', group: '发动机', options: levels(1, 3, 5) },
  { id: 'engine_ignition', label: '点火系统', group: '发动机', options: levels(1, 2, 3) },
  { id: 'exhaust', label: '排气系统', group: '发动机', options: levels(1, 3, 5) },
  { id: 'engine_camshaft', label: '凸轮轴', group: '发动机', options: levels(2, 5, 9) },
  { id: 'engine_valves', label: '气门', group: '发动机', options: levels(1, 3, 5) },
  { id: 'engine_displacement', label: '排量', group: '发动机', options: levels(2, 5, 8) },
  { id: 'engine_pistons', label: '活塞与压缩比', group: '发动机', options: levels(2, 4, 7) },
  { id: 'engine_oil_cooling', label: '机油与冷却', group: '发动机', options: levels(0, 1, 2) },
  { id: 'engine_flywheel', label: '飞轮', group: '发动机', options: levels(0, 1, 2) },
  { id: 'brakes', label: '刹车', group: '平台与操控', options: [option('stock', '原厂'), option('street', '街车级不可调', 1), option('sport', '跑车级不可调', 2), option('race', '赛车级可调', 4, { adjustable: true })] },
  { id: 'suspension', label: '悬挂', group: '平台与操控', options: [option('stock', '原厂'), option('street', '街车悬挂不可调', 2), option('sport', '跑车悬挂不可调', 4), option('race', '赛车悬挂可调', 6, { adjustable: true }), option('rally', '拉力悬挂可调', 5, { adjustable: true }), option('drift', '漂移悬挂可调', 5, { adjustable: true }), option('offroad', '越野悬挂可调', 5, { adjustable: true })] },
  { id: 'anti_roll_bar_front', label: '前防倾杆', group: '平台与操控', options: [option('stock', '原厂'), option('race', '赛车级可调', 1, { adjustable: true })] },
  { id: 'anti_roll_bar_rear', label: '后防倾杆', group: '平台与操控', options: [option('stock', '原厂'), option('race', '赛车级可调', 1, { adjustable: true })] },
  { id: 'roll_cage', label: '防滚架', group: '平台与操控', options: levels(-2, -5, -8) },
  { id: 'weight_reduction', label: '车身减重', group: '平台与操控', options: levels(6, 16, 28) },
  { id: 'clutch', label: '离合器', group: '传动系统', options: levels(0, 1, 2) },
  { id: 'transmission', label: '变速箱', group: '传动系统', options: [option('stock', '原厂'), option('street', '街车级不可调', 1), option('sport', '跑车级，可调终传比', 2, { adjustableFinalDrive: true }), option('race_standard', '标准赛车级可调', 3, { gearCount: 6, gearCountConfidence: 'unknown', adjustable: true }), option('drift_4', '四速漂移变速箱可调', 3, { gearCount: 4, adjustable: true }), option('race_6', '赛车六速可调', 3, { gearCount: 6, adjustable: true }), option('race_7', '赛车七速可调', 4, { gearCount: 7, adjustable: true }), option('race_8', '赛车八速可调', 5, { gearCount: 8, adjustable: true }), option('race_9', '赛车九速可调', 6, { gearCount: 9, adjustable: true }), option('race_10', '赛车十速可调', 7, { gearCount: 10, adjustable: true })] },
  { id: 'driveline', label: '传动轴', group: '传动系统', options: levels(0, 1, 2) },
  { id: 'differential', label: '差速器', group: '传动系统', options: [option('stock', '原厂'), option('sport', '跑车级可调', 1, { adjustable: true }), option('race', '赛车级可调', 2, { adjustable: true }), option('rally', '拉力差速器可调', 2, { adjustable: true }), option('offroad', '越野差速器可调', 2, { adjustable: true }), option('drift', '漂移差速器可调', 2, { adjustable: true })] },
  { id: 'tires_compound', label: '轮胎配方', group: '轮胎与轮毂', options: [option('stock', '原厂'), option('street', '街车胎', 4), option('sport', '跑车胎', 9), option('semi_slick', '半热熔胎', 16), option('slick', '热熔胎', 22), option('vintage_race', '复古赛车胎', 14), option('rally', '拉力胎', 12), option('offroad', '越野胎', 10), option('drift', '漂移胎', 10), option('drag', '直线加速胎', 8), option('snow', '雪地胎', 7)] },
  // 胎宽是车型专属的离散毫米值；没有来源时绝不伪造“加宽 N 级”。
  { id: 'tires_width_front', label: '前轮胎宽度', group: '轮胎与轮毂', options: [option('minus_1', '减小一级', -1), option('stock', '原厂宽度'), option('plus_1', '加宽一级', 1), option('plus_2', '加宽二级', 2), option('plus_3', '加宽三级', 3)] },
  { id: 'tires_width_rear', label: '后轮胎宽度', group: '轮胎与轮毂', options: [option('minus_1', '减小一级', -1), option('stock', '原厂宽度'), option('plus_1', '加宽一级', 2), option('plus_2', '加宽二级', 5), option('plus_3', '加宽三级', 8)] },
  { id: 'rim_size_front', label: '前轮毂尺寸', group: '轮胎与轮毂', sizeDisplay: true, options: [option('minus_1', '减小 1 英寸', -1), option('stock', '原厂尺寸'), ...Array.from({ length: 5 }, (_, index) => option(`plus_${index + 1}`, `加 ${index + 1} 英寸`, index + 1))] },
  { id: 'rim_size_rear', label: '后轮毂尺寸', group: '轮胎与轮毂', sizeDisplay: true, options: [option('minus_1', '减小 1 英寸', -1), option('stock', '原厂尺寸'), ...Array.from({ length: 5 }, (_, index) => option(`plus_${index + 1}`, `加 ${index + 1} 英寸`, index + 1))] },
  { id: 'track_width_front', label: '前轮距', group: '轮胎与轮毂', sizeDisplay: true, options: [option('stock', '原厂轮距'), option('wide_1', '加宽一级', 1), option('wide_2', '加宽二级', 2), option('wide_3', '加宽三级', 3)] },
  { id: 'track_width_rear', label: '后轮距', group: '轮胎与轮毂', sizeDisplay: true, options: [option('stock', '原厂轮距'), option('wide_1', '加宽一级', 1), option('wide_2', '加宽二级', 2), option('wide_3', '加宽三级', 3)] },
  // 空力件说明：FH5 中只有「Forza 品牌前铲/尾翼」才是可调件（解锁下压力调校菜单）
  // 固定前铲/尾翼外观件 PI 差异极大且无法可靠估算，不列入改装选项
  // 选项仅保留「原厂」和「可调」两种有明确语义的状态
  { id: 'front_aero', label: '前铲', group: '空气动力学', options: [option('stock', '原厂'), option('adjustable', '可调前铲（解锁前下压力调校）', 0, { adjustable: true })] },
  { id: 'rear_aero', label: '尾翼', group: '空气动力学', options: [option('stock', '原厂'), option('adjustable', '可调尾翼（解锁后下压力调校）', 0, { adjustable: true })] },
  { id: 'engine_restrictor', label: '限流板', group: '发动机', options: [option('stock', '原厂限流板', 0), option('removed', '拆除限流板', 45, { powerMultiplier: 1.45 })] }
];

// 手动模式保留完整枚举；AI 只从这些保守子集中选择。专属件默认不进入 AI。
const AI_SAFE_OPTION_IDS = {
  engine_intake: ['street', 'sport', 'race'], engine_intake_manifold: ['street', 'sport', 'race'],
  engine_fuel_system: ['street', 'sport', 'race'], engine_ignition: ['street', 'sport', 'race'],
  exhaust: ['street', 'sport', 'race'], engine_camshaft: ['street', 'sport', 'race'],
  engine_valves: ['street', 'sport', 'race'], engine_displacement: ['street', 'sport', 'race'],
  engine_pistons: ['street', 'sport', 'race'], engine_oil_cooling: ['street', 'sport', 'race'],
  engine_flywheel: ['street', 'sport', 'race'], brakes: ['street', 'sport', 'race'],
  suspension: ['street', 'sport', 'race', 'rally', 'drift', 'offroad'], anti_roll_bar_front: ['race'], anti_roll_bar_rear: ['race'],
  roll_cage: ['street', 'sport', 'race'], weight_reduction: ['street', 'sport', 'race'],
  clutch: ['street', 'sport', 'race'], transmission: ['street', 'sport', 'race_6'],
  driveline: ['street', 'sport', 'race'], differential: ['sport', 'race', 'rally', 'offroad', 'drift'],
  tires_compound: ['street', 'sport', 'semi_slick', 'slick', 'rally', 'offroad', 'drift'],
  tires_width_front: ['plus_1'], tires_width_rear: ['plus_1'],
  rims_weight: ['minus_5', 'minus_10', 'minus_15'],
  track_width_front: ['wide_1'], track_width_rear: ['wide_1'],
  engine_forced_induction: ['street', 'sport'], engine_intercooler: ['street', 'sport']
};

const tune = (id, min, max, step, when = null, rangeConfidence = 'game_global') => ({ id, range: { min, max, step }, when, rangeConfidence });
function buildCommonSlots(profile, selections) {
  const exclusions = new Set(profile.excludedCommonSlots || []);
  
  // 智能动态解锁限流板：若原车有配置，或选装了赛车级(Racing)/拉力级(Rally)置换引擎，则自动解锁显示
  let hasRestrictor = profile.commonSlotOverrides?.engine_restrictor?.availability === 'verified_present';
  if (selections?.engine_swap?.optionId && selections.engine_swap.optionId !== 'stock') {
    const engineSwapSlot = (profile.slots || []).find(s => s.id === 'engine_swap');
    const selectedOpt = engineSwapSlot?.options?.find(o => o.id === selections.engine_swap.optionId);
    if (selectedOpt) {
      const optName = (selectedOpt.label || selectedOpt.name || '').toLowerCase();
      if (optName.includes('racing') || optName.includes('rally') || optName.includes('restrictor') || optName.includes('赛车') || optName.includes('拉力')) {
        hasRestrictor = true;
      }
    }
  }
  if (!hasRestrictor) {
    exclusions.add('engine_restrictor');
  }
  if (profile.commonTemplate === 'electric_road' || profile.stockAspiration === 'e') {
    ['aspiration_swap', 'engine_intake', 'engine_intake_manifold', 'engine_fuel_system', 'engine_ignition', 'exhaust', 'engine_camshaft', 'engine_valves', 'engine_displacement', 'engine_pistons', 'engine_oil_cooling', 'engine_flywheel', 'clutch'].forEach(id => exclusions.add(id));
  }
  const overrides = profile.commonSlotOverrides || {};
  const slots = COMMON_SLOTS.filter(slot => {
    if (exclusions.has(slot.id) && !overrides[slot.id]) return false;
    const availability = overrides[slot.id]?.availability;
    const hasVehicleEvidence = (profile.slots || []).some(vehicleSlot => vehicleSlot.id === slot.id)
      || availability === 'verified_present' || availability === 'source_explicit';
    if (slot.requiresVehicleEvidence && !hasVehicleEvidence) return false;
    // “未知”表示尚未收录专属资料，应回退到通用候选；只有游戏内已
    // 明确验证不存在时才隐藏该项目。
    return availability !== 'verified_absent';
  }).map(slot => {
    const override = overrides[slot.id] || {};
    const allowed = override.allowedOptions ? new Set(override.allowedOptions) : null;
    const aiSafe = new Set(override.aiEligibleOptions || AI_SAFE_OPTION_IDS[slot.id] || []);
    const slotOptions = slot.options;
    const options = slotOptions.filter(item => !allowed || item.id === 'stock' || allowed.has(item.id)).map(item => {
      const isSameDrivetrain = slot.id === 'drivetrain_swap' && item.driveType === profile.baseDriveType;
      // null 表示尚无 PI 数据，不能把它误当作 0 PI。
      const actualPiEstimate = isSameDrivetrain ? 0 : item.piEstimate;
      const hasPiEstimate = actualPiEstimate !== null && actualPiEstimate !== '' && Number.isFinite(Number(actualPiEstimate));

      let upperEstimate = null;
      if (item.id === 'stock' || isSameDrivetrain) {
        upperEstimate = 0;
      } else if (hasPiEstimate) {
        // 未验证项仍明确标为估算，但不能以任意 1.5 倍安全系数提前耗尽
        // 用户选定的 PI 空间；AI 会在实际游戏 PI 回填后继续校准。
        upperEstimate = Number(actualPiEstimate);
      }

      return {
        ...item,
        piEstimate: actualPiEstimate,
        aiEligible: item.id !== 'stock' && aiSafe.has(item.id),
        piConfidence: (item.id === 'stock' || isSameDrivetrain) ? 'exact' : (hasPiEstimate ? 'bounded_generic_estimate' : 'unknown'),
        piUpperEstimate: upperEstimate
      };
    });
    return {
      ...slot,
      scope: 'common_template',
      availability: override.availability || 'inferred_common',
      tireWidthSource: null,
      options
    };
  });
  if (profile.commonTemplate === 'electric_road' || profile.stockAspiration === 'e') {
    slots.unshift(
      { id: 'electric_motor', label: '电机', group: '电驱系统', scope: 'common_template', availability: 'inferred_common', options: levels(2, 5, 9).map(item => ({ ...item, aiEligible: false, piConfidence: item.id === 'stock' ? 'exact' : 'unknown' })) },
      { id: 'electric_battery', label: '电池', group: '电驱系统', scope: 'common_template', availability: 'inferred_common', options: levels(1, 3, 6).map(item => ({ ...item, aiEligible: false, piConfidence: item.id === 'stock' ? 'exact' : 'unknown' })) }
    );
  }
  const aspiration = selections.aspiration_swap?.optionId || 'stock';
  const selectedForcedInduction = ['aspiration_t', 'aspiration_tt', 'aspiration_pds', 'aspiration_cs'].includes(aspiration);
  const forcedInduction = aspiration === 'stock' ? !['na', 'e', null].includes(profile.stockAspiration) : selectedForcedInduction;
  if (forcedInduction) {
    for (const slot of [
      {
        id: 'engine_forced_induction',
        label: '增压器升级',
        options: [
          option('stock', '原厂增压器', 0),
          option('street', '街车级涡轮增压器', 3),
          option('sport', '跑车级涡轮增压器', 7),
          option('race', '防滞后赛车涡轮增压器', 12)
        ]
      },
      { id: 'engine_intercooler', label: '中冷器', options: levels(1, 2, 4) }
    ]) {
      const aiSafe = new Set(AI_SAFE_OPTION_IDS[slot.id] || []);
      slots.push({ ...slot, group: '发动机', scope: 'state_dependent', availability: 'inferred_common', options: slot.options.map(item => ({ ...item, aiEligible: item.id !== 'stock' && aiSafe.has(item.id), piConfidence: item.id === 'stock' ? 'exact' : 'bounded_generic_estimate', piUpperEstimate: item.id === 'stock' ? 0 : item.piEstimate })) });
    }
  }
  return slots;
}

function buildTuneParameters(profile, selections, slots, declaredDriveType = null) {
  // 胎压与车轮定位（FH5 游戏全车系出厂默认可调）
  const parameters = [
    tune('tire_pressure_front', 1.0, 3.8, 0.01),
    tune('tire_pressure_rear', 1.0, 3.8, 0.01),
    tune('tire_camber_front', -5, 5, 0.1),
    tune('tire_camber_rear', -5, 5, 0.1),
    tune('tire_toe_front', -5, 5, 0.1),
    tune('tire_toe_rear', -5, 5, 0.1),
    tune('caster_front', 1, 7, 0.1)
  ];

  // 辅助检测：支持兼顾配件选装模式（selections[slotId].optionId）与能力清单声明模式（slots[slotId].options.adjustable）
  const isAdjustable = (slotId, checkProperty = 'adjustable') => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return false;
    const selected = slot.options?.find(item => item.id === selections[slotId]?.optionId);
    if (selected && selected[checkProperty]) return true;
    return (slot.options || []).some(opt => opt[checkProperty] === true);
  };

  // 1. 悬挂与弹簧/阻尼解算
  if (isAdjustable('suspension') || profile.stockAdjustableSuspension) {
    parameters.push(
      tune('spring_front', 0.1, 200, 0.1, null, 'vehicle_specific_unknown'),
      tune('spring_rear', 0.1, 200, 0.1, null, 'vehicle_specific_unknown'),
      tune('ride_height_front', 3, 20, 1, null, 'vehicle_specific_unknown'),
      tune('ride_height_rear', 3, 20, 1, null, 'vehicle_specific_unknown'),
      tune('rebound_front', 1, 20, 0.1), tune('rebound_rear', 1, 20, 0.1),
      tune('bump_front', 1, 20, 0.1), tune('bump_rear', 1, 20, 0.1)
    );
  }

  // 2. 防倾杆解算
  if (isAdjustable('anti_roll_bar_front') || profile.stockAdjustableAntiRollBarFront) parameters.push(tune('arb_front', 1, 65, 0.1));
  if (isAdjustable('anti_roll_bar_rear') || profile.stockAdjustableAntiRollBarRear) parameters.push(tune('arb_rear', 1, 65, 0.1));

  // 3. 变速箱/终传比与各档位齿轮比解算
  const isFinalDriveAdjustable = isAdjustable('transmission', 'adjustableFinalDrive') || isAdjustable('transmission', 'adjustable') || profile.stockAdjustableTransmission;
  if (isFinalDriveAdjustable) {
    parameters.push(tune('final_drive', 1, 6, 0.01));
  }

  const isGearsAdjustable = isAdjustable('transmission', 'adjustable') || profile.stockAdjustableTransmission;
  if (isGearsAdjustable) {
    const transSlot = slots.find(slot => slot.id === 'transmission');
    const selectedOpt = transSlot?.options?.find(item => item.id === selections.transmission?.optionId);
    const firstOptWithGear = transSlot?.options?.find(item => item.gearCount);
    const gearCount = selectedOpt?.gearCount || firstOptWithGear?.gearCount || 6;
    for (let gear = 1; gear <= gearCount; gear++) {
      parameters.push(tune(`gear_${gear}`, 0.5, 6, 0.01, null, 'vehicle_specific_unknown'));
    }
  }

  // 4. 刹车解算
  if (isAdjustable('brakes') || profile.stockAdjustableBrakes) {
    parameters.push(tune('brake_balance', 0, 100, 1), tune('brake_pressure', 20, 200, 1));
  }

  // 5. 差速器解算（结合当前驱动形式出解）
  if (isAdjustable('differential') || profile.stockAdjustableDifferential) {
    const driveSwap = slots.find(slot => slot.id === 'drivetrain_swap')?.options
      ?.find(item => item.id === selections.drivetrain_swap?.optionId);
    const currentDriveType = (driveSwap?.driveType || declaredDriveType || profile.baseDriveType || 'awd').toLowerCase();
    if (currentDriveType === 'fwd' || currentDriveType === 'awd') {
      parameters.push(tune('diff_front_accel', 0, 100, 1), tune('diff_front_decel', 0, 100, 1));
    }
    if (currentDriveType === 'rwd' || currentDriveType === 'awd') {
      parameters.push(tune('diff_rear_accel', 0, 100, 1), tune('diff_rear_decel', 0, 100, 1));
    }
    if (currentDriveType === 'awd') {
      parameters.push(tune('diff_center', 0, 100, 1));
    }
  }

  // 6. 空气下压力解算
  if (isAdjustable('front_aero') || profile.stockAdjustableAeroFront) parameters.push(tune('downforce_front', 0, 1000, 1, null, 'vehicle_specific_unknown'));
  if (isAdjustable('rear_aero') || profile.stockAdjustableAeroRear) parameters.push(tune('downforce_rear', 0, 1000, 1, null, 'vehicle_specific_unknown'));

  return parameters;
}

// 调教工坊的能力声明不等同于改装清单：它只记录玩家已在游戏中确认可调的项目，
// 因而绝不能参与 PI 预测或自动选配件。范围仍由同一参数目录输出。
export function resolveTuningCapabilities(profile, capabilities = {}, context = {}) {
  const caps = capabilities || {};

  // 1. 悬挂/弹簧归一化：支持 suspension: true 或 springs: 'race'/'sport'/'street'/true
  const isSuspensionAdjustable = caps.suspension === true ||
    caps.springs === 'race' || caps.springs === 'sport' || caps.springs === 'street' || caps.springs === true;

  // 2. 防倾杆归一化：支持 frontAntiRollBar/rearAntiRollBar 为 true，或 antiRollBars 为 'both'/'front'/'rear'/true
  const isFrontArbAdjustable = caps.frontAntiRollBar === true ||
    caps.antiRollBars === 'both' || caps.antiRollBars === 'front' || caps.antiRollBars === true;
  const isRearArbAdjustable = caps.rearAntiRollBar === true ||
    caps.antiRollBars === 'both' || caps.antiRollBars === 'rear' || caps.antiRollBars === true;

  // 3. 空气下压力归一化：支持 frontAero/rearAero 为 true，或 aero 为 'both'/'front'/'rear'/true
  const isFrontAeroAdjustable = caps.frontAero === true ||
    caps.aero === 'both' || caps.aero === 'front' || caps.aero === true;
  const isRearAeroAdjustable = caps.rearAero === true ||
    caps.aero === 'both' || caps.aero === 'rear' || caps.aero === true;

  // 4. 变速箱/齿轮比归一化：支持 'gears'/'race'/'both'/true (全齿轮可调)，'finalDrive'/'sport' (仅终传比可调)
  let transmissionMode = 'none';
  if (['gears', 'race', 'both'].includes(caps.transmission) || caps.transmission === true) {
    transmissionMode = 'gears';
  } else if (['finalDrive', 'sport'].includes(caps.transmission)) {
    transmissionMode = 'finalDrive';
  }

  // 5. 刹车与差速器归一化
  const isBrakesAdjustable = caps.brakes === true || caps.brake === true;
  const isDifferentialAdjustable = caps.differential === true || caps.diff === true;

  const normalized = {
    alignment: caps.alignment !== false,
    suspension: isSuspensionAdjustable,
    frontAntiRollBar: isFrontArbAdjustable,
    rearAntiRollBar: isRearArbAdjustable,
    transmission: transmissionMode,
    gearCount: Math.max(4, Math.min(10, Number(caps.gearCount) || 6)),
    brakes: isBrakesAdjustable,
    differential: isDifferentialAdjustable,
    frontAero: isFrontAeroAdjustable,
    rearAero: isRearAeroAdjustable,
    driveType: ['fwd', 'rwd', 'awd'].includes(caps.driveType) ? caps.driveType : context.driveType
  };

  const slots = [
    { id: 'alignment', options: [{ id: 'confirmed', adjustable: normalized.alignment }] },
    { id: 'suspension', options: [{ id: 'confirmed', adjustable: normalized.suspension }] },
    { id: 'anti_roll_bar_front', options: [{ id: 'confirmed', adjustable: normalized.frontAntiRollBar }] },
    { id: 'anti_roll_bar_rear', options: [{ id: 'confirmed', adjustable: normalized.rearAntiRollBar }] },
    { id: 'transmission', options: [{ id: normalized.transmission, adjustable: normalized.transmission === 'gears', adjustableFinalDrive: normalized.transmission !== 'none', gearCount: normalized.gearCount }] },
    { id: 'brakes', options: [{ id: 'confirmed', adjustable: normalized.brakes }] },
    { id: 'differential', options: [{ id: 'confirmed', adjustable: normalized.differential }] },
    { id: 'front_aero', options: [{ id: 'confirmed', adjustable: normalized.frontAero }] },
    { id: 'rear_aero', options: [{ id: 'confirmed', adjustable: normalized.rearAero }] }
  ];

  const selections = Object.fromEntries(slots.map(slot => [slot.id, { optionId: slot.options[0].id }]));
  const profileWithoutStockUnlocks = {
    ...(profile || {}), stockAdjustableSuspension: false, stockAdjustableAntiRollBarFront: false,
    stockAdjustableAntiRollBarRear: false, stockAdjustableTransmission: false, stockAdjustableBrakes: false,
    stockAdjustableDifferential: false, stockAdjustableAeroFront: false, stockAdjustableAeroRear: false
  };

  return { capabilities: normalized, tuneParameters: buildTuneParameters(profileWithoutStockUnlocks, selections, slots, normalized.driveType) };
}

/** Resolve one vehicle's special options plus FH5's broadly shared upgrade shop. */
export function isConditionMet(condition, selections = {}) {
  if (!condition) return true;
  if (Array.isArray(condition.all)) return condition.all.every(item => isConditionMet(item, selections));
  if (Array.isArray(condition.any)) return condition.any.some(item => isConditionMet(item, selections));
  if (condition.not) return !isConditionMet(condition.not, selections);

  const selected = selections[condition.slot]?.optionId;
  if (condition.optionIn) return condition.optionIn.includes(selected);
  if (condition.optionNotIn) return !condition.optionNotIn.includes(selected);
  return false;
}

const VEHICLE_SLOT_PI_MODELS = {
  aspiration_swap: { aspiration_na: 0, aspiration_t: 20, aspiration_tt: 20, aspiration_pds: 20, aspiration_cs: 20 },
  widebody: { listed_widebody: 8 },
  front_aero: { adjustable: 0 },
  rear_aero: { adjustable: 0 },
  appearance_options: { listed_appearance: 0 },
  upgrade_preset: { listed_preset: 0 }
};

const applyVehiclePiModel = (slot, item) => {
  if (item.id === 'stock') return { ...item, piEstimate: 0, piSource: 'stock', piConfidence: 'exact', piUpperEstimate: 0, aiEligible: false };
  const supplied = Number(item.piEstimate);
  if (Number.isFinite(supplied)) {
    // 当前引擎置换的数值来自马力差模型；保留数值但明确来源，供界面和 AI 区分。
    const source = item.piSource || (slot.id === 'engine_swap' ? 'engine_power_model' : 'vehicle_supplied_estimate');
    return { ...item, piEstimate: supplied, piSource: source, piConfidence: item.piConfidence || 'model_estimate', piUpperEstimate: item.piUpperEstimate ?? supplied, aiEligible: item.aiEligible ?? ['engine_swap', 'aspiration_swap'].includes(slot.id) };
  }
  const estimate = VEHICLE_SLOT_PI_MODELS[slot.id]?.[item.id];
  if (!Number.isFinite(estimate)) return { ...item, piEstimate: null, piSource: 'unknown', piConfidence: 'unknown', piUpperEstimate: null };
  return { ...item, piEstimate: estimate, piSource: 'vehicle_slot_model', piConfidence: 'model_estimate', piUpperEstimate: estimate, aiEligible: false };
};

export function resolveUpgradeProfile(profile, selections = {}, context = {}) {
  if (!profile) {
    const defaultProfile = {
      status: 'unverified',
      basePi: context.basePi || 500,
      baseDriveType: context.driveType || 'awd',
      commonTemplate: 'combustion_road'
    };
    const commonSlots = buildCommonSlots(defaultProfile, selections);
    const tuneParameters = buildTuneParameters(defaultProfile, selections, commonSlots, defaultProfile.baseDriveType);

    const effectiveSelections = { ...selections };
    for (const slot of commonSlots) {
      if (!effectiveSelections[slot.id]) {
        effectiveSelections[slot.id] = { optionId: 'stock' };
      }
    }
    const formula = applyPiPredictions(defaultProfile, effectiveSelections, commonSlots);

    return {
      status: 'unverified',
      message: '该车辆的游戏内改装资料尚未录入，显示通用猜测配件。',
      piStatus: 'formula_v1',
      basePi: defaultProfile.basePi,
      baseDriveType: defaultProfile.baseDriveType,
      prediction: formula.prediction,
      slots: formula.slots,
      tuneParameters,
      effectiveSelections
    };
  }

  const conversionSlots = new Set(['engine_swap', 'drivetrain_swap', 'aspiration_swap', 'widebody']);
  // 专属证据决定“是否可用”，展示分组仍应遵循改装功能。否则已验证的
  // 前铲和尾翼会被错误展示在“车辆专属”，而不是“空气动力学”。
  const displayGroups = { front_aero: '空气动力学', rear_aero: '空气动力学' };
  const specialSlots = (profile.slots || []).map(slot => ({
    ...slot,
    group: conversionSlots.has(slot.id) ? '置换' : (displayGroups[slot.id] || slot.group),
    scope: slot.scope || 'vehicle_specific',
    availability: slot.availability || 'source_explicit',
    options: (slot.options || []).filter(option => isConditionMet(option.when, selections)).map(option => applyVehiclePiModel(slot, option))
  })).filter(slot => slot.options.length > 0);

  const commonSlots = buildCommonSlots(profile, selections);
  const specialIds = new Set(specialSlots.map(slot => slot.id));
  const commonById = new Map(commonSlots.map(slot => [slot.id, slot]));
  const mergedSpecialSlots = specialSlots.map(special => {
    const common = commonById.get(special.id);
    if (!common) return special;
    if (special.replaceCommonOptions) {
      const commonOptions = new Map((common.options || []).map(item => [item.id, item]));
      return {
        ...common,
        ...special,
        options: (special.options || []).map(item => ({ ...(commonOptions.get(item.id) || {}), ...item }))
      };
    }
    const options = new Map((common.options || []).map(item => [item.id, item]));
    for (const item of special.options || []) options.set(item.id, { ...(options.get(item.id) || {}), ...item });
    return { ...common, ...special, options: [...options.values()] };
  });
  const slots = [...mergedSpecialSlots, ...commonSlots.filter(slot => !specialIds.has(slot.id))];

  // Dynamically update 'stock' option label for 'drivetrain_swap' and filter out redundant options
  // 原厂驱动必须由车辆档案决定；context.driveType 仅供缺少档案时回退。
  // 不能用玩家当前置换的驱动覆盖它，否则该置换会被误判为“原厂冗余项”。
  const profileBaseDriveType = String(profile?.baseDriveType || '').toLowerCase();
  const finalBaseDriveType = ['fwd', 'rwd', 'awd'].includes(profileBaseDriveType)
    ? profileBaseDriveType
    : (context.driveType || 'awd').toLowerCase();
  const driveTypeLabels = { fwd: '原厂 (前驱)', rwd: '原厂 (后驱)', awd: '原厂 (四驱)' };
  const driveTypeLabel = driveTypeLabels[finalBaseDriveType] || '原厂';
  const driveSwapSlot = slots.find(slot => slot.id === 'drivetrain_swap');
  if (driveSwapSlot) {
    const stockOption = driveSwapSlot.options?.find(opt => opt.id === 'stock');
    if (stockOption) {
      stockOption.label = driveTypeLabel;
    }
    // Filter out the option that is the same as the base drivetrain (since it's redundant to "stock")
    driveSwapSlot.options = driveSwapSlot.options.filter(opt => {
      if (opt.id === 'stock') return true;
      return opt.driveType !== finalBaseDriveType;
    });
  }

  // 动态净化并过滤置换引擎选项中的同马力歧义 (如过滤油车的电驱选项，去除“待核验”字眼)
  const engineSwapSlot = slots.find(slot => slot.id === 'engine_swap');
  if (engineSwapSlot) {
    engineSwapSlot.options = engineSwapSlot.options.map(opt => {
      if (opt.id === 'stock' || !opt.engineCandidates || opt.engineCandidates.length <= 1) return opt;
      
      const isElectricVehicle = profile.commonTemplate?.toLowerCase().includes('electric');
      
      let filteredCandidates = opt.engineCandidates;
      if (isElectricVehicle) {
        // 如果是电车，只保留电驱
        filteredCandidates = opt.engineCandidates.filter(c => c.aspiration === 'e' || c.name?.toLowerCase().includes('motor'));
      } else {
        // 如果是油车，过滤电驱
        filteredCandidates = opt.engineCandidates.filter(c => c.aspiration !== 'e' && !c.name?.toLowerCase().includes('motor'));
      }

      if (filteredCandidates.length > 0) {
        const bestCandidate = filteredCandidates[0];
        const sourceVehicleText = bestCandidate.sourceVehicle ? ` (来自 ${bestCandidate.sourceVehicle})` : '';
        return {
          ...opt,
          label: `${bestCandidate.name} · ${bestCandidate.powerHp}马力${sourceVehicleText}`,
          engineCandidates: filteredCandidates,
          engineNameStatus: filteredCandidates.length === 1 ? 'resolved' : 'ambiguous'
        };
      }
      
      return opt;
    });
  }

  const effectiveSelections = { ...selections };
  const invalidated = [];
  for (const [slotId, selection] of Object.entries(selections)) {
    if (!selection?.optionId || selection.optionId === 'stock') continue;
    const slot = slots.find(item => item.id === slotId);
    if (!slot?.options.some(item => item.id === selection.optionId)) {
      invalidated.push({ slotId, optionId: selection.optionId, reason: '上游改装或车辆能力发生变化' });
      delete effectiveSelections[slotId];
    }
  }

  // Ensure all slots are fully populated with stock selections if they don't exist
  for (const slot of slots) {
    if (!effectiveSelections[slot.id]) {
      if (slot.tierSystem) {
        effectiveSelections[slot.id] = { tier: 'stock', optionId: 'stock' };
      } else {
        effectiveSelections[slot.id] = { optionId: 'stock' };
      }
    } else {
      const sel = effectiveSelections[slot.id];
      if (slot.tierSystem) {
        if (!sel.tier) sel.tier = 'stock';
        if (!sel.optionId) sel.optionId = 'stock';
      } else {
        if (!sel.optionId) sel.optionId = 'stock';
      }
    }
  }

  const tuneParameterMap = new Map();
  for (const parameter of [...buildTuneParameters(profile, effectiveSelections, slots, context.driveType), ...(profile.tuneParameters || []).filter(parameter => isConditionMet(parameter.when, effectiveSelections))]) {
    tuneParameterMap.set(parameter.id, { ...(tuneParameterMap.get(parameter.id) || {}), ...parameter });
  }
  const tuneParameters = [...tuneParameterMap.values()];
  const selectedDriveType = slots.find(slot => slot.id === 'drivetrain_swap')?.options
    ?.find(option => option.id === effectiveSelections.drivetrain_swap?.optionId)?.driveType;

  // 公式模型只在所有联动、无效选项和原厂默认项完成解析后运行。它以整车
  // 预测为真源，并为每个候选项计算本车型固定 PI；最终总 PI 直接求和。
  const formulaProfile = { ...profile, baseDriveType: finalBaseDriveType };
  const formula = applyPiPredictions(formulaProfile, effectiveSelections, slots);

  return {
    status: profile.status || 'draft',
    source: profile.source || [],
    gameVersion: profile.gameVersion || null,
    basePi: profile.basePi || null,
    baseDriveType: profile.baseDriveType || null,
    effectiveDriveType: selectedDriveType || context.driveType || profile.baseDriveType || null,
    commonTemplate: profile.commonTemplate || 'combustion_road',
    piStatus: 'formula_v1',
    prediction: formula.prediction,
    slots: formula.slots,
    tuneParameters,
    effectiveSelections,
    invalidated
  };
}

export function validateBuild(profile, selections = {}) {
  const resolved = resolveUpgradeProfile(profile, selections);
  if (!profile) return { valid: false, errors: ['该车辆没有已验证的改装资料。'] };

  const errors = [];
  for (const [slotId, selection] of Object.entries(selections)) {
    if (!selection?.optionId || selection.optionId === 'stock') continue;
    const slot = resolved.slots.find(item => item.id === slotId);
    if (!slot?.options.some(option => option.id === selection.optionId)) {
      errors.push(`当前车辆和配置不能使用改装项：${slotId}/${selection.optionId}`);
    }
  }
  return { valid: errors.length === 0, errors, resolved };
}

/**
 * 公式模型的一键改装求解器。每轮都以完整构建重算 PI，避免旧版把动态边际
 * PI 静态相加造成的双算；同时反复 resolve，以处理增压等会解锁新插槽的联动。
 */
const SEGMENT_TYPES = {
  road: new Set(['technical', 'balanced', 'high_speed']),
  dirt: new Set(['technical', 'balanced', 'fast_flow']),
  rally: new Set(['tarmac_bias', 'balanced', 'dirt_bias']),
  cross_country: new Set(['flat_fast', 'balanced', 'rough']),
  drift: new Set(['technical', 'balanced', 'high_speed'])
};

function normalizeSegmentType(raceType, segmentType) {
  return SEGMENT_TYPES[raceType]?.has(segmentType) ? segmentType : 'balanced';
}

function segmentSlotBonus(segmentType, slotId) {
  const groups = {
    technical: new Set(['tires_width_front', 'tires_width_rear', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear', 'weight_reduction']),
    high_speed: new Set(['transmission', 'driveline', 'engine_camshaft', 'engine_forced_induction', 'engine_intake', 'engine_exhaust', 'front_aero', 'rear_aero']),
    fast_flow: new Set(['transmission', 'driveline', 'weight_reduction', 'front_aero', 'rear_aero']),
    tarmac_bias: new Set(['tires_width_front', 'tires_width_rear', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear']),
    dirt_bias: new Set(['weight_reduction', 'differential', 'roll_cage']),
    flat_fast: new Set(['transmission', 'driveline', 'weight_reduction']),
    rough: new Set(['roll_cage', 'weight_reduction', 'differential', 'tires_width_front', 'tires_width_rear'])
  };
  return groups[segmentType]?.has(slotId) ? 18 : 0;
}

export function solveFormulaBuild(profile, selections = {}, { targetPi = 800, driveType, raceType = 'road', segmentType } = {}) {
  const priority = {
    road: ['tires_compound', 'tires_width_front', 'tires_width_rear', 'weight_reduction', 'suspension', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear'],
    dirt: ['tires_compound', 'suspension', 'differential', 'weight_reduction', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear'],
    rally: ['tires_compound', 'suspension', 'differential', 'weight_reduction', 'brakes', 'anti_roll_bar_front', 'anti_roll_bar_rear'],
    cross_country: ['tires_compound', 'suspension', 'differential', 'roll_cage', 'weight_reduction', 'brakes'],
    drift: ['suspension', 'differential', 'tires_width_rear', 'transmission', 'engine_camshaft']
  };
  
  const normalizedSegmentType = normalizeSegmentType(raceType, segmentType);
  let parts = { ...selections };
  const limit = Math.min(999, Number(targetPi) || 800);

  // 1. 操控核心改件前置强制装配 (META 改装黄金准则：操控与鞋子最优先)
  if (raceType === 'dirt' || raceType === 'rally') {
    parts.tires_compound = { optionId: 'rally', tier: 'sport' };
    parts.suspension = { optionId: 'rally', tier: 'sport' };
    parts.differential = { optionId: 'race', tier: 'race' };
  } else if (raceType === 'cross_country') {
    parts.tires_compound = { optionId: 'offroad', tier: 'sport' };
    parts.suspension = { optionId: 'offroad', tier: 'sport' };
    parts.differential = { optionId: 'race', tier: 'race' };
  } else if (raceType === 'drift') {
    parts.suspension = { optionId: 'drift', tier: 'sport' };
    parts.differential = { optionId: 'drift', tier: 'sport' };
    parts.tires_compound = { optionId: 'drift', tier: 'sport' };
  } else { // 公路/街头赛 road
    parts.suspension = { optionId: 'race', tier: 'race' };
    parts.anti_roll_bar_front = { optionId: 'race', tier: 'race' };
    parts.anti_roll_bar_rear = { optionId: 'race', tier: 'race' };
    
    // 根据目标 PI 级别动态选择轮胎抓地材质
    if (limit >= 900) { // S1 级以上
      parts.tires_compound = { optionId: 'semi_slick', tier: 'sport' };
    } else if (limit >= 800) { // A 级以上
      parts.tires_compound = { optionId: 'sport', tier: 'sport' };
    } else if (limit >= 700) { // B 级
      parts.tires_compound = { optionId: 'street', tier: 'street' };
    }
  }

  let resolved = resolveUpgradeProfile(profile, parts, { driveType });

  // 先保留赛事核心件；如果前置核心件已经超限，交给后面的价值回退策略
  // 选择低性价比配件，不直接牺牲轮胎或悬挂。
  resolved = resolveUpgradeProfile(profile, parts, { driveType });

  // 2. 启发式多轮贪心升级搜索
  for (let pass = 0; pass < 80; pass++) {
    const current = resolved.prediction;
    if (current.totalPi >= limit) break;

    let best = null;
    for (const slot of resolved.slots || []) {
      const currentId = parts[slot.id]?.optionId || 'stock';
      for (const option of slot.options || []) {
        if (option.id === currentId || option.id === 'stock') continue;
        
        // 剪枝过滤：不允许选退化或低于当前的配件级别
        const currentTierIdx = TIER_INDEX[currentId] ?? 0;
        const optionTierIdx = TIER_INDEX[option.id] ?? 0;
        if (slot.tierSystem && optionTierIdx <= currentTierIdx) continue;

        const candidateParts = { ...parts, [slot.id]: { optionId: option.id, tier: option.id } };
        const candidate = predictBuildPi(profile, candidateParts, resolved.slots);
        
        // 严格限制在目标 PI 内；不把超限方案伪装成可行方案。
        if (candidate.totalPi > limit || candidate.totalPi <= current.totalPi) continue;
        
        const rank = priority[raceType]?.indexOf(slot.id);
        const utility = (candidate.totalPi - current.totalPi) + (rank >= 0 ? (priority[raceType].length - rank) * 12 : 0) + segmentSlotBonus(normalizedSegmentType, slot.id) - candidate.uncertainty * 0.15;
        if (!best || utility > best.utility) {
          best = { slotId: slot.id, optionId: option.id, utility, targetPi: candidate.totalPi };
        }
      }
    }
    if (!best) break;

    // 实施升级
    parts = { ...parts, [best.slotId]: { optionId: best.optionId, tier: best.optionId } };
    resolved = resolveUpgradeProfile(profile, parts, { driveType });
  }

  // 3. 动力改件降级回溯（Backtracking Downgrade）—— 极限缝合目标 PI 阈值
  const powerSlotsForDowngrade = [
    'engine_flywheel', 'engine_oil_cooling', 'engine_ignition', 
    'engine_valves', 'engine_intake', 'engine_fuel_system', 
    'engine_intercooler', 'engine_displacement', 'engine_pistons',
    'exhaust', 'engine_camshaft'
  ];

  for (let rollback = 0; rollback < 10; rollback++) {
    resolved = resolveUpgradeProfile(profile, parts, { driveType });
    if (resolved.prediction.totalPi <= limit) break;

    // 寻找当前已升级最高的动力小改件进行降级
    let downgradedSomething = false;
    for (const slotId of powerSlotsForDowngrade) {
      const currentOptId = parts[slotId]?.optionId || 'stock';
      if (currentOptId === 'stock') continue;

      // 降级一个档次
      const slot = resolved.slots?.find(s => s.id === slotId);
      if (!slot) continue;
      
      const currentTierIdx = TIER_INDEX[currentOptId] ?? 0;
      const lowerOptions = (slot.options || [])
        .filter(o => (TIER_INDEX[o.id] ?? 0) < currentTierIdx)
        .sort((a, b) => (TIER_INDEX[b.id] ?? 0) - (TIER_INDEX[a.id] ?? 0)); // 按等级降序

      if (lowerOptions.length > 0) {
        parts[slotId] = { optionId: lowerOptions[0].id, tier: lowerOptions[0].id };
        downgradedSomething = true;
        break;
      }
    }
    if (!downgradedSomething) break;
  }

  // 通用超限回退：不是删除 PI 最大的配件，而是计算每个配件被删除后
  // 能省下多少 PI，再按“功能价值 / 节省 PI”从低到高回退。
  // 赛事核心件默认受保护，确保 AI 方案仍然像一个有目标的改装方案。
  const protectedSlots = new Set({
    road: ['tires_compound', 'suspension', 'anti_roll_bar_front', 'anti_roll_bar_rear'],
    dirt: ['tires_compound', 'suspension', 'differential'],
    rally: ['tires_compound', 'suspension', 'differential'],
    cross_country: ['tires_compound', 'suspension', 'differential'],
    drift: ['tires_compound', 'suspension', 'differential']
  }[raceType] || []);
  const slotValue = {
    tires_compound: 100, suspension: 95, differential: 90,
    anti_roll_bar_front: 80, anti_roll_bar_rear: 80,
    weight_reduction: 75, brakes: 70, tires_width_front: 70,
    tires_width_rear: 70, track_width_front: 65, track_width_rear: 65,
    transmission: 65, drivetrain_swap: 65, front_aero: 60, rear_aero: 60,
    engine_swap: 60, engine_camshaft: 48, engine_forced_induction: 48,
    engine_intake: 35, engine_intake_manifold: 35, engine_fuel_system: 35,
    engine_ignition: 30, exhaust: 35, engine_valves: 32,
    engine_displacement: 45, engine_pistons: 42, engine_intercooler: 28,
    engine_oil_cooling: 15, engine_flywheel: 12, clutch: 25, driveline: 25,
    roll_cage: 35, rims_weight: 20, rim_size_front: 10, rim_size_rear: 10
  };
  for (let rollback = 0; rollback < 30; rollback++) {
    resolved = resolveUpgradeProfile(profile, parts, { driveType });
    if (resolved.prediction.totalPi <= limit) break;
    const currentPi = resolved.prediction.totalPi;
    const removable = (resolved.slots || [])
      .filter(slot => !protectedSlots.has(slot.id))
      .map(slot => {
        const optionId = parts[slot.id]?.optionId || parts[slot.id]?.tier || 'stock';
        const option = slot.options?.find(item => item.id === optionId);
        if (optionId === 'stock' || !option) return null;
        const candidateParts = { ...parts, [slot.id]: { optionId: 'stock', tier: 'stock' } };
        const candidate = predictBuildPi(profile, candidateParts, resolved.slots);
        const savedPi = Math.max(0, currentPi - candidate.totalPi);
        const rank = priority[raceType]?.indexOf(slot.id) ?? -1;
        const strategicValue = rank >= 0 ? (priority[raceType].length - rank) * 12 : 0;
        const value = Number(option.performanceScore) || (slotValue[slot.id] || 20) + strategicValue;
        return { slot, optionId, option, savedPi, value, valuePerPi: value / Math.max(1, savedPi) };
      })
      .filter(Boolean)
      .filter(item => item.savedPi > 0)
      .sort((a, b) => a.valuePerPi - b.valuePerPi || b.savedPi - a.savedPi);
    if (!removable.length) break;
    const target = removable[0];
    parts[target.slot.id] = { optionId: 'stock', tier: 'stock' };
  }

  resolved = resolveUpgradeProfile(profile, parts, { driveType });
  const predictedPi = Number(resolved.prediction?.totalPi);
  return {
    parts: resolved.effectiveSelections,
    prediction: resolved.prediction,
    slots: resolved.slots,
    targetPi: limit,
    segmentType: normalizedSegmentType,
    withinTarget: Number.isFinite(predictedPi) && predictedPi <= limit,
    overBy: Number.isFinite(predictedPi) ? Math.max(0, predictedPi - limit) : null,
    solverStatus: Number.isFinite(predictedPi) && predictedPi <= limit ? 'feasible' : 'no_feasible_build'
  };
}

const TUNE_FIELD_PATHS = {
  tire_pressure_front: ['tires', 'frontPressure'], tire_pressure_rear: ['tires', 'rearPressure'],
  tire_camber_front: ['tires', 'frontCamber'], tire_camber_rear: ['tires', 'rearCamber'],
  tire_toe_front: ['tires', 'frontToe'], tire_toe_rear: ['tires', 'rearToe'], caster_front: ['tires', 'frontCaster'],
  spring_front: ['suspension', 'frontSpring'], spring_rear: ['suspension', 'rearSpring'],
  rebound_front: ['suspension', 'frontRebound'], rebound_rear: ['suspension', 'rearRebound'],
  bump_front: ['suspension', 'frontBump'], bump_rear: ['suspension', 'rearBump'],
  arb_front: ['suspension', 'frontARB'], arb_rear: ['suspension', 'rearARB'],
  ride_height_front: ['suspension', 'frontRideHeight'], ride_height_rear: ['suspension', 'rearRideHeight'],
  diff_front_accel: ['drivetrain', 'frontDiffAccel'], diff_front_decel: ['drivetrain', 'frontDiffDecel'],
  diff_rear_accel: ['drivetrain', 'rearDiffAccel'], diff_rear_decel: ['drivetrain', 'rearDiffDecel'],
  diff_center: ['drivetrain', 'diffCenter'], final_drive: ['drivetrain', 'finalDrive'],
  gear_1: ['drivetrain', 'gear1'], gear_2: ['drivetrain', 'gear2'], gear_3: ['drivetrain', 'gear3'],
  gear_4: ['drivetrain', 'gear4'], gear_5: ['drivetrain', 'gear5'], gear_6: ['drivetrain', 'gear6'],
  gear_7: ['drivetrain', 'gear7'], gear_8: ['drivetrain', 'gear8'], gear_9: ['drivetrain', 'gear9'], gear_10: ['drivetrain', 'gear10'],
  brake_balance: ['brakes', 'balance'], brake_pressure: ['brakes', 'pressure'],
  downforce_front: ['aero', 'frontDownforce'], downforce_rear: ['aero', 'rearDownforce']
};

const readTuneValue = (payload, path) => payload?.[path[0]]?.[path[1]];

/** 服务端保存前的统一校验；basePi 以车辆档案为准，totalPi 是用户确认的方案最终 PI。 */
export function validateTunePayload(profile, payload = {}) {
  const mode = payload.generationMode === 'ai' ? 'ai' : (payload.generationMode === 'assisted' ? 'assisted' : 'manual');
  const parts = Object.fromEntries(Object.entries(payload.parts || {}).flatMap(([slotId, selection]) => {
    const optionId = selection?.optionId || selection?.tier;
    return optionId ? [[slotId, { optionId }]] : [];
  }));
  // driveType 表示当前构型的派生结果，不能反向当成车辆原厂驱动。
  // 否则例如原厂后驱置换为四驱后，校验器会把四驱误判为原厂项并过滤掉。
  // 当前驱动必须始终由已保存的 drivetrain_swap 选择推导。
  const resolvedForDrive = resolveUpgradeProfile(profile, parts);
  if (payload.tuningCapabilities && typeof payload.tuningCapabilities === 'object') {
    const capabilityResult = resolveTuningCapabilities(profile, payload.tuningCapabilities, { driveType: payload.driveType });
    resolvedForDrive.tuneParameters = capabilityResult.tuneParameters;
    resolvedForDrive.effectiveDriveType = capabilityResult.capabilities.driveType || resolvedForDrive.effectiveDriveType;
  }
  const buildValidation = validateBuild(profile, parts);
  const build = { ...buildValidation, resolved: resolvedForDrive };
  const errors = [...build.errors];
  const warnings = [];
  if (!profile) return { valid: false, errors, warnings };

  const resolved = build.resolved;
  const allowedParameters = new Map((resolved.tuneParameters || []).map(parameter => [parameter.id, parameter]));
  for (const [parameterId, path] of Object.entries(TUNE_FIELD_PATHS)) {
    const raw = readTuneValue(payload, path);
    if (raw === '' || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors.push(`调教参数必须是数字：${path.join('.')}`);
      continue;
    }
    const parameter = allowedParameters.get(parameterId);
    if (!parameter) {
      continue;
    }
    if (parameter.rangeConfidence !== 'vehicle_specific_unknown' && parameter.range) {
      if (value < parameter.range.min || value > parameter.range.max) errors.push(`调教参数超出游戏范围：${path.join('.')}`);
      const step = Number(parameter.range.step);
      if (step > 0) {
        const steps = (value - Number(parameter.range.min)) / step;
        if (Math.abs(steps - Math.round(steps)) > 1e-6) errors.push(`调教参数不符合游戏调节步进：${path.join('.')}`);
      }
    }
  }

  // 预测总 PI 必须来自同一次完整构建计算；候选配件上的 piEstimate 是
  // “相对当前构型”的边际值，不能再逐项相加。
  const formulaPrediction = resolved.prediction || predictBuildPi(profile, parts, resolved.slots || []);
  const estimate = Number(formulaPrediction.totalPi);
  const upperEstimate = Number(formulaPrediction.maxPi);
  const unknownPiCount = 0;

  const targetPi = Number(payload.targetPi);
  const hasConfirmedPi = payload.piConfirmed === true && payload.totalPi !== '' && payload.totalPi !== null && payload.totalPi !== undefined;
  const confirmedPi = hasConfirmedPi ? Number(payload.totalPi) : estimate;
  if (hasConfirmedPi && (!Number.isInteger(confirmedPi) || confirmedPi < 100 || confirmedPi > 999)) {
    errors.push('方案 PI 必须是 100 到 999 之间的整数。');
  }
  const validTargets = new Set([500, 600, 700, 800, 900, 998, 999]);
  if (mode === 'ai' && !validTargets.has(targetPi)) errors.push('AI 目标 PI 等级无效。');
  if (mode === 'ai') {
    const essentialByRace = {
      dirt: [['tires_compound', 'rally'], ['suspension', 'rally']],
      cross_country: [['tires_compound', 'offroad'], ['suspension', 'offroad']],
      drift: [['suspension', 'drift'], ['differential', 'drift']]
    };
    for (const [slotId, optionId] of essentialByRace[payload.raceType] || []) {
      const selectedOption = resolved.slots?.find(slot => slot.id === slotId)?.options?.find(item => item.id === optionId);
      if (parts[slotId]?.optionId !== optionId) errors.push(`AI ${payload.raceType} 方案缺少已确认的核心配件：${slotId}/${optionId}`);
    }
  }
  if (mode === 'ai' && upperEstimate !== null) {
    if (upperEstimate > targetPi) warnings.push(`AI 方案的保守 PI 上界 ${upperEstimate} 超过目标等级上限 ${targetPi}。`);
  } else if (mode === 'manual' && unknownPiCount > 0) {
    warnings.push(`有 ${unknownPiCount} 个配件缺少 PI，无法验证最终等级。`);
  }
  if (mode === 'ai' && Number.isFinite(confirmedPi) && confirmedPi > targetPi) warnings.push(`用户确认的最终 PI ${confirmedPi} 超过 AI 目标等级 ${targetPi}。`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resolved,
    normalizedParts: Object.fromEntries(Object.entries(parts).filter(([slotId, selection]) => {
      if (selection.optionId === 'stock') return false;
      return resolved.slots?.find(slot => slot.id === slotId)?.options?.some(option => option.id === selection.optionId);
    })),
    computed: { basePi: Number(profile.basePi) || null, estimate, upperEstimate, unknownPiCount, confirmedPi, status: hasConfirmedPi ? 'user_confirmed' : 'formula_v1', modelVersion: formulaPrediction.modelVersion, featureCoverage: formulaPrediction.featureCoverage, uncertainty: formulaPrediction.uncertainty }
  };
}
