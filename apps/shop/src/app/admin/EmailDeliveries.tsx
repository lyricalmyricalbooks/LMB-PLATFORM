import { useState } from "react";
import { GhostButton, SecondaryButton } from "./riso/components";
import { deliveryDetail, deliveryKind, deliveryStats, deliveryTime, KIND_LABEL, shownDeliveries, toDate, type DeliveryFilter, type DeliveryRow } from "./emailSenderView";

/** One email in the server's retry queue. Never its HTML. */
export type QueuedEmail = {
  id: string; to: string; subject: string; kind: string; status: "pending" | "failed";
  attempts: number; nextAttemptAt: string | null; lastError: string; createdAt: string | null;
};

const MAX_TRIES = 8;

/**
 * Settings › Email sender › Deliveries (design handoff 1c): three tiles, emails still waiting for another try, then every
 * recent email with problems first to the eye and a fix beside each one. Retry re-sends a queued email; Fix opens the
 * shopper's record so the address can be corrected.
 */
export function EmailDeliveries({ deliveries, error, more, onMore, queue, queueError, busy, onRetry, onStop, onRefresh, onOpenSetup }: {
  deliveries: DeliveryRow[] | null; error: string; more: boolean; onMore: () => void;
  queue: QueuedEmail[]; queueError: boolean; busy: string;
  onRetry: (entry: QueuedEmail) => void; onStop: (entry: QueuedEmail) => void; onRefresh: () => void; onOpenSetup: () => void;
}) {
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [search, setSearch] = useState("");
  const rows = deliveries || [];
  const stats = deliveryStats(rows);
  const shown = shownDeliveries(rows, filter, search);
  const queued = new Map(queue.map((q) => [q.id, q]));
  const openRecord = (email: string) => { window.location.hash = `customers?q=${encodeURIComponent(email)}`; };
  const filters: Array<{ id: DeliveryFilter; label: string; count?: number }> = [
    { id: "all", label: "All" },
    { id: "problems", label: "Problems", count: stats.problems },
    { id: "paused", label: "Paused", count: stats.paused },
    { id: "sent", label: "Sent" },
  ];
  const loading = deliveries === null;
  const unknown = loading || Boolean(error);

  return (
    <div className="es-stack">
      <div className="es-tiles">
        <div className="es-tile" data-tone="good"><p className="es-kicker">Sent today</p><p className="es-big">{unknown ? "–" : stats.sentToday}</p></div>
        <div className="es-tile" data-tone={stats.problems ? "problem" : undefined}><p className="es-kicker">Delivery problems</p><p className="es-big">{unknown ? "–" : stats.problems}</p></div>
        <div className="es-tile"><p className="es-kicker">Customers paused</p><p className="es-big">{unknown ? "–" : stats.paused}</p></div>
      </div>

      {queueError && queue.length === 0 && (
        <p className="es-note" data-tone="warn" role="status">
          Couldn't check for emails waiting for another try. The list below still shows every email.{" "}
          <button type="button" className="es-link" onClick={onRefresh}>Try again</button>
        </p>
      )}
      {queue.length > 0 && (
        <section className="es-card" aria-labelledby="es-queue-title" id="email-waiting">
          <div className="es-card-head">
            <h3 className="es-card-title" id="es-queue-title">Waiting for another try</h3>
            <p className="es-hint">Tried again by itself, up to {MAX_TRIES} times.</p>
          </div>
          <ul className="es-queue">
            {queue.map((q) => (
              <li key={q.id}>
                <div>
                  <p style={{ fontWeight: 600 }}>{q.to || "—"}</p>
                  <p className="es-hint">
                    {q.subject || "Email"} · {q.status === "failed" ? "Gave up" : `Try ${q.attempts} of ${MAX_TRIES}`}
                    {q.status === "pending" && q.nextAttemptAt ? ` · next try ${new Date(q.nextAttemptAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
                  </p>
                  {q.lastError && <p className="es-hint">{deliveryDetail({ id: q.id, status: "failed", error: q.lastError })}</p>}
                </div>
                <div className="es-row">
                  <SecondaryButton size="sm" className="es-outline" disabled={!!busy} onClick={() => onRetry(q)} aria-label={`Retry now: ${q.subject || "email"} to ${q.to}`}>{busy === q.id ? "Sending…" : "Retry now"}</SecondaryButton>
                  <GhostButton size="sm" disabled={!!busy} onClick={() => onStop(q)} aria-label={`Stop sending ${q.subject || "email"} to ${q.to}`}>Stop</GhostButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="es-card es-table-card" aria-label="Recent emails">
        <div className="es-tools">
          <div className="es-pills" role="group" aria-label="Show">
            {filters.map((f) => (
              <button key={f.id} type="button" className="es-pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}{f.count ? <span className="es-count">{f.count}</span> : null}
              </button>
            ))}
          </div>
          <div className="es-row" style={{ flex: "1 1 240px", justifyContent: "flex-end" }}>
            <input className="es-search" type="search" placeholder="Search by email or address" aria-label="Search by email or address" value={search} onChange={(e) => setSearch(e.target.value)} />
            <GhostButton size="sm" onClick={onRefresh}>Refresh</GhostButton>
          </div>
        </div>

        {loading ? (
          <div role="status" aria-label="Loading deliveries" style={{ display: "grid", gap: 18, padding: "18px 0" }}>
            {[70, 90, 60, 80].map((w) => <div key={w} className="es-skel" style={{ width: `${w}%` }} />)}
          </div>
        ) : error ? (
          <div className="es-empty" role="alert">
            <p className="es-empty-title">The list didn't load</p>
            <p className="es-hint">{error}</p>
            <SecondaryButton size="sm" onClick={onRefresh}>Try again</SecondaryButton>
          </div>
        ) : rows.length === 0 ? (
          <div className="es-empty">
            <p className="es-empty-title">No emails yet</p>
            <p className="es-hint">Each email your shop sends shows here. Send yourself a test to see it work.</p>
            <SecondaryButton size="sm" onClick={onOpenSetup}>Send a test</SecondaryButton>
          </div>
        ) : shown.length === 0 ? (
          <div className="es-empty">
            <p className="es-empty-title">{search ? "Nothing matches" : filter === "sent" ? "Nothing sent yet" : "All clear"}</p>
            <p className="es-hint">{search ? "Try another name or address." : filter === "paused" ? "Nobody has marked your emails as spam." : filter === "problems" ? "Every recent email went through." : ""}</p>
          </div>
        ) : (
          <table className="es-table">
            <caption className="rp-sr-only">Recent emails, newest first</caption>
            <colgroup><col style={{ width: 76 }} /><col /><col /><col style={{ width: 108 }} /><col /><col style={{ width: 92 }} /></colgroup>
            <thead><tr><th scope="col">Time</th><th scope="col">To</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Detail</th><th scope="col"><span className="rp-sr-only">Fix</span></th></tr></thead>
            <tbody>
              {shown.map((row) => {
                const kind = deliveryKind(row);
                const entry = row.outboxId ? queued.get(row.outboxId) : undefined;
                const email = String(row.to || "");
                const when = toDate(row.at);
                return (
                  <tr key={row.id}>
                    <td className="es-time" title={when ? when.toLocaleString() : undefined}>{deliveryTime(row.at)}</td>
                    <td className="es-to" title={email || undefined}>{email || "—"}</td>
                    <td className="es-what" title={row.subject || undefined}>{row.subject || "—"}</td>
                    <td className="es-st"><span className="es-status" data-kind={kind}>{KIND_LABEL[kind]}</span></td>
                    <td className="es-detail">{deliveryDetail(row)}</td>
                    <td className="es-act">
                      {entry && (kind === "problem" || kind === "waiting") && (
                        <button type="button" className="es-link" disabled={!!busy} onClick={() => onRetry(entry)} aria-label={`Retry the email to ${email}`}>{busy === entry.id ? "Sending…" : "Retry"}</button>
                      )}
                      {email && (kind === "problem" || kind === "paused") && (
                        <button type="button" className="es-link" onClick={() => openRecord(email)} aria-label={`Fix: open ${email}`}>Fix</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {more && !loading && !error && (
          <div style={{ paddingTop: 14 }}><GhostButton size="sm" onClick={onMore}>Show 50 more</GhostButton></div>
        )}
      </section>
    </div>
  );
}
