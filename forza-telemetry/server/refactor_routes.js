import fs from 'fs';
import path from 'path';
import * as babel from '@babel/core';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

// Handle default exports depending on the environment
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;
const t = babel.types;

const ROUTES_DIR = path.resolve('./src/routes');

fs.readdirSync(ROUTES_DIR).forEach(file => {
  if (!file.endsWith('.js')) return;
  const filePath = path.join(ROUTES_DIR, file);
  const code = fs.readFileSync(filePath, 'utf-8');

  // Skip if already contains asyncHandler
  if (code.includes('asyncHandler')) {
    console.log(`Skipping ${file}, already contains asyncHandler`);
    return;
  }

  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx']
  });

  let needsAsyncHandler = false;

  traverse(ast, {
    CallExpression(path) {
      // Find router.get, router.post, etc.
      if (
        t.isMemberExpression(path.node.callee) &&
        t.isIdentifier(path.node.callee.object, { name: 'router' }) &&
        ['get', 'post', 'put', 'delete', 'patch'].includes(path.node.callee.property.name)
      ) {
        const args = path.node.arguments;
        // The last argument is typically the handler
        const handlerIndex = args.length - 1;
        const handler = args[handlerIndex];

        if (t.isArrowFunctionExpression(handler) || t.isFunctionExpression(handler)) {
          const body = handler.body;
          
          if (t.isBlockStatement(body)) {
            // Find top-level try-catch
            const tryStatementIndex = body.body.findIndex(stmt => t.isTryStatement(stmt));
            
            if (tryStatementIndex !== -1) {
              needsAsyncHandler = true;
              const tryStmt = body.body[tryStatementIndex];
              
              // Replace try statement with its block content
              body.body.splice(tryStatementIndex, 1, ...tryStmt.block.body);
              
              // Ensure handler is async
              handler.async = true;

              // Wrap handler in asyncHandler
              path.node.arguments[handlerIndex] = t.callExpression(
                t.identifier('asyncHandler'),
                [handler]
              );
            }
          }
        }
      }
    }
  });

  if (needsAsyncHandler) {
    // Add import statement at the top
    const importStmt = t.importDeclaration(
      [t.importSpecifier(t.identifier('asyncHandler'), t.identifier('asyncHandler'))],
      t.stringLiteral('../utils/asyncHandler.js')
    );
    ast.program.body.unshift(importStmt);

    const output = generate(ast, {
      retainLines: true,
      compact: false,
    }, code);

    fs.writeFileSync(filePath, output.code);
    console.log(`Refactored ${file}`);
  }
});
