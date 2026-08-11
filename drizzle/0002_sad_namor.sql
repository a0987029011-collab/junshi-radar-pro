ALTER TABLE `position_transactions` ADD `market_snapshot` text;--> statement-breakpoint
ALTER TABLE `position_transactions` ADD `average_entry_price` real;--> statement-breakpoint
ALTER TABLE `position_transactions` ADD `realized_return_percent` real;