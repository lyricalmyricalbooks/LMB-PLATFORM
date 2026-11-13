// Website orders in the stockroom, inside the admin: `WebsiteOrdersAuto` runs the link in the owner's admin (combined
// admin only, mounted by Dashboard), and `WebsiteOrdersCard` (on Stock and sales) says what it did and asks about the
// orders it can't place alone. The rules are the stockroom's own (websiteLink.ts, websiteLinkRun.ts).
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { promisedPreorders, type WebPlan, type WebReason } from "@stockroom/website-link.js";
import { fmt, fmtD } from "@stockroom/money.js";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";

import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { useShopWords } from "../shopWords";
import { datedRate, keptRates } from "./datedRates";
import { loadLinkBooks } from "./stockroomData";
import { onStockroomSaved, stockroomWriteApi } from "./stockroomWrite";
import { createWebsiteLinkRunner, decide, linkView, lookAgain, subscribeLink, type RunDeps } from "./websiteLinkRun";
import { liveWebsiteLinkIO } from "./websiteLinkStore";
import "./websiteOrders.css";
import { SHOP_CURRENCY } from "../moneySign";

/** What the runner uses; the admin fixture swaps `io` and `loadBooks` for sample ones. */
export const websiteLinkApi: { deps: () => RunDeps } = {
  deps: () => {
    const rates = keptRates();
    return {
      link: liveWebsiteLinkIO(),
      loadBooks: () => loadLinkBooks(),
      saveBook: (id, mutate) => stockroomWriteApi.saveBookState(id, mutate),
      rate: (cur, day) => datedRate(cur, SHOP_CURRENCY, day, { cache: rates }),
      rates: () => rates,
      onSaved: onStockroomSaved,
    };
  },
};

export function WebsiteOrdersAuto() {
  useEffect(() => createWebsiteLinkRunner(websiteLinkApi.deps()).start(), []);
  return null;
}

const ago = (iso: string) => {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "Not yet";
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return fmtD(iso.slice(0, 10));
};

function ReasonBlock({ plan, reason, titleOf, currencyOf }: { plan: WebPlan; reason: WebReason; titleOf: (id?: string) => string; currencyOf: (id?: string) => string }) {
  const w = useShopWords();
  const title = titleOf(reason.bookId);
  const cands = reason.candidates ?? [];
  const sold = (() => {
    const c = cands[0]?.row;
    return c ? Number(c.qty) || 0 : 0;
  })();
  const words: Record<string, string> = {
    weak: `${cands.length > 1 ? "Sales" : "A sale"} of ${title} within three days of this order, with the same copies and ${cands[0]?.sameEmail && cands[0]?.sameAmount ? "the same customer email and amount" : cands[0]?.sameEmail ? "the same customer email" : "the same amount"}, ${cands.length > 1 ? "are already in your books. Is one of them this order?" : "is already in your books. Is it this order?"}`,
    qty: `Your books have this order under ${title}, but with ${sold} ${sold === 1 ? "copy" : "copies"}. The website’s numbers differ.`,
    voided: `You voided this order’s sale of ${title} here, but the website says it is still paid for.`,
    several: `More than one sale of ${title} has this order number. Pick the one that is this order, or add the website’s as a separate sale.`,
    book: `This order is also recorded under ${title}, which the website didn’t sell on it.`,
    rate: `${title} is priced in ${reason.currency}, and the exchange rate for ${fmtD(reason.day || "")} couldn’t be loaded yet. It tries again by itself.`,
    "refund-currency": `The website refunded part of this order in ${reason.currency || "another currency"}, so the sale’s money can’t be worked out. Check the refund on the website.`,
    "unknown-book": w("The website sold a book that isn’t in your stockroom any more."),
    version: "This order came from a newer version of the website. Reload the admin and it comes in by itself.",
    status: "The website sent a payment state the admin doesn’t know yet. Reload the admin.",
    empty: "The website sent an order with nothing in it.",
  };
  const choosing = ["weak", "qty", "voided", "several", "book"].includes(reason.reason);
  const row = (r: Record<string, any>) => [fmtD(r.date), `${Number(r.qty) || 0} × ${fmt(Number(r.price) || 0, currencyOf(reason.bookId))}`, r.num ? `order ${r.num}` : "", r.shipName || "", r.voided ? "voided" : ""].filter(Boolean).join(" · ");
  return (
    <div className="rp-wl-reason">
      <p>{words[reason.reason] ?? words.empty}</p>
      {!!cands.length && <ol className="rp-wl-cands">{cands.map((c) => <li key={c.key}>{row(c.row)}</li>)}</ol>}
      <div className="rp-wl-actions">
        {choosing && cands.map((c, i) => (
          <PrimaryButton key={c.key} size="sm" onClick={() => decide(plan.orderId, String(reason.bookId), "same", c.key)}>{cands.length > 1 ? `Same sale as #${i + 1}` : "Same sale, link them"}</PrimaryButton>
        ))}
        {choosing && <SecondaryButton size="sm" onClick={() => decide(plan.orderId, String(reason.bookId), "different")}>{reason.reason === "book" ? "Different sales, keep that one" : "Different sales, add it"}</SecondaryButton>}
        {reason.reason === "rate" && <SecondaryButton size="sm" onClick={() => lookAgain()}>Try again</SecondaryButton>}
      </div>
    </div>
  );
}

export function WebsiteOrdersCard() {
  const w = useShopWords();
  const view = useSyncExternalStore(subscribeLink, linkView, linkView);
  const catalog = view.books?.catalog ?? {};
  const titleOf = (id?: string) => (id && catalog[id]?.title) || id || w("this book");
  const currencyOf = (id?: string) => bookCurrencyCode(id ? catalog[id] : null);
  const promised = useMemo(() => Object.entries(view.books?.records.states ?? {})
    .map(([id, s]) => ({ id, ...promisedPreorders(((s as { hist?: unknown[] }).hist) || []) }))
    .filter((b) => b.copies > 0)
    .sort((a, b) => b.copies - a.copies), [view.books]);
  if (!view.ready && !view.error) return null;
  const websiteOrders = Object.values(view.books?.records.states ?? {}).reduce<Set<string>>((set, s) => {
    for (const h of ((s as { hist?: Array<Record<string, any>> }).hist) || []) if (h?.webOrderId && !h.voided) set.add(String(h.webOrderId));
    return set;
  }, new Set()).size;
  const run = view.lastRun ? [view.lastRun.added && `${view.lastRun.added} added`, view.lastRun.linked && `${view.lastRun.linked} linked`, view.lastRun.updated && `${view.lastRun.updated} updated`].filter(Boolean).join(" · ") : "";
  const needs = view.review.length;
  return (
    <SectionCard title="Website orders" foldKey="stockroom-website-orders"
      actions={needs ? <StatusBadge tone="warning">{needs} need you</StatusBadge> : view.running ? <StatusBadge tone="info" glyph={false}>Bringing in…</StatusBadge> : <StatusBadge tone="success">Up to date</StatusBadge>}>
      <div className="rp-wl">
        {!!view.error && <p className="rp-wl-error" role="alert">{view.error}</p>}
        {!!view.publishError && <p className="rp-wl-error" role="status">{view.publishError}</p>}
        <dl className="rp-wl-facts">
          <div><dt>Last brought in</dt><dd>{ago(view.lastImportAt)}</dd>{run && <dd className="rp-wl-sub">{run}</dd>}</div>
          <div><dt>Website orders</dt><dd>{websiteOrders.toLocaleString("en-US")}</dd></div>
          <div><dt>Stock sent to the website</dt><dd>{ago(view.lastFeedAt)}</dd></div>
        </dl>
        {needs > 0 && (
          <div className="rp-wl-section">
            <h3>Needs you</h3>
            <p className="rp-wl-note">Nothing is added for these until you choose.</p>
            <ul className="rp-wl-list">
              {view.review.map((plan) => (
                <li key={plan.orderId}>
                  <p className="rp-wl-head"><strong>{plan.num || plan.orderId}</strong> <span>{[plan.customer, fmtD(plan.day)].filter(Boolean).join(" · ")}</span></p>
                  {plan.reasons.map((r, i) => <ReasonBlock key={`${r.reason}-${r.bookId ?? i}`} plan={plan} reason={r} titleOf={titleOf} currencyOf={currencyOf} />)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(view.blocked.length > 0 || view.waitingOnLoad > 0) && (
          <p className="rp-wl-note">
            {view.blocked.length > 0 && w(`These books are still in the older storage, so their website orders wait: ${view.blocked.map((id) => titleOf(id)).join(", ")}. Ask us to move them. `)}
            {view.waitingOnLoad > 0 && `${view.waitingOnLoad} ${view.waitingOnLoad === 1 ? "order is" : "orders are"} waiting for a book that didn’t load.`}
          </p>
        )}
        {view.more > 0 && <p className="rp-wl-note">{view.more} more come in on the next run.</p>}
        {promised.length > 0 && (
          <div className="rp-wl-section">
            <h3>Pre-orders promised</h3>
            <ul className="rp-wl-points">{promised.map((b) => <li key={b.id}>{titleOf(b.id)}: {b.copies} {b.copies === 1 ? "copy" : "copies"} for {b.orders} {b.orders === 1 ? "pre-order" : "pre-orders"}</li>)}</ul>
          </div>
        )}
        {view.error && <div className="rp-wl-actions"><GhostButton size="sm" onClick={() => lookAgain()}>Try again</GhostButton></div>}
      </div>
    </SectionCard>
  );
}
