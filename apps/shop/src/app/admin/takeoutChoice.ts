// Choose what to download (Julian, 12 November 2026: "give shops greater preference and optionality into what they are
// downloading"). Pure rules behind DownloadChoices.tsx: which parts go in, orders from which days, spreadsheets as CSV
// or Excel, and the list of past downloads read from the shop's activity log. The whole-shop zip is every part.
import { orderDay } from "../lib/shopDay";
import { csvForSheet, toXlsx } from "./xlsxWriter";

export type TakeoutPart = "products" | "customers" | "orders" | "photos" | "pages" | "settings" | "stockroom";

export const TAKEOUT_PARTS: ReadonlyArray<{ id: TakeoutPart; label: string; hint: string; combinedOnly?: boolean }> = [
  { id: "products", label: "Products", hint: "In four layouts other shop systems read, plus a full copy" },
  { id: "customers", label: "Customers", hint: "Names, emails and newsletter choice" },
  { id: "orders", label: "Orders", hint: "Every order line, for your records" },
  { id: "photos", label: "Product photos", hint: "The slowest part; skip it for a quick download" },
  { id: "pages", label: "Pages", hint: "Your own pages" },
  { id: "settings", label: "Shop settings", hint: "Passwords are never included" },
  { id: "stockroom", label: "Stockroom", hint: "Stock, sales and money records", combinedOnly: true },
];

export type TakeoutChoice = { parts: TakeoutPart[]; from?: string; to?: string; format: "csv" | "xlsx" };

/** Everything, as the one-button download makes it. */
export const WHOLE_SHOP: TakeoutChoice = { parts: TAKEOUT_PARTS.map((p) => p.id), format: "csv" };

/** Which part a file of the download belongs to; the README always goes in. */
export function partOf(path: string): TakeoutPart | null {
  if (path.startsWith("products/") || path.startsWith("backup/")) return "products";
  if (path.startsWith("images/")) return "photos";
  const top = path.split("/")[0];
  return (["customers", "orders", "pages", "settings", "stockroom"] as const).find((p) => p === top) ?? null;
}

export const isWhole = (c: TakeoutChoice) => TAKEOUT_PARTS.every((p) => p.combinedOnly || c.parts.includes(p.id)) && !c.from && !c.to;

/** Orders placed on or between the chosen days (shop days); no day chosen keeps every order. */
export function ordersInRange<T extends { createdAt?: unknown }>(orders: T[], from?: string, to?: string): T[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const day = orderDay(o.createdAt);
    return !!day && (!from || day >= from) && (!to || day <= to);
  });
}

/** A problem with the choice, in plain words, or null when it can be downloaded. */
export function choiceProblem(c: TakeoutChoice): string | null {
  if (!c.parts.length) return "Pick at least one part.";
  if (c.from && c.to && c.from > c.to) return "The first day comes after the last day.";
  return null;
}

type File = { path: string; content: string | Uint8Array };

/** Keeps the chosen parts, and turns spreadsheets into Excel files when asked. */
export function pickFiles(files: File[], c: TakeoutChoice): File[] {
  const kept = files.filter((f) => { const part = partOf(f.path); return part === null || c.parts.includes(part); });
  if (c.format !== "xlsx") return kept;
  return kept.map((f) => (f.path.endsWith(".csv") && typeof f.content === "string"
    ? { path: f.path.replace(/\.csv$/, ".xlsx"), content: toXlsx(csvForSheet(f.content), f.path.split("/").pop()!.replace(/\.csv$/, "").slice(0, 31)) }
    : f));
}

/** The words for the activity log and the history list: "Products, Orders (1 Jan 2026 to 31 Mar 2026), as Excel". */
export function choiceWords(c: TakeoutChoice): string {
  if (isWhole(c) && c.format === "csv") return "The whole shop";
  const names = TAKEOUT_PARTS.filter((p) => c.parts.includes(p.id)).map((p) => p.label);
  const days = c.from || c.to ? ` (${c.from ? `from ${c.from}` : ""}${c.from && c.to ? " " : ""}${c.to ? `to ${c.to}` : ""})` : "";
  return `${names.join(", ")}${c.parts.includes("orders") ? days : ""}${c.format === "xlsx" ? ", as Excel" : ""}`;
}

export type PastDownload = { at: string; words: string };

/** Past downloads and folder backups, newest first, from the activity log's `export` lines. */
export function pastDownloads(rows: Array<{ type?: string; message?: string; createdAt?: string }>, max = 5): PastDownload[] {
  return rows
    .filter((r) => r.type === "export" && typeof r.message === "string" && typeof r.createdAt === "string")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, max)
    .map((r) => ({ at: r.createdAt!, words: r.message! }));
}
