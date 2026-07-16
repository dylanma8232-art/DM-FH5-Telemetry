const option = (id, label, piEstimate = 0, extra = {}) => ({ id, label, piEstimate, ...extra });
const levels = (street = 2, sport = 4, race = 7) => [
  option('stock', '原厂', 0), option('street', '街道级', street), option('sport', '运动级', sport), option('race', '竞赛级', race)
];

const COMMON_SLOTS = [
  {
    id: 'drivetrain_swap',
    label: '驱动置换',
    group: '置换',
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
  { id: 'brakes', label: '刹车', group: '平台与操控', options: [option('stock', '原厂'), option('street', '街道级不可调', 1), option('sport', '运动级不可调', 2), option('race', '竞赛级可调', 4, { adjustable: true })] },
  { id: 'suspension', label: '悬挂', group: '平台与操控', options: [option('stock', '原厂'), option('street', '街道悬挂不可调', 2), option('sport', '运动悬挂不可调', 4), option('race', '竞赛悬挂可调', 6, { adjustable: true }), option('rally', '拉力悬挂可调', 5, { adjustable: true }), option('drift', '漂移悬挂可调', 5, { adjustable: true }), option('offroad', '越野悬挂可调', 5, { adjustable: true })] },
  { id: 'anti_roll_bar_front', label: '前防倾杆', group: '平台与操控', options: [option('stock', '原厂'), option('race', '竞赛级可调', 1, { adjustable: true })] },
  { id: 'anti_roll_bar_rear', label: '后防倾杆', group: '平台与操控', options: [option('stock', '原厂'), option('race', '竞赛级可调', 1, { adjustable: true })] },
  { id: 'roll_cage', label: '防滚架', group: '平台与操控', options: levels(-2, -5, -8) },
  { id: 'weight_reduction', label: '车身减重', group: '平台与操控', options: levels(6, 16, 28) },
  { id: 'clutch', label: '离合器', group: '传动系统', options: levels(0, 1, 2) },
  { id: 'transmission', label: '变速箱', group: '传动系统', options: [option('stock', '原厂'), option('street', '街道级不可调', 1), option('sport', '运动级，可调终传比', 2, { adjustableFinalDrive: true }), option('race_standard', '标准竞赛级可调', 3, { gearCount: 6, gearCountConfidence: 'unknown', adjustable: true }), option('drift_4', '四速漂移变速箱可调', 3, { gearCount: 4, adjustable: true }), option('race_6', '竞赛六速可调', 3, { gearCount: 6, adjustable: true }), option('race_7', '竞赛七速可调', 4, { gearCount: 7, adjustable: true }), option('race_8', '竞赛八速可调', 5, { gearCount: 8, adjustable: true }), option('race_9', '竞赛九速可调', 6, { gearCount: 9, adjustable: true }), option('race_10', '竞赛十速可调', 7, { gearCount: 10, adjustable: true })] },
  { id: 'driveline', label: '传动轴', group: '传动系统', options: levels(0, 1, 2) },
  { id: 'differential', label: '差速器', group: '传动系统', options: [option('stock', '原厂'), option('sport', '运动级可调', 1, { adjustable: true }), option('race', '竞赛级可调', 2, { adjustable: true }), option('rally', '拉力差速器可调', 2, { adjustable: true }), option('offroad', '越野差速器可调', 2, { adjustable: true }), option('drift', '漂移差速器可调', 2, { adjustable: true })] },
  { id: 'tires_compound', label: '轮胎配方', group: '轮胎与轮毂', options: [option('stock', '原厂'), option('street', '街道胎', 4), option('sport', '运动胎', 9), option('semi_slick', '半热熔胎', 16), option('slick', '热熔胎', 22), option('vintage_race', '复古赛车胎', 14), option('rally', '拉力胎', 12), option('offroad', '越野胎', 10), option('drift', '漂移胎', 10), option('drag', '直线加速胎', 8), option('snow', '雪地胎', 7)] },
  { id: 'tires_width_front', label: '前轮胎宽度', group: '轮胎与轮毂', options: [option('stock', '原厂'), ...Array.from({ length: 6 }, (_, index) => option(`wide_${index + 1}`, `加宽 ${index + 1} 级`, (index + 1) * 2))] },
  { id: 'tires_width_rear', label: '后轮胎宽度', group: '轮胎与轮毂', options: [option('stock', '原厂'), ...Array.from({ length: 6 }, (_, index) => option(`wide_${index + 1}`, `加宽 ${index + 1} 级`, (index + 1) * 2))] },
  { id: 'rims_weight', label: '轮毂重量', group: '轮胎与轮毂', options: [option('stock', '原厂重量'), ...Array.from({ length: 40 }, (_, index) => index < 20 ? option(`minus_${20 - index}`, `减轻 ${20 - index} 千克`, Math.max(0, Math.round((20 - index) / 7)), { weightDeltaKg: -(20 - index) }) : option(`plus_${index - 19}`, `增加 ${index - 19} 千克`, -Math.max(0, Math.round((index - 19) / 7)), { weightDeltaKg: index - 19 }))] },
  { id: 'rim_size_front', label: '前轮毂尺寸', group: '轮胎与轮毂', options: [option('stock', '原厂'), ...Array.from({ length: 5 }, (_, index) => option(`plus_${index + 1}`, `增大 ${index + 1} 级`, index + 1))] },
  { id: 'rim_size_rear', label: '后轮毂尺寸', group: '轮胎与轮毂', options: [option('stock', '原厂'), ...Array.from({ length: 5 }, (_, index) => option(`plus_${index + 1}`, `增大 ${index + 1} 级`, index + 1))] },
  { id: 'track_width_front', label: '前轮距', group: '轮胎与轮毂', options: [option('stock', '原厂'), option('wide_1', '加宽一级', 1), option('wide_2', '加宽二级', 2), option('wide_3', '加宽三级', 3)] },
  { id: 'track_width_rear', label: '后轮距', group: '轮胎与轮毂', options: [option('stock', '原厂'), option('wide_1', '加宽一级', 1), option('wide_2', '加宽二级', 2), option('wide_3', '加宽三级', 3)] },
  { id: 'front_aero', label: '前部空气动力学', group: '空气动力学', options: [option('stock', '原厂前部'), option('fixed', '固定前部件', 0, { adjustable: false }), option('adjustable', '可调前部件', 0, { adjustable: true })] },
  { id: 'rear_aero', label: '尾翼', group: '空气动力学', options: [option('stock', '原厂尾翼'), option('fixed', '固定尾翼', 0, { adjustable: false }), option('adjustable', '可调尾翼', 0, { adjustable: true })] }
];

// 手动模式保留完整枚举；AI 只从这些保守子集中选择。专属件默认不进入 AI。
const AI_SAFE_OPTION_IDS = {
  engine_intake: ['street', 'sport', 'race'], engine_intake_manifold: ['street', 'sport', 'race'],
  engine_fuel_system: ['street', 'sport', 'race'], engine_ignition: ['street', 'sport', 'race'],
  exhaust: ['street', 'sport', 'race'], engine_camshaft: ['street', 'sport', 'race'],
  engine_valves: ['street', 'sport', 'race'], engine_displacement: ['street', 'sport', 'race'],
  engine_pistons: ['street', 'sport', 'race'], engine_oil_cooling: ['street', 'sport', 'race'],
  engine_flywheel: ['street', 'sport', 'race'], brakes: ['street', 'sport', 'race'],
  suspension: ['street', 'sport', 'race'], anti_roll_bar_front: ['race'], anti_roll_bar_rear: ['race'],
  roll_cage: ['street', 'sport', 'race'], weight_reduction: ['street', 'sport', 'race'],
  clutch: ['street', 'sport', 'race'], transmission: ['street', 'sport', 'race_6'],
  driveline: ['street', 'sport', 'race'], differential: ['sport', 'race'],
  tires_compound: ['street', 'sport', 'semi_slick', 'slick'],
  tires_width_front: ['wide_1'], tires_width_rear: ['wide_1'],
  rims_weight: ['minus_5', 'minus_10', 'minus_15'],
  track_width_front: ['wide_1'], track_width_rear: ['wide_1'],
  engine_forced_induction: ['street', 'sport'], engine_intercooler: ['street', 'sport']
};

const tune = (id, min, max, step, when = null, rangeConfidence = 'game_global') => ({ id, range: { min, max, step }, when, rangeConfidence });
function buildCommonSlots(profile, selections) {
  const exclusions = new Set(profile.excludedCommonSlots || []);
  if (profile.commonTemplate === 'electric_road' || profile.stockAspiration === 'e') {
    ['aspiration_swap', 'engine_intake', 'engine_intake_manifold', 'engine_fuel_system', 'engine_ignition', 'exhaust', 'engine_camshaft', 'engine_valves', 'engine_displacement', 'engine_pistons', 'engine_oil_cooling', 'engine_flywheel', 'clutch'].forEach(id => exclusions.add(id));
  }
  const overrides = profile.commonSlotOverrides || {};
  const slots = COMMON_SLOTS.filter(slot => {
    if (exclusions.has(slot.id)) return false;
    const availability = overrides[slot.id]?.availability;
    return availability !== 'verified_absent' && availability !== 'unknown';
  }).map(slot => {
    const override = overrides[slot.id] || {};
    const allowed = override.allowedOptions ? new Set(override.allowedOptions) : null;
    const aiSafe = new Set(override.aiEligibleOptions || AI_SAFE_OPTION_IDS[slot.id] || []);
    const options = slot.options.filter(item => !allowed || item.id === 'stock' || allowed.has(item.id)).map(item => {
      const isSameDrivetrain = slot.id === 'drivetrain_swap' && item.driveType === profile.baseDriveType;
      const actualPiEstimate = isSameDrivetrain ? 0 : (item.piEstimate || 0);
      const hasPiEstimate = actualPiEstimate !== null && actualPiEstimate !== '' && Number.isFinite(Number(actualPiEstimate));

      let upperEstimate = null;
      if (item.id === 'stock' || isSameDrivetrain) {
        upperEstimate = 0;
      } else if (hasPiEstimate) {
        const est = Number(actualPiEstimate);
        upperEstimate = est < 0 ? 0 : Math.max(est, Math.ceil(est * 1.5) + 1);
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
      { id: 'engine_forced_induction', label: '增压器升级', options: levels(3, 7, 12) },
      { id: 'engine_intercooler', label: '中冷器', options: levels(1, 2, 4) }
    ]) {
      const aiSafe = new Set(AI_SAFE_OPTION_IDS[slot.id] || []);
      slots.push({ ...slot, group: '发动机', scope: 'state_dependent', availability: 'inferred_common', options: slot.options.map(item => ({ ...item, aiEligible: item.id !== 'stock' && aiSafe.has(item.id), piConfidence: item.id === 'stock' ? 'exact' : 'bounded_generic_estimate', piUpperEstimate: item.id === 'stock' ? 0 : Math.max(Number(item.piEstimate) || 0, Math.ceil((Number(item.piEstimate) || 0) * 1.5) + 1) })) });
    }
  }
  return slots;
}

function buildTuneParameters(profile, selections, slots, declaredDriveType = null) {
  const parameters = [tune('tire_pressure_front', 15, 55, 0.5), tune('tire_pressure_rear', 15, 55, 0.5)];
  const selectedOption = slotId => slots.find(slot => slot.id === slotId)?.options.find(item => item.id === selections[slotId]?.optionId);
  const suspensionOption = selectedOption('suspension');
  if (suspensionOption?.adjustable || profile.stockAdjustableSuspension) {
    parameters.push(
      tune('tire_camber_front', -5, 5, 0.1), tune('tire_camber_rear', -5, 5, 0.1),
      tune('tire_toe_front', -5, 5, 0.1), tune('tire_toe_rear', -5, 5, 0.1), tune('caster_front', 1, 7, 0.1),
      tune('spring_front', 1, 2000, 0.1, null, 'vehicle_specific_unknown'), tune('spring_rear', 1, 2000, 0.1, null, 'vehicle_specific_unknown'),
      tune('ride_height_front', 1, 50, 0.1, null, 'vehicle_specific_unknown'), tune('ride_height_rear', 1, 50, 0.1, null, 'vehicle_specific_unknown'),
      tune('rebound_front', 1, 20, 0.1), tune('rebound_rear', 1, 20, 0.1),
      tune('bump_front', 1, 20, 0.1), tune('bump_rear', 1, 20, 0.1)
    );
  }
  if (selectedOption('anti_roll_bar_front')?.adjustable || profile.stockAdjustableAntiRollBarFront) parameters.push(tune('arb_front', 1, 65, 0.1));
  if (selectedOption('anti_roll_bar_rear')?.adjustable || profile.stockAdjustableAntiRollBarRear) parameters.push(tune('arb_rear', 1, 65, 0.1));
  const transmissionId = selections.transmission?.optionId || 'stock';
  const transmissionOption = selectedOption('transmission');
  const fullyAdjustableTransmission = transmissionOption?.adjustable === true;
  if (transmissionOption?.adjustableFinalDrive || fullyAdjustableTransmission || profile.stockAdjustableTransmission) parameters.push(tune('final_drive', 1, 6, 0.01));
  if (fullyAdjustableTransmission) {
    const gearCount = slots.find(slot => slot.id === 'transmission')?.options.find(item => item.id === transmissionId)?.gearCount || 6;
    for (let gear = 1; gear <= gearCount; gear++) parameters.push(tune(`gear_${gear}`, 0.5, 6, 0.01, null, 'vehicle_specific_unknown'));
  }
  if (selectedOption('brakes')?.adjustable || profile.stockAdjustableBrakes) {
    parameters.push(tune('brake_balance', 0, 100, 1), tune('brake_pressure', 20, 200, 1));
  }
  if (selectedOption('differential')?.adjustable || profile.stockAdjustableDifferential) {
    const driveSwap = slots.find(slot => slot.id === 'drivetrain_swap')?.options
      ?.find(item => item.id === selections.drivetrain_swap?.optionId);
    const currentDriveType = driveSwap?.driveType || declaredDriveType || profile.baseDriveType;
    if (currentDriveType === 'fwd' || currentDriveType === 'awd') parameters.push(tune('diff_front_accel', 0, 100, 1), tune('diff_front_decel', 0, 100, 1));
    if (currentDriveType === 'rwd' || currentDriveType === 'awd') parameters.push(tune('diff_rear_accel', 0, 100, 1), tune('diff_rear_decel', 0, 100, 1));
    if (currentDriveType === 'awd') parameters.push(tune('diff_center', 0, 100, 1));
  }
  const frontAero = slots.find(slot => slot.id === 'front_aero')?.options.find(item => item.id === selections.front_aero?.optionId);
  const rearAero = slots.find(slot => slot.id === 'rear_aero')?.options.find(item => item.id === selections.rear_aero?.optionId);
  if (frontAero?.adjustable || profile.stockAdjustableAeroFront) parameters.push(tune('downforce_front', 0, 1000, 1, null, 'vehicle_specific_unknown'));
  if (rearAero?.adjustable || profile.stockAdjustableAeroRear) parameters.push(tune('downforce_rear', 0, 1000, 1, null, 'vehicle_specific_unknown'));
  return parameters;
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

    return {
      status: 'unverified',
      message: '该车辆的游戏内改装资料尚未录入，显示通用猜测配件。',
      piStatus: 'bounded_generic_estimate',
      basePi: defaultProfile.basePi,
      baseDriveType: defaultProfile.baseDriveType,
      slots: commonSlots,
      tuneParameters,
      effectiveSelections
    };
  }

  const conversionSlots = new Set(['engine_swap', 'drivetrain_swap', 'aspiration_swap', 'widebody']);
  const specialSlots = (profile.slots || []).map(slot => ({
    ...slot,
    group: conversionSlots.has(slot.id) ? '置换' : slot.group,
    scope: slot.scope || 'vehicle_specific',
    availability: slot.availability || 'source_explicit',
    options: (slot.options || []).filter(option => isConditionMet(option.when, selections))
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

  const tuneParameterMap = new Map();
  for (const parameter of [...buildTuneParameters(profile, effectiveSelections, slots, context.driveType), ...(profile.tuneParameters || []).filter(parameter => isConditionMet(parameter.when, effectiveSelections))]) {
    tuneParameterMap.set(parameter.id, { ...(tuneParameterMap.get(parameter.id) || {}), ...parameter });
  }
  const tuneParameters = [...tuneParameterMap.values()];
  const selectedDriveType = slots.find(slot => slot.id === 'drivetrain_swap')?.options
    ?.find(option => option.id === effectiveSelections.drivetrain_swap?.optionId)?.driveType;

  return {
    status: profile.status || 'draft',
    source: profile.source || [],
    gameVersion: profile.gameVersion || null,
    basePi: profile.basePi || null,
    baseDriveType: profile.baseDriveType || null,
    effectiveDriveType: selectedDriveType || context.driveType || profile.baseDriveType || null,
    commonTemplate: profile.commonTemplate || 'combustion_road',
    piStatus: profile.piStatus || 'unverified',
    slots,
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
  const mode = payload.generationMode === 'ai' ? 'ai' : 'manual';
  const declaredDriveType = ['fwd', 'rwd', 'awd'].includes(payload.driveType) ? payload.driveType : null;
  const parts = Object.fromEntries(Object.entries(payload.parts || {}).flatMap(([slotId, selection]) => {
    const optionId = selection?.optionId || selection?.tier;
    return optionId ? [[slotId, { optionId }]] : [];
  }));
  const resolvedForDrive = resolveUpgradeProfile(profile, parts, { driveType: declaredDriveType });
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
      errors.push(`当前配件没有解锁调教参数：${path.join('.')}`);
      continue;
    }
    if (mode === 'ai' && parameter.rangeConfidence === 'vehicle_specific_unknown') {
      errors.push(`AI 不能填写缺少车辆精确范围的参数：${path.join('.')}`);
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

  let estimate = Number(profile.basePi) || null;
  let upperEstimate = estimate;
  let unknownPiCount = 0;
  for (const slot of resolved.slots || []) {
    const optionId = parts[slot.id]?.optionId || 'stock';
    if (optionId === 'stock') continue;
    const selected = slot.options?.find(option => option.id === optionId);
    if (!selected) continue;
    if (mode === 'ai' && selected.aiEligible !== true) errors.push(`AI 不允许选择低置信配件：${slot.label}/${selected.label}`);
    if (!Number.isFinite(Number(selected.piEstimate))) {
      unknownPiCount++;
      if (mode === 'ai') errors.push(`AI 不能选择 PI 未知的配件：${slot.label}/${selected.label}`);
      continue;
    }
    estimate = estimate === null ? null : estimate + Number(selected.piEstimate);
    const upper = Number.isFinite(Number(selected.piUpperEstimate)) ? Number(selected.piUpperEstimate) : Number(selected.piEstimate);
    upperEstimate = upperEstimate === null ? null : upperEstimate + upper;
  }

  const targetPi = Number(payload.targetPi);
  const hasConfirmedPi = payload.totalPi !== '' && payload.totalPi !== null && payload.totalPi !== undefined;
  const confirmedPi = hasConfirmedPi ? Number(payload.totalPi) : (unknownPiCount ? null : estimate);
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
      if (parts[slotId]?.optionId !== optionId || selectedOption?.aiEligible !== true) errors.push(`AI ${payload.raceType} 方案缺少已确认的核心配件：${slotId}/${optionId}`);
    }
  }
  if (mode === 'ai' && upperEstimate !== null) {
    const safeLimit = targetPi - Math.max(10, Math.ceil(targetPi * 0.02));
    if (upperEstimate > safeLimit) errors.push(`AI 方案的保守 PI 上界 ${upperEstimate} 超过安全上限 ${safeLimit}。`);
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
    computed: { basePi: Number(profile.basePi) || null, estimate, upperEstimate, unknownPiCount, confirmedPi, status: hasConfirmedPi ? 'user_confirmed' : (unknownPiCount ? 'unknown' : profile.piStatus || 'estimated') }
  };
}
