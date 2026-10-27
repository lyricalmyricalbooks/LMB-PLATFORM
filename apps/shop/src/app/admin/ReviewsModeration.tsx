import { useEffect, useMemo, useState } from "react";
import { Check, Mail, MessageSquare, Pin, PinOff, Star, Trash2, X } from "lucide-react";
import { adminApi } from "./api";
import { getOrdersCached } from "./ordersCache";
import { filterReviews, isVerifiedPurchase, moderationOutcome, purchaseIndex, reviewStats } from "./reviewInsights";
import { resolveProductRoutes } from "../features/site/productRoutes";
import { db } from "../../lib/firebase";
import { reviewsApi, type Review } from "../lib/reviews";
import { loadMorePending, loadReviewQueue, PENDING_PAGE, type QueueDoc } from "./reviewQueue";
import {
  ActionMenu, Checkbox, ConfirmButton, ConfirmDialog, Dialog, EmptyState, ErrorState, FilterBar, IconButton, LoadingState, MetricCard, PrimaryButton,
  SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, Tabs, TextArea, ToastProvider, useRisoToast, type BadgeTone,
} from "./riso/components";

type Filter = "pending" | "approved" | "rejected" | "all";
const TONE: Record<Review["status"], BadgeTone> = { approved: "success", rejected: "danger", pending: "warning" };
const STATUS_WORD: Record<Review["status"], string> = { approved: "Approved", rejected: "Rejected", pending: "Pending" };

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} out of 5 stars`} style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} aria-hidden style={{ color: n <= rating ? "var(--rp-warning)" : "var(--rp-border)" }}
          fill={n <= rating ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

function Queue() {
  const toast = useRisoToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Review | null>(null);
  const [q, setQ] = useState("");
  const [rating, setRating] = useState("all");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [replying, setReplying] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");
  // The browse list is capped at the newest 200; pending reviews load one page at a time (reviewQueue.ts).
  const [capped, setCapped] = useState(false);
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [cursor, setCursor] = useState<QueueDoc | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Reviewer emails are read one review at a time, only when the owner asks to see one.
  const [emails, setEmails] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError(false);
    try {
      // Newest 200 for browsing, plus the newest page of pending reviews (more on request) and the true pending count.
      const page = await loadReviewQueue(db);
      setCapped(page.recent.length >= 200);
      setPendingTotal(page.pendingTotal);
      setCursor(page.cursor);
      const byId = new Map<string, Review>();
      for (const d of [...page.recent, ...page.pending]) byId.set(d.id, { id: d.id, ...(d.data() as any) });
      setReviews([...byId.values()].sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    } catch { setError(true); } finally { setLoading(false); }
  }

  async function morePending() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await loadMorePending(db, cursor);
      setCursor(next.cursor);
      setReviews((current) => {
        const byId = new Map(current.map((r) => [r.id, r] as const));
        for (const d of next.docs) byId.set(d.id, { id: d.id, ...(d.data() as any) });
        return [...byId.values()].sort((a: any, b: any) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      });
    } catch { toast("Could not load more pending reviews."); } finally { setLoadingMore(false); }
  }

  async function showEmail(r: Review) {
    try {
      const found = await reviewsApi.contactsFor([r]);
      setEmails((current) => ({ ...current, [r.id]: found[r.id] || "(no email left)" }));
    } catch { toast("Could not load the reviewer's email. Choose More › Show email again.", { tone: "err" }); }
  }
  useEffect(() => { load(); }, []);
  // Book titles are a nicety: if they fail to load, fall back to the raw book ID.
  useEffect(() => {
    adminApi.getAllBooks().then((bs: any[]) => {
      setTitles(Object.fromEntries(bs.map((b) => [b.id, b.title || b.id])));
      // The same collision-safe public URL the storefront uses.
      setSlugs(Object.fromEntries(resolveProductRoutes(bs).map((b: any) => [b.id, b.slug])));
    }).catch(() => {});
    // Paid orders, to mark reviews by people who bought the book. Best-effort.
    getOrdersCached().then(setOrders).catch(() => {});
  }, []);
  const purchases = useMemo(() => purchaseIndex(orders), [orders]);
  const verified = (r: Review) => isVerifiedPurchase(r, purchases);
  const bookUrl = (id: string) => `${import.meta.env.BASE_URL}books/${encodeURIComponent(slugs[id] || id)}`;
  const stats = useMemo(() => reviewStats(reviews), [reviews]);

  const counts = useMemo(() => ({
    pending: pendingTotal ?? reviews.filter((r) => r.status === "pending").length,
    approved: reviews.filter((r) => r.status === "approved").length,
    rejected: reviews.filter((r) => r.status === "rejected").length,
    all: reviews.length,
  }), [reviews]);
  const list = useMemo(() => filterReviews(reviews, { status: filter, rating, q, titles }), [reviews, filter, rating, q, titles]);
  const allSelected = list.length > 0 && list.every((r) => selected.has(r.id));

  const moderate = async (ids: string[], status: Review["status"]) => {
    const previous = new Map(reviews.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.status]));
    // Each review is its own write: some can succeed while others fail. Report both and
    // always reload, so the list never shows a state that isn't saved.
    // Approving stamps the public "Verified purchase" mark from the reviewer's paid orders.
    const byId = new Map(reviews.map((r) => [r.id, r]));
    const results = await Promise.allSettled(ids.map((id) => reviewsApi.setStatus(id, status,
      status === "approved" && byId.get(id) ? { verified: verified(byId.get(id)!) } : {})));
    const { done, failed, message } = moderationOutcome(ids, results, status);
    setSelected(new Set(failed));
    toast(message, {
      ...(failed.length ? { tone: done.length ? "warn" as const : "err" as const } : {}),
      ...(done.length ? {
        actionLabel: "Undo",
        onAction: async () => {
          await Promise.allSettled(done.map((id) => reviewsApi.setStatus(id, previous.get(id) || "pending")));
          load();
        },
      } : {}),
    });
    load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try { await reviewsApi.remove(id); toast("Review deleted"); } catch { toast("The review wasn't deleted. Try again.", { tone: "err" }); }
    load();
  };

  const saveReply = async (approve = false) => {
    if (!replying) return;
    const review = replying;
    setReplying(null);
    try {
      await reviewsApi.setReply(review.id, replyText);
    } catch { toast("Could not save the reply.", { tone: "err" }); load(); return; }
    if (approve) {
      try { await reviewsApi.setStatus(review.id, "approved", { verified: verified(review) }); }
      catch { toast("The reply was saved, but the review couldn't be approved. Approve it again from the list.", { tone: "err" }); load(); return; }
    }
    toast(approve ? "Reply saved and review approved" : replyText.trim() ? "Reply published" : "Reply removed");
    load();
  };

  const toggleFeatured = async (r: Review) => {
    try {
      await reviewsApi.setFeatured(r.id, !r.featured);
      toast(r.featured ? "Review unpinned" : "Review pinned to the top of the book page");
    } catch { toast("The pin wasn't changed. Try again.", { tone: "err" }); }
    load();
  };

  // Only reviews visible in the current search/rating view: a narrowed search must never
  // approve or reject reviews the owner can no longer see.
  const bulk = list.map((r) => r.id).filter((id) => selected.has(id));

  return (
    <div className="rp-stack">
      <div className="rp-kpi-grid">
        <MetricCard label="Average rating" value={stats.average ? `${stats.average.toFixed(1)} ★` : "—"} footer={`${stats.total} review${stats.total === 1 ? "" : "s"} · ${stats.approvedAverage ? stats.approvedAverage.toFixed(1) : "—"} approved only`} />
        <MetricCard label="Low-rated pending" value={stats.lowPending} tone={stats.lowPending ? "warn" : undefined} footer="1–2 stars awaiting a decision" />
        <MetricCard label="Awaiting a reply" value={stats.unanswered} footer="Approved with no owner reply" />
      </div>
      <Tabs<Filter> label="Review status" value={filter} onChange={(f) => { setFilter(f); setSelected(new Set()); }}
        tabs={(["pending", "approved", "rejected", "all"] as const).map((f) => {
          const label = f[0].toUpperCase() + f.slice(1);
          // Only pending is complete once the newest-200 cap is hit; say so instead of a wrong total.
          return capped && f !== "pending" ? { id: f, label: `${label} · ${counts[f]}+` } : { id: f, label, count: counts[f] };
        })} />

      <FilterBar>
        <div className="rp-grow"><SearchField label="Search reviews" placeholder="Search reviewer, book or text…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectField label="Rating" hideLabel value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
        </SelectField>
      </FilterBar>

      <SectionCard flush collapsible={false} title="Moderation queue" description={`${list.length} review${list.length === 1 ? "" : "s"} in this view`}
        actions={list.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Checkbox label="Select all" checked={allSelected}
              onChange={(e) => setSelected(e.target.checked ? new Set(list.map((r) => r.id)) : new Set())} />
            <SecondaryButton size="sm" disabled={!bulk.length} onClick={() => moderate(bulk, "approved")}>{bulk.length ? `Approve ${bulk.length} selected` : "Approve selected"}</SecondaryButton>
            <SecondaryButton size="sm" disabled={!bulk.length} onClick={() => moderate(bulk, "rejected")}>{bulk.length ? `Reject ${bulk.length} selected` : "Reject selected"}</SecondaryButton>
          </div>
        )}>
        {loading ? <LoadingState label="Loading reviews…" />
          : error ? <ErrorState description="Reviews could not be loaded." onRetry={load} />
          : list.length === 0 ? (
            (q.trim() || rating !== "all") ? (
              <EmptyState title="No reviews match" description="Nothing in this tab matches your search or star filter."
                action={<SecondaryButton onClick={() => { setQ(""); setRating("all"); }}>Clear search and filter</SecondaryButton>} />
            ) : (
              <EmptyState title={filter === "pending" ? "All caught up" : "No reviews here"}
                description={filter === "pending" ? "New customer reviews wait here until you approve them. Nothing shows on the shop before that." : "Nothing has this status yet."} />
            )
          ) : (
            <ul className="rp-list" aria-label="Reviews">
              {list.map((r) => (
                <li key={r.id}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 12, minWidth: 0, flex: "1 1 320px" }}>
                      <Checkbox label="" aria-label={`Select review by ${r.authorName}`} checked={selected.has(r.id)}
                        onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                      <div style={{ minWidth: 0 }}>
                        <div className="rp-row-meta" style={{ marginBottom: 8 }}>
                          <Stars rating={r.rating} />
                          <StatusBadge tone={TONE[r.status as Review["status"]]}>{STATUS_WORD[r.status as Review["status"]] || r.status}</StatusBadge>
                          {verified(r) && <StatusBadge tone="success">✓ Verified purchase</StatusBadge>}
                          {r.featured && <StatusBadge tone="info">Pinned to top</StatusBadge>}
                          <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time>
                        </div>
                        {r.title && <h3 style={{ margin: "0 0 4px", fontSize: "var(--rp-text-base)", fontWeight: 600 }}>{r.title}</h3>}
                        <p style={{ margin: "0 0 8px", lineHeight: 1.55, overflowWrap: "anywhere" }}>{r.body}</p>
                        <p className="rp-hint" style={{ margin: 0 }}>{r.authorName}{emails[r.id] ? ` · ${emails[r.id]}` : ""} · on <a href={bookUrl(r.bookId)} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>{titles[r.bookId] || r.bookId}</a></p>
                        {r.reply?.body && <p className="rp-hint" style={{ margin: "8px 0 0", borderLeft: "2px solid var(--rp-border-strong)", paddingLeft: 8 }}>Your reply: {r.reply.body}</p>}
                      </div>
                    </div>
                    {/* The decision first (worded buttons), then Reply, then the rarely used actions under More. */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {r.status !== "approved" && <ConfirmButton size="sm" icon={<Check size={16} aria-hidden />} aria-label={`Approve review by ${r.authorName}`} onClick={() => moderate([r.id], "approved")}>Approve</ConfirmButton>}
                      {r.status !== "rejected" && <SecondaryButton size="sm" icon={<X size={16} aria-hidden />} aria-label={`Reject review by ${r.authorName}`} onClick={() => moderate([r.id], "rejected")}>Reject</SecondaryButton>}
                      <IconButton label={`${r.reply?.body ? "Edit reply to" : "Reply to"} review by ${r.authorName}`} onClick={() => { setReplying(r); setReplyText(r.reply?.body || ""); }}><MessageSquare size={18} aria-hidden /></IconButton>
                      <ActionMenu label={`More actions for review by ${r.authorName}`} actions={[
                        ...(!emails[r.id] ? [{ label: "Show email", icon: <Mail size={16} aria-hidden />, onSelect: () => { void showEmail(r); } }] : []),
                        { label: r.featured ? "Unpin from top of book page" : "Pin to top of book page", icon: r.featured ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />, onSelect: () => { void toggleFeatured(r); } },
                        { label: "Delete review…", tone: "danger" as const, icon: <Trash2 size={16} aria-hidden />, onSelect: () => setDeleting(r) },
                      ]} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        {cursor && !loading && !error && filter === "pending" && (
          <div style={{ padding: 12 }}>
            <SecondaryButton size="sm" disabled={loadingMore} onClick={morePending}>
              {loadingMore ? "Loading…" : `Load ${PENDING_PAGE} more pending reviews`}
            </SecondaryButton>
          </div>
        )}
      </SectionCard>

      {stats.total > 0 && (
        <SectionCard title="Rating spread" description={capped ? "Newest 200 reviews plus the pending ones loaded" : "All reviews"}>
          <ul aria-label="Reviews by star rating" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {[5, 4, 3, 2, 1].map((n) => {
              const count = stats.distribution[n - 1] || 0;
              const max = Math.max(1, ...stats.distribution);
              return (
                <li key={n} style={{ display: "grid", gridTemplateColumns: "56px 1fr 40px", gap: 8, alignItems: "center" }}>
                  <span className="rp-hint">{n} star{n === 1 ? "" : "s"}</span>
                  <span aria-hidden style={{ height: 10, border: "1px solid var(--rp-border)", background: "var(--rp-surface, transparent)" }}>
                    <span style={{ display: "block", height: "100%", width: `${(count / max) * 100}%`, background: "var(--rp-warning)" }} />
                  </span>
                  <span className="rp-mono" style={{ textAlign: "right" }}>{count}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
      <Dialog open={!!replying} onClose={() => setReplying(null)} title="Reply publicly" description="Shown under the review on the book page once the review is approved. Leave empty to remove your reply."
        footer={<>
          <SecondaryButton onClick={() => setReplying(null)}>Cancel</SecondaryButton>
          {replying && replying.status !== "approved"
            ? <><SecondaryButton onClick={() => saveReply(false)}>Save reply</SecondaryButton><PrimaryButton onClick={() => saveReply(true)}>Save &amp; approve</PrimaryButton></>
            : <PrimaryButton onClick={() => saveReply(false)}>Save reply</PrimaryButton>}
        </>}>
        <TextArea label="Your reply" rows={4} maxLength={1000} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
      </Dialog>

      <ConfirmDialog open={!!deleting} title="Delete this review?" confirmLabel="Delete review"
        message="This permanently removes the review. Reject it instead if you may want to reverse the decision."
        onConfirm={confirmDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}

export default function ReviewsModeration() {
  // Own provider: keeps the module usable wherever it is mounted.
  return <ToastProvider><Queue /></ToastProvider>;
}
