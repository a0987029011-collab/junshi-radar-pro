CREATE TABLE `signal_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`market` text NOT NULL,
	`sector` text NOT NULL,
	`signal_date` text NOT NULL,
	`signal_name` text NOT NULL,
	`signal_kind` text NOT NULL,
	`breakout_type` text,
	`macd_signal_mode` text,
	`entry_price` real NOT NULL,
	`line_price` real NOT NULL,
	`snapshot` text NOT NULL,
	`outcomes` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_signal_observations_owner_date` ON `signal_observations` (`owner_id`,`signal_date`);--> statement-breakpoint
CREATE INDEX `idx_signal_observations_owner_status_date` ON `signal_observations` (`owner_id`,`status`,`signal_date`);--> statement-breakpoint
CREATE TABLE `signal_research_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`snapshot_generated_at` text NOT NULL,
	`next_profile_index` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`observation_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_signal_research_syncs_owner_snapshot` ON `signal_research_syncs` (`owner_id`,`snapshot_generated_at`);
--> statement-breakpoint
PRAGMA optimize;
