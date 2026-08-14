CREATE TABLE `closed_position_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`case_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text NOT NULL,
	`holding_days` integer NOT NULL,
	`total_shares` integer NOT NULL,
	`transaction_count` integer NOT NULL,
	`average_entry_price` real NOT NULL,
	`average_exit_price` real NOT NULL,
	`total_cost_with_fees` real NOT NULL,
	`net_sale_proceeds` real NOT NULL,
	`realized_profit` real NOT NULL,
	`realized_return_percent` real NOT NULL,
	`target_return_percent` real DEFAULT 10 NOT NULL,
	`target_reached` integer DEFAULT false NOT NULL,
	`entry_snapshot` text,
	`exit_snapshot` text,
	`transactions` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_closed_position_cases_owner_closed` ON `closed_position_cases` (`owner_id`,`closed_at`);--> statement-breakpoint
CREATE INDEX `idx_closed_position_cases_owner_target_closed` ON `closed_position_cases` (`owner_id`,`target_reached`,`closed_at`);
--> statement-breakpoint
PRAGMA optimize;
