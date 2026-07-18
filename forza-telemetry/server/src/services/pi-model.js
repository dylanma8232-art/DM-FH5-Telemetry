import { sqliteDb } from '../storage/sqlite-db.js';

/**
 * 公式 PI 预测器。
 *
 * FH5 没有公开逐件 PI 表；这里以官方原厂 PI 为锚点，先将完整改装方案投影为
 * 车辆状态，再计算相对原厂的能力变化。每个“车型 × 配件”只从原厂状态
 * 计算一次固定 PI，最终 PI 就是官方原厂 PI 加上所有已选固定值。
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const logRatio = (next, base) => Math.log(Math.max(0.01, next) / Math.max(0.01, base));

const TIER_INDEX = { stock: 0, street: 1, sport: 2, race: 3, extreme: 4 };
const TIRE_GRIP = { stock: 0, street: 0.15, sport: 0.5, semi_slick: 0.95, slick: 1.45, vintage_race: 0.75, rally: 0.8, offroad: 0.62, drift: 0.25, drag: 0.42, snow: 0.5 };
const POWER_SLOT_GAIN = {
  engine_intake: 0.018, engine_intake_manifold: 0.028, engine_fuel_system: 0.03,
  engine_ignition: 0.014, exhaust: 0.027, engine_camshaft: 0.055,
  engine_valves: 0.026, engine_displacement: 0.045, engine_pistons: 0.04,
  engine_forced_induction: 0.07, engine_intercooler: 0.025, engine_oil_cooling: 0.008,
  engine_flywheel: 0.006, electric_motor: 0.055
};

function makeStockState(profile = {}) {
  const pi = finite(profile.basePi, 500);
  const spec = profile.stockSpecs || {};
  // 没有完整原厂规格时采用显式先验；这会降低 coverage 并扩大误差带。
  const powerHp = finite(spec.powerHp, clamp(70 + (pi - 350) * 1.85, 70, 950));
  const massKg = finite(spec.massKg, clamp(1525 - (pi - 500) * 0.72, 780, 1900));
  const torqueNm = finite(spec.torqueNm, finite(spec.torqueLbFt, powerHp * 0.86) * (spec.torqueLbFt ? 1.35582 : 1));
  const frontWidth = finite(spec.frontTireWidthMm, clamp(175 + (pi - 400) * 0.14, 165, 315));
  const rearWidth = finite(spec.rearTireWidthMm, clamp(frontWidth + (profile.baseDriveType === 'rwd' ? 20 : 0), 165, 345));
  const topSpeedKph = finite(spec.topSpeedKph, clamp(150 + (pi - 350) * 0.32, 150, 410));
  const known = ['powerHp', 'massKg', 'torqueNm', 'frontTireWidthMm', 'rearTireWidthMm', 'topSpeedKph']
    .filter(key => Number.isFinite(Number(spec[key]))).length;
  return {
    powerHp, torqueNm, massKg, frontWidth, rearWidth, topSpeedKph,
    grip: finite(spec.tireGrip, 0), aero: finite(spec.aero, 0), brake: finite(spec.brake, 0),
    handling: finite(spec.handling, 0), shift: 0, driveType: profile.baseDriveType || 'awd',
    knownFields: known, usedPriors: known < 6,
    basePi: pi
  };
}

function tier(optionId) { return TIER_INDEX[optionId] ?? 0; }

function applyOption(state, slotId, option = {}, baseState) {
  if (!option || option.id === 'stock') return state;
  const next = { ...state };
  const id = option.id;
  const level = tier(id);
  const powerGain = POWER_SLOT_GAIN[slotId];
  if (powerGain) {
    const gain = powerGain * Math.max(1, level);
    next.powerHp *= 1 + gain;
    next.torqueNm *= 1 + gain * 0.82;
  }
  if (slotId === 'engine_swap' && Number.isFinite(Number(option.engineCandidates?.[0]?.powerHp || option.powerHp || option.sourceValue))) {
    const hp = finite(option.engineCandidates?.[0]?.powerHp || option.powerHp || option.sourceValue, next.powerHp);
    next.powerHp = hp;
    next.torqueNm = finite(option.engineCandidates?.[0]?.torqueLbFt, hp * 0.86) * (option.engineCandidates?.[0]?.torqueLbFt ? 1.35582 : 1);
    next.massKg += clamp((hp - baseState.powerHp) * 0.035, -25, 85);
  }
  if (slotId === 'aspiration_swap') {
    const multiplier = { aspiration_t: 1.13, aspiration_tt: 1.2, aspiration_pds: 1.16, aspiration_cs: 1.14, aspiration_na: 0.98 }[id] ?? 1;
    next.powerHp *= multiplier; next.torqueNm *= 1 + (multiplier - 1) * 0.8; next.massKg += multiplier > 1 ? 18 : 0;
  }
  if (slotId === 'weight_reduction') {
    const reduction = { street: 0.055, sport: 0.11, race: 0.18 }[id] ?? 0;
    next.massKg *= 1 - reduction; next.brake += reduction * 0.5; next.handling += reduction * 0.35;
  }
  if (slotId === 'electric_battery') {
    const gain = 0.025 * Math.max(1, level);
    next.powerHp *= 1 + gain;
    next.massKg *= 1 - 0.012 * Math.max(1, level);
  }
  if (slotId === 'tires_compound') next.grip += TIRE_GRIP[id] ?? 0.2;
  if (slotId === 'tires_width_front' && option.widthMm) next.frontWidth = Number(option.widthMm);
  if (slotId === 'tires_width_rear' && option.widthMm) next.rearWidth = Number(option.widthMm);
  if (slotId === 'rims_weight' && Number.isFinite(Number(option.weightDeltaKg))) next.massKg += Number(option.weightDeltaKg);
  if (slotId === 'rim_size_front' || slotId === 'rim_size_rear') next.massKg += Math.max(0, Number(id.replace('plus_', '')) || 0) * 1.2;
  if (slotId === 'track_width_front' || slotId === 'track_width_rear') next.handling += (Number(id.replace('wide_', '')) || 0) * 0.018;
  if (slotId === 'drivetrain_swap' && option.driveType) {
    next.driveType = option.driveType;
    next.massKg += option.driveType === 'awd' ? 55 : -12;
  }
  if (slotId === 'front_aero' || slotId === 'rear_aero') {
    next.aero += id === 'adjustable' ? 0.13 : 0.07;
    next.topSpeedKph *= id === 'adjustable' ? 0.988 : 0.994;
  }
  if (slotId === 'brakes') next.brake += level * 0.055;
  if (slotId === 'suspension') next.handling += (id === 'rally' || id === 'offroad' ? 0.07 : 0.055) * Math.max(1, level || 2);
  if (slotId === 'anti_roll_bar_front' || slotId === 'anti_roll_bar_rear') next.handling += 0.035;
  if (slotId === 'differential') next.handling += 0.018 * Math.max(1, level || 2);
  if (slotId === 'transmission') next.shift += 0.018 * Math.max(1, level || (id.startsWith('race') ? 3 : 1));
  if (slotId === 'clutch' || slotId === 'driveline') next.shift += 0.01 * Math.max(1, level);
  if (slotId === 'roll_cage') { next.massKg += 18 * Math.max(1, level); next.handling += 0.015 * Math.max(1, level); }
  return next;
}

function scoreState(state, stock) {
  const basePi = stock.basePi || 500;
  
  // 1. 绝对马力推重比提升 (FH5 核心马力 PI 模型)
  const stockPowerRatio = stock.powerHp / stock.massKg;
  const currentPowerRatio = state.powerHp / state.massKg;
  const deltaPowerRatio = currentPowerRatio - stockPowerRatio;
  
  // FH5 里随着车辆本身 PI (底盘性能) 增高，马力对应的 PI 增幅呈非线性放大
  const powerScale = 420 + Math.max(0, basePi - 400) * 1.15;
  let powerPi = deltaPowerRatio * powerScale;
  
  // 确保有一个绝对的马力增幅底线
  const hpDelta = state.powerHp - stock.powerHp;
  if (hpDelta > 0) {
    powerPi += (hpDelta / stock.powerHp) * 15 * (1 + (basePi - 300) * 0.0012);
  }

  // 2. 减重 (Weight Reduction) 贡献的 PI 分数
  const deltaMass = stock.massKg - state.massKg;
  let massPi = 0;
  if (deltaMass > 0) {
    const massRatio = deltaMass / stock.massKg;
    // FH5 中减重对越轻/高级的车加 PI 越多
    massPi = massRatio * 320 * (1 + (basePi - 400) * 0.0018);
  }

  // 3. 轮胎材质与抓地力 (Grip) PI 贡献
  const gripDelta = state.grip - stock.grip;
  // 赛车胎 1.45 grip 对应约 85-110 PI 的提升
  let gripPi = gripDelta * 65 * (1 + (basePi - 300) * 0.0015);

  // 胎宽提升
  const frontWidthDelta = state.frontWidth - stock.frontWidth;
  const rearWidthDelta = state.rearWidth - stock.rearWidth;
  if (frontWidthDelta > 0) gripPi += (frontWidthDelta / 10) * 2.2;
  if (rearWidthDelta > 0) gripPi += (rearWidthDelta / 10) * 3.5;

  // 4. 其他底盘改装件贡献 (直接与升级程度 linear/nonlinear 映射)
  const aeroPi = (state.aero - stock.aero) * 50;
  const brakePi = (state.brake - stock.brake) * 75;
  const handlingPi = (state.handling - stock.handling) * 110;
  const shiftPi = (state.shift - stock.shift) * 90;

  // 5. 驱动置换 (Drivetrain Swap)
  let driveSwapPi = 0;
  if (state.driveType === 'awd' && stock.driveType !== 'awd') {
    // 后驱/前驱改四驱：大马力车加的极多，小马力车只加 15-20 PI
    driveSwapPi = 18 + (stock.powerHp / stock.massKg) * 60;
  } else if (state.driveType !== 'awd' && stock.driveType === 'awd') {
    // 四驱改后驱：通常会扣减 10-20 PI
    driveSwapPi = -18;
  }

  return powerPi + massPi + gripPi + aeroPi + brakePi + handlingPi + shiftPi + driveSwapPi;
}

function fixedOptionDelta(stock, slotId, option) {
  if (!option || option.id === 'stock') return 0;
  let baseBonus = 0;
  if (slotId === 'engine_swap') {
    baseBonus = 15; // 引擎置换底盘调校基础补偿
  }
  return Math.round(scoreState(applyOption({ ...stock }, slotId, option, stock), stock) + baseBonus);
}

export function predictBuildPi(profile, selections, slots) {
  const stock = makeStockState(profile);
  const basePi = finite(profile.basePi, 500);

  // 从 SQLite 加载该车型的配件偏置校准
  const vehicleId = profile.id || profile.vehicleId || '';
  const calibrations = vehicleId ? sqliteDb.getPiCalibrations(vehicleId) : [];
  const biasMap = new Map(calibrations.map(c => [`${c.slot_id}/${c.option_id}`, c.bias_pi]));

  const deltaFromStock = (slots || []).reduce((total, slot) => {
    const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
    const baseDelta = fixedOptionDelta(stock, slot.id, slot.options?.find(item => item.id === optionId));
    const bias = biasMap.get(`${slot.id}/${optionId}`) || 0;
    return total + baseDelta + bias;
  }, 0);

  const totalPi = clamp(Math.round(basePi + deltaFromStock), 100, 999);
  const coverage = Math.round((stock.knownFields / 6) * 100);
  const uncertainty = clamp(Math.round(7 + (100 - coverage) * 0.16 + Math.abs(deltaFromStock) * 0.045), 7, 30);
  return {
    totalPi, minPi: clamp(totalPi - uncertainty, 100, 999), maxPi: clamp(totalPi + uncertainty, 100, 999),
    deltaFromStock: totalPi - basePi, featureCoverage: coverage, uncertainty, modelVersion: 'formula-v1', usedPriors: stock.usedPriors
  };
}

export function applyPiPredictions(profile, selections, slots) {
  const prediction = predictBuildPi(profile, selections, slots);
  const stock = makeStockState(profile);

  // 从 SQLite 加载该车型的配件偏置校准
  const vehicleId = profile.id || profile.vehicleId || '';
  const calibrations = vehicleId ? sqliteDb.getPiCalibrations(vehicleId) : [];
  const biasMap = new Map(calibrations.map(c => [`${c.slot_id}/${c.option_id}`, c.bias_pi]));

  const scoredSlots = slots.map(slot => ({ ...slot, options: (slot.options || []).map(option => {
    const baseDelta = fixedOptionDelta(stock, slot.id, option);
    const bias = biasMap.get(`${slot.id}/${option.id}`) || 0;
    const delta = baseDelta + bias;

    const optionUncertainty = clamp(Math.round(3 + (100 - Math.round((stock.knownFields / 6) * 100)) * 0.08 + Math.abs(delta) * 0.035), 3, 16);
    return {
      ...option,
      piEstimate: delta,
      piDeltaFromCurrent: delta,
      piDeltaFromStock: delta,
      piUpperEstimate: delta + optionUncertainty,
      piSource: bias !== 0 ? 'sqlite_calibrated' : 'formula_v1', 
      piConfidence: bias !== 0 ? 'exact_calibrated' : 'model_estimate',
      piPrediction: { point: delta, min: delta - optionUncertainty, max: delta + optionUncertainty, basis: bias !== 0 ? '自学习校准融合' : '车型绝对公式', contextDependent: false, ruleVersion: prediction.modelVersion }
    };
  }) }));
  return { prediction, slots: scoredSlots };
}
