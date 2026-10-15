import { aurelleRisingSchemas } from './aurelle-rising';
import { aurelleCoupSchemas } from './aurelle-coup';
import { presidiumSchemas } from './korund-presidium';
import { marketSchemas, marketGoodsSeedSql, marketOpenOrdersView } from './market-orders';
import {accountElectionEnabled,accountElectionSchemas} from './preview-election';
import {aiNewsSchemas} from './ai-news';
import {korundQueueSchemas} from './korund-queue';
import {korundCouponSchemas} from './korund-coupons';
import {firstWeekGoalsSchema} from './first-week-server';
import {worldRegistrySchemas} from './world-registry';
import { tesseraExchangeSchema, tesseraExchangeIndex } from './tessera-exchange';
import {travelSchema} from './travel';
import {faithSchemas} from './faith';
import {congregationSchemas} from './congregations';
import {stabilitySchemas} from './stability';
import {selectStorageBackend,assertPostgresApplicationRole,postgresRuntimeEnabled} from './storage-selection';
import type {GameDatabase} from './database-contract';
import {addressSchemas} from './weekly-addresses';
import {electionSchemas} from './elections';
import {assemblySchemas} from './assembly';
import {primarySchemas} from './primaries';
import {collectivePetitionSchemas} from './collective-petitions';
import { cityLocationSchema } from './city-location';
import { worldSquaresSchema, worldSquaresSeedSql } from './map-zones';
import { worldCitiesSchema } from './city-founding';
import { aurelleSchemas, royalFavorSchemas } from './aurelle';
import { warSchemas } from './war'; // #309
import { treatySchemas } from './diplomacy'; // #308
import { embargoSchemas } from './embargo'; // #363
import { squareSchema } from './square-chat';
import { petitionSchema, petitionEligibilitySchema, petitionReviewSchema, petitionResolutionSchema } from './government-state';
import { listingSchema, fillSchema, cancelSchema, playerReceiptView, openLotsView } from './player-market';
import { marketItemsSchema, starterSchema, marketEventsSchema, walletViewSql, inventoryViewSql, merchantViewSql, merchantCashSql, marketSeeds } from './market';
import { economySchema, recoverySchema, rewardSchema, fundSchema, incomeTaxSchema, employerBudgetMinor, rewards } from './economy';
import { shiftSchema, activeShiftIndex } from './work-shifts';
import { shiftQualitySchema } from './shift-quality';
import { env } from 'cloudflare:workers';
import { isolateOnce } from './postgres/readiness';

const nationSeeds = [
  ['kindle', 'Kindle Republic', 'Kindle', 'Liberal democracy', 'Market capitalism', 'Spark (SPK) · free float', 'Secular pluralism', 'Forgehaven', '1.42m', 'SPK 86.4m', 78, '#cf4b32', '#edc1b8', 'Anyone can rise - and anyone can fall.', 'Open exchange', 85, 67, 1],
  ['confluence', 'The Confluence', 'Confluence', 'Single-party socialist state', 'Socialist-oriented market', 'Current (CUR) · managed band', 'Registered faiths', 'Meetwater', '1.16m', 'CUR 61.8m', 83, '#2776a6', '#b7d4e5', 'Many rivers, one current.', 'Managed band', 50, 88, 2],
  ['meridian', 'Meridian', 'Meridian', 'Party-state', 'State capitalism with SEZs', 'Gauge (GAU) · crawling peg', 'State-supervised associations', 'Steamgate', '1.87m', 'GAU 103.1m', 86, '#a1639c', '#dec7dc', 'Order today, prosperity tomorrow.', 'SEZ convertibility', 72, 82, 3],
  ['korund', 'Korund', 'Korund', 'Full communism; leader for life', 'Central planning', 'Labor Note (LN) + ration coupons', 'State atheism', 'Stonehearth', '1.31m', 'LN 58.2m', 68, '#75654e', '#d3cabd', 'Nobody falls through the stone.', 'State bureau only', 14, 45, 4],
  ['aurelle', 'Aurelle', 'Aurelle', 'Absolute hereditary monarchy', 'Royal charters and fiefs', 'Crown (CRN) · gold-backed', 'Kinward Rite state church', 'Highspire', '924k', 'CRN 74.6m', 72, '#94afbf', '#d9e2e8', "Win the crown's favor - or take the crown.", 'Royal charter', 72, 28, 5],
  ['ilmar', 'Ilmar Sanctum', 'Ilmar', 'Theocracy', 'Endowment economy', 'Prism (PRM) · Canon rules', 'Lumen Canon theocracy', 'Mirrorhall', '778k', 'PRM 48.9m', 75, '#d3a72f', '#efe1af', 'Every duty is a step toward the light.', 'Clear Measure', 28, 82, 6],
  ['hoarvale', 'Hoarvale', 'Hoarvale', 'Constitutional monarchy', 'Coordinated market', 'Rime (RIM) · inflation band', 'Ceremonial Kinward establishment', 'Rimehall', '1.09m', 'RIM 79.3m', 81, '#45a7b8', '#bee0e5', 'The Crown endures; governments answer to you.', 'Open exchange', 50, 20, 7],
  ['varkand', 'Varkand', 'Varkand', 'Military junta', 'Arsenal command economy', 'Ward (WRD) · hard peg', 'Regulated tolerance', 'Watchfast', '846k', 'WRD 52.6m', 70, '#526b68', '#c5d0ce', 'Order first. Everything else after.', 'Alert-dependent', 28, 28, 8],
  ['veldwood', 'Veldwood', 'Veldwood', 'Federal direct democracy', 'Social democracy', 'Bough (BGH) · Citizen Dividend', 'Secular pluralism', 'Ringhall', '1.04m', 'BGH 76.2m', 84, '#5b8d42', '#c9dcbf', 'Every voice, every season.', 'Open exchange', 14, 65, 9],
  ['fulmara', 'Fulmara', 'Fulmara', 'Mercantile oligarchic republic', 'Chartered-company capitalism', 'Charge (CHG) · shareholder bank', 'Chartered pluralism', 'Arcport', '1.22m', 'CHG 91.7m', 74, '#6440a0', '#cbbde1', 'Fortune is the franchise.', 'Open exchange', 86, 46, 10],
] as const;

const workOrderSeeds = [
  ['aurelle-food-estate', 'aurelle', 'Chartered food-estate service', '+4 public food · 8 CRN wage · 2 Favor · resolves in 2h', 4, 'open', 5],
  ['korund-food-production', 'korund', 'State food-production brigade', '+4 public food · 8 LN wage · resolves in 2h', 4, 'open', 4],
  ['harvest', 'kindle', 'Support the savanna harvest', '+480 food · resolves in 2h', 4, 'open', 1],
  ['freight', 'kindle', 'Move a foundry convoy', '+210 materials · resolves in 4h', 6, 'open', 2],
  ['archive', 'kindle', 'Catalogue the civic archive', '+95 knowledge · resolves in 3h', 3, 'open', 3],
  ['orchard', 'kindle', 'Pick the savanna orchards', '+3 fruit · resolves in 2h', 4, 'open', 6],
  ['herding', 'kindle', 'Drive the grassland herds', '+2 meat · resolves in 3h', 5, 'open', 7],
  ['logging', 'kindle', 'Cut timber for the city', '+3 wood · resolves in 4h', 6, 'open', 8],
] as const;

const planningTaskSeeds = [
  ['capacity', 'Commit Work Capacity', 'Reserve 6 WC for the Forgehaven East harvest crews.', '6 WC · before 20:00', 1],
  ['forum', 'Attend the district forum', 'Hear arguments on the eastern waterworks proposal.', 'Civic · 21:30', 2],
  ['ballot', 'Review the trade ballot', 'Compare the open-corridor and licensed-market measures.', 'Vote closes in 2d', 3],
] as const;

const planningTaskEffectSeeds = [
  ['capacity', -6, 20, 4, 1, 'Harvest crews reinforce the intake before the storm, protecting tomorrow’s reserve.', 'waterworks', 'citizen'],
  ['forum', -2, 80, 3, 3, 'The household joins the forum and keeps emergency repair funding open.', 'council', 'partner'],
  ['ballot', 0, 50, 1, 2, 'The household completes the trade review, improving the route for replacement pump parts.', 'depot', 'apprentice'],
] as const;

const worldEventSeeds = [
  [1, 'Work', 'Capacity grant closes', 'Forgehaven closes allocations for tomorrow’s savanna harvest.', 'Forgehaven', 'Today · 20:00', 1],
  [2, 'Civic', 'District assembly session', 'The eastern waterworks proposal enters public debate.', 'Forgehaven East', 'Day 43 · 09:00', 2],
  [3, 'Ballot', 'Trade corridor vote', 'Citizens decide the Kindle-Confluence corridor mandate.', 'Kindle Assembly', 'Day 45 · 18:00', 3],
] as const;

let initialization: Promise<void> | undefined;
// #52: PostgreSQL readiness checks used to run on every request, each opening
// its own Hyperdrive connection (5+ connects before the route's own work), and
// the preview AI accounting ran a writer-locked transaction per request. Verify
// once per isolate and refresh the preview accounting at most once a minute.

function databaseBinding() {
  const database = (env as unknown as { DB?: GameDatabase }).DB;
  if (!database) throw new Error('The Harimu database binding is unavailable.');
  return database;
}

async function initialize(database: GameDatabase) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS nations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      government TEXT NOT NULL,
      economy TEXT NOT NULL,
      currency TEXT NOT NULL,
      religion TEXT NOT NULL,
      capital TEXT NOT NULL,
      population TEXT NOT NULL,
      treasury TEXT NOT NULL,
      stability INTEGER NOT NULL,
      color TEXT NOT NULL,
      soft_color TEXT NOT NULL,
      motto TEXT NOT NULL,
      trade_status TEXT NOT NULL,
      position_x INTEGER NOT NULL,
      position_y INTEGER NOT NULL,
      sort_order INTEGER NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS world_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      kind TEXT NOT NULL,
      headline TEXT NOT NULL,
      detail TEXT NOT NULL,
      location TEXT,
      occurred_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY NOT NULL,
      nation_id TEXT REFERENCES nations(id),
      name TEXT NOT NULL,
      detail TEXT NOT NULL,
      capacity_cost INTEGER NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      sort_order INTEGER NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS planning_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      meta TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS planning_task_effects (
      task_id TEXT PRIMARY KEY NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      capacity_delta INTEGER DEFAULT 0 NOT NULL,
      influence_delta INTEGER DEFAULT 0 NOT NULL,
      water_delta INTEGER DEFAULT 0 NOT NULL,
      stability_delta INTEGER DEFAULT 0 NOT NULL,
      outcome TEXT NOT NULL,
      infrastructure_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS citizens (
      clerk_user_id TEXT PRIMARY KEY NOT NULL,
      nation_id TEXT REFERENCES nations(id),
      nation_changes INTEGER DEFAULT 0 NOT NULL,
      display_name TEXT,
      capacity INTEGER DEFAULT 18 NOT NULL,
      influence INTEGER DEFAULT 1240 NOT NULL,
      standing TEXT DEFAULT 'Good standing' NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS citizen_plans (
      clerk_user_id TEXT PRIMARY KEY NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      horizon TEXT DEFAULT 'week' NOT NULL,
      private_note TEXT DEFAULT '' NOT NULL,
      saved_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS citizen_plan_items (
      clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES planning_tasks(id),
      completed INTEGER DEFAULT 0 NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (clerk_user_id, task_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS citizen_decisions (
      clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      decision_id TEXT NOT NULL,
      task_id TEXT NOT NULL REFERENCES planning_tasks(id),
      infrastructure_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      capacity_delta INTEGER NOT NULL,
      influence_delta INTEGER NOT NULL,
      water_delta INTEGER NOT NULL,
      stability_delta INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      committed_at TEXT NOT NULL,
      PRIMARY KEY (clerk_user_id, decision_id)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS work_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      work_order_id TEXT NOT NULL REFERENCES work_orders(id),
      capacity_spent INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_world_events_sort_order ON world_events(sort_order)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_work_orders_nation_status ON work_orders(nation_id, status)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_work_contributions_user_created ON work_contributions(clerk_user_id, created_at)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_citizen_decisions_user_committed ON citizen_decisions(clerk_user_id, committed_at)'),
  ]);

  await database.batch([database.prepare(shiftSchema), database.prepare(activeShiftIndex)]);
  await database.prepare(shiftQualitySchema).run();

  await database.batch([database.prepare(economySchema), database.prepare(recoverySchema), database.prepare(rewardSchema), database.prepare(fundSchema), database.prepare(incomeTaxSchema),
    database.prepare("INSERT OR IGNORE INTO economy_funds (id, initial_minor) VALUES ('kindle-employer', ?)").bind(employerBudgetMinor),
    database.prepare("INSERT OR IGNORE INTO economy_funds (id, initial_minor) VALUES ('kindle-treasury', 0)")]);
  await database.batch([
    ...addressSchemas.map(sql=>database.prepare(sql)),
    ...korundQueueSchemas.map(sql=>database.prepare(sql)),
    ...korundCouponSchemas.map(sql=>database.prepare(sql)),
    database.prepare(firstWeekGoalsSchema),
    ...worldRegistrySchemas.map(sql=>database.prepare(sql)), database.prepare(tesseraExchangeSchema), database.prepare(tesseraExchangeIndex), // #210
    database.prepare(travelSchema),
    ...faithSchemas.map(sql=>database.prepare(sql)),
    ...royalFavorSchemas.map(sql=>database.prepare(sql)), // #289
    ...warSchemas.map(sql=>database.prepare(sql)), ...treatySchemas.map(sql=>database.prepare(sql)), ...embargoSchemas.map(sql=>database.prepare(sql)), // #309, #308
    ...congregationSchemas.map(sql=>database.prepare(sql)),
    ...stabilitySchemas.map(sql=>database.prepare(sql)),
    ...aiNewsSchemas.map(sql=>database.prepare(sql)),
    ...electionSchemas.map(sql=>database.prepare(sql)),
    ...accountElectionSchemas.map(sql=>database.prepare(sql)),
    ...collectivePetitionSchemas.map(sql=>database.prepare(sql)),
    database.prepare(petitionSchema), database.prepare(petitionEligibilitySchema), database.prepare(petitionReviewSchema), database.prepare(petitionResolutionSchema),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_government_petitions_nation_period ON government_petitions(nation_id, period_start)'),
    database.prepare(cityLocationSchema),
    database.prepare(worldSquaresSchema),
    ...worldSquaresSeedSql().map(sql => database.prepare(sql)),
    database.prepare(worldCitiesSchema),
    ...squareSchema.map(sql => database.prepare(sql)),
    database.prepare(listingSchema), database.prepare(fillSchema), database.prepare(cancelSchema),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_player_listings_seller ON player_listings(seller_id, created_at)'),
    database.prepare(playerReceiptView), database.prepare(openLotsView),
    database.prepare('CREATE TABLE IF NOT EXISTS economy_migrations (id TEXT PRIMARY KEY)'),
    ...marketSchemas.map(sql => database.prepare(sql)), ...aurelleRisingSchemas.map(sql => database.prepare(sql)), ...aurelleCoupSchemas.map(sql => database.prepare(sql)), ...assemblySchemas.map(sql => database.prepare(sql)), ...primarySchemas.map(sql => database.prepare(sql)), ...presidiumSchemas.map(sql => database.prepare(sql)), ...marketGoodsSeedSql.map(sql => database.prepare(sql)),
  ]);
  await database.batch([
    database.prepare(marketItemsSchema), database.prepare(starterSchema), database.prepare(marketEventsSchema),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_economy_events_user_item ON citizen_economy_events(clerk_user_id, item)"),
    database.prepare("INSERT OR IGNORE INTO economy_funds (id, initial_minor) VALUES ('kindle-merchant', 100000)"),
    ...marketSeeds.map((item) => database.prepare('INSERT OR IGNORE INTO market_items (item, label, buy_minor, sell_minor, initial_stock) VALUES (?, ?, ?, ?, ?)').bind(...item)),
    database.prepare(walletViewSql), database.prepare(inventoryViewSql), database.prepare(merchantViewSql), database.prepare(merchantCashSql),
  ]);
  const playerBalancesInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id = 'player-market-v1'").first();
  if (!playerBalancesInstalled) {
    // Atomic view replacement upgrades v11 balances without a missing-view window.
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS citizen_wallet_balances'),
      database.prepare('DROP VIEW IF EXISTS citizen_inventory_balances'),
      database.prepare(walletViewSql), database.prepare(inventoryViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('player-market-v1')"),
    ]);
  }
  // #195: balances now include market order escrow and trades. Same atomic view swap as player-market-v1.
  const marketOrdersInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id = 'market-orders-v1'").first();
  if (!marketOrdersInstalled) {
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS citizen_wallet_balances'),
      database.prepare('DROP VIEW IF EXISTS citizen_inventory_balances'),
      database.prepare(walletViewSql), database.prepare(inventoryViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('market-orders-v1')"),
    ]);
  }
  // #199: spoilage reduces inventory and open sell order remaining. Atomic swap of all three views.
  const spoilageInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id = 'market-spoilage-v1'").first();
  if (!spoilageInstalled) {
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS citizen_wallet_balances'),
      database.prepare('DROP VIEW IF EXISTS citizen_inventory_balances'),
      database.prepare('DROP VIEW IF EXISTS market_open_orders'),
      database.prepare(marketOpenOrdersView), database.prepare(walletViewSql), database.prepare(inventoryViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('market-spoilage-v1')"),
    ]);
  }
  // #86: balances net out withheld Kindle income tax. Same atomic view swap as market-orders-v1.
  const incomeTaxInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id = 'kindle-income-tax-v1'").first();
  if (!incomeTaxInstalled) {
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS citizen_wallet_balances'), database.prepare(walletViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('kindle-income-tax-v1')"),
    ]);
  }
  // #210: Clearing House kiosk purchases debit Spark. Same atomic wallet-view swap as market-orders-v1.
  const tesseraExchangeInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id = 'tessera-exchange-v1'").first();
  if (!tesseraExchangeInstalled) {
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS citizen_wallet_balances'), database.prepare(walletViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('tessera-exchange-v1')"),
    ]);
  }
  await database.batch(aurelleSchemas.map(sql => database.prepare(sql.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '))));
  await database.prepare("INSERT OR IGNORE INTO aurelle_resources(id,initial_food,initial_minor) VALUES ('estate',40,100000)").run();
  await database.prepare("INSERT OR IGNORE INTO world_supply (id,initial_food,unit_minor) VALUES ('kindle-food-supplier',40,100)").run();
  await database.prepare("INSERT OR IGNORE INTO korund_resources(id,initial_food,initial_minor) VALUES ('state',40,100000)").run();
  const governmentStockInstalled = await database.prepare("SELECT id FROM economy_migrations WHERE id='government-stock-v1'").first();
  if (!governmentStockInstalled) {
    await database.batch([
      database.prepare('DROP VIEW IF EXISTS merchant_inventory_balances'), database.prepare(merchantViewSql),
      database.prepare("INSERT OR IGNORE INTO economy_migrations (id) VALUES ('government-stock-v1')"),
    ]);
  }
  // Existing unfinished shifts receive the prototype terms once; completed receipts are not repaid.
  await database.batch(Object.entries(rewards).map(([orderId, reward]) => database.prepare(`
    INSERT OR IGNORE INTO shift_rewards (shift_id, wage_minor, item, quantity)
    SELECT id, ?, ?, ? FROM work_shifts WHERE work_order_id = ? AND claimed_at IS NULL`)
    .bind(reward.wageMinor, reward.item, reward.quantity, orderId)));

  const nationColumns = await database.prepare('PRAGMA table_info(nations)').all<{ name: string }>();
  const columnNames = new Set(nationColumns.results.map((column) => column.name));
  const compatibilityMigrations = [];

  if (!columnNames.has('currency')) {
    compatibilityMigrations.push(database.prepare("ALTER TABLE nations ADD COLUMN currency TEXT NOT NULL DEFAULT ''"));
  }
  if (!columnNames.has('religion')) {
    compatibilityMigrations.push(database.prepare("ALTER TABLE nations ADD COLUMN religion TEXT NOT NULL DEFAULT ''"));
  }
  if (compatibilityMigrations.length > 0) {
    await database.batch(compatibilityMigrations);
  }

  const citizenColumns = await database.prepare('PRAGMA table_info(citizens)').all<{ name: string }>();
  const citizenColumnNames = new Set(citizenColumns.results.map((column) => column.name));
  if (!citizenColumnNames.has('nation_changes')) {
    await database.prepare('ALTER TABLE citizens ADD COLUMN nation_changes INTEGER NOT NULL DEFAULT 0').run();
  }

  const hasLegacyAffinity = columnNames.has('affinity');
  const nationColumnsSql = hasLegacyAffinity
    ? `id, name, short_name, affinity, government, economy, currency, religion, capital, population,
      treasury, stability, color, soft_color, motto, trade_status, position_x, position_y, sort_order`
    : `id, name, short_name, government, economy, currency, religion, capital, population,
      treasury, stability, color, soft_color, motto, trade_status, position_x, position_y, sort_order`;
  const nationValuesSql = hasLegacyAffinity
    ? `?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`
    : `?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;

  await database.batch([
    ...nationSeeds.map((nation) => database.prepare(`INSERT INTO nations (${nationColumnsSql})
      VALUES (${nationValuesSql})
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        government = excluded.government,
        economy = excluded.economy,
        currency = excluded.currency,
        religion = excluded.religion,
        capital = excluded.capital,
        population = excluded.population,
        treasury = excluded.treasury,
        stability = excluded.stability,
        color = excluded.color,
        soft_color = excluded.soft_color,
        motto = excluded.motto,
        trade_status = excluded.trade_status,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        sort_order = excluded.sort_order`)
      .bind(...nation)),
    ...workOrderSeeds.map((order) => database.prepare(`INSERT INTO work_orders (
      id, nation_id, name, detail, capacity_cost, status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nation_id = excluded.nation_id,
        name = excluded.name,
        detail = excluded.detail,
        capacity_cost = excluded.capacity_cost,
        status = excluded.status,
        sort_order = excluded.sort_order`)
      .bind(...order)),
    ...planningTaskSeeds.map((task) => database.prepare(`INSERT INTO planning_tasks (
      id, title, detail, meta, sort_order
    ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        detail = excluded.detail,
        meta = excluded.meta,
        sort_order = excluded.sort_order`)
      .bind(...task)),
    ...planningTaskEffectSeeds.map((effect) => database.prepare(`INSERT INTO planning_task_effects (
      task_id, capacity_delta, influence_delta, water_delta, stability_delta, outcome,
      infrastructure_id, household_member_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        capacity_delta = excluded.capacity_delta,
        influence_delta = excluded.influence_delta,
        water_delta = excluded.water_delta,
        stability_delta = excluded.stability_delta,
        outcome = excluded.outcome,
        infrastructure_id = excluded.infrastructure_id,
        household_member_id = excluded.household_member_id`)
      .bind(...effect)),
    ...worldEventSeeds.map((event) => database.prepare(`INSERT INTO world_events (
      id, kind, headline, detail, location, occurred_at, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        headline = excluded.headline,
        detail = excluded.detail,
        location = excluded.location,
        occurred_at = excluded.occurred_at,
        sort_order = excluded.sort_order`)
      .bind(...event)),
  ]);

  await database.batch([
    database.prepare(`UPDATE citizens SET nation_id = 'kindle'
      WHERE nation_id IN ('tidelands', 'delta', 'jade', 'terraced', 'ashen', 'solar', 'sky', 'celestial')`),
    database.prepare(`UPDATE work_orders SET nation_id = 'kindle'
      WHERE nation_id IN ('tidelands', 'delta', 'jade', 'terraced', 'ashen', 'solar', 'sky', 'celestial')`),
    database.prepare(`DELETE FROM nations
      WHERE id IN ('tidelands', 'delta', 'jade', 'terraced', 'ashen', 'solar', 'sky', 'celestial')`),
  ]);

  await database.prepare('PRAGMA optimize').run();
}

type PostgresBindings={HARIMU_ACCOUNT_ELECTION_POC_ENABLED?:string;HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string;HARIMU_STORAGE_BACKEND?:string;NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string;HARIMU_STORAGE_MAINTENANCE?:string;HARIMU_POSTGRES_CUTOVER_READY?:string;HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED?:string;HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED?:string;HYPERDRIVE?:{connectionString:string}};
/** Readiness identity: a changed connection or trust flag must re-verify. */
/** SHA-256 so the connection string (a secret) never sits in memory as a map key. */
async function readinessKey(bindings:PostgresBindings){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([bindings.HYPERDRIVE?.connectionString,bindings.HARIMU_ACCOUNT_ELECTION_POC_ENABLED,bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW,bindings.HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED,bindings.HARIMU_AI_DAILY_BUDGET_MICRO,bindings.HARIMU_AI_GATEWAY_ID])));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
// Fresh database and bindings are passed on every call; the memo never closes over a request's objects.
const postgresReady=isolateOnce(async(database:GameDatabase,bindings:PostgresBindings)=>{
    const role=await database.prepare("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create_schema,has_any_column_privilege(current_user,'harimu_storage_migrations','UPDATE') AS can_change_marker,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser").first<{can_create_schema:number;can_change_marker:number;superuser:number}>();
    if(!role)throw Error('PostgreSQL application role could not be verified.');
    assertPostgresApplicationRole({canCreateSchema:role.can_create_schema,canChangeMarker:role.can_change_marker,superuser:role.superuser},bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW==='true'&&bindings.HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED==='true');
    // Imported schema/data must have passed validation. Do not bootstrap or
    // rewrite an imported world using the old SQLite compatibility migrations.
    const marker=await database.prepare("SELECT validated,backup_sha256 FROM harimu_storage_migrations WHERE id='d1-to-postgres-v1'").first<{validated:number;backup_sha256:string}>();
    if(marker?.validated!==1||!/^[a-f0-9]{64}$/.test(marker.backup_sha256))throw Error('PostgreSQL import has not been validated.');
    if(accountElectionEnabled(bindings)){
      const schema=await database.prepare("SELECT COUNT(*) AS count FROM pg_tables WHERE schemaname='public' AND tablename IN ('poc_elections','poc_voter_receipts','poc_anonymous_ballots')").first<{count:number}>();
      if(schema?.count!==3){if(bindings.HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED!=='true')throw Error('Approved preview election migration required.');const {initializeAccountElectionSchema}=await import('./postgres/driver');await initializeAccountElectionSchema(bindings.HYPERDRIVE!.connectionString);}
    }
});
// #92: readiness never writes AI reservations. Only a real, enabled, gateway-routed inference reserves budget.

export async function getDatabase():Promise<GameDatabase> {
  const bindings=env as unknown as {HARIMU_ACCOUNT_ELECTION_POC_ENABLED?:string;HARIMU_AI_DAILY_BUDGET_MICRO?:string;HARIMU_AI_GATEWAY_ID?:string;HARIMU_STORAGE_BACKEND?:string;NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string;HARIMU_STORAGE_MAINTENANCE?:string;HARIMU_POSTGRES_CUTOVER_READY?:string;HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED?:string;HARIMU_POSTGRES_TEMPORARY_ADMIN_APPROVED?:string;HYPERDRIVE?:{connectionString:string}};
  const journalRetentionApproved=bindings.HARIMU_POSTGRES_JOURNAL_RETENTION_APPROVED==='true';
  const selected=selectStorageBackend({backend:bindings.HARIMU_STORAGE_BACKEND,implementationEnabled:postgresRuntimeEnabled,developmentPreview:bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW,maintenance:bindings.HARIMU_STORAGE_MAINTENANCE,cutoverReady:bindings.HARIMU_POSTGRES_CUTOVER_READY,hyperdriveConfigured:Boolean(bindings.HYPERDRIVE),journalRetentionApproved});
  if(selected==='postgres'){
    const {postgresConnection}=await import('./postgres/driver');
    const database=postgresConnection(bindings.HYPERDRIVE!.connectionString,journalRetentionApproved,accountElectionEnabled(bindings));
    const key=await readinessKey(bindings);
    await postgresReady(key,database,bindings);
    return database;
  }
  const database = databaseBinding();
  initialization ??= initialize(database);
  await initialization;
  return database;
}
