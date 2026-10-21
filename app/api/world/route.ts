import { env } from 'cloudflare:workers';
import { wearinessEnabled, wearinessLossesEnabled, type WearinessBindings } from '@/lib/war-weariness'; // #423
import { shiftRules } from '@/lib/work-shifts';
import { advanceWorld } from '@/lib/world-simulation';
import { getDatabase } from '@/lib/db';
import { populationBands } from '@/lib/population-bands';
import { nationIsPreview } from '@/lib/nation-discovery';
import { assemblyTickConfig, type AssemblyBindings } from '@/lib/assembly';
import { primaryTickConfig, type PrimaryBindings } from '@/lib/primaries';

export const dynamic = 'force-dynamic';

type NationRow = {
  id: string;
  name: string;
  short_name: string;
  government: string;
  economy: string;
  currency: string;
  religion: string;
  capital: string;
  population: string;
  treasury: string;
  stability: number;
  color: string;
  soft_color: string;
  motto: string;
  trade_status: string;
  position_x: number;
  position_y: number;
};

type WorkOrderRow = {
  id: string;
  nation_id: string | null;
  name: string;
  detail: string;
  capacity_cost: number;
};

type PlanningTaskRow = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  capacity_delta: number;
  influence_delta: number;
  water_delta: number;
  stability_delta: number;
  outcome: string;
  infrastructure_id: string;
  household_member_id: string;
};

type WorldEventRow = {
  id: number;
  kind: string;
  headline: string;
  detail: string;
  location: string | null;
  occurred_at: string;
};

export async function GET() {
  const database = await getDatabase();
  const simulation = await advanceWorld(database, undefined, { reserve: (env as unknown as { HARIMU_SPARK_SUPPLY_ENABLED?: string }).HARIMU_SPARK_SUPPLY_ENABLED === 'true', npcSupply: (env as unknown as { HARIMU_ORDER_BOOK_ENABLED?: string }).HARIMU_ORDER_BOOK_ENABLED === 'true', aurelleRising: (env as unknown as { HARIMU_AURELLE_RISING_ENABLED?: string }).HARIMU_AURELLE_RISING_ENABLED === 'true', aurelleCoup: (env as unknown as { HARIMU_AURELLE_COUP_ENABLED?: string }).HARIMU_AURELLE_COUP_ENABLED === 'true', favorDecay: (env as unknown as { HARIMU_FAVOR_DECAY_ENABLED?: string }).HARIMU_FAVOR_DECAY_ENABLED === 'true', kindleAssembly: assemblyTickConfig(env as unknown as AssemblyBindings), primaries: primaryTickConfig(env as unknown as PrimaryBindings), korundPresidium: (env as unknown as { HARIMU_KORUND_PRESIDIUM_ENABLED?: string }).HARIMU_KORUND_PRESIDIUM_ENABLED === 'true', faithFestivals: (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true', war: (env as unknown as { HARIMU_WAR_ENABLED?: string }).HARIMU_WAR_ENABLED === 'true', warWeariness: wearinessEnabled(env as unknown as WearinessBindings), warWearinessLosses: wearinessLossesEnabled(env as unknown as WearinessBindings), diplomacy: (env as unknown as { HARIMU_DIPLOMACY_ENABLED?: string }).HARIMU_DIPLOMACY_ENABLED === 'true', embargo: (env as unknown as { HARIMU_EMBARGO_ENABLED?: string }).HARIMU_EMBARGO_ENABLED === 'true', foundingPeriod: (env as unknown as { HARIMU_FOUNDING_PERIOD_ENABLED?: string }).HARIMU_FOUNDING_PERIOD_ENABLED === 'true' });
  const [nationResult, workOrderResult, planningTaskResult, eventResult, enrollmentResult] = await Promise.all([
    database.prepare('SELECT * FROM nations ORDER BY sort_order').all<NationRow>(),
    database.prepare("SELECT id, nation_id, name, detail, capacity_cost FROM work_orders WHERE status = 'open' ORDER BY sort_order").all<WorkOrderRow>(),
    database.prepare(`SELECT
      planning_tasks.id,
      planning_tasks.title,
      planning_tasks.detail,
      planning_tasks.meta,
      planning_task_effects.capacity_delta,
      planning_task_effects.influence_delta,
      planning_task_effects.water_delta,
      planning_task_effects.stability_delta,
      planning_task_effects.outcome,
      planning_task_effects.infrastructure_id,
      planning_task_effects.household_member_id
    FROM planning_tasks
    INNER JOIN planning_task_effects ON planning_task_effects.task_id = planning_tasks.id
    ORDER BY planning_tasks.sort_order`).all<PlanningTaskRow>(),
    database.prepare('SELECT id, kind, headline, detail, location, occurred_at FROM world_events ORDER BY sort_order').all<WorldEventRow>(),
    // Population bands (#81): only the band leaves the server, never the counts.
    database.prepare('SELECT nation_id, COUNT(*) AS citizens FROM citizens WHERE nation_id IS NOT NULL GROUP BY nation_id').all<{ nation_id: string; citizens: number }>(),
  ]);
  const bands = populationBands(nationResult.results.map(nation => nation.id), Object.fromEntries(enrollmentResult.results.map(row => [row.nation_id, Number(row.citizens)])), undefined, id => !nationIsPreview(id));

  return Response.json(
    {
      simulation,
      nations: nationResult.results.map((nation) => ({
        id: nation.id,
        name: nation.name,
        shortName: nation.short_name,
        government: nation.government,
        economy: nation.economy,
        currency: nation.currency,
        religion: nation.religion,
        capital: nation.capital,
        population: nation.population,
        treasury: nation.treasury,
        stability: nation.stability,
        color: nation.color,
        softColor: nation.soft_color,
        motto: nation.motto,
        tradeStatus: nation.trade_status,
        position: { x: nation.position_x, y: nation.position_y },
        populationBand: bands[nation.id],
      })),
      workOrders: workOrderResult.results.map((order) => ({
        id: order.id,
        nationId: order.nation_id,
        name: order.name,
        detail: shiftRules[order.id] ? order.detail.replace(/resolves in \d+(?:\.\d+)?h(?: real · [^·]+game(?: days?)?)?/, `resolves in ${shiftRules[order.id].hours}h real · ${shiftRules[order.id].hours * 12}h game`) : order.detail,
        cost: order.capacity_cost,
      })),
      planningTasks: planningTaskResult.results.map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.detail,
        meta: task.meta,
        effects: {
          capacity: task.capacity_delta,
          influence: task.influence_delta,
          water: task.water_delta,
          stability: task.stability_delta,
        },
        outcome: task.outcome,
        infrastructureId: task.infrastructure_id,
        householdMemberId: task.household_member_id,
      })),
      worldEvents: eventResult.results.map((event) => ({
        id: event.id,
        kind: event.kind,
        headline: event.headline,
        detail: event.detail,
        location: event.location,
        occurredAt: event.occurred_at,
      })),
    },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
  );
}
