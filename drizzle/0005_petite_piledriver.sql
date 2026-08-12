CREATE INDEX `idx_trendline_waves_owner_stock_view` ON `trendline_corrections` (`owner_id`,`symbol`,`timeframe`,`adjustment`,`h1_date`);
--> statement-breakpoint
INSERT OR IGNORE INTO `trendline_corrections` (
  `id`,
  `owner_id`,
  `symbol`,
  `timeframe`,
  `adjustment`,
  `h1_date`,
  `h1_price`,
  `h2_date`,
  `h2_price`,
  `original_h1_date`,
  `original_h1_price`,
  `original_h2_date`,
  `original_h2_price`,
  `reason`,
  `notes`,
  `submitted_for_learning`,
  `created_at`,
  `updated_at`
)
SELECT
  `owner_id` || ':2637:month:adjusted:wave-2022-05-2023-10',
  `owner_id`,
  '2637',
  'month',
  'adjusted',
  '2022-05',
  78.26383326895795,
  '2023-10',
  42.34634176036708,
  NULL,
  NULL,
  NULL,
  NULL,
  'H2 應接觸另一根 K 棒',
  '第一波學習案例；2023-11 突破低點 35.17 未破，後續第二波不可覆蓋此結構。',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM `trendline_corrections`
WHERE
  `symbol` = '2637'
  AND `timeframe` = 'month'
  AND `adjustment` = 'adjusted'
  AND `h1_date` = '2025-03'
  AND `h2_date` = '2025-06';
--> statement-breakpoint
PRAGMA optimize;
