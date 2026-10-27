import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { friendlyError } from "./settingsLayout";
import { DataTable, ErrorState, PrimaryButton, SecondaryButton, SectionCard, TextArea, TextField, useConfirm } from "./riso/components";
import { MAX_REDIRECTS, normalizePath, normalizeTarget, parseRedirectLines, redirectProblem, type Redirect } from "../features/site/redirects";

/**
 * Settings › General › URL redirects. Sends an old shop address to a new one after a book or page is renamed, so
 * bookmarks, search results and printed links don't land on "page not found". Followed in the shopper's browser, and
 * only when the old address has no page of its own (a real page is never hijacked).
 */
export function RedirectsCard() {
  const [items, setItems] = useState<Redirect[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();

  const load = async () => {
    setFailed(false);
    try { setItems(await adminApi.getRedirects()); } catch { setFailed(true); }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next: Redirect[], message: string) => {
    setBusy(true);
    try { setItems(await adminApi.saveRedirects(next)); toast.success(message); return true; }
    catch (err: any) { toast.error(friendlyError(err, "save the redirects")); return false; }
    finally { setBusy(false); }
  };

  const problem = from.trim() || to.trim() ? redirectProblem({ from, to }, items || []) : "";
  const add = async () => {
    if (!items || problem || !from.trim() || !to.trim()) return;
    if (items.length >= MAX_REDIRECTS) { toast.error(`You can keep up to ${MAX_REDIRECTS} redirects.`); return; }
    if (await persist([...items, { from: normalizePath(from), to: normalizeTarget(to) }], "Redirect saved.")) { setFrom(""); setTo(""); }
  };
  const importBulk = async () => {
    if (!items) return;
    const { added, skipped } = parseRedirectLines(bulk, items);
    if (!added.length) { toast.error(skipped.length ? `Nothing added. ${skipped[0].why}` : "Paste one redirect per line first."); return; }
    const room = MAX_REDIRECTS - items.length;
    if (added.length > room) { toast.error(`Only ${room} more redirects fit (limit ${MAX_REDIRECTS}).`); return; }
    if (await persist([...items, ...added], `${added.length} redirect${added.length === 1 ? "" : "s"} added${skipped.length ? `, ${skipped.length} line${skipped.length === 1 ? "" : "s"} skipped` : ""}.`)) {
      setBulk(skipped.map(s => s.line).join("\n"));
    }
  };
  const remove = async (r: Redirect) => {
    if (!items) return;
    const ok = await ask({ title: "Delete this redirect?", message: `${r.from} will show "page not found" again.`, confirmLabel: "Delete redirect" });
    if (ok) await persist(items.filter(x => x.from !== r.from), "Redirect deleted.");
  };

  return (
    <SectionCard title="URL redirects" description="Old links, new homes. Nothing breaks.">
      {confirmNode}
      {failed ? <ErrorState title="Couldn't load your redirects" description="Check your connection and try again." onRetry={load} />
        : !items ? <p className="rp-hint">Loading redirects…</p> : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "start" }}>
            <TextField label="Old address" placeholder="/books/old-title" value={from} onChange={e => setFrom(e.target.value)} hint="Everything after the domain." />
            <TextField label="Send visitors to" placeholder="/books/new-title or https://…" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          {problem && <p className="rp-hint" role="alert" style={{ margin: 0, color: "var(--rp-danger-text, inherit)" }}>{problem}</p>}
          <div><PrimaryButton onClick={add} disabled={busy || !!problem || !from.trim() || !to.trim()}>Add redirect</PrimaryButton></div>

          <DataTable<Redirect>
            caption="URL redirects" rows={items} rowKey={r => r.from}
            empty={<p className="rp-hint" style={{ margin: 0, padding: "12px 0" }}>No redirects yet.</p>}
            columns={[
              { key: "from", header: "Old address", lead: true, render: r => <code>{r.from}</code> },
              { key: "to", header: "Goes to", render: r => <code>{r.to}</code> },
              { key: "act", header: "", render: r => <button type="button" className="rp-wb-a" disabled={busy} onClick={() => remove(r)} aria-label={`Delete redirect from ${r.from}`}>Delete</button> },
            ]}
          />

          <details className="rp-howto">
            <summary>Add many at once</summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <TextArea label="One redirect per line: old address, new address" rows={5} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={"/books/old-title, /books/new-title\n/page/about-us, /page/about"} hint="Lines that fail stay in the box." />
              <div><SecondaryButton onClick={importBulk} disabled={busy || !bulk.trim()}>Add these redirects</SecondaryButton></div>
            </div>
          </details>
        </div>
      )}
    </SectionCard>
  );
}
