import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { armiesEnabled, armyDrillsEnabled, parseArmyCommand } from '@/lib/army-rules';
import { readArmy, runArmyCommand } from '@/lib/army';
import { serviceUntil } from '@/lib/army-conscription';
import { marchPace, readActiveWars, winterRoadNote } from '@/lib/army-map';
import { winterMarchEnabled } from '@/lib/winter-march'; // #1038
import { applySupplyLoss, ARMY_SUPPLY_RANGE_SQUARES, armySupplyEnabled, unitSupply } from '@/lib/army-supply';
import { armyBattlesEnabled, readBattles, withBattleLosses } from '@/lib/army-battle';
import { unitById } from '@/lib/army-rules';
import { readWoundedUntil, woundedRefusal } from '@/lib/army-wounds';
import { armyQuartermasterEnabled, readQuartermasterExtra } from '@/lib/army-quartermaster'; // #1053

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const notFound = () => privateJson({ error: 'Not found.', reason: 'not_found' }, 404);

// #738 slice 1: your nation's home-guard unit. HARIMU_ARMIES_ENABLED and HARIMU_WAR_ENABLED both "true", else 404 before auth or any DB access.
export async function GET(request: Request) {
  if (!armiesEnabled(env)) return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  // ARC on #839: GET never writes; the draft and term-end release run on POST /api/army/draft (the card's open action).
  const until = await serviceUntil(db, userId, now);
  const army = await readArmy(db, userId, now, armyDrillsEnabled(env));
  const pace = await marchPace(db, winterMarchEnabled(env)); // flag off: no clock read
  // #738 battle losses: carried losses first, then the #897 supply loss below, the same order as battle resolution (QA2 on #940).
  if (army.unit && army.unit.strength !== undefined && armyBattlesEnabled(env)) army.unit = { ...army.unit, strength: await withBattleLosses(db, army.unit.id, army.unit.strength, now) };
  const unit = army.unit;
  // #738 slice 5: a cut supply line lowers the shown strength (only while HARIMU_ARMY_SUPPLY_ENABLED is on and strength is shown; off: no extra read).
  if (unit && unit.strength !== undefined && armySupplyEnabled(env)) {
    const nation = unitById(unit.id)?.nationId ?? '';
    // #1053: quartermaster shifts widen the range (flag off: no extra read, extra 0, the supply key keeps its old shape).
    const qm = armyQuartermasterEnabled(env) ? (await readQuartermasterExtra(db, now)).get(nation) ?? 0 : null;
    const supply = unitSupply(nation, await readActiveWars(db), now, undefined, pace, qm ?? 0);
    army.unit = { ...unit, strength: applySupplyLoss(unit.strength, supply.strengthLossPct), supply: qm === null ? supply : { ...supply, rangeSquares: ARMY_SUPPLY_RANGE_SQUARES + qm, quartermasterSquares: qm } };
  }  // #738 battles: your unit's battle (as attacker or defender), with the strength it has left, only while HARIMU_ARMY_BATTLES_ENABLED is on.
  const nationId = army.unit ? unitById(army.unit.id)?.nationId : undefined;
  if (army.unit && army.unit.strength !== undefined && nationId && armyBattlesEnabled(env)) {
    const battle = (await readBattles(db, await readActiveWars(db), now, pace)).find(b => b.attackerNationId === nationId || b.defenderNationId === nationId);
    if (battle) army.unit = { ...army.unit, strength: battle.attackerNationId === nationId ? battle.attackerStrength : battle.defenderStrength, battle: { opponentNationId: battle.attackerNationId === nationId ? battle.defenderNationId : battle.attackerNationId, attacking: battle.attackerNationId === nationId, rounds: battle.rounds, status: battle.status } };
  }

  // #911: a wounded citizen sees when they are back in action (flag off: no extra read).
  const wounded = armyBattlesEnabled(env) ? await readWoundedUntil(db, userId, now) : null;
  const march = pace && nationId ? winterRoadNote(nationId, await readActiveWars(db), now, pace) : null;
  return privateJson({ army: { ...army, ...(march ? { march } : {}), ...(until ? { serveUntil: until } : {}), ...(wounded ? { woundedUntil: wounded } : {}) } });
}

/** POST {action:'join', unitId} | {action:'leave'} | {action:'stance', stance}, each with a requestId (replay returns the current state, writes nothing). */
export async function POST(request: Request) {
  if (!armiesEnabled(env)) return notFound();
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send an army command.', reason: 'bad_request' }, 400); }
  const command = parseArmyCommand(body);
  if (!command) return privateJson({ error: 'Send action join (unitId), leave or stance (hold, advance, fall_back) with a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  // #911: wounded citizens cannot join or take a stance until they recover; leaving is always allowed (flag off: no extra read).
  if (command.action !== 'leave' && armyBattlesEnabled(env)) { const wounded = await readWoundedUntil(db, userId, now); if (wounded) return privateJson(woundedRefusal(wounded), 409); }
  const result = await runArmyCommand(db, userId, command, now);
  return result.ok ? privateJson({ army: { unit: result.unit, member: result.member, stance: result.stance }, replayed: result.replayed }) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
