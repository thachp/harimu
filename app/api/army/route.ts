import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { armiesEnabled, armyDrillsEnabled, parseArmyCommand } from '@/lib/army-rules';
import { readArmy, runArmyCommand } from '@/lib/army';
import { serviceUntil } from '@/lib/army-conscription';
import { readActiveWars } from '@/lib/army-map';
import { applySupplyLoss, armySupplyEnabled, unitSupply } from '@/lib/army-supply';
import { armyBattlesEnabled, readBattles, withBattleLosses } from '@/lib/army-battle';
import { unitById } from '@/lib/army-rules';

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
  // #738 battle losses: carried losses first, then the #897 supply loss below, the same order as battle resolution (QA2 on #940).
  if (army.unit && army.unit.strength !== undefined && armyBattlesEnabled(env)) army.unit = { ...army.unit, strength: await withBattleLosses(db, army.unit.id, army.unit.strength, now) };
  const unit = army.unit;
  // #738 slice 5: a cut supply line lowers the shown strength (only while HARIMU_ARMY_SUPPLY_ENABLED is on and strength is shown; off: no extra read).
  if (unit && unit.strength !== undefined && armySupplyEnabled(env)) {
    const supply = unitSupply(unitById(unit.id)?.nationId ?? '', await readActiveWars(db), now);
    army.unit = { ...unit, strength: applySupplyLoss(unit.strength, supply.strengthLossPct), supply };
  }  // #738 battles: your unit's battle (as attacker or defender), with the strength it has left, only while HARIMU_ARMY_BATTLES_ENABLED is on.
  const nationId = army.unit ? unitById(army.unit.id)?.nationId : undefined;
  if (army.unit && army.unit.strength !== undefined && nationId && armyBattlesEnabled(env)) {
    const battle = (await readBattles(db, await readActiveWars(db), now)).find(b => b.attackerNationId === nationId || b.defenderNationId === nationId);
    if (battle) army.unit = { ...army.unit, strength: battle.attackerNationId === nationId ? battle.attackerStrength : battle.defenderStrength, battle: { opponentNationId: battle.attackerNationId === nationId ? battle.defenderNationId : battle.attackerNationId, attacking: battle.attackerNationId === nationId, rounds: battle.rounds, status: battle.status } };
  }

  return privateJson({ army: { ...army, ...(until ? { serveUntil: until } : {}) } });
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
  const result = await runArmyCommand(await getDatabase(), userId, command, Math.floor(Date.now() / 1000));
  return result.ok ? privateJson({ army: { unit: result.unit, member: result.member, stance: result.stance }, replayed: result.replayed }) : privateJson({ error: result.error, reason: result.reason }, result.status);
}
