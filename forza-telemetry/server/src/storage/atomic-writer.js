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
