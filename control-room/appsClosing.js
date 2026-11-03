// Apps closing (after the plan-choice work, 3 November 2026): every shop with an app its plan dropped that closes at the
// end of the month it paid for, soonest first, with whether the week-before reminder has gone out. A word from the
// platform may save a stockroom full of records the press forgot to download. With it, how often presses dropped an
// app over the last six months and then kept it: many keeps would mean the plan page's drop is confusing.
//
// Pure reading of the registry rows' `billing` copy (services/billing writes `appsClosing` and `appDrops` there). The
// test shop never counts.

const DAY = 86_400_000;
const SIX_MONTHS = 183 * DAY;
const APP_WORDS = Object.freeze({ shop: "Website", stockroom: "Stockroom" });

export function appsClosing(rows, now = new Date()) {
  const nowMs = now.getTime();
  const shops = [];
  const drops = { dropped: 0, kept: 0, closed: 0, waiting: 0 };
  for (const row of rows) {
    if (row.testShop === true) continue;
    const closing = row.billing?.appsClosing;
    if (closing?.apps?.length && closing.at) {
      shops.push({
        shopId: row.shopId,
        pressName: row.pressName ?? row.shopId,
        ownerEmail: row.ownerEmail ?? null,
        apps: closing.apps.map((app) => APP_WORDS[app] ?? app).join(" and "),
        closesAt: closing.at,
        daysLeft: Math.max(0, Math.ceil((Date.parse(closing.at) - nowMs) / DAY)),
        reminded: closing.reminded ?? null,
      });
    }
    for (const drop of row.billing?.appDrops ?? []) {
      if (!(nowMs - Date.parse(drop.at) <= SIX_MONTHS)) continue;
      drops.dropped += 1;
      drops[drop.keptAt ? "kept" : drop.closedAt ? "closed" : "waiting"] += 1;
    }
  }
  shops.sort((a, b) => a.daysLeft - b.daysLeft || a.pressName.localeCompare(b.pressName));
  return { shops, drops };
}
