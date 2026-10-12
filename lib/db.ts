import { env } from 'cloudflare:workers';

const nationSeeds = [
  ['tidelands', 'Tidelands Republic', 'Tidelands', 'Water', 'Federal presidential democracy', 'Regulated market capitalism', 'Port Meridian', '1.42m', '₳ 86.4m', 78, '#43a7ad', '#b8dde0', 'Many currents, one tide.', 'Open commerce', 27, 29, 1],
  ['delta', 'Delta Cooperative', 'Delta', 'Water', 'Council-based socialist republic', 'Cooperative mixed economy', 'Confluence', '1.16m', '₳ 61.8m', 83, '#69a9d0', '#c8ddec', 'What the river gives, we share.', 'Board approval', 48, 24, 2],
  ['jade', 'Jade Union', 'Jade Union', 'Earth', 'Single-party socialist republic', 'State-directed market socialism', 'Verdant Seat', '1.87m', '₳ 103.1m', 86, '#5e9f73', '#c7dac5', 'Patient stone, enduring harvest.', 'Licensed trade', 68, 30, 3],
  ['terraced', 'Terraced Crown', 'Terraced Crown', 'Earth', 'Absolute hereditary monarchy', 'Crown-directed market economy', 'High Terrace', '924k', '₳ 74.6m', 72, '#a29558', '#ddd7b6', 'From root to summit.', 'Royal charter', 56, 43, 4],
  ['ashen', 'Ashen Directorate', 'Ashen', 'Fire', 'Personalist single-party state', 'Centrally planned command economy', 'Cinderhold', '1.31m', '₳ 58.2m', 68, '#c25740', '#e2c0b7', 'From discipline, strength.', 'State bureau only', 42, 72, 5],
  ['solar', 'Solar Commonwealth', 'Solar', 'Fire', 'Parliamentary democracy', 'Social-market capitalism', 'Dawn Assembly', '1.09m', '₳ 79.3m', 81, '#d28a45', '#efd2ad', 'A brighter day, held in common.', 'Open commerce', 73, 72, 6],
  ['sky', 'Sky Covenant', 'Sky Covenant', 'Air', 'Guardian theocracy', 'Mixed market and charitable trusts', 'Aerie of Accord', '778k', '₳ 48.9m', 75, '#9b8ac1', '#d8d1e7', 'Under one sky, with open eyes.', 'Doctrinal review', 27, 54, 7],
  ['celestial', 'Celestial See', 'Celestial See', 'Air', 'Elective theocratic principality', 'Temple, guild, and communal economy', 'The Quiet Spire', '642k', '₳ 41.7m', 88, '#8e82a8', '#ded8e5', 'Listen above the noise.', 'Approved orders', 48, 54, 8],
] as const;

const workOrderSeeds = [
  ['harvest', 'jade', 'Support the harvest', '+480 food · resolves in 2h', 4, 'open', 1],
  ['freight', 'jade', 'Move a materials convoy', '+210 materials · resolves in 4h', 6, 'open', 2],
  ['archive', 'jade', 'Catalogue the city archive', '+95 knowledge · resolves in 3h', 3, 'open', 3],
] as const;

const planningTaskSeeds = [
  ['capacity', 'Commit Work Capacity', 'Reserve 6 WC for the Verdant Seat harvest cooperative.', '6 WC · before 20:00', 1],
  ['forum', 'Attend the district forum', 'Hear arguments on the eastern waterworks proposal.', 'Civic · 21:30', 2],
  ['ballot', 'Review the trade ballot', 'Compare the open-corridor and licensed-market measures.', 'Vote closes in 2d', 3],
] as const;

const worldEventSeeds = [
  [1, 'Work', 'Capacity grant closes', 'Verdant Seat closes allocations for tomorrow’s harvest.', 'Verdant Seat', 'Today · 20:00', 1],
  [2, 'Civic', 'District assembly session', 'The eastern waterworks proposal enters public debate.', 'Verdant Ward', 'Day 43 · 09:00', 2],
  [3, 'Ballot', 'Trade corridor vote', 'Citizens decide the Solar–Delta corridor mandate.', 'World Assembly', 'Day 45 · 18:00', 3],
] as const;

let initialization: Promise<void> | undefined;

function databaseBinding() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error('The Harimu database binding is unavailable.');
  return database;
}

async function initialize(database: D1Database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS nations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      affinity TEXT NOT NULL,
      government TEXT NOT NULL,
      economy TEXT NOT NULL,
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
    database.prepare(`CREATE TABLE IF NOT EXISTS citizens (
      clerk_user_id TEXT PRIMARY KEY NOT NULL,
      nation_id TEXT REFERENCES nations(id),
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
  ]);

  await database.batch([
    ...nationSeeds.map((nation) => database.prepare(`INSERT OR IGNORE INTO nations (
      id, name, short_name, affinity, government, economy, capital, population, treasury,
      stability, color, soft_color, motto, trade_status, position_x, position_y, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...nation)),
    ...workOrderSeeds.map((order) => database.prepare(`INSERT OR IGNORE INTO work_orders (
      id, nation_id, name, detail, capacity_cost, status, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(...order)),
    ...planningTaskSeeds.map((task) => database.prepare(`INSERT OR IGNORE INTO planning_tasks (
      id, title, detail, meta, sort_order
    ) VALUES (?, ?, ?, ?, ?)`)
      .bind(...task)),
    ...worldEventSeeds.map((event) => database.prepare(`INSERT OR IGNORE INTO world_events (
      id, kind, headline, detail, location, occurred_at, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(...event)),
  ]);

  await database.prepare('PRAGMA optimize').run();
}

export async function getDatabase() {
  const database = databaseBinding();
  initialization ??= initialize(database);
  await initialization;
  return database;
}
