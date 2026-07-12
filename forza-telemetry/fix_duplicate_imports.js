const fs = require('fs');
const path = require('path');

const routesDir = 'server/src/routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Find all standard import { ... } from '...';
  const importLines = content.match(/import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\n/g) || [];
  
  // Aggregate imports by source
  const importsBySource = {};
  importLines.forEach(line => {
    const match = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];/);
    if (match) {
      const source = match[2];
      const vars = match[1].split(',').map(v => v.trim()).filter(v => v);
      if (!importsBySource[source]) importsBySource[source] = new Set();
      vars.forEach(v => importsBySource[source].add(v));
      // Remove original
      content = content.replace(line, '');
    }
  });

  // Re-inject combined imports right after `import path from 'path';`
  let newImports = '';
  for (const [source, varsSet] of Object.entries(importsBySource)) {
    if (varsSet.size > 0) {
      newImports += `import { ${Array.from(varsSet).join(', ')} } from '${source}';\n`;
    }
  }

  // Inject at top
  content = newImports + content;
  fs.writeFileSync(filePath, content);
  console.log('Fixed imports in', file);
});

