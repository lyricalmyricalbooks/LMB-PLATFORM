// Bookkeeping › Expenses › Drives: a log of business drives (date, from, to, why, distance, round trip), each tied to a
// trip or event or to a stockist visit if the owner likes, and a per-distance rate that turns them into a deduction.
// Saved in the Tax centre record: `taxCenter.drives` (rows with an `id`; removing one voids it, WRITING.md rule 3) and
// `taxCenter.mileage` ({ unit, rates }). A rate holds from its start date until the next one starts, so a new year's
// rate is added beside last year's and old drives keep the rate of their own day. A rate may drop after a distance
// driven in the calendar year (Canada's first 5,000 km). Pure; the saves go through saveTaxCenter.
import { toCsv } from "@stockroom/csv.js";
import { SHOP_CURRENCY } from "../moneySign";

type Row = Record<string, any>;
export type Unit = "km" | "mi";
export type MileageRate = { id: string; from: string; unit: Unit; rate: number; tierAfter?: number; tierRate?: number; label: string };
export type Mileage = { unit: Unit; rates: MileageRate[] };
export type Drive = {
  id: string; date: string; from: string; to: string; purpose: string; distance: number; unit: Unit; roundTrip: boolean;
  trip?: string; stockist?: string; voided?: boolean; created?: string;
};
export type DriveForm = { date: string; from: string; to: string; purpose: string; distance: string; roundTrip: boolean; trip: string; stockist: string };
export type PricedDrive = Drive & { total: number; deduction: number; rate: MileageRate | null };

const KM_PER_MILE = 1.609344;
export const UNIT_WORD: Record<Unit, { short: string; long: string; one: string }> = {
  km: { short: "km", long: "kilometres", one: "kilometre" },
  mi: { short: "mi", long: "miles", one: "mile" },
};

/**
 * The official rates the owner can start from, labelled with their year. They change every year (and the US one
 * changed mid-2026), so the owner adds next year's beside these or edits them. Canada: the CRA's automobile
 * allowance rates (provinces; the territories add 4 cents). US: the IRS standard mileage rate for business.
 */
export const RATE_PRESETS: Array<{ id: string; label: string; country: "CA" | "US"; currency: string; rates: Omit<MileageRate, "id">[] }> = [
  {
    id: "cra-2026", label: "Canada (CRA) 2026", country: "CA", currency: "CAD",
    rates: [{ from: "2026-01-01", unit: "km", rate: 0.73, tierAfter: 5000, tierRate: 0.67, label: "Canada (CRA) 2026" }],
  },
  {
    id: "irs-2026", label: "US (IRS) 2026", country: "US", currency: "USD",
    rates: [
      { from: "2026-01-01", unit: "mi", rate: 0.725, label: "US (IRS) 2026, January to June" },
      { from: "2026-07-01", unit: "mi", rate: 0.76, label: "US (IRS) 2026, from July" },
    ],
  },
];

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const asUnit = (v: unknown): Unit => (v === "mi" ? "mi" : "km");
const convert = (distance: number, from: Unit, to: Unit) => (from === to ? distance : from === "km" ? distance / KM_PER_MILE : distance * KM_PER_MILE);

/** The shop's mileage settings, with a starting unit from its currency (miles for US dollars, kilometres otherwise). */
export function mileageOf(tc: Row | null, currency: string = SHOP_CURRENCY): Mileage {
  const m = tc?.mileage;
  const rates: MileageRate[] = (Array.isArray(m?.rates) ? m.rates : [])
    .filter((r: Row) => r && typeof r.from === "string" && num(r.rate) > 0)
    .map((r: Row) => ({
      id: String(r.id || r.from), from: r.from, unit: asUnit(r.unit), rate: num(r.rate), label: String(r.label || ""),
      ...(num(r.tierAfter) > 0 && num(r.tierRate) > 0 ? { tierAfter: num(r.tierAfter), tierRate: num(r.tierRate) } : {}),
    }))
    .sort((a: MileageRate, b: MileageRate) => a.from.localeCompare(b.from));
  return { unit: m?.unit === "mi" || m?.unit === "km" ? m.unit : currency === "USD" ? "mi" : "km", rates };
}

/** The preset that suits the shop's currency first. */
export const presetsFor = (currency: string) => [...RATE_PRESETS].sort((a, b) => Number(b.currency === currency) - Number(a.currency === currency));

/** The rate in force on `date`: the latest one that started on or before it. */
export function rateOn(m: Mileage, date: string): MileageRate | null {
  let found: MileageRate | null = null;
  for (const r of m.rates) if (r.from <= date) found = r;
  return found;
}

/** The drive's whole distance, both ways for a round trip. */
export const driveTotal = (d: Pick<Drive, "distance" | "roundTrip">) => num(d.distance) * (d.roundTrip ? 2 : 1);

const drivesOf = (tc: Row | null): Drive[] => (Array.isArray(tc?.drives) ? tc!.drives : []).filter((d: Row) => d && !d.voided && d.date);

/**
 * Every drive with its deduction. Drives count in date order within each calendar year, so a rate that drops after
 * 5,000 km drops on the drive that crosses it (that drive is split at the line).
 */
export function pricedDrives(tc: Row | null, currency: string = SHOP_CURRENCY): PricedDrive[] {
  const m = mileageOf(tc, currency);
  const sorted = [...drivesOf(tc)].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const drivenKm: Record<string, number> = {};
  return sorted.map((d) => {
    const unit = asUnit(d.unit);
    const total = driveTotal(d);
    const year = d.date.slice(0, 4);
    const before = drivenKm[year] || 0;
    drivenKm[year] = before + convert(total, unit, "km");
    const rate = rateOn(m, d.date);
    if (!rate) return { ...d, unit, total, deduction: 0, rate: null };
    const dist = convert(total, unit, rate.unit);
    let deduction = dist * rate.rate;
    if (rate.tierAfter && rate.tierRate) {
      const done = convert(before, "km", rate.unit);
      const atFirst = Math.max(0, Math.min(dist, rate.tierAfter - done));
      deduction = atFirst * rate.rate + (dist - atFirst) * rate.tierRate;
    }
    return { ...d, unit, total, deduction: round2(deduction), rate };
  });
}

/** The year's drives, distance (in the shop's unit) and deduction; `noRate` counts drives before any rate starts. */
export function mileageYear(tc: Row | null, year: string, currency: string = SHOP_CURRENCY) {
  const m = mileageOf(tc, currency);
  const drives = pricedDrives(tc, currency).filter((d) => d.date.startsWith(year));
  const distance = drives.reduce((s, d) => s + convert(d.total, d.unit, m.unit), 0);
  const deduction = round2(drives.reduce((s, d) => s + d.deduction, 0));
  return { drives, distance, deduction, noRate: drives.filter((d) => !d.rate).length, unit: m.unit };
}

/** The drives on a trip or event, any year, with their deduction. */
export function tripDrives(tc: Row | null, trip: string, currency: string = SHOP_CURRENCY) {
  const key = trip.trim().toLowerCase();
  const drives = pricedDrives(tc, currency).filter((d) => String(d.trip || "").trim().toLowerCase() === key);
  return { drives, deduction: round2(drives.reduce((s, d) => s + d.deduction, 0)) };
}

/** "120 km" or "74.6 mi". */
export const distanceText = (n: number, unit: Unit) => `${(Math.round(n * 10) / 10).toLocaleString("en-CA")} ${UNIT_WORD[unit].short}`;

/** "73¢ a km, 67¢ after 5,000 km" in the rate's own words. */
export function rateText(r: MileageRate, currency: string = SHOP_CURRENCY): string {
  const each = (n: number) => (n < 1 ? `${(Math.round(n * 1000) / 10).toString()}¢` : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n));
  const u = UNIT_WORD[r.unit].short;
  return `${each(r.rate)} a ${u}${r.tierAfter && r.tierRate ? `, ${each(r.tierRate)} after ${r.tierAfter.toLocaleString("en-CA")} ${u}` : ""}`;
}

export function driveToForm(tc: Row | null, id: string | null, today: string): DriveForm {
  const d = id ? drivesOf(tc).find((x) => String(x.id) === id) : null;
  return {
    date: d?.date || today, from: d?.from || "", to: d?.to || "", purpose: d?.purpose || "", distance: d ? String(d.distance) : "",
    roundTrip: d ? !!d.roundTrip : true, trip: d?.trip || "", stockist: d?.stockist || "",
  };
}

/** What's wrong with the form, or "". */
export function driveProblem(form: DriveForm): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Pick the day of the drive.";
  if (!form.to.trim()) return "Say where you drove to.";
  if (!(num(form.distance) > 0)) return "Type how far it was.";
  if (num(form.distance) > 20000) return "That is more than anyone drives in one go. Check the distance.";
  return "";
}

/** The Tax centre with the drive added or changed. The distance is kept in the unit the owner typed it in. */
export function saveDrive(tc: Row | null, id: string | null, form: DriveForm, unit: Unit, newId: string, today: string): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  const list: Row[] = Array.isArray(cur.drives) ? cur.drives.slice() : [];
  const at = id ? list.findIndex((d) => String(d?.id) === id) : -1;
  const prev = at >= 0 ? list[at] : null;
  const row: Drive = {
    id: prev ? String(prev.id) : newId, date: form.date, from: form.from.trim(), to: form.to.trim(), purpose: form.purpose.trim(),
    distance: round2(num(form.distance)), unit: prev ? asUnit(prev.unit) : unit, roundTrip: form.roundTrip,
    ...(form.trip.trim() ? { trip: form.trip.trim() } : {}), ...(form.stockist.trim() ? { stockist: form.stockist.trim() } : {}),
    created: prev?.created || today,
  };
  if (at >= 0) list[at] = row; else list.push(row);
  return { ...cur, drives: list };
}

/** The Tax centre with the drive voided (kept, so another device can't bring it back). */
export function removeDrive(tc: Row | null, id: string): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  return { ...cur, drives: (Array.isArray(cur.drives) ? cur.drives : []).map((d: Row) => (String(d?.id) === id ? { ...d, voided: true } : d)) };
}

/** What's wrong with the rates, or "". */
export function ratesProblem(m: Mileage): string {
  const seen = new Set<string>();
  for (const r of m.rates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from)) return "Each rate needs the day it starts.";
    if (seen.has(r.from)) return `Two rates start on ${r.from}. Keep one.`;
    seen.add(r.from);
    if (!(r.rate > 0)) return "Each rate needs an amount.";
    if ((r.tierAfter && !(r.tierRate! > 0)) || (!r.tierAfter && r.tierRate)) return "A lower rate needs both the distance and the amount.";
  }
  return "";
}

/** The Tax centre with new mileage settings. */
export function saveMileage(tc: Row | null, m: Mileage): Row {
  const cur: Row = tc && typeof tc === "object" ? tc : {};
  const rates = [...m.rates].sort((a, b) => a.from.localeCompare(b.from)).map((r) => ({
    id: r.id, from: r.from, unit: r.unit, rate: r.rate, label: r.label.trim(),
    ...(r.tierAfter && r.tierRate ? { tierAfter: r.tierAfter, tierRate: r.tierRate } : {}),
  }));
  return { ...cur, mileage: { unit: m.unit, rates } };
}

/** The settings with a preset's rates added; a rate already starting that day is replaced. */
export function withPreset(m: Mileage, presetId: string): Mileage {
  const preset = RATE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return m;
  const adding = preset.rates.map((r, i) => ({ ...r, id: `${preset.id}-${i}` }));
  const days = new Set(adding.map((r) => r.from));
  return { unit: m.rates.length ? m.unit : adding[0].unit, rates: [...m.rates.filter((r) => !days.has(r.from)), ...adding].sort((a, b) => a.from.localeCompare(b.from)) };
}

/** The year's drive log as a spreadsheet. */
export function drivesCsv(drives: PricedDrive[], year: string, currency: string): { text: string; name: string } {
  const rows = [
    ["Date", "From", "To", "Purpose", "Trip or event", "Stockist", "Round trip", "Distance", "Unit", "Rate", `Deduction (${currency})`],
    ...drives.map((d) => [d.date, d.from, d.to, d.purpose, d.trip || "", d.stockist || "", d.roundTrip ? "Yes" : "No",
      String(Math.round(d.total * 100) / 100), d.unit, d.rate ? rateText(d.rate, currency) : "No rate for this day", d.deduction.toFixed(2)]),
    ["", "", "", "", "", "", "", "", "", "Total", drives.reduce((s, d) => s + d.deduction, 0).toFixed(2)],
  ];
  return { text: toCsv(rows), name: `Drive_log_${year}.csv` };
}
