/** #1509: no test may write into the repo's lib/, app/ or worker/. `npm test` runs files in parallel processes, so a
 *  mutant written into the shared tree is compiled by other files (#1480 failed the b29d54cf preview deploy this way)
 *  and an interrupted run leaves it behind. Mutation tests use tests/helpers/mutant-tree.mjs instead.
 *  The guard is a static scan (tests/helpers/source-write-scan.mjs) of every test file and helper: deterministic under
 *  parallel `node --test`, where no suite-wide before/after hook exists for a hash snapshot to compare. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourceWrites } from './helpers/source-write-scan.mjs';

const testsDir = fileURLToPath(new URL('.', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(?:mjs|js|cjs|ts)$/.test(name) ? [path] : [];
});

test('#1509 guard: no test file or helper writes into lib/, app/ or worker/ (fs writes must target a tmpdir or a mutantTree copy)', () => {
  const files = walk(testsDir);
  assert.ok(files.length > 100, `the scan found only ${files.length} test files`);
  const findings = files.flatMap((path) => sourceWrites(readFileSync(path, 'utf8')).map((f) => `${relative(testsDir, path)}:${f.line} ${f.call}(${f.target})`));
  assert.deepEqual(findings, [], `these writes can land in the shared source tree; mutate a mutantTree() copy or a mkdtemp dir instead:\n${findings.join('\n')}`);
});

// The scanner is only a guard if it flags the patterns that caused #1480. These are the shapes the six tests used before #1509.
const inPlaceMutate = `import {readFileSync,writeFileSync} from 'node:fs';
const mutate=(file,find,replace)=>{
  const original=readFileSync(file,'utf8');
  const next=original.replace(find,replace);
  writeFileSync(file,next);
  return ()=>writeFileSync(file,original);
};`;

test('#1509 guard self-test: the pre-#1509 in-place mutate helper is flagged on both the mutant write and the restore', () => {
  assert.deepEqual(sourceWrites(inPlaceMutate).map((f) => [f.line, f.call, f.target]), [[5, 'writeFileSync', 'file'], [6, 'writeFileSync', 'file']]);
});

test('#1509 guard self-test: direct, namespaced, promise, dynamic-import, copy and rename writes into the source tree are flagged', () => {
  const flagged = {
    literal: "import { writeFileSync } from 'node:fs'; writeFileSync('lib/war.ts', 'x');",
    worker: "import { copyFileSync, mkdtempSync } from 'node:fs'; const tmp = mkdtempSync('/tmp/a'); copyFileSync(tmp + '/x', 'worker/index.ts');",
    repoRoot: "import fs from 'node:fs'; import { join } from 'node:path'; const repoRoot = new URL('..', import.meta.url).pathname; fs.writeFileSync(join(repoRoot, 'app/page.tsx'), '');",
    promises: "import { writeFile } from 'node:fs/promises'; await writeFile(new URL('../lib/war.ts', import.meta.url), '');",
    dynamic: "const { renameSync } = await import('node:fs'); renameSync('lib/a.ts', 'lib/a.bak');",
    aliased: "import { writeFileSync as put } from 'node:fs'; put('app/x.ts', '');",
    namespaceStar: "import * as fs from 'node:fs'; fs.promises.rm('lib', { recursive: true });",
  };
  for (const [name, src] of Object.entries(flagged)) assert.ok(sourceWrites(src).length > 0, `${name} was not flagged`);
});

test('#1509 guard self-test: writes into mkdtemp dirs, os.tmpdir(), a mutantTree copy and env-provided paths are allowed', () => {
  const allowed = [
    "import { mkdtempSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; const out = join(mkdtempSync(join(tmpdir(), 'x-')), 'x.mjs'); writeFileSync(out, '');",
    "import { writeFileSync } from 'node:fs'; import { join } from 'node:path'; import { mutantTree } from './helpers/mutant-tree.mjs'; const tree = mutantTree(); writeFileSync(join(tree.root, 'tests/probe.test.mjs'), '');",
    "import { writeFile } from 'node:fs/promises'; await writeFile(process.env.HARIMU_THEME_FIXTURE, '');",
    "import { readFileSync } from 'node:fs'; readFileSync('lib/war.ts', 'utf8');",
    "const handle = { writeFile() {} }; handle.writeFile('lib/x');",
  ];
  for (const src of allowed) assert.deepEqual(sourceWrites(src), [], src);
});
