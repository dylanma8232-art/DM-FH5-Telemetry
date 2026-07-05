const fs = require('fs');
const readline = require('readline');

async function recover() {
  const path = '/Users/dylan/.gemini/antigravity-ide/brain/0530b5aa-06f1-4c0c-bc91-431e4b69c000/.system_generated/logs/transcript_full.jsonl';
  
  if (!fs.existsSync(path)) {
    console.error('File not found: ' + path);
    return;
  }
  
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
               if (linesByNumber[num] === undefined) {
                 linesByNumber[num] = code;
               }
             }
           }
        }
      } catch(e) {}
    }
  }

  const keys = Object.keys(linesByNumber).map(Number);
  if (keys.length === 0) {
    console.log('No lines found in transcript!');
    return;
  }
  
  const maxLine = Math.max(...keys);
  console.log('Max line found:', maxLine);
  
  let allLines = [];
  for (let i = 1; i <= maxLine; i++) {
    allLines.push(linesByNumber[i] !== undefined ? linesByNumber[i] : '');
  }
  
  fs.writeFileSync('/Users/dylan/Desktop/fh5/forza-telemetry/server/src/track-builder.js', allLines.join('\\n'));
  console.log('Successfully recovered track-builder.js');
}

recover();
