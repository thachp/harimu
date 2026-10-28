import { mapLimited } from './async-limits'; // #679
import { runVoteBuyingWatch } from './vote-buying-watch'; // #825
import { runRiskScoring } from './risk-scoring'; // #879
import { dormantAt } from './dormancy-rules'; // #739
import { runFoundingDay30 } from './founding-period'; // #612
import { finalizeDueElection } from './elections';
import { runKindleAssembly, type AssemblyTickConfig } from './assembly';
import { runPrimaries, type PrimaryScope } from './primaries';
import { accountElectionDatabase } from './preview-election';
import type {GameDatabase} from './database-contract';
import { readGovernment } from './government-state';
import { runSpoilage } from './spoilage';
import { runAurelleRising } from './aurelle-rising';
import { runAurelleCoup } from './aurelle-coup';
import { runKorundPresidium } from './korund-presidium';
import { runNpcSupply } from './npc-supply';
import { readPublicWeariness, readWarWeariness, type PublicWeariness } from './war-weariness'; // #423
import { festivalStance, holidayNationsOn } from './festivals';
import { recordFinishedBattles } from './army-battle';
import { readHarmonyScores } from './religious-harmony';
import { readWars, type WarState } from './war'; // #309
import { readSiegeSnapshot, type SiegeSnapshotItem } from './siege-actions'; // #620
import { readTreaties, runDiplomacy, type TreatyState } from './diplomacy'; // #308
import { readEmbargoes, runEmbargo, type EmbargoState } from './embargo'; // #363
import { decideProposedGoodsSanctions } from './goods-sanctions'; // #601
import { decideKindleWarProposals, readWarProposals } from './war-assembly'; // #427
import { decideWarEndings, readWarEndings } from './war-endings'; // #427 slice 2
import { readReserveBoard, type ReserveBoard } from './spark-supply'; // #431
import { runKorundRaids } from './korund-underground'; // #295
import { stabilityStatements, stabilityNations, readPublicStability, isMissingStabilityTable, type PublicStability } from './stability';

export const tickSeconds = 7200;
export const maximumCatchupTicks = 3;
/** #159: how many ticks before the catch-up window are re-checked for missing scores (12 = one real day). */
const scoreRepairTicks=12;
/** #679: at most this many missing ticks have their score inputs read at once, so a long repair can't flood the connection pool. */
export const scoreRepairConcurrency=4;
// These schema exports are for local SQL fixtures; production uses additive Drizzle migrations.
export const worldClockSchema = `CREATE TABLE world_clock (id TEXT PRIMARY KEY CHECK(id='main'), epoch_seconds INTEGER NOT NULL)`;
export const worldTickSchema = `CREATE TABLE world_ticks (tick INTEGER PRIMARY KEY CHECK(tick>0), scheduled_at INTEGER NOT NULL, processed_at INTEGER NOT NULL, proposals_json TEXT NOT NULL)`;
export const worldSupplySchema = `CREATE TABLE world_supply (id TEXT PRIMARY KEY, initial_food INTEGER NOT NULL CHECK(initial_food>=0), unit_minor INTEGER NOT NULL CHECK(unit_minor>0))`;
export const policyExecutionSchema = `CREATE TABLE government_policy_executions (
  tick INTEGER PRIMARY KEY REFERENCES world_ticks(tick), nation_id TEXT NOT NULL CHECK(nation_id='kindle'),
  topic TEXT NOT NULL CHECK(topic='food'), food_quantity INTEGER NOT NULL CHECK(food_quantity BETWEEN 1 AND 10),
  spend_minor INTEGER NOT NULL CHECK(spend_minor>0), scheduled_at INTEGER NOT NULL, executed_at INTEGER NOT NULL,
  CHECK(spend_minor=food_quantity*100)
)`;
export const policyExecutionSql = `INSERT OR IGNORE INTO government_policy_executions
  (tick,nation_id,topic,food_quantity,spend_minor,scheduled_at,executed_at)
  SELECT tick,'kindle','food',quantity,quantity*100,scheduled_at,? FROM (
    SELECT t.tick,t.scheduled_at,MIN(10,s.initial_food-COALESCE((SELECT SUM(food_quantity) FROM government_policy_executions),0),
      MAX(0,20-(SELECT stock FROM merchant_inventory_balances WHERE item='food')),
      CAST(MIN(COALESCE(json_extract(t.proposals_json,'$[0].decision.proposedSpendMinor'),0),f.initial_minor-COALESCE((SELECT SUM(wage_minor) FROM shift_settlements),0)
        -COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0))/100 AS INTEGER)) AS quantity
    FROM world_ticks t JOIN world_supply s ON s.id='kindle-food-supplier' JOIN economy_funds f ON f.id='kindle-employer'
    WHERE t.tick=? AND s.unit_minor=100 AND json_extract(t.proposals_json,'$[0].decision.topic')='food' AND (SELECT stock FROM merchant_inventory_balances WHERE item='food')<20
      AND (SELECT COUNT(*) FROM government_policy_executions WHERE scheduled_at>=CAST(t.scheduled_at/86400 AS INTEGER)*86400
        AND scheduled_at<CAST(t.scheduled_at/86400 AS INTEGER)*86400+86400)<2
  ) WHERE quantity>0`;

export type WorldClock = {
  compression: 12; epochSeconds: number; nowSeconds: number; gameDay: number;
  latestTick: number; pendingTicks: number; cadenceSeconds: number;
  mode: 'request-driven durable simulation';
};
export type PolicyExecution = { tick: number; nationId: string; topic: string; foodQuantity: number;
  spendMinor: number; scheduledAt: number; executedAt: number };
export type SimulationState = { clock: WorldClock; latestExecution: PolicyExecution | null;
  supplierFoodRemaining: number; supplierCashMinor: number; stability?: PublicStability[]; wars?: WarState; sieges?: SiegeSnapshotItem[]; weariness?: PublicWeariness; treaties?: TreatyState; embargoes?: EmbargoState; reserve?: ReserveBoard; warProposals?: Awaited<ReturnType<typeof readWarProposals>> };

type RunnerOptions = Parameters<typeof advanceWorld>[2];
/** #679: one flag-gated world runner. `run` is only called when its flag is on. */
export type WorldRunner = { name: string; on: boolean; run: () => Promise<unknown> };
const warnOnly = (label: string) => (error: unknown) => { console.warn(`[world] ${label} tick failed`, error instanceof Error ? error.name : 'unknown'); };
/** #679: the runner chains, in the order the sequential tick ran them. Chains touch separate state and run concurrently; inside a chain the order is kept:
 *  market (spoilage, then NPC asks), Aurelle (Rising, then coup), Kindle (primaries, then Assembly), Korund (Presidium, then inspections),
 *  foreign affairs (treaties, then goods sanctions, then embargoes), and the founding day-30 event. */
export function worldRunnerChains(db: GameDatabase, now: number, options: RunnerOptions = {}): WorldRunner[][] {
  const current = options.npcSupply ? db.prepare('SELECT tick,scheduled_at FROM world_ticks ORDER BY tick DESC LIMIT 1') : null;
  let market: Promise<{tick:number;scheduled_at:number} | null> | undefined;
  const marketTick = () => (market ??= current!.first<{tick:number;scheduled_at:number}>());
  return [
    // Market day, only while the order book is on (write paths only). Idempotent per tick: #199 fruit and meat spoil first, then #198 NPC farm asks are posted for the current game day.
    [{ name: 'spoilage', on: options.npcSupply === true, run: async () => { const tick = await marketTick(); if (tick) await runSpoilage(db, Number(tick.tick), now, Number(tick.scheduled_at)); } },
     { name: 'npcSupply', on: options.npcSupply === true, run: async () => { const tick = await marketTick(); if (tick) await runNpcSupply(db, Number(tick.tick), Number(tick.scheduled_at), now, tickSeconds); } }],
    // #71 Aurelle Rising thresholds and Crisis Window resolution, then #281 the AI palace coup (each only while its flag is on).
    [{ name: 'aurelleRising', on: options.aurelleRising === true, run: () => runAurelleRising(db, now) },
     { name: 'aurelleCoup', on: options.aurelleCoup === true, run: () => runAurelleCoup(db, now, options.favorDecay === true) }],
    // #307 Kindle party primaries, then #283 the mid-term Assembly (each only while its flag is on and the privacy gate is open).
    [{ name: 'primaries', on: Boolean(options.primaries), run: () => runPrimaries(db, now, options.primaries!).catch(warnOnly('primaries')) },
     { name: 'kindleAssembly', on: Boolean(options.kindleAssembly), run: () => runKindleAssembly(db, now, options.kindleAssembly!).catch(warnOnly('Assembly')) }],
    // #70 Korund emergency Presidium session and succession, then #295 underground inspections (capped, while HARIMU_FAITH_ENABLED is on).
    [{ name: 'korundPresidium', on: options.korundPresidium === true, run: () => runKorundPresidium(db, now) },
     { name: 'korundRaids', on: options.faithFestivals === true, run: () => runKorundRaids(db, now).catch(warnOnly('Korund inspection')) }],
    // #308 AI treaties, then #601 targeted goods sanctions (only the citizen POST path passes it, never a GET), then #363 embargoes.
    [{ name: 'diplomacy', on: options.diplomacy === true, run: () => runDiplomacy(db, now).catch(warnOnly('diplomacy')) },
     { name: 'targetedSanctions', on: options.targetedSanctions === true, run: () => decideProposedGoodsSanctions(db, now).catch(warnOnly('goods sanction')) },
     { name: 'embargo', on: options.embargo === true, run: () => runEmbargo(db, now).catch(warnOnly('embargo')) },
     // #427: the Kindle Assembly votes on pending war declarations after diplomacy, so a pact ratified this tick blocks the declaration on re-check
     // (only while HARIMU_WAR_ENABLED and HARIMU_WAR_ASSEMBLY_ENABLED are on; citizen POST path only).
     { name: 'warAssembly', on: options.war === true && options.warAssembly === true, run: () => decideKindleWarProposals(db, now, options.warLimits === true, { enabled: options.warWeariness === true, losses: options.warWearinessLosses === true }).catch(warnOnly('war assembly')) },
     // #427 slice 2: surrender and concession endings, decided once, also after diplomacy (HARIMU_WAR_ENABLED and HARIMU_WAR_ENDINGS_ENABLED; citizen POST path only).
     { name: 'warEndings', on: options.war === true && options.warEndings === true, run: () => decideWarEndings(db, now, { enabled: options.warWeariness === true, losses: options.warWearinessLosses === true }).catch(warnOnly('war endings')) }],
    // #612: the Founding Period's one day-30 event per MVP nation (idempotent).
    [{ name: 'foundingDay30', on: options.foundingPeriod === true, run: () => runFoundingDay30(db, now).catch(warnOnly('founding day-30')) }],
    // #825 Kindle vote-buying watch: one idempotent sweep statement over direct transfers/gifts only (none exist yet, so no query) (HARIMU_VOTE_BUYING_WATCH_ENABLED; citizen POST path only, never a GET).
    [{ name: 'voteBuyingWatch', on: options.voteBuyingWatch === true, run: () => runVoteBuyingWatch(db, now).catch(warnOnly('vote-buying watch')) }],
    // #879 integrity risk scores (docs §20): one idempotent upsert for staff review. HARIMU_RISK_SCORING_ENABLED; citizen POST path only, never a GET. Off: this runner does not run.
    [{ name: 'riskScoring', on: options.riskScoring === true, run: () => runRiskScoring(db, now).catch(warnOnly('risk scoring')) }],
    // #738 battles (ARC on #910): finished battles are stored once (conditional insert), so a decided battle never changes; GETs only read them.
    [{ name: 'armyBattles', on: options.armyBattles === true, run: () => recordFinishedBattles(db, now) }],
  ];
}
/** #679: run the chains concurrently, each in order. A runner that throws ends its own chain and still fails the request, but only after every other chain has
 *  settled, so no write is left running behind a 500. The first failure is rethrown; any further ones are logged, never dropped. */
export async function runWorldChains(chains: WorldRunner[][]): Promise<void> {
  const outcomes = await Promise.allSettled(chains.map(async chain => { for (const runner of chain) if (runner.on) await runner.run(); }));
  const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected').map(outcome => outcome.reason);
  for (const extra of failures.slice(1)) console.warn('[world] another runner chain failed', extra instanceof Error ? extra.name : 'unknown');
  if (failures.length) throw failures[0];
}

/** Request-driven bounded catch-up, not an always-on scheduler. Transactions own transfers. */
export async function advanceWorld(db: GameDatabase, now = Math.floor(Date.now()/1000), options: { armyBattles?: boolean; religiousHarmony?: boolean; reserve?: boolean; npcSupply?: boolean; aurelleRising?: boolean; aurelleCoup?: boolean; favorDecay?: boolean; kindleAssembly?: AssemblyTickConfig | null; voteBuyingWatch?: boolean; riskScoring?: boolean; dormancy?: boolean; primaries?: { scope: PrimaryScope; openAt: number | null } | null; korundPresidium?: boolean; faithFestivals?: boolean; diplomacy?: boolean; embargo?: boolean; targetedSanctions?: boolean; war?: boolean; warAssembly?: boolean; warEndings?: boolean; warLimits?: boolean; warWeariness?: boolean; warWearinessLosses?: boolean; foundingPeriod?: boolean } = {}): Promise<SimulationState> {
  if (!Number.isSafeInteger(now) || now<0) throw new Error('Invalid authoritative world time.');
  // #221: due preview elections close and record their count on the tick, so GET /api/election never writes.
  await Promise.all([db, accountElectionDatabase(db)].map(electionDb => finalizeDueElection(electionDb, now).catch(error => { console.warn('[world] due election finalize failed', error instanceof Error ? error.name : 'unknown'); }))); // #668: the two ballots are separate rows, so they close concurrently
  // #679 slice 3: the clock insert and the two clock reads share one batch (one round trip, one transaction), so the reads still see the insert, as when they ran after it.
  const [, clockResult, lastResult] = await db.batch([
    db.prepare("INSERT OR IGNORE INTO world_clock (id,epoch_seconds) VALUES ('main',?)").bind(Math.floor(now/tickSeconds)*tickSeconds),
    db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'"),
    db.prepare('SELECT COALESCE(MAX(tick),0) AS tick FROM world_ticks'),
  ]);
  const clock = clockResult?.results[0] as {epoch_seconds:number} | undefined, last = lastResult?.results[0] as {tick:number} | undefined;
  const epoch = clock!.epoch_seconds;
  const due = Math.max(0,Math.floor((now-epoch)/tickSeconds));
  for (let tick=(last?.tick ?? 0)+1; tick<=Math.min(due,(last?.tick ?? 0)+maximumCatchupTicks); tick++) {
    const scheduledAt = epoch+tick*tickSeconds;
    // Catch-up evaluates current authoritative needs, not reconstructed historical households.
    const proposals = await Promise.all(['kindle','korund','aurelle'].map(id=>readGovernment(db,id,scheduledAt)));
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO world_ticks (tick,scheduled_at,processed_at,proposals_json) VALUES (?,?,?,?)')
        .bind(tick,scheduledAt,now,JSON.stringify(proposals)),
      db.prepare(policyExecutionSql).bind(now,tick),
    ]);
  }
  // #95 hotfix / #159: scores are written after the ticks commit, so a missing nation_stability_scores table
  // can't abort a tick. Each pass (re)writes scores for every recent tick that lacks them, so a transient
  // failure is repaired on the next request instead of leaving a permanent gap. INSERT OR IGNORE keeps it idempotent.
  try {
    const missing = await db.prepare(`SELECT t.tick,t.scheduled_at FROM world_ticks t WHERE t.tick>(SELECT COALESCE(MAX(tick),0) FROM world_ticks)-?
      AND (SELECT COUNT(*) FROM nation_stability_scores s WHERE s.tick=t.tick)<${stabilityNations.length} ORDER BY t.tick`)
      .bind(maximumCatchupTicks+scoreRepairTicks).all<{tick:number;scheduled_at:number}>();
    // #679: the score inputs only read source tables (never nation_stability_scores), so missing ticks' inputs are read concurrently (scoreRepairConcurrency at a time) and all
    // scores are written in one batch, oldest tick first, instead of a read and a batch per tick in a row.
    const statements = await mapLimited(missing.results, scoreRepairConcurrency, async row => {
      // #423: war weariness reads the wars table as of the tick's own time (only while both war flags are on), so a catch-up or repaired tick scores the same as a live one.
      // #739 slice 2 (ARC on #815): only the live-scored tick (the latest due one, scheduled_at + tickSeconds > now) excludes Dormant citizens. Catch-up ticks
      // (due while no request arrived) and #679-repaired past ticks keep the old full count, even after deploy: no flag-on time is recorded, and dormancy history
      // is not reconstructed (last_active_at is only the current value). Pinned by tests/dormancy-stability-739.test.mjs.
      const live = options.dormancy === true && Number(row.scheduled_at)+tickSeconds>now;
      // #842: Religious Harmony as of the tick's own time, only while HARIMU_RELIGIOUS_HARMONY_ENABLED is on (flag off: no reads, inputs unchanged).
      const holidays = options.faithFestivals ? holidayNationsOn(Math.floor(Number(row.scheduled_at)/tickSeconds),tickSeconds) : undefined;
      // QA3 on #854: Harmony (one query for all nations) is read alongside war weariness, so it adds no sequential round trip when both are on.
      const [weariness, harmony] = await Promise.all([options.warWeariness ? readWarWeariness(db,Number(row.scheduled_at),{ losses: options.warWearinessLosses }) : undefined,
        options.religiousHarmony ? readHarmonyScores(db,Number(row.scheduled_at),holidays,festivalStance) : undefined]);
      return stabilityStatements(db,Number(row.tick),Number(row.scheduled_at),now,{...(harmony?{harmony}:{}),...(live?{dormantBefore:dormantAt(Number(row.scheduled_at))}:{}),...(options.faithFestivals?{holidayNations:holidayNationsOn(Math.floor(Number(row.scheduled_at)/tickSeconds),tickSeconds)}:{}),...(weariness?{warWeariness:weariness}:{})});
    });
    if (statements.length) await db.batch(statements.flat());
  } catch (error) { if (!isMissingStabilityTable(error)) throw error; console.warn('[stability] nation_stability_scores missing; apply migration 0012. Ticks recorded without scores.'); }
  // #679: the flag-gated runners each cost several sequential database round trips, and over Hyperdrive every round trip is slow, so one GET /api/world with the
  // preview flags on waited for all of them in a row (about 80 round trips, ~30 s on preview). Runners that touch separate state run as concurrent chains (see
  // worldRunnerChains); inside a chain the old order is kept. Every runner is idempotent per tick or time as before.
  await runWorldChains(worldRunnerChains(db, now, options));
  return readWorldSimulation(db, now, { war: options.war, warAssembly: options.warAssembly, warEndings: options.warEndings, warWeariness: options.warWeariness, warWearinessLosses: options.warWearinessLosses, diplomacy: options.diplomacy, embargo: options.embargo, reserve: options.reserve });

}

/** #205: the same snapshot advanceWorld returns, computed without any write. Due-but-unprocessed ticks show as
 *  pendingTicks; the next write path (or GET /api/world) processes them. */
/** #309: `war` (HARIMU_WAR_ENABLED) adds the derived war state; with it off nothing is queried or returned. */
export async function readWorldSimulation(db: GameDatabase, now = Math.floor(Date.now()/1000), options: { war?: boolean; warAssembly?: boolean; warEndings?: boolean; warWeariness?: boolean; warWearinessLosses?: boolean; diplomacy?: boolean; embargo?: boolean; reserve?: boolean } = {}): Promise<SimulationState> {
  if (!Number.isSafeInteger(now) || now<0) throw new Error('Invalid authoritative world time.');
  // #668: every read here is independent, so they share one round of round trips instead of queueing (the flag-gated war, treaty, embargo and reserve reads included).
  const none = Promise.resolve(undefined);
  const [clock,latest,execution,supply,stability,wars,sieges,weariness,treaties,embargoes,reserve,warProposals,warEndings] = await Promise.all([
    db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>(),
    db.prepare('SELECT COALESCE(MAX(tick),0) AS tick FROM world_ticks').first<{tick:number}>(),
    db.prepare('SELECT tick,nation_id,topic,food_quantity,spend_minor,scheduled_at,executed_at FROM government_policy_executions ORDER BY tick DESC LIMIT 1')
      .first<{tick:number;nation_id:string;topic:string;food_quantity:number;spend_minor:number;scheduled_at:number;executed_at:number}>(),
    db.prepare("SELECT initial_food-COALESCE((SELECT SUM(food_quantity) FROM government_policy_executions),0) AS food, COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0) AS cash FROM world_supply WHERE id='kindle-food-supplier'")
      .first<{food:number;cash:number}>(),
    readPublicStability(db),
    options.war ? readWars(db,now) : none,
    options.war ? readSiegeSnapshot(db,now) : none,
    options.war && options.warWeariness ? readPublicWeariness(db,now,{ losses: options.warWearinessLosses }) : none,
    options.diplomacy ? readTreaties(db,now) : none,
    options.embargo ? readEmbargoes(db) : none,
    options.reserve ? readReserveBoard(db,now) : none,
    options.war && options.warAssembly ? readWarProposals(db) : none, // #427: the Assembly's pending and recent votes, read-only
    options.war && options.warEndings ? readWarEndings(db) : none, // #427 slice 2: pending and recent endings, read-only
  ]);
  const epoch = clock ? Number(clock.epoch_seconds) : Math.floor(now/tickSeconds)*tickSeconds;
  const due = Math.max(0,Math.floor((now-epoch)/tickSeconds));
  return {clock:{compression:12,epochSeconds:epoch,nowSeconds:now,gameDay:Math.floor(Math.max(0,now-epoch)*12/86400)+1,
    latestTick:latest?.tick ?? 0,pendingTicks:Math.max(0,due-(latest?.tick ?? 0)),cadenceSeconds:tickSeconds,mode:'request-driven durable simulation'},
    latestExecution:execution ? {tick:execution.tick,nationId:execution.nation_id,topic:execution.topic,foodQuantity:execution.food_quantity,
      spendMinor:execution.spend_minor,scheduledAt:execution.scheduled_at,executedAt:execution.executed_at}:null,
    supplierFoodRemaining:supply?.food ?? 0,supplierCashMinor:supply?.cash ?? 0,stability,...(options.war?{wars:wars!,sieges:sieges!}:{}),...(options.war&&options.warWeariness?{weariness:weariness!}:{}),...(options.war&&options.warAssembly?{warProposals:warProposals!}:{}),...(options.war&&options.warEndings?{warEndings:warEndings!}:{}),...(options.diplomacy?{treaties:treaties!}:{}),...(options.embargo?{embargoes:embargoes!}:{}),...(options.reserve?{reserve:reserve!}:{})};
}
