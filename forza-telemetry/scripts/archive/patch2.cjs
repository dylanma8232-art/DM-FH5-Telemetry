const fs = require('fs');
const file = 'server/src/track-builder.js';
let content = fs.readFileSync(file, 'utf8');

const target = `  for (let i = 1; i < vertexData.length; i++) {
    const v = vertexData[i];
    const lastV = currentGroup[currentGroup.length - 1];
    
    if (v.direction === lastV.direction) {
      currentGroup.push(v);
    } else {
      turnGroups.push(currentGroup);
      currentGroup = [v];
    }
  }`;

const replacement = `  for (let i = 1; i < vertexData.length; i++) {
    const v = vertexData[i];
    const lastV = currentGroup[currentGroup.length - 1];
    
    const gapIdx = v.originalIdx - lastV.originalIdx;
    
    if (v.direction === lastV.direction && gapIdx < 40) { // Approx 80 meters max gap to merge
      currentGroup.push(v);
    } else {
      turnGroups.push(currentGroup);
      currentGroup = [v];
    }
  }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log('Replaced successfully');
