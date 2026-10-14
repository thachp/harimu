import {accountElectionEnabled,accountElectionDatabase,accountElectionId} from '@/lib/preview-election';
import { publicGovernmentSnapshot } from '@/lib/government-disclosure';
import { validEnrollmentExpectation, citizenshipStatus, enrollmentInitialSql, enrollmentFirstSql, enrollmentChangeSql } from '@/lib/citizenship';
import { readAurelle, validAurelleCommand, executeAurelle } from '@/lib/aurelle';
import { readKorund, validKorundCommand, executeKorund } from '@/lib/korund';
import { advanceWorld, readWorldSimulation } from '@/lib/world-simulation';
import { readVerification } from '@/lib/verification';
import { petitionSql, petitionEligibilitySql, readGovernment, latchGovernmentReviews } from '@/lib/government-state';
import { executePlayerCommand, validPlayerCommand, readPlayerMarket } from '@/lib/player-market';
import { executeMarketCommand, validMarketCommand, readMarket } from '@/lib/market';
import { applyQuality, validQualityInput, harvestQuestions, qualityWorkOrderId, type QualityInput } from '@/lib/shift-quality';
import { gradeShift, shiftQualitySecret, issueQualityTicket, redeemQualityTicket, shiftAnswerKey } from '@/lib/shift-quality-key';
import { rewards, recoverCapacity, readEconomy, readCapacityProjection, pendingStarterFood, recoveryInterval, settleSql, withholdIncomeTaxSql, settledContributionSql, finishSettledShiftSql } from '@/lib/economy';
import { shiftRules, readShifts, startShiftSql, debitShiftSql } from '@/lib/work-shifts';
import {readElection,openPreviewElection} from '@/lib/elections';
import {readCollectivePetitions,recordVerifiedHumanVisit} from '@/lib/collective-petitions';
import { authenticatedUserId } from '@/lib/auth';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { travelBlock } from '@/lib/travel';
import { checkFirstWeekGoal, completeFirstWeekGoal, latchAfterWrite, latchFirstWeekGoals, readFirstWeekProgress } from '@/lib/first-week-server';
import { qaTestCitizenAllowed, qaTestNationSql, qaTestNations } from '@/lib/qa-tools';
import { activeIncomeTaxPercent } from '@/lib/income-tax';
/** #86: the Kindle income tax rate in force (0 while HARIMU_KINDLE_INCOME_TAX_ENABLED is off, the shipped default). */
/** #235: Korund Labor Bureau (job preferences, AI assignment, 30-day reassignment). Ships off. */
const laborBureauOn = () => (env as unknown as { HARIMU_LABOR_BUREAU_ENABLED?: string }).HARIMU_LABOR_BUREAU_ENABLED === 'true';
const incomeTaxPercentNow = () => activeIncomeTaxPercent((env as unknown as { HARIMU_KINDLE_INCOME_TAX_ENABLED?: string }).HARIMU_KINDLE_INCOME_TAX_ENABLED);

export const dynamic = 'force-dynamic';
const locationBoundActions = new Set(['commit-work', 'market-trade', 'household-meal', 'create-listing', 'buy-listing', 'korund-start-work', 'korund-join-ration-queue', 'korund-redeem-coupon', 'korund-redeem-ration', 'aurelle-start-work', 'cancel-listing', 'aurelle-buy-food', 'aurelle-household-meal', 'korund-household-meal']);
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

  // #205: GET is read-only. World ticks, capacity recovery, the starter food grant, the preview election and the
  // verified-human visit are written by the write paths (POST); here they are projected so players see the same values.
  const database = await getDatabase();
  const readNow = Math.floor(Date.now() / 1000);
  const simulation = await readWorldSimulation(database, readNow);
  const interval = recoveryInterval((env as unknown as { HARIMU_CAPACITY_RECOVERY_SECONDS?: string }).HARIMU_CAPACITY_RECOVERY_SECONDS);
  const [capacity, starterFood] = await Promise.all([readCapacityProjection(database, userId, readNow, interval), pendingStarterFood(database, userId)]);
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
      UNION ALL SELECT 1 FROM government_petitions WHERE clerk_user_id = ? UNION ALL SELECT 1 FROM civic_petition_signatures WHERE clerk_user_id = ? UNION ALL SELECT 1 FROM civic_voter_receipts WHERE clerk_user_id = ? AND ballot_written=1 UNION ALL SELECT 1 FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1
    ) AS political_action_taken`).bind(userId, userId, userId, userId,userId).first<{ political_action_taken: number }>(),
  ]);

  const verification=await readVerification(userId);
  const civicNow=Math.floor(Date.now()/1000);
  const accountLevel=accountElectionEnabled(env as unknown as {NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string;HARIMU_ACCOUNT_ELECTION_POC_ENABLED?:string});
  const electionDatabase=accountLevel?accountElectionDatabase(database):database;
  if (profile && capacity) profile.capacity = capacity.capacity;
  const market = await readMarket(database, userId, interval);
  if (starterFood && market.householdRecord) market.householdRecord = { ...market.householdRecord, starterFoodGranted: starterFood };
  return privateJson({
    aurellePlan: await readAurelle(database,userId),
    election:profile?.nation_id==='kindle'?{...await readElection(electionDatabase,userId,civicNow,accountLevel||undefined,accountLevel||verification.countedActionsEligible,true),...(accountLevel?{id:accountElectionId}:{})}:null,
    collectivePetitions:profile?.nation_id==='kindle'?await readCollectivePetitions(database,userId,civicNow,verification.countedActionsEligible):null,
    korundPlan: await readKorund(database,userId,Math.floor(Date.now()/1000),{laborBureau:laborBureauOn()}),
    firstWeek: profile ? await readFirstWeekProgress(database,userId) : null,
    simulation,
    verification,
    economy: await readEconomy(database, userId, interval, { readOnly: true, now: readNow, incomeTaxPercent: incomeTaxPercentNow() }),
    market,
    playerMarket: await readPlayerMarket(database, userId),
    government: profile?.nation_id ? publicGovernmentSnapshot(await readGovernment(database, profile.nation_id, Math.floor(Date.now()/1000), userId, { readOnly: true, korundPresidium: (env as unknown as { HARIMU_KORUND_PRESIDIUM_ENABLED?: string }).HARIMU_KORUND_PRESIDIUM_ENABLED === 'true' })) : null,
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

// #194: first-week ledger goals latch on the write paths, not on GET. A trade also latches the seller.
export async function POST(request: Request) {
  const response = await handlePost(request);
  if (!response.ok) return response;
  const userId = await authenticatedUserId(request);
  if (!userId) return response;
  const database = await getDatabase();
  const nowSec = Math.floor(Date.now() / 1000);
  // #205: side effects GET used to perform now happen on the write path (after enrolment too).
  try { await recordCivicPresence(database, userId, nowSec); } catch (error) { console.warn('civic presence latch failed', error instanceof Error ? error.name : 'unknown'); /* best effort; never fails the write */ }
  const sellers = (await database.prepare('SELECT DISTINCT seller_id FROM player_fills WHERE buyer_id=? AND filled_at>=?').bind(userId, nowSec - 300).all<{ seller_id: string }>().catch(() => ({ results: [] as { seller_id: string }[] }))).results ?? [];
  return latchAfterWrite(database, response, [userId, ...sellers.map(r => r.seller_id)], nowSec);
}

/** #205: the preview-election opening, verified-human visit and starter grant/capacity clock that GET used to write. */
async function recordCivicPresence(database: Awaited<ReturnType<typeof getDatabase>>, userId: string, now: number) {
  const interval = recoveryInterval((env as unknown as { HARIMU_CAPACITY_RECOVERY_SECONDS?: string }).HARIMU_CAPACITY_RECOVERY_SECONDS);
  await recoverCapacity(database, userId, new Date(now * 1000).toISOString(), interval);
  const citizen = await database.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  // The completed-day petition review latch that GET used to write (QA1 on #217); the world tick also latches it.
  if (citizen?.nation_id) await latchGovernmentReviews(database, citizen.nation_id, now);
  if (citizen?.nation_id !== 'kindle') return;
  const accountLevel = accountElectionEnabled(env as unknown as { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string });
  if (accountLevel) await openPreviewElection(accountElectionDatabase(database), userId, now, true);
  if ((await readVerification(userId)).countedActionsEligible) { await recordVerifiedHumanVisit(database, userId, now, { aurelleRising: (env as unknown as { HARIMU_AURELLE_RISING_ENABLED?: string }).HARIMU_AURELLE_RISING_ENABLED === 'true' }); await openPreviewElection(database, userId, now); }
}

async function handlePost(request: Request) {
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, { status: 403 });
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const simulation = await advanceWorld(database, undefined, { npcSupply: (env as unknown as { HARIMU_ORDER_BOOK_ENABLED?: string }).HARIMU_ORDER_BOOK_ENABLED === 'true', aurelleRising: (env as unknown as { HARIMU_AURELLE_RISING_ENABLED?: string }).HARIMU_AURELLE_RISING_ENABLED === 'true', korundPresidium: (env as unknown as { HARIMU_KORUND_PRESIDIUM_ENABLED?: string }).HARIMU_KORUND_PRESIDIUM_ENABLED === 'true', faithFestivals: (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true' });
  const interval = recoveryInterval((env as unknown as { HARIMU_CAPACITY_RECOVERY_SECONDS?: string }).HARIMU_CAPACITY_RECOVERY_SECONDS);
  await recoverCapacity(database, userId, new Date().toISOString(), interval);
  let body: Record<string, unknown>;
  try {
    body = await readCommandObject(request);
  } catch {
    return privateJson({ error: 'Expected valid JSON.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  // #123: while travelling, location-bound actions wait for arrival (only when HARIMU_TRAVEL_ENABLED=true).
  if (typeof body.action === 'string' && locationBoundActions.has(body.action)) {
    const blocked = await travelBlock(database, userId, Math.floor(Date.parse(now) / 1000), (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, { status: 409 });
  }

  // #135: record a first-week goal (view-backed or client-detected). Idempotent; guidance only.
  if (body.action === 'first-week-complete') {
    if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(body.requestId)) return privateJson({ error: 'Use a valid request identifier.' }, { status: 400 });
    const citizen = await database.prepare('SELECT nation_id, created_at FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null; created_at: string }>();
    const nowSec = Math.floor(Date.parse(now) / 1000);
    const check = checkFirstWeekGoal(citizen?.nation_id ?? null, citizen?.created_at ?? '', body.goalId, nowSec);
    if (!check.ok) return privateJson({ error: check.error }, { status: check.status });
    await completeFirstWeekGoal(database, userId, body.goalId as string, nowSec);
    await latchFirstWeekGoals(database, userId, nowSec);
    return privateJson({ ok: true, firstWeek: await readFirstWeekProgress(database, userId) });
  }
  if (typeof body.action === 'string' && body.action.startsWith('aurelle-')) {
    if (!validAurelleCommand(body)) return privateJson({error:'Use a valid request identifier, shift identifier and food quantity of 1 or 2.'},{status:400});
    const result=await executeAurelle(database,userId,body,Math.floor(Date.parse(now)/1000));
    const citizen=await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(userId).first<{capacity:number}>();
    return privateJson({...result,ok:result.status===200,aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,Math.floor(Date.parse(now)/1000),{laborBureau:laborBureauOn()}),shifts:await readShifts(database,userId),capacity:citizen?.capacity??0},{status:result.status});
  }

  if (typeof body.action === 'string' && body.action.startsWith('korund-')) {
    if (!validKorundCommand(body)) return privateJson({error:'Use a valid work or request identifier.'},{status:400});
    const seconds=Math.floor(Date.parse(now)/1000);
    const result=await executeKorund(database,userId,body,seconds,{laborBureau:laborBureauOn()});
    const citizen=await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(userId).first<{capacity:number}>();
    return privateJson({...result,ok:result.status===200,shifts:await readShifts(database,userId),aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,seconds,{laborBureau:laborBureauOn()}),capacity:citizen?.capacity??0},{status:result.status});
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
    return privateJson({ ok:true, government: publicGovernmentSnapshot(await readGovernment(database, recorded.nation_id, seconds, userId, { korundPresidium: (env as unknown as { HARIMU_KORUND_PRESIDIUM_ENABLED?: string }).HARIMU_KORUND_PRESIDIUM_ENABLED === 'true' })),
      citizenship: citizen ? serializeCitizenship(citizen,true) : null });
  }

  if (body.action === 'create-listing' || body.action === 'buy-listing' || body.action === 'cancel-listing') {
    if (!validPlayerCommand(body)) return privateJson({ error: 'Use valid request/listing identifiers, 1–10 goods and an integer price from 1 to 1000 Spark cents.' }, { status: 400 });
    const command = { ...body, requestId: body.requestId.toLowerCase(), listingId: typeof body.listingId === 'string' ? body.listingId.toLowerCase() : undefined };
    const result = await executePlayerCommand(database, userId, command, Math.floor(Date.parse(now) / 1000));
    return privateJson({ ...result, aurellePlan:await readAurelle(database,userId), economy: await readEconomy(database, userId, interval, { incomeTaxPercent: incomeTaxPercentNow() }),
      playerMarket: await readPlayerMarket(database, userId) }, { status: result.status });
  }

  if (body.action === 'market-trade' || body.action === 'household-meal') {
    if (!validMarketCommand(body)) return privateJson({ error: 'Use a valid request id, good, side and integer quantity from 1 to 10.' }, { status: 400 });
    const command = { ...body, requestId: body.requestId.toLowerCase() };
    const result = await executeMarketCommand(database, userId, command, Math.floor(Date.parse(now) / 1000), interval);
    const citizen = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ capacity: number }>();
    return privateJson({ ...result, aurellePlan:await readAurelle(database,userId), economy: await readEconomy(database, userId, interval, { incomeTaxPercent: incomeTaxPercentNow() }),
      market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId), capacity: citizen?.capacity ?? 0 }, { status: result.status });
  }

  // #138: preview-only QA nation switch for allowlisted accounts; 404 everywhere else.
  if (body.action === 'qa-test-nation') {
    if (!qaTestCitizenAllowed(env as never, userId)) return privateJson({ error: 'Not found.' }, { status: 404 });
    const nationId = typeof body.nationId === 'string' ? body.nationId : '';
    if (!(qaTestNations as readonly string[]).includes(nationId)) return privateJson({ error: 'Choose kindle, korund or aurelle.' }, { status: 400 });
    const result = await database.prepare(qaTestNationSql).bind(nationId, now, userId).run();
    if (!result.meta.changes) return privateJson({ error: 'Enroll in any nation first.' }, { status: 409 });
    return privateJson({ ok: true, nationId, qa: true });
  }
  if (body.action === 'enroll') {
    if (!validEnrollmentExpectation(body)) return privateJson({error:'Confirm the current citizenship with expectedNationId (a nation identifier or null for first enrollment).'}, {status:400});
    const nationId = typeof body.nationId === 'string' ? body.nationId : '';
    const nation = await database.prepare('SELECT id FROM nations WHERE id = ?').bind(nationId).first();
    if (!nation) return privateJson({ error: 'Unknown nation.' }, { status: 400 });
    const readCurrent=()=>database.prepare(`SELECT clerk_user_id,nation_id,nation_changes,display_name,capacity,influence,standing,created_at
      FROM citizens WHERE clerk_user_id=?`).bind(userId).first<CitizenProfileRow>();
    const readPolitical=async()=>Boolean((await database.prepare(`SELECT EXISTS(
      SELECT 1 FROM citizen_decisions WHERE clerk_user_id=? UNION ALL SELECT 1 FROM government_petitions WHERE clerk_user_id=? UNION ALL SELECT 1 FROM civic_petition_signatures WHERE clerk_user_id=? UNION ALL SELECT 1 FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 UNION ALL SELECT 1 FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1
    ) AS taken`).bind(userId,userId,userId,userId,userId).first<{taken:number}>())?.taken);
    const response=async(profile:CitizenProfileRow|null,ok:boolean,error?:string)=>privateJson({ok,error,nationId:profile?.nation_id??null,capacity:profile?.capacity??null,
      simulation,verification:await readVerification(userId),
      government:profile?.nation_id?publicGovernmentSnapshot(await readGovernment(database,profile.nation_id,Math.floor(Date.parse(now)/1000),userId,{korundPresidium:(env as unknown as { HARIMU_KORUND_PRESIDIUM_ENABLED?: string }).HARIMU_KORUND_PRESIDIUM_ENABLED === 'true'})):null,
      citizenship:profile?serializeCitizenship(profile,await readPolitical()):null,
      aurellePlan:await readAurelle(database,userId),korundPlan:await readKorund(database,userId,Math.floor(Date.parse(now)/1000),{laborBureau:laborBureauOn()}),
      economy:await readEconomy(database, userId, interval, { incomeTaxPercent: incomeTaxPercentNow() }),market:await readMarket(database,userId,interval),playerMarket:await readPlayerMarket(database,userId),
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
      await database.prepare(enrollmentChangeSql).bind(nationId,now,userId,body.expectedNationId,nationId,now,now,userId,userId,userId,userId,userId).run();
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
    if (profile.nation_id !== 'kindle') return privateJson({ error: 'Personal commitments are currently supported only in Kindle.' }, { status: 409 });
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

    // Insert the immutable receipt only while nation and capacity still qualify.
    // The immediately following UPDATE applies only this transaction's new row.
    const committed = await database.batch([
      database.prepare(`INSERT OR IGNORE INTO citizen_decisions (
        clerk_user_id, decision_id, task_id, infrastructure_id, household_member_id,
        capacity_delta, influence_delta, water_delta, stability_delta, outcome, committed_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM citizens
        WHERE clerk_user_id=? AND nation_id='kindle' AND capacity+?>=0`).bind(
        userId, decisionRow.decision_id, decisionRow.task_id, decisionRow.infrastructure_id,
        decisionRow.household_member_id, decisionRow.capacity_delta, decisionRow.influence_delta,
        decisionRow.water_delta, decisionRow.stability_delta, decisionRow.outcome, decisionRow.committed_at,
        userId, effect.capacity_delta,
      ),
      database.prepare(`UPDATE citizens SET capacity=capacity+?, influence=influence+?, updated_at=?
        WHERE clerk_user_id=? AND changes()=1`).bind(effect.capacity_delta,effect.influence_delta,now,userId),
      database.prepare(`INSERT INTO citizen_plans (clerk_user_id, horizon, private_note, saved_at)
        SELECT ?, ?, ?, ? WHERE changes()=1
        ON CONFLICT(clerk_user_id) DO UPDATE SET
          horizon = excluded.horizon,
          private_note = excluded.private_note,
          saved_at = excluded.saved_at`)
        .bind(userId, horizon, note, now),
      database.prepare(`INSERT INTO citizen_plan_items (
        clerk_user_id, task_id, completed, updated_at
      ) SELECT ?, ?, 1, ? WHERE changes()=1
        ON CONFLICT(clerk_user_id,task_id) DO UPDATE SET completed=1,updated_at=excluded.updated_at`).bind(userId, optionId, now),
      // Delete other selections only when the saved decision and its selected
      // draft item match. A losing concurrent retry cannot replace that draft.
      database.prepare(`DELETE FROM citizen_plan_items WHERE clerk_user_id=? AND task_id!=?
        AND EXISTS(SELECT 1 FROM citizen_decisions WHERE clerk_user_id=? AND decision_id=? AND task_id=? AND committed_at=?)
        AND EXISTS(SELECT 1 FROM citizen_plan_items WHERE clerk_user_id=? AND task_id=? AND updated_at=?)`)
        .bind(userId,optionId,userId,activeDecisionId,optionId,now,userId,optionId,now),
    ]);
    const savedDecision=await database.prepare(`SELECT decision_id,task_id,infrastructure_id,household_member_id,
      capacity_delta,influence_delta,water_delta,stability_delta,outcome,committed_at
      FROM citizen_decisions WHERE clerk_user_id=? AND decision_id=?`).bind(userId,activeDecisionId).first<CitizenDecisionRow>();
    if(!savedDecision)return privateJson({error:'Commitment unavailable: citizenship or Work Capacity changed. Refresh your citizen.'},{status:409});

    const updatedProfile = await database.prepare(`SELECT clerk_user_id, nation_id, nation_changes,
      display_name, capacity, influence, standing, created_at FROM citizens WHERE clerk_user_id = ?`)
      .bind(userId)
      .first<CitizenProfileRow>();

    return privateJson({
      ok: true,
      alreadyCommitted: !committed[0].meta.changes,
      profile: updatedProfile ? serializeProfile(updatedProfile, savedDecision, true) : null,
      decision: serializeDecision(savedDecision),
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

  // #252: issue the quality step for the citizen's next shift. Nothing is written and no WC is spent; the ticket
  // carries the future shift id (signed for this user) and the questions in that shift's server-seeded option order.
  if (body.action === 'quality-ticket') {
    if (body.workOrderId !== qualityWorkOrderId) return privateJson({ error: 'This job has no quality step.' }, { status: 404 });
    const secret = shiftQualitySecret(env as unknown as { HARIMU_SHIFT_QUALITY_SECRET?: string });
    if (!secret) return privateJson({ error: 'The quality step is unavailable. You can start the shift for the base reward.' }, { status: 503 });
    return privateJson({ ok: true, ...(await issueQualityTicket(secret, userId, harvestQuestions)) });
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
    const base = rewards[workOrderId];
    if (!base) return privateJson({ error: 'Shift reward unavailable.' }, { status: 409 });
    if (body.quality !== undefined && !validQualityInput(body.quality)) return privateJson({ error: 'Answer all three quality questions or skip the step.' }, { status: 400 });
    // Graded exactly once, here at shift start; the result is stored with the shift (shift_id PK) and a repeat
    // commit-work is refused by the one-active-shift rule, so it cannot re-grade (QA1 #125 review).
    // This route serves signed-in human citizens only; AI/background actors never reach it, and gradeShift
    // returns the base reward for any non-human actor.
    // #252: answers are graded against this shift's own key, derived from the server secret and the shift id the
    // ticket was issued for. The ticket's shift id becomes the shift's id, so a ticket can start at most one shift.
    const input = body.quality as QualityInput | undefined;
    let id: string = crypto.randomUUID();
    let key: number[] | undefined;
    if (input && 'answers' in input) {
      const secret = shiftQualitySecret(env as unknown as { HARIMU_SHIFT_QUALITY_SECRET?: string });
      if (!secret) return privateJson({ error: 'The quality step is unavailable. You can start the shift for the base reward.' }, { status: 503 });
      const ticketShift = await redeemQualityTicket(secret, userId, input.ticket);
      if (!ticketShift) return privateJson({ error: 'This quality step has expired. Open it again.' }, { status: 400 });
      if (await database.prepare('SELECT 1 AS used FROM work_shifts WHERE id = ?').bind(ticketShift).first()) return privateJson({ error: 'This quality step was already used. Open it again.' }, { status: 409 });
      id = ticketShift; key = await shiftAnswerKey(secret, ticketShift, harvestQuestions);
    }
    const quality = gradeShift(workOrderId, input, 'human', key);
    const reward = { ...base, ...applyQuality(base, quality.multiplierPct) };
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
      database.prepare(`INSERT INTO shift_quality (shift_id, grade, multiplier_pct, correct)
        SELECT id, ?, ?, ? FROM work_shifts WHERE id = ? AND clerk_user_id = ?`)
        .bind(quality.grade, quality.multiplierPct, quality.correct, id, userId),
    ]);
    const shifts = await readShifts(database, userId);
    const profile = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?')
      .bind(userId).first<{ capacity: number }>();
    if (!scheduled.meta.changes) {
      return privateJson({ error: 'Finish your active shift, check your citizenship and available capacity.',
        shifts, capacity: profile?.capacity ?? 0 }, { status: 409 });
    }
    return privateJson({ ok: true, aurellePlan:await readAurelle(database,userId), shifts, capacity: profile?.capacity ?? 0, economy: await readEconomy(database, userId, interval, { incomeTaxPercent: incomeTaxPercentNow() }), market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId) });
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
    const taxPercent = incomeTaxPercentNow();
    // One ledger transfer carries both wages and inventory; every write rolls back together.
    // Budget guard is in the insert itself, so concurrent settlements cannot overdraw the pool.
    await database.batch([
      database.prepare(settleSql).bind(now, shiftId, userId, now),
      // #86: Kindle income tax is withheld from this settlement in the same transaction (only while the flag is on).
      ...(taxPercent > 0 ? [database.prepare(withholdIncomeTaxSql).bind(taxPercent, taxPercent, shiftId, userId, now)] : []),
      database.prepare(settledContributionSql)
        .bind(now, shiftId, userId, now),
      database.prepare(finishSettledShiftSql)
        .bind(now, shiftId, userId, now),
    ]);
    const settled = await database.prepare('SELECT shift_id FROM shift_settlements WHERE shift_id = ? AND clerk_user_id = ?')
      .bind(shiftId, userId).first();
    if (!settled && !shift.claimed_at) return privateJson({ error: 'Employer funds unavailable. Your finished shift is retained; retry later.' }, { status: 409 });
    return privateJson({ ok: true, aurellePlan:await readAurelle(database,userId), shifts: await readShifts(database, userId), economy: await readEconomy(database, userId, interval, { incomeTaxPercent: incomeTaxPercentNow() }), market: await readMarket(database, userId, interval), playerMarket: await readPlayerMarket(database, userId) });
  }

  return privateJson({ error: 'Unknown action.' }, { status: 400 });
}
