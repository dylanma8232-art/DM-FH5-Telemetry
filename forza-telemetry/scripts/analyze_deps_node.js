const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const files = [
  '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/session/SessionChartsPanel.jsx',
  '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneShareModal.jsx'
];

files.forEach(filepath => {
  const code = fs.readFileSync(filepath, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx']
  });

  const undefinedVars = new Set();
  const declaredVars = new Set();
  
  // A simple pass to collect all explicitly declared variables/params in the top level component.
  // We'll let Babel do the scope tracking!
  
  traverse(ast, {
    Identifier(path) {
      if (path.isReferencedIdentifier()) {
        const name = path.node.name;
        if (!path.scope.hasBinding(name) && !global[name] && name !== 'console' && name !== 'window' && name !== 'document' && name !== 'Math') {
          undefinedVars.add(name);
        }
      }
    }
  });

  console.log(`\nUndefined in ${filepath.split('/').pop()}:`);
  const missing = Array.from(undefinedVars).sort().filter(v => !v.startsWith('React') && v !== 'undefined' && v !== 'NaN');
  console.log(missing.join(', '));
});
