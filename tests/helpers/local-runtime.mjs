/** In-process fixtures only. No HTTP listener, Clerk session, credential or live D1 access. */
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  execute() {
    // As D1's batch does, a SELECT in a batch returns its rows (#679 slice 3: the world clock insert and reads share one batch).
    if (/^\s*SELECT\b/i.test(this.sql)) return { success: true, results: this.db.sqlite.prepare(this.sql).all(...this.params), meta: { changes: 0 } };
    const result = this.db.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
  }
  async run() { return this.execute(); }
  async first() { return this.db.sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { success: true, results: this.db.sqlite.prepare(this.sql).all(...this.params) }; }
}
class LocalD1 {
  constructor(path) { this.sqlite = new DatabaseSync(path); this.sqlite.exec('PRAGMA foreign_keys=ON'); }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try { const results = statements.map(statement => statement.execute()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}

export async function localRuntime({accountElection=false,accountElectionBindings,ballotPrivacyReady=false,presidentialCalendar=false,backend=process.env.HARIMU_TEST_STORAGE??'sqlite'}={}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'harimu-two-account-'));
  const path = join(directory, 'fixture.sqlite');
  const modules = [
    'lib/storage-selection.ts','lib/leader-personas.ts','lib/weekly-addresses.ts','app/api/addresses/route.ts',
    'lib/square-chat-validation.ts', 'lib/cities.ts', 'lib/spa-recovery.ts', 'lib/city-location.ts', 'lib/map-zones.ts', 'lib/globe-mapping.ts', 'lib/map-zone-labels.ts', 'lib/city-founding.ts', 'lib/city-tier.ts', 'app/api/world/found-city/route.ts', 'lib/map-ownership.ts', 'app/api/world/ownership/route.ts', 'lib/map-unrest.ts', 'app/api/world/unrest/route.ts', 'lib/civic-rank-rules.ts', 'lib/civic-rank.ts', 'app/api/citizen/civic-rank/route.ts', 'lib/kindle-budget.ts', 'app/api/kindle/budget/route.ts', 'lib/map-resources.ts', 'app/api/world/resources/route.ts', 'lib/city-capture-history.ts', 'app/api/city/route.ts', 'lib/home-move.ts', 'app/api/city/home/route.ts',
    'lib/preview-election.ts','lib/ballot-privacy.ts','lib/instant-runoff.ts','lib/elections.ts','lib/election-calendars.ts','lib/kindle-certification-copy.ts','lib/kindle-certification-rules.ts','app/api/election/route.ts',
    'lib/collective-petitions.ts','lib/cabinet-response-ai.ts','lib/cabinet-cron.ts','app/api/petitions/route.ts',
    'lib/mvp-job-types.ts', 'lib/game-season.ts', 'lib/season-yield.ts', 'app/api/jobs/types/route.ts', 'lib/postgres/readiness.ts', 'lib/db.ts', 'lib/economy.ts', 'lib/income-tax.ts', 'lib/economy-rules.ts', 'lib/market.ts', 'lib/market-orders.ts', 'lib/wallet.ts',
    'lib/player-market.ts', 'lib/work-shifts.ts', 'lib/shift-soft-cap.ts', 'lib/shift-quality.ts', 'lib/shift-quality-key.ts', 'lib/government.ts',
    'lib/korund-plan-stats.ts', 'lib/national-news.ts', 'app/api/news/route.ts', 'lib/government-state.ts', 'lib/policy-ledger.ts', 'lib/government-disclosure.ts', 'lib/square-chat.ts','lib/chat-shadow-mute.ts', 'lib/diplomatic-hall.ts', 'lib/founding-period.ts', 'lib/founding-period-copy.ts', 'lib/aurelle-succession.ts', 'lib/aurelle-succession-rules.ts', 'app/api/aurelle-succession/route.ts', 'lib/diplomatic-hall-copy.ts', 'app/api/diplomatic-hall/route.ts', 'lib/command-request.ts',
    'lib/verification.ts',
    'lib/religious-harmony.ts','lib/holy-sites.ts','app/api/faith/holy-sites/route.ts','lib/world-simulation.ts','lib/stability.ts','lib/population-bands.ts','lib/nation-discovery.ts',
    'lib/qa-tools.ts','lib/nation-openings.ts','lib/onboarding-preferences.ts','lib/first-week.ts','lib/first-week-server.ts','lib/notable-profiles.ts','lib/notable-roster.ts','lib/notable-choice.ts','lib/notables.ts','app/api/notables/route.ts','lib/korund-posts.ts','lib/korund.ts','lib/korund-queue.ts','lib/korund-coupons.ts','lib/ai-news.ts','lib/ai-budget.ts','lib/ai-failover.ts',
    'lib/aurelle.ts',
    'lib/war.ts','lib/war-rules.ts','lib/war-copy.ts','lib/war-authority.ts','lib/war-actions.ts','lib/war-assembly.ts','lib/war-endings.ts','lib/war-ending-copy.ts','lib/war-loss-cap.ts','lib/war-weariness.ts','lib/war-weariness-copy.ts','lib/siege.ts','lib/siege-actions.ts','lib/siege-copy.ts', // #309, #350, #423, #419, #1026
    'lib/labor-bureau-rules.ts','lib/labor-bureau-text.ts','lib/labor-bureau-copy.ts','lib/labor-bureau.ts','lib/korund-wallet.ts','lib/gray-market.ts','lib/gray-seizure.ts','lib/gray-market-rules.ts','lib/korund-medals-rules.ts','lib/korund-standing-rules.ts','lib/market-fee.ts','lib/wallet-street-rate.ts','lib/gray-market-text.ts','lib/gray-market-copy.ts','lib/nation-work.ts','lib/confluence-price-band.ts','lib/diplomacy.ts','lib/diplomacy-rules.ts','lib/diplomacy-copy.ts','lib/game-time.ts', // #308
    'lib/embargo.ts','lib/embargo-rules.ts','lib/embargo-copy.ts','lib/goods-sanction-rules.ts','lib/goods-sanctions.ts', // #363, #601
    'lib/crown-debasement.ts','lib/crown-debasement-rules.ts','lib/press-templates.ts', // #362
    'lib/canvassing.ts','lib/canvassing-rules.ts','app/api/canvassing/route.ts', // #442
    'lib/town-hall.ts','lib/town-hall-rules.ts','lib/town-hall-ai.ts','lib/campaign-copy.ts','app/api/town-hall/route.ts', // #441
    'lib/kindle-eligibility.ts', // #520
    'lib/nation-opening-guard.ts', // #486
    'lib/debate.ts','lib/debate-rules.ts','lib/debate-ai.ts','lib/debate-copy.ts','lib/palace-coup-copy.ts','app/api/debate/route.ts', // #282
    'lib/emission-caps-rules.ts', // #885
    'lib/spark-supply.ts','lib/spark-supply-rules.ts','lib/reserve-board-copy.ts','lib/reserve-board-view.ts', // #431
    'lib/ledger-reconciliation.ts','lib/ledger-reconciliation-rules.ts','app/api/admin/ledger-reconciliation/route.ts', // #432
    'lib/ai-costs.ts','lib/ai-denylist.ts','lib/ai-kill-switch.ts','lib/kill-switch-copy.ts','app/api/admin/ai-costs/route.ts', // #614
    'lib/ai-review-queue.ts','app/api/admin/ai-review-queue/route.ts','app/api/admin/ai-decisions/route.ts','app/api/admin/reports/route.ts', // #753 + #959
    'lib/vote-buying-watch.ts','app/api/admin/vote-buying/route.ts', // #825
    'lib/risk-scoring.ts','app/api/admin/risk-scores/route.ts','lib/clerk-risk-signals.ts','lib/kill-switch-events.ts','app/api/admin/kill-switch-events/route.ts', // #879 + #943 + #764
    'lib/polling-rules.ts','lib/polling.ts','app/api/polling/route.ts', // #740
    'lib/plank-votes-rules.ts','lib/plank-votes.ts','app/api/planks/route.ts', // #831
    'lib/party-donations-rules.ts','lib/party-donations.ts','app/api/party-donations/route.ts', // #863
    'lib/rallies-rules.ts','lib/rallies.ts','lib/rally-speech-ai.ts','app/api/rallies/route.ts', // #867, #876
    'lib/city-chat.ts','app/api/city-chat/route.ts','lib/global-chat.ts','app/api/global-chat/route.ts','lib/dm-chat.ts','app/api/dm-chat/route.ts','lib/embassy-chat.ts','app/api/embassy-chat/route.ts', // #881 + #882
    'lib/reports.ts','lib/report-copy.ts','app/api/reports/route.ts', // #743
    'lib/dormancy-rules.ts','lib/dormant-job.ts','lib/dormancy-copy.ts','lib/savings-shield.ts','lib/kindle-sales-tax.ts', 'app/api/citizen/heartbeat/route.ts', // #739 #1066
    'lib/game-season.ts','lib/winter-march.ts','lib/army-copy.ts','lib/army-rules.ts','lib/army-conscription.ts','lib/army.ts','lib/army-wounds.ts','app/api/army/route.ts','app/api/army/drill/route.ts','app/api/army/draft/route.ts','lib/army-map.ts','lib/army-supply.ts','lib/army-battle.ts','app/api/army/battles/route.ts','app/api/army/positions/route.ts', // #738 #1038
    'lib/i-voted.ts','app/api/citizen/i-voted/route.ts', // #782
    'lib/world-registry.ts','lib/async-limits.ts','lib/market-visibility.ts','lib/tessera-exchange.ts','lib/test-faucet.ts','app/api/test-faucet/route.ts','lib/aurelle-charter-rules.ts','lib/aurelle-charters.ts','app/api/aurelle/charters/route.ts','lib/tessera-rewards-rules.ts','lib/tessera-rewards.ts','lib/tessera-not-earned.ts','app/api/tessera/rewards/route.ts','lib/relocation-support-rules.ts','lib/relocation-support.ts','app/api/relocation/claim/route.ts','lib/clearing-house-copy.ts','lib/kiosk-text.ts','app/api/world/registry/route.ts','lib/order-book-rules.ts','lib/order-book.ts','lib/npc-supply-rules.ts','lib/npc-supply.ts','lib/spoilage-rules.ts','lib/spoilage.ts','lib/db-errors.ts','app/api/market/orders/route.ts','lib/travel.ts','app/api/travel/route.ts','lib/worship-copy.ts','lib/faith-copy.ts','lib/mvp-festival-copy.ts','lib/festival-stance.ts','lib/festivals.ts','lib/faith.ts','app/api/faith/route.ts','lib/congregations.ts','app/api/congregations/route.ts','lib/claimant-copy.ts','lib/aurelle-rising-rules.ts','lib/aurelle-rising.ts','app/api/aurelle/rising/route.ts','lib/korund-presidium-rules.ts','lib/korund-presidium.ts','lib/aurelle-coup-rules.ts','lib/aurelle-coup.ts','lib/palace-coup-copy.ts','lib/assembly-copy.ts','lib/kindle-parties.ts','lib/assembly-rules.ts','lib/assembly.ts','app/api/assembly/route.ts','lib/campaign-copy.ts','lib/primaries-rules.ts','lib/primaries.ts','app/api/primaries/route.ts',
    'lib/korund-underground.ts','lib/underground-rules.ts','lib/korund-suspicion-copy.ts', // #295, #382
    'lib/missionary-rules.ts','lib/missionaries.ts','lib/missionary-actions.ts','lib/missionary-copy.ts','lib/missionary-notice-copy.ts', // #225
    'lib/citizenship.ts',
    'app/api/citizen/route.ts', 'app/api/square/route.ts', 'app/api/world/route.ts',
  ];
  const epoch = Date.UTC(2026, 0, 15, 12); // Fixed UTC day prevents midnight flakiness.
  const clockPath = join(directory, 'fixture-clock.mjs');
  await writeFile(clockPath, `let now = ${epoch};
  export function setNow(value) { now = value; }
  export class Date extends globalThis.Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }`);
  const envPath = join(directory, 'fixture-env.mjs');
  const authPath = join(directory, 'lib/auth.mjs');
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(envPath, `export const env = ${JSON.stringify({...(presidentialCalendar?{HARIMU_KINDLE_CYCLE_START_AT:String(Math.floor(epoch/1000)-30*86400)}:{}) /* #918: the presidential window opens at the fixture clock */,...(accountElectionBindings??(accountElection?{NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW:'true',HARIMU_ACCOUNT_ELECTION_POC_ENABLED:'true'}:{}))})};\nexport function waitUntil(promise){(globalThis.__harimuBackground??=[]).push(Promise.resolve(promise));}\n`);
  // Each fixture identity belongs to one Request. This substitution exists only
  // in temporary compiled test copies; production authentication is untouched.
  await writeFile(authPath, `const identities = new WeakMap();
export function identify(request, identity) { identities.set(request, identity); }
export async function authenticatedUserId(request) { return identities.get(request) ?? null; }
`);
  const privacyPath=join(directory,'lib/fixture-ballot-privacy.mjs');
  await writeFile(privacyPath,`export function trustedBallotPrivacyReady(){return ${ballotPrivacyReady===true};} export const ballotPrivacyReason='Fixture privacy review is not available.';`);
  const verificationPath = join(directory, 'lib/fixture-verification.mjs');
  await writeFile(verificationPath, `import { readVerification as validate } from './verification.mjs';
import { Date } from '../fixture-clock.mjs';
const evidence = new Map();
let enabled = false;
export function setVerification(userId, value) { enabled = true; evidence.set(userId, value); }
export async function readVerification(userId) {
  return validate(userId, enabled ? { async read(id) { const value = evidence.get(id); if (value instanceof Error) throw value; return value ?? null; } } : undefined, Date.now());
}
`);
  for (const sourcePath of modules) {
    let source = await readFile(join(root, sourcePath), 'utf8');
    source = source.replace(/from (['"])([^'"]+)\1/g, (match, quote, specifier) => {
      let target;
      const bare = specifier.replace(/\.tsx?$/, '');
      if (specifier === 'cloudflare:workers') target = envPath;
      else if (specifier.endsWith('.mjs')) target = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(root, dirname(sourcePath), specifier);
      else if (specifier === '@/lib/ballot-privacy'||specifier === './ballot-privacy') target=privacyPath;
      else if (specifier === '@/lib/verification') target = verificationPath;
      else if (specifier.startsWith('@/')) target = join(directory, `${bare.slice(2)}.mjs`);
      else if (specifier.startsWith('.')) target = resolve(directory, dirname(sourcePath), `${bare}.mjs`);
      else throw new Error(`Unexpected external runtime dependency: ${specifier}`);
      return `from ${JSON.stringify(pathToFileURL(target).href)}`;
    });
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const destination = join(directory, sourcePath.replace(/\.ts$/, '.mjs'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, `import { Date } from ${JSON.stringify(pathToFileURL(clockPath).href)};\n${output}`);
  }
  const cabinetAi=await import(pathToFileURL(join(directory,'lib/cabinet-response-ai.mjs')).href);
  const notableService=await import(pathToFileURL(join(directory,'lib/notables.mjs')).href);
  const notables=await import(pathToFileURL(join(directory,'app/api/notables/route.mjs')).href);
  const { env } = await import(pathToFileURL(envPath).href);
  env.DB = new LocalD1(path);
  env.HARIMU_SHIFT_QUALITY_SECRET = 'fixture-shift-quality-secret-252'; // #252: server-only seed for per-shift option order
  // Apply the real additive world migration before the production bootstrap,
  // just as deployed D1 does; this is an isolated consumer-local database.
  env.DB.sqlite.exec(await readFile(join(root, 'drizzle/0004_boring_exiles.sql'), 'utf8'));
  env.DB.sqlite.exec(await readFile(join(root, 'drizzle/0005_gray_brood.sql'), 'utf8'));
  env.DB.sqlite.exec(await readFile(join(root, 'drizzle/0006_aurelle_charter.sql'), 'utf8'));
  const { identify } = await import(pathToFileURL(authPath).href);
  const { setVerification } = await import(pathToFileURL(verificationPath).href);
  const clock = await import(pathToFileURL(clockPath).href);
  const { getDatabase } = await import(pathToFileURL(join(directory, 'lib/db.mjs')).href);
  const citizen = await import(pathToFileURL(join(directory, 'app/api/citizen/route.mjs')).href);
  const square = await import(pathToFileURL(join(directory, 'app/api/square/route.mjs')).href);
  const city = await import(pathToFileURL(join(directory, 'app/api/city/route.mjs')).href);
  const cityHome = await import(pathToFileURL(join(directory, 'app/api/city/home/route.mjs')).href); // #781
  const election = await import(pathToFileURL(join(directory, 'app/api/election/route.mjs')).href);
  const petitions = await import(pathToFileURL(join(directory, 'app/api/petitions/route.mjs')).href);
  const news = await import(pathToFileURL(join(directory, 'app/api/news/route.mjs')).href);
  const addresses = await import(pathToFileURL(join(directory,'app/api/addresses/route.mjs')).href);
  const world = await import(pathToFileURL(join(directory, 'app/api/world/route.mjs')).href);
  const foundCityRoute = await import(pathToFileURL(join(directory, 'app/api/world/found-city/route.mjs')).href);
  const ownershipRoute = await import(pathToFileURL(join(directory, 'app/api/world/ownership/route.mjs')).href); // #82
  const jobTypesRoute = await import(pathToFileURL(join(directory, 'app/api/jobs/types/route.mjs')).href); // #886
  const kindleBudgetRoute = await import(pathToFileURL(join(directory, 'app/api/kindle/budget/route.mjs')).href); // #789
  const civicRankRoute = await import(pathToFileURL(join(directory, 'app/api/citizen/civic-rank/route.mjs')).href); // #741
  const pollingRoute = await import(pathToFileURL(join(directory, 'app/api/polling/route.mjs')).href); // #740
  const planksRoute = await import(pathToFileURL(join(directory, 'app/api/planks/route.mjs')).href); // #831
  const donationsRoute = await import(pathToFileURL(join(directory, 'app/api/party-donations/route.mjs')).href); // #863
  const ralliesRoute = await import(pathToFileURL(join(directory, 'app/api/rallies/route.mjs')).href); // #867
  const cityChatRoute = await import(pathToFileURL(join(directory, 'app/api/city-chat/route.mjs')).href); // #881
  const dmChatRoute = await import(pathToFileURL(join(directory, 'app/api/dm-chat/route.mjs')).href); // #881 part 3
  const embassyChatRoute = await import(pathToFileURL(join(directory, 'app/api/embassy-chat/route.mjs')).href); // #882
  const globalChatRoute = await import(pathToFileURL(join(directory, 'app/api/global-chat/route.mjs')).href); // #881 part 2
  const armyRoute = await import(pathToFileURL(join(directory, 'app/api/army/route.mjs')).href); // #738
  const holySitesRoute = await import(pathToFileURL(join(directory, 'app/api/faith/holy-sites/route.mjs')).href); // #855
  const armyPositionsRoute = await import(pathToFileURL(join(directory, 'app/api/army/positions/route.mjs')).href); // #738 slice 4
  const armyBattlesRoute = await import(pathToFileURL(join(directory, 'app/api/army/battles/route.mjs')).href); // #738 battles
  const armyDraftRoute = await import(pathToFileURL(join(directory, 'app/api/army/draft/route.mjs')).href); // #738 slice 3 follow-up
  const armyDrillRoute = await import(pathToFileURL(join(directory, 'app/api/army/drill/route.mjs')).href); // #738 slice 2
  const iVotedRoute = await import(pathToFileURL(join(directory, 'app/api/citizen/i-voted/route.mjs')).href); // #782
  const unrestRoute = await import(pathToFileURL(join(directory, 'app/api/world/unrest/route.mjs')).href); // #82 slice 4
  const resourcesRoute = await import(pathToFileURL(join(directory, 'app/api/world/resources/route.mjs')).href); // #82 slice 3
  const heartbeatRoute = await import(pathToFileURL(join(directory, 'app/api/citizen/heartbeat/route.mjs')).href); // #739
  const registryRoute = await import(pathToFileURL(join(directory, 'app/api/world/registry/route.mjs')).href); // #122
  const faucetRoute = await import(pathToFileURL(join(directory, 'app/api/test-faucet/route.mjs')).href); // #631
  const ordersRoute = await import(pathToFileURL(join(directory, 'app/api/market/orders/route.mjs')).href); // #197
  const travelRoute = await import(pathToFileURL(join(directory, 'app/api/travel/route.mjs')).href); // #123
  const hallRoute = await import(pathToFileURL(join(directory, 'app/api/diplomatic-hall/route.mjs')).href); // #599
  const successionRoute = await import(pathToFileURL(join(directory, 'app/api/aurelle-succession/route.mjs')).href); // #613
  const faithRoute = await import(pathToFileURL(join(directory, 'app/api/faith/route.mjs')).href); // #67
  const congregationsRoute = await import(pathToFileURL(join(directory, 'app/api/congregations/route.mjs')).href); // #224
  const chartersRoute = await import(pathToFileURL(join(directory, 'app/api/aurelle/charters/route.mjs')).href); // #531
  const rewardsRoute = await import(pathToFileURL(join(directory, 'app/api/tessera/rewards/route.mjs')).href); // #465
  const reliefRoute = await import(pathToFileURL(join(directory, 'app/api/relocation/claim/route.mjs')).href); // #470
  const risingRoute = await import(pathToFileURL(join(directory, 'app/api/aurelle/rising/route.mjs')).href); // #71
  const assemblyRoute = await import(pathToFileURL(join(directory, 'app/api/assembly/route.mjs')).href); // #283
  const primariesRoute = await import(pathToFileURL(join(directory, 'app/api/primaries/route.mjs')).href); // #307
  const canvassingRoute = await import(pathToFileURL(join(directory, 'app/api/canvassing/route.mjs')).href); // #442
  const townHallRoute = await import(pathToFileURL(join(directory, 'app/api/town-hall/route.mjs')).href); // #441
  const debateRoute = await import(pathToFileURL(join(directory, 'app/api/debate/route.mjs')).href); // #282
  const reportsRoute = await import(pathToFileURL(join(directory, 'app/api/reports/route.mjs')).href); // #743
  const collective = await import(pathToFileURL(join(directory,'lib/collective-petitions.mjs')).href);
  const government = await import(pathToFileURL(join(directory, 'lib/government-state.mjs')).href);
  const simulation = await import(pathToFileURL(join(directory, 'lib/world-simulation.mjs')).href);
  await getDatabase(); // Real additive schema bootstrap and seed initialization.
  env.DB.sqlite.exec(await readFile(join(root, 'drizzle/0070_moderation_reports.sql'), 'utf8')); // #743: the table comes only from its migration
  const now = new Date(epoch).toISOString();
  await env.DB.batch(['alice', 'bob'].map(user => env.DB.prepare(`INSERT INTO citizens
    (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at)
    VALUES (?,'kindle',?,18,1240,'Good standing',?,?)`).bind(user, `Private ${user}`, now, now)));
  let postgres;
  if(backend==='postgres'){const {postgresFixture}=await import('./postgres-runtime.mjs');postgres=await postgresFixture(env.DB.sqlite,path,directory,accountElection);env.DB.close();env.DB=postgres.db;}
  const call = async (endpoint, user, body, origin = 'https://fixture.invalid', query = '', headers = {}) => {
    const request = new Request(`https://fixture.invalid/api/${endpoint}${query}`, body === undefined ? undefined : {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    if (user) identify(request, user);
    const handlers = endpoint === 'notables' ? notables : endpoint === 'addresses' ? addresses : endpoint === 'election' ? election : endpoint === 'petitions' ? petitions : endpoint === 'news' ? news : endpoint === 'citizen' ? citizen : endpoint === 'world' ? world : endpoint === 'world/found-city' ? foundCityRoute : endpoint === 'city' ? city : endpoint === 'city-home' ? cityHome : square;
    const routed = endpoint === 'embassy-chat' ? embassyChatRoute : endpoint === 'dm-chat' ? dmChatRoute : endpoint === 'global-chat' ? globalChatRoute : endpoint === 'city-chat' ? cityChatRoute : endpoint === 'rallies' ? ralliesRoute : endpoint === 'party-donations' ? donationsRoute : endpoint === 'planks' ? planksRoute : endpoint === 'polling' ? pollingRoute : endpoint === 'jobs/types' ? jobTypesRoute : endpoint === 'kindle/budget' ? kindleBudgetRoute : endpoint === 'citizen/heartbeat' ? heartbeatRoute : endpoint === 'army/battles' ? armyBattlesRoute : endpoint === 'army' ? armyRoute : endpoint === 'army/drill' ? armyDrillRoute : endpoint === 'army/draft' ? armyDraftRoute : endpoint === 'army/positions' ? armyPositionsRoute : endpoint === 'faith/holy-sites' ? holySitesRoute : endpoint === 'citizen/i-voted' ? iVotedRoute : endpoint === 'citizen/civic-rank' ? civicRankRoute : endpoint === 'world/ownership' ? ownershipRoute : endpoint === 'world/unrest' ? unrestRoute : endpoint === 'world/resources' ? resourcesRoute : endpoint === 'world/registry' ? registryRoute : endpoint === 'test-faucet' ? faucetRoute : endpoint === 'market/orders' ? ordersRoute : endpoint === 'travel' ? travelRoute : endpoint === 'faith' ? faithRoute : endpoint === 'diplomatic-hall' ? hallRoute : endpoint === 'aurelle-succession' ? successionRoute : endpoint === 'aurelle/charters' ? chartersRoute : endpoint === 'tessera/rewards' ? rewardsRoute : endpoint === 'relocation/claim' ? reliefRoute : endpoint === 'aurelle/rising' ? risingRoute : endpoint === 'congregations' ? congregationsRoute : endpoint === 'assembly' ? assemblyRoute : endpoint === 'canvassing' ? canvassingRoute : endpoint === 'town-hall' ? townHallRoute : endpoint === 'reports' ? reportsRoute : endpoint === 'debate' ? debateRoute : endpoint === 'primaries' ? primariesRoute : handlers; // #307, #283, #71, #122, #197, #123
    const response = await routed[body === undefined ? 'GET' : 'POST'](request);
    return { status: response.status, cache: response.headers.get('Cache-Control'), data: await response.json() };
  };
  return {
    // Load a transpiled app module from this runtime, e.g. importModule('lib/city-location.ts').
    importModule:rel=>import(pathToFileURL(join(directory,rel.replace(/\.tsx?$/,'.mjs'))).href),
    call,setCityFounding:on=>{env.HARIMU_CITY_FOUNDING_ENABLED=String(on);},setFixtureEnv:(name,value)=>{if(value===undefined)delete env[name];else env[name]=value;},setFixtureAiFlags:flags=>{if('news' in flags)env.HARIMU_AI_NEWS_ENABLED=String(flags.news);if('notables' in flags)env.HARIMU_NOTABLES_ENABLED=String(flags.notables);if('cabinet' in flags)env.HARIMU_AI_CABINET_RESPONSES_ENABLED=String(flags.cabinet);}, settleBackground:async()=>{const jobs=globalThis.__harimuBackground??[];globalThis.__harimuBackground=[];await Promise.all(jobs);}, setFixtureAiBinding:binding=>{env.AI=binding;env.HARIMU_AI_NEWS_ENABLED='true';env.HARIMU_AI_DAILY_BUDGET_MICRO='970000';env.HARIMU_AI_GATEWAY_ID='harimu-test';}, prepareAiCabinetResponse:(binding,options)=>cabinetAi.prepareAiCabinetResponse(env.DB,Math.floor(clock.Date.now()/1000),binding,options), answerNotable:(user,command,binding,options)=>notableService.answerNotable(env.DB,user,command,Math.floor(clock.Date.now()/1000),binding,options), sqliteBackupPath:path, storageEngine:backend, get postgresSnapshot(){return postgres?.snapshot;}, recordCabinetResponse: (input,now=Math.floor(clock.Date.now()/1000)) => collective.recordAuthoredCabinetResponse(env.DB,input,now), readGovernment: (nationId, userId) => government.readGovernment(env.DB, nationId, Math.floor(clock.Date.now()/1000), userId), advanceWorld: now => simulation.advanceWorld(env.DB, now), get now() { return clock.Date.now(); }, setNow: clock.setNow, setVerification, get db() { return env.DB; },
    setSquarePurchase:on=>{env.HARIMU_SQUARE_PURCHASE_ENABLED=String(on);}, // #122
    setTesseraExchange:on=>{env.HARIMU_TESSERA_EXCHANGE_ENABLED=String(on);}, // #626
    setOrderBook:on=>{env.HARIMU_ORDER_BOOK_ENABLED=String(on);}, // #197
    setTravel:on=>{env.HARIMU_TRAVEL_ENABLED=String(on);}, // #123
    setDiplomaticHall:on=>{env.HARIMU_DIPLOMATIC_HALL_ENABLED=String(on);}, // #599
    setMapOverlays:on=>{env.HARIMU_MAP_OVERLAYS_ENABLED=String(on);}, // #82
    setFaith:on=>{env.HARIMU_FAITH_ENABLED=String(on);}, // #67
    setDormancy:on=>{env.HARIMU_DORMANCY_ENABLED=String(on);}, // #739
    reopen() { if(postgres){postgres.reopen();return;}env.DB.close(); env.DB = new LocalD1(path); },
    async close() { if(postgres)await postgres.close();else env.DB.close(); await rm(directory, { recursive: true, force: true }); },
  };
}
