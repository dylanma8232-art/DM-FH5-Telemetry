import fs from 'fs/promises';
import { existsSync } from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import { atomicWriter } from './atomic-writer.js';

const brotliCompress = promisify(zlib.brotliCompress);
const brotliDecompress = promisify(zlib.brotliDecompress);

export async function readJsonAsync(filepath, defaultValue = {}) {
  try {
    if (!existsSync(filepath)) return defaultValue;
    const content = await fs.readFile(filepath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`[FileDB] Failed to read ${filepath}:`, err.message);
    return defaultValue;
  }
}

export async function writeJsonAsync(filepath, data) {
  return atomicWriter.writeJson(filepath, data);
}

export async function writeBrotliAsync(filepath, data) {
  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    const compressed = await brotliCompress(Buffer.from(jsonStr), {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4
      }
    });
    
    const tmpPath = `${filepath}.tmp`;
    await fs.writeFile(tmpPath, compressed);
    await fs.rename(tmpPath, filepath);
    return true;
  } catch (err) {
    console.error(`[FileDB] Failed to compress write ${filepath}:`, err.message);
    return false;
  }
}

