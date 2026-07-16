#!/usr/bin/env node
/**
 * Imports the public ManteoMax FH5 sheet into the vehicle upgrade catalogue.
 * Usage:
 * curl -sSL 'https://docs.google.com/spreadsheets/d/1yucDOQ2nRaCcC4y4unl72Um7N_pQXuaI6gZqzf0Tl3M/export?format=csv' | node scripts/import-fh5-vehicle-sheet.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { field += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; continue;
    }
    field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const labelForAspiration = { T: '涡轮增压', TT: '双涡轮增压', CS: '离心式机械增压', PDS: '机械增压' };
const cleanOptions = value => String(value || '').split(',').map(item => item.trim()).filter(item => item && !/^none|^stock$/i.test(item));
const cleanAspirationOptions = value => [...new Set(String(value || '')
  .replace(/\./g, ',')
  .split(',')
  .map(item => item.trim().toUpperCase())
  .filter(item => ['T', 'TT', 'PDS', 'CS', 'NA'].includes(item)))];
const optionId = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const input = fs.readFileSync(0, 'utf8');
const engineCatalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/config/engine-swap-catalog.json');
const engineCatalog = fs.existsSync(engineCatalogPath) ? JSON.parse(fs.readFileSync(engineCatalogPath, 'utf8')) : { byPower: {} };
const rows = parseCsv(input);
const header = rows.shift().map(item => item.replace(/^\uFEFF/, '').trim());
const column = name => header.indexOf(name);
const ordinalIndex = column('Ordinal');
const piIndex = column('PI');
const hpIndex = column('HP');
const driveIndex = column('Drive');
const stockAspirationIndex = column('Aspiration');
const nameIndex = 1;
const engineIndex = column('Engine Conversions (hp)');
const aspirationIndex = column('Aspiration Options');
const aeroIndex = column('Aero or kit Options');
const trackWidthIndex = column('Track Width');

if (ordinalIndex < 0 || engineIndex < 0) throw new Error('未找到 FH5 表格所需列');

const profiles = {};
for (const row of rows) {
  const ordinal = String(row[ordinalIndex] || '').trim();
  if (!ordinal || !/^\d+$/.test(ordinal)) continue;
  const slots = [];
  const stockHp = Number(row[hpIndex]) || 0;
  const sourceDrive = String(row[driveIndex] || '').trim().toLowerCase();
  const sourceAspiration = String(row[stockAspirationIndex] || '').trim().toLowerCase();
  const stockAspiration = sourceAspiration === 'na' ? 'na' : sourceAspiration || null;
  const baseDriveType = sourceDrive === 'fwd' ? 'fwd' : sourceDrive === 'rwd' ? 'rwd' : sourceDrive === 'awd' ? 'awd' : null;
  const commonTemplate = sourceAspiration === 'e' ? 'electric_road' : 'combustion_road';
  const engineOptions = cleanOptions(row[engineIndex]);
  if (engineOptions.length) slots.push({
    id: 'engine_swap', label: '引擎置换', group: '车辆专属', scope: 'vehicle_specific', tierSystem: false,
    options: [{ id: 'stock', label: '原厂引擎', piEstimate: 0 }, ...engineOptions.map(value => {
      const swapHp = Number.parseInt(value, 10);
      // 公开表只给出发动机马力而非游戏 PI。此处是明确标为“预估”的
      // 保守换算，实测构建 PI 到位后会替换它。
      const piEstimate = Number.isFinite(swapHp) ? Math.max(-15, Math.min(150, Math.round((swapHp - stockHp) / 25))) : undefined;
      const candidates = engineCatalog.byPower?.[String(swapHp)] || [];
      const candidateNames = [...new Set(candidates.map(item => item.name).filter(Boolean))];
      const label = candidateNames.length === 1
        ? `${candidateNames[0]} · ${swapHp} 马力`
        : candidateNames.length > 1
          ? `${candidateNames.join(' 或 ')}，待核验`
          : `${swapHp} 马力，名称待核验`;
      return {
        id: `engine_${optionId(value)}`, label, sourceValue: value,
        engineName: candidateNames.length === 1 ? candidateNames[0] : null,
        engineNameStatus: candidateNames.length === 1 ? 'power_unique' : candidateNames.length > 1 ? 'ambiguous' : 'unknown',
        engineCandidates: candidates,
        piEstimate, performanceScore: Math.max(0, swapHp - stockHp)
      };
    })]
  });
  const aspirationOptions = cleanAspirationOptions(row[aspirationIndex]);
  if (aspirationOptions.length) slots.push({
    id: 'aspiration_swap', label: '增压方式置换', group: '置换', scope: 'vehicle_specific', tierSystem: false, replaceCommonOptions: true,
    options: [{ id: 'stock', label: '保持原厂增压方式', piEstimate: 0 }, ...aspirationOptions.map(value => ({ id: `aspiration_${optionId(value)}`, label: value === 'NA' ? '自然吸气' : labelForAspiration[value], sourceValue: value }))]
  });
  const aero = String(row[aeroIndex] || '').trim();
  const hasAeroData = aero && !/^(none|no)$/i.test(aero);
  const hasForzaAero = /(^|[,/ ])forza($|[,/ ])/i.test(aero);
  const hasWidebody = /\bWB\b|widebody|bodykit/i.test(aero);
  const hasPreset = /preset/i.test(aero);
  const explicitFront = /\bfront\b|front bumper/i.test(aero);
  const explicitRear = /\brear\b|wing/i.test(aero);
  const stockAdjustableAero = /(^|[,/ ])adjustable($|[,/ ])/i.test(aero) && !/aftermarket/i.test(aero);

  if (hasWidebody) slots.push({
    id: 'widebody', label: '宽体与车身套件', group: '置换', scope: 'vehicle_specific', replaceCommonOptions: true,
    options: [{ id: 'stock', label: '保持原厂车身', piEstimate: 0 }, { id: 'listed_widebody', label: '可用宽体或车身套件', sourceValue: aero, confidence: 'source_explicit' }]
  });
  if (hasForzaAero || explicitFront) slots.push({
    id: 'front_aero', label: '前部空气动力学', group: '车辆专属', scope: 'vehicle_specific', replaceCommonOptions: true,
    options: [{ id: 'stock', label: '原厂前部', piEstimate: 0 }, { id: hasForzaAero ? 'adjustable' : 'fixed', label: hasForzaAero ? '可调前部件' : '固定前部件', sourceValue: aero, adjustable: hasForzaAero, confidence: 'source_explicit' }]
  });
  if (hasForzaAero || explicitRear) slots.push({
    id: 'rear_aero', label: '尾翼', group: '车辆专属', scope: 'vehicle_specific', replaceCommonOptions: true,
    options: [{ id: 'stock', label: '原厂尾翼', piEstimate: 0 }, { id: hasForzaAero || /adjustable/i.test(aero) ? 'adjustable' : 'fixed', label: hasForzaAero || /adjustable/i.test(aero) ? '可调尾翼' : '固定尾翼', sourceValue: aero, adjustable: hasForzaAero || /adjustable/i.test(aero), confidence: 'source_explicit' }]
  });
  if (hasPreset) slots.push({
    id: 'upgrade_preset', label: '升级预设', group: '车辆专属', scope: 'vehicle_specific',
    options: [{ id: 'stock', label: '不使用预设', piEstimate: 0 }, { id: 'listed_preset', label: '可用升级预设', sourceValue: aero, confidence: 'category_only' }]
  });
  const appearanceOnly = hasAeroData && !hasForzaAero && !explicitFront && !explicitRear && !hasWidebody && !hasPreset && !stockAdjustableAero;
  if (appearanceOnly) slots.push({
    id: 'appearance_options', label: '外观改装', group: '车辆专属', scope: 'vehicle_specific',
    options: [{ id: 'stock', label: '原厂外观', piEstimate: 0 }, { id: 'listed_appearance', label: '已知有外观选项，细项待核验', sourceValue: aero, confidence: 'category_only' }]
  });

  const trackWidth = String(row[trackWidthIndex] || '').trim();
  const commonSlotOverrides = {};
  if (/^(none|no)$/i.test(aero)) {
    commonSlotOverrides.front_aero = { availability: 'verified_absent' };
    commonSlotOverrides.rear_aero = { availability: 'verified_absent' };
  }
  if (/^both$/i.test(trackWidth)) {
    commonSlotOverrides.track_width_front = { availability: 'source_explicit' };
    commonSlotOverrides.track_width_rear = { availability: 'source_explicit' };
  } else if (/^rear$/i.test(trackWidth)) {
    commonSlotOverrides.track_width_front = { availability: 'verified_absent' };
    commonSlotOverrides.track_width_rear = { availability: 'source_explicit' };
  } else if (trackWidth === '?') {
    commonSlotOverrides.track_width_front = { availability: 'unknown' };
    commonSlotOverrides.track_width_rear = { availability: 'unknown' };
  } else {
    commonSlotOverrides.track_width_front = { availability: 'verified_absent' };
    commonSlotOverrides.track_width_rear = { availability: 'verified_absent' };
  }
  profiles[ordinal] = {
    status: 'partial', piStatus: 'unverified', name: row[nameIndex] || '', basePi: Number(row[piIndex]) || null, baseDriveType,
    commonTemplate, commonSlotOverrides, stockAspiration,
    stockAdjustableAeroFront: stockAdjustableAero,
    stockAdjustableAeroRear: stockAdjustableAero,
    gameVersion: 'FH5 Series 24（公开表）',
    source: [{ type: '公开车辆表', url: 'https://www.manteomax.com/', importedAt: new Date().toISOString() }],
    slots, tuneParameters: []
  };
}

const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/config/vehicle-upgrades.json');
fs.writeFileSync(target, JSON.stringify({ schemaVersion: 1, game: 'Forza Horizon 5', updatedAt: new Date().toISOString(), profiles }, null, 2) + '\n');
console.log(`已导入 ${Object.keys(profiles).length} 辆车辆的已公开改装选项。`);
