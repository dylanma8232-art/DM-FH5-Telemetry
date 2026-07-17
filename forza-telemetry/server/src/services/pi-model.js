/**
 * 公式 PI 预测器。
 *
 * FH5 没有公开逐件 PI 表；这里以官方原厂 PI 为锚点，先将完整改装方案投影为
 * 车辆状态，再计算相对原厂的能力变化。所有候选件的 PI 均由反事实差分得出，
 * 因此会随当前构型改变，而不是一张固定加分表。
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
    knownFields: known, usedPriors: known < 6
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
  const powerPerMass = state.powerHp / state.massKg;
  const stockPowerPerMass = stock.powerHp / stock.massKg;
  const torquePerMass = state.torqueNm / state.massKg;
  const stockTorquePerMass = stock.torqueNm / stock.massKg;
  const widthGrip = 0.65 * logRatio(state.frontWidth, stock.frontWidth) + 0.2 * logRatio(state.rearWidth, stock.rearWidth);
  const driveGrip = state.driveType === 'awd'
    ? 7.5 * clamp((powerPerMass / 0.32) * (1 - clamp(state.grip / 1.45, 0, 1)), 0, 1.35)
    : state.driveType === 'fwd' ? -3.5 * clamp(powerPerMass / 0.42, 0, 1.4) : 0;
  return 70 * logRatio(powerPerMass, stockPowerPerMass)
    + 12 * logRatio(torquePerMass, stockTorquePerMass)
    - 12 * logRatio(state.massKg, stock.massKg)
    + 18 * logRatio(state.topSpeedKph, stock.topSpeedKph)
    + 85 * ((state.grip - stock.grip) + widthGrip)
    + 25 * (state.aero - stock.aero)
    + 24 * (state.brake - stock.brake)
    + 28 * (state.handling - stock.handling)
    + 35 * (state.shift - stock.shift)
    + driveGrip;
}

function stateForSelections(profile, selections, slots, stock) {
  let state = { ...stock };
  for (const slot of slots) {
    const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
    const option = slot.options?.find(item => item.id === optionId);
    state = applyOption(state, slot.id, option, stock);
  }
  return state;
}

export function predictBuildPi(profile, selections, slots) {
  const stock = makeStockState(profile);
  const state = stateForSelections(profile, selections, slots, stock);
  const basePi = finite(profile.basePi, 500);
  const hasNonStockOption = (slots || []).some(slot => {
    const optionId = selections?.[slot.id]?.optionId || selections?.[slot.id]?.tier || 'stock';
    return optionId !== 'stock';
  });
  // 原厂锚点必须严格等于公开原厂 PI，不能因浮点舍入漂移一分。
  const deltaFromStock = hasNonStockOption ? Math.round(scoreState(state, stock)) : 0;
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
  const scoredSlots = slots.map(slot => ({ ...slot, options: (slot.options || []).map(option => {
    const nextSelections = { ...selections, [slot.id]: { optionId: option.id, tier: option.id } };
    const candidate = predictBuildPi(profile, nextSelections, slots);
    const delta = candidate.totalPi - prediction.totalPi;
    return {
      ...option,
      piEstimate: delta,
      piDeltaFromCurrent: delta,
      piDeltaFromStock: candidate.deltaFromStock,
      piUpperEstimate: delta + candidate.uncertainty,
      piSource: 'formula_v1', piConfidence: 'model_estimate',
      piPrediction: { point: delta, min: delta - candidate.uncertainty, max: delta + candidate.uncertainty, basis: '公式推算', contextDependent: true, ruleVersion: candidate.modelVersion }
    };
  }) }));
  return { prediction, slots: scoredSlots };
}
