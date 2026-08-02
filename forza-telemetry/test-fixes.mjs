import { FIX_PARAM_MAP } from './client/src/utils/tuneForm.js';
import { DRIVING_PROBLEMS } from './client/src/data/tunePresets.js';

const convertFixes = (fixes) => {
  if (!fixes) return null;
  const result = {};
  for (const [paramKey, fix] of Object.entries(fixes)) {
    const dotPath = FIX_PARAM_MAP[paramKey];
    if (!dotPath) continue;
    const [category, field] = dotPath.split('.');
    if (!result[category]) result[category] = {};
    result[category][field] = fix.delta;
  }
  return result;
};

const handleApplyProblemsFixInViewOnly = (tune, problems) => {
  const combinedChanges = {};
  for (const prob of problems) {
    const changes = prob.suggestedChanges || convertFixes(prob.fixes) || {};
    for (const [category, params] of Object.entries(changes)) {
      if (!combinedChanges[category]) combinedChanges[category] = {};
      for (const [key, val] of Object.entries(params)) {
        const curVal = combinedChanges[category][key] || 0;
        combinedChanges[category][key] = Number((curVal + val).toFixed(2));
      }
    }
  }
  console.log("Combined Changes:", combinedChanges);
  return combinedChanges;
};

const tune = { tires: { frontPressure: 30 } };
const prob = DRIVING_PROBLEMS[0]; // mid understeer
console.log("Prob:", prob.name);
const combined = handleApplyProblemsFixInViewOnly(tune, [prob]);

const suggestedChanges = combined;
const items = [];
const updatedTune = JSON.parse(JSON.stringify(tune));

for (const [category, params] of Object.entries(suggestedChanges)) {
  if (!updatedTune[category]) updatedTune[category] = {};
  for (const [key, value] of Object.entries(params)) {
    const curVal = updatedTune[category][key];
    const oldValNum = Number.isFinite(Number(curVal)) ? Number(curVal) : 0;
    const newValNum = Number((oldValNum + Number(value)).toFixed(2));
    updatedTune[category][key] = newValNum;

    items.push({
      category,
      key,
      label: key,
      oldVal: curVal !== undefined ? curVal : '未设置',
      newVal: newValNum,
      delta: value,
    });
  }
}
console.log("Updated Tune:", updatedTune);
console.log("Items:", items);

