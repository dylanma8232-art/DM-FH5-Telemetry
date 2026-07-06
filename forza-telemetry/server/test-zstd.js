import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function test() {
  try {
    const zstd = await import('zstd-wasm');
    console.log('zstd module:', Object.keys(zstd));
    
    // 测试压缩
    const data = JSON.stringify({ test: 'hello world', number: 123 });
    const buffer = Buffer.from(data);
    console.log('Original size:', buffer.length);
    
    // 尝试压缩
    if (zstd.compress) {
      const compressed = zstd.compress(buffer);
      console.log('Compressed size:', compressed.length);
      console.log('Compression ratio:', (compressed.length / buffer.length * 100).toFixed(2) + '%');
      
      // 解压
      const decompressed = zstd.decompress(compressed);
      console.log('Decompressed size:', decompressed.length);
      console.log('Data matches:', buffer.equals(decompressed));
    } else {
      console.log('No compress function found');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

test();