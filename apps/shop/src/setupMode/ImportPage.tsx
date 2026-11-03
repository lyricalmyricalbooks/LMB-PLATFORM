// Books in setup mode (code plan 18.7): bring a product file over before the shop exists. The file is read and
// previewed here in the browser with the shop's own importer (shopMove.ts `planShopMove`, with no books yet, so every
// row is new), then kept on the platform for the shop maker (18.9) to bring in when the shop opens. Nothing is written
// to a shop: there isn't one yet.
import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { EmptyState, GhostButton, PageHeader, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../app/admin/riso/components";
import { ImportPreviewRows, MAX_FILE_BYTES } from "../app/admin/importPreview";
import { planShopMove, SHAPE_WORDS, type MovePlan } from "../app/admin/shopMove";
import { sellsBooks } from "../app/admin/sells";
import { useShopWords } from "../app/admin/shopWords";
import type { SetupDoor, SetupPress } from "./door";

const TOO_BIG = "That file is larger than 5 MB. Split it into smaller files: bring one now and the rest once your shop is open.";
const UNREADABLE = "This file couldn't be read. Save it from your spreadsheet as CSV (comma separated) and try again.";

/** The day a file was kept, in the press's own words ("3 November 2026"). */
const dayOf = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export function ImportPage({ press, door, onSaved }: { press: SetupPress; door: Pick<SetupDoor, "keepImport" | "removeImport">; onSaved: (press: SetupPress) => void }) {
  const w = useShopWords();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MovePlan | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState<"" | "keep" | "remove">("");
  const [error, setError] = useState("");

  const kept = press.stagedImport;
  const plan = preview?.plan;
  const ready = plan && !plan.problems.length ? plan.counts.create : 0;

  async function choose(next: File | undefined) {
    if (!next) return;
    setError(""); setPreview(null); setFile(next);
    if (next.size > MAX_FILE_BYTES) { setError(TOO_BIG); return; }
    try {
      // No books yet, so every row is new; a shop that doesn't sell books keeps the old shop's sizes and colours.
      setPreview(planShopMove(await next.text(), [], [], {}, { keepOptions: !sellsBooks(press.sells || null) }));
    } catch {
      setError(UNREADABLE);
    }
  }

  async function keep() {
    if (!file || !ready || busy) return;
    setBusy("keep"); setError("");
    try {
      onSaved(await door.keepImport(press.pressId, file, { name: file.name, rows: ready }));
      setFile(null); setPreview(null); setReplacing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("remove"); setError("");
    try {
      onSaved(await door.removeImport(press.pressId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  }

  const pick = () => fileRef.current?.click();
  const cancel = () => { setFile(null); setPreview(null); setReplacing(false); setError(""); };
  const errorLine = error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>;

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Product file"
        onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      <PageHeader title={w("Books")} description={w("Bring your books over from your old shop or a spreadsheet. They come in when your shop opens, as drafts for you to check.")} />

      {kept && !replacing && !file && (
        <SectionCard title="Kept for your shop" collapsible={false}
          actions={<GhostButton size="sm" icon={<Trash2 size={14} aria-hidden />} busy={busy === "remove"} disabled={!!busy} onClick={() => void remove()}>Remove</GhostButton>}>
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>
              <strong style={{ overflowWrap: "anywhere" }}>{kept.name}</strong>
              <span className="rp-hint" style={{ display: "block" }}>{w(`${kept.rows} ${kept.rows === 1 ? "book" : "books"}`)}{dayOf(kept.at) ? `, kept ${dayOf(kept.at)}` : ""}</span>
            </p>
            {errorLine}
            <div><SecondaryButton disabled={!!busy} onClick={() => { setReplacing(true); setError(""); }}>Choose another file</SecondaryButton></div>
          </div>
        </SectionCard>
      )}

      {(!kept || replacing || file) && !preview && (
        <SectionCard title="Bring a file" collapsible={false}>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <EmptyState icon={<FileUp size={28} aria-hidden />} title={w("Your books, in one file")}
              description={w("In your old shop, export your products as a CSV file. Or save your spreadsheet of books as CSV. You'll see your books before anything is kept.")}
              action={<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                <PrimaryButton icon={<FileUp size={16} aria-hidden />} disabled={!!busy} onClick={pick}>Choose a file</PrimaryButton>
                {kept && <SecondaryButton disabled={!!busy} onClick={cancel}>Keep {kept.name}</SecondaryButton>}
              </div>} />
            {errorLine}
          </div>
        </SectionCard>
      )}

      {plan && file && (
        <SectionCard title={file.name} description={preview?.moved ? `Read as ${SHAPE_WORDS[preview.moved.shape]}.` : undefined} collapsible={false}>
          <div style={{ display: "grid", gap: 12 }}>
            {plan.problems.length ? (
              <div role="alert" style={{ display: "grid", gap: 8 }}>
                <StatusBadge tone="danger">Nothing can be brought in from this file</StatusBadge>
                <ul className="rp-hint" style={{ margin: 0, paddingLeft: 18 }}>{plan.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} aria-live="polite">
                  <StatusBadge tone="info">{w(`${plan.counts.create} ${plan.counts.create === 1 ? "book" : "books"} ready`)}</StatusBadge>
                  {plan.counts.error > 0 && <StatusBadge tone="danger">{plan.counts.error} with problems (left out)</StatusBadge>}
                </div>
                {preview?.moved?.notices.map((n) => <p key={n} className="rp-hint" style={{ margin: 0 }}>{n}</p>)}
                {!preview?.moved && plan.ignoredColumns.length > 0 && <p className="rp-hint" style={{ margin: 0 }}>Columns left out: {plan.ignoredColumns.join(", ")}.</p>}
                <ImportPreviewRows plan={plan} />
              </>
            )}
            {errorLine}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <PrimaryButton busy={busy === "keep"} disabled={!ready || !!busy} onClick={() => void keep()}>
                {ready ? w(`Keep ${ready} ${ready === 1 ? "book" : "books"} for my shop`) : "Nothing to keep"}
              </PrimaryButton>
              <SecondaryButton disabled={!!busy} onClick={pick}>Choose another file</SecondaryButton>
              <GhostButton disabled={!!busy} onClick={cancel}>Cancel</GhostButton>
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
}
