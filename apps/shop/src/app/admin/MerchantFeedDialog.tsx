import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { FEED_FILE, merchantFeedItems } from "../features/site/merchantFeed.mjs";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { sharedIsbns } from "./catalogList";

const feedUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/${FEED_FILE}`;
const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;

/**
 * Books › Google Shopping feed: the feed's address for Google Merchant Center, whether the
 * deployed site serves it yet, and which published books it leaves out and why. The counts use
 * the same rules as the file the site build writes (features/site/merchantFeed.mjs).
 */
export function MerchantFeedDialog({ open, onClose, books }: { open: boolean; onClose: () => void; books: any[] }) {
  const [live, setLive] = useState<"checking" | "yes" | "no">("checking");
  const feed = useMemo(() => (open ? merchantFeedItems(siteUrl(), books) : { items: [], skipped: [] }), [open, books]);
  const noIsbn = feed.items.filter(i => !i.gtin).length;
  const shared = useMemo(() => (open ? sharedIsbns(books) : []), [open, books]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLive("checking");
    fetch(feedUrl(), { method: "HEAD", cache: "no-store" })
      .then(r => { if (!cancelled) setLive(r.ok && !/text\/html/.test(r.headers.get("content-type") || "") ? "yes" : "no"); })
      .catch(() => { if (!cancelled) setLive("no"); });
    return () => { cancelled = true; };
  }, [open]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(feedUrl()); toast.success("Feed address copied"); }
    catch { toast.error("Couldn't copy. Select the address and copy it instead."); }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Google Shopping feed"
      description="List your books on Google Shopping for free. Google reads this file from your site every day."
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <div className="rp-stack">
        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>Feed address</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <code className="rp-mono" style={{ overflowWrap: "anywhere", userSelect: "all" }}>{feedUrl()}</code>
            <SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={copy}>Copy</SecondaryButton>
          </div>
          <div aria-live="polite">
            {live === "checking" && <StatusBadge tone="neutral">Checking the live site…</StatusBadge>}
            {live === "yes" && <StatusBadge tone="success">Live on your site</StatusBadge>}
            {live === "no" && <StatusBadge tone="warning">Not on the live site yet. It appears after the next site update.</StatusBadge>}
          </div>
          <p className="rp-hint" style={{ margin: 0 }}>The file is rebuilt automatically when you publish book or page changes (usually within 15 minutes).</p>
        </div>

        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>What's in it</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusBadge tone="success">{feed.items.length} listing{feed.items.length === 1 ? "" : "s"}</StatusBadge>
            {feed.skipped.length > 0 && <StatusBadge tone="warning">{feed.skipped.length} left out</StatusBadge>}
            {noIsbn > 0 && <StatusBadge tone="info">{noIsbn} without a valid ISBN-13</StatusBadge>}
          </div>
          <p className="rp-hint" style={{ margin: 0 }}>
            Every published book you can buy today, one listing per edition, in CA$, with its sale price, stock and pre-order date.
            Drafts, scheduled books and gift cards are never listed.
            {noIsbn > 0 && " Books with a valid ISBN-13 match Google's book data and usually show more often."}
          </p>
          {shared.length > 0 && (
            <div role="status" className="rp-stack" style={{ gap: 4 }}>
              <StatusBadge tone="warning">{shared.length} ISBN{shared.length === 1 ? "" : "s"} used by more than one listing</StatusBadge>
              <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }} aria-label="Listings sharing an ISBN">
                {shared.map(s => <li key={s.isbn}><span className="rp-mono">{s.isbn}</span>: {s.titles.join(", ")}. Google may merge or reject these; give each edition its own ISBN.</li>)}
              </ul>
            </div>
          )}
          {feed.skipped.length > 0 && (
            <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: "auto" }} aria-label="Books left out of the feed">
              {feed.skipped.map((s, i) => <li key={`${s.id}-${i}`}><strong>{s.title}</strong>: {s.reason}</li>)}
            </ul>
          )}
        </div>

        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>Connect it to Google (one time)</strong>
          <ol className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Sign in to <a href="https://merchants.google.com" target="_blank" rel="noopener noreferrer">Google Merchant Center</a> and verify your website.</li>
            <li>Go to <strong>Products › Add products › Add product source › Add products from a file</strong>.</li>
            <li>Choose <strong>Enter a link to your file</strong>, paste the feed address above and pick a daily fetch.</li>
            <li>Set your <strong>shipping</strong> and <strong>return policy</strong> in Merchant Center, matching Settings › Shipping. Google needs both before listings go live.</li>
          </ol>
        </div>
      </div>
    </Dialog>
  );
}
