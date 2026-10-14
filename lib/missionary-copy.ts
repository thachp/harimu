/** Missionary invitation, mute and conversion copy for the MVP faiths and host nations (issue #266). Content only: the
 * mechanics are #225 and no UI imports this. Canon: harimu-docs religion-faiths §14.8 (one invitation per citizen per
 * 14 real days [ASSUMPTION]; at most one faith change per 60 real days; a full mute option; conversion happens only if
 * the citizen accepts; host permission is free in pluralist nations, Kinward Rite only in Aurelle with other faiths
 * private-only, banned in Korund), §14.3 (conversion prompts are always opt-in), §14.2 (Aurelle: leaving the Kinward
 * Rite costs Royal Favor) and §14.1 teachings. Social tone only (§14.4). No state or missionary can change a citizen's
 * faith: only the player chooses. Follows the faith rulings (#259/#265): no Devotion tiers, no gating hints, no
 * posture verbs, and the Korund line names no faith. The mute toggle belongs in display preferences (not wired here).
 * All wording is new: `proposal: true`. */

export type MissionFaithId='kinward-rite'|'fair-wind-vow'|'open-hand';
export type HostNationId='kindle'|'aurelle'|'korund';
export type Line={text:string;proposal:true};
export type InvitationCopy={faithId:MissionFaithId;pitch:string;body:string;buttons:{accept:string;notNow:string;mute:string};proposal:true};

export const MISSION_PITCH_MAX=60;
export const MISSION_LINE_MAX=140;
export const MISSION_BUTTON_MAX=24;
export const INVITATION_COOLDOWN_DAYS=14;
export const FAITH_CHANGE_LOCK_DAYS=60;
export const MISSION_FAITHS:readonly MissionFaithId[]=['kinward-rite','fair-wind-vow','open-hand'];
export const HOST_NATIONS:readonly HostNationId[]=['kindle','aurelle','korund'];

const L=(text:string):Line=>({text,proposal:true});
const buttons={accept:'Accept',notNow:'Not now',mute:'Mute missionaries'} as const;
const inv=(faithId:MissionFaithId,pitch:string,body:string):InvitationCopy=>({faithId,pitch,body,buttons,proposal:true});

export const invitationCopy:Readonly<Record<MissionFaithId,InvitationCopy>>={
 'kinward-rite':inv('kinward-rite','A missionary of the Kinward Rite invites you.',
  'The Kinward Rite keeps household hearths and name-stones. Keep your oaths and your name. The choice is yours alone.'),
 'fair-wind-vow':inv('fair-wind-vow','A missionary of the Fair-Wind Vow invites you.',
  'The Fair-Wind Vow asks Honest Measure, Safe Return and Good Fortune for all who travel and trade fairly. The choice is yours alone.'),
 'open-hand':inv('open-hand','A missionary of the Open Hand invites you.',
  'The Open Hand runs bread halls. What you hold is held in trust for those in need. The choice is yours alone.'),
};

export const conversionToasts={
 accepted:L(`Your faith is now changed, by your choice. You can change faith again after ${FAITH_CHANGE_LOCK_DAYS} real days.`),
 declined:L('Invitation declined. Nothing about your faith has changed.'),
} as const;

export const cooldownNotices={
 invitationRecent:L(`You already received an invitation in the last ${INVITATION_COOLDOWN_DAYS} days. Missionaries can invite you again after that.`),
 faithChangeLocked:L(`You changed faith recently. Your next change unlocks ${FAITH_CHANGE_LOCK_DAYS} real days after the last one.`),
} as const;

/** Display preferences (lib/display-preferences.ts owns the toggle; not wired here). */
export const muteCopy={
 label:L('Mute missionaries'),
 muted:L('Missionaries are muted. You will not receive invitations.'),
 unmuted:L('Missionaries are unmuted. Invitations may arrive again, at most one every 14 days.'),
} as const;

export const hostPermissionNotices:Readonly<Record<HostNationId,readonly Line[]>>={
 kindle:[L('Kindle allows open preaching. Missionaries of any faith may hold services here.')],
 aurelle:[L('In Aurelle only the Kinward Rite may preach. Other faiths are private-only here.'),
  L('In Aurelle, leaving the Kinward Rite costs Royal Favor.')],
 korund:[L('Preaching is banned in Korund. This missionary cannot preach here.')],
};
