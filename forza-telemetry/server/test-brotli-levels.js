import fs from 'fs';
import zlib from 'zlib';

const filePath = '../data/sessions/session_1783235683305_detail_hifi.json.br';
const compressed = fs.readFileSync(filePath);
const decompressed = zlib.brotliDecompressSync(compressed).toString();

console.log('测试不同Brotli压缩等级...\n');
console.log(`原始JSON大小: ${(Buffer.byteLength(decompressed, 'utf8') / 1024 / 1024).toFixed(2)} MB\n`);

const levels = [1, 3, 5, 7, 9, 11];

for (const level of levels) {
  const start = Date.now();
  const compressed = zlib.brotliCompressSync(Buffer.from(decompressed), {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: level
    }
  });
  const time = Date.now() - start;
  
  console.log(`等级 ${level}:`);
  console.log(`  压缩后大小: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  压缩率: ${(compressed.length / Buffer.byteLength(decompressed, 'utf8') * 100).toFixed(2)}%`);
  console.log(`  压缩时间: ${time} ms`);
  console.log(`  空间节省: ${((Buffer.byteLength(decompressed, 'utf8') - compressed.length) / 1024 / 1024).toFixed(2)} MB`);
  console.log('');
}