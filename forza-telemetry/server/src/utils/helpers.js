import os from 'os';
import fs from 'fs';
import { writeJsonAsync } from '../storage/file-db.js';

export function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push({ name, address: iface.address });
    }
  }
  return ips;
}

export function loadJSON(file, def = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
}

export function saveJSON(file, data) {
  writeJsonAsync(file, data).catch(err => {
    console.error(`[SaveJSON] 异步写入失败 ${file}:`, err.message);
  });
  return true;
}

