import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessionsDir = path.join(__dirname, '../data/sessions');
const logFile = path.join(__dirname, 'recompress.log');

// 新的压缩等级
const NEW_QUALITY = 9;
// 每批处理的文件数
const BATCH_SIZE = 2;
// 每批之间的延迟（毫秒）
const DELAY_BETWEEN_BATCHES = 5000;

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFile, logMessage);
}

async function recompressFile(filePath) {
  try {
    const compressed = fs.readFileSync(filePath);
    const decompressed = zlib.brotliDecompressSync(compressed).toString();
    
    // 重新压缩
    const recompressed = zlib.brotliCompressSync(Buffer.from(decompressed), {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: NEW_QUALITY
      }
    });
    
    // 如果新文件更小，则替换
    if (recompressed.length < compressed.length) {
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, recompressed);
      fs.renameSync(tmpPath, filePath);
      return {
        success: true,
        oldSize: compressed.length,
        newSize: recompressed.length,
        saved: compressed.length - recompressed.length
      };
    } else {
      return {
        success: true,
        oldSize: compressed.length,
        newSize: compressed.length,
        saved: 0,
        skipped: true
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

async function main() {
  log('开始后台批量重新压缩...');
  
  // 获取所有高精度文件
  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.includes('_detail_hifi.json.br'))
    .map(f => path.join(sessionsDir, f));
  
  log(`找到 ${files.length} 个高精度文件`);
  
  let totalSaved = 0;
  let processed = 0;
  
  // 分批处理
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    log(`处理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)}`);
    
    for (const file of batch) {
      const fileName = path.basename(file);
      log(`处理文件: ${fileName}`);
      
      const result = await recompressFile(file);
      if (result.success) {
        if (result.skipped) {
          log(`  跳过（文件未变小）`);
        } else {
          const savedKB = (result.saved / 1024).toFixed(2);
          log(`  压缩完成: ${(result.oldSize / 1024).toFixed(2)}KB -> ${(result.newSize / 1024).toFixed(2)}KB, 节省 ${savedKB}KB`);
          totalSaved += result.saved;
        }
        processed++;
      } else {
        log(`  错误: ${result.error}`);
      }
    }
    
    // 延迟，避免占用太多CPU
    if (i + BATCH_SIZE < files.length) {
      log(`等待 ${DELAY_BETWEEN_BATCHES / 1000} 秒...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  log(`处理完成！`);
  log(`处理文件数: ${processed}/${files.length}`);
  log(`总节省空间: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

// 处理中断信号
process.on('SIGINT', () => {
  log('收到中断信号，停止处理...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('收到终止信号，停止处理...');
  process.exit(0);
});

main().catch(err => {
  log(`致命错误: ${err.message}`);
  process.exit(1);
});