import { useMemo, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { googleAnalyticsApi, type SearchConsoleAnswer } from "./googleAnalytics";
import { indexPages, indexStatus, otherCanonical, type Inspection } from "./googleIndex";

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
const when = (iso?: string) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""; };

/**
 * Books › Google indexing: asks Google (Search Console's URL Inspection, through the shop's server) whether each public
 * book page is in its index, and links each one to Search Console, where "Request indexing" lives. Google offers no way
 * for the shop to request indexing itself.
 */
export function GoogleIndexDialog({ open, onClose, books }: { open: boolean; onClose: () => void; books: any[] }) {
  const pages = useMemo(() => (open ? indexPages(books, siteUrl()) : []), [open, books]);
  const [answer, setAnswer] = useState<SearchConsoleAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const byUrl = new Map((answer?.results || []).map(r => [r.url, r as Inspection]));
  const counted = (answer?.results || []).filter(r => !r.error);
  const onGoogle = counted.filter(r => r.verdict === "PASS" || r.verdict === "PARTIAL").length;

  const check = async () => {
    setBusy(true); setError("");
    try {
      const a = await googleAnalyticsApi.searchConsoleInspect(pages.map(p => p.url));
      setAnswer(a);
      if (!a.connected || a.error) setError(a.error || "Search Console isn't connected yet.");
    } catch (err: any) {
      setError(err?.message || "Couldn't ask Google just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Google indexing"
      description="Which of your book pages Google has added to its search results. Only indexed pages can show up when people search a book or an artist's name."
      footer={<><SecondaryButton onClick={onClose}>Close</SecondaryButton><PrimaryButton onClick={() => void check()} disabled={busy || !pages.length}>{busy ? "Asking Google…" : answer ? "Check again" : "Check with Google"}</PrimaryButton></>}>
      <div className="rp-stack">
        {error && <div role="alert"><StatusBadge tone="warning">{error}</StatusBadge>
          {answer?.code === "api_disabled" && answer.enableApiUrl && <p className="rp-hint"><a href={answer.enableApiUrl} target="_blank" rel="noopener noreferrer">Turn on the Search Console API</a></p>}
          {(answer?.code === "no_access" || answer?.code === "pick_site") && <p className="rp-hint">Set it up in Settings › General › Google Search Console.</p>}
        </div>}
        {counted.length > 0 && <div aria-live="polite"><StatusBadge tone={onGoogle === counted.length ? "success" : "info"}>{onGoogle} of {counted.length} pages on Google</StatusBadge></div>}
        <ul className="rp-stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 10 }} aria-label="Pages and their Google status">
          {pages.map(p => {
            const r = byUrl.get(p.url);
            const status = indexStatus(r);
            const other = otherCanonical(r);
            return (
              <li key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--rp-border)", paddingBottom: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{p.title}</strong>{" "}<StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  {r?.coverageState && <span className="rp-hint"> · Google says: {r.coverageState}</span>}
                  {r?.lastCrawlTime && when(r.lastCrawlTime) && <span className="rp-hint"> · last visited {when(r.lastCrawlTime)}</span>}
                  {other && <span className="rp-hint" style={{ display: "block", overflowWrap: "anywhere" }}>Google treats {other} as the main copy of this page.</span>}
                </span>
                {r?.link && <a className="rp-btn rp-btn-ghost rp-btn-sm" href={r.link} target="_blank" rel="noopener noreferrer">
                  {r.verdict === "PASS" ? "Open in Search Console" : "Request indexing in Search Console"}</a>}
              </li>
            );
          })}
        </ul>
        <div className="rp-stack" style={{ gap: 6 }}>
          <strong>Getting a page onto Google</strong>
          <ol className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>{answer?.sitemapsUrl
              ? <>In <a href={answer.sitemapsUrl} target="_blank" rel="noopener noreferrer">Search Console › Sitemaps</a>, submit <span className="rp-mono">sitemap.xml</span> once. Google then rereads it by itself.</>
              : <>In Search Console › Sitemaps, submit <span className="rp-mono">sitemap.xml</span> once. Google then rereads it by itself.</>}</li>
            <li>For a page that isn't on Google yet, open it in Search Console from this list and press <strong>Request indexing</strong>. Google allows a handful a day.</li>
            <li>Google decides when and whether a page is indexed. New pages usually take a few days to a few weeks; links from the artist's own website speed it up.</li>
          </ol>
        </div>
      </div>
    </Dialog>
  );
}
