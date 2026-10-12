import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const nations = sqliteTable('nations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  affinity: text('affinity').notNull(),
  government: text('government').notNull(),
  economy: text('economy').notNull(),
  capital: text('capital').notNull(),
  population: text('population').notNull(),
  treasury: text('treasury').notNull(),
  stability: integer('stability').notNull(),
  color: text('color').notNull(),
  softColor: text('soft_color').notNull(),
  motto: text('motto').notNull(),
  tradeStatus: text('trade_status').notNull(),
  positionX: integer('position_x').notNull(),
  positionY: integer('position_y').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const worldEvents = sqliteTable(
  'world_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    headline: text('headline').notNull(),
    detail: text('detail').notNull(),
    location: text('location'),
    occurredAt: text('occurred_at').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [index('idx_world_events_sort_order').on(table.sortOrder)],
);

export const workOrders = sqliteTable(
  'work_orders',
  {
    id: text('id').primaryKey(),
    nationId: text('nation_id').references(() => nations.id),
    name: text('name').notNull(),
    detail: text('detail').notNull(),
    capacityCost: integer('capacity_cost').notNull(),
    status: text('status').notNull().default('open'),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [index('idx_work_orders_nation_status').on(table.nationId, table.status)],
);

export const planningTasks = sqliteTable('planning_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  meta: text('meta').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const citizens = sqliteTable('citizens', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  nationId: text('nation_id').references(() => nations.id),
  displayName: text('display_name'),
  capacity: integer('capacity').notNull().default(18),
  influence: integer('influence').notNull().default(1240),
  standing: text('standing').notNull().default('Good standing'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const citizenPlans = sqliteTable('citizen_plans', {
  clerkUserId: text('clerk_user_id')
    .primaryKey()
    .references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  horizon: text('horizon').notNull().default('week'),
  privateNote: text('private_note').notNull().default(''),
  savedAt: text('saved_at').notNull(),
});

export const citizenPlanItems = sqliteTable(
  'citizen_plan_items',
  {
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => planningTasks.id),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.clerkUserId, table.taskId] })],
);

export const workContributions = sqliteTable(
  'work_contributions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
    workOrderId: text('work_order_id')
      .notNull()
      .references(() => workOrders.id),
    capacitySpent: integer('capacity_spent').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_work_contributions_user_created').on(table.clerkUserId, table.createdAt)],
);
