// One line under an import that offers to take it back (rules in importUndo.ts): the drafts it added are deleted and
// the details it changed go back to what they were. Asks first, saying exactly what will go and what stays.
import { useState } from "react";
import { adminApi } from "./api";
import { runPool } from "./aiWriter";
import { forgetRun, nothingToUndo, planUndo, undoWords, type ImportRun } from "./importUndo";
import { SecondaryButton, useConfirm } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { productHref } from "../lib/productHref";
import { normalizePath } from "../features/site/redirects";

const when = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-CA", { day: "numeric", month: "long" });
};

export function ImportTakeBack({ run, label, onDone }: { run: ImportRun; label?: string; onDone: () => void }) {
  const [ask, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const size = `${run.created.length} added${run.updated.length ? `, ${run.updated.length} changed` : ""}`;

  async function takeBack() {
    setBusy(true); setMessage(null);
    try {
      const books = await adminApi.getAllBooks();
      const plan = planUndo(run, books);
      if (nothingToUndo(plan)) {
        forgetRun(run.id);
        setMessage({ text: ["There is nothing left to take back.", ...plan.kept].join(" ") });
        return;
      }
      const ok = await ask({
        title: "Take this import back?",
        message: [`This deletes or puts back ${undoWords(plan)} from ${run.file || "the file"}.`, plan.remove.length ? "Drafts are deleted with any edits you made to them since." : "", ...plan.kept, "Orders and customers are not touched."].filter(Boolean).join(" "),
        confirmLabel: "Take it back",
      });
      if (!ok) return;
      const byId = new Map(books.map((b: any) => [String(b.id), b]));
      const removed: string[] = [];
      let restored = 0;
      const jobs = [...plan.remove.map(r => ({ kind: "remove" as const, ...r })), ...plan.restore.map(r => ({ kind: "restore" as const, ...r }))];
      const { failed } = await runPool(jobs, 4, async (job) => {
        if (job.kind === "remove") { await adminApi.deleteBook(job.id, { quiet: true }); removed.push(job.id); }
        else { const loaded = byId.get(job.id); await adminApi.updateBook(job.id, { title: loaded?.title, ...job.patch }, loaded, { quiet: true }); restored += 1; }
      });
      // Old shop links this import added, for the drafts now gone, would lead nowhere.
      if (removed.length && run.redirects.length) {
        try {
          const gone = new Set(removed.map(id => productHref(encodeURIComponent(id))));
          const added = new Set(run.redirects.map(normalizePath));
          const items = await adminApi.getRedirects();
          const left = items.filter(r => !(added.has(normalizePath(r.from)) && gone.has(r.to)));
          if (left.length !== items.length) await adminApi.saveRedirects(left);
        } catch { /* a link that leads nowhere is removed by hand in URL redirects */ }
      }
      await adminApi.recordAuditLog("catalog", `Took back the import of ${run.file || "a file"}: ${removed.length} drafts deleted, ${restored} put back`).catch(() => {});
      if (failed) {
        setMessage({ bad: true, text: `${removed.length + restored} taken back, ${failed} not: check your connection and try again.` });
      } else {
        forgetRun(run.id);
        setMessage({ text: `Taken back: ${[removed.length ? `${removed.length} draft${removed.length === 1 ? "" : "s"} deleted` : "", restored ? `${restored} put back as ${restored === 1 ? "it was" : "they were"}` : ""].filter(Boolean).join(", ")}.` });
      }
      onDone();
    } catch (err) {
      setMessage({ bad: true, text: friendlyError(err, "take the import back") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Take the import back" style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--rp-radius-lg, 12px)", background: "var(--rp-surface-2)" }}>
      {message
        ? <p className="rp-hint" role={message.bad ? "alert" : "status"} style={{ margin: 0, color: message.bad ? "var(--rp-danger)" : undefined }}>{message.text}</p>
        : <p className="rp-hint" style={{ margin: 0 }}>{label || <>Last import: <strong style={{ overflowWrap: "anywhere" }}>{run.file || "a file"}</strong>, {when(run.at)} ({size}).</>}</p>}
      {(!message || message.bad) && <SecondaryButton size="sm" busy={busy} onClick={() => void takeBack()}>Take this import back</SecondaryButton>}
      {confirmNode}
    </div>
  );
}
