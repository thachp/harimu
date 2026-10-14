/** Daily worship action copy for the three MVP faiths (issue #260). Content only: the worship button and Devotion math
 * are #67 / #224, and no UI imports this. Canon: harimu-docs religion-faiths §14.1 practice rows (Kinward household
 * hearths with carved name-stones; Fair-Wind vows before voyages and deals, votive ship models and port chapels; Open Hand
 * bread halls and almsgiving) and §14.4 (Devotion rises with worship; rewards are social only and never production or
 * combat). Self-contained: it does not need the #251/#259 additions to lib/faith-copy.ts. It names no Devotion tier
 * and no clergy-office gate (#259 rulings; gating is #261). Korund underground worship is out of scope (#251).
 * All lines are new wording: `proposal: true`. */

export type WorshipFaithId='kinward-rite'|'fair-wind-vow'|'open-hand';
export type WorshipCopy={faithId:WorshipFaithId;label:string;body:readonly string[];completion:string;proposal:true};

export const WORSHIP_LABEL_MAX=40;
export const WORSHIP_LINE_MAX=140;
export const WORSHIP_FAITHS:readonly WorshipFaithId[]=['kinward-rite','fair-wind-vow','open-hand'];

const w=(faithId:WorshipFaithId,label:string,body:string[],completion:string):WorshipCopy=>({faithId,label,body,completion,proposal:true});

export const worshipCopy:Readonly<Record<WorshipFaithId,WorshipCopy>>={
 'kinward-rite':w('kinward-rite','Tend the Hearth',
  ['Stand at the hearth.','Remember those named on its carved name-stones. Keep your oaths and your name.'],
  'The hearth is tended. Your name is kept.'),
 'fair-wind-vow':w('fair-wind-vow','Make Your Vow',
  ['Pause and make a vow before the day\'s travel or trade.','Ask for Honest Measure, Safe Return and Good Fortune.'],
  'Vow made. Trade fairly and travel safe.'),
 'open-hand':w('open-hand','Give at the Bread Hall',
  ['Bring what you can spare to the bread hall.','All are equal before the Giver. What you hold is held in trust for those in need.'],
  'Given with an open hand. The bread hall thanks you.'),
};
