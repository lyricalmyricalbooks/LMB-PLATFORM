// Trial emails tied to the setup guide (code plan 6.10). Days 0 (the welcome, setup step 14), 11 (trial-ending) and 14
// (card-needed) are sent elsewhere; this daily sweep adds days 2, 4, 7, 21 and 60. Each one is a tip for the next step
// of the shop's setup guide (Overview › Set up your shop, apps/shop/src/app/admin/firstWeek.ts) the owner hasn't done,
// read from the progress the shop's admin saves in `firstWeek/start` (`progress { steps, done, at }`):
//
// - a step already done is never the tip, and no step is the tip twice;
// - at most one tip every two days, and one per tip day (a missed run sends it the next day, never two at once);
// - nothing once every step is done, for a closed or abandoned shop, or for the test shop;
// - tips can be turned off (the email's own link, `turnOff`); the billing emails can't, since services/billing sends
//   them and never asks this module.
//
// Every tip is recorded in the sweep's own store (so a re-run sends nothing new), in the registry (an event) and in the
// shop's audit log. Words are plain and name no rival; the email itself is the "trial-tip" template in services/email.
//
// Clients (all injected; tests use fakes.js):
//   registry  listShops() -> rows; getProfile(shopId) -> { siteUrl, apps } ; recordEvent(shopId, entry)
//   auditLog  ready(shopId), write(shopId, id, entry)
//   guide     read(shopId) -> firstWeek/start | null   (the shop's own database, clients/shop.js shopData.get)
//   email     sendPlatform({ kind, to, idempotencyKey, shopId, data })
//   store     get(shopId) -> { sent: { [day]: { step, at } }, lastAt, off } | null; set(shopId, row)
//   settings  platformSettings(env) (services/settings.js): platformName, platformUrl, trialDays
import { createHmac, timingSafeEqual } from "node:crypto";

export const TIP_DAYS = Object.freeze([2, 4, 7, 21, 60]);
const DAY = 86_400_000;
const GAP_DAYS = 2;

/** The tip for each step of the shop's setup guide (its `StepId`s): a subject, two short paragraphs and a button. */
export const TIPS = Object.freeze({
  logo: { subject: "Put your logo on your shop", paragraphs: ["Your logo sits in your shop's header, on your emails and in the picture people see when they share your shop.", "Open Design and add it. A square or wide picture works best."], action: "Add your logo", hash: "designer" },
  look: { subject: "Make your shop look like your press", paragraphs: ["Your look is waiting in Design. Change the colours and type until it feels like yours, then press Publish so shoppers see it.", "Every look keeps your words, books and pages, so you can try a few."], action: "Open Design", hash: "designer" },
  "add-books": { subject: "Add your first book", paragraphs: ["A title, a price and a photo are enough to start. You can fill in the rest later.", "Your shop stays private while you work, so nobody sees a half-finished book."], action: "Add a book", hash: "catalog" },
  "bring-books": { subject: "Bring your books over from your old shop", paragraphs: ["Export your products from your old shop and choose that file in Books › Import CSV. Photos, prices and editions come over as drafts.", "Old links keep working, so shoppers who bookmarked a book still find it."], action: "Open Books", hash: "catalog" },
  "import-spreadsheet": { subject: "Bring in your spreadsheet of books", paragraphs: ["Save your list of books as a CSV file and choose it in Books › Import CSV.", "You see every book before anything is saved, and each one arrives as a draft."], action: "Open Books", hash: "catalog" },
  shipping: { subject: "Set your shipping prices", paragraphs: ["Shoppers see the price of delivery before they pay. Start from the ready-made profile and check its prices.", "You can add free shipping over an amount, or local pickup, at any time."], action: "Open Shipping", hash: "settings/shipping" },
  payments: { subject: "Get paid for your books", paragraphs: ["Tell the card company where to send your money. Their own secure page asks for your bank details, and you come straight back.", "It takes about five minutes, and sales go straight to your bank."], action: "Open Payments", hash: "settings/payments" },
  address: { subject: "Choose your web address", paragraphs: ["Your shop already has a free web address. If you own a name, you can connect it in Settings › General.", "Happy with the free one? Mark the step done in Set up your shop."], action: "Open General settings", hash: "settings/general" },
  practice: { subject: "Try a practice order", paragraphs: ["While your shop is private, press Try a practice order in Payments and buy a book with the practice card. No money moves.", "You see your order, the customer's email and a refund, just as a shopper's order will go."], action: "Open Payments", hash: "settings/payments" },
  open: { subject: "Your shop is ready to open", paragraphs: ["When you're ready, press Open your shop on the Overview. We check that everything needed to sell is in place first.", "You can close it again at any time from Settings › General › Store status."], action: "Open the Overview", hash: "overview" },
});

/** The guide's general order (firstWeek.ts ORDER.general), for a shop whose admin hasn't saved its progress yet. */
export const DEFAULT_STEPS = Object.freeze(["logo", "look", "add-books", "shipping", "payments", "address", "practice", "open"]);

/** Whole days since the trial started (day 0 is the day the shop was made). */
export function trialDay(start, now) {
  const t = Date.parse(start ?? "");
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : null;
}

/** When the shop's trial started: its first trial end minus the trial's length, else when the row was made. */
export function trialStart(row, trialDays) {
  const end = Date.parse(row?.billing?.trialEnd ?? "");
  if (Number.isFinite(end) && trialDays > 0) return new Date(end - trialDays * DAY).toISOString();
  return row?.trialStartedAt ?? row?.createdAt ?? null;
}

/**
 * The tip due today, or null and why not. `record` is the sweep's own row for the shop, `progress` the guide's.
 * Pure, so every rule above is tested on its own.
 */
export function dueTip({ day, progress, record, now }) {
  if (record?.off) return { tip: null, why: "tips-off" };
  if (day === null || day < TIP_DAYS[0]) return { tip: null, why: "too-early" };
  // Today's tip day is the latest one reached; a day already sent waits for the next.
  const tipDay = [...TIP_DAYS].reverse().find((d) => d <= day);
  // A run missed on the tip day may send it the day after, never later (and never two at once).
  if (day > tipDay + 1) return { tip: null, why: "not-a-tip-day" };
  if (record?.sent?.[tipDay]) return { tip: null, why: "already-sent" };
  const last = Date.parse(record?.lastAt ?? "");
  if (Number.isFinite(last) && now.getTime() - last < GAP_DAYS * DAY) return { tip: null, why: "too-soon" };
  if (!progress || !Array.isArray(progress.steps)) return { tip: null, why: "no-guide" };
  const done = new Set(progress.done ?? []);
  if (!progress.steps.some((id) => !done.has(id))) return { tip: null, why: "all-done" };
  const tipped = new Set(Object.values(record?.sent ?? {}).map((s) => s.step));
  const step = progress.steps.find((id) => !done.has(id) && !tipped.has(id) && TIPS[id]);
  if (!step) return { tip: null, why: "nothing-new" };
  return { tip: { day: tipDay, step }, why: "due" };
}

/** The signature on a "turn off these tips" link: only the platform can make one for a shop. */
export function offToken(secret, shopId) {
  return createHmac("sha256", secret).update(`trial-tips-off:${shopId}`).digest("base64url");
}

export function createTrialTips({ registry, auditLog, guide, email, store, settings, secret, now = () => new Date() }) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("trial tips need a signing secret of at least 16 characters");
  const offLink = (shopId) => `${settings.platformUrl}/tips/off?shop=${encodeURIComponent(shopId)}&sig=${offToken(secret, shopId)}`;

  const record = async (shopId, entry) => {
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  };

  return {
    offLink,

    /** One run over every shop. Returns what it sent and why it left each other shop alone. */
    async run() {
      const at = now();
      const sent = [];
      const skipped = [];
      for (const row of await registry.listShops()) {
        const shopId = row.shopId;
        try {
          if (row.testShop === true || ["closed", "abandoned"].includes(row.status) || row.billing?.access === "closed") {
            skipped.push({ shopId, why: "not-a-trial-shop" });
            continue;
          }
          // A paused shop's admin opens on Plan & billing only (plan 6.7); its billing emails do the talking.
          if (row.billing?.access === "paused") {
            skipped.push({ shopId, why: "paused" });
            continue;
          }
          const mine = await store.get(shopId);
          const day = trialDay(trialStart(row, settings.trialDays), at);
          // The guide is read only when a tip could be due, so a quiet day reads no shop's database.
          const early = dueTip({ day, progress: { steps: Object.keys(TIPS), done: [] }, record: mine, now: at });
          if (!early.tip) {
            skipped.push({ shopId, why: early.why });
            continue;
          }
          const start = await guide.read(shopId);
          // An owner who hasn't opened the admin since has no saved progress yet: every step is still to do.
          const progress = start ? start.progress ?? { steps: DEFAULT_STEPS, done: [] } : null;
          const { tip, why } = dueTip({ day, progress, record: mine, now: at });
          if (!tip) {
            skipped.push({ shopId, why });
            continue;
          }
          const profile = await registry.getProfile(shopId);
          if (!row.ownerEmail || !profile?.siteUrl || profile.apps?.shop === false) {
            skipped.push({ shopId, why: "no-shop-admin" });
            continue;
          }
          const words = TIPS[tip.step];
          await email.sendPlatform({
            kind: "trial-tip",
            to: row.ownerEmail,
            shopId,
            // The same tip day always has the same key, so the email service never sends it twice either.
            idempotencyKey: `trial-tip-${shopId}-day-${tip.day}`,
            data: { pressName: row.pressName ?? shopId, ...words, link: `${profile.siteUrl}/admin#${words.hash}`, offLink: offLink(shopId) },
          });
          const sentAt = at.toISOString();
          await store.set(shopId, { ...(mine ?? {}), sent: { ...(mine?.sent ?? {}), [tip.day]: { step: tip.step, at: sentAt } }, lastAt: sentAt });
          await record(shopId, { id: `trial-tip-day-${tip.day}`, kind: "trial-tip", day: tip.day, step: tip.step, at: sentAt });
          sent.push({ shopId, ...tip });
        } catch (error) {
          // One shop's failure never stops the others; the next run tries again (nothing was recorded).
          skipped.push({ shopId, why: "failed", error: String(error?.message ?? error) });
        }
      }
      return { sent, skipped };
    },

    /**
     * The page behind the email's link: GET <platform>/tips/off?shop=<id>&sig=<signature>. Answers { status, html }
     * in plain words; a link with a wrong signature changes nothing.
     */
    async handleOff(url) {
      const params = new URL(url, settings.platformUrl).searchParams;
      const result = await this.turnOff(params.get("shop"), params.get("sig"));
      const words = result.ok
        ? "You won't get any more setup tips. Emails about your plan and payments still come, so you never miss a bill."
        : "That link didn't work. Copy the whole link from the email, or reply to any of our emails and we'll turn the tips off for you.";
      return { status: result.ok ? 200 : 400, html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${settings.platformName}</title><p style="font:16px/1.5 Helvetica,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">${words}</p>` };
    },

    /** The email's "turn off these tips" link. Billing emails keep coming: they never pass through here. */
    async turnOff(shopId, sig) {
      const want = Buffer.from(offToken(secret, String(shopId ?? "")));
      const got = Buffer.from(String(sig ?? ""));
      if (!shopId || want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false };
      const mine = await store.get(shopId);
      if (mine?.off) return { ok: true, already: true };
      const offAt = now().toISOString();
      await store.set(shopId, { ...(mine ?? {}), off: true, offAt });
      await record(shopId, { id: `trial-tips-off-${offAt}`, kind: "trial-tips-off", at: offAt });
      return { ok: true };
    },
  };
}
