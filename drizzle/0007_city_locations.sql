CREATE TABLE IF NOT EXISTS `citizen_city_locations` (
	`user_id` text PRIMARY KEY NOT NULL,
	`nation_id` text NOT NULL,
	`home_city_id` text NOT NULL,
	`current_city_id` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `citizens`(`clerk_user_id`) ON UPDATE no action ON DELETE cascade
);
