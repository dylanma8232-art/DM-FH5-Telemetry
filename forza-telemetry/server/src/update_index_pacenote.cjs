const fs = require('fs');
const file = '/Users/wenchen.ma/Desktop/fh5/forza-telemetry/server/src/index.js';
let content = fs.readFileSync(file, 'utf8');

const oldLogic = `    if (!level || !['1', '2', '3', '4', '5', '6'].includes(String(level))) {
      if (angle > 120) level = '1';
      else if (angle > 90) level = '2';
      else if (angle > 60) level = '3';
      else if (angle > 40) level = '4';
      else if (angle > 25) level = '5';
      else level = '6';
    }`;

const newLogic = `    if (!level || !['1', '2', '3', '4', '5', '6'].includes(String(level))) {
      if (angle >= 130) level = '1';
      else if (angle >= 90) level = '2';
      else if (angle >= 60) level = '3';
      else if (angle >= 40) level = '4';
      else if (angle >= 20) level = '5';
      else level = '6';
    }`;

const oldLogic2 = `      if (!nextLevel || !['1', '2', '3', '4', '5', '6'].includes(String(nextLevel))) {
        const nextAngle = consecutiveTurn.angle || 0;
        if (nextAngle > 120) nextLevel = '1';
        else if (nextAngle > 90) nextLevel = '2';
        else if (nextAngle > 60) nextLevel = '3';
        else if (nextAngle > 40) nextLevel = '4';
        else if (nextAngle > 25) nextLevel = '5';
        else nextLevel = '6';
      }`;

const newLogic2 = `      if (!nextLevel || !['1', '2', '3', '4', '5', '6'].includes(String(nextLevel))) {
        const nextAngle = consecutiveTurn.angle || 0;
        if (nextAngle >= 130) nextLevel = '1';
        else if (nextAngle >= 90) nextLevel = '2';
        else if (nextAngle >= 60) nextLevel = '3';
        else if (nextAngle >= 40) nextLevel = '4';
        else if (nextAngle >= 20) nextLevel = '5';
        else nextLevel = '6';
      }`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  content = content.replace(oldLogic2, newLogic2);
  fs.writeFileSync(file, content);
  console.log('Updated pace note fallback logic in index.js');
} else {
  console.log('Could not find old logic in index.js');
}
