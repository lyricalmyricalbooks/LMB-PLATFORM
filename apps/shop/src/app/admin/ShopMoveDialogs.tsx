import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { adminApi } from "./api";
import { emailHash } from "./Customers";
import { Checkbox, Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import {
  IMPORTED_CONSENT_TEXT, newsletterJoiners, planCustomerNotes, readCustomerExport, type CustomerMove, type CustomerWrite,
  type MovedCustomer,
} from "./shopMove";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SHOWN = 100;

type Ready = {
  move: CustomerMove;
  writes: (CustomerWrite & { id: string })[];
  joiners: MovedCustomer[];
};

/**
 * Customers › Bring customers over (plan 3.1, "Bring your shop with you"): a customer list from the press's old shop
 * becomes private notes and tags here, and, only when the owner confirms they have permission, newsletter subscribers.
 * Nothing is written before the preview; a second run of the same file changes nothing.
 */
export function CustomerMoveDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [readError, setReadError] = useState("");
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ saved: number; failed: string[]; joined: number } | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setReadError(""); setReady(null); setResult(null); setPermission(false); setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) { setReadError("That file is larger than 5 MB. Split it into smaller files and bring them over one at a time."); return; }
    try {
      const [text, notes, consent] = await Promise.all([file.text(), adminApi.listCustomerNotes(), adminApi.getMarketingConsent()]);
      const move = readCustomerExport(text);
      const byEmail = new Map(notes.map(n => [String(n.email || "").toLowerCase(), { note: n.note || "", tags: n.tags || [] }]));
      const ids = new Map(await Promise.all(move.customers.map(async c => [c.email, await emailHash(c.email)] as const)));
      const writes = planCustomerNotes(move.customers, byEmail, new Date().toISOString().slice(0, 10)).map(w => ({ ...w, id: ids.get(w.email)! }));
      const joiners = newsletterJoiners(move.customers, consent.subscribed, email => !!consent.optedOutHashes?.has(ids.get(email)!));
      setReady({ move, writes, joiners });
    } catch {
      setReadError("This file couldn't be read. Save it as CSV (comma separated) and try again.");
    }
  }

  const work = ready ? ready.writes.filter(w => w.action !== "unchanged") : [];
  const joining = permission && ready ? ready.joiners : [];

  async function run() {
    if (!ready) return;
    setBusy(true); setProgress(0);
    const failed: string[] = [];
    let saved = 0, joined = 0, done = 0;
    for (const w of work) {
      try { await adminApi.saveCustomerNote(w.id, { email: w.email, note: w.note, tags: w.tags }); saved++; }
      catch { failed.push(w.email); }
      setProgress(++done);
    }
    for (const c of joining) {
      try { if (await adminApi.addImportedSubscriber(c.email, IMPORTED_CONSENT_TEXT)) joined++; }
      catch { failed.push(`${c.email} (newsletter)`); }
      setProgress(++done);
    }
    await adminApi.recordAuditLog("customers", `Brought ${saved} customer${saved === 1 ? "" : "s"} over from the old shop${joined ? `; ${joined} joined the newsletter` : ""}`).catch(() => {});
    setResult({ saved, failed, joined });
    setBusy(false);
    onDone();
  }

  const total = work.length + joining.length;
  const footer = result
    ? <PrimaryButton onClick={onClose}>Done</PrimaryButton>
    : <>
        <SecondaryButton disabled={busy} onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={busy || !total} onClick={run}>
          {busy ? `Saving ${progress} of ${total}…` : total ? `Bring over ${work.length} customer${work.length === 1 ? "" : "s"}` : "Nothing new to bring over"}
        </PrimaryButton>
      </>;

  return (
    <Dialog open size="lg" onClose={() => { if (!busy) onClose(); }} title="Bring customers over" footer={footer}
      description="Bring your shop with you: choose the customer list your old shop exports. You'll see what comes over before anything is saved.">
      <div className="rp-stack">
        {!result && <>
          <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Each customer gets a private note with their name, town and what they spent at your old shop, plus their tags. Notes you already wrote are kept.</li>
            <li>They show in the Customers list once they order here. Bringing the same file over again changes nothing.</li>
            <li>Only customers your old shop says agreed to marketing email can join your newsletter, and only if you confirm below.</li>
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Customer list file"
              onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            <PrimaryButton icon={<Upload size={16} aria-hidden />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {fileName ? "Choose another file" : "Choose customer file"}
            </PrimaryButton>
            {fileName && <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{fileName}</span>}
          </div>
        </>}

        {readError && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)", margin: 0 }}>{readError}</p>}

        {ready && !result && (ready.move.problems.length
          ? <div role="alert" className="rp-stack">
              <StatusBadge tone="danger">Nothing can be brought over from this file</StatusBadge>
              <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>{ready.move.problems.map(p => <li key={p}>{p}</li>)}</ul>
            </div>
          : <div className="rp-stack">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
                <StatusBadge tone="info">{ready.writes.filter(w => w.action === "create").length} new</StatusBadge>
                <StatusBadge tone="primary">{ready.writes.filter(w => w.action === "update").length} to add to</StatusBadge>
                <StatusBadge tone="neutral">{ready.writes.filter(w => w.action === "unchanged").length} already here</StatusBadge>
                {ready.move.skipped.length > 0 && <StatusBadge tone="warning">{ready.move.skipped.length} skipped</StatusBadge>}
              </div>
              {ready.joiners.length > 0
                ? <Checkbox label={`I have permission to email the ${ready.joiners.length} customer${ready.joiners.length === 1 ? "" : "s"} who agreed to marketing email at my old shop. Add them to my newsletter.`}
                    checked={permission} disabled={busy} onChange={e => setPermission(e.target.checked)} />
                : <p className="rp-hint" style={{ margin: 0 }}>No one new for the newsletter: the file doesn't show anyone else who agreed to marketing email, or they are already on your list.</p>}
              {ready.move.skipped.length > 0 && (
                <ul className="rp-hint" aria-label="Skipped lines" style={{ margin: 0, paddingLeft: 18 }}>
                  {ready.move.skipped.slice(0, 20).map(s => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                  {ready.move.skipped.length > 20 && <li>…and {ready.move.skipped.length - 20} more.</li>}
                </ul>
              )}
              <ol aria-label="Customers to bring over" style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 320, overflow: "auto", borderTop: "1px solid var(--rp-border)" }}>
                {ready.move.customers.slice(0, SHOWN).map((c, i) => {
                  const w = ready.writes[i];
                  return (
                    <li key={c.email} style={{ padding: "8px 0", borderBottom: "1px solid var(--rp-border)", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <strong style={{ overflowWrap: "anywhere" }}>{c.name || c.email}</strong>
                      {c.name && <span className="rp-hint" style={{ overflowWrap: "anywhere" }}>{c.email}</span>}
                      <StatusBadge tone={w.action === "create" ? "info" : w.action === "update" ? "primary" : "neutral"}>
                        {w.action === "create" ? "New note" : w.action === "update" ? "Added to note" : "Already here"}
                      </StatusBadge>
                      {c.acceptsEmail === true && <StatusBadge tone="success">Agreed to email</StatusBadge>}
                    </li>
                  );
                })}
                {ready.move.customers.length > SHOWN && <li className="rp-hint" style={{ padding: "8px 0" }}>…and {ready.move.customers.length - SHOWN} more customers.</li>}
              </ol>
            </div>)}

        {result && <div className="rp-stack" role="status">
          <StatusBadge tone={result.failed.length ? "warning" : "success"}>
            {result.saved} customer{result.saved === 1 ? "" : "s"} brought over{result.joined ? ` · ${result.joined} joined the newsletter` : ""}{result.failed.length ? ` · ${result.failed.length} not saved` : ""}
          </StatusBadge>
          {result.failed.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Not saved: {result.failed.slice(0, 10).join(", ")}{result.failed.length > 10 ? "…" : ""}. Bring the same file over again to retry; customers already saved show as already here.</p>}
        </div>}
      </div>
    </Dialog>
  );
}
