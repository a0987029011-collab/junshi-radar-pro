import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { PositionMarketSnapshot } from "../lib/position-market-snapshot";

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
