// Review summary + filtering for the moderation page. Pure.
export interface ReviewStats { total: number; average: number; approvedAverage: number; lowPending: number; unanswered: number; distribution: number[] }

export function reviewStats(reviews: any[]): ReviewStats {
  const rated = reviews.filter((r) => Number(r.rating) >= 1);
  const approved = rated.filter((r) => r.status === "approved");
  const avg = (l: any[]) => (l.length ? l.reduce((s, r) => s + Number(r.rating), 0) / l.length : 0);
  const distribution = [1, 2, 3, 4, 5].map((n) => rated.filter((r) => Math.round(Number(r.rating)) === n).length);
  return {
    total: reviews.length,
    average: avg(rated),
    approvedAverage: avg(approved),
    lowPending: reviews.filter((r) => r.status === "pending" && Number(r.rating) <= 2).length,
    unanswered: reviews.filter((r) => r.status === "approved" && !r.reply?.body).length,
    distribution,
  };
}

export function filterReviews(reviews: any[], opts: { status: string; rating: string; q: string; titles: Record<string, string> }) {
  const q = opts.q.trim().toLowerCase();
  return reviews.filter((r) => {
    if (opts.status !== "all" && r.status !== opts.status) return false;
    if (opts.rating !== "all" && Math.round(Number(r.rating)) !== Number(opts.rating)) return false;
    if (!q) return true;
    return `${r.authorName || ""} ${r.email || ""} ${r.title || ""} ${r.body || ""} ${opts.titles[r.bookId] || ""}`.toLowerCase().includes(q);
  });
}

/** Result of approving/rejecting several reviews at once: which went through, which failed, what to say. */
export function moderationOutcome(ids: string[], results: PromiseSettledResult<unknown>[], status: string) {
  const done = ids.filter((_, i) => results[i]?.status === "fulfilled");
  const failed = ids.filter((_, i) => results[i]?.status !== "fulfilled");
  const plural = (n: number) => `${n} review${n === 1 ? "" : "s"}`;
  const message = !failed.length
    ? `${plural(done.length)} ${status}`
    : !done.length
      ? `Could not update ${failed.length === 1 ? "the review" : `any of the ${failed.length} reviews`}. Please try again.`
      : `${plural(done.length)} ${status}; ${failed.length} failed and ${failed.length === 1 ? "stays" : "stay"} selected — try again.`;
  return { done, failed, message };
}

/**
 * Who bought what: lower-cased customer email → book ids on their paid, non-test orders
 * (box-set parts count as the books inside). Used to mark "Verified purchase" when approving.
 */
export function purchaseIndex(orders: any[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const o of orders || []) {
    if (o?.isTest === true || o?.paymentStatus !== "paid") continue;
    const email = String(o.customer?.email || "").trim().toLowerCase();
    if (!email) continue;
    const books = index.get(email) || new Set<string>();
    for (const item of Array.isArray(o.items) ? o.items : []) {
      if (item?.id) books.add(String(item.id));
      for (const part of Array.isArray(item?.components) ? item.components : []) if (part?.id) books.add(String(part.id));
    }
    index.set(email, books);
  }
  return index;
}

export function isVerifiedPurchase(review: { email?: string; bookId?: string }, index: Map<string, Set<string>>): boolean {
  const email = String(review?.email || "").trim().toLowerCase();
  return !!email && !!review?.bookId && !!index.get(email)?.has(review.bookId);
}
