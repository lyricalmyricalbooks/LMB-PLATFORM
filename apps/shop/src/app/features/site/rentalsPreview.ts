// The Rentals page inside Studio's preview: two sample items, free times and a sample booked rental, so an owner can
// design the page before anything is listed, whether or not Rentals is switched on. Nothing is saved; no card page opens.
import { rentalPrice } from "../../../shared/rentalRules";
import type { PublicRentalItem } from "./rentalsAsk";

const ITEMS: PublicRentalItem[] = [
  { id: "sample-kit", name: "Camera kit", description: "A body, two lenses, batteries and a padded bag.", photo: "", basis: "hour", hourMinor: 2000, dayMinor: 9000, weekMinor: 0, minLength: 2, maxLength: 8, opens: "09:00", closes: "18:00", daysAhead: 60, plusTax: true },
  { id: "sample-bike", name: "Cargo bike", description: "Carries two boxes of books or a small table. Helmet and lock included.", photo: "", basis: "day", hourMinor: 0, dayMinor: 4500, weekMinor: 22000, minLength: 1, maxLength: 14, opens: "09:00", closes: "18:00", daysAhead: 60, plusTax: false },
];
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export function previewRentalAnswer(action: string, body: Record<string, unknown>, currency: string): Record<string, unknown> {
  if (action === "rentalsInfo") return { on: true, zone: "America/Toronto", currency, items: ITEMS };
  const item = ITEMS.find((i) => i.id === body.itemId) || ITEMS[0];
  const day = typeof body.day === "string" && body.day ? body.day : addDays(today(), 1);
  if (action === "rentalTimes") {
    if (item.basis === "hour") {
      const times = [];
      for (let h = 9; h + item.minLength <= 18; h += 1) for (const m of ["00", "30"]) times.push({ start: `${String(h).padStart(2, "0")}:${m}`, free: h !== 12 });
      return { day, times };
    }
    const days = Array.from({ length: 14 }, (_, i) => ({ day: addDays(day, i), free: i % 6 !== 4 }));
    const endDay = typeof body.endDay === "string" ? body.endDay : "";
    const length = endDay ? Math.round((Date.parse(endDay) - Date.parse(day)) / 86_400_000) + 1 : 0;
    const quote = length > 0 ? { totalMinor: rentalPrice(item, length), taxMinor: 0, chargedMinor: rentalPrice(item, length), free: true, length } : null;
    return { day, days, quote };
  }
  if (action === "rentalStart") return { rentalId: "sample-rental", url: "" };
  const start = Date.parse(`${addDays(today(), 2)}T15:00:00Z`);
  return { zone: "America/Toronto", rental: { status: "paid", itemName: "Camera kit", basis: "hour", startMs: start, endMs: start + 3 * 3_600_000, length: 3, name: "Ada Reader", chargedMinor: 6900, taxMinor: 900, currency, refundedMinor: 0 } };
}
