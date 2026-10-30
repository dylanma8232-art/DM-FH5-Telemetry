import { transformWithEsbuild } from 'vite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
      const parentURL = new URL(context.parentURL);
      const url = new URL(specifier, parentURL);
      const extensions = ['.js', '.jsx', '/index.js', '/index.jsx'];
      for (const ext of extensions) {
        if (fs.existsSync(url.pathname + ext)) {
          return {
            shortCircuit: true,
            url: new URL(specifier + ext, parentURL).href,
          };
        }
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const filePath = fileURLToPath(url);
    const code = fs.readFileSync(filePath, 'utf8');
    const transformed = await transformWithEsbuild(code, filePath, {
      loader: 'jsx',
      jsx: 'automatic',
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: transformed.code,
    };
  }
  return nextLoad(url, context);
}
