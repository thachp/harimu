CREATE TABLE `citizen_decisions` (
	`clerk_user_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`task_id` text NOT NULL,
	`infrastructure_id` text NOT NULL,
	`household_member_id` text NOT NULL,
	`capacity_delta` integer NOT NULL,
	`influence_delta` integer NOT NULL,
	`water_delta` integer NOT NULL,
	`stability_delta` integer NOT NULL,
	`outcome` text NOT NULL,
	`committed_at` text NOT NULL,
	PRIMARY KEY(`clerk_user_id`, `decision_id`),
	FOREIGN KEY (`clerk_user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `planning_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_citizen_decisions_user_committed` ON `citizen_decisions` (`clerk_user_id`,`committed_at`);--> statement-breakpoint
CREATE TABLE `planning_task_effects` (
	`task_id` text PRIMARY KEY NOT NULL,
	`capacity_delta` integer DEFAULT 0 NOT NULL,
	`influence_delta` integer DEFAULT 0 NOT NULL,
	`water_delta` integer DEFAULT 0 NOT NULL,
	`stability_delta` integer DEFAULT 0 NOT NULL,
	`outcome` text NOT NULL,
	`infrastructure_id` text NOT NULL,
	`household_member_id` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `planning_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
