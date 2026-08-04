const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const filepath = '/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx';
const code = fs.readFileSync(filepath, 'utf8');
const ast = parser.parse(code, {
  sourceType: 'module',
  plugins: ['jsx']
});

const undefinedVars = new Set();
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
const missing = Array.from(undefinedVars).sort().filter(v => !v.startsWith('React') && v !== 'undefined' && v !== 'NaN');
console.log("TuneDiagnosticModal missing:", missing.join(', '));
