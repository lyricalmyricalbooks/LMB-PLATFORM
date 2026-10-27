/**
 * Whether shoppers may see and buy a book now. Mirrors the server's
 * `purchaseProblem` (functions/paymentGuards.js): published (or saved before
 * statuses existed) and its release date has arrived. Drafts, archived and
 * scheduled books stay hidden everywhere outside the Studio preview.
 */
export function isLiveBook(book: { status?: string; scheduleDate?: string } | null | undefined, nowISO = new Date().toISOString()): boolean {
  if (!book) return false;
  if (book.status && book.status !== "published") return false;
  return releaseArrived(book.scheduleDate, nowISO);
}

/**
 * A plain release date ("2026-10-08", what the book editor saves) starts on that day in the
 * shop's time zone (Toronto), not at midnight UTC — which put books on sale the evening before.
 * Full timestamps compare as instants. Same rule as functions/paymentGuards.js.
 */
export function releaseArrived(scheduleDate: unknown, nowISO = new Date().toISOString()): boolean {
  if (!scheduleDate) return true;
  const value = String(scheduleDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value <= shopDate(new Date(nowISO));
  const at = Date.parse(value);
  return Number.isFinite(at) ? at <= Date.parse(nowISO) : value <= nowISO;
}

const shopDate = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
