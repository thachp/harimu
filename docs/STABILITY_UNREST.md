# Stability and Unrest score (#69)

Per-nation **Stability** (0–100) and **Unrest** (0–100) for Kindle, Korund and Aurelle, recalculated once per game day. This is the input contract for #70 (Korund purge) and #71 (Aurelle Rising). Source: `lib/stability.ts`. No AI is involved; scores are deterministic rules.

## Update cadence

- One score per nation per **world tick** (`tickSeconds = 7200`, one game day = two real hours).
- Written by `advanceWorld` (`lib/world-simulation.ts`) in the same batch as the tick row. That is the existing request-driven job: any `/api/world` or `/api/citizen` visit processes up to three overdue ticks.
- Idempotent: primary key `(nation_id, tick)` with `INSERT OR IGNORE`. A retried or concurrent tick never rewrites a recorded day.
- Inputs are read as of the tick's `scheduled_at` (catch-up ticks read current records, same as government proposals).

## Factors

Scores are deterministic rules over records the game already keeps. Exact weights and formulas live in `lib/stability.ts` only and are intentionally not published here.

- **Food:** how many of the nation's citizens ate recently. Better coverage raises Stability and lowers Unrest.
- **Work:** how many citizens took a shift recently. Higher turnout raises Stability and lowers Unrest.
- **Promise-keeping:** how often the government accepted, rather than deferred, reviewed petitions over the past week. No reviews is neutral.
- **Petition backlog:** petitions still awaiting review, relative to population. A larger backlog lowers Stability and raises Unrest.

Each factor has a bounded contribution, so both scores always stay within 0–100 without clamping, and **the stored breakdown always sums exactly to the score**.

## Storage

`nation_stability_scores(nation_id, tick, scheduled_at, computed_at, stability, unrest, inputs_json, breakdown_json)`, PK `(nation_id, tick)`, index `(nation_id, scheduled_at)`. Migrations: `drizzle/0012_nation_stability.sql`, `db/postgres/0012_nation_stability.sql`.

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
- `sustainedSeconds`: real time covered by the current unbroken run of scores ≥ threshold, counting each score as one full tick (latest − first + 7200 s; one qualifying score = 2 h, 24 consecutive = 48 h). #71: `sustainedSeconds >= 48*3600` at threshold 60.
- **`sustainedSeconds` undercounts, never overcounts.** Ticks are processed only when someone visits (at most three overdue ticks per visit). Ticks that are never processed have no score, and the run spans only recorded scores. So after quiet periods or skipped catch-up the value can be lower than the real time Unrest stayed high. Callers should treat it as a conservative lower bound, and #71 should not expect it to be exact.
- Server code reads the raw truth for every nation, including Korund.

## Citizen-facing view

`SimulationState.stability: PublicStability[]` on `/api/world` and `/api/citizen` (the `simulation` field), rendered by `app/stability-panel.tsx` in the Government panel.

- Kindle / Aurelle: `{kind: 'measured', nationId, tick, scheduledAt, stability, unrest, breakdown}`.
- Korund (GDD 8.6, architect decision on #95): `{kind: 'state-approved', nationId, tick, scheduledAt, approvedStability, systemStats: {citizensApprox, foodSupply, workTurnout}}`. `approvedStability` is a constant (92). The system stats are truthful but coarse: `citizensApprox` is the true count rounded to the nearest 10, and `foodSupply` / `workTurnout` are the true rates as `'Low' | 'Mid' | 'High'` bands. Raw Stability, Unrest, the breakdown and exact inputs are never sent to clients, so the true score cannot be reconstructed. True values stay server-side (`latestStability` etc.).

## Out of scope

Grievance/repression, war score, inequality, Currency Confidence, Religious Harmony, Unrest events and Crisis. Add new inputs as extra `ScoreTerm`s, keeping the ranges so the sum stays within 0..100.
