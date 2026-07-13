const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.resolve(__dirname, '../data');
const TRACKS_DIR = path.join(DATA_DIR, 'tracks');
const METADATA_PATH = path.join(DATA_DIR, 'tracks-metadata.json');

function readJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return {};
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`读取失败: ${filepath}`, e.message);
    return {};
  }
}

function writeJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`写入失败: ${filepath}`, e.message);
    return false;
  }
}

function readTrackDetail(file) {
  const filePath = path.join(TRACKS_DIR, file);
  try {
    if (file.endsWith('.br')) {
      const compressed = fs.readFileSync(filePath);
      const decompressed = zlib.brotliDecompressSync(compressed);
      return JSON.parse(decompressed.toString('utf8'));
    } else if (file.endsWith('.json')) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`读取/解压赛道文件失败: ${file}`, e.message);
  }
  return null;
}

function sync() {
  console.log('=== 开始同步赛道元数据 ===');
  
  if (!fs.existsSync(TRACKS_DIR)) {
    console.error('未找到 tracks 目录');
    return;
  }

  const existingMetadata = readJSON(METADATA_PATH);
  const trackFiles = fs.readdirSync(TRACKS_DIR).filter(f => f.endsWith('.json') || f.endsWith('.json.br'));
  
  console.log(`在 tracks 目录下找到 ${trackFiles.length} 个赛道数据文件。`);

  let addedCount = 0;
  let updatedCount = 0;

  for (const file of trackFiles) {
    const id = file.replace('.json.br', '').replace('.json', '');
    const trackDetail = readTrackDetail(file);
    if (!trackDetail) continue;

    const centerline = trackDetail.centerline || trackDetail.points || [];
    const pointCount = centerline.length;
    const turnCount = trackDetail.turns ? trackDetail.turns.length : 0;
    const trajectoryCount = trackDetail.trajectories ? trackDetail.trajectories.length : 0;
    const length = trackDetail.length || 0;
    const isLoop = trackDetail.isLoop || false;
    const name = trackDetail.name || '未命名赛道';
    const createdAt = trackDetail.createdAt || new Date().toISOString();
    const updatedAt = trackDetail.updatedAt || new Date().toISOString();

    const isNew = !existingMetadata[id];
    
    existingMetadata[id] = {
      id,
      name,
      length,
      pointCount,
      turnCount,
      trajectoryCount,
      createdAt,
      updatedAt,
      isLoop
    };

    if (isNew) {
      console.log(`[新增赛道] ${id} -> "${name}"`);
      addedCount++;
    } else {
      updatedCount++;
    }
  }

  const success = writeJSON(METADATA_PATH, existingMetadata);
  if (success) {
    console.log(`\n同步成功！新增了 ${addedCount} 个赛道元数据，更新/确认了 ${updatedCount} 个。`);
  } else {
    console.error('\n同步失败，无法写入 tracks-metadata.json');
  }
}

sync();
