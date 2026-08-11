CREATE TABLE `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watchlist_items_owner_added` ON `watchlist_items` (`owner_id`,`added_at`);
--> statement-breakpoint
PRAGMA optimize;
