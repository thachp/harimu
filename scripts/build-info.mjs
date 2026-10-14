/** #138: build identity stamped into the bundle (vite `define`). Public: commit SHA + build time only. */
import { execFileSync } from 'node:child_process';
const shaPattern = /^[0-9a-f]{7,40}$/;
export function buildInfo(env = process.env, now = new Date(), git = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
  let sha = env.GITHUB_SHA ?? env.HARIMU_BUILD_SHA ?? env.WORKERS_CI_COMMIT_SHA;
  if (!sha) { try { sha = git(); } catch { sha = undefined; } }
  return { sha: sha && shaPattern.test(sha.toLowerCase()) ? sha.toLowerCase() : 'unknown', builtAt: now.toISOString() };
}
