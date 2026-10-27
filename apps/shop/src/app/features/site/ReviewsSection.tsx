import { regionProps } from "./storefrontRegions";
import { useEffect, useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { reviewsApi, type Review } from "../../lib/reviews";
import { useSiteData } from "./useSiteData";
import { getCopy } from "./storeCopy";

function Stars({ value, onChange, size = 16, design }: { value: number; onChange?: (v: number) => void; size?: number; design?: any }) {
  const interactive = !!onChange;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          aria-label={getCopy(design, n > 1 ? "reviewsStarMany" : "reviewsStarOne", { n })}
          className={interactive ? "cursor-pointer" : "cursor-default"}
        >
          <Star
            size={size}
            className={n <= value ? "text-amber-400" : "text-white/15"}
            fill={n <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

/** Pinned ("featured") reviews first, otherwise newest first as loaded. */
export function featuredFirst<T extends { featured?: boolean }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.featured === true) - Number(a.featured === true));
}

export function ReviewsSummary({ count, average }: { count: number; average: number }) {
  const { settings } = useSiteData();
  const c = (k: string, v?: Record<string, string | number>) => getCopy(settings?.design, k, v);
  if (!count) {
    return (
      <p className="text-[9px] font-black tracking-widest text-white/30 uppercase">{c("reviewsNone")}</p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Stars value={Math.round(average)} size={14} design={settings?.design} />
      <span className="text-[10px] font-black tracking-widest text-white/60 uppercase">
        {average.toFixed(1)} · {c(count === 1 ? "reviewsCountOne" : "reviewsCountMany", { count })}
      </span>
    </div>
  );
}

export default function ReviewsSection({ bookId, hideHeader = false }: { bookId: string; hideHeader?: boolean }) {
  const { settings } = useSiteData();
  const c = (k: string, v?: Record<string, string | number>) => getCopy(settings?.design, k, v);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  // Firestore's own count and average of ALL approved reviews (the list below is paged, 50 at a time).
  const [summary, setSummary] = useState<{ count: number; average: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // A failed read says so (with Try again) instead of looking like a book nobody has reviewed.
  const [loadError, setLoadError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [authorName, setAuthorName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    setLoading(true);
    setLoadError(false);
    setMoreError(false);
    try {
      const [list, total] = await Promise.all([reviewsApi.listApproved(bookId), reviewsApi.summary(bookId).catch(() => null)]);
      setReviews(featuredFirst(list));
      setSummary(total);
    } catch {
      setReviews([]);
      setSummary(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  // Older approved reviews beyond the first page.
  async function loadMore() {
    const oldest = [...reviews].map(r => r.createdAt).sort()[0];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const more = await reviewsApi.listApprovedBefore(bookId, oldest);
      setReviews(current => featuredFirst([...current, ...more.filter(m => !current.some(r => r.id === m.id))]));
    } catch { setMoreError(true); /* the button stays; the shopper can try again */ } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (bookId) load();
  }, [bookId]);

  const aggregate = summary && summary.count >= reviews.length && summary.count > 0
    ? summary
    : reviews.length
      ? { count: reviews.length, average: reviews.reduce((a, r) => a + r.rating, 0) / reviews.length }
      : { count: 0, average: 0 };
  const hasMore = !!summary && summary.count > reviews.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!authorName.trim() || !body.trim()) {
      setError(c("reviewsErrRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await reviewsApi.create({
        bookId,
        authorName: authorName.trim(),
        email: email.trim(),
        rating,
        title: title.trim(),
        body: body.trim(),
      });
      setSubmitted(true);
      setBody("");
      setTitle("");
      setAuthorName("");
      setEmail("");
      setRating(5);
    } catch (err: any) {
      setError(c("reviewsError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={hideHeader ? "w-full" : "border-t border-white/[0.06] mt-16"}>
      <div className={hideHeader ? "w-full" : "max-w-4xl mx-auto px-6 py-16"}>
        {!hideHeader && (
          <header {...regionProps("reviewsHeading")} className="flex items-center justify-between mb-10">
            <div>
              <p className="text-[9px] font-black tracking-[0.4em] uppercase text-white/30 mb-2">{c("reviewsHeading")}</p>
              {!loadError && <ReviewsSummary count={aggregate.count} average={aggregate.average} />}
            </div>
          </header>
        )}

        {loading ? (
          <p {...regionProps("reviewsEmpty")} className="text-[10px] tracking-widest text-white/30 uppercase">{c("reviewsLoading")}</p>
        ) : loadError ? (
          <div {...regionProps("reviewsEmpty")} role="alert" className="mb-12 flex flex-wrap items-center gap-4">
            <p className="text-white/60 text-sm">{c("reviewsLoadError")}</p>
            <button type="button" onClick={load} className="text-[10px] tracking-[0.3em] font-bold uppercase underline underline-offset-4">{c("reviewsRetry")}</button>
          </div>
        ) : reviews.length === 0 ? (
          <p {...regionProps("reviewsEmpty")} className="text-white/40 text-sm mb-12">{c("reviewsEmpty")}</p>
        ) : (
          <ul {...regionProps("reviewsList")} className="space-y-8 mb-16">
            {reviews.map(r => (
              <li key={r.id} className="border-t border-white/[0.06] pt-8 first:border-t-0 first:pt-0">
                {r.featured === true && (
                  <p {...regionProps("reviewsFeatured")} className="text-[9px] tracking-widest uppercase mb-2" style={{ color: "var(--accent)" }}>{c("reviewsFeatured")}</p>
                )}
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-3">
                    <Stars value={r.rating} size={13} design={settings?.design} />
                    {r.verified === true && (
                      <span {...regionProps("reviewsVerified")} className="inline-flex items-center gap-1 text-[9px] tracking-widest uppercase text-white/50">
                        <CheckCircle2 size={11} aria-hidden /> {c("reviewsVerified")}
                      </span>
                    )}
                  </span>
                  <span {...regionProps("reviewsDate")} className="text-[9px] tracking-widest text-white/30 uppercase">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.title && <h4 {...regionProps("reviewsTitle")} className="text-sm font-bold text-white mb-2">{r.title}</h4>}
                <p {...regionProps("reviewsBody")} className="text-white/70 text-sm leading-relaxed mb-3">{r.body}</p>
                <p {...regionProps("reviewsAuthor")} className="text-[10px] tracking-widest text-white/40 uppercase">{c("reviewsAuthor", { author: r.authorName })}</p>
                {r.reply?.body && (
                  <div {...regionProps("reviewsReply")} className="mt-4 border-l-2 border-white/20 pl-3">
                    <p className="text-[10px] tracking-widest text-white/50 uppercase mb-1">{c("reviewsReply")}</p>
                    <p className="text-white/70 text-sm leading-relaxed">{r.reply.body}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div {...regionProps("reviewsMore")} className="mb-12">
            <button type="button" onClick={loadMore} disabled={loadingMore}
              className="px-6 py-3 rounded-full border border-white/20 text-[10px] tracking-[0.3em] font-bold uppercase disabled:opacity-50">
              {c("reviewsMore")}
            </button>
            {moreError && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{c("reviewsMoreError")}</p>}
          </div>
        )}

        <div {...regionProps("reviewsForm")} className="border border-white/10 rounded-3xl p-8 bg-white/[0.02]">
          {submitted ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--success)" }}>
              <CheckCircle2 size={18} />
              <span>{c("reviewsThanks")}</span>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <h3 className="text-lg font-bold tracking-tight">{c("reviewsWrite")}</h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] tracking-widest uppercase text-white/40">{c("reviewsRating")}</span>
                <Stars value={rating} onChange={setRating} design={settings?.design} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  required
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  maxLength={80}
                  placeholder={c("reviewsName")}
                  className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30"
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  maxLength={254}
                  placeholder={c("reviewsEmail")}
                  className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30"
                />
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={200}
                placeholder={c("reviewsHeadline")}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30"
              />
              <textarea
                required
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={4000}
                placeholder={c("reviewsBody")}
                rows={4}
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--muted)] outline-none focus:border-white/30 resize-none"
              />
              {error && <p className="text-[11px] text-rose-400">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="fm-active px-8 py-3 rounded-full text-[10px] tracking-[0.3em] font-bold uppercase hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
                {c("reviewsSubmit")}
              </button>
              <p {...regionProps("reviewsGuidance")} className="text-[9px] tracking-widest text-white/30 uppercase">
                {c("reviewsModerated")}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
