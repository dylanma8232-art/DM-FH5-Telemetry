const fs = require('fs');
const path = require('path');

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/const context = new Proxy\(stateManager, \{/, 'const context = new Proxy({}, {');
  content = content.replace(/if \(typeof target\[prop\] === 'function'\) return target\[prop\]\.bind\(target\);\n\s*return target\[prop\];/g, 
    `if (typeof stateManager[prop] === 'function') return stateManager[prop].bind(stateManager);\n        return stateManager[prop];`);

  fs.writeFileSync(filePath, content);
  console.log('Fixed proxy in', file);
});
