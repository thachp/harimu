import type {GameDatabase} from './database-contract';
import { readGovernment } from './government-state';
import { stabilityStatements, readPublicStability, isMissingStabilityTable, type PublicStability } from './stability';

export const tickSeconds = 7200;
export const maximumCatchupTicks = 3;
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
  supplierFoodRemaining: number; supplierCashMinor: number; stability?: PublicStability[] };

/** Request-driven bounded catch-up, not an always-on scheduler. Transactions own transfers. */
export async function advanceWorld(db: GameDatabase, now = Math.floor(Date.now()/1000)): Promise<SimulationState> {
  if (!Number.isSafeInteger(now) || now<0) throw new Error('Invalid authoritative world time.');
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
    // Hotfix for #95: scores are written in their own batch after the tick commits, so a missing
    // nation_stability_scores table (migration 0012 not applied) can't abort the tick. Other errors still throw.
    try { await db.batch(await stabilityStatements(db,tick,scheduledAt,now)); }
    catch (error) { if (!isMissingStabilityTable(error)) throw error; console.warn('[stability] nation_stability_scores missing; apply migration 0012. Tick', tick, 'recorded without scores.'); }
  }
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
    supplierFoodRemaining:supply?.food ?? 0,supplierCashMinor:supply?.cash ?? 0,stability};
}
