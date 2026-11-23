// Bring your services from a spreadsheet (Bookings plan 4, step 2.11, Beta). The owner uploads or pastes a sheet,
// from their own records or another booking tool's export; this reads the headings it knows (name, length, price,
// description, group, places), turns each line into a new service, and says plainly what it skipped and why. The
// server checks every service again (`importServices` in functions/bookings.js) and skips names the shop already has,
// so running the same sheet twice adds nothing.
import { parseCsv } from "./catalogImport";
import { MAX_SERVICES, serviceGroup } from "../../shared/bookingTimes";

/** At most this many services in one go (the shop's own limit applies too). */
export const MAX_IMPORT = MAX_SERVICES;

export type ImportField = "name" | "minutes" | "price" | "description" | "group" | "places";

/** Headings each field answers to, compared lower case with punctuation dropped. */
const HEADINGS: Record<ImportField, string[]> = {
  name: ["name", "service", "service name", "title", "treatment", "appointment", "appointment type", "class", "item", "item name"],
  minutes: ["duration", "length", "minutes", "duration minutes", "duration mins", "mins", "time", "how long", "duration min", "service duration"],
  price: ["price", "cost", "amount", "fee", "rate", "price cad", "price usd", "service price"],
  description: ["description", "details", "about", "notes", "summary", "service description"],
  group: ["group", "category", "type", "section", "service category", "menu"],
  places: ["places", "capacity", "spots", "seats", "max people", "max attendees", "class size", "group size"],
};

const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which column feeds each field (-1 = none). The first matching column wins. */
export function importColumns(headings: readonly string[]): Record<ImportField, number> {
  const keys = headings.map(key);
  const out = {} as Record<ImportField, number>;
  for (const field of Object.keys(HEADINGS) as ImportField[]) out[field] = keys.findIndex((k) => HEADINGS[field].includes(k));
  return out;
}

/** "60", "45 min", "1h", "1 h 30", "1:30", "1.5 hours", "90 minutes" → minutes; NaN when it can't tell. */
export function readMinutes(raw: string): number {
  const v = raw.trim().toLowerCase();
  if (!v) return NaN;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(v);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hours = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(v);
  const mins = /(\d+)\s*(?:m|min|mins|minute|minutes)\b/.exec(v);
  if (hours || mins) {
    const h = hours ? Number(hours[1].replace(",", ".")) : 0;
    // "1 h 30" has its minutes without a word after them.
    const tail = !mins && hours ? /(?:h|hr|hrs|hour|hours)\s*(\d{1,2})\s*$/.exec(v) : null;
    return Math.round(h * 60 + (mins ? Number(mins[1]) : tail ? Number(tail[1]) : 0));
  }
  return /^\d+$/.test(v) ? Number(v) : NaN;
}

/** "$45", "45.00", "CA$ 1,200.50", "free", "" → cents (0 = free); NaN when it can't tell. */
export function readPrice(raw: string): number {
  const v = raw.trim().toLowerCase();
  if (!v || v === "free" || v === "0") return 0;
  const digits = v.replace(/[a-z$€£\s]/g, "");
  // "1.200,50" (comma for cents) and "1,200.50" both read.
  const normal = /,\d{2}$/.test(digits) && !/\.\d{2}$/.test(digits) ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return NaN;
  return Math.round(Number(normal) * 100);
}

/** One service to add, as the server's `saveService` takes it. */
export type ImportedService = { name: string; minutes: number; priceMinor: number; payment: "free" | "atShop"; description: string; group: string; places: number };
export type SkippedLine = { line: number; name: string; why: string };
export type ImportPlan = { services: ImportedService[]; skipped: SkippedLine[]; missing: ImportField[] };

/**
 * Read a sheet into services. A priced service is paid at the visit (the owner can switch it to card payment);
 * a line without a length takes an hour. Lines with no name, a length the shop can't take, a price it can't read,
 * a name already in the shop or twice in the sheet are skipped with a reason.
 */
export function planImport(sheet: string, existingNames: readonly string[] = []): ImportPlan {
  const rows = parseCsv(sheet);
  const empty: ImportPlan = { services: [], skipped: [], missing: ["name"] };
  if (!rows.length) return empty;
  const cols = importColumns(rows[0]);
  if (cols.name < 0) return empty;
  const cell = (row: string[], field: ImportField) => (cols[field] >= 0 ? String(row[cols[field]] ?? "").trim() : "");
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const services: ImportedService[] = [];
  const skipped: SkippedLine[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const name = cell(row, "name").replace(/\s+/g, " ").slice(0, 80);
    const skip = (why: string) => skipped.push({ line, name, why });
    if (!name) return skip("It has no name.");
    if (taken.has(name.toLowerCase())) return skip("You already have a service with this name.");
    const lengthText = cell(row, "minutes");
    const minutes = lengthText ? readMinutes(lengthText) : 60;
    if (!Number.isFinite(minutes)) return skip(`We couldn't read the length "${lengthText}".`);
    if (minutes < 5 || minutes > 8 * 60) return skip("A booking lasts between 5 minutes and 8 hours.");
    const priceText = cell(row, "price");
    const priceMinor = readPrice(priceText);
    if (!Number.isFinite(priceMinor)) return skip(`We couldn't read the price "${priceText}".`);
    if (priceMinor > 0 && priceMinor < 50) return skip("A paid booking costs at least 0.50.");
    if (priceMinor > 1_000_000) return skip("That price is too high for one booking.");
    const placesText = cell(row, "places");
    const places = placesText && /^\d+$/.test(placesText) ? Math.min(100, Math.max(1, Number(placesText))) : 1;
    if (services.length >= MAX_IMPORT) return skip(`Only ${MAX_IMPORT} services can come in at once.`);
    taken.add(name.toLowerCase());
    services.push({ name, minutes, priceMinor, payment: priceMinor > 0 ? "atShop" : "free", description: cell(row, "description").slice(0, 600), group: serviceGroup(cell(row, "group")), places });
  });
  const missing = (["minutes", "price"] as ImportField[]).filter((f) => cols[f] < 0);
  return { services, skipped, missing };
}

/** A small sheet to start from, with the headings this reads. */
export const SAMPLE_SHEET = "Name,Length,Price,Group,Description\nHaircut,45 min,40,Cuts,Wash and cut\nColour,1 h 30,95,Colour,Roots or all over\nConsultation,15,0,,A quick chat first\n";
