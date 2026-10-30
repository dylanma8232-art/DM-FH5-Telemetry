/**
 * 只读的赛道详情进程内缓存（LRU + TTL + 文件 stat 校验）。
 *
 * - 纯逻辑模块，不依赖 DATA_DIR，便于隔离测试；
 * - 命中条件：同一 trackId、文件路径属于当前候选列表、mtimeMs/size 与入缓存时一致、未超 TTL；
 * - 任何写入（writeTrackDetail / deleteTrackDetail）都必须调用 invalidate，保证读写一致；
 * - 文件被外部进程（save-worker 线程以 rename 落盘）改写时，stat 校验会让缓存自然失效，
 *   因此不会出现「候选几何更新后仍读到旧详情」的窗口。
 */
export function createTrackDetailCache({ ttlMs = 30000, maxEntries = 32, statFile, now = Date.now } = {}) {
  if (typeof statFile !== 'function') throw new Error('createTrackDetailCache 需要 statFile');

  const store = new Map();

  function get(trackId, candidatePaths) {
    const entry = store.get(trackId);
    if (!entry) return null;
    if (now() > entry.expiresAt || !candidatePaths.includes(entry.filePath)) {
      store.delete(trackId);
      return null;
    }
    const stat = statFile(entry.filePath);
    if (!stat || stat.mtimeMs !== entry.mtimeMs || stat.size !== entry.size) {
      store.delete(trackId);
      return null;
    }
    // LRU：命中后移到队尾
    store.delete(trackId);
    store.set(trackId, entry);
    return entry.data;
  }

  function remember(trackId, filePath, data) {
    const stat = statFile(filePath);
    if (!stat) return;
    store.delete(trackId);
    store.set(trackId, {
      data,
      filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      expiresAt: now() + ttlMs
    });
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      store.delete(oldest);
    }
  }

  function invalidate(trackId) {
    if (trackId === undefined) store.clear();
    else store.delete(trackId);
  }

  return { get, remember, invalidate, size: () => store.size };
}
