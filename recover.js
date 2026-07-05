const fs = require('fs');
const readline = require('readline');
const path = '/Users/dylan/.gemini/antigravity-ide/brain/0530b5aa-06f1-4c0c-bc91-431e4b69c000/.system_generated/logs/transcript_full.jsonl';

async function recover() {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const linesByNumber = {};

  for await (const line of rl) {
    if (line.includes('File Path: `file:///Users/dylan/Desktop/fh5/forza-telemetry/server/src/track-builder.js`')) {
      try {
        const obj = JSON.parse(line);
        if (obj.content) {
           const blocks = obj.content.split('\\n');
           for (let l of blocks) {
             let match = l.match(/^(\\d+):\\s(.*)$/);
             if (match) {
               let num = parseInt(match[1]);
               let code = match[2];
               if (!linesByNumber[num]) {
                 linesByNumber[num] = code;
               }
             }
           }
        }
      } catch(e) {}
    }
  }

  const maxLine = Math.max(...Object.keys(linesByNumber).map(Number));
  console.log('Max line found:', maxLine);
  
  // 检查是否完整
  let allLines = [];
  for (let i = 1; i <= maxLine; i++) {
    allLines.push(linesByNumber[i] !== undefined ? linesByNumber[i] : '');
  }
  
  if (maxLine > 1000) {
    fs.writeFileSync('/Users/dylan/Desktop/fh5/forza-telemetry/server/src/track-builder.js', allLines.join('\\n'));
    console.log('Successfully recovered track-builder.js');
  } else {
    console.log('Not enough lines recovered:', maxLine);
  }
}

recover();
