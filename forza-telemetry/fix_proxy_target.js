const fs = require('fs');
const path = require('path');

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/const context = new Proxy\(\{\n    get\(target, prop\) \{/g, 'const context = new Proxy({}, {\n    get(target, prop) {');

  fs.writeFileSync(filePath, content);
  console.log('Fixed proxy target in', file);
});
