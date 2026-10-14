CREATE TABLE "aurelle_resources" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"initial_food" BIGINT NOT NULL,
	"initial_minor" BIGINT NOT NULL,
	CONSTRAINT "aurelle_initial_food" CHECK("aurelle_resources"."initial_food">=0),
	CONSTRAINT "aurelle_initial_funds" CHECK("aurelle_resources"."initial_minor">=0)
);

CREATE TABLE civic_elections(id TEXT COLLATE "C" PRIMARY KEY,nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id='kindle'),candidates_json TEXT COLLATE "C" NOT NULL CHECK(harimu_compat.json_valid(candidates_json) AND jsonb_array_length((candidates_json)::jsonb)=3),opens_at BIGINT NOT NULL,closes_at BIGINT NOT NULL,closed_at BIGINT,result_json TEXT COLLATE "C",CHECK(closes_at=opens_at+259200),CHECK(closed_at IS NULL OR closed_at>=closes_at),CHECK(result_json IS NULL OR(closed_at IS NOT NULL AND harimu_compat.json_valid(result_json))));

CREATE TABLE economy_funds(
  id TEXT COLLATE "C" PRIMARY KEY, initial_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(initial_minor) = 'integer' AND initial_minor >= 0)
);

CREATE TABLE economy_migrations(id TEXT COLLATE "C" PRIMARY KEY);

CREATE TABLE government_reviews(
  nation_id TEXT COLLATE "C" NOT NULL, period_start BIGINT NOT NULL, reviewed_at BIGINT NOT NULL,
  selected_topic TEXT COLLATE "C" NOT NULL CHECK(selected_topic IN('food','infrastructure','work')),
  petition_count BIGINT NOT NULL CHECK(petition_count >= 0), snapshot_json TEXT COLLATE "C" NOT NULL,
  PRIMARY KEY(nation_id,period_start)
);

CREATE TABLE "korund_resources" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"initial_food" BIGINT NOT NULL,
	"initial_minor" BIGINT NOT NULL,
	CONSTRAINT "korund_food_positive" CHECK("korund_resources"."initial_food">=0),
	CONSTRAINT "korund_fund_positive" CHECK("korund_resources"."initial_minor">=0)
);

CREATE TABLE market_items(
  item TEXT COLLATE "C" PRIMARY KEY, label TEXT COLLATE "C" NOT NULL,
  buy_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(buy_minor) = 'integer' AND buy_minor > 0),
  sell_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(sell_minor) = 'integer' AND sell_minor > 0 AND sell_minor < buy_minor),
  initial_stock BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(initial_stock) = 'integer' AND initial_stock >= 0)
);

CREATE TABLE nations(
      id TEXT COLLATE "C" PRIMARY KEY NOT NULL,
      name TEXT COLLATE "C" NOT NULL,
      short_name TEXT COLLATE "C" NOT NULL,
      government TEXT COLLATE "C" NOT NULL,
      economy TEXT COLLATE "C" NOT NULL,
      currency TEXT COLLATE "C" NOT NULL,
      religion TEXT COLLATE "C" NOT NULL,
      capital TEXT COLLATE "C" NOT NULL,
      population TEXT COLLATE "C" NOT NULL,
      treasury TEXT COLLATE "C" NOT NULL,
      stability BIGINT NOT NULL,
      color TEXT COLLATE "C" NOT NULL,
      soft_color TEXT COLLATE "C" NOT NULL,
      motto TEXT COLLATE "C" NOT NULL,
      trade_status TEXT COLLATE "C" NOT NULL,
      position_x BIGINT NOT NULL,
      position_y BIGINT NOT NULL,
      sort_order BIGINT NOT NULL
    );

CREATE TABLE planning_tasks(
      id TEXT COLLATE "C" PRIMARY KEY NOT NULL,
      title TEXT COLLATE "C" NOT NULL,
      detail TEXT COLLATE "C" NOT NULL,
      meta TEXT COLLATE "C" NOT NULL,
      sort_order BIGINT NOT NULL
    );

CREATE TABLE weekly_addresses(id TEXT COLLATE "C" PRIMARY KEY,nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id IN('kindle','korund','aurelle')),week BIGINT NOT NULL CHECK(week>=0),scheduled_at BIGINT NOT NULL,published_at BIGINT NOT NULL,leader_name TEXT COLLATE "C" NOT NULL,office TEXT COLLATE "C" NOT NULL,title TEXT COLLATE "C" NOT NULL,transcript TEXT COLLATE "C" NOT NULL,provenance TEXT COLLATE "C" NOT NULL CHECK(provenance='authored-poc'),UNIQUE(nation_id,week),CHECK(published_at>=scheduled_at));

CREATE TABLE "world_clock" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"epoch_seconds" BIGINT NOT NULL,
	CONSTRAINT "world_clock_singleton" CHECK("world_clock"."id"='main')
);

CREATE TABLE world_events(
      id BIGSERIAL PRIMARY KEY NOT NULL,
      kind TEXT COLLATE "C" NOT NULL,
      headline TEXT COLLATE "C" NOT NULL,
      detail TEXT COLLATE "C" NOT NULL,
      location TEXT COLLATE "C",
      occurred_at TEXT COLLATE "C" NOT NULL,
      sort_order BIGINT NOT NULL
    );

CREATE TABLE "world_supply" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"initial_food" BIGINT NOT NULL,
	"unit_minor" BIGINT NOT NULL,
	CONSTRAINT "world_supply_food" CHECK("world_supply"."initial_food">=0),
	CONSTRAINT "world_supply_unit" CHECK("world_supply"."unit_minor">0)
);

CREATE TABLE "world_ticks" (
	"tick" BIGINT PRIMARY KEY NOT NULL,
	"scheduled_at" BIGINT NOT NULL,
	"processed_at" BIGINT NOT NULL,
	"proposals_json" TEXT COLLATE "C" NOT NULL,
	CONSTRAINT "world_tick_positive" CHECK("world_ticks"."tick">0)
);

CREATE TABLE citizens(
      clerk_user_id TEXT COLLATE "C" PRIMARY KEY NOT NULL,
      nation_id TEXT COLLATE "C" REFERENCES nations(id),
      nation_changes BIGINT DEFAULT 0 NOT NULL,
      display_name TEXT COLLATE "C",
      capacity BIGINT DEFAULT 18 NOT NULL,
      influence BIGINT DEFAULT 1240 NOT NULL,
      standing TEXT COLLATE "C" DEFAULT 'Good standing' NOT NULL,
      created_at TEXT COLLATE "C" NOT NULL,
      updated_at TEXT COLLATE "C" NOT NULL
    );

CREATE TABLE civic_anonymous_ballots(id TEXT COLLATE "C" PRIMARY KEY,election_id TEXT COLLATE "C" NOT NULL REFERENCES civic_elections(id),ranking_json TEXT COLLATE "C" NOT NULL CHECK(harimu_compat.json_valid(ranking_json) AND jsonb_array_length((ranking_json)::jsonb)=3),policy TEXT COLLATE "C" NOT NULL CHECK(policy='tier1-human-v1'));

CREATE TABLE "government_policy_executions" (
	"tick" BIGINT PRIMARY KEY NOT NULL,
	"nation_id" TEXT COLLATE "C" NOT NULL,
	"topic" TEXT COLLATE "C" NOT NULL,
	"food_quantity" BIGINT NOT NULL,
	"spend_minor" BIGINT NOT NULL,
	"scheduled_at" BIGINT NOT NULL,
	"executed_at" BIGINT NOT NULL,
	FOREIGN KEY("tick") REFERENCES "world_ticks"("tick") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "policy_nation" CHECK("government_policy_executions"."nation_id"='kindle'),
	CONSTRAINT "policy_topic" CHECK("government_policy_executions"."topic"='food'),
	CONSTRAINT "policy_quantity" CHECK("government_policy_executions"."food_quantity" BETWEEN 1 AND 10),
	CONSTRAINT "policy_money" CHECK("government_policy_executions"."spend_minor"="government_policy_executions"."food_quantity"*100)
);

CREATE TABLE planning_task_effects(
      task_id TEXT COLLATE "C" PRIMARY KEY NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
      capacity_delta BIGINT DEFAULT 0 NOT NULL,
      influence_delta BIGINT DEFAULT 0 NOT NULL,
      water_delta BIGINT DEFAULT 0 NOT NULL,
      stability_delta BIGINT DEFAULT 0 NOT NULL,
      outcome TEXT COLLATE "C" NOT NULL,
      infrastructure_id TEXT COLLATE "C" NOT NULL,
      household_member_id TEXT COLLATE "C" NOT NULL
    );

CREATE TABLE work_orders(
      id TEXT COLLATE "C" PRIMARY KEY NOT NULL,
      nation_id TEXT COLLATE "C" REFERENCES nations(id),
      name TEXT COLLATE "C" NOT NULL,
      detail TEXT COLLATE "C" NOT NULL,
      capacity_cost BIGINT NOT NULL,
      status TEXT COLLATE "C" DEFAULT 'open' NOT NULL,
      sort_order BIGINT NOT NULL
    );

CREATE TABLE address_reactions(request_id TEXT COLLATE "C" PRIMARY KEY,address_id TEXT COLLATE "C" NOT NULL REFERENCES weekly_addresses(id),user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),reaction TEXT COLLATE "C" NOT NULL CHECK(reaction IN('agree','disagree')),reacted_at BIGINT NOT NULL,UNIQUE(address_id,user_id));

CREATE TABLE "aurelle_receipts" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"action" TEXT COLLATE "C" NOT NULL,
	"quantity" BIGINT NOT NULL,
	"shift_id" TEXT COLLATE "C",
	"occurred_at" BIGINT NOT NULL,
	"capacity_applied" BIGINT DEFAULT 0 NOT NULL,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_receipt_action" CHECK("aurelle_receipts"."action" IN('aurelle-start-work','aurelle-claim-work','aurelle-buy-food','aurelle-household-meal')),
	CONSTRAINT "aurelle_receipt_quantity" CHECK("aurelle_receipts"."quantity" BETWEEN 0 AND 2),
	CONSTRAINT "aurelle_receipt_capacity" CHECK("aurelle_receipts"."capacity_applied" IN(0,1))
);

CREATE TABLE capacity_clocks(
  clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  recovered_at BIGINT NOT NULL
);

CREATE TABLE citizen_city_locations(
 user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL, home_city_id TEXT COLLATE "C" NOT NULL, current_city_id TEXT COLLATE "C" NOT NULL, updated_at BIGINT NOT NULL
);

CREATE TABLE citizen_decisions(
      clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      decision_id TEXT COLLATE "C" NOT NULL,
      task_id TEXT COLLATE "C" NOT NULL REFERENCES planning_tasks(id),
      infrastructure_id TEXT COLLATE "C" NOT NULL,
      household_member_id TEXT COLLATE "C" NOT NULL,
      capacity_delta BIGINT NOT NULL,
      influence_delta BIGINT NOT NULL,
      water_delta BIGINT NOT NULL,
      stability_delta BIGINT NOT NULL,
      outcome TEXT COLLATE "C" NOT NULL,
      committed_at TEXT COLLATE "C" NOT NULL,
      PRIMARY KEY(clerk_user_id, decision_id)
    );

CREATE TABLE citizen_economy_events(
  id TEXT COLLATE "C" PRIMARY KEY,
  clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  kind TEXT COLLATE "C" NOT NULL CHECK(kind IN('buy', 'sell', 'meal')),
  item TEXT COLLATE "C" NOT NULL,
  quantity_delta BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(quantity_delta) = 'integer'),
  wallet_delta BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wallet_delta) = 'integer'),
  occurred_at BIGINT NOT NULL,
  capacity_applied BIGINT NOT NULL DEFAULT 0 CHECK(capacity_applied IN(0, 1)),
  CHECK((kind = 'buy' AND quantity_delta BETWEEN 1 AND 10 AND wallet_delta < 0)
    OR(kind = 'sell' AND quantity_delta BETWEEN -10 AND -1 AND wallet_delta > 0)
    OR(kind = 'meal' AND item = 'food' AND quantity_delta = -2 AND wallet_delta = 0))
);

CREATE TABLE citizen_plan_items(
      clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      task_id TEXT COLLATE "C" NOT NULL REFERENCES planning_tasks(id),
      completed BIGINT DEFAULT 0 NOT NULL,
      updated_at TEXT COLLATE "C" NOT NULL,
      PRIMARY KEY(clerk_user_id, task_id)
    );

CREATE TABLE citizen_plans(
      clerk_user_id TEXT COLLATE "C" PRIMARY KEY NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      horizon TEXT COLLATE "C" DEFAULT 'week' NOT NULL,
      private_note TEXT COLLATE "C" DEFAULT '' NOT NULL,
      saved_at TEXT COLLATE "C" NOT NULL
    );

CREATE TABLE civic_human_activity(clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id),last_seen BIGINT NOT NULL,policy TEXT COLLATE "C" NOT NULL CHECK(policy='tier1-human-v1'));

CREATE TABLE civic_petitions(id TEXT COLLATE "C" PRIMARY KEY,creator_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),nation_id TEXT COLLATE "C" NOT NULL CHECK(nation_id='kindle'),title TEXT COLLATE "C" NOT NULL,demand TEXT COLLATE "C" NOT NULL,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL,weekly_humans BIGINT NOT NULL CHECK(weekly_humans>0),threshold BIGINT NOT NULL CHECK(threshold>0),reached_at BIGINT,response_text TEXT COLLATE "C",response_at BIGINT,CHECK(expires_at=created_at+604800),CHECK(reached_at IS NULL OR(reached_at>=created_at AND reached_at<expires_at)),CHECK((response_text IS NULL AND response_at IS NULL) OR(response_text IS NOT NULL AND response_at IS NOT NULL AND reached_at IS NOT NULL AND response_at>=reached_at)));

CREATE TABLE civic_voter_receipts(election_id TEXT COLLATE "C" NOT NULL REFERENCES civic_elections(id),clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),request_id TEXT COLLATE "C" NOT NULL UNIQUE,checked_at BIGINT NOT NULL,ballot_written BIGINT NOT NULL DEFAULT 0 CHECK(ballot_written IN(0,1)),policy TEXT COLLATE "C" NOT NULL CHECK(policy='tier1-human-v1'),PRIMARY KEY(election_id,clerk_user_id));

CREATE TABLE government_petitions(
  request_id TEXT COLLATE "C" PRIMARY KEY, clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
  nation_id TEXT COLLATE "C" NOT NULL, topic TEXT COLLATE "C" NOT NULL CHECK(topic IN('food','infrastructure','work')),
  period_start BIGINT NOT NULL, occurred_at BIGINT NOT NULL,
  UNIQUE(clerk_user_id, period_start)
);

CREATE TABLE "korund_meals" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"quantity" BIGINT NOT NULL,
	"occurred_at" BIGINT NOT NULL,
	"capacity_applied" BIGINT DEFAULT 0 NOT NULL,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_meal_quantity" CHECK("korund_meals"."quantity"=2),
	CONSTRAINT "korund_meal_capacity" CHECK("korund_meals"."capacity_applied" IN(0,1))
);

CREATE TABLE "korund_rations" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"game_week" BIGINT NOT NULL,
	"quantity" BIGINT NOT NULL,
	"occurred_at" BIGINT NOT NULL,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_ration_week" CHECK("korund_rations"."game_week">=1),
	CONSTRAINT "korund_ration_quantity" CHECK("korund_rations"."quantity"=2)
);

CREATE TABLE player_listings(
  id TEXT COLLATE "C" PRIMARY KEY, seller_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
  item TEXT COLLATE "C" NOT NULL CHECK(item IN('food','materials','knowledge')),
  quantity BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  unit_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(unit_minor) = 'integer' AND unit_minor BETWEEN 1 AND 1000),
  created_at BIGINT NOT NULL
);

CREATE TABLE square_handles(user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id), handle TEXT COLLATE "C" NOT NULL UNIQUE);

CREATE TABLE square_messages(id TEXT COLLATE "C" PRIMARY KEY, user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), nation_id TEXT COLLATE "C" NOT NULL, body TEXT COLLATE "C" NOT NULL CHECK(length(body) BETWEEN 1 AND 280), posted_at BIGINT NOT NULL, deleted BIGINT NOT NULL DEFAULT 0);

CREATE TABLE square_presence(user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id), nation_id TEXT COLLATE "C" NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE starter_food_grants(
  clerk_user_id TEXT COLLATE "C" PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  quantity BIGINT NOT NULL CHECK(quantity = 2)
);

CREATE TABLE work_contributions(
      id BIGSERIAL PRIMARY KEY NOT NULL,
      clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
      work_order_id TEXT COLLATE "C" NOT NULL REFERENCES work_orders(id),
      capacity_spent BIGINT NOT NULL,
      created_at TEXT COLLATE "C" NOT NULL
    );

CREATE TABLE work_shifts(
  id TEXT COLLATE "C" PRIMARY KEY NOT NULL,
  clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  work_order_id TEXT COLLATE "C" NOT NULL REFERENCES work_orders(id),
  order_name TEXT COLLATE "C" NOT NULL,
  output TEXT COLLATE "C" NOT NULL,
  capacity_spent BIGINT NOT NULL CHECK(capacity_spent > 0),
  started_at TEXT COLLATE "C" NOT NULL,
  completes_at TEXT COLLATE "C" NOT NULL,
  claimed_at TEXT COLLATE "C"
);

CREATE TABLE "aurelle_meals" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"quantity" BIGINT NOT NULL,
	"occurred_at" BIGINT NOT NULL,
	FOREIGN KEY("id") REFERENCES "aurelle_receipts"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_meal_quantity" CHECK("aurelle_meals"."quantity"=2)
);

CREATE TABLE "aurelle_purchases" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"quantity" BIGINT NOT NULL,
	"spend_minor" BIGINT NOT NULL,
	FOREIGN KEY("id") REFERENCES "aurelle_receipts"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_purchase_quantity" CHECK("aurelle_purchases"."quantity" IN(1,2)),
	CONSTRAINT "aurelle_purchase_price" CHECK("aurelle_purchases"."spend_minor"="aurelle_purchases"."quantity"*150)
);

CREATE TABLE "aurelle_settlements" (
	"shift_id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"wage_minor" BIGINT NOT NULL,
	"food_output" BIGINT NOT NULL,
	"favor" BIGINT NOT NULL,
	"settled_at" BIGINT NOT NULL,
	FOREIGN KEY("shift_id") REFERENCES "work_shifts"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_settlement_wage" CHECK("aurelle_settlements"."wage_minor"=800),
	CONSTRAINT "aurelle_settlement_food" CHECK("aurelle_settlements"."food_output"=4),
	CONSTRAINT "aurelle_settlement_favor" CHECK("aurelle_settlements"."favor"=2)
);

CREATE TABLE civic_petition_signatures(petition_id TEXT COLLATE "C" NOT NULL REFERENCES civic_petitions(id),clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),request_id TEXT COLLATE "C" NOT NULL UNIQUE,kind TEXT COLLATE "C" NOT NULL CHECK(kind IN('create','sign')),signed_at BIGINT NOT NULL,policy TEXT COLLATE "C" NOT NULL CHECK(policy='tier1-human-v1'),PRIMARY KEY(petition_id,clerk_user_id));

CREATE TABLE government_petition_eligibility(
  request_id TEXT COLLATE "C" PRIMARY KEY REFERENCES government_petitions(request_id),
  clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), checked_at BIGINT NOT NULL
);

CREATE TABLE government_petition_resolutions(
  request_id TEXT COLLATE "C" PRIMARY KEY REFERENCES government_petitions(request_id),
  nation_id TEXT COLLATE "C" NOT NULL, period_start BIGINT NOT NULL,
  status TEXT COLLATE "C" NOT NULL CHECK(status IN('accepted','deferred')),
  FOREIGN KEY(nation_id,period_start) REFERENCES government_reviews(nation_id,period_start)
);

CREATE TABLE "korund_settlements" (
	"shift_id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"clerk_user_id" TEXT COLLATE "C" NOT NULL,
	"wage_minor" BIGINT NOT NULL,
	"food_output" BIGINT NOT NULL,
	"settled_at" BIGINT NOT NULL,
	FOREIGN KEY("shift_id") REFERENCES "work_shifts"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY("clerk_user_id") REFERENCES "citizens"("clerk_user_id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_wage" CHECK("korund_settlements"."wage_minor"=800),
	CONSTRAINT "korund_output" CHECK("korund_settlements"."food_output"=4)
);

CREATE TABLE "korund_work_starts" (
	"id" TEXT COLLATE "C" PRIMARY KEY NOT NULL,
	"capacity_applied" BIGINT DEFAULT 0 NOT NULL,
	FOREIGN KEY("id") REFERENCES "work_shifts"("id") ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_start_capacity" CHECK("korund_work_starts"."capacity_applied" IN(0,1))
);

CREATE TABLE player_cancellations(
  request_id TEXT COLLATE "C" PRIMARY KEY, listing_id TEXT COLLATE "C" NOT NULL UNIQUE REFERENCES player_listings(id),
  seller_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), cancelled_at BIGINT NOT NULL
);

CREATE TABLE player_fills(
  request_id TEXT COLLATE "C" PRIMARY KEY, listing_id TEXT COLLATE "C" NOT NULL UNIQUE REFERENCES player_listings(id),
  buyer_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
  seller_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), item TEXT COLLATE "C" NOT NULL,
  quantity BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  amount_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(amount_minor) = 'integer' AND amount_minor BETWEEN 1 AND 10000),
  filled_at BIGINT NOT NULL, CHECK(buyer_id != seller_id)
);

CREATE TABLE shift_rewards(
  shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
  wage_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wage_minor) = 'integer' AND wage_minor >= 0),
  item TEXT COLLATE "C" NOT NULL,
  quantity BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(quantity) = 'integer' AND quantity >= 0)
);

CREATE TABLE shift_settlements(
  shift_id TEXT COLLATE "C" PRIMARY KEY REFERENCES work_shifts(id),
  clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  wage_minor BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(wage_minor) = 'integer' AND wage_minor >= 0),
  item TEXT COLLATE "C" NOT NULL,
  quantity BIGINT NOT NULL CHECK(harimu_compat.sqlite_typeof(quantity) = 'integer' AND quantity >= 0),
  settled_at TEXT COLLATE "C" NOT NULL
);

CREATE INDEX idx_anonymous_ballots_election ON civic_anonymous_ballots(election_id);

CREATE INDEX idx_citizen_decisions_user_committed ON citizen_decisions(clerk_user_id, committed_at);

CREATE INDEX idx_civic_petitions_created ON civic_petitions(created_at);

CREATE INDEX idx_economy_events_user_item ON citizen_economy_events(clerk_user_id, item);

CREATE INDEX idx_government_petitions_nation_period ON government_petitions(nation_id, period_start);

CREATE UNIQUE INDEX idx_one_active_shift
  ON work_shifts(clerk_user_id) WHERE claimed_at IS NULL;

CREATE INDEX idx_player_listings_seller ON player_listings(seller_id, created_at);

CREATE INDEX idx_work_contributions_user_created ON work_contributions(clerk_user_id, created_at);

CREATE INDEX idx_work_orders_nation_status ON work_orders(nation_id, status);

CREATE INDEX idx_world_events_sort_order ON world_events(sort_order);

CREATE UNIQUE INDEX "korund_coupon_user_week" ON "korund_rations" ("clerk_user_id","game_week");

CREATE INDEX square_messages_rate ON square_messages(user_id, posted_at);

CREATE INDEX square_messages_scope ON square_messages(nation_id, posted_at);

CREATE VIEW citizen_wallet_balances AS
  SELECT c.clerk_user_id,
    COALESCE((SELECT SUM(wage_minor) FROM shift_settlements WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events WHERE clerk_user_id = c.clerk_user_id), 0)
    + COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE seller_id = c.clerk_user_id), 0)
    - COALESCE((SELECT SUM(amount_minor) FROM player_fills WHERE buyer_id = c.clerk_user_id), 0) AS balance
  FROM citizens c;

CREATE VIEW merchant_cash_balance AS
  SELECT initial_minor - COALESCE((SELECT SUM(wallet_delta) FROM citizen_economy_events), 0) AS balance
  FROM economy_funds WHERE id = 'kindle-merchant';

CREATE VIEW merchant_inventory_balances AS
  SELECT m.*, m.initial_stock + CASE WHEN m.item='food' THEN COALESCE((SELECT SUM(food_quantity) FROM government_policy_executions),0) ELSE 0 END - COALESCE((SELECT SUM(quantity_delta)
    FROM citizen_economy_events WHERE item = m.item AND kind IN('buy','sell')), 0) AS stock
  FROM market_items m;

CREATE VIEW player_open_lots AS
  SELECT l.* FROM player_listings l WHERE NOT EXISTS(SELECT 1 FROM player_fills WHERE listing_id = l.id)
    AND NOT EXISTS(SELECT 1 FROM player_cancellations WHERE listing_id = l.id);

CREATE VIEW player_request_receipts AS
  SELECT id AS request_id, seller_id AS user_id, 'create-listing' AS action, id AS listing_id FROM player_listings
  UNION ALL SELECT request_id, buyer_id AS user_id, 'buy-listing' AS action, listing_id FROM player_fills
  UNION ALL SELECT request_id, seller_id AS user_id, 'cancel-listing' AS action, listing_id FROM player_cancellations;

CREATE VIEW citizen_inventory_balances AS
  SELECT c.clerk_user_id, c.item,
    COALESCE((SELECT SUM(quantity) FROM shift_settlements WHERE clerk_user_id=c.clerk_user_id AND item=c.item),0)
    + COALESCE((SELECT SUM(quantity_delta) FROM citizen_economy_events WHERE clerk_user_id=c.clerk_user_id AND item=c.item),0)
    + CASE WHEN c.item='food' THEN COALESCE((SELECT quantity FROM starter_food_grants WHERE clerk_user_id=c.clerk_user_id),0) ELSE 0 END
    - COALESCE((SELECT SUM(quantity) FROM player_open_lots WHERE seller_id=c.clerk_user_id AND item=c.item),0)
    - COALESCE((SELECT SUM(quantity) FROM player_fills WHERE seller_id=c.clerk_user_id AND item=c.item),0)
    + COALESCE((SELECT SUM(quantity) FROM player_fills WHERE buyer_id=c.clerk_user_id AND item=c.item),0) AS quantity
  FROM(
    SELECT clerk_user_id,item FROM shift_settlements
    UNION SELECT clerk_user_id,item FROM citizen_economy_events
    UNION SELECT clerk_user_id,'food' AS item FROM starter_food_grants
    UNION SELECT buyer_id AS clerk_user_id,item FROM player_fills
  ) c;
