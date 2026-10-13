CREATE TABLE `government_policy_executions` (
	`tick` integer PRIMARY KEY NOT NULL,
	`nation_id` text NOT NULL,
	`topic` text NOT NULL,
	`food_quantity` integer NOT NULL,
	`spend_minor` integer NOT NULL,
	`scheduled_at` integer NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`tick`) REFERENCES `world_ticks`(`tick`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "policy_nation" CHECK("government_policy_executions"."nation_id"='kindle'),
	CONSTRAINT "policy_topic" CHECK("government_policy_executions"."topic"='food'),
	CONSTRAINT "policy_quantity" CHECK("government_policy_executions"."food_quantity" BETWEEN 1 AND 10),
	CONSTRAINT "policy_money" CHECK("government_policy_executions"."spend_minor"="government_policy_executions"."food_quantity"*100)
);
--> statement-breakpoint
CREATE TABLE `world_clock` (
	`id` text PRIMARY KEY NOT NULL,
	`epoch_seconds` integer NOT NULL,
	CONSTRAINT "world_clock_singleton" CHECK("world_clock"."id"='main')
);
--> statement-breakpoint
CREATE TABLE `world_supply` (
	`id` text PRIMARY KEY NOT NULL,
	`initial_food` integer NOT NULL,
	`unit_minor` integer NOT NULL,
	CONSTRAINT "world_supply_food" CHECK("world_supply"."initial_food">=0),
	CONSTRAINT "world_supply_unit" CHECK("world_supply"."unit_minor">0)
);
--> statement-breakpoint
CREATE TABLE `world_ticks` (
	`tick` integer PRIMARY KEY NOT NULL,
	`scheduled_at` integer NOT NULL,
	`processed_at` integer NOT NULL,
	`proposals_json` text NOT NULL,
	CONSTRAINT "world_tick_positive" CHECK("world_ticks"."tick">0)
);
