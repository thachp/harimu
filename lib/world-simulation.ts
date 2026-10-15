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
import { holidayNationsOn } from './festivals';
import { readWars, type WarState } from './war'; // #309
import { readSiegeSnapshot, type SiegeSnapshotItem } from './siege-actions'; // #620
import { readTreaties, runDiplomacy, type TreatyState } from './diplomacy'; // #308
import { readEmbargoes, runEmbargo, type EmbargoState } from './embargo'; // #363
import { readReserveBoard, type ReserveBoard } from './spark-supply'; // #431
import { runKorundRaids } from './korund-underground'; // #295
import { stabilityStatements, stabilityNations, readPublicStability, isMissingStabilityTable, type PublicStability } from './stability';

export const tickSeconds = 7200;
export const maximumCatchupTicks = 3;
/** #159: how many ticks before the catch-up window are re-checked for missing scores (12 = one real day). */
const scoreRepairTicks=12;
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
  supplierFoodRemaining: number; supplierCashMinor: number; stability?: PublicStability[]; wars?: WarState; sieges?: SiegeSnapshotItem[]; weariness?: PublicWeariness; treaties?: TreatyState; embargoes?: EmbargoState; reserve?: ReserveBoard };

/** Request-driven bounded catch-up, not an always-on scheduler. Transactions own transfers. */
export async function advanceWorld(db: GameDatabase, now = Math.floor(Date.now()/1000), options: { reserve?: boolean; npcSupply?: boolean; aurelleRising?: boolean; aurelleCoup?: boolean; favorDecay?: boolean; kindleAssembly?: AssemblyTickConfig | null; primaries?: { scope: PrimaryScope; openAt: number | null } | null; korundPresidium?: boolean; faithFestivals?: boolean; diplomacy?: boolean; embargo?: boolean; war?: boolean; warWeariness?: boolean; foundingPeriod?: boolean } = {}): Promise<SimulationState> {
  if (!Number.isSafeInteger(now) || now<0) throw new Error('Invalid authoritative world time.');
  // #221: due preview elections close and record their count on the tick, so GET /api/election never writes.
  for (const electionDb of [db, accountElectionDatabase(db)]) await finalizeDueElection(electionDb, now).catch(error => { console.warn('[world] due election finalize failed', error instanceof Error ? error.name : 'unknown'); });
  await db.prepare("INSERT OR IGNORE INTO world_clock (id,epoch_seconds) VALUES ('main',?)")
    .bind(Math.floor(now/tickSeconds)*tickSeconds).run();
  const epoch = (await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>())!.epoch_seconds;
  const due = Math.max(0,Math.floor((now-epoch)/tickSeconds));
  const last = await db.prepare('SELECT COALESCE(MAX(tick),0) AS tick FROM world_ticks').first<{tick:number}>();
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
    for (const row of missing.results) {
      // #423: war weariness reads the wars table as of the tick's own time (only while both war flags are on), so a catch-up or repaired tick scores the same as a live one.
      const weariness = options.warWeariness ? await readWarWeariness(db,Number(row.scheduled_at)) : undefined;
      await db.batch(await stabilityStatements(db,Number(row.tick),Number(row.scheduled_at),now,{...(options.faithFestivals?{holidayNations:holidayNationsOn(Math.floor(Number(row.scheduled_at)/tickSeconds),tickSeconds)}:{}),...(weariness?{warWeariness:weariness}:{})}));
    }
  } catch (error) { if (!isMissingStabilityTable(error)) throw error; console.warn('[stability] nation_stability_scores missing; apply migration 0012. Ticks recorded without scores.'); }
  // Market day, only while the order book is on (write paths only). Idempotent per tick:
  // #199 fruit and meat spoil first, then #198 NPC farm asks are posted for the current game day.
  if (options.npcSupply) {
    const current = await db.prepare('SELECT tick,scheduled_at FROM world_ticks ORDER BY tick DESC LIMIT 1').first<{tick:number;scheduled_at:number}>();
    if (current) {
      await runSpoilage(db, Number(current.tick), now);
      await runNpcSupply(db, Number(current.tick), Number(current.scheduled_at), now, tickSeconds);
    }
  }
  // #71: Aurelle Rising thresholds and Crisis Window resolution, only while HARIMU_AURELLE_RISING_ENABLED is on (write paths only).
  if (options.aurelleRising) await runAurelleRising(db, now);
  // #281: Aurelle AI palace coup, only while HARIMU_AURELLE_COUP_ENABLED is on (write paths only).
  if (options.aurelleCoup) await runAurelleCoup(db, now, options.favorDecay === true);
  // #307: Kindle party primaries open at their configured time and are counted when due, only while HARIMU_PRIMARIES_ENABLED is on and the privacy gate is open (write paths only).
  if (options.primaries) await runPrimaries(db, now, options.primaries).catch(error => { console.warn('[world] primaries tick failed', error instanceof Error ? error.name : 'unknown'); });
  // #283: Kindle mid-term Assembly opens at its configured time and is counted when due, only while HARIMU_KINDLE_ASSEMBLY_ENABLED is on and the privacy gate is open (write paths only).
  if (options.kindleAssembly) await runKindleAssembly(db, now, options.kindleAssembly).catch(error => { console.warn('[world] Assembly tick failed', error instanceof Error ? error.name : 'unknown'); });
  // #70: Korund emergency Presidium session and succession, only while HARIMU_KORUND_PRESIDIUM_ENABLED is on (write paths only).
  if (options.korundPresidium) await runKorundPresidium(db, now);
  // #295: Korund underground inspections (capped), only while HARIMU_FAITH_ENABLED is on (write paths only).
  if (options.faithFestivals) await runKorundRaids(db, now).catch(error => { console.warn('[world] Korund inspection tick failed', error instanceof Error ? error.name : 'unknown'); });
  // #308: AI treaties (decide proposals, expire terms), only while HARIMU_DIPLOMACY_ENABLED is on (write paths only).
  if (options.diplomacy) await runDiplomacy(db, now).catch(error => { console.warn('[world] diplomacy tick failed', error instanceof Error ? error.name : 'unknown'); });
  // #363: embargoes (decide proposals), only while HARIMU_EMBARGO_ENABLED is on (write paths only).
  if (options.embargo) await runEmbargo(db, now).catch(error => { console.warn('[world] embargo tick failed', error instanceof Error ? error.name : 'unknown'); });
  // #612: the Founding Period's one day-30 event per MVP nation, only while HARIMU_FOUNDING_PERIOD_ENABLED is on (write paths only, idempotent).
  if (options.foundingPeriod) await runFoundingDay30(db, now).catch(error => { console.warn('[world] founding day-30 tick failed', error instanceof Error ? error.name : 'unknown'); });
  return readWorldSimulation(db, now, { war: options.war, warWeariness: options.warWeariness, diplomacy: options.diplomacy, embargo: options.embargo, reserve: options.reserve });

}

/** #205: the same snapshot advanceWorld returns, computed without any write. Due-but-unprocessed ticks show as
 *  pendingTicks; the next write path (or GET /api/world) processes them. */
/** #309: `war` (HARIMU_WAR_ENABLED) adds the derived war state; with it off nothing is queried or returned. */
export async function readWorldSimulation(db: GameDatabase, now = Math.floor(Date.now()/1000), options: { war?: boolean; warWeariness?: boolean; diplomacy?: boolean; embargo?: boolean; reserve?: boolean } = {}): Promise<SimulationState> {
  if (!Number.isSafeInteger(now) || now<0) throw new Error('Invalid authoritative world time.');
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{epoch_seconds:number}>();
  const epoch = clock ? Number(clock.epoch_seconds) : Math.floor(now/tickSeconds)*tickSeconds;
  const due = Math.max(0,Math.floor((now-epoch)/tickSeconds));
  const [latest,execution,supply,stability] = await Promise.all([
    db.prepare('SELECT COALESCE(MAX(tick),0) AS tick FROM world_ticks').first<{tick:number}>(),
    db.prepare('SELECT tick,nation_id,topic,food_quantity,spend_minor,scheduled_at,executed_at FROM government_policy_executions ORDER BY tick DESC LIMIT 1')
      .first<{tick:number;nation_id:string;topic:string;food_quantity:number;spend_minor:number;scheduled_at:number;executed_at:number}>(),
    db.prepare("SELECT initial_food-COALESCE((SELECT SUM(food_quantity) FROM government_policy_executions),0) AS food, COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0) AS cash FROM world_supply WHERE id='kindle-food-supplier'")
      .first<{food:number;cash:number}>(),
    readPublicStability(db),
  ]);
  return {clock:{compression:12,epochSeconds:epoch,nowSeconds:now,gameDay:Math.floor(Math.max(0,now-epoch)*12/86400)+1,
    latestTick:latest?.tick ?? 0,pendingTicks:Math.max(0,due-(latest?.tick ?? 0)),cadenceSeconds:tickSeconds,mode:'request-driven durable simulation'},
    latestExecution:execution ? {tick:execution.tick,nationId:execution.nation_id,topic:execution.topic,foodQuantity:execution.food_quantity,
      spendMinor:execution.spend_minor,scheduledAt:execution.scheduled_at,executedAt:execution.executed_at}:null,
    supplierFoodRemaining:supply?.food ?? 0,supplierCashMinor:supply?.cash ?? 0,stability,...(options.war?{wars:await readWars(db,now),sieges:await readSiegeSnapshot(db,now)}:{}),...(options.war&&options.warWeariness?{weariness:await readPublicWeariness(db,now)}:{}),...(options.diplomacy?{treaties:await readTreaties(db,now)}:{}),...(options.embargo?{embargoes:await readEmbargoes(db)}:{}),...(options.reserve?{reserve:await readReserveBoard(db,now)}:{})};
}
