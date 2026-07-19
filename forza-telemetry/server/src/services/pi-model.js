import { sqliteDb } from '../storage/sqlite-db.js';
import piObservations from '../config/pi-observations.json' with { type: 'json' };

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

function selectionSignature(selections = {}) {
  return Object.entries(selections)
    .map(([slotId, selection]) => [slotId, selection?.optionId || selection?.tier || 'stock'])
    .filter(([, optionId]) => optionId !== 'stock')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slotId, optionId]) => `${slotId}=${optionId}`)
    .join('|');
}

function findExactObservation(profile, selections) {
  const vehicleId = String(profile?.id || profile?.vehicleId || '');
  const signature = selectionSignature(selections);
  const fileObservation = (piObservations.observations || []).find((sample) =>
    String(sample.vehicleId) === vehicleId && selectionSignature(Object.fromEntries(Object.entries(sample.parts || {}).map(([slotId, optionId]) => [slotId, { optionId }]))) === signature
  );
  if (fileObservation) return fileObservation;
  const storedObservation = sqliteDb.getPiObservation(vehicleId, signature);
  if (!storedObservation) return null;
  return {
    vehicleId,
    confirmedPi: storedObservation.confirmed_pi,
    source: storedObservation.source || '玩家游戏内实测',
    estimatedPi: storedObservation.estimated_pi,
    observedAt: storedObservation.observed_at
  };
}

function findComponentObservation(profile, slotId, optionId) {
  const vehicleId = String(profile?.id || profile?.vehicleId || '');
  return (piObservations.componentObservations || []).find(sample =>
    String(sample.vehicleId) === vehicleId && sample.slotId === slotId && sample.optionId === optionId
  ) || null;
}

function componentPopulationEstimate(profile, slotId, optionId) {
  const features = piObservations.vehicleFeatures || {};
  const target = {
    driveType: profile?.baseDriveType || 'awd',
    basePi: finite(profile?.basePi, 600),
    massKg: finite(profile?.stockSpecs?.massKg, 1450)
  };
  const samples = (piObservations.componentObservations || [])
    .filter(sample => sample.slotId === slotId && sample.optionId === optionId && Number.isFinite(Number(sample.pi)))
    .map(sample => {
      const sampleFeatures = features[String(sample.vehicleId)] || {};
      const baseDistance = Math.abs(finite(sampleFeatures.basePi, target.basePi) - target.basePi);
      const massDistance = Math.abs(finite(sampleFeatures.massKg, target.massKg) - target.massKg);
      let weight = 1;
      if (sampleFeatures.driveType === target.driveType) weight += 2.5;
      if (baseDistance <= 75) weight += 1.5;
      else if (baseDistance <= 150) weight += 0.75;
      if (massDistance <= 250) weight += 0.5;
      return { pi: Number(sample.pi), weight };
    });
  if (samples.length < 3) return null;
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const point = samples.reduce((sum, sample) => sum + sample.pi * sample.weight, 0) / totalWeight;
  const variance = samples.reduce((sum, sample) => sum + sample.weight * (sample.pi - point) ** 2, 0) / totalWeight;
  return { pi: Math.round(point), sampleCount: samples.length, spread: Math.sqrt(variance) };
}

function resolveComponentPi(profile, stock, slotId, option) {
  const observed = findComponentObservation(profile, slotId, option.id);
  if (observed) return { pi: Number(observed.pi), source: 'game_observed', confidence: 'exact_observed', sampleCount: 1, spread: 0 };
  const population = componentPopulationEstimate(profile, slotId, option.id);
  if (population) return { ...population, source: 'population_calibrated', confidence: 'calibrated_model' };
  return { pi: fixedOptionDelta(stock, slotId, option), source: 'formula_v1', confidence: 'model_estimate', sampleCount: 0, spread: null };
}

export function makeStockState(profile = {}) {
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

export function applyOption(state, slotId, option = {}, baseState) {
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
  if (slotId === 'tires_width_front') {
    const val = Number(id.replace('plus_', '').replace('minus_', '')) || 0;
    const sign = id.startsWith('minus_') ? -1 : 1;
    next.frontWidth = baseState.frontWidth + sign * val * 10;
  }
  if (slotId === 'tires_width_rear') {
    const val = Number(id.replace('plus_', '').replace('minus_', '')) || 0;
    const sign = id.startsWith('minus_') ? -1 : 1;
    next.rearWidth = baseState.rearWidth + sign * val * 10;
  }
  if (slotId === 'rims_weight' && Number.isFinite(Number(option.weightDeltaKg))) next.massKg += Number(option.weightDeltaKg);
  if (slotId === 'rim_size_front' || slotId === 'rim_size_rear') {
    if (id.startsWith('plus_')) next.massKg += (Number(id.replace('plus_', '')) || 0) * 1.2;
    else if (id.startsWith('minus_')) next.massKg -= (Number(id.replace('minus_', '')) || 0) * 1.2;
  }
  if (slotId === 'track_width_front' || slotId === 'track_width_rear') next.handling += (Number(id.replace('wide_', '')) || 0) * 0.018;
  if (slotId === 'drivetrain_swap' && option.driveType) {
    next.driveType = option.driveType;
    next.massKg += option.driveType === 'awd' ? 55 : -12;
  }
  if (slotId === 'front_aero') {
    next.aero += id === 'adjustable' ? 0.08 : 0.04;
  }
  if (slotId === 'rear_aero') {
    next.aero += id === 'adjustable' ? -0.18 : 0.0;
    next.topSpeedKph *= id === 'adjustable' ? 0.965 : 0.994;
  }
  if (slotId === 'brakes') next.brake += level * 0.055;
  if (slotId === 'suspension') next.handling += (id === 'rally' || id === 'offroad' ? 0.02 : 0.005) * Math.max(1, level || 2);
  if (slotId === 'anti_roll_bar_front' || slotId === 'anti_roll_bar_rear') next.handling += 0.001;
  if (slotId === 'differential') next.handling += 0.001 * Math.max(1, level || 2);
  if (slotId === 'transmission') next.shift += 0.001 * Math.max(1, level);
  if (slotId === 'clutch' || slotId === 'driveline') next.shift += 0.001 * Math.max(1, level);
  if (slotId === 'roll_cage') {
    next.massKg += 15 * Math.max(1, level);
    next.handling += 0.007 * Math.max(1, level); // 扭转刚度带来的 Handling 物理补偿
  }
  return next;
}

function scoreState(state, stock) {
  const basePi = stock.basePi || 500;
  
  // 1. 绝对马力推重比提升 (FH5 核心马力 PI 模型)
  const stockPowerRatio = stock.powerHp / stock.massKg;
  const currentPowerRatio = state.powerHp / state.massKg;
  const deltaPowerRatio = currentPowerRatio - stockPowerRatio;
  
  // 引入 0.62 缩放因子将马力 PI 校准到游戏真实范围，并针对中小马力车型引入非线性马力折扣
  const powerScale = 420 + Math.max(0, basePi - 400) * 1.15;
  const powerRatioDiscount = Math.min(1.0, 0.4 + (stock.powerHp / 450) * 0.6);
  // 引入非线性幂次函数对大马力推重比提升进行边际收益衰减 (符合大马力下 PI 边际效应骤减规律)
  let powerPi = deltaPowerRatio * powerScale * 0.51 * powerRatioDiscount;
  
  const hpDelta = state.powerHp - stock.powerHp;
  if (hpDelta > 0) {
    powerPi += (hpDelta / stock.powerHp) * 3.6 * (1 + (basePi - 300) * 0.0012);
  }

  // 2. 减重与被动增重 (Weight delta) 贡献 of PI
  const massPi = state.massKg > stock.massKg ? (stock.massKg - state.massKg) * 0.08 : 0;

  // 3. 轮胎材质与抓地力 (Grip) PI 贡献
  const gripDelta = state.grip - stock.grip;
  let gripPi = gripDelta * 27.0 * (1 + (basePi - 300) * 0.0015);

  // 胎宽提升与后轮减分效应校准
  const frontWidthDelta = state.frontWidth - stock.frontWidth;
  const rearWidthDelta = state.rearWidth - stock.rearWidth;
  if (frontWidthDelta > 0) gripPi += (frontWidthDelta / 10) * 1.8;
  
  if (rearWidthDelta > 0) {
    if (state.driveType === 'awd') {
      gripPi += (rearWidthDelta / 10) * -0.15;
    } else {
      gripPi += (rearWidthDelta / 10) * 0.5;
    }
  }

  // 4. 其他底盘改装件贡献
  const aeroPi = (state.aero - stock.aero) * 38;
  const brakePi = (state.brake - stock.brake) * 48;
  const handlingPi = (state.handling - stock.handling) * 84;
  const shiftPi = (state.shift - stock.shift) * 130;

  // 5. 驱动置换 (Drivetrain Swap)
  let driveSwapPi = 0;
  if (state.driveType === 'awd' && stock.driveType !== 'awd') {
    driveSwapPi = 3 + (stock.powerHp / stock.massKg) * 35;
  } else if (state.driveType !== 'awd' && stock.driveType === 'awd') {
    driveSwapPi = -15;
  }

  return powerPi + massPi + gripPi + aeroPi + brakePi + handlingPi + shiftPi + driveSwapPi;
}

export function fixedOptionDelta(stock, slotId, option) {
  if (!option || option.id === 'stock') return 0;
  return Math.round(scoreState(applyOption({ ...stock }, slotId, option, stock), stock));
}

export function predictBuildPi(profile, selections, slots, ignoreBias = false) {
  const stock = makeStockState(profile);
  const basePi = finite(profile.basePi, 500);
  const exactObservation = findExactObservation(profile, selections);
  if (exactObservation) {
    return {
      totalPi: exactObservation.confirmedPi,
      minPi: exactObservation.confirmedPi,
      maxPi: exactObservation.confirmedPi,
      deltaFromStock: exactObservation.confirmedPi - basePi,
      featureCoverage: 100,
      uncertainty: 0,
      modelVersion: 'observed-build-v1',
      usedPriors: false,
      source: exactObservation.source
    };
  }

  // 原厂构型是 PI 模型的锚点：只要没有任何非原厂选项，结果必须严格
  // 等于车辆档案的原厂 PI，不能让经验先验或驱动状态把原厂车算低。
  const hasNonStockSelection = (slots || []).some(slot => {
    const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
    return optionId !== 'stock';
  });
  if (!hasNonStockSelection) {
    const coverage = Math.round((stock.knownFields / 6) * 100);
    return {
      totalPi: basePi,
      minPi: clamp(basePi - (stock.usedPriors ? 7 : 0), 100, 999),
      maxPi: clamp(basePi + (stock.usedPriors ? 7 : 0), 100, 999),
      deltaFromStock: 0,
      featureCoverage: coverage,
      uncertainty: stock.usedPriors ? 7 : 0,
      modelVersion: 'formula-v1',
      usedPriors: stock.usedPriors
    };
  }

  // 1. 统一 PI 口径：原厂 PI + 每个已选配件从原厂状态计算出的固定增量。
  // 这样候选卡片、整车预估和保存校验使用同一套数字，避免把单件 PI 与
  // 整车非线性重算混用，造成用户看到的增量无法复算。
  let additiveDelta = 0;
  let uncertaintySquared = stock.usedPriors ? 16 : 0;
  if (slots && selections) {
    for (const slot of slots) {
      const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
      const option = slot.options?.find(item => item.id === optionId);
      if (option && optionId !== 'stock') {
        const component = resolveComponentPi(profile, stock, slot.id, option);
        additiveDelta += component.pi;
        const componentUncertainty = component.confidence === 'exact_observed'
          ? 0
          : component.confidence === 'calibrated_model'
            ? Math.max(1, component.spread || 1)
            : 7 + Math.abs(component.pi) * 0.04;
        uncertaintySquared += componentUncertainty ** 2;
      }
    }
  }

  // 2. 从 SQLite 加载配件对应的 bias 校准偏置并累加
  const vehicleId = profile.id || profile.vehicleId || '';
  const calibrations = vehicleId ? sqliteDb.getPiCalibrations(vehicleId) : [];
  const biasMap = ignoreBias ? new Map() : new Map(calibrations.map(c => [`${c.slot_id}/${c.option_id}`, c.bias_pi]));

  let sumBias = 0;
  if (slots && selections) {
    for (const slot of slots) {
      const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
      const bias = biasMap.get(`${slot.id}/${optionId}`) || 0;
      sumBias += bias;
    }
  }

  const totalPi = clamp(Math.round(basePi + additiveDelta + sumBias), 100, 999);
  const coverage = Math.round((stock.knownFields / 6) * 100);
  const uncertainty = clamp(Math.round(Math.sqrt(uncertaintySquared)), 0, 30);
  
  return {
    totalPi, minPi: clamp(totalPi - uncertainty, 100, 999), maxPi: clamp(totalPi + uncertainty, 100, 999),
    deltaFromStock: totalPi - basePi, featureCoverage: coverage, uncertainty, modelVersion: 'calibrated-components-v2', usedPriors: stock.usedPriors
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
    const component = resolveComponentPi(profile, stock, slot.id, option);
    const baseDelta = component.pi;
    const bias = biasMap.get(`${slot.id}/${option.id}`) || 0;
    const delta = baseDelta + bias;

    const optionUncertainty = component.confidence === 'exact_observed'
      ? 0
      : clamp(Math.round(3 + (component.spread || 0) + (100 - Math.round((stock.knownFields / 6) * 100)) * 0.05 + Math.abs(delta) * 0.035), 3, 16);
    return {
      ...option,
      piEstimate: delta,
      piDeltaFromCurrent: delta,
      piDeltaFromStock: delta,
      piUpperEstimate: delta + optionUncertainty,
      piSource: bias !== 0 ? 'sqlite_calibrated' : component.source,
      piConfidence: bias !== 0 ? 'exact_calibrated' : component.confidence,
      piPrediction: { point: delta, min: delta - optionUncertainty, max: delta + optionUncertainty, basis: component.confidence === 'exact_observed' ? '游戏单项实测' : (bias !== 0 ? '自学习校准融合' : component.confidence === 'calibrated_model' ? `同类车型 ${component.sampleCount} 条实测校准` : '车型绝对公式'), contextDependent: component.confidence !== 'exact_observed', ruleVersion: prediction.modelVersion }
    };
  }) }));
  return { prediction, slots: scoredSlots };
}
