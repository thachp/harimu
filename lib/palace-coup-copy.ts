/** Aurelle AI palace-coup Court Gazette and leader-panel copy (issue #284, companion to SDE #281). Content only: #281
 * owns the plot object, Power Weight, Crisis Window and outcome math, and no UI imports this. Canon: harimu-docs
 * coups-transitions §10.2 (AI elites plot in secret; a Crisis Window opens publicly in Aurelle; success installs the
 * plot's AI ruler, failure triggers AI purges) and §10.4, ai-leadership §8.12 (new AI royal house; the absolute monarchy
 * survives), nation page §7.5 (Sky Throne, Highspire, great lords, titles revoked by decree), MVP scope §27 (royal
 * gazette; palace coup), and the #239 Court Gazette voice. Byline is canon: "Court Gazette".
 *
 * Rules: no figures or thresholds (the Power Weight threshold stays in #281), no rewards language, no human penalties
 * (out of scope), and no plotter is named before the window opens: the rumour stage names no lord or house. Runtime
 * names are placeholders: {leader} = reigning AI Monarch, {newLeader} = the plot's AI ruler, {house} = the new house.
 * Gazette items that speak for the Crown are AI-badged (`aiBadge: true`): the Crown is an AI persona. All wording is
 * new: `proposal: true`. */

export const COUP_PLACEHOLDERS=['{leader}','{newLeader}','{house}'] as const;
export type CoupStage='plot-rumours'|'crisis-window-open'|'coup-succeeded'|'coup-failed';
export type GazetteItem={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type LeaderPanelStatus={label:string;line:string;proposal:true};
export type CoupStageCopy={stage:CoupStage;gazette:readonly GazetteItem[];leaderPanel:LeaderPanelStatus;proposal:true};

export const COUP_GAZETTE_BYLINE={name:'Court Gazette',proposal:false} as const;
/** Worst-case length of any runtime name filled into a placeholder (ARC #288). #281 enforces this cap on leader and house names. */
export const COUP_NAME_MAX=24;
export const COUP_LABEL_MAX=40;
export const COUP_BODY_MAX=140;
export const COUP_STAGES:readonly CoupStage[]=['plot-rumours','crisis-window-open','coup-succeeded','coup-failed'];

const g=(id:string,headline:string,body:string,aiBadge:boolean):GazetteItem=>({id,headline,body,aiBadge,proposal:true});
const panel=(label:string,line:string):LeaderPanelStatus=>({label,line,proposal:true});
const st=(stage:CoupStage,gazette:GazetteItem[],leaderPanel:LeaderPanelStatus):CoupStageCopy=>({stage,gazette,leaderPanel,proposal:true});

export const palaceCoupCopy:readonly CoupStageCopy[]=[
 st('plot-rumours',[
  g('rumour-whispers','Whispers in the halls of Highspire',
   'The Court Gazette hears talk of discontent among the great lords. The Gazette names nobody, and counsels the realm to keep its place.',false),
  g('rumour-crown-calm','The Crown hears idle talk',
   'Be it known: {leader} hears the murmurs of the court and is not moved. Every thread keeps its place.',true),
  g('rumour-banquets','Empty seats at the high table',
   'Some great lords keep away from court of late. The Gazette reports the talk and draws no conclusion.',false),
 ],panel('Court unsettled','Rumors of discontent among the great lords. {leader} still holds the Sky Throne.')),
 st('crisis-window-open',[
  g('window-proclaimed','A palace coup is declared',
   'Great lords have moved against the Crown. The Crisis Window is open, and the Guard decides the Sky Throne.',false),
  g('window-crown-holds','The Crown calls for loyalty',
   'Be it known: {leader} calls the realm to loyalty. The Crown is not yet yielded, and order shall be kept.',true),
  g('window-highspire','Highspire waits on the Guard',
   'The Crisis Window is open. The court holds its breath while the Guard and the great lords choose.',false),
 ],panel('Palace coup under way','A palace coup is under way. The Crisis Window is open.')),
 st('coup-succeeded',[
  g('success-proclaimed','A new house takes the Sky Throne',
   'Be it known: {newLeader} of {house} takes the Sky Throne. The Crown endures.',true),
  g('success-realm','Court bows to {house}',
   'The palace coup succeeded. {house} is the new royal house, and the monarchy stands as before.',false),
  g('success-decree','First decree of {newLeader}',
   'Be it known: {newLeader} of {house} now rules by royal decree. Every thread keeps its place.',true),
 ],panel('New royal house','{newLeader} of {house} now holds the Sky Throne.')),
 st('coup-failed',[
  g('failed-crown-holds','The Crown holds',
   'Be it known: the plot against {leader} has failed. The plotters are purged, and order returns to the realm.',true),
  g('failed-titles','Plotting lords lose their titles',
   'By royal decree, the great lords who plotted against the Crown are stripped of title and fief.',true),
  g('failed-court','Highspire returns to order',
   'The palace coup failed. The plotters are purged from court, and {leader} keeps the Sky Throne.',false),
 ],panel('Coup failed','The palace coup failed. {leader} keeps the Sky Throne.')),
];

export function coupStage(stage:CoupStage){return palaceCoupCopy.find(s=>s.stage===stage);}
