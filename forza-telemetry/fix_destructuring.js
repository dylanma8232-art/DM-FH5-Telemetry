const fs = require('fs');
const path = require('path');

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Find destructuring
  const match = content.match(/const\s+\{\s*([^}]+)\s*\}\s*=\s*context\s*;/);
  if (!match) return;

  const vars = match[1].split(',').map(s => s.trim()).filter(Boolean);

  // Remove proxy and destructuring
  content = content.replace(/\/\/ Proxy to stateManager[\s\S]*?const context = new Proxy\([^{]*\{[\s\S]*?\}\);\n/, '');
  content = content.replace(match[0], '');

  // Replace usages safely
  vars.forEach(v => {
    // Negative lookbehind for dot `.` (so we don't replace obj.var)
    // Negative lookahead for colon `:` (so we don't replace obj { var: ... })
    // We also shouldn't replace object shorthand like { io } ? Wait, if it's { io } it will become { stateManager.io }, which is invalid syntax! It would become { stateManager.io: stateManager.io }. But lookahead for `}`?
    // Let's just use a replacer function for object shorthand.
    // Actually, `{ io }` is `{ io }`. If it's replaced by `{ stateManager.io }`, that's invalid JS.
    // Let's replace `\bVAR\b` except when preceded by dot. If preceded by `{ `, maybe we don't have such cases.
    
    const regex = new RegExp(`(?<!\\.)\\b${v}\\b(?!:)`, 'g');
    content = content.replace(regex, `stateManager.${v}`);
    
    // Fix invalid shorthand like { stateManager.io } -> { io: stateManager.io }
    const shorthandRegex = new RegExp(`\\{\\s*stateManager\\.${v}\\s*\\}`, 'g');
    content = content.replace(shorthandRegex, `{ ${v}: stateManager.${v} }`);
    
    const shorthandRegexComma = new RegExp(`\\{\\s*stateManager\\.${v}\\s*,`, 'g');
    content = content.replace(shorthandRegexComma, `{ ${v}: stateManager.${v},`);

    const shorthandRegexCommaEnd = new RegExp(`,\\s*stateManager\\.${v}\\s*\\}`, 'g');
    content = content.replace(shorthandRegexCommaEnd, `, ${v}: stateManager.${v} }`);

    const shorthandRegexCommaMid = new RegExp(`,\\s*stateManager\\.${v}\\s*,`, 'g');
    content = content.replace(shorthandRegexCommaMid, `, ${v}: stateManager.${v},`);
  });

  fs.writeFileSync(filePath, content);
  console.log('Fixed', file, vars);
});
