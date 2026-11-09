// The business side of Today (code plan 19.7, 19.8, 19.9): income over time, why presses leave with the list of shops
// still worth a word, and failed plan payments. Platform admins only (controlRoom.js `adminOf`). Nothing here changes
// anything, so nothing asks for a reason or writes a log.
//
//   GET /api/control/income           the 12-month line, money kept and lost this month, trials that became paying
//   GET /api/control/leaving          answers by month and reason, counts, latest words, and the save list
//   GET /api/control/payment-trouble  shops whose plan payment is failing or paused, most urgent first
//   GET /api/control/apps-closing     shops with an app their plan dropped closing soon, and how many drops were kept
//
// Clients:
//   registry       listShops()
//   incomeHistory  optional: the nightly income records (incomeHistory.js); without it the line is empty
//   admins         the platform admins (controlRoomAdmins)
import { appsClosing } from "./appsClosing.js";
import { adminOf } from "./controlRoom.js";
import { history } from "./incomeHistory.js";
import { leavingSummary, saveList } from "./leaving.js";
import { paymentTrouble } from "./paymentTrouble.js";

const NO_RECORDS = { list: async () => [] };

export function createBusinessRoom({ registry, incomeHistory = null, admins, now = () => new Date() }) {
  return {
    async income(claims) {
      adminOf(claims, admins, now().getTime());
      return history({ store: incomeHistory ?? NO_RECORDS, now: now() });
    },

    async leaving(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = await registry.listShops();
      return { ...leavingSummary(rows, now()), saveList: saveList(rows, now()) };
    },

    async paymentTrouble(claims) {
      adminOf(claims, admins, now().getTime());
      return { shops: paymentTrouble(await registry.listShops(), now()) };
    },

    async appsClosing(claims) {
      adminOf(claims, admins, now().getTime());
      return appsClosing(await registry.listShops(), now());
    },
  };
}

export function businessRoutes(room) {
  return {
    "GET /api/control/income": (claims) => room.income(claims),
    "GET /api/control/leaving": (claims) => room.leaving(claims),
    "GET /api/control/payment-trouble": (claims) => room.paymentTrouble(claims),
    "GET /api/control/apps-closing": (claims) => room.appsClosing(claims),
  };
}
