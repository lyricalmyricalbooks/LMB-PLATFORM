// Stockroom › Sheets: the stock, sales and costs in a Google Sheet in the press's own Drive, through the shop's one
// Google sign-in (Settings › Google with Drive on). The lines are the stockroom's own sheet rules
// (@stockroom/google-sheet.js), so the sheet reads the same as it always has; the stock tab is read by the server.
// Pure: sheetsStore.ts keeps the "copy by itself" switch, SheetsPage.tsx draws the page and sends.
import { REFRESH_AFTER_MS, expensesSheetLines, salesSheetLines } from "@stockroom/google-sheet.js";
import type { GoogleStatus } from "../googleConnect";
import type { StockroomRecords } from "./stockroomData";

/** What the page shows: Google not linked or not switched on yet ("off"), linked without Drive ("nodrive"), or ready. */
export type SheetState = "off" | "nodrive" | "ready";

export function sheetState(status: GoogleStatus | null | undefined): SheetState {
  if (!status?.enabled || !status.connected || status.needsReconnect) return "off";
  return (status.extrasChosen ?? []).includes("drive") ? "ready" : "nodrive";
}

/** The Sales and Expenses tabs from the stockroom's records (test books are already left out of the records). */
export function sheetTabs(records: Pick<StockroomRecords, "books" | "states">) {
  const books = Object.fromEntries(records.books.map((b) => [b.id, b]));
  return { sales: salesSheetLines(books, records.states), expenses: expensesSheetLines(books, records.states) };
}

/** Send by itself when the switch is on and the sheet was never sent, or last sent over six hours ago. */
export function sheetDue(status: GoogleStatus | null | undefined, copy: boolean, now = Date.now()): boolean {
  if (!copy || sheetState(status) !== "ready") return false;
  const at = Date.parse(status?.sheet?.writtenAt ?? "");
  return !Number.isFinite(at) || now - at > REFRESH_AFTER_MS;
}

/** "24 products · 130 sales · 12 costs", from what the sheet last received. */
export function sheetCounts(sheet: GoogleStatus["sheet"]): string {
  if (!sheet) return "";
  const n = (v: number | null | undefined, one: string, many: string) => `${v ?? 0} ${(v ?? 0) === 1 ? one : many}`;
  return [n(sheet.rows, "product", "products"), n(sheet.sales, "sale", "sales"), n(sheet.expenses, "cost", "costs")].join(" · ");
}

/** The switch's saved form: anything unreadable is "on", the stockroom's old behaviour. */
export function readCopySwitch(raw: unknown): boolean {
  try { return (JSON.parse(String(raw)) as { copy?: unknown })?.copy !== false; } catch { return true; }
}
