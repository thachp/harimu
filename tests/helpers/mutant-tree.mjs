/** Mutation tests run in a private copy of the repo, never in the shared working tree.
 *  `npm test` (and so `npm run check` in the preview deploy) runs test files in parallel processes. A mutant
 *  written into the real lib/ file is read by any other file that compiles its localRuntime() or imports that
 *  module during the window, so that file fails against the mutant (#1480 failed this way against #1477's
 *  list-cap mutant of lib/world-simulation.ts). Here the mutant only ever exists in a temporary copy.
 *  #1509: every mutation test uses this helper (tests/source-tree-guard-1509.test.mjs keeps it that way), and the
 *  copy fails loudly when it cannot load node_modules: a child run that dies on a missing package would otherwise
 *  exit non-zero and count every mutant as "caught". */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = fileURLToPath(new URL('../../', import.meta.url));
const skipped = new Set(['.git', 'node_modules', '.next', '.vinext', 'coverage', '.wrangler']);
/** A package every mutation run needs (tests/helpers/local-runtime.mjs transpiles with it). If it does not resolve, no mutant run is meaningful. */
const probePackage = join('node_modules', 'typescript', 'package.json');
/** A child that could not load a module never ran the assertions, so its non-zero exit says nothing about the mutant. */
const moduleLoadFailure = /ERR_MODULE_NOT_FOUND|Cannot find (?:package|module) /;
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function mutantTree({ repoRoot = defaultRepoRoot } = {}) {
  if (!existsSync(join(repoRoot, probePackage))) {
    throw new Error(`mutantTree: ${join(repoRoot, 'node_modules')} is missing or has no typescript; run npm ci first. Mutation runs without node_modules would count every mutant as caught.`);
  }
  const root = mkdtempSync(join(tmpdir(), 'harimu-mutant-'));
  try {
    cpSync(repoRoot, root, { recursive: true, filter: (source) => !skipped.has(relative(repoRoot, source).split(sep)[0]) });
    symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
  const assertLinked = () => {
    if (!existsSync(join(root, probePackage))) {
      throw new Error(`mutantTree: the node_modules link in ${root} is missing or broken; refusing to run, since every mutant would count as caught.`);
    }
  };
  assertLinked();
  // Probe run: a child in the copy must actually load typescript through the link before any mutant is judged.
  const probe = spawnSync('node', ['--input-type=module', '-e', "const ts = await import('typescript'); if (typeof ts.default.transpileModule !== 'function') process.exit(3);"], { encoding: 'utf8', cwd: root });
  if (probe.status !== 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`mutantTree: probe run in ${root} could not load typescript through the node_modules link (status ${probe.status}); refusing, since every mutant would count as caught:\n${probe.stderr}`);
  }
  return {
    root,
    /** Apply one find/replace to `file` (repo-relative) in the copy. Returns the restore function. */
    mutate(file, find, replace) {
      const path = join(root, file);
      const shared = join(repoRoot, file);
      const sharedHash = existsSync(shared) ? sha(shared) : null;
      const original = readFileSync(path, 'utf8');
      const next = original.replace(find, replace);
      assert.notEqual(next, original, `mutant did not apply in ${file}: ${find}`);
      writeFileSync(path, next);
      return () => {
        writeFileSync(path, original);
        assert.equal(existsSync(shared) ? sha(shared) : null, sharedHash, `#1509: the shared ${file} changed while its mutant lived in the copy`);
      };
    },
    /** Run the named test files (repo-relative) inside the copy, one at a time. Throws instead of returning a failed
     *  run when the copy cannot load node_modules or another module, because that failure is not the mutant's. */
    run(files, pattern) {
      assertLinked();
      const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
      const result = spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, ...files], { encoding: 'utf8', cwd: root, env });
      if (result.error) throw result.error;
      const output = `${result.stdout}\n${result.stderr}`;
      if (moduleLoadFailure.test(output)) {
        throw new Error(`mutantTree: the run in ${root} could not load a module, so it proves nothing about the mutant:\n${output}`);
      }
      return result;
    },
    close() { rmSync(root, { recursive: true, force: true }); },
  };
}
