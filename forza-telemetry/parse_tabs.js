const fs = require('fs');
const content = fs.readFileSync('client/src/components/pages/SessionHistoryPage.jsx', 'utf8');

// Find where activeChart rendering happens
const start = content.indexOf('activeChart === \'overview\' && (');
const end = content.indexOf('{activeChart === \'replay\' && (');

if (start !== -1) {
  console.log("Found overview tab start at index:", start);
  console.log("Found replay tab start at index:", end);
}
