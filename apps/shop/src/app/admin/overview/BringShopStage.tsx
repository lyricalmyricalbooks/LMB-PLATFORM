import { useState } from "react";
import { BookImportDialog } from "../BookImportDialog";
import { BRING_ANSWERS, bringHelp, bringMarker, type BringAnswer, type BringMarker } from "../bringShop";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { useShopWords } from "../shopWords";
import { keptFileLine, type KeptFile } from "../setupHandover";
import { useKeptFile } from "./KeptFileCard";

/**
 * Get started, step 2 (plan 17.3): "Where do you sell now?", the plain steps for that answer (17.4), then the Books
 * importer, which previews every row before it saves. The step ends when the press continues after an import, or
 * starts fresh (recorded as skipped). `books` is null while the catalog loads, so an import can't mistake a book for a new one.
 * `kept` is the product file the press kept while setting up (code plan 18.9): offered first, it opens in the same importer.
 */
export function BringShopStage({ books, onDone, kept = null }: { books: any[] | null; onDone: (bring: BringMarker) => Promise<void>; kept?: KeptFile | null }) {
  const w = useShopWords();
  const [answer, setAnswer] = useState<BringAnswer | "">("");
  const [importing, setImporting] = useState(false);
  const keptFile = useKeptFile(kept);
  const [imported, setImported] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finish = async (skipped: boolean) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await onDone(bringMarker(new Date().toISOString(), answer, skipped));
    } catch (e) {
      setError(friendlyError(e, "your shop"));
      setBusy(false);
    }
  };

  const opening = keptFile.opening;
  const closeImport = () => { setImporting(false); keptFile.close(); };

  if (books === null) {
    return (
      <SectionCard title="Get started · Step 2 of 8: bring your shop with you" collapsible={false}>
        <LoadingState label="Opening your shop…" />
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Get started · Step 2 of 8: bring your shop with you" description="Optional. If you already sell somewhere, bring your products across so your shop starts full. Starting fresh is fine too." collapsible={false}>
        {kept && imported === null && (
          <div data-kept-file style={{ display: "grid", gap: 10, padding: 16, marginBottom: 20, background: "var(--rp-primary-tint)", border: "var(--rp-hair, 1px) solid var(--rp-primary)" }}>
            <strong>Your file from setup is here</strong>
            <p className="rp-hint" style={{ margin: 0 }}>
              <span className="rp-mono" style={{ overflowWrap: "anywhere" }}>{keptFileLine(kept, w)}</span>. {w("Bring it in to see every book before anything is saved.")}
            </p>
            <div><PrimaryButton busy={opening} disabled={busy || opening} onClick={() => void keptFile.open()}>Bring in my file</PrimaryButton></div>
          </div>
        )}
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 8 }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Where do you sell now?</legend>
          {BRING_ANSWERS.map(a => (
            <label key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
              <input type="radio" name="bring-from" value={a.id} checked={answer === a.id} onChange={() => setAnswer(a.id)} />
              <span>{a.label}</span>
            </label>
          ))}
        </fieldset>

        {answer && (
          <ol className="rp-hint" aria-label="How to bring your products" style={{ margin: "14px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
            {bringHelp(answer).map(step => <li key={step}>{step}</li>)}
          </ol>
        )}

        {imported !== null && (
          <p role="status" className="rp-hint" style={{ margin: "14px 0 0" }}>
            {w(imported === 0 ? "No new books were added to your shop." : imported === 1 ? "1 new book came over as a draft." : `${imported} new books came over as drafts.`)} Choose Continue when you're happy with them.
          </p>
        )}
        {(error || keptFile.error) && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error || keptFile.error}</p>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {imported === null
            ? (kept
              ? <SecondaryButton disabled={busy || opening} onClick={() => setImporting(true)}>Choose a different file</SecondaryButton>
              : <PrimaryButton disabled={busy} onClick={() => setImporting(true)}>Choose my product file</PrimaryButton>)
            : <PrimaryButton disabled={busy} onClick={() => finish(false)}>{busy ? "Saving…" : "Continue"}</PrimaryButton>}
          <SecondaryButton disabled={busy} onClick={() => finish(true)}>Start fresh</SecondaryButton>
        </div>
      </SectionCard>

      {(importing || keptFile.file) && (
        <BookImportDialog
          books={books}
          initialFile={keptFile.file ?? undefined}
          onClose={closeImport}
          onDone={(createdIds) => setImported(createdIds.length)}
        />
      )}
    </>
  );
}
