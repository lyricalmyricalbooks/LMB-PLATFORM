import { useState } from "react";
import { catalogPublishIssues } from "./catalogPublishReview";
import { Dialog, Checkbox, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";

/**
 * Books › Publish / Move to draft (and the editor's publish check): one row per book with what needs a look,
 * then an explicit "I reviewed" tick before the change is applied.
 */
export function CatalogReviewDialog({ books, action, onClose, onConfirm }: { books: any[]; action: "publish" | "draft"; onClose: () => void; onConfirm: (books: any[]) => Promise<void> }) {
  const [selected, setSelected] = useState(() => books.filter(book => action === "draft" || !catalogPublishIssues(book).some(issue => issue.blocking)).map(book => book.id));
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = books.filter(book => selected.includes(book.id));
  const verb = action === "publish" ? "Publish" : "Move to draft";
  return <Dialog open size="lg" onClose={() => { if (!busy) onClose(); }}
    title={action === "publish" ? "Review before publishing" : "Review before moving to draft"}
    description={action === "draft"
      ? "These books will leave the shop, its recommendations and the sitemap. Their words, photos, stock and order history are kept."
      : "Books marked “Fix before publishing” can't go live yet: close this, fix the title or price, then publish again. Other notes are worth a look but don't stop publishing."}
    footer={<><SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton><PrimaryButton busy={busy} disabled={!reviewed || !chosen.length} onClick={async () => { setBusy(true); try { await onConfirm(chosen); } finally { setBusy(false); } }}>{busy ? "Applying…" : `${verb} ${chosen.length} book${chosen.length === 1 ? "" : "s"}`}</PrimaryButton></>}>
    <div className="rp-stack">
      <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--rp-divider)" }} aria-label="Books to review">
        {books.map(book => {
          const issues = catalogPublishIssues(book);
          const blocked = action === "publish" && issues.some(issue => issue.blocking);
          return <li key={book.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rp-divider)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Checkbox label={book.title || "Untitled book"} disabled={busy || blocked} checked={selected.includes(book.id)} onChange={() => { setReviewed(false); setSelected(previous => previous.includes(book.id) ? previous.filter(id => id !== book.id) : [...previous, book.id]); }} />
              <StatusBadge tone={blocked ? "danger" : issues.length ? "warning" : "success"}>{blocked ? "Fix before publishing" : issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to check` : "Ready"}</StatusBadge>
            </div>
            {issues.length > 0 && <ul className="rp-hint" style={{ margin: "6px 0 0", paddingLeft: 30 }}>{issues.map(issue => <li key={issue.key}>{issue.message}</li>)}</ul>}
          </li>;
        })}
      </ul>
      <Checkbox label={action === "publish" ? "I've checked these books and want the ticked ones to go live." : "I've checked this list and want the ticked books moved to draft."} checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />
    </div>
  </Dialog>;
}
