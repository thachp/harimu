import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const nations = sqliteTable('nations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  government: text('government').notNull(),
  economy: text('economy').notNull(),
  currency: text('currency').notNull(),
  religion: text('religion').notNull(),
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

export const planningTaskEffects = sqliteTable('planning_task_effects', {
  taskId: text('task_id')
    .primaryKey()
    .references(() => planningTasks.id, { onDelete: 'cascade' }),
  capacityDelta: integer('capacity_delta').notNull().default(0),
  influenceDelta: integer('influence_delta').notNull().default(0),
  waterDelta: integer('water_delta').notNull().default(0),
  stabilityDelta: integer('stability_delta').notNull().default(0),
  outcome: text('outcome').notNull(),
  infrastructureId: text('infrastructure_id').notNull(),
  householdMemberId: text('household_member_id').notNull(),
});

export const citizens = sqliteTable('citizens', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  nationId: text('nation_id').references(() => nations.id),
  nationChanges: integer('nation_changes').notNull().default(0),
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

export const citizenDecisions = sqliteTable(
  'citizen_decisions',
  {
    clerkUserId: text('clerk_user_id')
      .notNull()
      .references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
    decisionId: text('decision_id').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => planningTasks.id),
    infrastructureId: text('infrastructure_id').notNull(),
    householdMemberId: text('household_member_id').notNull(),
    capacityDelta: integer('capacity_delta').notNull(),
    influenceDelta: integer('influence_delta').notNull(),
    waterDelta: integer('water_delta').notNull(),
    stabilityDelta: integer('stability_delta').notNull(),
    outcome: text('outcome').notNull(),
    committedAt: text('committed_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clerkUserId, table.decisionId] }),
    index('idx_citizen_decisions_user_committed').on(table.clerkUserId, table.committedAt),
  ],
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

export const workShifts = sqliteTable('work_shifts', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  workOrderId: text('work_order_id').notNull().references(() => workOrders.id),
  orderName: text('order_name').notNull(),
  output: text('output').notNull(),
  capacitySpent: integer('capacity_spent').notNull(),
  startedAt: text('started_at').notNull(),
  completesAt: text('completes_at').notNull(),
  claimedAt: text('claimed_at'),
}, (table) => [uniqueIndex('idx_one_active_shift').on(table.clerkUserId).where(sql`${table.claimedAt} IS NULL`)]);

export const shiftRewards = sqliteTable('shift_rewards', {
  shiftId: text('shift_id').primaryKey().references(() => workShifts.id),
  wageMinor: integer('wage_minor').notNull(),
  item: text('item').notNull(),
  quantity: integer('quantity').notNull(),
});
export const shiftSettlements = sqliteTable('shift_settlements', {
  shiftId: text('shift_id').primaryKey().references(() => workShifts.id),
  clerkUserId: text('clerk_user_id').notNull().references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  wageMinor: integer('wage_minor').notNull(),
  item: text('item').notNull(),
  quantity: integer('quantity').notNull(),
  settledAt: text('settled_at').notNull(),
});
export const capacityClocks = sqliteTable('capacity_clocks', {
  clerkUserId: text('clerk_user_id').primaryKey().references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  recoveredAt: integer('recovered_at').notNull(),
});
export const economyFunds = sqliteTable('economy_funds', {
  id: text('id').primaryKey(),
  initialMinor: integer('initial_minor').notNull(),
});

export const marketItems = sqliteTable('market_items', {
  item: text('item').primaryKey(),
  label: text('label').notNull(),
  buyMinor: integer('buy_minor').notNull(),
  sellMinor: integer('sell_minor').notNull(),
  initialStock: integer('initial_stock').notNull(),
});
export const starterFoodGrants = sqliteTable('starter_food_grants', {
  clerkUserId: text('clerk_user_id').primaryKey().references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
});
export const citizenEconomyEvents = sqliteTable('citizen_economy_events', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().references(() => citizens.clerkUserId, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  item: text('item').notNull(),
  quantityDelta: integer('quantity_delta').notNull(),
  walletDelta: integer('wallet_delta').notNull(),
  occurredAt: integer('occurred_at').notNull(),
  capacityApplied: integer('capacity_applied').notNull().default(0),
}, (table) => [index('idx_economy_events_user_item').on(table.clerkUserId, table.item)]);

export const playerListings = sqliteTable('player_listings', {
  id: text('id').primaryKey(),
  sellerId: text('seller_id').notNull().references(() => citizens.clerkUserId),
  item: text('item', { enum: ['food', 'materials', 'knowledge'] }).notNull(),
  quantity: integer('quantity').notNull(),
  unitMinor: integer('unit_minor').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('idx_player_listings_seller').on(table.sellerId, table.createdAt),
  check('player_listing_quantity', sql`typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 1 AND 10`),
  check('player_listing_price', sql`typeof(${table.unitMinor}) = 'integer' AND ${table.unitMinor} BETWEEN 1 AND 1000`),
  check('player_listing_item', sql`${table.item} IN ('food','materials','knowledge')`)]);
export const playerFills = sqliteTable('player_fills', {
  requestId: text('request_id').primaryKey(),
  listingId: text('listing_id').notNull().unique().references(() => playerListings.id),
  buyerId: text('buyer_id').notNull().references(() => citizens.clerkUserId),
  sellerId: text('seller_id').notNull().references(() => citizens.clerkUserId),
  item: text('item').notNull(),
  quantity: integer('quantity').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  filledAt: integer('filled_at').notNull(),
}, (table) => [
  check('player_fill_quantity', sql`typeof(${table.quantity}) = 'integer' AND ${table.quantity} BETWEEN 1 AND 10`),
  check('player_fill_amount', sql`typeof(${table.amountMinor}) = 'integer' AND ${table.amountMinor} BETWEEN 1 AND 10000`),
  check('player_fill_distinct_accounts', sql`${table.buyerId} != ${table.sellerId}`),
]);
export const playerCancellations = sqliteTable('player_cancellations', {
  requestId: text('request_id').primaryKey(),
  listingId: text('listing_id').notNull().unique().references(() => playerListings.id),
  sellerId: text('seller_id').notNull().references(() => citizens.clerkUserId),
  cancelledAt: integer('cancelled_at').notNull(),
});
export const governmentPetitions = sqliteTable('government_petitions', {
  requestId: text('request_id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().references(() => citizens.clerkUserId),
  nationId: text('nation_id').notNull(),
  topic: text('topic', { enum: ['food', 'infrastructure', 'work'] }).notNull(),
  periodStart: integer('period_start').notNull(),
  occurredAt: integer('occurred_at').notNull(),
}, (table) => [index('idx_government_petitions_nation_period').on(table.nationId,table.periodStart), uniqueIndex('idx_government_petitions_user_period').on(table.clerkUserId, table.periodStart),
  check('government_petition_topic', sql`${table.topic} IN ('food','infrastructure','work')`)]);
export const economyMigrations = sqliteTable('economy_migrations', {
  id: text('id').primaryKey(),
});

export const governmentReviews = sqliteTable('government_reviews', {
  nationId: text('nation_id').notNull(), periodStart: integer('period_start').notNull(),
  reviewedAt: integer('reviewed_at').notNull(), selectedTopic: text('selected_topic').notNull(),
  petitionCount: integer('petition_count').notNull(), snapshotJson: text('snapshot_json').notNull(),
}, (table) => [primaryKey({columns:[table.nationId,table.periodStart]}),
  check('government_review_topic', sql`${table.selectedTopic} IN ('food','infrastructure','work')`),
  check('government_review_count', sql`${table.petitionCount} >= 0`)]);
export const governmentPetitionResolutions = sqliteTable('government_petition_resolutions', {
  requestId: text('request_id').primaryKey().references(() => governmentPetitions.requestId),
  nationId: text('nation_id').notNull(), periodStart: integer('period_start').notNull(),
  status: text('status').notNull(),
}, (table) => [foreignKey({columns:[table.nationId,table.periodStart],foreignColumns:[governmentReviews.nationId,governmentReviews.periodStart]}), check('government_resolution_status', sql`${table.status} IN ('accepted','deferred')`)]);

export const squareHandles = sqliteTable('square_handles', {
  userId: text('user_id').primaryKey().references(() => citizens.clerkUserId),
  handle: text('handle').notNull().unique(),
});
export const squareMessages = sqliteTable('square_messages', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => citizens.clerkUserId),
  nationId: text('nation_id').notNull(), body: text('body').notNull(),
  postedAt: integer('posted_at').notNull(), deleted: integer('deleted').notNull().default(0),
}, table => [index('square_messages_scope').on(table.nationId,table.postedAt),
  index('square_messages_rate').on(table.userId,table.postedAt),
  check('square_message_length',sql`length(${table.body}) BETWEEN 1 AND 280`)]);
export const squarePresence = sqliteTable('square_presence', {
  userId: text('user_id').primaryKey().references(() => citizens.clerkUserId),
  nationId: text('nation_id').notNull(), expiresAt: integer('expires_at').notNull(),
});

// Additive receipts: legacy prototype petitions are preserved without Tier 1 claims.
export const governmentPetitionEligibility = sqliteTable('government_petition_eligibility', {
  requestId: text('request_id').primaryKey().references(() => governmentPetitions.requestId),
  clerkUserId: text('clerk_user_id').notNull().references(() => citizens.clerkUserId),
  checkedAt: integer('checked_at').notNull(),
});

export const worldClock = sqliteTable('world_clock', {
  id: text('id').primaryKey(), epochSeconds: integer('epoch_seconds').notNull(),
}, (t) => [check('world_clock_singleton', sql`${t.id}='main'`)]);
export const worldTicks = sqliteTable('world_ticks', {
  tick: integer('tick').primaryKey(), scheduledAt: integer('scheduled_at').notNull(),
  processedAt: integer('processed_at').notNull(), proposalsJson: text('proposals_json').notNull(),
}, (t) => [check('world_tick_positive', sql`${t.tick}>0`)]);
export const worldSupply = sqliteTable('world_supply', {
  id: text('id').primaryKey(), initialFood: integer('initial_food').notNull(), unitMinor: integer('unit_minor').notNull(),
}, (t) => [check('world_supply_food', sql`${t.initialFood}>=0`),check('world_supply_unit', sql`${t.unitMinor}>0`)]);
export const governmentPolicyExecutions = sqliteTable('government_policy_executions', {
  tick: integer('tick').primaryKey().references(()=>worldTicks.tick), nationId: text('nation_id').notNull(),
  topic: text('topic').notNull(), foodQuantity: integer('food_quantity').notNull(), spendMinor: integer('spend_minor').notNull(),
  scheduledAt: integer('scheduled_at').notNull(), executedAt: integer('executed_at').notNull(),
}, (t) => [check('policy_nation',sql`${t.nationId}='kindle'`),check('policy_topic',sql`${t.topic}='food'`),
  check('policy_quantity',sql`${t.foodQuantity} BETWEEN 1 AND 10`),check('policy_money',sql`${t.spendMinor}=${t.foodQuantity}*100`)]);

export const korundResources = sqliteTable('korund_resources', {id:text('id').primaryKey(),initialFood:integer('initial_food').notNull(),initialMinor:integer('initial_minor').notNull()},t=>[check('korund_food_positive',sql`${t.initialFood}>=0`),check('korund_fund_positive',sql`${t.initialMinor}>=0`)]);
export const korundWorkStarts = sqliteTable('korund_work_starts', {id:text('id').primaryKey().references(()=>workShifts.id),capacityApplied:integer('capacity_applied').notNull().default(0)},t=>[check('korund_start_capacity',sql`${t.capacityApplied} IN (0,1)`)]);
export const korundSettlements = sqliteTable('korund_settlements', {shiftId:text('shift_id').primaryKey().references(()=>workShifts.id),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),wageMinor:integer('wage_minor').notNull(),foodOutput:integer('food_output').notNull(),settledAt:integer('settled_at').notNull()},t=>[check('korund_wage',sql`${t.wageMinor}=800`),check('korund_output',sql`${t.foodOutput}=4`)]);
export const korundRations = sqliteTable('korund_rations', {id:text('id').primaryKey(),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),gameWeek:integer('game_week').notNull(),quantity:integer('quantity').notNull(),occurredAt:integer('occurred_at').notNull()},t=>[uniqueIndex('korund_coupon_user_week').on(t.clerkUserId,t.gameWeek),check('korund_ration_week',sql`${t.gameWeek}>=1`),check('korund_ration_quantity',sql`${t.quantity}=2`)]);
export const korundMeals = sqliteTable('korund_meals', {id:text('id').primaryKey(),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),quantity:integer('quantity').notNull(),occurredAt:integer('occurred_at').notNull(),capacityApplied:integer('capacity_applied').notNull().default(0)},t=>[check('korund_meal_quantity',sql`${t.quantity}=2`),check('korund_meal_capacity',sql`${t.capacityApplied} IN (0,1)`)]);

// Bounded Aurelle charter prototype: separate CRN receipts and finite estate resources.
export const aurelleResources = sqliteTable('aurelle_resources', {
  id:text('id').primaryKey(),initialFood:integer('initial_food').notNull(),initialMinor:integer('initial_minor').notNull(),
},t=>[check('aurelle_initial_food',sql`${t.initialFood}>=0`),check('aurelle_initial_funds',sql`${t.initialMinor}>=0`)]);
export const aurelleReceipts = sqliteTable('aurelle_receipts', {
  id:text('id').primaryKey(),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),
  action:text('action').notNull(),quantity:integer('quantity').notNull(),shiftId:text('shift_id'),
  occurredAt:integer('occurred_at').notNull(),capacityApplied:integer('capacity_applied').notNull().default(0),
},t=>[check('aurelle_receipt_action',sql`${t.action} IN ('aurelle-start-work','aurelle-claim-work','aurelle-buy-food','aurelle-household-meal')`),
  check('aurelle_receipt_quantity',sql`${t.quantity} BETWEEN 0 AND 2`),check('aurelle_receipt_capacity',sql`${t.capacityApplied} IN (0,1)`)]);
export const aurelleSettlements = sqliteTable('aurelle_settlements', {
  shiftId:text('shift_id').primaryKey().references(()=>workShifts.id),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),
  wageMinor:integer('wage_minor').notNull(),foodOutput:integer('food_output').notNull(),favor:integer('favor').notNull(),settledAt:integer('settled_at').notNull(),
},t=>[check('aurelle_settlement_wage',sql`${t.wageMinor}=800`),check('aurelle_settlement_food',sql`${t.foodOutput}=4`),check('aurelle_settlement_favor',sql`${t.favor}=2`)]);
export const aurellePurchases = sqliteTable('aurelle_purchases', {
  id:text('id').primaryKey().references(()=>aurelleReceipts.id),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),
  quantity:integer('quantity').notNull(),spendMinor:integer('spend_minor').notNull(),
},t=>[check('aurelle_purchase_quantity',sql`${t.quantity} IN (1,2)`),check('aurelle_purchase_price',sql`${t.spendMinor}=${t.quantity}*150`)]);
export const aurelleMeals = sqliteTable('aurelle_meals', {
  id:text('id').primaryKey().references(()=>aurelleReceipts.id),clerkUserId:text('clerk_user_id').notNull().references(()=>citizens.clerkUserId),
  quantity:integer('quantity').notNull(),occurredAt:integer('occurred_at').notNull(),
},t=>[check('aurelle_meal_quantity',sql`${t.quantity}=2`)]);

export const citizenCityLocations = sqliteTable('citizen_city_locations', {userId:text('user_id').primaryKey().references(()=>citizens.clerkUserId,{onDelete:'cascade'}),nationId:text('nation_id').notNull(),homeCityId:text('home_city_id').notNull(),currentCityId:text('current_city_id').notNull(),updatedAt:integer('updated_at').notNull()});
