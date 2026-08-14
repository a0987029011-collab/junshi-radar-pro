import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PositionMarketSnapshot } from "../lib/position-market-snapshot";
import type {
  SignalResearchObservation,
  SignalOutcomeSnapshot,
  TimeframeResearchSnapshot,
} from "../lib/signal-research";

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
