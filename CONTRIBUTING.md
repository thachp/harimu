# Branch flow

`dev` is the default branch. Flow: **`dev` → `release` → `main`** (#177). `main` is the released branch.

| Step | From → To | Who |
| --- | --- | --- |
| Feature / fix PR | `<agent>/<issue>-<short>` → **`dev`** | engineers; merge after QA approval on the PR head and green CI |
| Release cut | **`dev` → `release`** (daily) | PM |
| Preview deploy | **`release`** → preview.harimu.com (`harimu-preview` Worker) | automatic on every push to `release` (`deploy-preview.yml`, #177); `dev` never deploys |
| Release PR | **`release` → `main`** | PM only |
| Production deploy | **`main`** (separate, future workflow) | release owner |
| Hotfix | branch from `release` → PR into `release`, then merge `release` back into `dev` | PM / release owner |

Rules:
- Branch from and rebase onto `origin/dev`. Open every PR against `dev` and include `Closes #N`.
- Never push to `main`, `release` or `dev` directly, and never merge into `main` except through a PM release PR.
- A `release` → `main` release PR merges only after QA2 posts a go/no-go on preview deployed from the release head with CI green, and PM is the one who merges it.
- CI (`.github/workflows/ci.yml`) runs `npm run check` on every pull request and on pushes to `main`, `release` and `dev`. It has no deploy step; `deploy-preview.yml` runs its own `npm run check` before migrating and deploying.
- Postgres migrations are applied by an admin before deploy (see README). Never upload `.env*` files.
