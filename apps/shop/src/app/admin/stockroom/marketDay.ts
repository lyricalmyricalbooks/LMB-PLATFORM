// Stockroom › Till › The morning after: the old stockroom's market-day card (main.js showMarketDaySummaryIfDue), by its
// own rules (market-day.js). The most recent in-person day of the last four, shown once; the day it was shown is kept on
// this device under the old app's key, so the two apps never show the same day twice.
import { describeMarketDay, latestMarketDay, summariseMarketDay } from "@stockroom/market-day.js";

import type { StockroomRecords } from "./stockroomData";

export const MARKET_DAY_SHOWN_KEY = "lm-market-day-shown";

/** The card's words for the latest unseen market day, or null when there is none. */
export function marketDayCard(records: Pick<StockroomRecords, "books" | "states">, today: string, shownFor: string) {
  const rows = Object.entries(records.states).flatMap(([bookId, st]) => ((st?.hist as Array<Record<string, unknown>>) || []).map((entry) => ({ bookId, entry })));
  const day = latestMarketDay(rows, { today, shownFor });
  if (!day) return null;
  const books = Object.fromEntries(records.books.map((b) => [b.id, { title: String(b.title || "") }]));
  const stockOf = (id: string) => { const n = Number(records.states[id]?.stock); return records.states[id] && Number.isFinite(n) ? n : null; };
  const said = describeMarketDay(summariseMarketDay(rows, day, { books, stockOf }));
  return said.count ? { day, title: said.title, detail: said.detail } : { day, title: "", detail: "" };
}
