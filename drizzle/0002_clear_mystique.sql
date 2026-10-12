ALTER TABLE `nations` ADD `currency` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `nations` ADD `religion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `nations` DROP COLUMN `affinity`;
