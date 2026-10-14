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

export async function localRuntime({accountElection=false,accountElectionBindings,ballotPrivacyReady=false,backend=process.env.HARIMU_TEST_STORAGE??'sqlite'}={}) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'harimu-two-account-'));
  const path = join(directory, 'fixture.sqlite');
  const modules = [
    'lib/storage-selection.ts','lib/leader-personas.ts','lib/weekly-addresses.ts','app/api/addresses/route.ts',
    'lib/square-chat-validation.ts', 'lib/cities.ts', 'lib/city-location.ts', 'lib/map-zones.ts', 'lib/city-founding.ts', 'app/api/world/found-city/route.ts', 'app/api/city/route.ts',
    'lib/preview-election.ts','lib/ballot-privacy.ts','lib/instant-runoff.ts','lib/elections.ts','app/api/election/route.ts',
    'lib/collective-petitions.ts','lib/cabinet-response-ai.ts','app/api/petitions/route.ts',
    'lib/postgres/readiness.ts', 'lib/db.ts', 'lib/economy.ts', 'lib/economy-rules.ts', 'lib/market.ts', 'lib/wallet.ts',
    'lib/player-market.ts', 'lib/work-shifts.ts', 'lib/government.ts',
    'lib/national-news.ts', 'app/api/news/route.ts', 'lib/government-state.ts', 'lib/government-disclosure.ts', 'lib/square-chat.ts', 'lib/command-request.ts',
    'lib/verification.ts',
    'lib/world-simulation.ts','lib/stability.ts','lib/population-bands.ts','lib/nation-discovery.ts',
    'lib/qa-tools.ts','lib/first-week.ts','lib/first-week-server.ts','lib/notable-profiles.ts','lib/notable-roster.ts','lib/notable-choice.ts','lib/notables.ts','app/api/notables/route.ts','lib/korund.ts','lib/korund-queue.ts','lib/korund-coupons.ts','lib/ai-news.ts','lib/ai-budget.ts',
    'lib/aurelle.ts',
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
  await writeFile(envPath, `export const env = ${JSON.stringify(accountElectionBindings??(accountElection?{NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW:'true',HARIMU_ACCOUNT_ELECTION_POC_ENABLED:'true'}:{}))};\nexport function waitUntil(promise){(globalThis.__harimuBackground??=[]).push(Promise.resolve(promise));}\n`);
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
      if (specifier === 'cloudflare:workers') target = envPath;
      else if (specifier === '@/lib/ballot-privacy'||specifier === './ballot-privacy') target=privacyPath;
      else if (specifier === '@/lib/verification') target = verificationPath;
      else if (specifier.startsWith('@/')) target = join(directory, `${specifier.slice(2)}.mjs`);
      else if (specifier.startsWith('.')) target = resolve(directory, dirname(sourcePath), `${specifier}.mjs`);
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
  const election = await import(pathToFileURL(join(directory, 'app/api/election/route.mjs')).href);
  const petitions = await import(pathToFileURL(join(directory, 'app/api/petitions/route.mjs')).href);
  const news = await import(pathToFileURL(join(directory, 'app/api/news/route.mjs')).href);
  const addresses = await import(pathToFileURL(join(directory,'app/api/addresses/route.mjs')).href);
  const world = await import(pathToFileURL(join(directory, 'app/api/world/route.mjs')).href);
  const foundCityRoute = await import(pathToFileURL(join(directory, 'app/api/world/found-city/route.mjs')).href);
  const collective = await import(pathToFileURL(join(directory,'lib/collective-petitions.mjs')).href);
  const government = await import(pathToFileURL(join(directory, 'lib/government-state.mjs')).href);
  const simulation = await import(pathToFileURL(join(directory, 'lib/world-simulation.mjs')).href);
  await getDatabase(); // Real additive schema bootstrap and seed initialization.
  const now = new Date(epoch).toISOString();
  await env.DB.batch(['alice', 'bob'].map(user => env.DB.prepare(`INSERT INTO citizens
    (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at)
    VALUES (?,'kindle',?,18,1240,'Good standing',?,?)`).bind(user, `Private ${user}`, now, now)));
  let postgres;
  if(backend==='postgres'){const {postgresFixture}=await import('./postgres-runtime.mjs');postgres=await postgresFixture(env.DB.sqlite,path,directory,accountElection);env.DB.close();env.DB=postgres.db;}
  const call = async (endpoint, user, body, origin = 'https://fixture.invalid', query = '') => {
    const request = new Request(`https://fixture.invalid/api/${endpoint}${query}`, body === undefined ? undefined : {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (user) identify(request, user);
    const handlers = endpoint === 'notables' ? notables : endpoint === 'addresses' ? addresses : endpoint === 'election' ? election : endpoint === 'petitions' ? petitions : endpoint === 'news' ? news : endpoint === 'citizen' ? citizen : endpoint === 'world' ? world : endpoint === 'world/found-city' ? foundCityRoute : endpoint === 'city' ? city : square;
    const response = await handlers[body === undefined ? 'GET' : 'POST'](request);
    return { status: response.status, cache: response.headers.get('Cache-Control'), data: await response.json() };
  };
  return {
    // Load a transpiled app module from this runtime, e.g. importModule('lib/city-location.ts').
    importModule:rel=>import(pathToFileURL(join(directory,rel.replace(/\.tsx?$/,'.mjs'))).href),
    call,setCityFounding:on=>{env.HARIMU_CITY_FOUNDING_ENABLED=String(on);},setFixtureAiFlags:flags=>{if('news' in flags)env.HARIMU_AI_NEWS_ENABLED=String(flags.news);if('notables' in flags)env.HARIMU_NOTABLES_ENABLED=String(flags.notables);if('cabinet' in flags)env.HARIMU_AI_CABINET_RESPONSES_ENABLED=String(flags.cabinet);}, settleBackground:async()=>{const jobs=globalThis.__harimuBackground??[];globalThis.__harimuBackground=[];await Promise.all(jobs);}, setFixtureAiBinding:binding=>{env.AI=binding;env.HARIMU_AI_NEWS_ENABLED='true';env.HARIMU_AI_DAILY_BUDGET_MICRO='970000';env.HARIMU_AI_GATEWAY_ID='harimu-test';}, prepareAiCabinetResponse:(binding,options)=>cabinetAi.prepareAiCabinetResponse(env.DB,Math.floor(clock.Date.now()/1000),binding,options), answerNotable:(user,command,binding,options)=>notableService.answerNotable(env.DB,user,command,Math.floor(clock.Date.now()/1000),binding,options), sqliteBackupPath:path, storageEngine:backend, get postgresSnapshot(){return postgres?.snapshot;}, recordCabinetResponse: (input,now=Math.floor(clock.Date.now()/1000)) => collective.recordAuthoredCabinetResponse(env.DB,input,now), readGovernment: (nationId, userId) => government.readGovernment(env.DB, nationId, Math.floor(clock.Date.now()/1000), userId), advanceWorld: now => simulation.advanceWorld(env.DB, now), get now() { return clock.Date.now(); }, setNow: clock.setNow, setVerification, get db() { return env.DB; },
    reopen() { if(postgres){postgres.reopen();return;}env.DB.close(); env.DB = new LocalD1(path); },
    async close() { if(postgres)await postgres.close();else env.DB.close(); await rm(directory, { recursive: true, force: true }); },
  };
}
