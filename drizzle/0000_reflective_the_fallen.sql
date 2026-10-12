CREATE TABLE `citizen_plan_items` (
	`clerk_user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`clerk_user_id`, `task_id`),
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `planning_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `citizen_plans` (
	`clerk_user_id` text PRIMARY KEY NOT NULL,
	`horizon` text DEFAULT 'week' NOT NULL,
	`private_note` text DEFAULT '' NOT NULL,
	`saved_at` text NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `citizens` (
	`clerk_user_id` text PRIMARY KEY NOT NULL,
	`nation_id` text,
	`display_name` text,
	`capacity` integer DEFAULT 18 NOT NULL,
	`influence` integer DEFAULT 1240 NOT NULL,
	`standing` text DEFAULT 'Good standing' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`nation_id`) REFERENCES `nations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`affinity` text NOT NULL,
	`government` text NOT NULL,
	`economy` text NOT NULL,
	`capital` text NOT NULL,
	`population` text NOT NULL,
	`treasury` text NOT NULL,
	`stability` integer NOT NULL,
	`color` text NOT NULL,
	`soft_color` text NOT NULL,
	`motto` text NOT NULL,
	`trade_status` text NOT NULL,
	`position_x` integer NOT NULL,
	`position_y` integer NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `planning_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`meta` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clerk_user_id` text NOT NULL,
	`work_order_id` text NOT NULL,
	`capacity_spent` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_contributions_user_created` ON `work_contributions` (`clerk_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`nation_id` text,
	`name` text NOT NULL,
	`detail` text NOT NULL,
	`capacity_cost` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`nation_id`) REFERENCES `nations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_orders_nation_status` ON `work_orders` (`nation_id`,`status`);--> statement-breakpoint
CREATE TABLE `world_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`headline` text NOT NULL,
	`detail` text NOT NULL,
	`location` text,
	`occurred_at` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_world_events_sort_order` ON `world_events` (`sort_order`);