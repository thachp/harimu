/** Mutation tests run in a private copy of the repo, never in the shared working tree.
 *  `npm test` (and so `npm run check` in the preview deploy) runs test files in parallel processes. A mutant
 *  written into the real lib/ file is read by any other file that compiles its localRuntime() or imports that
 *  module during the window, so that file fails against the mutant (#1480 failed this way against #1477's
 *  list-cap mutant of lib/world-simulation.ts). Here the mutant only ever exists in a temporary copy. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const skipped = new Set(['.git', 'node_modules', '.next', '.vinext', 'coverage', '.wrangler']);

export function mutantTree() {
  const root = mkdtempSync(join(tmpdir(), 'harimu-mutant-'));
  cpSync(repoRoot, root, { recursive: true, filter: (source) => !skipped.has(relative(repoRoot, source).split(sep)[0]) });
  symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  return {
    root,
    /** Apply one find/replace to `file` (repo-relative) in the copy. Returns the restore function. */
    mutate(file, find, replace) {
      const path = join(root, file);
      const original = readFileSync(path, 'utf8');
      const next = original.replace(find, replace);
      assert.notEqual(next, original, `mutant did not apply in ${file}: ${find}`);
      writeFileSync(path, next);
      return () => writeFileSync(path, original);
    },
    /** Run the named test files (repo-relative) inside the copy, one at a time. */
    run(files, pattern) {
      const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
      return spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, ...files], { encoding: 'utf8', cwd: root, env });
    },
    close() { rmSync(root, { recursive: true, force: true }); },
  };
}
