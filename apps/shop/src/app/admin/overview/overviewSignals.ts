// Overview 3.0 signals (pure): where checkout loses people, campaigns and landing pages that sell, the reminder emails
// and newsletter, books people want but can't buy, and real page speed. Inputs are the daily `analytics/<date>` docs
// (written by lib/commerce.ts), the paid real orders the rest of the Overview uses, the saved carts, newsletter rows
// and back-in-stock sign-ups. Nothing is estimated: a signal that was never recorded is reported as missing.
import { isRealPaidOrder, orderDay, refundedAmount, type Book, type Order } from "./overviewInsights";
import { sumMap, type Daily } from "./overviewTraffic";
import { cleanAcquisition } from "../../lib/visitSource";
import { parseSpeedKey, type Grade, type Vital } from "../../lib/pageSpeed";
import { analyticsKey } from "../../lib/analyticsKeys";
import { quickAddChoice } from "../../features/site/buyable";

const num = (v: unknown) => Number(v) || 0;
const ts = (v: unknown) => { const t = new Date(v as any).getTime(); return Number.isNaN(t) ? 0 : t; };
const net = (o: Order) => Math.max(0, num(o.total) - refundedAmount(o));

// ─── Where checkout loses people ──────────────────────────────────────────────────────────────────────────────────

export interface JourneyStep { key: string; label: string; count: number; ofPrevious: number | null; lost: number }
export interface CheckoutJourney {
  recorded: boolean;
  steps: JourneyStep[];
  problems: { fields: number; declined: number; failed: number };
  /** The step that lost the most people, as a sentence; null when nothing to say. */
  biggestDrop: string | null;
}

/**
 * The checkout journey from the shop's own counter: Started checkout → Typed an email → Finished the address →
 * Saw the delivery price → Pressed Pay → Bought. `recorded` is false until the first step counter exists, so the panel
 * says "not recorded yet" instead of drawing zeros. Purchases are the funnel's own count (once per real order).
 */
export function checkoutJourney(rows: Daily[]): CheckoutJourney {
  const steps = sumMap(rows, "checkout");
  const funnel = sumMap(rows, "funnel");
  const recorded = rows.some(d => d?.checkout && typeof d.checkout === "object" && Object.keys(d.checkout).length > 0);
  const raw = [
    { key: "start", label: "Started checkout", count: num(funnel.checkout_start) },
    { key: "email", label: "Typed an email", count: num(steps.email) },
    { key: "address", label: "Finished the address", count: num(steps.address) },
    { key: "delivery", label: "Saw the delivery price", count: num(steps.delivery) },
    { key: "pay", label: "Pressed Pay", count: num(steps.pay) },
    { key: "bought", label: "Bought", count: num(funnel.purchase) },
  ];
  const out = raw.map((s, i) => {
    const before = i === 0 ? null : raw[i - 1].count;
    return { ...s, ofPrevious: before === null ? null : before > 0 ? Math.min(100, (s.count / before) * 100) : null, lost: before === null ? 0 : Math.max(0, before - s.count) };
  });
  const worst = out.slice(1).reduce<JourneyStep | null>((w, s) => (s.lost > (w?.lost ?? 0) ? s : w), null);
  let biggestDrop: string | null = null;
  if (recorded && worst && worst.lost > 0) {
    const i = out.indexOf(worst);
    biggestDrop = `Most shoppers stop between "${out[i - 1].label.toLowerCase()}" and "${worst.label.toLowerCase()}" (${worst.lost.toLocaleString()} ${worst.lost === 1 ? "person" : "people"}).${worst.key === "pay" ? " The delivery price is the usual reason: check shipping rates and free-shipping thresholds." : worst.key === "bought" ? " Look at the card and payment problems below." : ""}`;
  }
  return { recorded, steps: out, problems: { fields: num(steps.fields), declined: num(steps.declined), failed: num(steps.failed) }, biggestDrop };
}

// ─── Book by book: views → bag → bought ───────────────────────────────────────────────────────────────────────────

export type TitleFlag = "browsed" | "abandoned" | null;

/**
 * What a title's numbers suggest: looked at a lot but rarely put in the bag (price, photos or description), or put in
 * the bag but rarely bought (shipping cost or checkout). Needs enough views to say anything.
 */
export function titleFlag(r: { views: number | null; adds: number | null; units: number }): TitleFlag {
  if (r.adds === null) return null;
  if (r.views !== null && r.views >= 20 && r.adds / r.views < 0.03 && r.units === 0) return "browsed";
  if (r.adds >= 5 && r.units / r.adds < 0.25) return "abandoned";
  return null;
}

/** At most this many titles are flagged at once, so a flag stays worth reading. */
export const MAX_TITLE_FLAGS = 3;

/**
 * Flags measured against the shop's own rates instead of fixed ones (a quiet shop where every title is "rarely
 * bought" says nothing about one title). A title is flagged when its rate is below half the shop's:
 * - "browsed": 20+ views, nothing sold, added to the bag less than half as often as the shop's titles on average;
 * - "abandoned": 10+ bag adds, bought less than half as often per add as the shop's titles on average.
 * Only the `limit` titles with the most missed sales (expected at the shop's rate minus what happened) keep a flag.
 * Returns id → flag for flagged titles only.
 */
export function titleFlags(rows: Array<{ id: string; views: number | null; adds: number | null; units: number }>, limit = MAX_TITLE_FLAGS): Map<string, Exclude<TitleFlag, null>> {
  const withAdds = rows.filter(r => r.adds !== null);
  const viewed = withAdds.filter(r => r.views !== null && r.views > 0);
  const views = viewed.reduce((s, r) => s + (r.views as number), 0);
  const addRate = views > 0 ? viewed.reduce((s, r) => s + (r.adds as number), 0) / views : 0;
  const added = withAdds.filter(r => (r.adds as number) > 0);
  const adds = added.reduce((s, r) => s + (r.adds as number), 0);
  const buyRate = adds > 0 ? added.reduce((s, r) => s + Math.min(r.units, r.adds as number), 0) / adds : 0;
  const found: Array<{ id: string; flag: Exclude<TitleFlag, null>; missed: number }> = [];
  for (const r of withAdds) {
    const a = r.adds as number;
    if (addRate > 0 && r.views !== null && r.views >= 20 && r.units === 0 && a / r.views < addRate / 2) {
      found.push({ id: r.id, flag: "browsed", missed: r.views * addRate - a });
    } else if (buyRate > 0 && a >= 10 && r.units / a < buyRate / 2) {
      found.push({ id: r.id, flag: "abandoned", missed: a * buyRate - r.units });
    }
  }
  found.sort((x, y) => y.missed - x.missed);
  return new Map(found.slice(0, Math.max(0, limit)).map(f => [f.id, f.flag]));
}

export const TITLE_FLAG_WORDS: Record<Exclude<TitleFlag, null>, { badge: string; hint: string }> = {
  browsed: { badge: "Looked at, not bagged", hint: "Many views but almost nobody adds it to the bag: check the price, photos and description." },
  abandoned: { badge: "Bagged, not bought", hint: "Often added to the bag but rarely bought: check the delivery price and checkout." },
};

// ─── Campaigns, links and landing pages that sell ─────────────────────────────────────────────────────────────────

export interface CampaignRow {
  key: string; label: string; detail: string; orders: number; revenue: number; aov: number; newCustomers: number; visits: number | null;
}

const MEDIUM_WORDS: Record<string, string> = {
  organic: "search", social: "social media", referral: "link", cpc: "paid ad", paid: "paid ad", email: "email", "(none)": "direct",
};

const emailOf = (o: Order) => String(o?.customer?.email || "").trim().toLowerCase();

/** First paid order per customer email (all time), so a campaign's "new customers" means first-ever orders. */
function firstOrderIds(paidAll: Order[]): Set<string> {
  const first = new Map<string, Order>();
  paidAll.filter(isRealPaidOrder).forEach(o => {
    const e = emailOf(o); if (!e) return;
    const seen = first.get(e);
    if (!seen || ts(o.createdAt) < ts(seen.createdAt)) first.set(e, o);
  });
  return new Set([...first.values()].map(o => String(o.id)));
}

/**
 * Paid orders grouped by what brought the shopper: a tagged campaign (utm_campaign), else the source and medium
 * (instagram · social media, a `?ref=` link, google · search, direct). `gaVisits` (Google Analytics sessions by
 * campaign name, when connected) fills the visits column for tagged campaigns; the shop's own counter fills it for
 * plain sources. Orders saved before 18 October 2026 only have the source name.
 */
/** Which campaign row an order belongs to (CampaignsCard's grouping): its key and the parts it is named from. */
export function campaignOf(o: Order) {
  const a = cleanAcquisition(o.acquisition);
  const source = (a?.source || String(o.referralSource || "direct")).toLowerCase().trim() || "direct";
  const medium = a?.medium || (source === "direct" ? "(none)" : "");
  const campaign = a?.campaign || "";
  return { source, medium, campaign, key: campaign ? `c:${campaign.toLowerCase()}` : `s:${source}|${medium}` };
}

/** The landing page an order's visit started on, as landingPerformance groups it. */
export const landingOf = (o: Order) => cleanAcquisition(o.acquisition)?.landingPage || "";

export function campaignPerformance(current: Order[], paidAll: Order[], opts: { visitsBySource?: Record<string, number>; gaVisits?: Record<string, number> } = {}): CampaignRow[] {
  const firsts = firstOrderIds(paidAll);
  const rows = new Map<string, CampaignRow>();
  current.filter(isRealPaidOrder).forEach(o => {
    const { source, medium, campaign, key } = campaignOf(o);
    let r = rows.get(key);
    if (!r) {
      const how = MEDIUM_WORDS[medium] || medium;
      r = {
        key, label: campaign || (source === "direct" ? "Direct visits" : source),
        detail: campaign ? `${source}${how ? ` · ${how}` : ""}` : source === "direct" ? "typed the address or a bookmark" : how,
        orders: 0, revenue: 0, aov: 0, newCustomers: 0,
        visits: campaign ? (opts.gaVisits ? num(opts.gaVisits[campaign.toLowerCase()]) || null : null)
          : opts.visitsBySource ? num(opts.visitsBySource[analyticsKey(source)] ?? (source === "direct" ? opts.visitsBySource.direct : 0)) || null : null,
      };
      rows.set(key, r);
    }
    r.orders += 1; r.revenue += net(o);
    if (firsts.has(String(o.id))) r.newCustomers += 1;
  });
  const out = [...rows.values()];
  out.forEach(r => { r.aov = r.orders ? r.revenue / r.orders : 0; });
  return out.sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.label.localeCompare(b.label));
}

const UNTAGGED = new Set(["(not set)", "(direct)", "(organic)", "(referral)", "(none)", "(cpc)", ""]);

/** Google Analytics campaign rows → sessions per tagged campaign name (lower case), leaving Google's untagged names out. */
export function gaCampaignVisits(rows: Array<Record<string, any>> | undefined): Record<string, number> | undefined {
  if (!rows) return undefined;
  const out: Record<string, number> = {};
  rows.forEach(r => {
    const name = String(r.sessionCampaignName || "").trim().toLowerCase();
    if (UNTAGGED.has(name)) return;
    out[name] = (out[name] || 0) + num(r.sessions);
  });
  return out;
}

export interface LandingRow { page: string; orders: number; revenue: number }

/** The first page shoppers saw before ordering (orders since landing pages were recorded). */
export function landingPerformance(current: Order[]): LandingRow[] {
  const rows = new Map<string, LandingRow>();
  current.filter(isRealPaidOrder).forEach(o => {
    const page = cleanAcquisition(o.acquisition)?.landingPage;
    if (!page) return;
    const r = rows.get(page) || { page, orders: 0, revenue: 0 };
    r.orders += 1; r.revenue += net(o); rows.set(page, r);
  });
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.page.localeCompare(b.page));
}

/** How many of the period's orders carry the full "how they found you" record, and since when it has been saved. */
export function acquisitionCoverage(current: Order[], paidAll: Order[]) {
  const paid = current.filter(isRealPaidOrder);
  const withIt = paid.filter(o => cleanAcquisition(o.acquisition)).length;
  const first = paidAll.filter(o => cleanAcquisition(o.acquisition)).map(o => orderDay(o.createdAt)).filter(Boolean).sort()[0] || null;
  return { orders: paid.length, recorded: withIt, since: first };
}

// ─── Reminder emails and the newsletter ───────────────────────────────────────────────────────────────────────────

/**
 * Abandoned-cart reminders sent in the period (a cart marked notified without `notifySkipped`) and how many of those
 * shoppers bought after the email arrived. Saved carts are deleted after 30 days, so longer periods see 30 days.
 */
export function reminderResults(carts: Array<Record<string, any>>, startMs: number, endMs = Date.now()) {
  const sent = carts.filter(c => c.notified === true && !c.notifySkipped && ts(c.notifiedAt) >= startMs && ts(c.notifiedAt) <= endMs);
  const bought = sent.filter(c => c.recovered === true && ts(c.recoveredAt) >= ts(c.notifiedAt));
  const value = bought.reduce((s, c) => s + num(c.subtotal), 0);
  return { sent: sent.length, bought: bought.length, rate: sent.length ? (bought.length / sent.length) * 100 : null, value };
}

export interface WeekRow { week: string; label: string; confirmed: number; waiting: number }

/** Monday of the week a timestamp falls in (UTC), as YYYY-MM-DD. */
const weekOf = (t: number) => {
  const d = new Date(t); const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
};

/**
 * Newsletter sign-ups per week for the last `weeks` weeks: confirmed (they clicked the email) and still waiting for the
 * click. A rising "waiting" share means the confirmation email is being missed (spam folder).
 */
export function newsletterWeeks(subscribers: Array<Record<string, any>>, pending: Array<Record<string, any>>, weeks = 8, now = Date.now()): WeekRow[] {
  const start = weekOf(now);
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) keys.push(new Date(Date.parse(`${start}T00:00:00Z`) - i * 7 * 86_400_000).toISOString().slice(0, 10));
  const rows = new Map(keys.map(k => [k, { week: k, label: new Date(`${k}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }), confirmed: 0, waiting: 0 }]));
  subscribers.forEach(s => { const r = rows.get(weekOf(ts(s.confirmedAt || s.subscribedAt))); if (r) r.confirmed += 1; });
  pending.forEach(s => { const r = rows.get(weekOf(ts(s.requestedAt || s.subscribedAt))); if (r) r.waiting += 1; });
  return keys.map(k => rows.get(k)!);
}

// ─── Books people want but can't buy ──────────────────────────────────────────────────────────────────────────────

export interface WantedRow { id: string; title: string; state: "sold out" | "coming soon" | "available now" | "removed"; views: number; saves: number; waiting: number; score: number }

/**
 * Views of a book page while the book couldn't be bought, wishlist saves, and back-in-stock sign-ups still waiting,
 * per book. `state` is the book today (a book back in stock keeps its history, marked "available now").
 */
export function wantedButUnavailable(rows: Daily[], books: Book[], alerts: Array<Record<string, any>> | null): WantedRow[] {
  const views = sumMap(rows, "unbuyableViews");
  const saves = sumMap(rows, "wishlistAdds");
  const waiting: Record<string, number> = {};
  (alerts || []).filter(a => a.status === "waiting" && a.bookId).forEach(a => { waiting[a.bookId] = (waiting[a.bookId] || 0) + 1; });
  const byId = new Map(books.map(b => [String(b.id), b]));
  const ids = new Set([...Object.keys(views), ...Object.keys(waiting), ...Object.keys(saves).filter(id => byId.has(id) && !quickAddChoice(byId.get(id)).inStock)]);
  const out: WantedRow[] = [];
  ids.forEach(id => {
    const book = byId.get(id);
    const choice = book ? quickAddChoice(book) : null;
    const state: WantedRow["state"] = !book ? "removed" : choice?.comingSoon ? "coming soon" : choice?.inStock ? "available now" : "sold out";
    const v = num(views[id]), s = num(saves[id]), w = num(waiting[id]);
    if (v + s + w === 0) return;
    out.push({ id, title: book?.title || "Removed book", state, views: v, saves: s, waiting: w, score: v + 3 * s + 5 * w });
  });
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

// ─── Real page speed ──────────────────────────────────────────────────────────────────────────────────────────────

export interface VitalSummary { good: number; ok: number; poor: number; measured: number; goodShare: number | null; passes: boolean | null }
export interface DeviceSpeed { device: "phone" | "computer"; visits: number; lcp: VitalSummary; inp: VitalSummary; cls: VitalSummary }

/** Google calls a site fast when at least 75% of visits are "good" on each of the three measures. */
export const PASS_SHARE = 75;

/** The `vitals` counters added up per device and measure. Visits without a measure ("n") are left out of its share. */
export function pageSpeedSummary(rows: Daily[]): { recorded: boolean; devices: DeviceSpeed[] } {
  const counts = sumMap(rows, "vitals");
  const empty = (): Record<Grade, number> => ({ g: 0, o: 0, p: 0, n: 0 });
  const by: Record<"phone" | "computer", { visits: number } & Record<Vital, Record<Grade, number>>> = {
    phone: { visits: 0, lcp: empty(), inp: empty(), cls: empty() },
    computer: { visits: 0, lcp: empty(), inp: empty(), cls: empty() },
  };
  let recorded = false;
  Object.entries(counts).forEach(([key, n]) => {
    const p = parseSpeedKey(key); if (!p || !(n > 0)) return;
    recorded = true;
    const d = by[p.device];
    d.visits += n; d.lcp[p.lcp] += n; d.inp[p.inp] += n; d.cls[p.cls] += n;
  });
  const sum = (g: Record<Grade, number>): VitalSummary => {
    const measured = g.g + g.o + g.p;
    const goodShare = measured ? (g.g / measured) * 100 : null;
    return { good: g.g, ok: g.o, poor: g.p, measured, goodShare, passes: goodShare === null ? null : goodShare >= PASS_SHARE };
  };
  const devices = (["phone", "computer"] as const).filter(d => by[d].visits > 0)
    .map(device => ({ device, visits: by[device].visits, lcp: sum(by[device].lcp), inp: sum(by[device].inp), cls: sum(by[device].cls) }));
  return { recorded, devices };
}

export const VITAL_WORDS: Record<Vital, { name: string; plain: string }> = {
  lcp: { name: "Loading", plain: "how long until the main picture or heading is on screen (good: 2.5 s or less)" },
  inp: { name: "Responding", plain: "how quickly the page reacts to a tap or click (good: 0.2 s or less)" },
  cls: { name: "Staying still", plain: "how little things jump around while the page loads (good: 0.1 or less)" },
};
