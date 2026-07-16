#!/usr/bin/env node
/**
 * 从 Forza Wiki MediaWiki API 的 Engine Swap wikitext 响应生成引擎名称目录。
 * Usage: node scripts/import-fh5-engine-names.mjs < engine-swap-api.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const wikitext = input?.parse?.wikitext?.['*'];
if (!wikitext) throw new Error('输入中没有 MediaWiki wikitext');

function splitTemplateFields(body) {
  const fields = [];
  let field = '', linkDepth = 0, templateDepth = 0;
  for (let index = 0; index < body.length; index++) {
    const pair = body.slice(index, index + 2);
    if (pair === '[[') { linkDepth++; field += pair; index++; continue; }
    if (pair === ']]') { linkDepth--; field += pair; index++; continue; }
    if (pair === '{{') { templateDepth++; field += pair; index++; continue; }
    if (pair === '}}') { templateDepth--; field += pair; index++; continue; }
    if (body[index] === '|' && linkDepth === 0 && templateDepth === 0) { fields.push(field.trim()); field = ''; continue; }
    field += body[index];
  }
  fields.push(field.trim());
  return fields;
}

function wikiText(value) {
  return String(value || '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .trim();
}

const engines = [];
const pattern = /\{\{EngSwap\|([\s\S]*?)\}\}/g;
let match;
while ((match = pattern.exec(wikitext))) {
  const fields = splitTemplateFields(match[1]);
  const powerHp = Number(fields[2]);
  if (!Number.isFinite(powerHp)) continue;
  engines.push({
    name: wikiText(fields[0]),
    sourceVehicle: wikiText(fields[1]) || null,
    powerHp,
    torqueLbFt: Number(fields[3]) || null,
    aspiration: fields[4] || null,
    priceCredits: Number(fields[5]) || null,
    added: wikiText(fields[6]) || null
  });
}

const byPower = {};
for (const engine of engines) (byPower[String(engine.powerHp)] ||= []).push(engine);
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/config/engine-swap-catalog.json');
fs.writeFileSync(target, `${JSON.stringify({
  schemaVersion: 1,
  game: 'Forza Horizon 5',
  source: 'https://forza.fandom.com/wiki/Forza_Horizon_5/Engine_Swap',
  importedAt: new Date().toISOString(),
  engines,
  byPower
}, null, 2)}\n`);
console.log(`已导入 ${engines.length} 个正式引擎名称，其中 ${Object.keys(byPower).length} 个功率键。`);
