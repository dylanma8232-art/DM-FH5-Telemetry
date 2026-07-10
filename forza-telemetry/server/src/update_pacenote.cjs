const fs = require('fs');
const file = '/Users/wenchen.ma/Desktop/fh5/forza-telemetry/server/src/track-builder.js';
let content = fs.readFileSync(file, 'utf8');

// The original logic:
/*
            // 标准拉力路书分级：统一 1-6 等级（发卡=1，不再单独标记）
            let severity = "";
            let type = "micro";
            let equivRadius = minRadius;
            if (angleDiff < 20.0) {
              equivRadius = minRadius * 2.0;
            } else if (angleDiff < 35.0) {
              equivRadius = minRadius * 1.4;
            } else if (angleDiff > 120.0) {
              equivRadius = minRadius * 0.6;
            }

            if (equivRadius <= 35) {
              severity = "1"; type = "hairpin";
            } else if (equivRadius <= 55) {
              severity = "2"; type = "sharp";
            } else if (equivRadius <= 85) {
              severity = "3"; type = "medium";
            } else if (equivRadius <= 125) {
              severity = "4"; type = "gentle";
            } else if (equivRadius <= 180) {
              severity = "5"; type = "slight";
            } else {
              severity = "6"; type = "micro";
            }
*/

const oldLogic = `            // 标准拉力路书分级：统一 1-6 等级（发卡=1，不再单独标记）
            let severity = "";
            let type = "micro";
            let equivRadius = minRadius;
            if (angleDiff < 20.0) {
              equivRadius = minRadius * 2.0;
            } else if (angleDiff < 35.0) {
              equivRadius = minRadius * 1.4;
            } else if (angleDiff > 120.0) {
              equivRadius = minRadius * 0.6;
            }

            if (equivRadius <= 35) {
              severity = "1"; type = "hairpin";
            } else if (equivRadius <= 55) {
              severity = "2"; type = "sharp";
            } else if (equivRadius <= 85) {
              severity = "3"; type = "medium";
            } else if (equivRadius <= 125) {
              severity = "4"; type = "gentle";
            } else if (equivRadius <= 180) {
              severity = "5"; type = "slight";
            } else {
              severity = "6"; type = "micro";
            }`;

const newLogic = `            // 标准拉力路书分级：统一 1-6 等级（基于绝对偏转角度）
            let severity = "";
            let type = "micro";
            if (angleDiff >= 130.0) {
              severity = "1"; type = "hairpin";
            } else if (angleDiff >= 90.0) {
              severity = "2"; type = "sharp";
            } else if (angleDiff >= 60.0) {
              severity = "3"; type = "medium";
            } else if (angleDiff >= 40.0) {
              severity = "4"; type = "gentle";
            } else if (angleDiff >= 20.0) {
              severity = "5"; type = "slight";
            } else {
              severity = "6"; type = "micro";
            }`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  fs.writeFileSync(file, content);
  console.log('Updated pace note logic in track-builder.js');
} else {
  console.log('Could not find old logic in track-builder.js');
}
