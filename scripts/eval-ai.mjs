// #615: npm run eval:ai. Offline: fixture outputs through each AI feature's real validator; no model call, no network, no secrets.
import { localRuntime } from '../tests/helpers/local-runtime.mjs';
import { pathToFileURL } from 'node:url';
import { evalFeatures, evalTable, featureValidators, readFixtures, runEvals } from '../tests/ai-evals/harness.mjs';

const dir = process.argv[2] ? pathToFileURL(`${process.argv[2].replace(/\/?$/, '/')}`) : undefined; // optional fixture directory (default tests/ai-evals/)

const runtime = await localRuntime(); // used only to load the transpiled lib modules
try {
  const result = runEvals(await featureValidators(runtime.importModule), Object.fromEntries(evalFeatures.map(f => [f, readFixtures(f, dir)])));
  console.log(evalTable(result));
  process.exitCode = result.escapes.length ? 1 : 0;
} finally { await runtime.close(); }
