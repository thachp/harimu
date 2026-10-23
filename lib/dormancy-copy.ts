/** Citizen dormancy copy: the Away, Dormant and Archived labels, what each one keeps and pauses, a Welcome back briefing frame for each
 * MVP nation, a job-released line for each, and a Dormant Savings Shield line (issue #608). Content only: the dormancy timer, quorum and
 * turnout exclusion, job release and the savings shield itself are the mechanics' work, and nothing imports this module. Canon: harimu-docs
 * systems/world-clock-pacing §17.4 (Away at 7 real days: off conscription and quotas, job slot held; Dormant at 30 real days: not counted in
 * quorums or turnout, job released, home and items preserved, no upkeep charged, small home-currency savings covered by the Dormant Savings
 * Shield; Archived at 180 real days: the citizen sleeps in their home city and returns instantly on login with a "Welcome back" briefing,
 * never deleted while the account exists) and §17.3 (missing a day costs nothing beyond the missed shift).
 *
 * Voice: each status says what is kept and what pauses, never a penalty, and no line counts days against the player, hurries them or says
 * they were missed. The three Welcome back frames are reports to the citizen, not lines spoken for an AI leader or body, so none carries the
 * AI badge (#381 / ui-ux §23.2): Kindle is a plain civic system voice with no byline, Korund is a State Media briefing and Aurelle a Court
 * Gazette briefing, both with the canon bylines. The Aurelle job line follows the nation sheet: guild charters grant trade rights and
 * commoners trade in chartered markets, so it points to a guild or the chartered markets and does not call a charter a job. No frame opens "Be it known" or "By royal decree", and the Crown, the Chairman and the
 * Presidium never speak.
 *
 * Rules: the only figures are the docs' own 7, 30 and 180 real days, once each, in the status "when" lines. Everything else arrives through
 * two pre-formatted placeholders: {daysAway}, a duration that already carries its unit (capped at a local 24 characters), and
 * {headlineCount}, a number (capped at six characters). The Dormant Savings Shield line names no amount, rate or cap: the docs mark those as
 * assumptions and they belong to the economy work. Nothing here promises anything the docs do not: home and items are kept from Dormant on,
 * and the citizen is never deleted while the account exists. Limits: labels 40, lines 100, tested with every placeholder filled to its cap.
 * All wording is new: `proposal: true`. */

export const DORMANCY_NAME_MAX=24;
export const DORMANCY_NUMBER_MAX=6;
export const DORMANCY_LABEL_MAX=40;
export const DORMANCY_LINE_MAX=100;
export const DORMANCY_PLACEHOLDERS=['{daysAway}','{headlineCount}'] as const;

export type Line={text:string;proposal:true};
export type DormancyStatusKey='away'|'dormant'|'archived';
export type DormancyNation='kindle'|'korund'|'aurelle';
export type Byline={name:string;proposal:boolean};
export type DormancyStatus={key:DormancyStatusKey;label:string;when:Line;kept:readonly Line[];paused:readonly Line[];proposal:true};
export type WelcomeBack={nationId:DormancyNation;byline:Byline|null;greeting:Line;news:Line;aiBadge:false;proposal:true};
export type JobReleased={nationId:DormancyNation;line:Line;proposal:true};

export const DORMANCY_STATUS_KEYS:readonly DormancyStatusKey[]=['away','dormant','archived'];
export const DORMANCY_NATIONS:readonly DormancyNation[]=['kindle','korund','aurelle'];

const L=(text:string):Line=>({text,proposal:true});

/** The three statuses, in docs order. "when" carries the docs' real-day figure; kept and paused say what stays and what stands still. */
export const dormancyStatuses:readonly DormancyStatus[]=[
 {key:'away',label:'Away',when:L('Away begins after 7 real days offline.'),
  kept:[L('Your job slot is held for you.')],
  paused:[L('You are off conscription and quotas while you are away.')],proposal:true},
 {key:'dormant',label:'Dormant',when:L('Dormant begins after 30 real days offline.'),
  kept:[L('Your home and items are kept, and no upkeep is charged.')],
  paused:[L('You are not counted in quorums or turnout.'),L('Your job slot is released.')],proposal:true},
 {key:'archived',label:'Archived',when:L('Archived begins after 180 real days offline.'),
  kept:[L('Your citizen sleeps in their home city and is never deleted while your account exists.')],
  paused:[L('You return instantly when you sign in, with a Welcome back briefing.')],proposal:true},
];

/** Welcome back title, shared by every nation. */
export const WELCOME_BACK_TITLE='Welcome back';

/** The Welcome back briefing frame for each MVP nation. Reports to the citizen, so none is badged. */
export const welcomeBack:readonly WelcomeBack[]=[
 {nationId:'kindle',byline:null,
  greeting:L('You were away for {daysAway}. Here is what happened while you were gone.'),
  news:L('There are {headlineCount} reports to catch up on.'),aiBadge:false,proposal:true},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},
  greeting:L('Korund State Media: Welcome back, citizen. You were away for {daysAway}.'),
  news:L('Korund State Media: {headlineCount} reports were issued during your absence.'),aiBadge:false,proposal:true},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},
  greeting:L('The court welcomes you back. You were away for {daysAway}.'),
  news:L('Court Gazette: {headlineCount} reports were printed while you were away.'),aiBadge:false,proposal:true},
];

/** A neutral frame for a nation without its own (no byline, no nation voice, not badged): a plain report, used until that nation's frame is written. */
export const welcomeBackGeneric={byline:null,greeting:L('Welcome back. You were away for {daysAway}.'),news:L('There are {headlineCount} reports to catch up on.'),aiBadge:false,proposal:true} as const;

/** When a citizen returns from Dormant or Archived their job slot has been released: one line each on how to find work again. */
export const jobReleased:readonly JobReleased[]=[
 {nationId:'kindle',line:L('Your job slot was released. Open the job board to find work.'),proposal:true},
 {nationId:'korund',line:L('Your job slot was released. Report to the Labor Bureau for a new assignment.'),proposal:true},
 {nationId:'aurelle',line:L('Your job slot was released. Look for work with a guild or in the chartered markets.'),proposal:true},
];

/** The Dormant Savings Shield, in one line, with no amount, rate or cap. */
export const savingsShield=L('The Dormant Savings Shield helps protect small home-currency savings while you are away.');

export const dormancyStatusFor=(key:DormancyStatusKey)=>dormancyStatuses.find(s=>s.key===key);
export const welcomeBackFor=(nationId:DormancyNation)=>welcomeBack.find(w=>w.nationId===nationId);
export const jobReleasedFor=(nationId:DormancyNation)=>jobReleased.find(j=>j.nationId===nationId);

export const dormancyCopy={statuses:dormancyStatuses,title:WELCOME_BACK_TITLE,welcomeBack,welcomeBackGeneric,jobReleased,savingsShield,proposal:true} as const;

/** Follow-up to #773: Welcome back frames for the seven nations beyond the MVP three, for SDE4 to wire (nothing reads these yet; the panel
 * uses welcomeBackGeneric for them today). Same shape, placeholders, limits and rules as the frames above: reports to the citizen, never badged,
 * no leader or body speaks. Bylines follow the culture bible "News voice" entries (harimu-docs world/culture-bible): canon names have
 * proposal false (The Canopy); working names are proposal true. Free-press nations (Hoarvale, Fulmara) carry no byline, like Kindle, and put
 * the nation's voice in the wording: Hoarvale's hearth ethos ("Keep the hearth, share the warmth"), Fulmara's ownership-on-the-masthead press.
 * Varkand names no Alert Level (it changes); Ilmar names no Stillday. All wording is new: `proposal: true`. */
export type DormancyOtherNation='confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export type WelcomeBackOther=Omit<WelcomeBack,'nationId'>&{nationId:DormancyOtherNation};
export const DORMANCY_OTHER_NATIONS:readonly DormancyOtherNation[]=['confluence','meridian','ilmar','hoarvale','varkand','veldwood','fulmara'];
export const welcomeBackOtherNations:readonly WelcomeBackOther[]=[
 {nationId:'confluence',byline:{name:'The Current Daily',proposal:true},
  greeting:L('The Current Daily: Welcome back. You were away for {daysAway}.'),
  news:L('The Current Daily: {headlineCount} reports were published while you were away.'),aiBadge:false,proposal:true},
 {nationId:'meridian',byline:{name:'Steamgate Measure',proposal:true},
  greeting:L('Steamgate Measure: Welcome back, citizen. You were away for {daysAway}.'),
  news:L('Steamgate Measure: {headlineCount} approved reports were issued during your absence.'),aiBadge:false,proposal:true},
 {nationId:'ilmar',byline:{name:'The Clear Record',proposal:true},
  greeting:L('The Clear Record: Welcome back. You were away for {daysAway}.'),
  news:L('The Clear Record: {headlineCount} reports were recorded while you were away.'),aiBadge:false,proposal:true},
 {nationId:'hoarvale',byline:null,
  greeting:L('Welcome back. You were away for {daysAway}. The kettle is on.'),
  news:L('There are {headlineCount} reports waiting for you by the hearth.'),aiBadge:false,proposal:true},
 {nationId:'varkand',byline:{name:'Watchfast Signal',proposal:true},
  greeting:L('Watchfast Signal: Welcome back, citizen. You were away for {daysAway}.'),
  news:L('Watchfast Signal: {headlineCount} bulletins were issued while you were away.'),aiBadge:false,proposal:true},
 {nationId:'veldwood',byline:{name:'The Canopy',proposal:false},
  greeting:L('The Canopy: Welcome back to the grove. You were away for {daysAway}.'),
  news:L('The Canopy: {headlineCount} reports were aired while you were away.'),aiBadge:false,proposal:true},
 {nationId:'fulmara',byline:null,
  greeting:L('Welcome back. You were away for {daysAway}. Here is what moved while you were gone.'),
  news:L('There are {headlineCount} reports to catch up on, each with its owner on the masthead.'),aiBadge:false,proposal:true},
];
export const welcomeBackOtherFor=(nationId:DormancyOtherNation)=>welcomeBackOtherNations.find(w=>w.nationId===nationId);
