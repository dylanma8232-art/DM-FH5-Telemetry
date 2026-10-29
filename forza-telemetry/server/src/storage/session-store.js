/**
 * 会话摘要/明细文件的唯一读写边界。
 *
 * 路由层不得直接使用 fs 访问 data/sessions；本模块只做「文件 → 数据」的纯搬迁，
 * 不包含任何排序、车辆匹配、赛道名回填等业务规则（那些仍留在路由层）。
 *
 * 所有函数的最后一个可选参数为数据根目录，默认取 config/constants 的 DATA_DIR；
 * 生产调用不传，单元测试传临时目录即可隔离。
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { writeJsonAsync } from './file-db.js';

const SUMMARY_SUFFIX = '_summary.json';

export function sessionsDir(baseDir = DATA_DIR) {
  return path.join(baseDir, 'sessions');
}

/** 是否为会话摘要文件（列表/排行榜的唯一数据来源） */
export function isSummaryFile(name) {
  return typeof name === 'string' && name.endsWith(SUMMARY_SUFFIX);
}

export function summaryPath(sessionId, baseDir = DATA_DIR) {
  return path.join(sessionsDir(baseDir), `${sessionId}${SUMMARY_SUFFIX}`);
}

/** 会话明细可能存在的四种历史落盘形态 */
export function detailPaths(sessionId, baseDir = DATA_DIR) {
  const dir = sessionsDir(baseDir);
  return {
    hifi: path.join(dir, `${sessionId}_detail_hifi.json.br`),
    lowfi: path.join(dir, `${sessionId}_detail_lowfi.json.br`),
    br: path.join(dir, `${sessionId}_detail.json.br`),
    gz: path.join(dir, `${sessionId}_detail.json.gz`)
  };
}

export function sessionsDirExists(baseDir = DATA_DIR) {
  return fs.existsSync(sessionsDir(baseDir));
}

/** 目录内文件名（同步，供已有同步流程保持时序不变） */
export function listSessionFileNamesSync(baseDir = DATA_DIR) {
  return fs.readdirSync(sessionsDir(baseDir));
}

export function listSummaryFileNamesSync(baseDir = DATA_DIR) {
  return listSessionFileNamesSync(baseDir).filter(isSummaryFile);
}

export async function listSessionFileNames(baseDir = DATA_DIR) {
  return fsp.readdir(sessionsDir(baseDir));
}

export async function listSummaryFileNames(baseDir = DATA_DIR) {
  const names = await fsp.readdir(sessionsDir(baseDir));
  return names.filter(isSummaryFile);
}

export async function readSummaryFileText(filename, baseDir = DATA_DIR) {
  return fsp.readFile(path.join(sessionsDir(baseDir), filename), 'utf8');
}

export async function readSummaryByFileName(filename, baseDir = DATA_DIR) {
  return JSON.parse(await readSummaryFileText(filename, baseDir));
}

export function readSummaryByFileNameSync(filename, baseDir = DATA_DIR) {
  return JSON.parse(fs.readFileSync(path.join(sessionsDir(baseDir), filename), 'utf8'));
}

/** 摘要文件是否存在 */
export function summaryExists(sessionId, baseDir = DATA_DIR) {
  return fs.existsSync(summaryPath(sessionId, baseDir));
}

/** 同步读取摘要（用于必须保持同步时序的既有编辑接口） */
export function readSummarySync(sessionId, baseDir = DATA_DIR) {
  return JSON.parse(fs.readFileSync(summaryPath(sessionId, baseDir), 'utf8'));
}

/** 写入摘要：沿用既有的异步原子写（fire-and-forget 语义不变） */
export function writeSummary(sessionId, data, baseDir = DATA_DIR) {
  return writeJsonAsync(summaryPath(sessionId, baseDir), data);
}

export function writeSummaryByFileName(filename, data, baseDir = DATA_DIR) {
  return writeJsonAsync(path.join(sessionsDir(baseDir), filename), data);
}

/** 删除一条会话的全部落盘文件，返回是否真的删除了任一文件 */
export function deleteSessionFiles(sessionId, baseDir = DATA_DIR) {
  const paths = [summaryPath(sessionId, baseDir), ...Object.values(detailPaths(sessionId, baseDir))];
  let deleted = false;
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }
  }
  return deleted;
}

/** 删除一条会话的摘要与 hifi 明细（删除赛道时的既有行为） */
export function deleteSummaryAndHifi(sessionId, baseDir = DATA_DIR) {
  const { hifi } = detailPaths(sessionId, baseDir);
  const targets = [summaryPath(sessionId, baseDir), hifi];
  for (const filePath of targets) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}
