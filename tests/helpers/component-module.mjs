/** Compile real app/*.tsx components for server rendering in node:test (no bundler). CSS imports become empty modules. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = new Map();
export async function componentModule(path) {
  if (cache.has(path)) return cache.get(path);
  const source = (await readFile(path, 'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g, '');
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]) {
    const specifier = match[2]; let url;
    if (specifier.endsWith('.css')) url = 'data:text/javascript,export default {}';
    else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(path), specifier); let child;
      for (const extension of ['.ts', '.tsx']) { try { await readFile(base + extension); child = base + extension; break; } catch { /* try the other extension */ } }
      if (!child) throw new Error(`Cannot resolve ${specifier} from ${path}`);
      url = await componentModule(child);
    } else url = import.meta.resolve(specifier);
    output = output.replace(match[0], `from ${JSON.stringify(url)}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  cache.set(path, url); return url;
}
export const loadApp = async name => import(await componentModule(resolve(root, `app/${name}.tsx`)));
