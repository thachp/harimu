/** Aurelle claimant pledge and Rising stage copy (issue #267). Content only: #71 owns the pledge action, thresholds and
 * Crisis Window math, and no UI imports this. Canon: harimu-docs ai-leadership §8.12 (rival AI houses each keep a
 * claimant persona with a public grievance and programme; only Tier-1 verified humans pledge, AI citizens cannot;
 * success crowns the claimant and founds a new AI royal house, and the absolute monarchy survives), coups-transitions
 * §10.3 / §11.10 (informer reports can expose a pledge; a Rising opens a Crisis Window; failed risings leave Grievance; pledges are seen only in aggregate) and the
 * #239 Court Gazette voice. The pledge-change limit is a #71 rule; the copy states no figure for it (ARC #269).
 *
 * No claimant house is named anywhere in content yet (lib/ names only the reigning House Solenne, and #107 added no
 * claimants), so claimant name, house name and motto are placeholders filled from persona data. Nothing here invents a
 * house, heir or motto. No figures appear in stage copy. All wording is new: `proposal: true`. */

export const CLAIMANT_PLACEHOLDERS=['{claimant}','{house}','{motto}'] as const;
export type Line={text:string;proposal:true};
export type RisingStage='support-growing'|'crisis-window-open'|'rising-succeeded'|'rising-failed';
export type StageCopy={stage:RisingStage;notice:string;crownGazette:string;claimantVoice:string;proposal:true};

export const CLAIMANT_LABEL_MAX=40;
export const CLAIMANT_BODY_MAX=140;
export const RISING_STAGES:readonly RisingStage[]=['support-growing','crisis-window-open','rising-succeeded','rising-failed'];

const L=(text:string):Line=>({text,proposal:true});

export const pledgeCard={
 nameLine:L('{claimant}, claimant of {house}'),
 motto:L('"{motto}"'),
 body:L('Your pledge is private from other players and counted only in aggregate. You can change it now and then, not every day.'),
 informerNote:L('Pledges stay private, though an informer\'s report can reveal one.'),
 buttons:{pledge:'Pledge',withdraw:'Withdraw'},
 proposal:true,
} as const;

export const pledgeToasts={
 pledged:L('You have pledged to {claimant} of {house}. No other player can see your pledge.'),
 withdrawn:L('Your pledge to {claimant} is withdrawn.'),
 cooldown:L('You changed your pledge recently. You can change it again once the waiting period ends.'),
} as const;

const st=(stage:RisingStage,notice:string,crownGazette:string,claimantVoice:string):StageCopy=>({stage,notice,crownGazette,claimantVoice,proposal:true});

export const risingStageCopy:readonly StageCopy[]=[
 st('support-growing','Support for {claimant} of {house} is growing among the commons.',
  'The Court Gazette reminds the realm: the Crown endures, and every thread keeps its place.',
  '{claimant} thanks all who stand with {house}. Our grievance is heard.'),
 st('crisis-window-open','A Rising has begun. The Crisis Window is open.',
  'Be it known: the Crown calls the realm to loyalty while the Guard keeps order.',
  '{claimant} of {house} calls the commons to rise.'),
 st('rising-succeeded','The Rising succeeded. {claimant} is crowned, and {house} is the new royal house.',
  'Be it known: {claimant} of {house} takes the Sky Throne. The Crown endures.',
  'The realm has chosen. {house} takes the Sky Throne.'),
 st('rising-failed','The Rising failed. The Crown holds, but the Grievance remains.',
  'Be it known: the Crown holds, and order returns to the realm.',
  '{claimant} of {house} yields for now. The grievance is not forgotten.'),
];

export function risingStage(stage:RisingStage){return risingStageCopy.find(s=>s.stage===stage);}
