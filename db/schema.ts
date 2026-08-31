import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { PositionMarketSnapshot } from "../lib/position-market-snapshot";
import type {
  ClosedPositionCase,
  PositionTransaction,
} from "../lib/position-transactions";
import type {
  SignalResearchObservation,
  SignalOutcomeSnapshot,
  TimeframeResearchSnapshot,
} from "../lib/signal-research";
import type {
  PaperExitReason,
  PaperOrderStatus,
  PaperTradeStatus,
} from "../lib/paper-trading";

export const paperAccounts = sqliteTable("paper_accounts", {
  id: text("id").primaryKey(),
  startingCash: real("starting_cash").notNull(),
  cash: real("cash").notNull(),
  strategyVersion: text("strategy_version").notNull(),
  lastProcessedDate: text("last_processed_date"),
  maximumEquity: real("maximum_equity").notNull(),
  maximumDrawdownPercent: real("maximum_drawdown_percent").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const paperOrders = sqliteTable(
  "paper_orders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    observationKey: text("observation_key").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    sector: text("sector").notNull(),
    signalDate: text("signal_date").notNull(),
    status: text("status").$type<PaperOrderStatus>().notNull(),
    selectionScore: integer("selection_score").notNull(),
    selectionReasons: text("selection_reasons", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    strategyVersion: text("strategy_version").notNull(),
    signalClose: real("signal_close").notNull(),
    linePrice: real("line_price").notNull(),
    filledTradeId: text("filled_trade_id"),
    skippedReason: text("skipped_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_paper_orders_account_observation").on(
      table.accountId,
      table.observationKey,
    ),
    index("idx_paper_orders_account_status_date").on(
      table.accountId,
      table.status,
      table.signalDate,
    ),
  ],
);

export const paperTrades = sqliteTable(
  "paper_trades",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    orderId: text("order_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    sector: text("sector").notNull(),
    signalDate: text("signal_date").notNull(),
    entryDate: text("entry_date").notNull(),
    entryPrice: real("entry_price").notNull(),
    shares: integer("shares").notNull(),
    entryCommission: real("entry_commission").notNull(),
    totalCost: real("total_cost").notNull(),
    stopPrice: real("stop_price").notNull(),
    targetPrice: real("target_price").notNull(),
    targetNetReturnPercent: real("target_net_return_percent").notNull(),
    status: text("status").$type<PaperTradeStatus>().notNull(),
    exitDate: text("exit_date"),
    exitPrice: real("exit_price"),
    exitCommission: real("exit_commission"),
    transactionTax: real("transaction_tax"),
    netSaleProceeds: real("net_sale_proceeds"),
    exitReason: text("exit_reason").$type<PaperExitReason>(),
    queuedExitReason: text("queued_exit_reason").$type<PaperExitReason>(),
    queuedExitSignalDate: text("queued_exit_signal_date"),
    realizedProfit: real("realized_profit"),
    realizedReturnPercent: real("realized_return_percent"),
    holdingDays: integer("holding_days").notNull(),
    maximumFavorablePercent: real("maximum_favorable_percent").notNull(),
    maximumAdversePercent: real("maximum_adverse_percent").notNull(),
    selectionScore: integer("selection_score").notNull(),
    selectionReasons: text("selection_reasons", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    strategyVersion: text("strategy_version").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_paper_trades_account_order").on(
      table.accountId,
      table.orderId,
    ),
    index("idx_paper_trades_account_status_entry").on(
      table.accountId,
      table.status,
      table.entryDate,
    ),
  ],
);

export const paperDailyDecisions = sqliteTable(
  "paper_daily_decisions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    marketDate: text("market_date").notNull(),
    actionSummary: text("action_summary").notNull(),
    candidatesEvaluated: integer("candidates_evaluated").notNull(),
    selectedOrderIds: text("selected_order_ids", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    notes: text("notes", { mode: "json" }).$type<string[]>().notNull(),
    cash: real("cash").notNull(),
    equity: real("equity").notNull(),
    openPositions: integer("open_positions").notNull(),
    queuedOrders: integer("queued_orders").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_paper_decisions_account_date").on(
      table.accountId,
      table.marketDate,
    ),
  ],
);

export const trendlineCorrections = sqliteTable(
  "trendline_corrections",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    adjustment: text("adjustment").notNull(),
    h1Date: text("h1_date").notNull(),
    h1Price: real("h1_price").notNull(),
    h2Date: text("h2_date").notNull(),
    h2Price: real("h2_price").notNull(),
    originalH1Date: text("original_h1_date"),
    originalH1Price: real("original_h1_price"),
    originalH2Date: text("original_h2_date"),
    originalH2Price: real("original_h2_price"),
    reason: text("reason").notNull(),
    notes: text("notes").notNull().default(""),
    submittedForLearning: integer("submitted_for_learning", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_trendline_waves_owner_stock_view").on(
      table.ownerId,
      table.symbol,
      table.timeframe,
      table.adjustment,
      table.h1Date,
    ),
  ],
);

export const positionTransactions = sqliteTable(
  "position_transactions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    shares: integer("shares").notNull(),
    price: real("price").notNull(),
    occurredAt: text("occurred_at").notNull(),
    marketSnapshot: text("market_snapshot", { mode: "json" }).$type<
      PositionMarketSnapshot | null
    >(),
    averageEntryPrice: real("average_entry_price"),
    realizedReturnPercent: real("realized_return_percent"),
    commissionDiscount: real("commission_discount"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_position_transactions_owner_symbol_created").on(
      table.ownerId,
      table.symbol,
      table.createdAt
    )
  ]
);

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`)
  },
  (table) => [
    index("idx_watchlist_items_owner_added").on(table.ownerId, table.addedAt)
  ]
);

export const closedPositionCases = sqliteTable(
  "closed_position_cases",
  {
    id: text("id").primaryKey(),
    caseKey: text("case_key").notNull(),
    ownerId: text("owner_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at").notNull(),
    holdingDays: integer("holding_days").notNull(),
    totalShares: integer("total_shares").notNull(),
    transactionCount: integer("transaction_count").notNull(),
    averageEntryPrice: real("average_entry_price").notNull(),
    averageExitPrice: real("average_exit_price").notNull(),
    totalCostWithFees: real("total_cost_with_fees").notNull(),
    netSaleProceeds: real("net_sale_proceeds").notNull(),
    realizedProfit: real("realized_profit").notNull(),
    realizedReturnPercent: real("realized_return_percent").notNull(),
    targetReturnPercent: real("target_return_percent").notNull().default(10),
    targetReached: integer("target_reached", { mode: "boolean" })
      .notNull()
      .default(false),
    entrySnapshot: text("entry_snapshot", { mode: "json" }).$type<
      PositionMarketSnapshot | null
    >(),
    exitSnapshot: text("exit_snapshot", { mode: "json" }).$type<
      PositionMarketSnapshot | null
    >(),
    transactions: text("transactions", { mode: "json" }).$type<
      PositionTransaction[]
    >().notNull(),
    createdAt: text("created_at").$type<ClosedPositionCase["createdAt"]>().notNull(),
  },
  (table) => [
    index("idx_closed_position_cases_owner_closed").on(
      table.ownerId,
      table.closedAt
    ),
    index("idx_closed_position_cases_owner_target_closed").on(
      table.ownerId,
      table.targetReached,
      table.closedAt
    ),
  ]
);

export const signalObservations = sqliteTable(
  "signal_observations",
  {
    id: text("id").primaryKey(),
    observationKey: text("observation_key").notNull(),
    ownerId: text("owner_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    market: text("market").notNull(),
    sector: text("sector").notNull(),
    signalDate: text("signal_date").notNull(),
    signalName: text("signal_name").notNull(),
    signalKind: text("signal_kind").notNull(),
    breakoutType: text("breakout_type"),
    macdSignalMode: text("macd_signal_mode"),
    entryPrice: real("entry_price").notNull(),
    linePrice: real("line_price").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<{
      month: TimeframeResearchSnapshot | null;
      week: TimeframeResearchSnapshot | null;
      day: TimeframeResearchSnapshot | null;
    }>().notNull(),
    outcomes: text("outcomes", { mode: "json" }).$type<
      Record<5 | 20 | 60, SignalOutcomeSnapshot>
    >().notNull(),
    status: text("status").$type<SignalResearchObservation["status"]>().notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_signal_observations_owner_date").on(
      table.ownerId,
      table.signalDate,
    ),
    index("idx_signal_observations_owner_status_date").on(
      table.ownerId,
      table.status,
      table.signalDate,
    ),
  ],
);

export const signalResearchSyncs = sqliteTable(
  "signal_research_syncs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    snapshotGeneratedAt: text("snapshot_generated_at").notNull(),
    nextProfileIndex: integer("next_profile_index").notNull().default(0),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    observationCount: integer("observation_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_signal_research_syncs_owner_snapshot").on(
      table.ownerId,
      table.snapshotGeneratedAt,
    ),
  ],
);
