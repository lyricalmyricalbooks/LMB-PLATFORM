// The monthly shop check-up email (code plan 14.9). Once a month each live press gets one short email that says what the
// platform looked at on their shop and what to fix, each with a button to the right page. It shows a press that someone
// is looking after their shop. Words are plain (plan 6.16); the email is the "shop-checkup" template in services/email.
//
// What it looks at (`facts`, read by an injected `inspect(shopId, profile)`; `makeInspector` below reads what the platform
// can see today):
//   products   { total, withoutDescription }   books or products the shop lists and how many have no description
//   brokenLinks  number | null                  links on the shop's pages that lead nowhere (null: not looked at yet)
//   pagesInGoogle number | null                 pages Google has (null until Connect Google is on: shown as "not yet")
//   speed      "good" | "slow" | null           how the shop's pages load on a phone (null: not measured yet)
// A fact that is null is left out of the email rather than guessed.
//
// Clients (all injected; fakes in the tests):
//   registry  listShops(), getProfile(shopId), recordEvent(shopId, entry)
//   auditLog  ready(shopId), write(shopId, id, entry)
//   email     sendPlatform({ kind, to, idempotencyKey, shopId, data })
//   store     get(shopId) -> { sent: { [YYYY-MM]: at }, off } | null; set(shopId, row)
//   inspect   (shopId, profile) -> facts
import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 86_400_000;
const MIN_AGE_DAYS = 14;

export const monthOf = (date) => date.toISOString().slice(0, 7);

/** The signature on a "turn off the check-up" link: only the platform can make one for a shop. */
export const offToken = (secret, shopId) => createHmac("sha256", secret).update(`checkup-off:${shopId}`).digest("base64url");

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Turns the facts into the lines of the email: { id, state: "ok" | "fix", words, fix?: { label, hash } }. */
export function checkupLines(facts) {
  const lines = [];
  const p = facts?.products;
  if (p && Number.isInteger(p.total)) {
    if (p.total === 0) lines.push({ id: "products", state: "fix", words: "Your shop has no books or products listed yet, so there is nothing for a customer to buy.", fix: { label: "Add your first one", hash: "catalog" } });
    else if (p.withoutDescription > 0) lines.push({ id: "products", state: "fix", words: `${plural(p.withoutDescription, "item has", "items have")} no description. A few lines about each helps people choose, and helps your shop show up in searches.`, fix: { label: "Write the descriptions", hash: "catalog" } });
    else lines.push({ id: "products", state: "ok", words: `All ${plural(p.total, "item", "items")} in your shop have a description.` });
  }
  if (Number.isInteger(facts?.brokenLinks)) {
    lines.push(facts.brokenLinks > 0
      ? { id: "links", state: "fix", words: `${plural(facts.brokenLinks, "link on your shop leads", "links on your shop lead")} nowhere. A customer who taps ${facts.brokenLinks === 1 ? "it" : "one"} sees an error.`, fix: { label: "Fix your links", hash: "settings/general" } }
      : { id: "links", state: "ok", words: "Every link we tried on your shop works." });
  }
  if (Number.isInteger(facts?.pagesInGoogle)) {
    lines.push({ id: "google", state: "ok", words: `Google has ${plural(facts.pagesInGoogle, "page", "pages")} from your shop, so people can find you when they search.` });
  }
  if (facts?.speed === "slow") lines.push({ id: "speed", state: "fix", words: "Your shop is slow to open on a phone. Smaller photos usually fix it.", fix: { label: "See your photos", hash: "catalog" } });
  else if (facts?.speed === "good") lines.push({ id: "speed", state: "ok", words: "Your shop opens quickly on a phone." });
  return lines;
}

export function createCheckups({ registry, auditLog, email, store, inspect, settings, secret, now = () => new Date() }) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("the check-up needs a signing phrase of at least 16 characters");
  const offLink = (shopId) => `${settings.platformUrl}/checkup/off?shop=${encodeURIComponent(shopId)}&sig=${offToken(secret, shopId)}`;
  const record = async (shopId, entry) => {
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
  };

  return {
    offLink,

    /** One run over every shop; run it daily, it sends at most once a month per shop. */
    async run() {
      const at = now();
      const month = monthOf(at);
      const sent = [];
      const skipped = [];
      for (const row of await registry.listShops()) {
        const shopId = row.shopId;
        try {
          if (row.testShop === true || ["closed", "abandoned"].includes(row.status) || ["closed", "paused"].includes(row.billing?.access)) { skipped.push({ shopId, why: "not-live" }); continue; }
          if (!row.ownerEmail) { skipped.push({ shopId, why: "no-owner" }); continue; }
          const created = Date.parse(row.createdAt ?? "");
          if (Number.isFinite(created) && at - created < MIN_AGE_DAYS * DAY) { skipped.push({ shopId, why: "too-new" }); continue; }
          const mine = await store.get(shopId);
          if (mine?.off) { skipped.push({ shopId, why: "off" }); continue; }
          if (mine?.sent?.[month]) { skipped.push({ shopId, why: "already-sent" }); continue; }
          const profile = await registry.getProfile(shopId);
          if (!profile?.siteUrl || profile.apps?.shop === false) { skipped.push({ shopId, why: "no-shop-admin" }); continue; }
          const lines = checkupLines(await inspect(shopId, profile));
          if (!lines.length) { skipped.push({ shopId, why: "nothing-to-say" }); continue; }
          await email.sendPlatform({
            kind: "shop-checkup",
            to: row.ownerEmail,
            shopId,
            idempotencyKey: `shop-checkup-${shopId}-${month}`,
            data: { pressName: row.pressName ?? shopId, lines: lines.map(({ fix, ...line }) => ({ ...line, ...(fix ? { fix: { label: fix.label, link: `${profile.siteUrl}/admin#${fix.hash}` } } : {}) })), offLink: offLink(shopId) },
          });
          const sentAt = at.toISOString();
          await store.set(shopId, { ...(mine ?? {}), sent: { ...(mine?.sent ?? {}), [month]: sentAt } });
          await record(shopId, { id: `shop-checkup-${month}`, kind: "shop-checkup", month, fixes: lines.filter((l) => l.state === "fix").length, at: sentAt });
          sent.push({ shopId, month, fixes: lines.filter((l) => l.state === "fix").length });
        } catch (error) {
          skipped.push({ shopId, why: "failed", error: String(error?.message ?? error) });
        }
      }
      return { sent, skipped };
    },

    /** The email's "stop these" link: a right signature turns the check-up off for that shop. */
    async turnOff(shopId, sig) {
      const want = Buffer.from(offToken(secret, String(shopId ?? "")));
      const got = Buffer.from(String(sig ?? ""));
      if (!shopId || want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false };
      const mine = await store.get(shopId);
      if (mine?.off) return { ok: true, already: true };
      const offAt = now().toISOString();
      await store.set(shopId, { ...(mine ?? {}), off: true, offAt });
      await record(shopId, { id: `shop-checkup-off-${offAt}`, kind: "shop-checkup-off", at: offAt });
      return { ok: true };
    },

    async handleOff(url) {
      const params = new URL(url, settings.platformUrl).searchParams;
      const result = await this.turnOff(params.get("shop"), params.get("sig"));
      const words = result.ok
        ? "You won't get the monthly shop check-up any more. Emails about your plan and payments still come, so you never miss a bill."
        : "That link didn't work. Copy the whole link from the email, or reply to any of our emails and we'll turn it off for you.";
      return { status: result.ok ? 200 : 400, html: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${settings.platformName}</title><p style="font:16px/1.5 Helvetica,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">${words}</p>` };
    },
  };
}

/**
 * What the platform can read today: the shop's books (how many, how many have no description) from its own database.
 * Links, Google's pages and speed stay null until their sources are connected (they need real accounts), so the email
 * leaves them out instead of guessing. `shopData` is clients/shop.js `shopDataClient`.
 */
export function makeInspector({ shopData }) {
  return async (shopId) => {
    const books = (await shopData.list(shopId, "books")).filter(({ data }) => data?.status !== "draft");
    return {
      products: { total: books.length, withoutDescription: books.filter(({ data }) => !String(data?.description ?? "").trim()).length },
      brokenLinks: null,
      pagesInGoogle: null,
      speed: null,
    };
  };
}
