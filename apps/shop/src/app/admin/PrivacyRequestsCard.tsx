import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { friendlyError } from "./settingsLayout";
import { DestructiveButton, EmptyState, ErrorState, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField, useConfirm } from "./riso/components";

/**
 * Settings › General › Privacy requests. Shoppers ask from the order-tracking page
 * ("copy of my data" / "delete my data"); anyone can ask, so the owner confirms the
 * person owns the address (reply from it) before exporting or erasing. Erasing keeps
 * paid orders, which are tax and accounting records; orders that were never paid lose the
 * customer's details too, and gift cards lose names, emails and messages.
 */
export function PrivacyRequestsCard() {
  const [requests, setRequests] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  // What happens to the person's published review text when their data is deleted.
  const [reviewAction, setReviewAction] = useState<"anonymize" | "unpublish" | "remove-text">("anonymize");
  const [ask, confirmNode] = useConfirm();

  const load = async () => {
    setFailed(false);
    try { setRequests(await adminApi.listPrivacyRequests()); } catch { setFailed(true); }
  };
  useEffect(() => { load(); }, []);

  const exportData = async (address: string, requestId?: string) => {
    setBusy(`export:${address}`);
    try {
      const data = await adminApi.privacyAction("privacyExport", address, requestId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-data-${address.replace(/[^a-z0-9]+/gi, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data file downloaded. Send it to the customer from your email.");
      await load();
    } catch (err: any) {
      toast.error(friendlyError(err, "download their data"));
    } finally { setBusy(""); }
  };

  const eraseData = async (address: string, requestId?: string) => {
    const ok = await ask({
      title: `Delete ${address}'s data?`,
      message: `This deletes their newsletter signup, back-in-stock alerts, saved carts, contact messages, email delivery log, review email and customer account, and removes their name from reviews${reviewAction === "unpublish" ? " (and unpublishes the reviews)" : reviewAction === "remove-text" ? " (and blanks the review title and text)" : " (the review text stays as it is)"}. Gift cards they bought or received lose their names, emails and messages but keep their balance. Orders that were never paid lose the customer's details; paid orders are kept as tax records with private notes blanked. This can't be undone.`,
      confirmLabel: "Delete their data",
    });
    if (!ok) return;
    setBusy(`erase:${address}`);
    try {
      const result = await adminApi.privacyAction("privacyErase", address, requestId, { reviewAction });
      const kept = result.keptOrders?.length || 0;
      const cleared = result.redactedUnpaidOrders?.length || 0;
      toast.success(`Deleted. ${kept ? `${kept} paid order${kept === 1 ? "" : "s"} kept for tax records.` : "No paid orders on file."}${cleared ? ` ${cleared} unpaid order${cleared === 1 ? "" : "s"} cleared of customer details.` : ""}${result.incompleteScan?.length ? ` Some old records may remain in: ${result.incompleteScan.join(", ")}; run it again.` : ""}`);
      await load();
    } catch (err: any) {
      toast.error(friendlyError(err, "delete their data"));
    } finally { setBusy(""); }
  };

  const closeRequest = async (r: any) => {
    const ok = await ask({
      title: "Close this request without acting?",
      message: `${r.email}'s request will move to handled requests. Nothing is exported or deleted. Only do this if you've answered them another way (for example, the address wasn't theirs).`,
      confirmLabel: "Close request",
    });
    if (!ok) return;
    setBusy(`close:${r.id}`);
    try {
      await adminApi.closePrivacyRequest(r.id);
      toast.success("Request closed.");
      await load();
    } catch (err: any) {
      toast.error(`${friendlyError(err, "close the request")} Nothing was changed.`);
    } finally { setBusy(""); }
  };

  const open = (requests || []).filter((r) => r.status === "open");
  const done = (requests || []).filter((r) => r.status !== "open").slice(0, 10);
  const row = (r: any) => (
    <li key={r.id} className="rp-row" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--rp-hairline, currentColor)" }}>
      <div style={{ minWidth: 0 }}>
        <strong>{r.email}</strong>{" "}
        <StatusBadge tone={r.status === "open" ? "warning" : "success"}>{r.status === "open" ? (r.type === "delete" ? "Wants data deleted" : "Wants a copy") : r.status}</StatusBadge>
        <p className="rp-hint" style={{ margin: "4px 0 0" }}>{new Date(r.createdAt).toLocaleString()}{r.message ? ` · “${r.message}”` : ""}</p>
      </div>
      {r.status === "open" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SecondaryButton size="sm" disabled={!!busy} onClick={() => exportData(r.email, r.id)}>Download their data</SecondaryButton>
          {r.type === "delete" && <DestructiveButton size="sm" disabled={!!busy} onClick={() => eraseData(r.email, r.id)}>Delete their data</DestructiveButton>}
          <SecondaryButton size="sm" disabled={!!busy} onClick={() => closeRequest(r)}>Close without action</SecondaryButton>
        </div>
      )}
    </li>
  );

  return (
    <SectionCard title="Privacy requests" description="Copy or erase a customer's data. Confirm by email first.">
      {failed ? <ErrorState title="Couldn't load privacy requests" onRetry={load} />
        : requests === null ? <p className="rp-hint">Loading…</p>
        : open.length === 0 ? <EmptyState title="No open requests" description="New requests also arrive by email." icon="🔒" />
        : <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{open.map(row)}</ul>}
      {done.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary>Recent handled requests</summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{done.map(row)}</ul>
        </details>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
        <div style={{ flex: "1 1 240px" }}>
          <TextField label="Look up an email address" type="email" value={email} placeholder="customer@example.com" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <SecondaryButton disabled={!email.trim() || !!busy} onClick={() => exportData(email.trim())}>Download data</SecondaryButton>
        <DestructiveButton disabled={!email.trim() || !!busy} onClick={() => eraseData(email.trim())}>Delete data</DestructiveButton>
      </div>
      <div style={{ marginTop: 12, maxWidth: 360 }}>
        <SelectField label="When deleting, their reviews" hint="Their name is always replaced with “Anonymous”." value={reviewAction} onChange={(e) => setReviewAction(e.target.value as any)}>
          <option value="anonymize">Keep the review text</option>
          <option value="unpublish">Unpublish the reviews</option>
          <option value="remove-text">Blank the title and text</option>
        </SelectField>
      </div>
      {confirmNode}
    </SectionCard>
  );
}
