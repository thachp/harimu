CREATE TABLE IF NOT EXISTS `aurelle_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `aurelle_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_meal_quantity" CHECK("aurelle_meals"."quantity"=2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurelle_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`spend_minor` integer NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `aurelle_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_purchase_quantity" CHECK("aurelle_purchases"."quantity" IN (1,2)),
	CONSTRAINT "aurelle_purchase_price" CHECK("aurelle_purchases"."spend_minor"="aurelle_purchases"."quantity"*150)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurelle_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`action` text NOT NULL,
	`quantity` integer NOT NULL,
	`shift_id` text,
	`occurred_at` integer NOT NULL,
	`capacity_applied` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_receipt_action" CHECK("aurelle_receipts"."action" IN ('aurelle-start-work','aurelle-claim-work','aurelle-buy-food','aurelle-household-meal')),
	CONSTRAINT "aurelle_receipt_quantity" CHECK("aurelle_receipts"."quantity" BETWEEN 0 AND 2),
	CONSTRAINT "aurelle_receipt_capacity" CHECK("aurelle_receipts"."capacity_applied" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurelle_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`initial_food` integer NOT NULL,
	`initial_minor` integer NOT NULL,
	CONSTRAINT "aurelle_initial_food" CHECK("aurelle_resources"."initial_food">=0),
	CONSTRAINT "aurelle_initial_funds" CHECK("aurelle_resources"."initial_minor">=0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurelle_settlements` (
	`shift_id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`wage_minor` integer NOT NULL,
	`food_output` integer NOT NULL,
	`favor` integer NOT NULL,
	`settled_at` integer NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "aurelle_settlement_wage" CHECK("aurelle_settlements"."wage_minor"=800),
	CONSTRAINT "aurelle_settlement_food" CHECK("aurelle_settlements"."food_output"=4),
	CONSTRAINT "aurelle_settlement_favor" CHECK("aurelle_settlements"."favor"=2)
);

--> statement-breakpoint
INSERT OR IGNORE INTO aurelle_resources(id,initial_food,initial_minor) VALUES ('estate',40,100000);
