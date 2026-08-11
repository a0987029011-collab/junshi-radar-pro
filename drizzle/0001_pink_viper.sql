CREATE TABLE `position_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`shares` integer NOT NULL,
	`price` real NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_position_transactions_owner_symbol_created` ON `position_transactions` (`owner_id`,`symbol`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
