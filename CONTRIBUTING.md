# Branch flow

`dev` is the default branch. `main` is the released branch.

| Step | From → To | Who |
| --- | --- | --- |
| Feature / fix PR | `<agent>/<issue>-<short>` → **`dev`** | engineers; merge after QA approval on the PR head and green CI |
| Preview deploy | **`dev`** → preview.harimu.com (`harimu-preview` Worker) | PM |
| Release PR | **`dev` → `main`** | PM only |
| Production deploy | **`main`** (separate, future workflow) | release owner |
| Hotfix | branch from `main` → PR into `main`, then merge `main` back into `dev` | PM / release owner |

Rules:
- Branch from and rebase onto `origin/dev`. Open every PR against `dev` and include `Closes #N`.
- Never push to `main` or `dev` directly, and never merge into `main` except through a PM release PR.
- A `dev` → `main` release PR merges only after QA2 posts a go/no-go on the release head with CI green, and PM is the one who merges it.
- CI (`.github/workflows/ci.yml`) runs `npm run check` on every pull request and on pushes to `main` and `dev`. It has no deploy step.
- Postgres migrations are applied by an admin before deploy (see README). Never upload `.env*` files.
