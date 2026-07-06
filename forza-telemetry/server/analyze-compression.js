import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const sessionsDir = '../data/sessions';
const files = fs.readdirSync(sessionsDir).filter(f => f.includes('_detail_hifi.json.br'));

console.log('分析高精度文件压缩效率...\n');

let totalOriginal = 0;
let totalCompressed = 0;
let fieldStats = {};

for (const file of files.slice(0, 5)) { // 只分析前5个文件
  const filePath = path.join(sessionsDir, file);
  const compressed = fs.readFileSync(filePath);
  const decompressed = JSON.parse(zlib.brotliDecompressSync(compressed).toString());
  
  const data = decompressed.data || [];
  if (data.length === 0) continue;
  
  console.log(`文件: ${file}`);
  console.log(`数据点: ${data.length}`);
  console.log(`压缩后大小: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
  
  // 分析每个字段的大小
  const sample = data[0];
  const fields = Object.keys(sample);
  
  for (const field of fields) {
    const value = sample[field];
    const type = typeof value;
    let size = 0;
    
    if (type === 'object' && value !== null) {
      size = JSON.stringify(value).length;
    } else {
      size = String(value).length;
    }
    
    if (!fieldStats[field]) {
      fieldStats[field] = { count: 0, totalSize: 0, type };
    }
    fieldStats[field].count++;
    fieldStats[field].totalSize += size;
  }
  
  // 计算原始JSON大小
  const jsonStr = JSON.stringify(decompressed);
  const originalSize = Buffer.byteLength(jsonStr, 'utf8');
  totalOriginal += originalSize;
  totalCompressed += compressed.length;
  
  console.log(`原始JSON大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`压缩率: ${(compressed.length / originalSize * 100).toFixed(2)}%`);
  console.log('---');
}

console.log('\n字段大小统计（平均每个数据点）:');
const sortedFields = Object.entries(fieldStats)
  .map(([field, stats]) => ({
    field,
    avgSize: stats.totalSize / stats.count,
    type: stats.type,
    count: stats.count
  }))
  .sort((a, b) => b.avgSize - a.avgSize);

for (const { field, avgSize, type, count } of sortedFields.slice(0, 20)) {
  console.log(`${field}: ${avgSize.toFixed(2)} 字节 (${type}) - 出现 ${count} 次`);
}

console.log(`\n总体统计:`);
console.log(`总原始大小: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`);
console.log(`总压缩大小: ${(totalCompressed / 1024 / 1024).toFixed(2)} MB`);
console.log(`总体压缩率: ${(totalCompressed / totalOriginal * 100).toFixed(2)}%`);
console.log(`空间节省: ${((totalOriginal - totalCompressed) / 1024 / 1024).toFixed(2)} MB`);