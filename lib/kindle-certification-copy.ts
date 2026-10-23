/** Kindle count, certification and transition-week copy: the results-hidden line while voting is open, the count and certification states, a
 * results caption, the transition-week banner and two press headline frames (issue #609). Content only: the count, certification, fraud flags
 * and challenges belong to the elections work, and nothing imports this module. Canon: harimu-docs elections §9.1 (Voting: ballots secret,
 * results hidden until close; Certification: automatic count, the AI High Court certifies within 24 hours, challenges only for detected fraud
 * flags; Transition: the outgoing AI President cannot spend treasury or declare war), §9.5 (fraud flags quarantine suspicious ballots for
 * review; results, verified-human turnout and per-district counts are published) and Decision 65 (NPCs cast no election ballots).
 *
 * Voice: Kindle is plain and civic. The byline is not defined here: it is the Kindle pack's Kindle Press byline in the separate press
 * templates module, the one canonical form, and the press bodies open with that name. Every state line and caption is a system notice about the count, and the two press frames are bylined
 * Kindle Press reports about the court's work, not lines spoken for an AI leader or body, so nothing here carries the AI badge
 * (#381 / ui-ux §23.2). The review line is neutral: it accuses nobody, names no candidate and gives no count of flagged ballots.
 *
 * Rules: the only written figure is the docs' 24 hours, once. Everything else arrives through pre-formatted placeholders: {closesAt},
 * {inaugurationAt}, {winner} and {district}, capped at a local 24 characters; {turnout} (a share already carrying its unit) and {count} (a
 * number), capped at six characters. Limits: labels 40, lines 100, headlines 70, press bodies 140, tested with every placeholder filled to its
 * cap. All wording is new: `proposal: true`. */

export const CERT_NAME_MAX=24;
export const CERT_NUMBER_MAX=6;
export const CERT_LABEL_MAX=40;
export const CERT_LINE_MAX=100;
export const CERT_HEADLINE_MAX=70;
export const CERT_BODY_MAX=140;
export const CERT_NAME_PLACEHOLDERS=['{closesAt}','{inaugurationAt}','{winner}','{district}'] as const;
export const CERT_NUMBER_PLACEHOLDERS=['{turnout}','{count}'] as const;

export type Line={text:string;proposal:true};
export type CertStateKey='counting'|'awaiting'|'certified'|'under-review';
export type CertState={key:CertStateKey;label:string;line:Line;proposal:true};
export type PressFrameKey='certified'|'under-review';
export type PressFrame={key:PressFrameKey;headline:string;body:string;aiBadge:false;proposal:true};

const L=(text:string):Line=>({text,proposal:true});

export const CERT_STATE_KEYS:readonly CertStateKey[]=['counting','awaiting','certified','under-review'];
export const CERT_PRESS_KEYS:readonly PressFrameKey[]=['certified','under-review'];

/** While voting is open. */
export const votingOpen={
 hidden:L('Results stay hidden until the polls close.'),
 closesAt:'Polls close {closesAt}',
 proposal:true,
} as const;

/** Count and certification states, in order. */
export const certStates:readonly CertState[]=[
 {key:'counting',label:'Counting',line:L('The polls are closed. The count runs automatically.'),proposal:true},
 {key:'awaiting',label:'Awaiting certification',line:L('The count is done. The AI High Court certifies the result within 24 hours.'),proposal:true},
 {key:'certified',label:'Certified',line:L('The AI High Court has certified the result. {winner} is President-elect.'),proposal:true},
 {key:'under-review',label:'Under review',line:L('Certification waits while flagged ballots are reviewed. Nobody is accused.'),proposal:true},
];

/** Results caption: published turnout and per-district counts. Residents are not part of the count. */
export const resultsCaption={
 turnout:'Verified-human turnout: {turnout}',
 district:'{district}: {count} ballots',
 npcNote:L('Residents do not vote. Resident mood is not part of the count.'),
 proposal:true,
} as const;

/** Transition week, until inauguration. */
export const transitionBanner={
 label:'Transition period',
 inauguration:'Inauguration {inaugurationAt}',
 line:L('Until inauguration, the outgoing AI President cannot spend the treasury or declare war.'),
 proposal:true,
} as const;

/** Press frames: reports about the court's work, unbadged. */
export const certPress:readonly PressFrame[]=[
 {key:'certified',headline:'High Court certifies the election',body:'Kindle Press: the AI High Court has certified the result. {winner} takes office at inauguration.',aiBadge:false,proposal:true},
 {key:'under-review',headline:'Certification waits on a ballot review',body:'Kindle Press: certification is on hold while flagged ballots are reviewed. The court has named nobody.',aiBadge:false,proposal:true},
];

export const certStateFor=(key:CertStateKey)=>certStates.find(s=>s.key===key);
export const certPressFor=(key:PressFrameKey)=>certPress.find(f=>f.key===key);

export const kindleCertificationCopy={votingOpen,states:certStates,results:resultsCaption,transition:transitionBanner,press:certPress,proposal:true} as const;
