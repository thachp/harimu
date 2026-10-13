import { validEnrollmentExpectation, citizenshipStatus, enrollmentInitialSql, enrollmentFirstSql, enrollmentChangeSql } from '@/lib/citizenship';
import { readAurelle, validAurelleCommand, executeAurelle } from '@/lib/aurelle';
import { readKorund, validKorundCommand, executeKorund } from '@/lib/korund';
import { advanceWorld } from '@/lib/world-simulation';
import { readVerification } from '@/lib/verification';
import { petitionSql, petitionEligibilitySql, readGovernment } from '@/lib/government-state';
import { executePlayerCommand, validPlayerCommand, readPlayerMarket } from '@/lib/player-market';
import { executeMarketCommand, validMarketCommand, readMarket } from '@/lib/market';
import { rewards, recoverCapacity, readEconomy, recoveryInterval, settleSql, settledContributionSql, finishSettledShiftSql } from '@/lib/economy';
import { shiftRules, readShifts, startShiftSql, debitShiftSql } from '@/lib/work-shifts';
import { authenticatedUserId } from '@/lib/auth';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, init?: ResponseInit) => Response.json(data, { ...init, headers: { ...init?.headers, 'Cache-Control': 'private, no-store' } });

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

const serializeCitizenship = citizenshipStatus;

function serializeDecision(decision: CitizenDecisionRow | null) {
  return decision ? {
    counted: false,
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

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const simulation = await advanceWorld(database);
  const interval = recoveryInterval((env as unknown as { HARIMU_CAPACITY_RECOVERY_SECONDS?: string }).HARIMU_CAPACITY_RECOVERY_SECONDS);
  await recoverCapacity(database, userId, new Date().toISOString(), interval);
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
      SELECT 1 FROM citizen_decisions WHERE clerk_user_id = ?
      UNION ALL SELECT 1 FROM government_petitions WHERE clerk_user_id = ? LIMIT 1
    ) AS political_action_taken`).bind(userId, userId).first<{ political_action_taken: number }>(),
  ]);

  return privateJson({
    aurellePlan: await readAurelle(database,userId),
    korundPlan: await readKorund(database,userId,Math.floor(Date.now()/1000)),
    simulation,
    verification: await readVerification(userId),
    economy: await readEconomy(database, userId, interval),
    market: await readMarket(database, userId, interval),
    playerMarket: await readPlayerMarket(database, userId),
    government: profile?.nation_id ? await readGovernment(database, profile.nation_id, Math.floor(Date.now()/1000), userId) : null,
    shifts: await readShifts(database, userId),
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
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, { status: 403 });
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const simulation = await advanceWorld(database);
  const interval = recoveryInterval((env as unknown as { HARIMU_CAPACITY_RECOVERY_SECONDS?: string }).HARIMU_CAPACITY_RECOVERY_SECONDS);
  await recoverCapacity(database, userId, new Date().toISOString(), interval);
  let body: Record<string, unknown>;
  try {
    body = await readCommandObject(request);
  } catch {
    return privateJson({ error: 'Expected valid JSON.' }, { status: 400 });
  }
  const now = new Date().toISOString();

  if (typeof body.action === 'string' && body.action.startsWith('aurelle-')) {
    if (!validAurelleCommand(body)) return privateJson({error:'Use a valid request identifier, shift identifier and food quantity of 1 or 2.'},{status:400});
    const result=await executeAurelle(database,userId,body,Math.floor(Date.parse(now)/1000));
    const citizen=await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(userId).first<{capacity:number}>();
    return privateJson({...result,ok:result.status===200,aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,Math.floor(Date.parse(now)/1000)),shifts:await readShifts(database,userId),capacity:citizen?.capacity??0},{status:result.status});
  }

  if (typeof body.action === 'string' && body.action.startsWith('korund-')) {
    if (!validKorundCommand(body)) return privateJson({error:'Use a valid work or request identifier.'},{status:400});
    const seconds=Math.floor(Date.parse(now)/1000);
    const result=await executeKorund(database,userId,body,seconds);
    const citizen=await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(userId).first<{capacity:number}>();
    return privateJson({...result,ok:result.status===200,shifts:await readShifts(database,userId),aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,seconds),capacity:citizen?.capacity??0},{status:result.status});
  }

  if (body.action === 'government-petition') {
    const requestId = typeof body.requestId === 'string' ? body.requestId.toLowerCase() : '';
    const topic = typeof body.topic === 'string' ? body.topic : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) || !['food','infrastructure','work'].includes(topic)) {
      return privateJson({ error: 'Unknown petition topic or request identifier.' }, { status: 400 });
    }
    const verification = await readVerification(userId);
    if (!verification.countedActionsEligible) return privateJson({ error: verification.reason, verification }, { status: 403 });
    const seconds = Math.floor(Date.parse(now)/1000);
    const period = Math.floor(seconds/86400)*86400;
    const receipt = () => database.prepare('SELECT clerk_user_id, nation_id, topic FROM government_petitions WHERE request_id=?')
      .bind(requestId).first<{ clerk_user_id: string; nation_id: string; topic: string }>();
    let recorded = await receipt();
    if (!recorded) {
      await database.batch([
        database.prepare(petitionSql).bind(requestId, topic, period, seconds, userId, requestId, userId, period),
        database.prepare(petitionEligibilitySql).bind(seconds, requestId, userId),
      ]);
      recorded = await receipt();
    }
    const eligibility = await database.prepare('SELECT request_id FROM government_petition_eligibility WHERE request_id=? AND clerk_user_id=?').bind(requestId,userId).first();
    if (!eligibility || !recorded || recorded.clerk_user_id !== userId || recorded.topic !== topic) {
      return privateJson({ error: 'Petition refused: one petition per citizen per UTC day; MVP citizenship and ownership required.' }, { status: 409 });
    }
    const citizen = await database.prepare(`SELECT clerk_user_id,nation_id,nation_changes,display_name,capacity,influence,standing,created_at FROM citizens WHERE clerk_user_id=?`)
      .bind(userId).first<CitizenProfileRow>();
    return privateJson({ ok:true, government: await readGovernment(database, recorded.nation_id, seconds, userId),
      citizenship: citizen ? serializeCitizenship(citizen,true) : null });
  }

  if (body.action === 'create-listing' || body.action === 'buy-listing' || body.action === 'cancel-listing') {
    if (!validPlayerCommand(body)) return privateJson({ error: 'Use valid request/listing identifiers, 1–10 goods and an integer price from 1 to 1000 Spark cents.' }, { status: 400 });
    const command = { ...body, requestId: body.requestId.toLowerCase(), listingId: typeof body.listingId === 'string' ? body.listingId.toLowerCase() : undefined };
    const result = await executePlayerCommand(database, userId, command, Math.floor(Date.parse(now) / 1000));
    return privateJson({ ...result, aurellePlan:await readAurelle(database,userId), economy: await readEconomy(database, userId, interval),
      playerMarket: await readPlayerMarket(database, userId) }, { status: result.status });
  }

  if (body.action === 'market-trade' || body.action === 'household-meal') {
    if (!validMarketCommand(body)) return privateJson({ error: 'Use a valid request id, good, side and integer quantity from 1 to 10.' }, { status: 400 });
    const command = { ...body, requestId: body.requestId.toLowerCase() };
    const result = await executeMarketCommand(database, userId, command, Math.floor(Date.parse(now) / 1000), interval);
    const citizen = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ capacity: number }>();
    return privateJson({ ...result, aurellePlan:await readAurelle(database,userId), economy: await readEconomy(database, userId, interval),
      market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId), capacity: citizen?.capacity ?? 0 }, { status: result.status });
  }

  if (body.action === 'enroll') {
    if (!validEnrollmentExpectation(body)) return privateJson({error:'Confirm the current citizenship with expectedNationId (a nation identifier or null for first enrollment).'}, {status:400});
    const nationId = typeof body.nationId === 'string' ? body.nationId : '';
    const nation = await database.prepare('SELECT id FROM nations WHERE id = ?').bind(nationId).first();
    if (!nation) return privateJson({ error: 'Unknown nation.' }, { status: 400 });
    const readCurrent=()=>database.prepare(`SELECT clerk_user_id,nation_id,nation_changes,display_name,capacity,influence,standing,created_at
      FROM citizens WHERE clerk_user_id=?`).bind(userId).first<CitizenProfileRow>();
    const readPolitical=async()=>Boolean((await database.prepare(`SELECT EXISTS(
      SELECT 1 FROM citizen_decisions WHERE clerk_user_id=? UNION ALL SELECT 1 FROM government_petitions WHERE clerk_user_id=? LIMIT 1
    ) AS taken`).bind(userId,userId).first<{taken:number}>())?.taken);
    const response=async(profile:CitizenProfileRow|null,ok:boolean,error?:string)=>privateJson({ok,error,nationId:profile?.nation_id??null,capacity:profile?.capacity??null,
      simulation,verification:await readVerification(userId),
      government:profile?.nation_id?await readGovernment(database,profile.nation_id,Math.floor(Date.parse(now)/1000),userId):null,
      citizenship:profile?serializeCitizenship(profile,await readPolitical()):null,
      aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,Math.floor(Date.parse(now)/1000)),
      economy:await readEconomy(database,userId,interval),market:await readMarket(database,userId,interval),playerMarket:await readPlayerMarket(database,userId),
    },{status:ok?200:409});
    const current=await readCurrent();
    // A repeated choice has no further effect, including after an uncertain response.
    if (current?.nation_id===nationId) return response(current,true);
    if ((current?.nation_id??null)!==body.expectedNationId) return response(current,false,'Citizenship changed since this form was opened. Refresh and review your current nation before confirming another choice.');
    if (!current?.nation_id) {
      await database.batch([
        database.prepare(enrollmentInitialSql).bind(userId,nationId,now,now),
        database.prepare(enrollmentFirstSql).bind(nationId,now,now,userId),
      ]);
    } else {
      await database.prepare(enrollmentChangeSql).bind(nationId,now,userId,body.expectedNationId,nationId,now,now,userId,userId).run();
    }
    const updated=await readCurrent();
    if (updated?.nation_id===nationId) return response(updated,true);
    const status=updated?serializeCitizenship(updated,await readPolitical()):null;
    const error=status?.lockedReason==='political-action'?'Citizenship locked when you took your first political action.'
      :status?.lockedReason==='change-used'?'Your one free citizenship change has already been used.'
        :status?.lockedReason==='grace-expired'?'The 48-hour citizenship grace period has ended.'
          :'Another enrollment won. Refresh and review your current nation; no additional change was made.';
    return response(updated,false,error);
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
    if (!effect) return privateJson({ error: 'Unknown civic plan.' }, { status: 400 });

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
      return privateJson({ error: 'Choose citizenship before committing a civic decision.' }, { status: 409 });
    }
    if (existingDecision) {
      return privateJson({
        ok: true,
        alreadyCommitted: true,
        profile: serializeProfile(profile, existingDecision, true),
        decision: serializeDecision(existingDecision),
      });
    }
    if (profile.capacity + effect.capacity_delta < 0) {
      return privateJson({ error: 'Not enough Work Capacity for this decision.' }, { status: 409 });
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

    return privateJson({
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

    return privateJson({ ok: true, savedAt: now });
  }

  if (body.action === 'commit-work') {
    const workOrderId = typeof body.workOrderId === 'string' ? body.workOrderId : '';
    const rule = shiftRules[workOrderId];
    const order = await database.prepare(`SELECT id, name, nation_id, capacity_cost
      FROM work_orders WHERE id = ? AND status = 'open'`).bind(workOrderId).first<{
        id: string; name: string; nation_id: string | null; capacity_cost: number;
      }>();
    if (!order || !rule || order.capacity_cost <= 0) {
      return privateJson({ error: 'Work order unavailable.' }, { status: 404 });
    }
    const reward = rewards[workOrderId];
    if (!reward) return privateJson({ error: 'Shift reward unavailable.' }, { status: 409 });
    const id = crypto.randomUUID();
    const completesAt = new Date(Date.parse(now) + rule.hours * 60 * 60 * 1000).toISOString();
    // D1 batch is transactional: scheduling and debiting succeed together.
    const [scheduled] = await database.batch([
      database.prepare(startShiftSql).bind(id, order.id, order.name, rule.output,
        order.capacity_cost, now, completesAt, userId, order.capacity_cost,
        order.nation_id, order.nation_id, userId),
      database.prepare(debitShiftSql).bind(order.capacity_cost, now, userId, id, userId),
      database.prepare(`INSERT INTO shift_rewards (shift_id, wage_minor, item, quantity)
        SELECT id, ?, ?, ? FROM work_shifts WHERE id = ? AND clerk_user_id = ?`)
        .bind(reward.wageMinor, reward.item, reward.quantity, id, userId),
    ]);
    const shifts = await readShifts(database, userId);
    const profile = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?')
      .bind(userId).first<{ capacity: number }>();
    if (!scheduled.meta.changes) {
      return privateJson({ error: 'Finish your active shift, check your citizenship and available capacity.',
        shifts, capacity: profile?.capacity ?? 0 }, { status: 409 });
    }
    return privateJson({ ok: true, aurellePlan:await readAurelle(database,userId), shifts, capacity: profile?.capacity ?? 0, economy: await readEconomy(database, userId, interval), market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId) });
  }

  if (body.action === 'claim-work') {
    const shiftId = typeof body.shiftId === 'string' ? body.shiftId : '';
    const shift = await database.prepare('SELECT claimed_at, completes_at, work_order_id FROM work_shifts WHERE id = ? AND clerk_user_id = ?')
      .bind(shiftId, userId).first<{ claimed_at: string | null; completes_at: string; work_order_id: string }>();
    if (!shift) return privateJson({ error: 'Shift unavailable.' }, { status: 404 });
    if (shift.work_order_id === 'aurelle-food-estate') return privateJson({ error: 'Collect this charter shift with aurelle-claim-work; the reward stays in Crowns.', aurellePlan:await readAurelle(database,userId) }, { status:409 });
    if (shift.completes_at > now) {
      return privateJson({ error: 'Your shift is still underway.' }, { status: 409 });
    }
    // One ledger transfer carries both wages and inventory; every write rolls back together.
    // Budget guard is in the insert itself, so concurrent settlements cannot overdraw the pool.
    await database.batch([
      database.prepare(settleSql).bind(now, shiftId, userId, now),
      database.prepare(settledContributionSql)
        .bind(now, shiftId, userId, now),
      database.prepare(finishSettledShiftSql)
        .bind(now, shiftId, userId, now),
    ]);
    const settled = await database.prepare('SELECT shift_id FROM shift_settlements WHERE shift_id = ? AND clerk_user_id = ?')
      .bind(shiftId, userId).first();
    if (!settled && !shift.claimed_at) return privateJson({ error: 'Employer funds unavailable. Your finished shift is retained; retry later.' }, { status: 409 });
    return privateJson({ ok: true, aurellePlan:await readAurelle(database,userId), shifts: await readShifts(database, userId), economy: await readEconomy(database, userId, interval), market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId) });
  }

  return privateJson({ error: 'Unknown action.' }, { status: 400 });
}
