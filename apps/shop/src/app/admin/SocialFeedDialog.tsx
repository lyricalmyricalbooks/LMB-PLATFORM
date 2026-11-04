import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { SOCIAL_FEED_FILE, merchantFeedItems } from "../features/site/merchantFeed.mjs";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { useShopWords } from "./shopWords";
import { productSegment } from "../lib/productHref";

const base = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
const feedUrl = () => `${base()}/${SOCIAL_FEED_FILE}`;

/**
 * Books › Instagram, Facebook and Pinterest (code plan 24.7): the address of the product file Meta's Commerce Manager
 * (Facebook and Instagram shopping) and Pinterest's catalogs fetch every day, whether the live site serves it yet, and
 * the one-time steps. The file holds the same listings as the Google Shopping feed (features/site/merchantFeed.mjs).
 */
export function SocialFeedDialog({ open, onClose, books }: { open: boolean; onClose: () => void; books: any[] }) {
  const w = useShopWords();
  const [live, setLive] = useState<"checking" | "yes" | "no">("checking");
  const feed = useMemo(() => (open ? merchantFeedItems(base(), books, { productBase: productSegment() }) : { items: [], skipped: [] }), [open, books]);

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
    <Dialog open={open} onClose={onClose} size="lg" title="Instagram, Facebook and Pinterest"
      description={w("Let people buy your books from your posts and pins. Facebook, Instagram and Pinterest read this file from your site every day.")}
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <div className="rp-stack">
        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>Feed address</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <code className="rp-mono" style={{ overflowWrap: "anywhere", userSelect: "all", minWidth: 0, flex: "1 1 200px" }}>{feedUrl()}</code>
            <SecondaryButton size="sm" icon={<Copy size={14} aria-hidden />} onClick={copy}>Copy</SecondaryButton>
          </div>
          <div aria-live="polite">
            {live === "checking" && <StatusBadge tone="neutral">Checking the live site…</StatusBadge>}
            {live === "yes" && <StatusBadge tone="success">Live on your site</StatusBadge>}
            {live === "no" && <StatusBadge tone="warning">Not live yet</StatusBadge>}
          </div>
          {live === "no" && <p className="rp-hint" style={{ margin: 0 }}>The file appears on your site after the next site update.</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusBadge tone="success">{feed.items.length} listing{feed.items.length === 1 ? "" : "s"}</StatusBadge>
            {feed.skipped.length > 0 && <StatusBadge tone="warning">{feed.skipped.length} left out</StatusBadge>}
          </div>
          <p className="rp-hint" style={{ margin: 0 }}>
            {w("The same listings as your Google Shopping feed: every published book you can buy today, one per edition, with its price, sale and stock. It updates when you publish changes.")}
            {feed.skipped.length > 0 && " Items left out have no price or no photo; both sites need a photo."}
          </p>
        </div>

        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>Facebook and Instagram (one time)</strong>
          <ol className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Open <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer">Meta Commerce Manager</a> and create a catalog for your shop. Facebook and Instagram share it.</li>
            <li>In the catalog, add items with a <strong>data feed</strong> and choose a <strong>scheduled feed</strong>.</li>
            <li>Paste the feed address above, pick a daily update and Canadian dollars.</li>
            <li>Once the items are in, turn on shopping for your Facebook Page and Instagram account to tag them in posts.</li>
          </ol>
        </div>

        <div className="rp-stack" style={{ gap: 8 }}>
          <strong>Pinterest (one time)</strong>
          <ol className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Use a free <a href="https://business.pinterest.com" target="_blank" rel="noopener noreferrer">Pinterest business account</a> and claim your website.</li>
            <li>Open <strong>Catalogs</strong> and add a data source.</li>
            <li>Paste the feed address above, choose CSV, Canadian dollars and a daily update.</li>
          </ol>
        </div>
      </div>
    </Dialog>
  );
}
