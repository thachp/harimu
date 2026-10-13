CREATE TABLE `korund_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`capacity_applied` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_meal_quantity" CHECK("korund_meals"."quantity"=2),
	CONSTRAINT "korund_meal_capacity" CHECK("korund_meals"."capacity_applied" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `korund_rations` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`game_week` integer NOT NULL,
	`quantity` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_ration_week" CHECK("korund_rations"."game_week">=1),
	CONSTRAINT "korund_ration_quantity" CHECK("korund_rations"."quantity"=2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `korund_coupon_user_week` ON `korund_rations` (`clerk_user_id`,`game_week`);--> statement-breakpoint
CREATE TABLE `korund_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`initial_food` integer NOT NULL,
	`initial_minor` integer NOT NULL,
	CONSTRAINT "korund_food_positive" CHECK("korund_resources"."initial_food">=0),
	CONSTRAINT "korund_fund_positive" CHECK("korund_resources"."initial_minor">=0)
);
--> statement-breakpoint
CREATE TABLE `korund_settlements` (
	`shift_id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`wage_minor` integer NOT NULL,
	`food_output` integer NOT NULL,
	`settled_at` integer NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_wage" CHECK("korund_settlements"."wage_minor"=800),
	CONSTRAINT "korund_output" CHECK("korund_settlements"."food_output"=4)
);
--> statement-breakpoint
CREATE TABLE `korund_work_starts` (
	`id` text PRIMARY KEY NOT NULL,
	`capacity_applied` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "korund_start_capacity" CHECK("korund_work_starts"."capacity_applied" IN (0,1))
);
