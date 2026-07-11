import fs from 'fs/promises';
import path from 'path';

class AtomicWriter {
  constructor() {
    this.queues = new Map(); // filepath -> Array of { data, resolve, reject }
    this.writing = new Set(); // filepath -> boolean
  }

  async writeJson(filepath, data) {
    return new Promise((resolve, reject) => {
      if (!this.queues.has(filepath)) {
        this.queues.set(filepath, []);
      }
      this.queues.get(filepath).push({ data, resolve, reject });
      this.processQueue(filepath);
    });
  }

  async processQueue(filepath) {
    if (this.writing.has(filepath)) return;
    const queue = this.queues.get(filepath);
    if (!queue || queue.length === 0) return;

    this.writing.add(filepath);
    const { data, resolve, reject } = queue.shift();

    try {
      const dir = path.dirname(filepath);
      await fs.mkdir(dir, { recursive: true });

      const tmpPath = `${filepath}.tmp`;
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      
      await fs.writeFile(tmpPath, jsonStr, 'utf8');
      await fs.rename(tmpPath, filepath);
      
      // 备份机制：在原子写入成功后，异步备份一份为 .bak 文件，提供灾备防护
      try {
        await fs.copyFile(filepath, `${filepath}.bak`);
      } catch (bakErr) {
        // 仅仅是备份失败，不影响本次原子写的成功返回
      }
      
      resolve(true);
    } catch (err) {
      console.error(`[AtomicWriter] Atomic write failed for ${filepath}:`, err.message);
      reject(err);
    } finally {
      this.writing.delete(filepath);
      this.processQueue(filepath);
    }
  }
}

export const atomicWriter = new AtomicWriter();
