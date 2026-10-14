/**
 * #198 NPC supplier farms: pure rules (no runtime imports, so tests load them directly).
 * Seeds early liquidity at a fair-but-high ask, then steps aside as players sell more.
 * [ASSUMPTION] numbers below; tune with play data.
 */
export const npcSupplierId = 'kindle-farm';
export const npcMarkup = 1.15;
export const npcFloorShare = 0.1;
export const npcWindowDays = 3;
export const npcSupply = {
  fruit: { referenceMinor: 120, baseQty: 40 },
  meat: { referenceMinor: 300, baseQty: 20 },
  wood: { referenceMinor: 200, baseQty: 30 },
} as const;
export type NpcGood = keyof typeof npcSupply;

/** Daily NPC quantity: base minus trailing player sell volume, never below the floor (10% of base, at least 1). */
export function npcQuantity(good: NpcGood, playerSoldInWindow: number): number {
  const { baseQty } = npcSupply[good];
  const floor = Math.max(1, Math.ceil(baseQty * npcFloorShare));
  return Math.max(floor, baseQty - Math.max(0, Math.floor(playerSoldInWindow)));
}
/** NPC ask: reference × markup, but never at or below the best player ask (players win ties and cheaper asks fill first). */
export function npcAskMinor(good: NpcGood, bestPlayerAskMinor: number | null): number {
  const markup = Math.ceil(npcSupply[good].referenceMinor * npcMarkup);
  return bestPlayerAskMinor !== null && bestPlayerAskMinor >= markup ? bestPlayerAskMinor + 1 : markup;
}
export const npcOrderId = (good: NpcGood, day: number) => `npc:${npcSupplierId}:${good}:${day}`;
