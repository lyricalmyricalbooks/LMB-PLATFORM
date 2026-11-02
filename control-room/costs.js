// The control room's Costs table (code plan 19.15): this month's Google bill per shop next to what the shop pays, most
// losing first. The sums are services/costs; this is the admin-only door to them.
//
// Clients passed in:
//   registry   listShops()
//   reader     services/costs createCostReader({ fetchRows }): { configured, read(month) }; without fetchRows (the
//              billing export isn't switched on yet) the page shows its empty state
//   settings   optional: () -> the live platform settings (services/settings.js liveSettings), for plan prices
//   fees       optional: async ({ month }) -> { [shopId]: cents }, pay-as-you-sell fees taken that month
import { ControlError, adminOf } from "./controlRoom.js";
import { costReport, monthOf } from "../services/costs/costs.js";
import { platformSettings } from "../services/settings.js";

/** What the page says until Google's billing export is on (Julian's step, services/costs/README.md). */
export const COSTS_EMPTY = "Costs appear once Google's billing export is switched on.";

export function createCostsDesk({ registry, reader, settings, fees, admins, now = () => new Date() }) {
  return {
    /** This month's costs per shop (or `month`, like "2026-10"), most losing first; `configured: false` until the export is on. */
    async costs(claims, { month } = {}) {
      adminOf(claims, admins, now().getTime());
      const period = typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : monthOf(now());
      if (!reader?.configured) return { month: period, configured: false, empty: COSTS_EMPTY, shops: [], notShops: [], totals: {} };
      let costs;
      try {
        costs = await reader.read(period);
      } catch (failure) {
        throw new ControlError(502, `Couldn't read Google's bill: ${failure.message}`);
      }
      const live = settings ? await settings() : platformSettings({});
      const report = costReport({ rows: await registry.listShops(), costs, settings: live, fees: fees ? await fees({ month: period }) : {} });
      // No rows yet: the export is on but has nothing for the month (it starts filling the day it is switched on).
      return { month: period, configured: true, ...(costs.projects.length ? {} : { empty: COSTS_EMPTY }), ...report };
    },
  };
}

export function costRoutes(desk) {
  return {
    "GET /api/control/costs": (claims) => desk.costs(claims),
  };
}
