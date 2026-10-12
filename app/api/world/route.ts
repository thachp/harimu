import { getDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

type NationRow = {
  id: string;
  name: string;
  short_name: string;
  affinity: string;
  government: string;
  economy: string;
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
  const [nationResult, workOrderResult, planningTaskResult, eventResult] = await Promise.all([
    database.prepare('SELECT * FROM nations ORDER BY sort_order').all<NationRow>(),
    database.prepare("SELECT id, nation_id, name, detail, capacity_cost FROM work_orders WHERE status = 'open' ORDER BY sort_order").all<WorkOrderRow>(),
    database.prepare('SELECT id, title, detail, meta FROM planning_tasks ORDER BY sort_order').all<PlanningTaskRow>(),
    database.prepare('SELECT id, kind, headline, detail, location, occurred_at FROM world_events ORDER BY sort_order').all<WorldEventRow>(),
  ]);

  return Response.json(
    {
      nations: nationResult.results.map((nation) => ({
        id: nation.id,
        name: nation.name,
        shortName: nation.short_name,
        affinity: nation.affinity,
        government: nation.government,
        economy: nation.economy,
        capital: nation.capital,
        population: nation.population,
        treasury: nation.treasury,
        stability: nation.stability,
        color: nation.color,
        softColor: nation.soft_color,
        motto: nation.motto,
        tradeStatus: nation.trade_status,
        position: { x: nation.position_x, y: nation.position_y },
      })),
      workOrders: workOrderResult.results.map((order) => ({
        id: order.id,
        nationId: order.nation_id,
        name: order.name,
        detail: order.detail,
        cost: order.capacity_cost,
      })),
      planningTasks: planningTaskResult.results,
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
