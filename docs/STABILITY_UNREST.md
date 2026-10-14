# Stability and Unrest score (#69)

Per-nation **Stability** (0–100) and **Unrest** (0–100) for Kindle, Korund and Aurelle, recalculated once per game day. This is the input contract for #70 (Korund purge) and #71 (Aurelle Rising). Source: `lib/stability.ts`. No AI is involved; scores are deterministic rules.

## Update cadence

- One score per nation per **world tick** (`tickSeconds = 7200`, one game day = two real hours).
- Written by `advanceWorld` (`lib/world-simulation.ts`) in the same batch as the tick row. That is the existing request-driven job: any `/api/world` or `/api/citizen` visit processes up to three overdue ticks.
- Idempotent: primary key `(nation_id, tick)` with `INSERT OR IGNORE`. A retried or concurrent tick never rewrites a recorded day.
- Inputs are read as of the tick's `scheduled_at` (catch-up ticks read current records, same as government proposals).

## Inputs (all from existing tables)

| Input | Measure | Stability | Unrest |
|---|---|---|---|
| baseline | — | +50 | +10 |
| food | % of the nation's citizens with a meal in the trailing 24 real h (`citizen_economy_events` kind `meal` / `korund_meals` / `aurelle_meals`) | `round((c−50)×0.3)` → −15..+15 | `round((100−c)×0.4)` → 0..40 |
| work | % of citizens who started a shift (`work_shifts.started_at`) in the trailing 24 real h | `round((w−50)×0.2)` → −10..+10 | `round((100−w)×0.15)` → 0..15 |
| promises | % of petitions reviewed in the trailing 7 real days that were `accepted` (vs `deferred`); no reviews = 0 points | `round((p−50)×0.2)` → −10..+10 | `round((100−p)×0.15)` → 0..15 |
| petitions | petitions with no resolution, per 100 citizens (cap 100) | `−round(s×0.15)` → −15..0 | `round(s×0.2)` → 0..20 |

With no citizens, food and work use a neutral 50%. Ranges guarantee Stability ∈ [0, 85] and Unrest ∈ [10, 100], so no clamping is applied and **the breakdown always sums exactly to the score**.

## Storage

`nation_stability_scores(nation_id, tick, scheduled_at, computed_at, stability, unrest, inputs_json, breakdown_json)`, PK `(nation_id, tick)`, index `(nation_id, scheduled_at)`. Migrations: `drizzle/0011_nation_stability.sql`, `db/postgres/0011_nation_stability.sql`.

## Server API (for #70 / #71)

```ts
import {latestStability, stabilityHistory, unrestAtOrAbove} from '@/lib/stability';

type StabilityRecord = {
  nationId: 'kindle'|'korund'|'aurelle'; tick: number; scheduledAt: number; // unix seconds
  stability: number; unrest: number;                                         // integers 0..100, raw truth
  inputs: {citizens; fed; worked; promisesKept; promisesBroken; petitionBacklog}; // counts
  breakdown: {stability: ScoreTerm[]; unrest: ScoreTerm[]};                 // ScoreTerm = {input, points, detail}
};

latestStability(db, nationId): Promise<StabilityRecord | null>
stabilityHistory(db, nationId, nowSeconds, sinceSeconds = 7*86400): Promise<StabilityRecord[]> // oldest first, (now−since, now]
unrestAtOrAbove(db, nationId, threshold, nowSeconds, days = 7):
  Promise<{days: number; recordedDays: number; sustainedSeconds: number}>
computeStability(inputs): {stability, unrest, breakdown}   // pure
```

- `days`: distinct real UTC days in the window where **every** recorded score had Unrest ≥ threshold. #70: `days >= 7` with `days = 7`.
- `sustainedSeconds`: span of the current unbroken run of scores ≥ threshold (latest − first in run). #71: `sustainedSeconds >= 48*3600` at threshold 60.
- Server code reads the raw truth for every nation, including Korund.

## Citizen-facing view

`SimulationState.stability: PublicStability[]` on `/api/world` and `/api/citizen` (the `simulation` field), rendered by `app/stability-panel.tsx` in the Government panel.

- Kindle / Aurelle: `{kind: 'measured', nationId, tick, scheduledAt, stability, unrest, breakdown}`.
- Korund (GDD 8.6): `{kind: 'state-approved', nationId, tick, scheduledAt, approvedStability, systemStats: {citizens, fedPercent, workedPercent, petitionBacklog}}`. `approvedStability = max(92, stability)`; raw Unrest and the breakdown are never sent to clients.

## Out of scope

Grievance/repression, war score, inequality, Currency Confidence, Religious Harmony, Unrest events and Crisis. Add new inputs as extra `ScoreTerm`s, keeping the ranges so the sum stays within 0..100.
