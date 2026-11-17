// The money pages' records (Tax centre, Bookkeeping, Reports): the stockroom's records plus what the shop's bookings
// brought in (serviceSales.ts). Bookings are read from the shop's own folder (admin read, no server call). A shop that
// never took a booking reads an empty list; a read that fails (a team member the rules refuse, no connection) leaves
// bookings out rather than failing the page, since the stockroom's own figures still stand.
import { readBookingsBetween } from "../bookingsApi";
import { SHOP_CURRENCY } from "../moneySign";
import { shopDayKey } from "../../lib/shopDay";
import { shopTimeZone } from "../../../shared/shopTimeZone";
import { serviceSales, type ServiceSale } from "./serviceSales";
import { stockroomApi, type StockroomRecords } from "./stockroomData";

/** Bookings are read from this day on (before Bookings existed). */
const FIRST_DAY = "2026-01-01T00:00:00.000Z";

export async function readServiceSales(now = Date.now()): Promise<ServiceSale[]> {
  try {
    const rows = await readBookingsBetween(FIRST_DAY, new Date(now + 2 * 86_400_000).toISOString());
    return serviceSales(rows, shopTimeZone(), shopDayKey(now), SHOP_CURRENCY);
  } catch (error) {
    console.warn("Bookings could not be read for the money pages", error);
    return [];
  }
}

/** The stockroom's records with the service sales added. */
export async function loadMoneyRecords(load: () => Promise<StockroomRecords> = stockroomApi.load): Promise<StockroomRecords> {
  const [records, sales] = await Promise.all([load(), readServiceSales()]);
  return sales.length ? { ...records, serviceSales: sales } : records;
}
