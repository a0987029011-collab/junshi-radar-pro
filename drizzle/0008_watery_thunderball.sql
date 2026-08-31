CREATE TABLE `paper_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`starting_cash` real NOT NULL,
	`cash` real NOT NULL,
	`strategy_version` text NOT NULL,
	`last_processed_date` text,
	`maximum_equity` real NOT NULL,
	`maximum_drawdown_percent` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paper_daily_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`market_date` text NOT NULL,
	`action_summary` text NOT NULL,
	`candidates_evaluated` integer NOT NULL,
	`selected_order_ids` text NOT NULL,
	`notes` text NOT NULL,
	`cash` real NOT NULL,
	`equity` real NOT NULL,
	`open_positions` integer NOT NULL,
	`queued_orders` integer NOT NULL,
	`strategy_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_decisions_account_date` ON `paper_daily_decisions` (`account_id`,`market_date`);--> statement-breakpoint
CREATE TABLE `paper_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`observation_key` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`sector` text NOT NULL,
	`signal_date` text NOT NULL,
	`status` text NOT NULL,
	`selection_score` integer NOT NULL,
	`selection_reasons` text NOT NULL,
	`strategy_version` text NOT NULL,
	`signal_close` real NOT NULL,
	`line_price` real NOT NULL,
	`filled_trade_id` text,
	`skipped_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_orders_account_observation` ON `paper_orders` (`account_id`,`observation_key`);--> statement-breakpoint
CREATE INDEX `idx_paper_orders_account_status_date` ON `paper_orders` (`account_id`,`status`,`signal_date`);--> statement-breakpoint
CREATE TABLE `paper_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`order_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`sector` text NOT NULL,
	`signal_date` text NOT NULL,
	`entry_date` text NOT NULL,
	`entry_price` real NOT NULL,
	`shares` integer NOT NULL,
	`entry_commission` real NOT NULL,
	`total_cost` real NOT NULL,
	`stop_price` real NOT NULL,
	`target_price` real NOT NULL,
	`target_net_return_percent` real NOT NULL,
	`status` text NOT NULL,
	`exit_date` text,
	`exit_price` real,
	`exit_commission` real,
	`transaction_tax` real,
	`net_sale_proceeds` real,
	`exit_reason` text,
	`queued_exit_reason` text,
	`queued_exit_signal_date` text,
	`realized_profit` real,
	`realized_return_percent` real,
	`holding_days` integer NOT NULL,
	`maximum_favorable_percent` real NOT NULL,
	`maximum_adverse_percent` real NOT NULL,
	`selection_score` integer NOT NULL,
	`selection_reasons` text NOT NULL,
	`strategy_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paper_trades_account_order` ON `paper_trades` (`account_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `idx_paper_trades_account_status_entry` ON `paper_trades` (`account_id`,`status`,`entry_date`);
--> statement-breakpoint
PRAGMA optimize;
