// Tax centre › Trips and events: the old stockroom's trip records (features/taxcentre.js saveNewTrip, deleteTripRecord;
// features/tax-entries.js exportTripCSV). A trip is a name expenses are grouped under (`businessExpenses[].trip`),
// with an optional record (`taxCenter.trips`: destination, dates, purpose, notes) and budget (`taxCenter.tripBudgets`).
// Pure; the saves go through saveTaxCenter.
import { toCsv } from "@stockroom/csv.js";

type Row = Record<string, any>;
export type TripForm = { name: string; destination: string; startDate: string; endDate: string; purpose: string; notes: string; budget: string };

const key = (name: unknown) => String(name || "").trim().toLowerCase();
const tripsOf = (tc: Row | null): Row[] => (Array.isArray(tc?.trips) ? tc!.trips : []);
export const findTrip = (tc: Row | null, name: string): Row | null => (key(name) ? tripsOf(tc).find((t) => key(t.name) === key(name)) || null : null);

/** The form for a new trip, or filled from a trip's record and budget. */
export function tripToForm(tc: Row | null, name: string | null): TripForm {
  const rec = name ? findTrip(tc, name) : null;
  const budget = name ? tc?.tripBudgets?.[rec?.name || name] : undefined;
  return {
    name: String(rec?.name || name || ""), destination: String(rec?.destination || ""), startDate: String(rec?.startDate || ""),
    endDate: String(rec?.endDate || ""), purpose: String(rec?.purpose || ""), notes: String(rec?.notes || ""), budget: budget ? String(budget) : "",
  };
}

/** What's wrong with the form, or "" (a name, not another trip's, and dates in order). */
export function tripProblem(tc: Row | null, editing: string | null, form: TripForm): string {
  const name = form.name.trim();
  if (!name) return "Give the trip a name: that is what expenses get grouped under.";
  const clash = findTrip(tc, name);
  if (clash && key(clash.name) !== key(editing)) return `A trip called "${clash.name}" already exists.`;
  if (form.startDate && form.endDate && form.endDate < form.startDate) return "The end date falls before the start date.";
  return "";
}

/** The Tax centre with the trip created or changed; a rename takes its expenses and budget along. `moved`: expenses renamed. */
export function saveTrip(tc: Row | null, editing: string | null, form: TripForm, today: string, newId: number): { taxCenter: Row; moved: number } {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  const name = form.name.trim();
  const prev = findTrip(cur, editing || name);
  const rec = {
    id: (editing ? prev?.id : null) || newId, name, destination: form.destination.trim(), startDate: form.startDate.trim(), endDate: form.endDate.trim(),
    purpose: form.purpose.trim(), notes: form.notes.trim(), created: prev?.created || today,
  };
  const records = tripsOf(cur).slice();
  const at = records.findIndex((t) => key(t.name) === key(editing || name));
  if (at >= 0) records[at] = rec; else records.push(rec);
  let moved = 0;
  let expenses: Row[] | undefined = cur.businessExpenses;
  const budgets: Row = { ...(cur.tripBudgets || {}) };
  if (editing && editing !== name) {
    expenses = (Array.isArray(cur.businessExpenses) ? cur.businessExpenses : []).map((e: Row) => {
      if (String(e.trip || "").trim() !== editing) return e;
      moved++;
      return { ...e, trip: name };
    });
    if (budgets[editing] != null) { budgets[name] = budgets[editing]; delete budgets[editing]; }
  }
  const budget = parseFloat(form.budget.trim());
  if (form.budget.trim() && !Number.isNaN(budget) && budget > 0) budgets[name] = budget; else delete budgets[name];
  return { taxCenter: { ...cur, trips: records, ...(expenses ? { businessExpenses: expenses } : {}), tripBudgets: budgets }, moved };
}

/** The Tax centre without the trip; its expenses stay in the ledger with no trip. */
export function deleteTrip(tc: Row | null, name: string): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  const budgets: Row = { ...(cur.tripBudgets || {}) };
  delete budgets[name];
  return {
    ...cur,
    trips: tripsOf(cur).filter((t) => key(t.name) !== key(name)),
    businessExpenses: (Array.isArray(cur.businessExpenses) ? cur.businessExpenses : []).map((e: Row) => (String(e.trip || "").trim() === name ? { ...e, trip: "" } : e)),
    tripBudgets: budgets,
  };
}

/** How many expenses are grouped under the trip. */
export const tripExpenseCount = (tc: Row | null, name: string) => (Array.isArray(tc?.businessExpenses) ? tc!.businessExpenses : []).filter((e: Row) => String(e.trip || "").trim() === name).length;

/** The trip's spreadsheet, the old app's columns and file name. */
export function tripCsv(name: string, items: Row[], baseCurrency: string): { text: string; name: string } {
  const rows = [
    ["Date", "Description", "Tax Category", "Reference", "Original Currency", "Original Amount", `Base Amount (${baseCurrency})`, "Receipt URL"],
    ...items.map((item) => [item.date || "", item.desc || "", item.cat || "", item.ref || "", item.origCurrency || "CAD",
      Number(item.origAmount || 0).toFixed(2), Number(item.baseAmount || 0).toFixed(2), item.receipt || ""]),
  ];
  return { text: toCsv(rows), name: `trip_expenses_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv` };
}
