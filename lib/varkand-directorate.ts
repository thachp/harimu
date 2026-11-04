/** #1085: Directorate of the Five Commands. The Chair rotates every 60 real days (2 game years).
 *  Pure: no database, so no migration. The 4-of-5 extension vote is out of scope.
 *  [ASSUMPTION] lib/leader-personas.ts has no Varkand roster. lib/leader-drafts.ts names one inactive
 *  Chair, Marren "Bastion" Kell, for the rotating office rather than one Command, so that name is the
 *  Army Marshal (first in the doc order, and the Chair at the anchor). The other four Marshals are new
 *  names in the culture-table style: given name, unit nickname, v/k/d sounds.
 *  [ASSUMPTION] The anchor is the Unix epoch. varkandChairAt takes only nowMs, and the world clock
 *  epoch is per shard, so the rotation cannot follow that clock. */
export type VarkandCommandId = 'army' | 'fleet' | 'gendarmerie' | 'arsenal' | 'intelligence';
export type VarkandCommand = { id: VarkandCommandId; command: string; marshal: string };

/** Doc order: Army, Fleet, Gendarmerie, Arsenal (industry and logistics), Intelligence. */
export const varkandCommands: readonly VarkandCommand[] = [
  { id: 'army', command: 'Army', marshal: 'Marren "Bastion" Kell' },
  { id: 'fleet', command: 'Fleet', marshal: 'Korv "Signal" Dasken' },
  { id: 'gendarmerie', command: 'Gendarmerie', marshal: 'Vessa "Watch" Korr' },
  { id: 'arsenal', command: 'Arsenal', marshal: 'Dren "Ledger" Vask' },
  { id: 'intelligence', command: 'Intelligence', marshal: 'Kalder "Quiet" Venn' },
];

export const VARKAND_ROTATION_MS = 60 * 86_400_000;
export const VARKAND_CHAIR_ANCHOR_MS = 0;
const maxStep = Math.floor(Number.MAX_SAFE_INTEGER / VARKAND_ROTATION_MS) - 1;

/** Current Chair and the next Rotation Day, in integer milliseconds. Before the anchor the first Command still holds the Chair. */
export function varkandChairAt(nowMs: number): { chair: VarkandCommand; nextRotationAt: number } {
  const now = Number.isFinite(nowMs) ? Math.trunc(nowMs) : VARKAND_CHAIR_ANCHOR_MS;
  const elapsed = Math.max(0, now - VARKAND_CHAIR_ANCHOR_MS);
  const step = Math.min(Math.floor(elapsed / VARKAND_ROTATION_MS), maxStep);
  const nextRotationAt = VARKAND_CHAIR_ANCHOR_MS + (step + 1) * VARKAND_ROTATION_MS;
  return { chair: varkandCommands[step % varkandCommands.length], nextRotationAt };
}
