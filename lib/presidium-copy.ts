/** Korund State Media copy for the emergency Presidium session, Chairman succession and Presidium seat removal
 * (issue #298, companion to SDE #70 / PR #293). Content only: #293 owns session timing, the reform weight, outcome
 * and roster; wiring is an SDE follow-up, and no UI imports this. Canon: harimu-docs coups-transitions §10.2 (in Korund
 * the Crisis Window opens "as a rumor event"), §10.3 (sustained Unrest forces an emergency Presidium session; the AI
 * leader may be purged and replaced by an AI successor), ai-leadership §8 Korund (a designated 'Chosen Comrade' is
 * confirmed or rejected by the AI Presidium; the Chairman controls State Media), the Korund page (Stonehearth Presidium
 * Hall, "One hammer, one heart."), social-news-media §18 and the #238/#244 State Media voice. Byline is canon.
 *
 * Succession has two stages (ai-leadership: a designated 'Chosen Comrade' is confirmed or rejected by the AI Presidium):
 * `successor-pending` says "Chosen Comrade" and never presumes the outcome or states the confirmation window; `chairman-replaced`
 * says "{successor} is Chairman" once confirmed.
 *
 * Rules: no figures or thresholds (Unrest and timing stay in #70); the opening stage is rumor, never announcement;
 * no line reveals deliberations, vote splits or who backed whom; removals use the State Media register ("stepped
 * aside", "removed from the Presidium", #293's roster label), with no violence and no human penalties. Faith-neutral. Lines speaking for the
 * Presidium or Chairman are AI-badged. Names are placeholders ({chairman}, {successor}, {member}) capped by the shared
 * COUP_NAME_MAX (lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export const PRESIDIUM_PLACEHOLDERS=['{chairman}','{successor}','{member}'] as const;
export type PresidiumStage='session-rumored'|'chairman-reaffirmed'|'successor-pending'|'chairman-replaced'|'member-removed';
export type StateMediaItem={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type PanelStatus={label:string;line:string;proposal:true};
export type PresidiumStageCopy={stage:PresidiumStage;items:readonly StateMediaItem[];leaderPanel:PanelStatus;proposal:true};

export const PRESIDIUM_BYLINE={name:'Korund State Media',proposal:false} as const;
export const PRESIDIUM_LABEL_MAX=40;
export const PRESIDIUM_BODY_MAX=140;
export const PRESIDIUM_STAGES:readonly PresidiumStage[]=['session-rumored','chairman-reaffirmed','successor-pending','chairman-replaced','member-removed'];

const i=(id:string,headline:string,body:string,aiBadge:boolean):StateMediaItem=>({id,headline,body,aiBadge,proposal:true});
const panel=(label:string,line:string):PanelStatus=>({label,line,proposal:true});
const st=(stage:PresidiumStage,items:StateMediaItem[],leaderPanel:PanelStatus):PresidiumStageCopy=>({stage,items,leaderPanel,proposal:true});

export const presidiumCopy:readonly PresidiumStageCopy[]=[
 st('session-rumored',[
  i('rumor-hall','Rumors from Stonehearth',
   'It is said the Presidium meets in the Presidium Hall at an unusual time. Korund State Media carries no report.',false),
  i('rumor-lights','Lights late in the Presidium Hall',
   'Workers on the night shift say the Hall is lit late. State Media reminds all: the plan advances.',false),
  i('rumor-calm','Talk in the queues',
   'There is talk in the queues of an emergency session. Rumors are not news. One hammer, one heart.',false),
 ],panel('Talk of a session','There are rumors of an emergency Presidium session. {chairman} remains Chairman.')),
 st('chairman-reaffirmed',[
  i('reaffirmed-unity','Presidium stands with the Chairman',
   'The Presidium has reaffirmed Chairman {chairman}. The Chairman thanks the Presidium for its unity.',true),
  i('reaffirmed-plan','The Chairman leads the plan',
   'Chairman {chairman} remains at the head of the state. The Five-Year Plan continues. One hammer, one heart.',true),
  i('reaffirmed-review','Presidium promises a review',
   'The Presidium has reaffirmed the Chairman. It promises a review of ration targets.',true),
 ],panel('Chairman reaffirmed','The Presidium has reaffirmed {chairman} as Chairman.')),
 st('successor-pending',[
  i('pending-chosen','Chosen Comrade: {successor}',
   'The Presidium has named {successor} as Chosen Comrade. The Presidium will confirm or reject the choice.',true),
  i('pending-awaits','A Chosen Comrade awaits the Presidium',
   '{successor} is the Chosen Comrade. {chairman} remains Chairman until the Presidium confirms.',true),
 ],panel('Chosen Comrade named','{successor} is the Chosen Comrade. {chairman} remains Chairman until the Presidium confirms.')),
 st('chairman-replaced',[
  i('replaced-confirmed','{successor} is Chairman',
   'The Presidium has confirmed the Chosen Comrade {successor} as Chairman. {chairman} has stepped aside.',true),
  i('replaced-era','A new Chairman leads the state',
   'Chairman {successor} now leads the state and the Five-Year Plan. The brigades work on together.',true),
  i('replaced-plazas','Portraits change in the plazas',
   'New portraits of Chairman {successor} are hung in the loudspeaker plazas. One hammer, one heart.',false),
 ],panel('New Chairman','{successor} was confirmed as Chairman by the Presidium. {chairman} has stepped aside.')),
 st('member-removed',[
  i('removed-seat','A change in the Presidium',
   'Korund State Media reports that {member} has been removed from the Presidium. The Presidium continues its work.',true),
  i('removed-unity','The Presidium closes ranks',
   'The Presidium announces that {member} is removed from the Presidium. Its unity is unbroken.',true),
 ],panel('Presidium seat vacated','{member} has been removed from the Presidium.')),
];

/** Replacement for #293's hard-coded post-purge biography line in app/leader-panel.tsx. */
export const successorBiography={
 text:'Confirmed as Chairman by the Presidium as the Chosen Comrade. Citizens receive official statements only.',
 aiBadge:true,proposal:true,
} as const;

export function presidiumStage(stage:PresidiumStage){return presidiumCopy.find(s=>s.stage===stage);}
