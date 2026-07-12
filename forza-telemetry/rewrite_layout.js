const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove activeChart === '...' && ( ... )
// Since regex matching nested parens is hard, I'll do string replacements for the exact wrappers.

const replacements = [
  ["{activeChart === 'overview' && (\\s*<>\\s*)", "<div id=\"section-overview\" style={{marginBottom: 32}}>"],
  ["(</>\\s*)}", "</div>"],
  ["{activeChart === 'dynamics' && channelsData && (\\s*<div>)", "<div id=\"section-dynamics\" style={{marginBottom: 32}}>{channelsData && <div>"],
  ["(</div>\\s*)}", "</div></div>"], // Be careful with this, might match wrong things if using regex blindly. Let's use precise literal replacements.
];

