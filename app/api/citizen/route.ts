import { createClerkClient } from '@clerk/backend';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

const allowedHorizons = new Set(['today', 'week', 'season']);
const activeDecisionId = 'eastern-waterworks-day-42';
const baseWaterSecurity = 71;
const baseWardStability = 86;
const allowedInfrastructureIds = new Set([
  'council', 'cooperative', 'market', 'clinic', 'school', 'waterworks', 'depot',
]);
const allowedHouseholdMemberIds = new Set(['citizen', 'partner', 'apprentice', 'child']);

type CitizenProfileRow = {
  clerk_user_id: string;
  nation_id: string | null;
  nation_changes: number;
  display_name: string | null;
  capacity: number;
  influence: number;
  standing: string;
  created_at: string;
};

type CitizenDecisionRow = {
  decision_id: string;
  task_id: string;
  infrastructure_id: string;
  household_member_id: string;
  capacity_delta: number;
  influence_delta: number;
  water_delta: number;
  stability_delta: number;
  outcome: string;
  committed_at: string;
};

function boundedPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function serializeCitizenship(profile: CitizenProfileRow, politicalActionTaken: boolean) {
  const graceEndsAt = new Date(Date.parse(profile.created_at) + 48 * 60 * 60 * 1000).toISOString();
  const graceExpired = Date.now() >= Date.parse(graceEndsAt);
  const changeUsed = profile.nation_changes >= 1;
  const lockedReason = politicalActionTaken
    ? 'political-action'
    : changeUsed
      ? 'change-used'
      : graceExpired
        ? 'grace-expired'
        : null;

  return {
    enrolledAt: profile.created_at,
    graceEndsAt,
    changesRemaining: changeUsed ? 0 : 1,
    politicalActionTaken,
    canChange: Boolean(profile.nation_id) && lockedReason === null,
    lockedReason,
  };
}

function serializeDecision(decision: CitizenDecisionRow | null) {
  return decision ? {
    decisionId: decision.decision_id,
    optionId: decision.task_id,
    infrastructureId: decision.infrastructure_id,
    householdMemberId: decision.household_member_id,
    effects: {
      capacity: decision.capacity_delta,
      influence: decision.influence_delta,
      water: decision.water_delta,
      stability: decision.stability_delta,
    },
    outcome: decision.outcome,
    committedAt: decision.committed_at,
  } : null;
}

function serializeProfile(
  profile: CitizenProfileRow,
  decision: CitizenDecisionRow | null,
  politicalActionTaken: boolean,
) {
  return {
    nationId: profile.nation_id,
    displayName: profile.display_name,
    capacity: profile.capacity,
    influence: profile.influence,
    standing: profile.standing,
    waterSecurity: boundedPercent(baseWaterSecurity + (decision?.water_delta ?? 0)),
    wardStability: boundedPercent(baseWardStability + (decision?.stability_delta ?? 0)),
    citizenship: serializeCitizenship(profile, politicalActionTaken),
  };
}

async function authenticatedUserId(request: Request) {
  const bindings = env as unknown as {
    CLERK_SECRET_KEY?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  };

  if (!bindings.CLERK_SECRET_KEY || !bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new Error('Clerk server credentials are unavailable.');
  }

  const requestState = await createClerkClient({
    secretKey: bindings.CLERK_SECRET_KEY,
    publishableKey: bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  }).authenticateRequest(request, { acceptsToken: 'session_token' });

  return requestState.isAuthenticated ? requestState.toAuth().userId : null;
}

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const [profile, plan, itemResult, decision, politicalAction] = await Promise.all([
    database.prepare(`SELECT clerk_user_id, nation_id, nation_changes, display_name, capacity,
      influence, standing, created_at
      FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<CitizenProfileRow>(),
    database.prepare(`SELECT horizon, private_note, saved_at
      FROM citizen_plans WHERE clerk_user_id = ?`).bind(userId).first<{
      horizon: string;
      private_note: string;
      saved_at: string;
    }>(),
    database.prepare(`SELECT task_id FROM citizen_plan_items
      WHERE clerk_user_id = ? AND completed = 1`).bind(userId).all<{ task_id: string }>(),
    database.prepare(`SELECT decision_id, task_id, infrastructure_id, household_member_id,
      capacity_delta, influence_delta, water_delta, stability_delta, outcome, committed_at
      FROM citizen_decisions WHERE clerk_user_id = ? AND decision_id = ?`)
      .bind(userId, activeDecisionId)
      .first<CitizenDecisionRow>(),
    database.prepare(`SELECT EXISTS(
      SELECT 1 FROM citizen_decisions WHERE clerk_user_id = ? LIMIT 1
    ) AS political_action_taken`).bind(userId).first<{ political_action_taken: number }>(),
  ]);

  return Response.json({
    profile: profile
      ? serializeProfile(profile, decision ?? null, Boolean(politicalAction?.political_action_taken))
      : null,
    plan: plan ? {
      horizon: plan.horizon,
      note: plan.private_note,
      savedAt: plan.saved_at,
      completedIds: itemResult.results.map((item) => item.task_id),
    } : null,
    decision: serializeDecision(decision ?? null),
  });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const body = await request.json() as Record<string, unknown>;
  const now = new Date().toISOString();

  if (body.action === 'enroll') {
    const nationId = typeof body.nationId === 'string' ? body.nationId : '';
    const nation = await database.prepare('SELECT id FROM nations WHERE id = ?').bind(nationId).first();
    if (!nation) return Response.json({ error: 'Unknown nation.' }, { status: 400 });

    const current = await database.prepare(`SELECT clerk_user_id, nation_id, nation_changes,
      display_name, capacity, influence, standing, created_at
      FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<CitizenProfileRow>();

    if (!current) {
      await database.prepare(`INSERT INTO citizens (
        clerk_user_id, nation_id, nation_changes, capacity, influence, standing, created_at, updated_at
      ) VALUES (?, ?, 0, 18, 1240, 'Good standing', ?, ?)`)
        .bind(userId, nationId, now, now)
        .run();

      const created = await database.prepare(`SELECT clerk_user_id, nation_id, nation_changes,
        display_name, capacity, influence, standing, created_at
        FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<CitizenProfileRow>();
      return Response.json({
        ok: true,
        nationId,
        citizenship: created ? serializeCitizenship(created, false) : null,
      });
    }

    const politicalAction = await database.prepare(`SELECT EXISTS(
      SELECT 1 FROM citizen_decisions WHERE clerk_user_id = ? LIMIT 1
    ) AS political_action_taken`).bind(userId).first<{ political_action_taken: number }>();
    const politicalActionTaken = Boolean(politicalAction?.political_action_taken);

    if (current.nation_id === nationId) {
      return Response.json({
        ok: true,
        nationId,
        citizenship: serializeCitizenship(current, politicalActionTaken),
      });
    }

    if (!current.nation_id) {
      await database.prepare(`UPDATE citizens SET nation_id = ?, updated_at = ?
        WHERE clerk_user_id = ? AND nation_id IS NULL`)
        .bind(nationId, now, userId)
        .run();
    } else {
      const change = await database.prepare(`UPDATE citizens
        SET nation_id = ?, nation_changes = nation_changes + 1, updated_at = ?
        WHERE clerk_user_id = ?
          AND nation_id != ?
          AND nation_changes = 0
          AND julianday(created_at, '+48 hours') > julianday(?)
          AND NOT EXISTS (
            SELECT 1 FROM citizen_decisions WHERE clerk_user_id = ? LIMIT 1
          )`)
        .bind(nationId, now, userId, nationId, now, userId)
        .run();

      if (!change.meta.changes) {
        return Response.json({
          error: politicalActionTaken
            ? 'Citizenship locked when you took your first political action.'
            : current.nation_changes >= 1
              ? 'Your one free citizenship change has already been used.'
              : 'The 48-hour citizenship grace period has ended.',
          citizenship: serializeCitizenship(current, politicalActionTaken),
        }, { status: 409 });
      }
    }

    const updated = await database.prepare(`SELECT clerk_user_id, nation_id, nation_changes,
      display_name, capacity, influence, standing, created_at
      FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<CitizenProfileRow>();
    return Response.json({
      ok: true,
      nationId,
      citizenship: updated ? serializeCitizenship(updated, politicalActionTaken) : null,
    });
  }

  if (body.action === 'commit-decision') {
    const optionId = typeof body.optionId === 'string' ? body.optionId : '';
    const requestedInfrastructureId = typeof body.infrastructureId === 'string' ? body.infrastructureId : '';
    const requestedHouseholdMemberId = typeof body.householdMemberId === 'string' ? body.householdMemberId : '';
    const infrastructureId = allowedInfrastructureIds.has(requestedInfrastructureId)
      ? requestedInfrastructureId
      : 'waterworks';
    const householdMemberId = allowedHouseholdMemberIds.has(requestedHouseholdMemberId)
      ? requestedHouseholdMemberId
      : 'citizen';
    const horizon = typeof body.horizon === 'string' && allowedHorizons.has(body.horizon)
      ? body.horizon
      : 'week';
    const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
    const effect = await database.prepare(`SELECT task_id, capacity_delta, influence_delta,
      water_delta, stability_delta, outcome, infrastructure_id, household_member_id
      FROM planning_task_effects WHERE task_id = ?`).bind(optionId).first<{
        task_id: string;
        capacity_delta: number;
        influence_delta: number;
        water_delta: number;
        stability_delta: number;
        outcome: string;
        infrastructure_id: string;
        household_member_id: string;
      }>();
    if (!effect) return Response.json({ error: 'Unknown civic plan.' }, { status: 400 });

    const [profile, existingDecision] = await Promise.all([
      database.prepare(`SELECT clerk_user_id, nation_id, nation_changes, display_name, capacity,
        influence, standing, created_at
        FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<CitizenProfileRow>(),
      database.prepare(`SELECT decision_id, task_id, infrastructure_id, household_member_id,
        capacity_delta, influence_delta, water_delta, stability_delta, outcome, committed_at
        FROM citizen_decisions WHERE clerk_user_id = ? AND decision_id = ?`)
        .bind(userId, activeDecisionId)
        .first<CitizenDecisionRow>(),
    ]);
    if (!profile?.nation_id) {
      return Response.json({ error: 'Choose citizenship before committing a civic decision.' }, { status: 409 });
    }
    if (existingDecision) {
      return Response.json({
        ok: true,
        alreadyCommitted: true,
        profile: serializeProfile(profile, existingDecision, true),
        decision: serializeDecision(existingDecision),
      });
    }
    if (profile.capacity + effect.capacity_delta < 0) {
      return Response.json({ error: 'Not enough Work Capacity for this decision.' }, { status: 409 });
    }

    const decisionRow: CitizenDecisionRow = {
      decision_id: activeDecisionId,
      task_id: effect.task_id,
      infrastructure_id: infrastructureId || effect.infrastructure_id,
      household_member_id: householdMemberId || effect.household_member_id,
      capacity_delta: effect.capacity_delta,
      influence_delta: effect.influence_delta,
      water_delta: effect.water_delta,
      stability_delta: effect.stability_delta,
      outcome: effect.outcome,
      committed_at: now,
    };

    await database.batch([
      database.prepare(`UPDATE citizens SET capacity = capacity + ?, influence = influence + ?, updated_at = ?
        WHERE clerk_user_id = ?`)
        .bind(effect.capacity_delta, effect.influence_delta, now, userId),
      database.prepare(`INSERT INTO citizen_decisions (
        clerk_user_id, decision_id, task_id, infrastructure_id, household_member_id,
        capacity_delta, influence_delta, water_delta, stability_delta, outcome, committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        userId,
        decisionRow.decision_id,
        decisionRow.task_id,
        decisionRow.infrastructure_id,
        decisionRow.household_member_id,
        decisionRow.capacity_delta,
        decisionRow.influence_delta,
        decisionRow.water_delta,
        decisionRow.stability_delta,
        decisionRow.outcome,
        decisionRow.committed_at,
      ),
      database.prepare(`INSERT INTO citizen_plans (clerk_user_id, horizon, private_note, saved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
          horizon = excluded.horizon,
          private_note = excluded.private_note,
          saved_at = excluded.saved_at`)
        .bind(userId, horizon, note, now),
      database.prepare('DELETE FROM citizen_plan_items WHERE clerk_user_id = ?').bind(userId),
      database.prepare(`INSERT INTO citizen_plan_items (
        clerk_user_id, task_id, completed, updated_at
      ) VALUES (?, ?, 1, ?)`).bind(userId, optionId, now),
    ]);

    const updatedProfile = await database.prepare(`SELECT clerk_user_id, nation_id, nation_changes,
      display_name, capacity, influence, standing, created_at FROM citizens WHERE clerk_user_id = ?`)
      .bind(userId)
      .first<CitizenProfileRow>();

    return Response.json({
      ok: true,
      profile: updatedProfile ? serializeProfile(updatedProfile, decisionRow, true) : null,
      decision: serializeDecision(decisionRow),
    });
  }

  if (body.action === 'save-plan') {
    const horizon = typeof body.horizon === 'string' && allowedHorizons.has(body.horizon)
      ? body.horizon
      : 'week';
    const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
    const requestedIds = Array.isArray(body.completedIds)
      ? body.completedIds.filter((item): item is string => typeof item === 'string')
      : [];
    const taskResult = await database.prepare('SELECT id FROM planning_tasks').all<{ id: string }>();
    const allowedTaskIds = new Set(taskResult.results.map((task) => task.id));
    const completedIds = [...new Set(requestedIds.filter((id) => allowedTaskIds.has(id)))];

    await database.batch([
      database.prepare(`INSERT INTO citizens (
        clerk_user_id, nation_id, capacity, influence, standing, created_at, updated_at
      ) VALUES (?, NULL, 18, 1240, 'Good standing', ?, ?)
      ON CONFLICT(clerk_user_id) DO UPDATE SET updated_at = excluded.updated_at`)
        .bind(userId, now, now),
      database.prepare(`INSERT INTO citizen_plans (clerk_user_id, horizon, private_note, saved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
          horizon = excluded.horizon,
          private_note = excluded.private_note,
          saved_at = excluded.saved_at`)
        .bind(userId, horizon, note, now),
      database.prepare('DELETE FROM citizen_plan_items WHERE clerk_user_id = ?').bind(userId),
      ...completedIds.map((taskId) => database.prepare(`INSERT INTO citizen_plan_items (
        clerk_user_id, task_id, completed, updated_at
      ) VALUES (?, ?, 1, ?)`)
        .bind(userId, taskId, now)),
    ]);

    return Response.json({ ok: true, savedAt: now });
  }

  if (body.action === 'commit-work') {
    const workOrderId = typeof body.workOrderId === 'string' ? body.workOrderId : '';
    const order = await database.prepare(`SELECT id, name, capacity_cost
      FROM work_orders WHERE id = ? AND status = 'open'`).bind(workOrderId).first<{
      id: string;
      name: string;
      capacity_cost: number;
    }>();
    if (!order) return Response.json({ error: 'Work order unavailable.' }, { status: 404 });

    const update = await database.prepare(`UPDATE citizens
      SET capacity = capacity - ?, updated_at = ?
      WHERE clerk_user_id = ? AND nation_id IS NOT NULL AND capacity >= ?`)
      .bind(order.capacity_cost, now, userId, order.capacity_cost)
      .run();
    if (!update.meta.changes) {
      return Response.json({ error: 'Enroll and confirm sufficient capacity first.' }, { status: 409 });
    }

    await database.prepare(`INSERT INTO work_contributions (
      clerk_user_id, work_order_id, capacity_spent, created_at
    ) VALUES (?, ?, ?, ?)`)
      .bind(userId, order.id, order.capacity_cost, now)
      .run();
    const citizen = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?')
      .bind(userId)
      .first<{ capacity: number }>();

    return Response.json({ ok: true, capacity: citizen?.capacity ?? 0, orderName: order.name });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}
