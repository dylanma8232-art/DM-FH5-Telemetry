#!/usr/bin/env node
/**
 * 将 Forza 官方 FH5 车辆目录转换为运行时使用的「遥测编号 -> 车型名称」映射。
 * 用法：node scripts/update-official-fh5-vehicle-catalog.mjs /path/to/fh5cars.html
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const sourcePath = process.argv[2];
if (!sourcePath || !fs.existsSync(sourcePath)) {
  throw new Error('请传入已下载的 Forza 官方 fh5cars 页面文件。');
}

const decodeHtml = value => String(value)
  .replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const normalizeName = value => String(value).replace(/\s+/g, ' ').trim();

const html = fs.readFileSync(sourcePath, 'utf8');
const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map(cell => decodeHtml(cell[1].replace(/<[^>]+>/g, '').trim())))
  .filter(cells => cells.length === 6 && /^\d+$/.test(cells[5]));

const cars = {};
const duplicateIds = new Map();
const duplicatePairs = [];
const seenPairs = new Set();
for (const row of rows) {
  const [name,,,,, id] = row;
  const normalizedName = normalizeName(name);
  const pairKey = `${id}\u0000${normalizedName}`;
  if (seenPairs.has(pairKey)) {
    duplicatePairs.push({ id, name: normalizedName });
    continue;
  }
  seenPairs.add(pairKey);
  if (cars[id] && cars[id] !== normalizedName) {
    duplicateIds.set(id, [...(duplicateIds.get(id) || [cars[id]]), normalizedName]);
    continue;
  }
  cars[id] = normalizedName;
}

if (Object.keys(cars).length < 850) {
  throw new Error(`官方目录解析异常：只得到 ${Object.keys(cars).length} 辆车。`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'src/config/cars-database.json');
fs.writeFileSync(outputPath, `${JSON.stringify(cars, null, 2)}\n`);
console.log(JSON.stringify({
  source: 'https://forza.net/fh5cars/',
  officialRows: rows.length,
  uniqueVehicleIds: Object.keys(cars).length,
  duplicateIds: Object.fromEntries(duplicateIds),
  duplicateNameAndIdPairs: duplicatePairs.length
}, null, 2));
