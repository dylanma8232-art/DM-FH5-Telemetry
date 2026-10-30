/**
 * AI 赛后诊断缓存的唯一读写边界（data/diagnoses/<sessionId>.json）。
 * 读取语义保持原样：文件不存在或解析失败都视为「无缓存」。
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';

export function diagnosisDir(baseDir = DATA_DIR) {
  return path.join(baseDir, 'diagnoses');
}

export function diagnosisCachePath(sessionId, baseDir = DATA_DIR) {
  return path.join(diagnosisDir(baseDir), `${sessionId}.json`);
}

/** 读取缓存；不存在或损坏返回 null（调用方据此回落到「无缓存」分支） */
export function readDiagnosisCache(sessionId, baseDir = DATA_DIR) {
  const cachePath = diagnosisCachePath(sessionId, baseDir);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 写入缓存（同步写，保持原接口的落盘时序：写完后才响应） */
export function writeDiagnosisCache(sessionId, payload, baseDir = DATA_DIR) {
  const dir = diagnosisDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(diagnosisCachePath(sessionId, baseDir), JSON.stringify(payload, null, 2), 'utf8');
}
